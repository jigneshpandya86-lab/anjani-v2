/**
 * Cloud Function: SMS Delivery Webhook Handler
 *
 * Handles delivery status callbacks from Android devices
 * Updates SMS job with delivery confirmation
 *
 * Trigger: HTTP POST /smsDelivery
 */

const functions = require('firebase-functions')
const admin = require('firebase-admin')

const db = admin.firestore()

/**
 * Update SMS job with delivery status
 *
 * Expected request body:
 * {
 *   jobId: string,
 *   status: 'delivered' | 'failed' | 'undelivered',
 *   timestamp?: number (milliseconds)
 * }
 */
exports.smsDeliveryWebhook = functions.https.onRequest(async (request, response) => {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId, status, timestamp } = request.body

    // Validate required fields
    if (!jobId || !status) {
      return response.status(400).json({
        error: 'Missing required fields: jobId, status',
      })
    }

    // Validate status
    const validStatuses = ['delivered', 'failed', 'undelivered']
    if (!validStatuses.includes(status)) {
      return response.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      })
    }

    // Get job reference
    const jobRef = db.collection('sms_jobs').doc(jobId)
    const jobSnap = await jobRef.get()

    if (!jobSnap.exists()) {
      return response.status(404).json({
        error: `SMS job not found: ${jobId}`,
      })
    }

    const updateData = {
      deliveryStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    // Add timestamp if provided
    if (timestamp) {
      updateData.deliveredAt = new admin.firestore.Timestamp(
        Math.floor(timestamp / 1000),
        (timestamp % 1000) * 1000000
      )
    } else if (status === 'delivered') {
      updateData.deliveredAt = admin.firestore.FieldValue.serverTimestamp()
    }

    // If failed, mark as failed
    if (status === 'failed' || status === 'undelivered') {
      updateData.deliveryFailedAt = admin.firestore.FieldValue.serverTimestamp()
    }

    // Update job document
    await jobRef.update(updateData)

    return response.status(200).json({
      success: true,
      message: 'Delivery status updated',
      jobId,
      status,
    })
  } catch (error) {
    console.error('Error updating delivery status:', error)
    return response.status(500).json({
      error: 'Failed to update delivery status',
      message: error.message,
    })
  }
})

/**
 * Scheduled function to check for stale delivery statuses
 * If SMS marked as 'sent' but no delivery status received after X hours,
 * consider it failed
 */
exports.processStaleSmsJobs = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async (context) => {
    const sixHoursAgoMs = Date.now() - 6 * 60 * 60 * 1000
    const sixHoursAgoTimestamp = new admin.firestore.Timestamp(
      Math.floor(sixHoursAgoMs / 1000),
      (sixHoursAgoMs % 1000) * 1000000
    )

    try {
      // Find SMS jobs sent > 6 hours ago with no delivery status
      const staleJobsSnap = await db
        .collection('sms_jobs')
        .where('status', '==', 'sent')
        .where('deliveryStatus', '==', 'pending')
        .where('sentAt', '<', sixHoursAgoTimestamp)
        .limit(100)
        .get()

      let updated = 0
      const batch = db.batch()

      staleJobsSnap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          deliveryStatus: 'undelivered',
          deliveryFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: 'No delivery status received within 6 hours',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        updated += 1
      })

      if (updated > 0) {
        await batch.commit()
        console.log(`Marked ${updated} stale SMS jobs as undelivered`)
      }

      return { processed: updated }
    } catch (error) {
      console.error('Error processing stale SMS jobs:', error)
      throw error
    }
  })
