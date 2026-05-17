import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentSingleTabManager,
  CACHE_SIZE_UNLIMITED 
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA7zNL3rYgM7prdtZQA0puMo4g4rHDx3Kw",
  authDomain: "safe-for-me-2bc19.firebaseapp.com",
  projectId: "safe-for-me-2bc19",
  storageBucket: "safe-for-me-2bc19.firebasestorage.app",
  messagingSenderId: "144307434594",
  appId: "1:144307434594:web:9c9bc31070c11f20264d3b",
};

export const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }),
  experimentalAutoDetectLongPolling: true
});

export const auth = getAuth(app);

export default app;
