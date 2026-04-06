# Phase 1: Foundation Setup - Automated Guide

This guide walks you through Phase 1 setup with an automated script.

## Prerequisites

- Firebase project initialized
- Firebase CLI installed: `npm install -g firebase-tools`
- Service account key from Firebase Console
- Node.js 18+ installed

## Quick Start (5 minutes)

### 1. Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **⚙️ Project Settings** (bottom left)
4. Click **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save as `serviceAccountKey.json` in project root

**OR** set environment variable:
```bash
export FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

### 2. Run Setup Script

```bash
# Make executable (optional)
chmod +x scripts/setupSmsAudit.js

# Run the script
node scripts/setupSmsAudit.js
```

**Expected Output:**
```
🚀 Starting SMS Audit Phase 1 Setup...

📝 Step 1: Creating Firestore Configuration Documents

  Creating settings/smsFeatures...
  ✅ settings/smsFeatures created
  Creating settings/smsRateLimitConfig...
  ✅ settings/smsRateLimitConfig created

✅ Step 1 Complete: Firestore documents created

📊 Step 2: Creating Firestore Indexes (Optional)

  Note: Creating indexes via Admin SDK is complex.
  Firestore will auto-suggest indexes when needed.

  Recommended indexes (create manually in Firebase Console):

    1. status (ASCENDING) + scheduledFor (ASCENDING)
    2. recipientMobile (ASCENDING)
    3. entityId (ASCENDING)
    4. createdAt (DESCENDING)

  ⏭️  Firebase will auto-create these when needed.
  Or create manually via Firebase Console > Firestore > Indexes

✅ Step 2 Complete: Index recommendations provided

🔍 Verification: Checking created documents...

  ✅ settings/smsFeatures exists
     Fields: enableServerSideProcessing, enableErrorClassification, enableRateLimiting, enableDeliveryTracking, updatedAt
  ✅ settings/smsRateLimitConfig exists
     Fields: enabled, minIntervalBetweenSmsMs, updatedAt

🎉 Phase 1: Foundation Setup COMPLETE!

📋 Next Steps:
  1. Deploy Cloud Functions: firebase deploy --only functions
  2. Run tests: npm test
  3. Start Phase 2: Enable error classification in Firebase Console
```

### 3. Verify in Firebase Console

Go to [Firebase Console](https://console.firebase.google.com) > Firestore Database:

- ✅ Collection `settings` exists
- ✅ Document `smsFeatures` exists with 5 fields
- ✅ Document `smsRateLimitConfig` exists with 3 fields

### 4. Deploy Cloud Functions

```bash
# Install Cloud Function dependencies
cd functions
npm install
cd ..

# Deploy
firebase deploy --only functions
```

**Expected Output:**
```
✔ Deploy complete!

Function URL (smsDeliveryWebhook): 
  https://us-central1-anjaniappnew.cloudfunctions.net/smsDeliveryWebhook

Function URL (processSmsJobsScheduled): 
  https://us-central1-anjaniappnew.cloudfunctions.net/processSmsJobsScheduled

Function URL (processStaleSmsJobs): 
  https://us-central1-anjaniappnew.cloudfunctions.net/processStaleSmsJobs

Function URL (cleanupSmsProcessingQueue): 
  https://us-central1-anjaniappnew.cloudfunctions.net/cleanupSmsProcessingQueue
```

### 5. Run Tests

```bash
npm test
```

**Expected:** All tests pass ✅

---

## Troubleshooting

### Error: "Service account key not found"

**Solution:**
1. Download service account key from Firebase Console
2. Save as `./serviceAccountKey.json` in project root
3. OR set `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable

### Error: "Permission denied"

**Solution:**
- Make sure service account has Firestore Editor role
- In Firebase Console > IAM & Admin, check your service account permissions

### Error: "Collection not found"

**Solution:**
- Firestore might have specific rules. The script creates documents automatically.
- If it still fails, manually create collection `settings` first

### Functions deployment fails

**Solution:**
```bash
# Check Firebase project
firebase projects:list

# Set correct project
firebase use your-project-id

# Try deployment again
firebase deploy --only functions
```

---

## Manual Setup (if script doesn't work)

### Create `settings/smsFeatures` manually:

1. Firebase Console > Firestore Database
2. Click **Create Collection** → `settings`
3. Click **Auto ID** (or enter `smsFeatures`)
4. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `enableServerSideProcessing` | boolean | `false` |
| `enableErrorClassification` | boolean | `true` |
| `enableRateLimiting` | boolean | `true` |
| `enableDeliveryTracking` | boolean | `true` |
| `updatedAt` | server timestamp | - |

### Create `settings/smsRateLimitConfig` manually:

1. In same `settings` collection, click **Add Document**
2. Enter `smsRateLimitConfig` as Document ID
3. Add fields:

| Field | Type | Value |
|-------|------|-------|
| `enabled` | boolean | `true` |
| `minIntervalBetweenSmsMs` | number | `3600000` |
| `updatedAt` | server timestamp | - |

---

## What Just Happened? ✨

**Code Changes:** All merged in PR #179
- ✅ Error classification system added
- ✅ Rate limiting system added
- ✅ Delivery tracking added
- ✅ Server-side processing Cloud Functions added
- ✅ Enhanced monitoring UI

**Configuration:** Just created
- ✅ Feature flags document (all disabled for safety)
- ✅ Rate limit configuration
- ✅ Cloud Functions deployed (idle)

**Current State:** SAFE FOR PRODUCTION
- ✅ All feature flags disabled
- ✅ Zero user impact
- ✅ Can be rolled back instantly

---

## Next: Phase 2 (When Ready)

Once you've verified Phase 1 is working, enable features one at a time:

```javascript
// Edit settings/smsFeatures in Firebase Console:
{
  enableErrorClassification: true,  // ← Enable first
  // others remain as-is
}
```

Then monitor logs for 24 hours before moving to Phase 3.

See [SMS_AUDIT_SETUP.md](./SMS_AUDIT_SETUP.md) for complete rollout plan.

---

## 📞 Support

- Questions? Check [SMS_AUDIT_SETUP.md](./SMS_AUDIT_SETUP.md)
- Need to troubleshoot? Check Cloud Function logs in Firebase Console
- Stuck? Review [SMS_TESTING_GUIDE.md](./SMS_TESTING_GUIDE.md)
