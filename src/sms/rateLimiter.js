/**
 * Rate Limiting System
 * Prevents sending multiple SMS to the same recipient within a minimum interval
 */

import { collection, getDocs, query, where, Timestamp, getDoc, doc } from 'firebase/firestore'

const DEFAULT_MIN_INTERVAL_MS = 3600000 // 1 hour

/**
 * Get rate limit configuration from Firestore
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} Rate limit config
 */
const getRateLimitConfig = async (db) => {
  try {
    const configSnap = await getDoc(doc(db, 'settings', 'smsRateLimitConfig'))
    if (configSnap.exists()) {
      return configSnap.data()
    }
  } catch (error) {
    console.warn('Failed to fetch rate limit config:', error.message)
  }

  return {
    enabled: true,
    minIntervalBetweenSmsMs: DEFAULT_MIN_INTERVAL_MS,
  }
}

/**
 * Check if SMS can be sent to a recipient
 * @param {Object} params
 * @param {Object} params.db - Firestore database instance
 * @param {string} params.recipientMobile - Phone number
 * @returns {Promise<Object>} {
 *   allowed: boolean,
 *   lastSentAt: Date|null,
 *   hoursUntilEligible: number|0,
 *   reason: string|null
 * }
 */
export const canSendToRecipient = async ({ db, recipientMobile }) => {
  const config = await getRateLimitConfig(db)

  if (!config.enabled) {
    return {
      allowed: true,
      lastSentAt: null,
      hoursUntilEligible: 0,
      reason: null,
    }
  }

  const minInterval = config.minIntervalBetweenSmsMs || DEFAULT_MIN_INTERVAL_MS

  try {
    // Find the most recent sent SMS to this recipient
    const recentSmsQuery = query(
      collection(db, 'sms_jobs'),
      where('recipientMobile', '==', recipientMobile),
      where('status', '==', 'sent')
    )

    const snap = await getDocs(recentSmsQuery)

    if (snap.empty) {
      return {
        allowed: true,
        lastSentAt: null,
        hoursUntilEligible: 0,
        reason: null,
      }
    }

    // Get the most recent sent job
    const sentJobs = snap.docs
      .map((doc) => ({
        ...doc.data(),
        sentAtMs: doc.data().sentAt?.toMillis?.() || 0,
      }))
      .sort((a, b) => b.sentAtMs - a.sentAtMs)

    const lastSentJob = sentJobs[0]
    const lastSentAtMs = lastSentJob.sentAtMs
    const nowMs = Date.now()
    const timeSinceLastSmsMs = nowMs - lastSentAtMs

    if (timeSinceLastSmsMs < minInterval) {
      const remainingMs = minInterval - timeSinceLastSmsMs
      const hoursUntilEligible = Math.ceil(remainingMs / (1000 * 60 * 60))

      return {
        allowed: false,
        lastSentAt: new Date(lastSentAtMs),
        hoursUntilEligible,
        reason: `Rate limited: last SMS sent ${Math.round(timeSinceLastSmsMs / 1000 / 60)} minutes ago`,
      }
    }

    return {
      allowed: true,
      lastSentAt: new Date(lastSentAtMs),
      hoursUntilEligible: 0,
      reason: null,
    }
  } catch (error) {
    console.error('Rate limit check failed:', error.message)
    // On error, allow sending (fail open)
    return {
      allowed: true,
      lastSentAt: null,
      hoursUntilEligible: 0,
      reason: null,
    }
  }
}

/**
 * Calculate when a rate-limited job should be retried
 * @param {number} minIntervalMs - Minimum interval between SMS
 * @param {Date} lastSentAt - When the last SMS was sent
 * @returns {Date} When the next SMS can be sent
 */
export const calculateRateLimitRetryTime = (minIntervalMs, lastSentAt) => {
  const nextEligibleMs = lastSentAt.getTime() + minIntervalMs
  return new Date(nextEligibleMs)
}
