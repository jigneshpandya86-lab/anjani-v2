// ─────────────────────────────────────────────────────────────
// AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
// This file initialises Firebase and exports the auth instance.
// Changes here affect authentication and all Firestore access.
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager,
  CACHE_SIZE_UNLIMITED 
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

// Validate that critical Firebase credentials are available. When any are
// missing we surface a structured error the UI can react to (see App.jsx
// FirebaseError guard) instead of only logging to the console.
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

export const firebaseConfigError =
  missingKeys.length > 0
    ? new Error(
        `Firebase configuration is incomplete. Missing environment variables: ${missingKeys
          .map((k) => `VITE_FIREBASE_${k.toUpperCase()}`)
          .join(', ')}`,
      )
    : null;

if (firebaseConfigError && import.meta.env.DEV) {
  console.error(firebaseConfigError.message);
}

export const app = initializeApp(firebaseConfig);

// persistentSingleTabManager is required for Capacitor Android WebView — the
// multi-tab manager's leader-election mechanism can stall in a single-WebView
// context, causing Firestore to silently fail and all role/data reads to error.
// experimentalAutoDetectLongPolling lets Firestore fall back from WebChannel
// (which requires streaming fetch) to long polling when it can't stream — the
// WebChannel transport breaks inside Capacitor's Android WebView, causing
// getDoc/onSnapshot to hang or error silently, which made fetchUserRole()
// default to 'staff' and hid all admin data after login.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }),
  experimentalAutoDetectLongPolling: true
});

// AUTH: do not remove — shared auth instance used across the entire app
export const auth = getAuth(app);
