import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// When running in a GCP environment (like Cloud Shell), 
// initializeApp() with no arguments uses application default credentials.
const app = initializeApp({
  projectId: 'anjaniappnew'
});
const db = getFirestore(app);

async function checkTokens() {
  try {
    const tokensSnapshot = await db.collectionGroup('tokens').get();
    console.log(`Total tokens found: ${tokensSnapshot.size}`);
    tokensSnapshot.forEach(doc => {
      console.log(`User: ${doc.ref.parent.parent.id}, Token ID: ${doc.id}`);
    });
  } catch (error) {
    console.error('Error fetching tokens:', error);
  }
}

checkTokens();
