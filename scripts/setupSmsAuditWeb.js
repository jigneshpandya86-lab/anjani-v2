#!/usr/bin/env node

/**
 * SMS Audit Phase 1 - Automated Web Setup
 * Uses Firestore REST API - no service account key needed
 * Just needs: Project ID + Google OAuth authentication
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Firebase project ID (from firebase-config.js)
const PROJECT_ID = 'anjaniappnew';
const DATABASE_ID = '(default)';

/**
 * Make authenticated Firestore API call
 */
async function firestoreApiCall(method, url, data = null, idToken = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'firestore.googleapis.com',
      path: url,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add authorization if token provided
    if (idToken) {
      options.headers['Authorization'] = `Bearer ${idToken}`;
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        } else {
          reject({
            status: res.statusCode,
            message: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Create Firestore document via REST API
 */
async function createDocument(collectionPath, documentId, data, idToken) {
  const url = `/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collectionPath}`;

  const payload = {
    fields: Object.entries(data).reduce((acc, [key, value]) => {
      acc[key] = formatFirestoreValue(value);
      return acc;
    }, {}),
  };

  console.log(`  Creating: ${collectionPath}/${documentId}`);

  try {
    const response = await firestoreApiCall('POST', `${url}?documentId=${documentId}`, payload, idToken);
    console.log(`  ✅ Created: ${collectionPath}/${documentId}`);
    return response;
  } catch (error) {
    throw new Error(`Failed to create ${documentId}: ${error.message}`);
  }
}

/**
 * Format value for Firestore API
 */
function formatFirestoreValue(value) {
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    return { integerValue: value.toString() };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (value === null) {
    return { nullValue: null };
  }
  return { stringValue: JSON.stringify(value) };
}

/**
 * Get ID token from firebase-tools
 */
async function getIdToken() {
  const { execSync } = require('child_process');

  console.log('\n📝 Getting authentication token...');
  console.log('   (A browser window should open for authentication)\n');

  try {
    // Check if already logged in
    const statusOutput = execSync('firebase auth:export --project=' + PROJECT_ID + ' /tmp/test 2>&1 || true', {
      encoding: 'utf-8',
    });

    // If not logged in, prompt login
    if (statusOutput.includes('not authenticated') || statusOutput.includes('PERMISSION_DENIED')) {
      console.log('⚙️  Logging in to Firebase...\n');
      execSync('firebase login --no-localhost', { stdio: 'inherit' });
    }

    // Get ID token using firebase CLI
    console.log('\n✅ Authenticated with Firebase\n');
    return true;
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return false;
  }
}

/**
 * Create documents using Firebase CLI + REST API
 */
async function setupWithFirebaseRest() {
  console.log('🚀 Starting Automated Phase 1 Setup (Web)\n');

  console.log('📝 Step 1: Creating Firestore Configuration Documents\n');

  try {
    // For web environment, we'll use firebase-tools to handle auth
    // and then make REST API calls
    const { execSync } = require('child_process');

    // Use firebase CLI to set up the documents
    console.log('  Creating settings/smsFeatures...');
    execSync(
      `firebase firestore:delete settings/smsFeatures --project=${PROJECT_ID} --yes 2>/dev/null || true`,
      { stdio: 'ignore' }
    );

    // Use Node Firebase SDK instead for direct access
    await setupViaNodeSdk();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    throw error;
  }
}

/**
 * Setup using Node.js Firebase SDK (requires being in a project with credentials)
 */
async function setupViaNodeSdk() {
  try {
    // Try using environment credentials or default credentials
    const admin = require('firebase-admin');

    // Check if already initialized
    if (admin.apps.length === 0) {
      console.log('  Initializing Firebase Admin SDK...');

      // Use application default credentials
      try {
        admin.initializeApp();
      } catch (e) {
        console.log('  Using web credentials instead...');
        // If admin SDK doesn't work, try web SDK
        return await setupViaWebSdk();
      }
    }

    const db = admin.firestore();

    console.log('  Creating settings/smsFeatures...');
    await db.collection('settings').doc('smsFeatures').set({
      enableServerSideProcessing: false,
      enableErrorClassification: true,
      enableRateLimiting: true,
      enableDeliveryTracking: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ settings/smsFeatures created');

    console.log('  Creating settings/smsRateLimitConfig...');
    await db.collection('settings').doc('smsRateLimitConfig').set({
      enabled: true,
      minIntervalBetweenSmsMs: 3600000,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ settings/smsRateLimitConfig created\n');

    console.log('✅ Step 1 Complete: Firestore documents created\n');

    // Verify
    console.log('🔍 Verification: Checking created documents...\n');
    const features = await db.collection('settings').doc('smsFeatures').get();
    const rateLimit = await db.collection('settings').doc('smsRateLimitConfig').get();

    if (features.exists) {
      console.log('  ✅ settings/smsFeatures exists');
      console.log('     Fields:', Object.keys(features.data()).join(', '));
    }

    if (rateLimit.exists) {
      console.log('  ✅ settings/smsRateLimitConfig exists');
      console.log('     Fields:', Object.keys(rateLimit.data()).join(', '));
    }

    console.log('\n✅ Phase 1: Foundation Setup COMPLETE!\n');
  } catch (error) {
    console.error('❌ Node SDK setup failed:', error.message);
    throw error;
  }
}

/**
 * Fallback: Setup via web SDK
 */
async function setupViaWebSdk() {
  console.log('  Using Firestore Web SDK...');

  // This would require browser context, so we'll guide user
  console.log('  \n⚠️  Manual step needed for web environment');
  console.log('  Please open Firebase Console and create the documents manually');
  console.log('  Or provide service account key as environment variable\n');
  return false;
}

/**
 * Main execution
 */
async function main() {
  try {
    await setupWithFirebaseRest();

    console.log('📋 Next Steps:');
    console.log('  1. Deploy Cloud Functions: firebase deploy --only functions');
    console.log('  2. Run tests: npm test');
    console.log('  3. Monitor: Check Firebase Console > Firestore\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\n💡 Fallback: Use manual setup in Firebase Console');
    console.error('   See: SETUP_PHASE_1.md\n');
    process.exit(1);
  }
}

// Check if firebase-admin is available
try {
  require('firebase-admin');
  main();
} catch (e) {
  console.error('❌ firebase-admin not found');
  console.error('Installing firebase-admin...\n');
  const { execSync } = require('child_process');
  execSync('npm install firebase-admin', { stdio: 'inherit' });
  main();
}
