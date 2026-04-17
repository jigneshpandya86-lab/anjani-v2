const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function getSample() {
  const snapshot = await db.collection('orders').limit(1).get();
  if (snapshot.empty) {
    console.log("No orders found.");
    return;
  }
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', JSON.stringify(doc.data(), null, 2));
  });
}
getSample().catch(console.error);
