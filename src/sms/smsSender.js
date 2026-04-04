import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

const MAX_ATTEMPTS = 3
const BATCH_LIMIT = 20
const RETRY_MINUTES = [5, 30, 120]

const getSmsPlugin = () => {
  const plugins = window?.Capacitor?.Plugins || {}
  return plugins.SmsBackground || plugins.SMSBackground || null
}

const sendSmsWithNativePlugin = async ({ to, body }) => {
  const plugin = getSmsPlugin()
  if (!plugin?.send) {
    throw new Error('Native SMS background plugin not available')
  }

  await plugin.send({ to, body })
}

const buildSmsText = (job) => {
  if (job.messageIntent === 'ask_to_buy') {
    return `Hi, this is a reminder from Anjani Water. We would love to fulfill your water order. Reply or call us to book.`
  }

  if (job.messageIntent === 'ask_for_payment') {
    return `Friendly reminder from Anjani Water: your payment is pending. Please share payment update at the earliest.`
  }

  if (job.messageIntent === 'order_delivery') {
    return `Anjani Water update: your order has been delivered. Thank you for choosing us.`
  }

  return 'Anjani Water notification.'
}

const computeRetryTimestamp = (attemptCount, now) => {
  const retryMinutes = RETRY_MINUTES[Math.min(attemptCount - 1, RETRY_MINUTES.length - 1)]
  const nextDate = new Date(now.getTime() + retryMinutes * 60 * 1000)
  return Timestamp.fromDate(nextDate)
}

const markJobProcessing = async ({ db, jobId }) => {
  await updateDoc(doc(db, 'sms_jobs', jobId), {
    status: 'processing',
    processingAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

const markJobSuccess = async ({ db, jobId }) => {
  await updateDoc(doc(db, 'sms_jobs', jobId), {
    status: 'sent',
    sentAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

const markJobFailure = async ({ db, job, reason, now }) => {
  const nextAttemptCount = Number(job.attemptCount || 0) + 1

  if (nextAttemptCount >= MAX_ATTEMPTS) {
    await updateDoc(doc(db, 'sms_jobs', job.id), {
      status: 'failed',
      attemptCount: nextAttemptCount,
      lastError: reason,
      failedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return
  }

  await updateDoc(doc(db, 'sms_jobs', job.id), {
    status: 'pending',
    attemptCount: nextAttemptCount,
    lastError: reason,
    scheduledFor: computeRetryTimestamp(nextAttemptCount, now),
    updatedAt: serverTimestamp(),
  })
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

export const processDueSmsJobs = async ({ db, now = new Date(), maxJobs = BATCH_LIMIT }) => {
  const dueJobs = await fetchDuePendingJobs({ db, now, maxJobs })
  if (dueJobs.length === 0) {
    return { processed: 0, sent: 0, failed: 0, retried: 0 }
  }

  let sent = 0
  let failed = 0
  let retried = 0

  for (const job of dueJobs) {
    try {
      await markJobProcessing({ db, jobId: job.id })
      await sendSmsWithNativePlugin({
        to: job.recipientMobile,
        body: buildSmsText(job),
      })
      await markJobSuccess({ db, jobId: job.id })
      sent += 1
    } catch (error) {
      const reason = error?.message || 'SMS send failed'
      const nextAttemptCount = Number(job.attemptCount || 0) + 1
      await markJobFailure({ db, job, reason, now })

      if (nextAttemptCount >= MAX_ATTEMPTS) {
        failed += 1
      } else {
        retried += 1
      }
    }
  }

  return {
    processed: dueJobs.length,
    sent,
    failed,
    retried,
  }
}
