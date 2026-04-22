# Google Business Profile Functions - Deployment Checklist

## ✅ Pre-Deployment Requirements

### 1. Environment Variables Set
- [ ] `GOOGLE_BUSINESS_ACCOUNT_ID` = `7864289979565757048`
- [ ] `GOOGLE_BUSINESS_LOCATION_ID` = `223246`

**How to set them:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select `anjaniappnew` project
3. Go to **Cloud Functions**
4. Click on `generateWeeklyGoogleBusinessPost` function
5. Click **Edit** → **Runtime Settings**
6. Scroll down to **Runtime environment variables**
7. Add both variables and click **Deploy**

### 2. Dependencies Installed
- [ ] `@googleapis/mybusiness` added to `functions/package.json`

Check:
```bash
cd functions
npm install
```

### 3. Code Committed
- [ ] All changes committed to `claude/automate-business-updates-uLNVU`
- [ ] PR #310 created

## 🚀 Deployment Steps

### Step 1: Install Firebase CLI
```bash
npm install -g firebase-tools
```

Or locally:
```bash
npm install --save-dev firebase-tools
```

### Step 2: Authenticate
```bash
firebase login
```

Follow the browser prompt to sign in with your Google account.

### Step 3: Verify Firebase Project
```bash
firebase use
```

Should show: `anjaniappnew`

If not, set it:
```bash
firebase use anjaniappnew
```

### Step 4: Deploy Only Cloud Functions

**Option A: Deploy Functions Only** (Recommended for this PR)
```bash
firebase deploy --only functions
```

**Option B: Deploy Everything**
```bash
firebase deploy
```

**Option C: Deploy Specific Functions**
```bash
firebase deploy --only functions:generateWeeklyGoogleBusinessPost,functions:approveAndPostGoogleBusinessUpdate
```

### Step 5: Monitor Deployment
The terminal will show:
```
✔ functions[generateWeeklyGoogleBusinessPost(us-central1)]: Successful
✔ functions[approveAndPostGoogleBusinessUpdate(us-central1)]: Successful

✔ Deploy complete!
```

## 📊 Verify Deployment

### Check Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select `anjaniappnew` project
3. Go to **Cloud Functions**
4. You should see:
   - ✅ `generateWeeklyGoogleBusinessPost` (Scheduled)
   - ✅ `approveAndPostGoogleBusinessUpdate` (HTTPS)

### Check Cloud Logs
```bash
firebase functions:log --project=anjaniappnew
```

Or in Firebase Console:
1. Click on a function
2. Go to **Logs** tab

## 🧪 Test After Deployment

### Test 1: Manual Post Creation
1. Go to your app at `app1.anjaniwater.in`
2. Click Menu → Business Posts
3. Click "Create Post"
4. Enter test text: "Test post: Pure water delivery!"
5. Click "Create Post"
6. Verify it appears in Pending tab

### Test 2: Approve & Post
1. Click "Approve & Post" button
2. Should see success message
3. Check Google Business Profile Manager
4. Verify post appears (may take a few seconds)

### Test 3: Monitor Scheduled Function
1. Next Monday at 8 AM UTC, a post will auto-generate
2. Go to Cloud Logs to see execution
3. Should see a new pending post in the dashboard

## 🔧 Troubleshooting

### Error: "Function deployment failed"

**Check Cloud Function Logs:**
```bash
firebase functions:log --limit=50
```

**Common Issues:**
- Missing environment variables → Add them in Firebase Console
- Import errors → Check `functions/package.json` has all deps
- Code syntax errors → Run `npm run build` in functions folder

### Error: "Cloud Functions API not enabled"

**Solution:**
```bash
gcloud services enable cloudfunctions.googleapis.com --project=anjaniappnew
```

### Error: "Permission denied"

**Solution:**
```bash
firebase login
firebase use anjaniappnew
```

### Error: "functions not executing"

**Check:**
1. Environment variables are set (see step 1)
2. Service account has correct permissions
3. Check Cloud Logs for errors

## 📝 Deployment Timeline

| Step | Time | Status |
|------|------|--------|
| Install Firebase CLI | 1-2 min | ⏳ To Do |
| Authenticate | 1 min | ⏳ To Do |
| Deploy Functions | 2-3 min | ⏳ To Do |
| Verify in Console | 1 min | ⏳ To Do |
| Test Manual Post | 2-3 min | ⏳ To Do |
| Monitor Scheduled Job | 1 min | ⏳ To Do |

**Total Time: ~10-15 minutes**

## 🎯 Success Criteria

After deployment, verify:

- ✅ Both functions appear in Firebase Console
- ✅ Environment variables are set
- ✅ Manual post creation works
- ✅ Approval button posts to Google Business Profile
- ✅ Cloud Logs show successful executions
- ✅ No errors in logs

## 📚 Documentation

- [GOOGLE_BUSINESS_SETUP.md](./GOOGLE_BUSINESS_SETUP.md) - Complete setup guide
- [FIREBASE_EMULATOR_SETUP.md](./FIREBASE_EMULATOR_SETUP.md) - Local development
- [GitHub PR #310](https://github.com/jigneshpandya86-lab/anjani-v2/pull/310) - All changes

## 🆘 Need Help?

**Check logs first:**
```bash
firebase functions:log --project=anjaniappnew
```

**Common log messages:**
- `generateWeeklyGoogleBusinessPost starting...` ✅ Working
- `Error: Missing Google Business account...` ❌ Check env vars
- `Error: Failed to authenticate...` ❌ Check service account

## 🎉 After Successful Deployment

1. **Monitor**: Check logs weekly to ensure scheduled function runs
2. **Engage**: Create posts regularly via dashboard
3. **Track**: View all posts in Posted tab
4. **Optimize**: Use keywords and hashtags for better reach

---

**Ready to deploy?** Start with Step 1 above! 🚀
