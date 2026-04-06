/**
 * Cloud Function: Process SMS Jobs
 *
 * Server-side job processor for SMS sending
 * Triggered on a schedule (every 2 minutes) to process due SMS jobs
 *
 * This complements client-side processing when app is not active
 * Uses same atomic transaction logic to prevent duplicate sends
 */

const functions = require('firebase-functions')
const admin = require('firebase-admin')

const db = admin.firestore()

// Configuration (matches client-side smsSender.js)
const MAX_ATTEMPTS = 3
const BATCH_LIMIT = 20
const RETRY_MINUTES = [5, 30, 120]

/**
 * Classify an error to determine code and category
 */
const classifyError = (errorMessage) => {
  const msg = typeof errorMessage === 'string' ? errorMessage : (errorMessage?.message || 'Unknown error')

  if (msg.includes('rate limit')) return { code: 'RATE_LIMIT', category: 'rate_limit' }
  if (msg.includes('plugin') || msg.includes('unavailable'))
    return { code: 'PLUGIN_UNAVAILABLE', category: 'terminal' }
  if (msg.includes('plugin') || msg.includes('SMS'))
    return { code: 'PLUGIN_ERROR', category: 'retryable' }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection'))
    return { code: 'NETWORK_ERROR', category: 'retryable' }
  if (msg.includes('phone') || msg.includes('invalid'))
    return { code: 'INVALID_PHONE', category: 'terminal' }

  return { code: 'UNKNOWN', category: 'retryable' }
}

/**
 * Compute next retry timestamp
 */
const computeRetryTimestamp = (attemptCount) => {
  const retryMinutes = RETRY_MINUTES[Math.min(attemptCount - 1, RETRY_MINUTES.length - 1)]
  const nextDate = new Date(Date.now() + retryMinutes * 60 * 1000)
  return admin.firestore.Timestamp.fromDate(nextDate)
}

/**
 * Fetch due pending jobs
 */
const fetchDuePendingJobs = async (maxJobs = BATCH_LIMIT) => {
  const now = admin.firestore.Timestamp.now()
  const snapshot = await db
    .collection('sms_jobs')
    .where('status', '==', 'pending')
    .where('scheduledFor', '<=', now)
    .orderBy('scheduledFor', 'asc')
    .limit(maxJobs)
    .get()

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

/**
 * Check if feature is enabled
 */
const isFeatureEnabled = async (featureName) => {
  try {
    const configSnap = await db.doc('settings/smsFeatures').get()
    if (configSnap.exists) {
      return configSnap.data()[featureName] !== false
    }
  } catch (error) {
    console.warn(`Failed to check feature flag for ${featureName}:`, error.message)
  }
  return false
}

/**
 * Check automation is enabled
 */
const isAutomationEnabled = async () => {
  try {
    const configSnap = await db.doc('settings/smsAutomation').get()
    if (configSnap.exists) {
      return configSnap.data().enabled !== false
    }
  } catch (error) {
    console.warn('Failed to check automation setting:', error.message)
  }
  return true
}

/**
 * Claim job for processing (atomic)
 */
const claimJobForProcessing = async (jobId) => {
  return db.runTransaction(async (transaction) => {
    const jobRef = db.collection('sms_jobs').doc(jobId)
    const jobSnap = await transaction.get(jobRef)

    if (!jobSnap.exists) return false
    if (jobSnap.data()?.status !== 'pending') return false

    transaction.update(jobRef, {
      status: 'processing',
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return true
  })
}

/**
 * Notify device to process job via Firestore
 * Client-side app listening to this document will pick it up
 */
const notifyDeviceForProcessing = async (jobId, deviceId) => {
  try {
    await db
      .collection('sms_processing_queue')
      .doc(jobId)
      .set(
        {
          jobId,
          deviceId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'pending',
        },
        { merge: true }
      )

    // Set a timeout to remove old entries
    // If not processed within 5 minutes, consider it failed
    return true
  } catch (error) {
    console.error(`Failed to notify device for job ${jobId}:`, error)
    return false
  }
}

/**
 * Mark job success
 */
const markJobSuccess = async (jobId) => {
  await db.collection('sms_jobs').doc(jobId).update({
    status: 'sent',
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    deliveryStatus: 'pending',
    deliveryAttempts: 0,
    errorCode: null,
    errorCategory: null,
    lastError: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
}

/**
 * Mark job failure
 */
const markJobFailure = async (job, reason, errorCode, errorCategory) => {
  const nextAttemptCount = Number(job.attemptCount || 0) + 1
  const isTerminal = errorCategory === 'terminal'
  const isMaxAttemptsReached = nextAttemptCount >= MAX_ATTEMPTS
  const shouldFail = isTerminal || isMaxAttemptsReached

  const updateData = {
    status: shouldFail ? 'failed' : 'pending',
    attemptCount: nextAttemptCount,
    lastError: reason,
    lastErrorAt: admin.firestore.FieldValue.serverTimestamp(),
    errorCode: errorCode || 'UNKNOWN',
    errorCategory: errorCategory || 'unknown',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  if (shouldFail) {
    updateData.failedAt = admin.firestore.FieldValue.serverTimestamp()
  } else {
    updateData.scheduledFor = computeRetryTimestamp(nextAttemptCount)
  }

  await db.collection('sms_jobs').doc(job.id).update(updateData)

  return nextAttemptCount
}

/**
 * Main scheduled function to process SMS jobs
 * Runs every 2 minutes
 */
exports.processSmsJobsScheduled = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async (context) => {
    console.log('SMS job processor started')

    // Check if server-side processing is enabled
    const enabled = await isFeatureEnabled('enableServerSideProcessing')
    if (!enabled) {
      console.log('Server-side SMS processing is disabled')
      return { processed: 0, sent: 0, failed: 0, retried: 0, skipped: true }
    }

    // Check if automation is enabled
    if (!(await isAutomationEnabled())) {
      console.log('SMS automation is disabled')
      return { processed: 0, sent: 0, failed: 0, retried: 0, skipped: true }
    }

    try {
      const dueJobs = await fetchDuePendingJobs()

      if (dueJobs.length === 0) {
        console.log('No due SMS jobs to process')
        return { processed: 0, sent: 0, failed: 0, retried: 0 }
      }

      console.log(`Processing ${dueJobs.length} due SMS jobs`)

      let sent = 0
      let failed = 0
      let retried = 0
      let skipped = 0

      for (const job of dueJobs) {
        try {
          // Claim job atomically
          const claimed = await claimJobForProcessing(job.id)
          if (!claimed) {
            console.log(`Job ${job.id} already being processed, skipping`)
            skipped += 1
            continue
          }

          // For server-side processing, we notify the device to send
          // In production, this could be via FCM notification or stored notification
          // For now, we'll mark as requiring device processing
          const deviceNotified = await notifyDeviceForProcessing(job.id, 'cloud-function')

          if (!deviceNotified) {
            // If notification failed, mark as error and retry
            const { code: errorCode, category: errorCategory } = classifyError('Failed to notify device')
            const nextAttemptCount = await markJobFailure(
              job,
              'Device notification failed',
              errorCode,
              errorCategory
            )

            if (nextAttemptCount >= MAX_ATTEMPTS) {
              failed += 1
            } else {
              retried += 1
            }
            continue
          }

          // Job notification sent, mark as sent but await delivery status
          // The device will update the delivery status when it actually sends
          await markJobSuccess(job.id)
          sent += 1
          console.log(`SMS queued for device processing - jobId: ${job.id}, recipient: ${job.recipientMobile}`)
        } catch (error) {
          const reason = error?.message || 'Processing failed'
          const { code: errorCode, category: errorCategory } = classifyError(error)

          console.error(
            `Job processing failed - jobId: ${job.id}, error: ${reason}, code: ${errorCode}, category: ${errorCategory}`
          )

          const nextAttemptCount = await markJobFailure(job, reason, errorCode, errorCategory)

          if (errorCategory === 'terminal' || nextAttemptCount >= MAX_ATTEMPTS) {
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

      console.log(`SMS job processing complete: ${JSON.stringify(result)}`)
      return result
    } catch (error) {
      console.error('Fatal error in SMS job processor:', error)
      throw error
    }
  })

/**
 * Cleanup function: Remove old notification entries from sms_processing_queue
 * Runs daily to clean up stale entries
 */
exports.cleanupSmsProcessingQueue = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const fiveMinutesAgoMs = Date.now() - 5 * 60 * 1000
    const fiveMinutesAgoTimestamp = admin.firestore.Timestamp.fromDate(
      new Date(fiveMinutesAgoMs)
    )

    try {
      const staleSnap = await db
        .collection('sms_processing_queue')
        .where('createdAt', '<', fiveMinutesAgoTimestamp)
        .limit(500)
        .get()

      let deleted = 0
      const batch = db.batch()

      staleSnap.docs.forEach((doc) => {
        batch.delete(doc.ref)
        deleted += 1
      })

      if (deleted > 0) {
        await batch.commit()
        console.log(`Cleaned up ${deleted} old SMS processing queue entries`)
      }

      return { cleaned: deleted }
    } catch (error) {
      console.error('Error cleaning up SMS processing queue:', error)
      throw error
    }
  })
