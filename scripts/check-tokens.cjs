
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'anjaniappnew' });
const db = admin.firestore();

async function listTokens() {
  const snapshot = await db.collectionGroup('tokens').get();
  console.log(`Found ${snapshot.size} tokens total.`);
  snapshot.forEach(doc => {
    const data = doc.data();
    const parent = doc.ref.parent.parent;
    console.log(`User: ${parent ? parent.id : 'unknown'}, Token: ${data.token ? data.token.substring(0, 10) + '...' : 'MISSING'}, Device: ${data.deviceName || 'unknown'}, Last: ${data.lastRegistered ? data.lastRegistered.toDate().toISOString() : 'unknown'}`);
  });
}

listTokens().catch(console.error);
