# Manual Cloud Functions Deployment Guide

This guide explains how to deploy Cloud Functions manually when needed.

## Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Service account key (you already have this)

## Quick Deploy (5 minutes)

### Step 1: Setup Environment

Save your service account key as a file:

```bash
# Get your service account JSON from Firebase Console:
# Go to: Project Settings > Service Accounts > Generate New Private Key
# Save the downloaded JSON file as serviceAccountKey.json

# Or download it directly via command line
curl -o serviceAccountKey.json "https://[firebase-console-link]"
```

### Step 2: Set Credentials

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/serviceAccountKey.json"
```

### Step 3: Deploy

```bash
firebase deploy --only functions --project anjaniappnew --non-interactive
```

**Expected Output:**
```
✔ Deploy complete!

Functions deployed:
  ✓ smsDeliveryWebhook
  ✓ processStaleSmsJobs
  ✓ processSmsJobsScheduled
  ✓ cleanupSmsProcessingQueue
```

---

## Deploy from Codespaces (Easiest)

1. Open GitHub Codespaces for your repo
2. Run the steps above in the terminal
3. Done! Functions deployed

---

## Deploy from Web Terminal (This Session)

I can deploy for you right now if you'd like. Just say "Deploy now" and I'll run it! 🚀

---

## Troubleshooting

**"Command not found: firebase"**
```bash
npm install -g firebase-tools
```

**"Authentication failed"**
- Verify `GOOGLE_APPLICATION_CREDENTIALS` is set: `echo $GOOGLE_APPLICATION_CREDENTIALS`
- Check file exists: `cat serviceAccountKey.json`

**"Project not found"**
```bash
firebase use --add anjaniappnew
```

---

## Cloud Functions Deployed

| Function | Purpose | Trigger |
|----------|---------|---------|
| `smsDeliveryWebhook` | Handle SMS delivery status updates | HTTP POST /smsDelivery |
| `processStaleSmsJobs` | Mark old SMS as undelivered | Daily at 2 AM UTC |
| `processSmsJobsScheduled` | Process due SMS jobs | Every 2 minutes |
| `cleanupSmsProcessingQueue` | Clean up stale entries | Daily at 3 AM UTC |

---

## Current Status

- ✅ Phase 1: Foundation complete (Firestore docs created)
- ✅ Code deployed to production
- ⏳ Cloud Functions: Ready to deploy manually
- 🔒 Feature flags: All OFF (zero user impact)

Deploy when ready! 🚀
