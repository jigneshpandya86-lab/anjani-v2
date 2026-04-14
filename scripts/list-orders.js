import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({
  projectId: 'anjaniappnew'
});
const db = getFirestore(app);

async function listOrders() {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(5).get();
    console.log(`Found ${snapshot.size} orders:`);
    snapshot.forEach(doc => {
      console.log(`ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
      console.log('---');
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
}

listOrders();
