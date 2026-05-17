
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'anjaniappnew' });
const db = admin.firestore();

async function debugOutstanding() {
  const snapshot = await db.collection('clients').limit(10).get();
  console.log(`Found ${snapshot.size} clients.`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Client: ${data.name}, Outstanding Field: ${data.outstanding}, Type: ${typeof data.outstanding}`);
  });
}

debugOutstanding().catch(console.error);
