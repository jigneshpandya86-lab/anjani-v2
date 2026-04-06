import {
  Timestamp,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { isNativeSmsAvailable, sendSmsNative } from './nativeSmsBridge.js'
import { writeDebugLog } from './debugLogger.js'

const MAX_ATTEMPTS = 3
const BATCH_LIMIT = 20
const RETRY_MINUTES = [5, 30, 120]
const MAX_DB_RETRIES = 3
const DB_RETRY_DELAY_MS = 100

const VALID_MESSAGE_INTENTS = {
  ask_to_buy: true,
  ask_for_payment: true,
  order_delivery: true,
}

const buildSmsText = (job) => {
  const intent = job.messageIntent

  // Validate intent is known
  if (!VALID_MESSAGE_INTENTS[intent]) {
    console.warn(`Unknown message intent: ${intent}, using fallback`)
  }

  if (intent === 'ask_to_buy') {
    return `Hi, this is a reminder from Anjani Water. We would love to fulfill your water order. Reply or call us to book.`
  }

  if (intent === 'ask_for_payment') {
    return `Friendly reminder from Anjani Water: your payment is pending. Please share payment update at the earliest.`
  }

  if (intent === 'order_delivery') {
    return `Anjani Water update: your order has been delivered. Thank you for choosing us.`
  }

  return 'Anjani Water notification.'
}

const computeRetryTimestamp = (attemptCount, now) => {
  const retryMinutes = RETRY_MINUTES[Math.min(attemptCount - 1, RETRY_MINUTES.length - 1)]
  const nextDate = new Date(now.getTime() + retryMinutes * 60 * 1000)
  return Timestamp.fromDate(nextDate)
}

// Retry helper for Firebase operations with exponential backoff
const retryDbOperation = async (operation, maxRetries = MAX_DB_RETRIES) => {
  let lastError
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        const delayMs = DB_RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

const markJobProcessing = async ({ db, jobId }) => {
  await retryDbOperation(() =>
    updateDoc(doc(db, 'sms_jobs', jobId), {
      status: 'processing',
      processingAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  )
}

const markJobSuccess = async ({ db, jobId }) => {
  await retryDbOperation(() =>
    updateDoc(doc(db, 'sms_jobs', jobId), {
      status: 'sent',
      sentAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  )
}

const markJobFailure = async ({ db, job, reason, now }) => {
  const nextAttemptCount = Number(job.attemptCount || 0) + 1
  const isMaxAttemptsReached = nextAttemptCount >= MAX_ATTEMPTS

  await retryDbOperation(() =>
    updateDoc(doc(db, 'sms_jobs', job.id), {
      status: isMaxAttemptsReached ? 'failed' : 'pending',
      attemptCount: nextAttemptCount,
      lastError: reason,
      ...(isMaxAttemptsReached && { failedAt: serverTimestamp() }),
      ...(!isMaxAttemptsReached && { scheduledFor: computeRetryTimestamp(nextAttemptCount, now) }),
      updatedAt: serverTimestamp(),
    })
  )

  return nextAttemptCount
}

const fetchDuePendingJobs = async ({ db, now, maxJobs = BATCH_LIMIT }) => {
  const dueQuery = query(
    collection(db, 'sms_jobs'),
    where('status', '==', 'pending'),
    where('scheduledFor', '<=', Timestamp.fromDate(now)),
    orderBy('scheduledFor', 'asc'),
    limit(maxJobs)
  )

  const snap = await getDocs(dueQuery)
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }))
}

const isAutomationEnabled = async (db) => {
  const settingsSnap = await getDoc(doc(db, 'settings', 'smsAutomation'))
  if (!settingsSnap.exists()) return true
  return settingsSnap.data()?.enabled !== false
}

// In-memory processing lock to prevent concurrent processing of same job
const processingJobIds = new Set()

const acquireProcessingLock = (jobId) => {
  if (processingJobIds.has(jobId)) {
    return false
  }
  processingJobIds.add(jobId)
  return true
}

const releaseProcessingLock = (jobId) => {
  processingJobIds.delete(jobId)
}

export const processDueSmsJobs = async ({ db, userId = null, now = new Date(), maxJobs = BATCH_LIMIT }) => {
  if (!isNativeSmsAvailable()) {
    if (userId) {
      await writeDebugLog(db, userId, 'processor_run', 'Native SMS not available, skipping', {
        reason: 'plugin_unavailable',
      })
    }
    return { processed: 0, sent: 0, failed: 0, retried: 0, skipped: true }
  }
  if (!(await isAutomationEnabled(db))) {
    if (userId) {
      await writeDebugLog(db, userId, 'processor_run', 'SMS automation disabled, skipping', {
        reason: 'automation_disabled',
      })
    }
    return { processed: 0, sent: 0, failed: 0, retried: 0, skipped: true }
  }

  const dueJobs = await fetchDuePendingJobs({ db, now, maxJobs })
  if (userId && dueJobs.length > 0) {
    await writeDebugLog(db, userId, 'processor_run', `Found ${dueJobs.length} due SMS jobs`, {
      jobCount: dueJobs.length,
    })
  }
  if (dueJobs.length === 0) {
    return { processed: 0, sent: 0, failed: 0, retried: 0 }
  }

  let sent = 0
  let failed = 0
  let retried = 0
  let skipped = 0

  for (const job of dueJobs) {
    try {
      // Concurrent processing safeguard: skip if already being processed
      if (!acquireProcessingLock(job.id)) {
        console.log(`Job ${job.id} is already being processed elsewhere, skipping`)
        skipped += 1
        continue
      }

      try {
        // Idempotency check: verify job is still pending (could have been processed elsewhere)
        const currentJobSnap = await getDoc(doc(db, 'sms_jobs', job.id))
        if (!currentJobSnap.exists() || currentJobSnap.data().status !== 'pending') {
          console.log(`Job ${job.id} is no longer pending, skipping (status: ${currentJobSnap.data()?.status || 'deleted'})`)
          skipped += 1
          continue
        }

          await markJobProcessing({ db, jobId: job.id })
        const sendResult = await sendSmsNative({
          to: job.recipientMobile,
          body: buildSmsText(job),
        })
        if (sendResult?.success === false) {
          throw new Error(sendResult.message || 'Native SMS send rejected')
        }
        await markJobSuccess({ db, jobId: job.id })
        sent += 1
        console.log(`SMS sent successfully - jobId: ${job.id}, recipient: ${job.recipientMobile}, entity: ${job.entityId}`)
        if (userId) {
          await writeDebugLog(db, userId, 'send_success', `SMS sent to ${job.recipientMobile}`, {
            jobId: job.id,
            recipient: job.recipientMobile,
            intent: job.messageIntent,
          })
        }
      } finally {
        releaseProcessingLock(job.id)
      }
    } catch (error) {
      const reason = error?.message || 'SMS send failed'
      const nextAttemptCount = await markJobFailure({ db, job, reason, now })
      const isMaxAttemptsReached = nextAttemptCount >= MAX_ATTEMPTS

      console.error(`SMS send failed - jobId: ${job.id}, recipient: ${job.recipientMobile}, entity: ${job.entityId}, attempt: ${nextAttemptCount}/${MAX_ATTEMPTS}, error: ${reason}`)

      if (userId) {
        await writeDebugLog(db, userId, 'send_error', `SMS send failed for ${job.recipientMobile}`, {
          jobId: job.id,
          recipient: job.recipientMobile,
          attempt: nextAttemptCount,
          maxAttempts: MAX_ATTEMPTS,
          error: reason,
          isMaxAttemptsReached,
        })
      }

      if (isMaxAttemptsReached) {
        failed += 1
      } else {
        retried += 1
      }
    }
  }

  const processed = dueJobs.length - skipped
  const result = {
    processed,
    sent,
    failed,
    retried,
    skipped,
  }

  if (dueJobs.length > 0) {
    console.log(`SMS batch processed: ${JSON.stringify(result)}`)
  }

  return result
}

export const __testables = {
  buildSmsText,
}
