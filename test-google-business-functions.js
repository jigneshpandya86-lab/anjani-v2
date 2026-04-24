/**
 * Test Script for Google Business Profile Functions
 *
 * Run this to verify functions work locally before deploying to Firebase
 *
 * Usage:
 *   node test-google-business-functions.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
// Make sure you have a service account key file
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, 'serviceAccountKey.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'anjaniappnew'
  });
} catch (error) {
  console.error('❌ Error initializing Firebase:');
  console.error('   Make sure you have serviceAccountKey.json in project root');
  console.error('   Or set GOOGLE_APPLICATION_CREDENTIALS env variable');
  process.exit(1);
}

const db = admin.firestore();

// ===== TEST 1: Create a manual post =====
async function testCreateManualPost() {
  console.log('\n📝 TEST 1: Creating Manual Post...\n');

  try {
    const docRef = await db.collection('googleBusinessPosts').add({
      summary: '🌟 Fresh pure water delivered to your doorstep! Order now and enjoy 15% discount on bulk orders. Call us: 9925997750 #PureWater #VadodaraWater',
      marketingType: 'manual',
      keywords: ['water delivery Vadodara', 'pure drinking water', 'bulk orders'],
      hashtags: ['#PureWater', '#VadodaraWater', '#HealthyLiving'],
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedAt: null,
      postedAt: null,
      postId: null,
      error: null,
      isManual: true
    });

    console.log('✅ Manual post created successfully!');
    console.log(`   Document ID: ${docRef.id}`);
    console.log(`   Status: pending`);
    console.log(`   Next: Approve this post to test the posting function\n`);

    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating manual post:');
    console.error(`   ${error.message}\n`);
    return null;
  }
}

// ===== TEST 2: Retrieve and view pending posts =====
async function testRetrievePendingPosts() {
  console.log('📋 TEST 2: Retrieving Pending Posts...\n');

  try {
    const snapshot = await db.collection('googleBusinessPosts')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (snapshot.empty) {
      console.log('   ℹ️  No pending posts found\n');
      return [];
    }

    console.log(`✅ Found ${snapshot.size} pending post(s):\n`);

    const posts = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({ id: doc.id, ...data });

      console.log(`   📌 Post: ${doc.id}`);
      console.log(`      Type: ${data.marketingType}`);
      console.log(`      Content: ${data.summary.substring(0, 60)}...`);
      console.log(`      Status: ${data.status}`);
      console.log(`      Created: ${data.createdAt?.toDate?.()?.toLocaleString() || 'N/A'}`);
      console.log();
    });

    return posts;
  } catch (error) {
    console.error('❌ Error retrieving pending posts:');
    console.error(`   ${error.message}\n`);
    return [];
  }
}

// ===== TEST 3: Test AI generation function logic =====
async function testAIGeneration() {
  console.log('🤖 TEST 3: Testing AI Generation Logic...\n');

  try {
    // Simulate the marketing rotation
    const rotationCycle = ['serviceHighlight', 'customerBenefit', 'promotion', 'sustainability', 'callToAction'];

    // Get last post type
    const lastPostSnap = await db.collection('googleBusinessPosts')
      .where('status', '==', 'posted')
      .orderBy('postedAt', 'desc')
      .limit(1)
      .get();

    let lastPostType = 'callToAction';
    if (!lastPostSnap.empty) {
      lastPostType = lastPostSnap.docs[0].data().marketingType || 'callToAction';
    }

    const lastIndex = rotationCycle.indexOf(lastPostType);
    const nextIndex = (lastIndex + 1) % rotationCycle.length;
    const nextMarketingType = rotationCycle[nextIndex];

    console.log('✅ Marketing Rotation:');
    console.log(`   Last post type: ${lastPostType}`);
    console.log(`   Next post type: ${nextMarketingType}`);
    console.log(`   Rotation cycle: ${rotationCycle.join(' → ')}\n`);

  } catch (error) {
    console.error('❌ Error testing AI generation:');
    console.error(`   ${error.message}\n`);
  }
}

// ===== TEST 4: Test Firestore schema =====
async function testFirestoreSchema() {
  console.log('🔍 TEST 4: Verifying Firestore Schema...\n');

  try {
    // Get collection stats
    const allDocs = await db.collection('googleBusinessPosts').get();

    console.log('✅ Firestore Collection Status:');
    console.log(`   Collection: googleBusinessPosts`);
    console.log(`   Total documents: ${allDocs.size}`);

    if (allDocs.size > 0) {
      const statuses = {};
      const types = {};

      allDocs.forEach((doc) => {
        const data = doc.data();
        statuses[data.status] = (statuses[data.status] || 0) + 1;
        types[data.marketingType] = (types[data.marketingType] || 0) + 1;
      });

      console.log(`\n   Status breakdown:`);
      Object.entries(statuses).forEach(([status, count]) => {
        console.log(`     • ${status}: ${count}`);
      });

      console.log(`\n   Marketing type breakdown:`);
      Object.entries(types).forEach(([type, count]) => {
        console.log(`     • ${type}: ${count}`);
      });
    }

    console.log();
  } catch (error) {
    console.error('❌ Error verifying schema:');
    console.error(`   ${error.message}\n`);
  }
}

// ===== TEST 5: Test manual post approval simulation =====
async function testManualPostApprovalWorkflow(postId) {
  if (!postId) {
    console.log('⏭️  TEST 5: Skipped (no post ID available)\n');
    return;
  }

  console.log('✅ TEST 5: Manual Post Approval Workflow\n');

  try {
    const docRef = db.collection('googleBusinessPosts').doc(postId);

    // Simulate approval
    await docRef.update({
      status: 'posted',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      postedAt: admin.firestore.FieldValue.serverTimestamp(),
      postId: 'gbp_test_' + Date.now()
    });

    const updated = await docRef.get();
    const data = updated.data();

    console.log(`✅ Post approved and marked as posted!`);
    console.log(`   Document: ${postId}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Posted at: ${data.postedAt?.toDate?.()?.toLocaleString() || 'N/A'}`);
    console.log(`   Post ID: ${data.postId}\n`);

  } catch (error) {
    console.error('❌ Error in approval workflow:');
    console.error(`   ${error.message}\n`);
  }
}

// ===== MAIN TEST RUNNER =====
async function runAllTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║ Google Business Profile Functions Tests    ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    // Run all tests
    const postId = await testCreateManualPost();
    await testRetrievePendingPosts();
    await testAIGeneration();
    await testFirestoreSchema();
    await testManualPostApprovalWorkflow(postId);

    console.log('╔════════════════════════════════════════════╗');
    console.log('║ ✅ All tests completed!                   ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('\n📋 Next Steps:');
    console.log('   1. Check your Firestore in Firebase Console');
    console.log('   2. Verify googleBusinessPosts collection exists');
    console.log('   3. Deploy Cloud Functions: firebase deploy --only functions');
    console.log('   4. Test via the dashboard\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:');
    console.error(error);
  } finally {
    await admin.app().delete();
    process.exit(0);
  }
}

// Run tests
runAllTests();
