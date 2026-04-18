import { AlertTriangle, ExternalLink } from 'lucide-react';

export default function FirebaseError() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
          <AlertTriangle size={24} className="text-red-600" />
        </div>

        <h1 className="text-2xl font-black text-center text-[#131921] mb-2">
          Configuration Error
        </h1>

        <p className="text-center text-gray-600 mb-6">
          Firebase credentials are missing. The app cannot load data without proper configuration.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-red-900 mb-2">Missing Environment Variables:</p>
          <ul className="text-xs text-red-800 space-y-1">
            <li>• VITE_FIREBASE_API_KEY</li>
            <li>• VITE_FIREBASE_AUTH_DOMAIN</li>
            <li>• VITE_FIREBASE_PROJECT_ID</li>
            <li>• VITE_FIREBASE_APP_ID</li>
          </ul>
        </div>

        <div className="space-y-3 mb-6">
          <p className="text-sm font-semibold text-gray-800">How to fix this:</p>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
            <li>Go to your Firebase Console</li>
            <li>Navigate to Project Settings</li>
            <li>Copy your Firebase config credentials</li>
            <li>
              Add them to GitHub Secrets
              <a
                href="https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 ml-1"
              >
                (Learn more)
                <ExternalLink size={14} />
              </a>
            </li>
          </ol>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Check browser console (F12) for detailed error messages.
        </p>
      </div>
    </div>
  );
}
