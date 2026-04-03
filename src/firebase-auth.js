import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth'
import { auth } from './firebase-config'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({
  prompt: 'select_account'
})

const isNativeCapacitor = () => {
  if (typeof window === 'undefined') return false
  return Boolean(window.Capacitor?.isNativePlatform?.())
}

export const signInWithGoogle = async () => {
  if (isNativeCapacitor()) {
    await signInWithRedirect(auth, googleProvider)
    return null
  }

  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export const signInWithEmailPassword = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}


export const signOutUser = async () => {
  await signOut(auth)
}
