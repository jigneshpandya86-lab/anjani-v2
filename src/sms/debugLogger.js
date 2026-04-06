import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

/**
 * Write debug logs to Firestore for SMS processor monitoring
 * Stores logs in: userDevices/{userId}/debug_logs/{logId}
 */
export const writeDebugLog = async (db, userId, category, message, data = {}) => {
  if (!db || !userId) return

  try {
    const debugLogsRef = collection(db, 'userDevices', userId, 'debug_logs')
    await addDoc(debugLogsRef, {
      timestamp: serverTimestamp(),
      category, // 'plugin_check', 'processor_init', 'processor_run', 'send_attempt', 'error'
      message,
      ...data,
    })
  } catch (error) {
    // Silently fail - don't break SMS processor due to logging error
    console.error('Failed to write debug log:', error)
  }
}
