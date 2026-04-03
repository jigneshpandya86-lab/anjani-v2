# Anjani V2

## Google Sign-In setup (Firebase)

### 1) Enable Google provider in Firebase Console
1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Google**.
3. Add your support email and save.
4. In **Authentication → Settings → Authorized domains**, add your app domain (and `localhost` for local testing).

### 2) Client code
Google auth helpers are available in `src/firebase-auth.js`.

```js
import { signInWithGoogle, signOutFromGoogle } from "./firebase-auth";

const handleLogin = async () => {
  const user = await signInWithGoogle();
  console.log("Signed in user:", user.uid, user.email);
};

const handleLogout = async () => {
  await signOutFromGoogle();
};
```

### 3) Firestore rules for authenticated Google users
Copy the rule below into **Firebase Console → Firestore Database → Rules**.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedInWithGoogle() {
      return request.auth != null
        && request.auth.token.firebase.sign_in_provider == "google.com";
    }

    match /{document=**} {
      allow read, write: if signedInWithGoogle();
    }
  }
}
```

> If you want stricter controls (for example, user-specific documents), add document-level checks with `request.auth.uid`.
