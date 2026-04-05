# SMS Functionality Testing Guide

## 1. Unit Tests (Current Coverage)

Run existing tests:
```bash
npm test
```

**Expected Results:**
- ✅ `isNativeSmsAvailable detects plugin send function` - PASS
- ✅ `sendSmsNative normalizes object response` - PASS
- ⚠️ smsScheduler.test.js - FAIL (Firebase not available in test env, this is expected)
- ⚠️ smsSender.test.js - FAIL (Firebase not available in test env, this is expected)

---

## 2. Manual Testing in Development

### A. Test Phone Number Validation

1. Open browser console (F12)
2. Navigate to app and go to **Leads Dashboard**
3. Try adding a lead with invalid phone:
   ```
   Phone: "" (empty)
   Expected: Error thrown "Invalid phone number"
   ```
4. Try adding with too short:
   ```
   Phone: "123"
   Expected: Error thrown "Invalid phone number"
   ```
5. Try adding with valid phone:
   ```
   Phone: "9999999999" (10 digits)
   Expected: Lead created, SMS jobs queued
   ```

**Console Output:**
```
✅ Valid: SMS jobs scheduled for leads
❌ Invalid: Error message in console
```

---

### B. Test Job Deduplication

1. Add a lead with phone `9876543210`
2. Open **SMS Jobs** monitor tab
3. Count jobs created (should be 1-7 depending on config)
4. Refresh the page or trigger the same lead addition again
5. Check **SMS Jobs** - count should remain same (no duplicates added)

**Console Output:**
```
✅ "SMS job already exists with dedupeKey: ..."
```

---

### C. Test Rate Limiting

1. Go to **SMS Jobs** monitor
2. Observe the SMS processor runs every 120 seconds (2 minutes)
3. Check browser console for batch processing logs:
   ```
   SMS batch processed: {"processed": X, "sent": Y, "failed": Z, "retried": A, "skipped": B}
   ```

**Expected Behavior:**
- Max 20 jobs per batch
- Every 2 minutes (120s interval)
- Max throughput: ~600 SMS/hour

---

### D. Test Error Logging with Context

1. Create a scenario with SMS failures (e.g., invalid phone numbers)
2. Check browser console for detailed error logs:
   ```
   SMS send failed - jobId: abc123, recipient: 9876543210, entity: lead-1, attempt: 1/3, error: Invalid number
   ```

**Expected:**
- Recipient phone included
- Entity ID included
- Attempt count shown
- Error reason included

---

### E. Test Idempotency

1. Open **SMS Jobs** monitor
2. Trigger SMS processor (wait for next interval or manually)
3. Kill the browser tab/app mid-processing
4. Restart the app
5. Check **SMS Jobs** - jobs should not be duplicated

**Expected:**
- Logs show: "Job X is no longer pending, skipping"
- No duplicate job status updates

---

### F. Test Concurrent Processing Safeguard

1. Open app in two browser tabs/windows
2. Both tabs will run SMS processor every 120 seconds
3. Check console logs - should see:
   ```
   Job X is already being processed elsewhere, skipping
   ```

**Expected:**
- No duplicate SMS sends
- Graceful skipping of concurrent jobs

---

## 3. Firebase/Integration Testing

### A. Inspect SMS Jobs in Firestore

1. Open [Firebase Console](https://console.firebase.google.com)
2. Navigate to: **Firestore Database** → **sms_jobs** collection
3. Verify fields:
   - ✅ `dedupeKey` - exists and unique
   - ✅ `recipientMobile` - valid format (10-15 digits)
   - ✅ `status` - pending/processing/sent/failed/cancelled
   - ✅ `attemptCount` - numeric, 0 or higher
   - ✅ `lastError` - contains error message with context

### B. Monitor Job Progression

1. Create a new lead or order
2. Check Firestore for new `sms_jobs` documents
3. Verify status transitions:
   ```
   pending → processing → sent (or failed/cancelled)
   ```
4. Check `attemptCount` increments on failures
5. Verify `scheduledFor` timestamp resets on retry

---

## 4. Android Plugin Registration Testing

### A. Build APK

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

**Check:**
- ✅ Plugin copied to: `android/app/src/main/java/com/anjani/app/sms/SmsBackgroundPlugin.kt`
- ✅ No build errors
- ✅ APK generates successfully

### B. Test on Android Device/Emulator

1. Install APK on device
2. Grant SMS permissions when prompted
3. Create a lead/order that triggers SMS
4. Check device logs:
   ```bash
   adb logcat | grep "SmsBackground"
   ```
5. Verify SMS is sent (check device SMS app)

---

## 5. Specific Issue Verification

### ✅ Issue 1: Job Deduplication
- **Test:** Add same lead twice → Should only queue once
- **Verify in Firestore:** Same dedupeKey should not have duplicates

### ✅ Issue 2: Phone Validation
- **Test:** Empty phone → Error in console
- **Test:** Valid phone (10-15 digits) → Jobs created
- **Verify:** Invalid numbers rejected before queuing

### ✅ Issue 3: Idempotency
- **Test:** Force stop app during SMS send → No duplicate on restart
- **Verify in Logs:** "Job X is no longer pending, skipping"

### ✅ Issue 4: Attempt Count Logic
- **Test:** Trigger 3 SMS failures
- **Verify:** attemptCount goes 0 → 1 → 2 → 3 (then fails)
- **Check Firestore:** `failedAt` only set after 3rd attempt

### ✅ Issue 5: Rate Limiting
- **Test:** Create 30+ SMS jobs
- **Verify:** SMS processor batches (max 20 jobs)
- **Check Interval:** 120 seconds between batches

### ✅ Issue 6: Error Logging
- **Test:** Trigger SMS failures
- **Verify Logs:** Include recipient, entityId, attempt count, error reason

### ✅ Issue 7: Message Intent Validation
- **Test:** Create SMS with unknown intent
- **Verify Logs:** Warning about unknown intent, fallback message used

### ✅ Issue 8: Plugin Detection
- **Test:** APK builds successfully
- **Verify:** Plugin discoverable on Android device

### ✅ Issue 9: Concurrent Processing
- **Test:** Open app in 2 browser tabs
- **Verify Logs:** Concurrent jobs skipped gracefully

### ✅ Issue 10: Database Retries
- **Test:** Simulate Firebase temporarily unavailable
- **Verify Logs:** Retry attempts with backoff delays

---

## 6. End-to-End Testing Checklist

- [ ] Create new lead → SMS jobs appear in Firestore
- [ ] SMS jobs queue with valid phone numbers only
- [ ] Jobs scheduled according to SMS automation settings
- [ ] SMS processor runs every 120 seconds
- [ ] Failed jobs retry with correct attempt count
- [ ] After 3 attempts, job marked as failed
- [ ] Error logs contain full context (recipient, entityId, attempt, error)
- [ ] Duplicate leads don't create duplicate jobs
- [ ] App restart doesn't duplicate sent SMS
- [ ] Concurrent processing doesn't send duplicates
- [ ] Android APK builds with plugin registered
- [ ] SMS sends successfully on Android device

---

## 7. CI/CD Testing

The build workflow will test:
1. ✅ Linting passes
2. ✅ Web app builds
3. ✅ Android platform syncs
4. ✅ Plugin copies successfully
5. ✅ Android APK builds without errors

**View results:** GitHub Actions → android-apk.yml workflow

---

## 8. Debugging Tips

### Check Browser Console
```javascript
// See all SMS batch processing
console.log('SMS batch:', result)

// See what's being queued
console.log('Jobs queued:', queuedCount)

// See Firebase queries
// Enable Firebase debug logging:
firebase.database.enableLogging(true)
```

### Check Firestore Rules
Ensure SMS automation settings exist:
```
/settings/smsAutomation → should have enabled, leads, payments, orderDelivered configs
```

### Check Android Logs
```bash
adb logcat | grep -E "SmsBackground|SMS|Anjani"
```

### Monitor Rate Limiting
```javascript
// Should see logs every 120 seconds:
// "SMS batch processed: {...}"
```

---

## 9. Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| SMS jobs not created | Check SMS automation enabled in settings |
| Phone validation fails | Ensure phone is 10-15 digits, no special chars |
| Duplicate jobs | Check for duplicate schedules in config |
| Plugin not found | Verify APK rebuild and `cap sync android` |
| SMS not sending | Check SEND_SMS permission granted on Android |
| Rate limiting too slow | SMS processor interval is 120s (by design) |

---

## 10. Performance Testing

Monitor app performance while SMS processing:

```javascript
// In console:
performance.mark('sms-start')
// ... trigger SMS processing ...
performance.mark('sms-end')
performance.measure('sms-duration', 'sms-start', 'sms-end')
```

**Expected Metrics:**
- Job fetch: < 500ms
- Per-job send: < 2s
- Full batch (20 jobs): < 40s
- Database retries: < 5s

---

## 11. Data Cleanup

To reset SMS queue for testing:

1. Go to Firestore Console
2. Delete collection: `sms_jobs`
3. Or delete individual documents:
   ```javascript
   // In browser console (needs Firebase access):
   db.collection('sms_jobs').where('status', '==', 'pending').get().then(snap => {
     snap.forEach(doc => doc.ref.delete())
   })
   ```

---

## Questions?

Refer to the SMS audit plan in `/root/.claude/plans/peaceful-plotting-feather.md` for detailed issue descriptions.
