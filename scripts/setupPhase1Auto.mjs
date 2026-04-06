#!/usr/bin/env node

/**
 * SMS Audit Phase 1 - Automated Setup
 * Uses Firestore Web SDK + browser authentication
 * Works in web environments
 */

import { initializeApp } from 'firebase/app';
import { initializeFirestore, serverTimestamp, setDoc, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// Firebase config from project
const firebaseConfig = {
  apiKey: 'AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU',
  authDomain: 'anjaniappnew.firebaseapp.com',
  projectId: 'anjaniappnew',
  storageBucket: 'anjaniappnew.firebasestorage.app',
  messagingSenderId: '892497799371',
  appId: '1:892497799371:web:5671e248e6c8f05d16934e',
};

console.log('🚀 Starting Automated Phase 1 Setup\n');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {});
const auth = getAuth(app);

/**
 * Prompt user for input (Node.js compatible)
 */
function prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.includes('\n')) {
        process.stdin.pause();
        resolve(data.trim());
      }
    });
  });
}

/**
 * Setup Phase 1
 */
async function setupPhase1() {
  try {
    console.log('📝 Step 1: Creating Firestore Documents\n');

    // Create smsFeatures document
    console.log('  Creating settings/smsFeatures...');
    await setDoc(doc(db, 'settings', 'smsFeatures'), {
      enableServerSideProcessing: false,
      enableErrorClassification: true,
      enableRateLimiting: true,
      enableDeliveryTracking: true,
      updatedAt: serverTimestamp(),
    });
    console.log('  ✅ settings/smsFeatures created');

    // Create smsRateLimitConfig document
    console.log('  Creating settings/smsRateLimitConfig...');
    await setDoc(doc(db, 'settings', 'smsRateLimitConfig'), {
      enabled: true,
      minIntervalBetweenSmsMs: 3600000, // 1 hour
      updatedAt: serverTimestamp(),
    });
    console.log('  ✅ settings/smsRateLimitConfig created\n');

    // Verify
    console.log('🔍 Verification: Checking documents...\n');

    const featuresDoc = await getDoc(doc(db, 'settings', 'smsFeatures'));
    if (featuresDoc.exists()) {
      console.log('  ✅ settings/smsFeatures verified');
      console.log('     Fields:', Object.keys(featuresDoc.data()).join(', '));
    }

    const rateLimitDoc = await getDoc(doc(db, 'settings', 'smsRateLimitConfig'));
    if (rateLimitDoc.exists()) {
      console.log('  ✅ settings/smsRateLimitConfig verified');
      console.log('     Fields:', Object.keys(rateLimitDoc.data()).join(', '));
    }

    console.log('\n🎉 Phase 1: Foundation Setup COMPLETE!\n');
    console.log('📋 Next Steps:');
    console.log('  1. Deploy Cloud Functions: firebase deploy --only functions');
    console.log('  2. Run tests: npm test');
    console.log('  3. Monitor: Check Firebase Console > Firestore\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupPhase1();
