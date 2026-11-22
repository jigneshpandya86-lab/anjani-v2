import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDailyVoiceUsage,
  recordVoiceUsage,
  isVoiceBudgetExceeded,
  getPlainEnglishBudgetAlert,
  cleanTextForSpeech,
  getIstDateString,
  DEFAULT_DAILY_VOICE_BUDGET_INR,
  ESTIMATED_COST_PER_MINUTE_INR,
} from '../utils/voiceBudgetTracker'

describe('Voice Budget Tracker (Dynamic Capping & Plain English Alerts)', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('initializes with default budget and zero consumption', () => {
    const usage = getDailyVoiceUsage()
    expect(usage.budgetInr).toBe(DEFAULT_DAILY_VOICE_BUDGET_INR) // ₹10
    expect(usage.usedSeconds).toBe(0)
    expect(usage.usedTurns).toBe(0)
    expect(usage.usedCostInr).toBe(0)
    expect(usage.remainingBudgetInr).toBe(10)
    expect(usage.isLimitReached).toBe(false)
    expect(usage.percentageUsed).toBe(0)
  })

  it('supports dynamic budget cap configuration without hardwiring', () => {
    const customBudget = 15 // ₹15
    const usage = getDailyVoiceUsage(customBudget)
    expect(usage.budgetInr).toBe(15)
    expect(usage.remainingBudgetInr).toBe(15)
    expect(usage.maxAllowedSeconds).toBe(Math.floor((15 / ESTIMATED_COST_PER_MINUTE_INR) * 60))
  })

  it('records voice usage and calculates cost dynamically', () => {
    // Record 60 seconds (1 minute of voice)
    const updated = recordVoiceUsage({ seconds: 60, turns: 1 })
    expect(updated.usedSeconds).toBe(60)
    expect(updated.usedTurns).toBe(1)
    expect(updated.usedCostInr).toBeCloseTo(1.30, 2)
    expect(updated.remainingBudgetInr).toBeCloseTo(8.70, 2)
    expect(updated.isLimitReached).toBe(false)

    // Record another 120 seconds (2 more minutes)
    const secondTurn = recordVoiceUsage({ seconds: 120, turns: 2 })
    expect(secondTurn.usedSeconds).toBe(180)
    expect(secondTurn.usedTurns).toBe(3)
    expect(secondTurn.usedCostInr).toBeCloseTo(3.90, 2)
    expect(secondTurn.remainingBudgetInr).toBeCloseTo(6.10, 2)
    expect(secondTurn.isLimitReached).toBe(false)
  })

  it('detects when daily limit is reached and returns plain English alert', () => {
    const budgetCap = 5 // ₹5 limit for testing
    expect(isVoiceBudgetExceeded(budgetCap)).toBe(false)

    // Record usage to exceed ₹5 (e.g. 300 seconds = 5 minutes = ₹6.50)
    recordVoiceUsage({ seconds: 300, turns: 4, customBudgetInr: budgetCap })

    expect(isVoiceBudgetExceeded(budgetCap)).toBe(true)

    const alert = getPlainEnglishBudgetAlert(budgetCap)
    expect(alert).toBe(
      'Daily AI voice budget limit reached (₹5/day). Limit resets at midnight IST. You can continue using standard text mode.'
    )
  })

  it('formats plain English alert correctly for default ₹10 cap', () => {
    const alert = getPlainEnglishBudgetAlert()
    expect(alert).toBe(
      'Daily AI voice budget limit reached (₹10/day). Limit resets at midnight IST. You can continue using standard text mode.'
    )
  })

  it('cleans markdown and code syntax for natural speech pronunciation', () => {
    const rawAiText = `⚡ **Order Confirmed** for [Jay Ambe Provision](file:///clients/123):\n• 20 boxes *Anjani 200ml* @ ₹130/box.\nTotal: Rs. 2600. Delivery at 11 AM.`
    const clean = cleanTextForSpeech(rawAiText)

    expect(clean).not.toContain('**')
    expect(clean).not.toContain('*')
    expect(clean).not.toContain('•')
    expect(clean).not.toContain('file:///')
    expect(clean).toContain('Jay Ambe Provision')
    expect(clean).toContain('130 rupees/box')
    expect(clean).toContain('2600 rupees')
  })

  it('returns valid IST date string formatted YYYY-MM-DD', () => {
    const ist = getIstDateString()
    expect(ist).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
