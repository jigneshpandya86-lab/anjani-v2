import {
  collection,
  onSnapshot,
  query,
  where,
  limit,
  orderBy,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { processSmsJob } from '../sms/smsSender'

/**
 * Background SMS Job Processor
 * Listens for pending/queued SMS jobs and sends them
 * Runs automatically in the background
 */

let activeUnsubscribe = null

export const startBackgroundSmsProcessor = () => {
  console.log('Starting background SMS processor...')

  // Watch for pending SMS jobs
  const q = query(
    collection(db, 'sms_jobs'),
    where('status', '==', 'pending'),
    orderBy('scheduledFor', 'asc'),
    limit(20)
  )

  activeUnsubscribe = onSnapshot(q, async (snapshot) => {
    const jobs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

    if (jobs.length === 0) return

    console.log(`Found ${jobs.length} pending SMS jobs, processing...`)

    // Process each job sequentially to avoid rate limits
    for (const job of jobs) {
      try {
        await processSmsJob({ db, jobId: job.id })
      } catch (error) {
        console.error(`Error processing SMS job ${job.id}:`, error)
      }
    }
  })

  console.log('Background SMS processor started')
}

export const stopBackgroundSmsProcessor = () => {
  if (activeUnsubscribe) {
    activeUnsubscribe()
    console.log('Background SMS processor stopped')
  }
}
