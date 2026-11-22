/**
 * Dynamic voice & AI budget tracker for Anjani Water ERP.
 * Tracks usage per IST date with dynamic limits (zero hardwiring).
 * Industry standard Token Bucket / Daily quota tracker.
 */

export const DEFAULT_DAILY_VOICE_BUDGET_INR = 10
export const ESTIMATED_COST_PER_MINUTE_INR = 1.30 // ~₹1.30/min for real-time conversational streaming

/**
 * Returns today's date in IST format: YYYY-MM-DD
 */
export function getIstDateString(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
  } catch {
    return now.toISOString().split('T')[0]
  }
}

/**
 * Retrieves daily voice usage metrics for the given IST day.
 *
 * @param {number|null} customBudgetInr - Optional dynamic budget cap in INR
 * @returns {object} Usage stats including remaining budget and whether limit is reached
 */
export function getDailyVoiceUsage(customBudgetInr = null) {
  const istToday = getIstDateString()
  const storageKey = `anjani_voice_budget_${istToday}`
  const budgetInr = Number(customBudgetInr) > 0 ? Number(customBudgetInr) : DEFAULT_DAILY_VOICE_BUDGET_INR

  let record = { usedSeconds: 0, usedTurns: 0, usedCostInr: 0 }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        record = { ...record, ...JSON.parse(raw) }
      }
    } catch {
      // ignore storage parsing error
    }
  }

  const usedSeconds = Number(record.usedSeconds) || 0
  const usedTurns = Number(record.usedTurns) || 0
  const usedCostInr = Math.round((Number(record.usedCostInr) || (usedSeconds / 60) * ESTIMATED_COST_PER_MINUTE_INR) * 100) / 100

  const remainingBudgetInr = Math.max(0, Math.round((budgetInr - usedCostInr) * 100) / 100)
  const maxAllowedSeconds = Math.floor((budgetInr / ESTIMATED_COST_PER_MINUTE_INR) * 60)
  const remainingSeconds = Math.max(0, maxAllowedSeconds - usedSeconds)
  const isLimitReached = usedCostInr >= budgetInr || usedSeconds >= maxAllowedSeconds
  const percentageUsed = Math.min(100, Math.round((usedCostInr / budgetInr) * 100))

  return {
    date: istToday,
    usedSeconds,
    usedTurns,
    usedCostInr,
    budgetInr,
    remainingBudgetInr,
    remainingSeconds,
    maxAllowedSeconds,
    isLimitReached,
    percentageUsed,
  }
}

/**
 * Atomically records voice usage (seconds and/or turns) for today.
 *
 * @param {object} params - { seconds, turns, customBudgetInr }
 * @returns {object} Updated usage stats
 */
export function recordVoiceUsage({ seconds = 0, turns = 1, customBudgetInr = null } = {}) {
  const istToday = getIstDateString()
  const storageKey = `anjani_voice_budget_${istToday}`
  const current = getDailyVoiceUsage(customBudgetInr)

  const newSeconds = current.usedSeconds + Math.max(0, Number(seconds) || 0)
  const newTurns = current.usedTurns + Math.max(0, Number(turns) || 0)
  const incrementalCost = ((Math.max(0, Number(seconds) || 0)) / 60) * ESTIMATED_COST_PER_MINUTE_INR
  const newCost = Math.round((current.usedCostInr + incrementalCost) * 100) / 100

  const updated = {
    usedSeconds: newSeconds,
    usedTurns: newTurns,
    usedCostInr: newCost,
    updatedAt: new Date().toISOString(),
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch {
      // ignore
    }
  }

  return getDailyVoiceUsage(customBudgetInr)
}

/**
 * Checks if daily voice budget has been exhausted.
 *
 * @param {number|null} customBudgetInr
 * @returns {boolean}
 */
export function isVoiceBudgetExceeded(customBudgetInr = null) {
  const usage = getDailyVoiceUsage(customBudgetInr)
  return usage.isLimitReached
}

/**
 * Returns plain English alert when limit is reached.
 *
 * @param {number|null} customBudgetInr
 * @returns {string} Plain English explanation
 */
export function getPlainEnglishBudgetAlert(customBudgetInr = null) {
  const usage = getDailyVoiceUsage(customBudgetInr)
  return `Daily AI voice budget limit reached (₹${usage.budgetInr}/day). Limit resets at midnight IST. You can continue using standard text mode.`
}

/**
 * Strips markdown symbols, code blocks, URLs, and asterisks for clean text-to-speech.
 *
 * @param {string} rawText
 * @returns {string}
 */
export function cleanTextForSpeech(rawText = '') {
  if (!rawText || typeof rawText !== 'string') return ''
  return rawText
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/`[^`]+`/g, '') // remove inline code
    .replace(/https?:\/\/\S+/g, '') // remove URLs
    .replace(/[#*_~>•]/g, ' ') // remove markdown syntax and bullet dots
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // keep link label
    .replace(/₹\s*([\d,]+)/g, '$1 rupees') // pronounce currency naturally (supports comma-formatted amounts like 2,600)
    .replace(/Rs\.?\s*([\d,]+)/gi, '$1 rupees')
    .replace(/\s+/g, ' ')
    .trim()
}
