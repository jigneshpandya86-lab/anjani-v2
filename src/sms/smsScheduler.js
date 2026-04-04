import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

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

  for (const smsJob of jobs) {
    await addDoc(collection(db, 'sms_jobs'), {
      ...smsJob,
      scheduledFor: Timestamp.fromDate(smsJob.scheduledFor),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  return { queuedCount: jobs.length, jobs }
}
