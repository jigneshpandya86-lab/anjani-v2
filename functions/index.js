/**
 * Firebase Cloud Functions for SMS Background Sending
 * Exports all SMS-related Cloud Functions
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ============================================================================
// smsDeliveryWebhook - HTTP endpoint for SMS delivery status updates
// ============================================================================
exports.smsDeliveryWebhook = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && (req.path === '/health' || req.path === '/')) {
    res.status(200).json({ status: 'ok' });
    return;
  }

  // Only allow POST requests for delivery updates
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

    console.log(`Delivery status updated - jobId: ${jobId}, status: ${status}`);

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
});

// ============================================================================
// processStaleSmsJobs - Mark old SMS as undelivered (scheduled function)
// NOTE: Disabled due to Firebase CLI parsing issue with scheduled functions
// Will be implemented in Phase 2 as separate function
// ============================================================================
// exports.processStaleSmsJobs = functions.pubsub.schedule('0 2 * * *')
//   .timeZone('UTC')
//   .onRun(async (context) => {
//     try {
//       // Mark SMS jobs as undelivered if they've been pending for more than 24 hours
//       const twentyFourHoursAgo = admin.firestore.Timestamp.fromDate(
//         new Date(Date.now() - 24 * 60 * 60 * 1000)
//       );

//       const staleSnap = await db
//         .collection('sms_jobs')
//         .where('deliveryStatus', '==', 'pending')
//         .where('sentAt', '<', twentyFourHoursAgo)
//         .limit(500)
//         .get();

//       let updated = 0;
//       const batch = db.batch();

//       staleSnap.docs.forEach((doc) => {
//         batch.update(doc.ref, {
//           deliveryStatus: 'undelivered',
//           deliveryFailedAt: admin.firestore.FieldValue.serverTimestamp(),
//           updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//         });
//         updated += 1;
//       });

//       if (updated > 0) {
//         await batch.commit();
//         console.log(`Marked ${updated} stale SMS jobs as undelivered`);
//       }

//       return { marked_undelivered: updated };
//     } catch (error) {
//       console.error('Error processing stale SMS jobs:', error);
//       throw error;
//     }
//   });

// ============================================================================
// Import and export remaining functions from processSmsJobs.js
// ============================================================================
const {
  processSmsJobsScheduled,
  cleanupSmsProcessingQueue,
} = require('./processSmsJobs.js');

exports.processSmsJobsScheduled = processSmsJobsScheduled;
exports.cleanupSmsProcessingQueue = cleanupSmsProcessingQueue;

console.log('Firebase Cloud Functions loaded successfully');
