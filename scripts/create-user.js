import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'anjaniappnew' });
const auth = getAuth(app);
const db = getFirestore(app);

const newUser = {
  email: 'nilesh@gmail.com',
  password: '12345678',
  role: 'staff'
};

async function createStaffUser() {
  try {
    // 1. Create user in Firebase Authentication
    const userRecord = await auth.createUser({
      email: newUser.email,
      password: newUser.password,
    });
    console.log(`Successfully created new user in Auth: ${userRecord.uid}`);

    // 2. Set role in Firestore 'users' collection
    await db.collection('users').doc(userRecord.uid).set({
      email: newUser.email,
      role: newUser.role,
      createdAt: new Date().toISOString()
    });
    console.log(`Successfully set role '${newUser.role}' in Firestore for ${newUser.email}`);

    console.log('\nUser Creation Summary:');
    console.log(`Email: ${newUser.email}`);
    console.log(`Password: ${newUser.password}`);
    console.log(`Role: ${newUser.role}`);
    console.log('---');
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      console.log(`User ${newUser.email} already exists in Auth. Updating Firestore role...`);
      const user = await auth.getUserByEmail(newUser.email);
      await db.collection('users').doc(user.uid).set({
        email: newUser.email,
        role: newUser.role
      }, { merge: true });
      console.log(`Updated Firestore role to '${newUser.role}' for existing user.`);
    } else {
      console.error('Error creating user:', error);
    }
  }
}

createStaffUser();
