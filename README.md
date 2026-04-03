# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Android APK build (personal sideload use)

This repo includes a GitHub Actions workflow at `.github/workflows/android-apk.yml` that builds a **debug APK** using Capacitor.

### What it does
- Builds the web app (`npm run build`).
- Creates/syncs the Capacitor Android project.
- Ensures these permissions are present in `android/app/src/main/AndroidManifest.xml`:
  - `android.permission.SEND_SMS`
  - `android.permission.CAMERA`
  - `android.permission.ACCESS_COARSE_LOCATION`
  - `android.permission.ACCESS_FINE_LOCATION`
- Builds `app-debug.apk` and uploads it as a workflow artifact.

### How to use
1. Run the workflow manually from the **Actions** tab (`Build Android APK (Capacitor)`).
2. Download the `app-debug-apk` artifact.
3. Install the APK manually on your phone (sideload). This is suitable for personal/internal use and does not require Play Store publishing.
