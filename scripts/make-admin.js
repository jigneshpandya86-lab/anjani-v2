import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'anjaniappnew' });
const db = getFirestore(app);

const UIDS = [
  '99sjK9Fgn4Y6jv4tZiIsTOoGVLm1',
  'zmlSrAFLycN1Z4qpQaylggm9VCy1'
];

async function makeAdmins() {
  try {
    for (const uid of UIDS) {
      await db.collection('users').doc(uid).set({ role: 'admin' }, { merge: true });
      console.log(`Set role 'admin' for user: ${uid}`);
    }
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
  }
}

makeAdmins();
