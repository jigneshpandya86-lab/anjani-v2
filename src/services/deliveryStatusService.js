/**
 * Delivery Status Service
 * Handles SMS delivery status tracking and updates
 */

/**
 * Report SMS delivery status to Cloud Function
 * @param {Object} params
 * @param {string} params.jobId - SMS job ID
 * @param {string} params.status - Delivery status (delivered, failed, undelivered)
 * @param {Object} params.firebaseConfig - Firebase config for Cloud Function URL
 * @returns {Promise<Object>}
 */
export const reportDeliveryStatus = async ({ jobId, status, firebaseConfig }) => {
  try {
    const functionUrl = `https://${firebaseConfig.projectId}.cloudfunctions.net/smsDeliveryWebhook`

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        status,
        timestamp: Date.now(),
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to report delivery status:', error)
    // Silently fail - device will retry
    return { success: false, error: error.message }
  }
}

/**
 * Listen for SMS delivery receipts
 * This would be integrated with Android plugin to listen for delivery intents
 */
export const setupDeliveryReceiptListener = () => {
  // This is typically handled by the Android plugin
  // The plugin listens for SMS delivery intents and reports back
  // See SmsBackgroundPlugin.kt for implementation
  console.log('Delivery receipt listener setup (handled by native plugin)')
}

/**
 * Get delivery status for a job
 * @param {Object} db - Firestore database instance
 * @param {string} jobId - SMS job ID
 * @returns {Promise<Object>}
 */
export const getDeliveryStatus = async ({ db, jobId }) => {
  // This would be implemented if needed to query delivery status
  // For now, this is mainly a helper for future use
  const { getDoc, doc } = await import('firebase/firestore')

  try {
    const jobSnap = await getDoc(doc(db, 'sms_jobs', jobId))
    if (jobSnap.exists()) {
      const data = jobSnap.data()
      return {
        jobId,
        status: data.status,
        deliveryStatus: data.deliveryStatus,
        sentAt: data.sentAt,
        deliveredAt: data.deliveredAt,
        failedAt: data.failedAt,
      }
    }
  } catch (error) {
    console.error('Failed to get delivery status:', error)
  }

  return null
}
