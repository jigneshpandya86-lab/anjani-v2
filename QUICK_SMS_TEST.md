# Quick SMS Testing Checklist

## 5-Minute Quick Test

### 1. Run Unit Tests
```bash
npm test
```
✅ Expected: Native SMS bridge tests pass

### 2. Test Phone Validation
In browser console after opening the app:
```javascript
// Try to add lead with invalid phone
// Should show error: "Invalid phone number"
```

### 3. Check SMS Jobs Monitor
- Navigate to **SMS Settings** → **SMS Jobs**
- Should see queue of SMS jobs
- Jobs should have valid phone numbers

### 4. Verify Rate Limiting
- Open browser console
- Wait 2 minutes (120 seconds)
- Should see: `SMS batch processed: {...}`
- Not faster, not slower

### 5. Check Logs for Context
Create/trigger an SMS job that fails:
- Console should show: `SMS send failed - jobId: X, recipient: 9876543210, entity: lead-1, attempt: 1/3, error: ...`
- Must include: recipient, entityId, attempt count, error reason

---

## Automated Test (CI/CD)

```bash
# Build Android APK (tests plugin registration)
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

✅ Expected: APK builds without errors, plugin copied successfully

---

## Firebase Inspection

1. Open [Firebase Console](https://console.firebase.google.com)
2. Go to **Firestore** → **sms_jobs** collection
3. Verify each job has:
   - ✅ `dedupeKey` (unique per schedule)
   - ✅ `recipientMobile` (10-15 digits)
   - ✅ `status` (pending/processing/sent/failed)
   - ✅ `attemptCount` (numeric)
   - ✅ `lastError` (if failed)

---

## Android Device Test (If Available)

1. Build and install APK
2. Grant SMS permissions
3. Create a lead/order
4. Check device SMS app - SMS should arrive
5. Check adb logs: `adb logcat | grep SmsBackground`

---

## All Fixes Verified?

- [ ] Phone validation rejects invalid numbers
- [ ] Job deduplication prevents duplicates
- [ ] SMS processor runs every 120s (rate limiting)
- [ ] Error logs include full context
- [ ] Android plugin copies successfully
- [ ] No duplicate SMS on app restart
- [ ] Message intents validated
- [ ] Concurrent processing handled safely
- [ ] Database operations retry on failure

---

## If Tests Fail

| Test | Issue | Solution |
|------|-------|----------|
| Unit tests | Firebase import error | Expected - use integration tests instead |
| Phone validation | Not rejecting invalid | Check buildSmsJobsFromConfig validation |
| Job deduplication | Duplicates appearing | Check dedupeKey uniqueness in Firestore |
| Rate limiting | SMS too frequent | Verify `processDueSmsJobs` interval is 120s |
| Error logs | Missing context | Check console.error calls in smsSender.js |
| Android build | Plugin copy failed | Check `.github/workflows/android-apk.yml` step |
| Concurrent test | Still duplicating | Verify `processingJobIds` lock set working |

---

## More Detailed Testing?

See `SMS_TESTING_GUIDE.md` for comprehensive testing instructions.
