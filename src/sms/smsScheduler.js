import {
  addDoc,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

// Validates phone number format: 10-15 digits, optional + prefix
const isValidPhoneNumber = (phone) => {
  if (!phone) return false
  const cleanPhone = String(phone).replace(/\D/g, '')
  return cleanPhone.length >= 10 && cleanPhone.length <= 15
}

export const TASK_TYPES = {
  LEADS: 'leads',
  PAYMENTS: 'payments',
  ORDER_DELIVERED: 'orderDelivered',
}

export const TASK_MESSAGE_INTENT = {
  [TASK_TYPES.LEADS]: 'ask_to_buy',
  [TASK_TYPES.PAYMENTS]: 'ask_for_payment',
  [TASK_TYPES.ORDER_DELIVERED]: 'order_delivery',
}

const DAY_MS = 24 * 60 * 60 * 1000

const SCHEDULE_PLAN = [
  { key: 'atEvent', type: 'at_event', offsetDays: 0 },
  { key: 'weekly', type: 'weekly', offsetDays: 7 },
  { key: 'day15', type: 'day_15', offsetDays: 15 },
  { key: 'day30', type: 'day_30', offsetDays: 30 },
]

const toDate = (value) => {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (value?.toDate) return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const createDedupeKey = ({ taskType, entityId, scheduleType, scheduledFor }) => {
  const stamp = scheduledFor.toISOString()
  return `${taskType}:${entityId}:${scheduleType}:${stamp}`
}

const jobAlreadyExists = async (db, dedupeKey) => {
  const q = query(
    collection(db, 'sms_jobs'),
    where('dedupeKey', '==', dedupeKey)
  )
  const snap = await getDocs(q)
  return snap.size > 0
}

// Batch check for existing jobs - OPTIMIZED for cost reduction
// Instead of N queries (one per dedupeKey), uses 1 query for all keys
// Firestore 'in' operator supports up to 10 values per query, so we batch
const jobAlreadyExistBatch = async (db, dedupeKeys) => {
  if (dedupeKeys.length === 0) return new Set()

  const existingKeys = new Set()

  // Batch keys in groups of 10 (Firestore 'in' operator limit)
  for (let i = 0; i < dedupeKeys.length; i += 10) {
    const batch = dedupeKeys.slice(i, i + 10)
    const q = query(
      collection(db, 'sms_jobs'),
      where('dedupeKey', 'in', batch)
    )
    const snap = await getDocs(q)
    snap.forEach(doc => existingKeys.add(doc.data().dedupeKey))
  }

  return existingKeys
}

const pushRecurringEvery30 = ({ rows, config, startDate, horizonDays }) => {
  if (!config?.every30After) return

  let pointerDays = 60
  while (pointerDays <= horizonDays) {
    rows.push({
      scheduleType: 'every_30_after',
      scheduledFor: new Date(startDate.getTime() + pointerDays * DAY_MS),
    })
    pointerDays += 30
  }
}

export const buildSmsJobsFromConfig = ({
  taskType,
  entityId,
  recipientMobile,
  occurredAt,
  config,
  messageIntent,
  horizonDays = 180,
}) => {
  if (!taskType || !entityId) {
    throw new Error('taskType and entityId are required')
  }

  if (!isValidPhoneNumber(recipientMobile)) {
    throw new Error(`Invalid phone number: ${recipientMobile}`)
  }

  if (!config?.active) return []

  const eventDate = toDate(occurredAt)
  const enabledRows = SCHEDULE_PLAN
    .filter((plan) => Boolean(config[plan.key]))
    .map((plan) => ({
      scheduleType: plan.type,
      scheduledFor: new Date(eventDate.getTime() + plan.offsetDays * DAY_MS),
    }))

  pushRecurringEvery30({ rows: enabledRows, config, startDate: eventDate, horizonDays })

  return enabledRows.map(({ scheduleType, scheduledFor }) => ({
    taskType,
    entityId,
    recipientMobile: String(recipientMobile || '').trim(),
    messageIntent: messageIntent || TASK_MESSAGE_INTENT[taskType] || 'generic_sms',
    scheduleType,
    scheduledFor,
    dedupeKey: createDedupeKey({ taskType, entityId, scheduleType, scheduledFor }),
    status: 'pending',
    attemptCount: 0,
  }))
}

export const enqueueSmsJobsForEvent = async ({
  db,
  taskType,
  entityId,
  recipientMobile,
  occurredAt,
  messageIntent,
  settingsDocPath = 'settings/smsAutomation',
  horizonDays,
}) => {
  const [settingsCollection, settingsDocId] = settingsDocPath.split('/')
  const settingsSnap = await getDoc(doc(db, settingsCollection, settingsDocId))
  const settings = settingsSnap.exists() ? settingsSnap.data() : {}
  if (settings.enabled === false) {
    return { queuedCount: 0, jobs: [] }
  }
  const taskConfig = settings?.[taskType] || null

  const jobs = buildSmsJobsFromConfig({
    taskType,
    entityId,
    recipientMobile,
    occurredAt,
    config: taskConfig,
    messageIntent,
    horizonDays,
  })

  if (jobs.length === 0) {
    return { queuedCount: 0, jobs: [] }
  }

  // OPTIMIZED: Batch check for existing jobs instead of checking each individually
  // This reduces reads from N to ~1 (batched in groups of 10)
  const existingDedupeKeys = await jobAlreadyExistBatch(
    db,
    jobs.map(j => j.dedupeKey)
  )

  let queuedCount = 0
  for (const smsJob of jobs) {
    // Check if job already exists (from batch query results)
    if (existingDedupeKeys.has(smsJob.dedupeKey)) {
      console.log(`SMS job already exists with dedupeKey: ${smsJob.dedupeKey}`)
      continue
    }

    await addDoc(collection(db, 'sms_jobs'), {
      ...smsJob,
      scheduledFor: Timestamp.fromDate(smsJob.scheduledFor),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    queuedCount += 1
  }

  return { queuedCount, jobs }
}

export const cancelPendingSmsJobsForEntity = async ({
  db,
  taskType,
  entityId,
  reason = 'cancelled_by_business_rule',
}) => {
  if (!taskType || !entityId) {
    return { cancelledCount: 0 }
  }

  const q = query(
    collection(db, 'sms_jobs'),
    where('taskType', '==', taskType),
    where('entityId', '==', entityId),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)

  for (const row of snap.docs) {
    await updateDoc(row.ref, {
      status: 'cancelled',
      cancelReason: reason,
      updatedAt: serverTimestamp(),
    })
  }

  return { cancelledCount: snap.size }
}
