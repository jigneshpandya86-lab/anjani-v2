/**
 * Firebase Cloud Functions for SMS Background Sending
 * Exports all SMS-related Cloud Functions
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Export all Cloud Functions
const { smsDeliveryWebhook, processStaleSmsJobs } = require('./smsDeliveryWebhook.js');
const {
  processSmsJobsScheduled,
  cleanupSmsProcessingQueue,
} = require('./processSmsJobs.js');

// Export functions
exports.smsDeliveryWebhook = smsDeliveryWebhook;
exports.processStaleSmsJobs = processStaleSmsJobs;
exports.processSmsJobsScheduled = processSmsJobsScheduled;
exports.cleanupSmsProcessingQueue = cleanupSmsProcessingQueue;

console.log('Firebase Cloud Functions loaded successfully');
