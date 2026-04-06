/**
 * Cloud Function: SMS Delivery Webhook Handler
 *
 * HTTP endpoint for Android devices to report SMS delivery status
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * HTTP Cloud Function for SMS Delivery Status Updates
 */
exports.smsDeliveryWebhook = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId, status, timestamp } = req.body;

    // Validate required fields
    if (!jobId || !status) {
      return res.status(400).json({
        error: 'Missing required fields: jobId, status',
      });
    }

    // Validate status
    const validStatuses = ['delivered', 'failed', 'undelivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Get job reference
    const jobRef = db.collection('sms_jobs').doc(jobId);
    const jobSnap = await jobRef.get();

    if (!jobSnap.exists()) {
      return res.status(404).json({
        error: `SMS job not found: ${jobId}`,
      });
    }

    const updateData = {
      deliveryStatus: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add timestamp if provided
    if (timestamp) {
      updateData.deliveredAt = new admin.firestore.Timestamp(
        Math.floor(timestamp / 1000),
        (timestamp % 1000) * 1000000
      );
    } else if (status === 'delivered') {
      updateData.deliveredAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // If failed, mark as failed
    if (status === 'failed' || status === 'undelivered') {
      updateData.deliveryFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // Update job document
    await jobRef.update(updateData);

    return res.status(200).json({
      success: true,
      message: 'Delivery status updated',
      jobId,
      status,
    });
  } catch (error) {
    console.error('Error updating delivery status:', error);
    return res.status(500).json({
      error: 'Failed to update delivery status',
      message: error.message,
    });
  }
};

