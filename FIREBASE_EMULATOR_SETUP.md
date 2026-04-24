# Firebase Emulator Setup & Local Development Guide

## Overview
This guide helps you develop and test the Google Business Profile functions locally before deploying to Firebase.

## Prerequisites

- Node.js 16+ installed
- Firebase project already set up (anjaniappnew)
- Java Runtime Environment (JRE) 11+ (required for Emulator)

## Step 1: Install Firebase Tools

```bash
npm install -g firebase-tools
```

Or if you prefer local installation:
```bash
npm install --save-dev firebase-tools
```

## Step 2: Login to Firebase

```bash
firebase login
```

This will open a browser window to authenticate. Select your Google account and authorize.

## Step 3: Initialize Emulator

In your project root (`/home/user/anjani-v2`):

```bash
firebase init emulator
```

When prompted, select:
- **Emulators to set up**: Cloud Functions, Firestore
- **Port for Functions**: 5001 (default)
- **Port for Firestore**: 8080 (default)

This creates `firebase.json` with emulator configuration.

## Step 4: Start the Emulator

```bash
firebase emulators:start --only functions,firestore
```

You should see:
```
✔ Emulator UI loaded at http://localhost:4000
✔ Cloud Functions emulator started at http://localhost:5001
✔ Firestore emulator started at http://localhost:8080
```

Keep this terminal window open.

## Step 5: Deploy Functions to Emulator

In another terminal, deploy to the running emulator:

```bash
firebase deploy --only functions --project=anjaniappnew
```

Or use the emulator:
```bash
firebase emulators:exec "npm run build" --project=anjaniappnew
```

## Step 6: Test Functions Locally

### Option A: Using the Emulator UI

1. Open [http://localhost:4000](http://localhost:4000)
2. Go to **Cloud Functions** tab
3. You should see:
   - `generateWeeklyGoogleBusinessPost` (Scheduled)
   - `approveAndPostGoogleBusinessUpdate` (Callable)

### Option B: Using Firebase Admin SDK (Node.js)

Create a test script: `/home/user/anjani-v2/test-functions.js`

```javascript
const admin = require('firebase-admin');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Connect to emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.CLOUD_FUNCTIONS_EMULATOR = 'true';

const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'anjaniappnew'
});

const db = admin.firestore();

// Test creating a post manually
async function testCreatePost() {
  try {
    const docRef = await db.collection('googleBusinessPosts').add({
      summary: 'Test post: Pure drinking water delivered to your doorstep!',
      marketingType: 'serviceHighlight',
      keywords: ['water delivery Vadodara', 'pure drinking water'],
      hashtags: ['#PureWater', '#VadodaraWater'],
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: null,
      postedAt: null,
      postId: null,
      error: null
    });
    
    console.log('✅ Test post created:', docRef.id);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testCreatePost();
```

Run it:
```bash
node test-functions.js
```

## Step 7: View Firestore Data

1. Open [http://localhost:4000](http://localhost:4000)
2. Go to **Firestore** tab
3. You'll see the `googleBusinessPosts` collection with your test data

## Step 8: Test Callable Function

Create: `/home/user/anjani-v2/test-callable.js`

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize emulator connection
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

// Import your function
const { approveAndPostGoogleBusinessUpdate } = require('./functions/index.js');

// Mock request
const request = {
  data: {
    documentId: 'test-doc-id',
    shouldPost: true
  },
  auth: {
    uid: 'test-user-123'
  }
};

// Call function
approveAndPostGoogleBusinessUpdate(request)
  .then(result => console.log('✅ Result:', result))
  .catch(error => console.error('❌ Error:', error));
```

## Step 9: Configure Environment Variables Locally

Create `.env.local` in project root:

```
GOOGLE_BUSINESS_ACCOUNT_ID=7864289979565757048
GOOGLE_BUSINESS_LOCATION_ID=223246
GCLOUD_PROJECT=anjaniappnew
```

In Cloud Functions, load it:
```javascript
require('dotenv').config();
const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;
```

## Step 10: Debug Functions Locally

### Enable Debug Logging

In `functions/index.js`, add:

```javascript
const logger = require('firebase-functions/logger');

// In your function:
logger.info('Starting generation', { 
  accountId: process.env.GOOGLE_BUSINESS_ACCOUNT_ID,
  timestamp: new Date().toISOString()
});
```

### View Logs

```bash
firebase functions:log --project=anjaniappnew
```

Or in the Emulator UI → **Logs** tab

## Troubleshooting

### Error: "Java is not installed"
**Solution**: Install Java Runtime Environment (JRE)
```bash
# On Ubuntu/Debian
sudo apt-get install openjdk-11-jre-headless

# On macOS
brew install openjdk@11
```

### Error: "Port 5001 already in use"
**Solution**: Use a different port or kill the process
```bash
lsof -ti:5001 | xargs kill -9
firebase emulators:start --only functions,firestore
```

### Error: "Emulator UI not loading"
**Solution**: Clear emulator cache
```bash
rm -rf ~/.cache/firebase/emulators
firebase emulators:start --only functions,firestore
```

### Functions not appearing in Emulator
**Solution**: Make sure you deployed to emulator
```bash
firebase deploy --only functions --project=anjaniappnew
```

## Complete Development Workflow

```bash
# Terminal 1: Start Emulator
cd /home/user/anjani-v2
firebase emulators:start --only functions,firestore

# Terminal 2: Deploy Functions
firebase deploy --only functions --project=anjaniappnew

# Terminal 3: Run tests
node test-functions.js

# View results at http://localhost:4000
```

## Testing the Manual Post Feature

1. In Emulator UI → Firestore
2. Create a new document in `googleBusinessPosts`:
```json
{
  "summary": "Premium water bottles now 20% off! Order now at https://wa.me/919925997750",
  "marketingType": "promotion",
  "keywords": ["water bottles Vadodara", "discounted water", "bulk orders"],
  "hashtags": ["#WaterPromo", "#VadodaraDeals"],
  "status": "pending",
  "createdAt": "2026-04-22T10:00:00Z",
  "approvedAt": null,
  "postedAt": null,
  "postId": null,
  "error": null,
  "isManual": true
}
```

3. Your React app will see it in real-time via Firestore subscription
4. Click "Approve & Post" to test the callable function

## Next Steps After Local Testing

1. ✅ Test functions work locally
2. ✅ Verify Firestore schema
3. ✅ Check error handling
4. 🚀 Deploy to production:
   ```bash
   firebase deploy --only functions --project=anjaniappnew
   ```

## Resources

- [Firebase Emulator Documentation](https://firebase.google.com/docs/emulator-suite)
- [Cloud Functions Testing](https://firebase.google.com/docs/functions/local-emulator)
- [Firestore Emulator](https://firebase.google.com/docs/firestore/local-testing)
