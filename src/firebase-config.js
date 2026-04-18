// ─────────────────────────────────────────────────────────────
// AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
// This file initialises Firebase and exports the auth instance.
// Changes here affect authentication and all Firestore access.
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

export const app = initializeApp(firebaseConfig);

// memoryLocalCache avoids IndexedDB, which can fail to initialise in Android
// WebView and cause all Firestore reads to throw (making fetchUserRole default
// to 'staff'). CapacitorHttp must also be disabled (capacitor.config.json) so
// it does not intercept Firebase's XHR-based WebChannel streaming connections.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

// AUTH: do not remove — shared auth instance used across the entire app
export const auth = getAuth(app);
