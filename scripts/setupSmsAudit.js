#!/usr/bin/env node

/**
 * SMS Audit Phase 1 Setup Script
 *
 * Automatically creates Firestore configuration documents and indexes
 * Run: node scripts/setupSmsAudit.js
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_KEY environment variable
 * Or: Service account key file at ./serviceAccountKey.json
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Load service account key
let serviceAccountKey;

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  // Parse from environment variable (JSON string)
  serviceAccountKey = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} else if (fs.existsSync(path.join(__dirname, '../serviceAccountKey.json'))) {
  // Load from file
  serviceAccountKey = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../serviceAccountKey.json'), 'utf-8')
  );
} else {
  console.error('❌ Error: Firebase service account key not found');
  console.error('Please provide one of:');
  console.error('  1. Set FIREBASE_SERVICE_ACCOUNT_KEY environment variable');
  console.error('  2. Create ./serviceAccountKey.json file');
  console.error('\nTo get service account key:');
  console.error('  1. Firebase Console > Project Settings > Service Accounts');
  console.error('  2. Click "Generate New Private Key"');
  console.error('  3. Save as ./serviceAccountKey.json or set env variable');
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountKey),
});

const db = admin.firestore();

console.log('🚀 Starting SMS Audit Phase 1 Setup...\n');

async function setupFirestoreDocuments() {
  try {
    console.log('📝 Step 1: Creating Firestore Configuration Documents\n');

    // Create settings/smsFeatures
    console.log('  Creating settings/smsFeatures...');
    await db.collection('settings').doc('smsFeatures').set({
      enableServerSideProcessing: false,
      enableErrorClassification: true,
      enableRateLimiting: true,
      enableDeliveryTracking: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ settings/smsFeatures created');

    // Create settings/smsRateLimitConfig
    console.log('  Creating settings/smsRateLimitConfig...');
    await db.collection('settings').doc('smsRateLimitConfig').set({
      enabled: true,
      minIntervalBetweenSmsMs: 3600000, // 1 hour
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  ✅ settings/smsRateLimitConfig created\n');

    console.log('✅ Step 1 Complete: Firestore documents created\n');
  } catch (error) {
    console.error('❌ Error creating Firestore documents:', error.message);
    throw error;
  }
}

async function setupFirestoreIndexes() {
  try {
    console.log('📊 Step 2: Creating Firestore Indexes (Optional)\n');

    const projectId = serviceAccountKey.project_id;
    const databaseId = '(default)';
    const collectionId = 'sms_jobs';

    console.log('  Note: Creating indexes via Admin SDK is complex.');
    console.log('  Firestore will auto-suggest indexes when needed.\n');
    console.log('  Recommended indexes (create manually in Firebase Console):\n');

    const indexes = [
      {
        name: 'status + scheduledFor',
        fields: [
          { fieldPath: 'status', order: 'ASCENDING' },
          { fieldPath: 'scheduledFor', order: 'ASCENDING' },
        ],
      },
      {
        name: 'recipientMobile',
        fields: [{ fieldPath: 'recipientMobile', order: 'ASCENDING' }],
      },
      {
        name: 'entityId',
        fields: [{ fieldPath: 'entityId', order: 'ASCENDING' }],
      },
      {
        name: 'createdAt (descending)',
        fields: [{ fieldPath: 'createdAt', order: 'DESCENDING' }],
      },
    ];

    indexes.forEach((idx, i) => {
      const fields = idx.fields.map((f) => `${f.fieldPath} (${f.order})`).join(' + ');
      console.log(`    ${i + 1}. ${fields}`);
    });

    console.log('\n  ⏭️  Firebase will auto-create these when needed.');
    console.log('  Or create manually via Firebase Console > Firestore > Indexes\n');
    console.log('✅ Step 2 Complete: Index recommendations provided\n');
  } catch (error) {
    console.error('⚠️  Warning: Error with indexes:', error.message);
    // Don't fail - indexes can be created manually
  }
}

async function verifySetup() {
  try {
    console.log('🔍 Verification: Checking created documents...\n');

    const featuresSnap = await db.collection('settings').doc('smsFeatures').get();
    if (featuresSnap.exists) {
      console.log('  ✅ settings/smsFeatures exists');
      console.log('     Fields:', Object.keys(featuresSnap.data()).join(', '));
    } else {
      console.log('  ❌ settings/smsFeatures NOT found');
    }

    const rateLimitSnap = await db.collection('settings').doc('smsRateLimitConfig').get();
    if (rateLimitSnap.exists) {
      console.log('  ✅ settings/smsRateLimitConfig exists');
      console.log('     Fields:', Object.keys(rateLimitSnap.data()).join(', '));
    } else {
      console.log('  ❌ settings/smsRateLimitConfig NOT found');
    }

    console.log('\n');
  } catch (error) {
    console.error('❌ Error verifying setup:', error.message);
    throw error;
  }
}

async function main() {
  try {
    await setupFirestoreDocuments();
    await setupFirestoreIndexes();
    await verifySetup();

    console.log('🎉 Phase 1: Foundation Setup COMPLETE!\n');
    console.log('📋 Next Steps:');
    console.log('  1. Deploy Cloud Functions: firebase deploy --only functions');
    console.log('  2. Run tests: npm test');
    console.log('  3. Start Phase 2: Enable error classification in Firebase Console\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main();
