// ─────────────────────────────────────────────────────────────────────────────
// AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
// This file contains all Firebase authentication functions for the app.
// Modifying these functions will directly affect login, sign-up, and sign-out.
// ─────────────────────────────────────────────────────────────────────────────
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth'
import { auth } from './firebase-config'

// AUTH: Google provider — prompt forces account selection every time
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({
  prompt: 'select_account'
})

// AUTH: detects Capacitor native environment (Android/iOS) to use redirect instead of popup
const isNativeCapacitor = () => {
  if (typeof window === 'undefined') return false
  return Boolean(window.Capacitor?.isNativePlatform?.())
}

// AUTH: Google sign-in — uses popup on web, redirect on native
export const signInWithGoogle = async () => {
  if (isNativeCapacitor()) {
    await signInWithRedirect(auth, googleProvider)
    return null
  }

  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

// AUTH: email/password sign-in for existing users
export const signInWithEmailPassword = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

// AUTH: email/password sign-up to create new user accounts
export const signUpWithEmailPassword = async (email, password) => {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  return result.user
}

// AUTH: sign out the current user
export const signOutUser = async () => {
  await signOut(auth)
}
