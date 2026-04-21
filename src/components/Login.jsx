// ─────────────────────────────────────────────────────────────────────────────
// AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
// This is the login screen component. It handles email/password and Google
// sign-in. Changes here affect every user's ability to access the app.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { signInWithGoogle, signInWithEmailPassword, signUpWithEmailPassword } from '../firebase-auth'
import { Mail, Lock, LogIn } from 'lucide-react'

// AUTH: maps Firebase error codes to human-readable messages — do not remove entries
const AUTH_ERRORS = {
  'auth/email-already-in-use': 'Email already in use',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/invalid-email': 'Invalid email address',
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/invalid-credential': 'Incorrect email or password',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/user-disabled': 'This account has been disabled',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Contact admin.',
}

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // AUTH: handles email/password sign-in and sign-up form submission
  const handleEmailAuth = async (e) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        await signUpWithEmailPassword(email, password)
        toast.success('Account created successfully')
      } else {
        await signInWithEmailPassword(email, password)
        toast.success('Signed in successfully')
      }
      setEmail('')
      setPassword('')
    } catch (error) {
      toast.error(AUTH_ERRORS[error.code] || error.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  // AUTH: handles Google OAuth sign-in
  const handleGoogleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
      toast.success('Signed in with Google')
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error(AUTH_ERRORS[error.code] || 'Failed to sign in with Google')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans flex items-center justify-center px-4">
      <Toaster position="top-center" toastOptions={{ style: { background: '#ffffff', color: '#131921', border: '1px solid #e5e7eb', borderRadius: '12px', fontWeight: '900', fontSize: '14px', padding: '16px 24px' } }} />

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h1>
          <p className="mt-2 text-sm text-gray-600">{isSignUp ? 'Create an account' : 'Sign in to your account'}</p>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label htmlFor="email-input" className="block text-sm font-bold text-gray-700 mb-2">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password-input" className="block text-sm font-bold text-gray-700 mb-2">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-300 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ff9900] hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            {loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full border-2 border-gray-200 hover:border-gray-300 disabled:opacity-50 text-gray-700 font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setEmail('')
              setPassword('')
            }}
            className="ml-1 text-[#ff9900] font-bold hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
