import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'anjaniappnew' });
const db = getFirestore(app);

const uid = '7JhyNPnmLBUCH5f6YhZtMCeL0BA3';
const email = 'nilesh@gmail.com';

async function setStaffRole() {
  try {
    await db.collection('users').doc(uid).set({
      email: email,
      role: 'staff',
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`Successfully set role 'staff' for user: ${email} (UID: ${uid})`);
  } catch (error) {
    console.error('Error setting staff role:', error);
  }
}

setStaffRole();
