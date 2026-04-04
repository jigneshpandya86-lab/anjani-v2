// ─────────────────────────────────────────────────────────────
// AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
// This file initialises Firebase and exports the auth instance.
// Changes here affect authentication and all Firestore access.
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU",
  authDomain: "anjaniappnew.firebaseapp.com",
  projectId: "anjaniappnew",
  storageBucket: "anjaniappnew.firebasestorage.app",
  messagingSenderId: "892497799371",
  appId: "1:892497799371:web:5671e248e6c8f05d16934e"
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// AUTH: do not remove — shared auth instance used across the entire app
export const auth = getAuth(app);
