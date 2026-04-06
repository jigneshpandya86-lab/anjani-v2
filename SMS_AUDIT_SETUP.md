# SMS Background Sending - Audit Implementation Setup Guide

This document explains how to set up and configure the SMS background sending improvements.

## Overview

This implementation adds the following features to the SMS background sending system:

1. **Error Classification** - Categorizes errors into retryable, terminal, and rate_limit
2. **Rate Limiting** - Prevents sending multiple SMS to the same recipient within a minimum interval
3. **Delivery Tracking** - Tracks delivery status (pending, delivered, failed)
4. **Server-Side Processing** - Cloud Functions to process jobs when app is not active
5. **Enhanced Monitoring** - Improved UI with error codes and delivery status visibility

## Required Firestore Configuration

### 1. Feature Flags Document

Create a new document at `settings/smsFeatures`:

```javascript
{
  enableServerSideProcessing: false,  // Set to true once tested in production
  enableErrorClassification: true,     // Can be disabled for rollback
  enableRateLimiting: true,            // Can be disabled for rollback
  enableDeliveryTracking: true,        // Can be disabled for rollback
  updatedAt: serverTimestamp()
}
```

**Steps:**
1. Go to Firebase Console > Firestore Database
2. Create collection: `settings`
3. Create document: `smsFeatures`
4. Add the above fields

### 2. Rate Limit Configuration Document

Create a new document at `settings/smsRateLimitConfig`:

```javascript
{
  enabled: true,
  minIntervalBetweenSmsMs: 3600000,  // 1 hour - adjust as needed
  updatedAt: serverTimestamp()
}
```

**Supported intervals:**
- 300000 = 5 minutes
- 1800000 = 30 minutes
- 3600000 = 1 hour (default)
- 86400000 = 1 day

### 3. Updated sms_jobs Collection Schema

The existing `sms_jobs` collection now has additional fields:

**New fields to add to existing documents:**

```javascript
{
  // Error Tracking
  errorCode: null,           // e.g., "PLUGIN_ERROR", "RATE_LIMIT", "INVALID_PHONE"
  errorCategory: null,       // e.g., "retryable", "terminal", "rate_limit"
  lastErrorAt: null,        // Timestamp of last error

  // Delivery Tracking
  deliveryStatus: 'pending', // 'pending', 'delivered', 'failed', 'undelivered'
  deliveredAt: null,        // Timestamp when SMS was delivered
  deliveryAttempts: 0,      // Number of delivery receipt checks

  // Server-side Processing
  processingStartedAt: null, // Timestamp when processing started

  // Cancellation Reason
  cancelReason: null        // e.g., "PAYMENT_RECEIVED", "USER_CANCELLED"
}
```

These fields are added automatically when new jobs are created or updated.

### 4. Firestore Indexes (Recommended)

Create the following indexes in Firestore for optimal query performance:

1. **sms_jobs collection**
   - Index 1: `status` (Ascending) + `scheduledFor` (Ascending)
   - Index 2: `recipientMobile` (Ascending)
   - Index 3: `entityId` (Ascending)
   - Index 4: `createdAt` (Descending)

**Steps:**
1. Firebase Console > Firestore Database > Indexes
2. Create Composite Index for each index above
3. Wait for index to build (usually < 5 minutes)

Alternatively, Firestore will suggest these indexes automatically when you run queries.

## Cloud Functions Setup

### 1. Deploy smsDeliveryWebhook Cloud Function

The `functions/smsDeliveryWebhook.js` contains:
- `smsDeliveryWebhook` - HTTP endpoint for delivery status updates
- `processStaleSmsJobs` - Scheduled function to mark old SMS as undelivered

**To deploy:**

```bash
cd functions
npm install
firebase deploy --only functions:smsDeliveryWebhook,functions:processStaleSmsJobs
```

### 2. Deploy processSmsJobs Cloud Function

The `functions/processSmsJobs.js` contains:
- `processSmsJobsScheduled` - Runs every 2 minutes to process due jobs
- `cleanupSmsProcessingQueue` - Daily cleanup of old entries

**To deploy:**

```bash
cd functions
firebase deploy --only functions:processSmsJobsScheduled,functions:cleanupSmsProcessingQueue
```

**Note:** Keep `enableServerSideProcessing: false` in `settings/smsFeatures` until thoroughly tested.

### 3. Firestore Security Rules

Update your `firestore.rules` to allow webhook access:

```firestore
match /sms_jobs/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}

// Allow webhook access to update delivery status
match /sms_jobs/{jobId} {
  allow update: if request.resource.data.deliveryStatus != null;
}
```

## Gradual Rollout Plan

### Phase 1: Foundation (Day 1)
- Deploy Cloud Functions (with feature flag disabled)
- Create Firestore configuration documents
- Deploy updated code

### Phase 2: Error Tracking (Day 2)
- `enableErrorClassification: true` in `settings/smsFeatures`
- Monitor error classification accuracy
- No user impact

### Phase 3: Delivery Tracking (Day 3)
- `enableDeliveryTracking: true` (already enabled by default)
- Monitor delivery status updates
- Minimal user impact

### Phase 4: Rate Limiting (Day 4)
- `enableRateLimiting: true` (already enabled by default)
- Start with 1 hour minimum interval
- Adjust based on user feedback

### Phase 5: Server-Side Processing (Day 5+)
- Enable only after extensive testing
- `enableServerSideProcessing: true` in stages:
  - 10% of jobs
  - 50% of jobs
  - 100% of jobs
- Keep client-side as fallback

## Monitoring

### SMS Jobs Monitor UI

The updated SMS Jobs Monitor shows:
- Job status (pending, processing, sent, failed, cancelled)
- Delivery status (pending, delivered, failed)
- Error code and category (if failed)
- Attempt count
- Entity ID and recipient

**Filters:**
- Status: all, pending, processing, sent, failed, cancelled
- Delivery: all, pending, delivered, failed

### Firebase Console Monitoring

Monitor Cloud Functions:
1. Firebase Console > Functions
2. Check execution logs
3. Monitor error rates
4. Check performance metrics

Monitor Firestore:
1. Firebase Console > Firestore Database
2. View `sms_jobs` collection
3. Check growth rate
4. Monitor query performance

## Troubleshooting

### High Rate Limit Violations

If many jobs are rate-limited:
1. Check `minIntervalBetweenSmsMs` in `settings/smsRateLimitConfig`
2. Increase interval if too aggressive
3. Review job scheduling to avoid clustering

### Low Delivery Status Updates

If delivery status isn't updating:
1. Check if Android plugin is sending webhooks
2. Verify Cloud Function is deployed and working
3. Check Firestore security rules allow updates
4. Review Cloud Function logs for errors

### Server-Side Processing Not Working

If Cloud Function jobs not processing:
1. Verify `enableServerSideProcessing: true` in feature flags
2. Check Cloud Function logs
3. Verify Firestore has jobs with status='pending'
4. Ensure Cloud Scheduler is running (if used)

## Rollback Procedure

All changes are feature-flagged and can be instantly disabled:

```javascript
// In Firebase Console, update settings/smsFeatures:
{
  enableServerSideProcessing: false,
  enableErrorClassification: false,
  enableRateLimiting: false,
  enableDeliveryTracking: false
}
```

No code deploy needed. Changes take effect within 5 seconds.

## Performance Considerations

- **Batch Size:** 20 jobs per processing cycle (configurable)
- **Processing Interval:** 2 minutes (configurable)
- **Max Attempts:** 3 (configurable via settings)
- **Rate Limit Default:** 1 hour (configurable)

## Testing

### Manual Testing Steps

1. **Error Classification:**
   - Manually set job status to 'processing' with invalid error
   - Verify errorCode and errorCategory are set correctly

2. **Rate Limiting:**
   - Create 2 jobs for same recipient
   - First should succeed, second should be rate-limited
   - Verify scheduledFor is adjusted

3. **Delivery Tracking:**
   - Send SMS job normally
   - Manually call webhook: `POST /smsDeliveryWebhook`
   - Body: `{ jobId: "...", status: "delivered" }`
   - Verify job updated with deliveryStatus

4. **Server-Side Processing:**
   - Enable feature flag
   - Wait for scheduled function to run
   - Verify jobs are processed

### Automated Tests

```bash
npm test  # Run existing test suite
```

New tests added for:
- Error classification
- Rate limiting
- Delivery tracking (coming in Phase 2)

## Additional Resources

- [SMS Testing Guide](./SMS_TESTING_GUIDE.md)
- [Quick SMS Test](./QUICK_SMS_TEST.md)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
