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

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Android APK build (personal sideload use)

This repo includes a GitHub Actions workflow at `.github/workflows/android-apk.yml` that builds a **debug APK** using Capacitor.

### What it does
- Builds the web app (`npm run build`).
- Creates/syncs the Capacitor Android project.
- Ensures these permissions are present in `android/app/src/main/AndroidManifest.xml`:
  - `android.permission.CAMERA`
  - `android.permission.ACCESS_COARSE_LOCATION`
  - `android.permission.ACCESS_FINE_LOCATION`
- Builds `app-debug.apk` and uploads it as a workflow artifact.

### How to use
1. Run the workflow manually from the **Actions** tab (`Build Android APK (Capacitor)`).
2. Download the `app-debug-apk` artifact.
3. Install the APK manually on your phone (sideload). This is suitable for personal/internal use and does not require Play Store publishing.

## Firestore data location (orders)

Order details are stored in the `orders` top-level collection in Cloud Firestore (project `anjaniappnew`).

- Create order: app writes to `collection(db, 'orders')`.
- Read orders list: app queries `collection(db, 'orders')` ordered by `createdAt` (latest first).
- Update/Delete order: app targets `doc(db, 'orders', <documentId>)`.

The app supports both newer and legacy field names when reading orders:

- Quantity: `qty` (fallback: `boxes`, `quantity`)
- Date: `date` (fallback: `deliveryDate`, `orderDate`)
- Time: `time` (fallback: `deliveryTime`)
- Client ID: `clientId` (fallback: `customerId`)
- Address: `address` (fallback: `deliveryAddress`, `location`)
- Map link: `mapLink` (fallback: `googleMap`)

## Leads "Connect" SMS flow (in-app, manual trigger)

The SMS connect flow is now handled directly inside the React app (`LeadsDashboard`) when the user presses the **Connect** button.

- No standalone Google Apps Script (`.gs`) file is required for this flow.
- On click, the app fetches up to 5 leads with `Tag == null`.
- For each matching lead, the app calls the MacroDroid webhook and then updates Firestore with `Tag = "SMS_SENT"` plus `smsSentAt`.
- Webhook URL is read from `VITE_MACRO_URL` (with app fallback if env is not set).

## Random daily Firebase notification from GitHub Actions

This repo includes `.github/workflows/random-fcm-notification.yml` to send an FCM push notification once per day at a random **daytime** hour.

- Workflow trigger:
  - Runs hourly (`cron`) and only sends when the current local hour matches that day's deterministic random hour inside the daytime window.
  - Can also be run manually using **Actions → Send Random Daily FCM Notification**.
- Daytime window:
  - Default is `7` to `22` (7 AM to 10 PM) in `Asia/Kolkata`.
  - Configure timezone and window using secrets: `LOCAL_TIMEZONE`, `DAY_START_HOUR`, `DAY_END_HOUR`.
- Delivery target:
  - Use a single device token (`FCM_TARGET_TOKEN`) or a topic (`FCM_TARGET_TOPIC`).
  - At least one must be set in repository secrets.
- Message text:
  - If `NOTIFICATION_BODY` is not set, the workflow picks one auto-action text (for example: ask client for money, check stock, send leads welcome, and similar business reminders).

### Required GitHub secrets

1. `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Value is the full JSON from Firebase service account key.
   - Generate in **Firebase Console → Project settings → Service accounts → Generate new private key**.
2. `FIREBASE_PROJECT_ID`
   - Firebase project ID string.
3. One of:
   - `FCM_TARGET_TOKEN` (device registration token), or
   - `FCM_TARGET_TOPIC` (topic name without `/topics/` prefix, e.g. `all-users`).

### Optional GitHub secrets

- `RANDOM_SEED` (changes how the random hour is selected each day)
- `LOCAL_TIMEZONE` (IANA timezone like `Asia/Kolkata`)
- `DAY_START_HOUR` (default `7`)
- `DAY_END_HOUR` (default `22`)
- `NOTIFICATION_TITLE`
- `NOTIFICATION_BODY`

### App-side requirement for token-based sends

If you use `FCM_TARGET_TOKEN`, your Android app must fetch and log/send its FCM registration token to your backend/admin so you can store it as a GitHub secret.
