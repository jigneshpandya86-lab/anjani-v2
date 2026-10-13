import { describe, it, expect } from 'vitest'
import {
  evaluateArithmetic,
  hasArithmeticOperators,
  buildCashHandoverSms,
} from '../utils/calculatorUtils'

describe('calculatorUtils', () => {
  describe('evaluateArithmetic', () => {
    it('evaluates simple additions and subtractions', () => {
      expect(evaluateArithmetic('1000 + 500')).toBe(1500)
      expect(evaluateArithmetic('2000 - 350')).toBe(1650)
      expect(evaluateArithmetic('100 + 200 + 300')).toBe(600)
    })

    it('evaluates multiplications and divisions with standard and unicode operators', () => {
      expect(evaluateArithmetic('500 * 4')).toBe(2000)
      expect(evaluateArithmetic('500 × 4')).toBe(2000)
      expect(evaluateArithmetic('2000 / 4')).toBe(500)
      expect(evaluateArithmetic('2000 ÷ 4')).toBe(500)
    })

    it('respects operator precedence and parentheses', () => {
      expect(evaluateArithmetic('500 * 4 + 200')).toBe(2200)
      expect(evaluateArithmetic('200 + 500 * 4')).toBe(2200)
      expect(evaluateArithmetic('(200 + 500) * 4')).toBe(2800)
      expect(evaluateArithmetic('(1000 - 200) / 2')).toBe(400)
    })

    it('handles decimal amounts cleanly', () => {
      expect(evaluateArithmetic('1200.50 + 49.50')).toBe(1250)
      expect(evaluateArithmetic('100.25 * 4')).toBe(401)
    })

    it('safely returns null for division by zero or invalid input', () => {
      expect(evaluateArithmetic('500 / 0')).toBeNull()
      expect(evaluateArithmetic('500 ÷ 0')).toBeNull()
      expect(evaluateArithmetic('')).toBeNull()
      expect(evaluateArithmetic('abc')).toBeNull()
      expect(evaluateArithmetic('500 + ')).toBeNull()
      expect(evaluateArithmetic(null)).toBeNull()
    })
  })

  describe('hasArithmeticOperators', () => {
    it('detects operators accurately', () => {
      expect(hasArithmeticOperators('100+20')).toBe(true)
      expect(hasArithmeticOperators('500-10')).toBe(true)
      expect(hasArithmeticOperators('500*2')).toBe(true)
      expect(hasArithmeticOperators('500×2')).toBe(true)
      expect(hasArithmeticOperators('1000/2')).toBe(true)
      expect(hasArithmeticOperators('1000÷2')).toBe(true)
      expect(hasArithmeticOperators('1500')).toBe(false)
      expect(hasArithmeticOperators('')).toBe(false)
    })
  })

  describe('buildCashHandoverSms', () => {
    it('generates short and sweet Khatabook-style SMS message', () => {
      const sms = buildCashHandoverSms({
        amount: 5000,
        fromName: 'Nilesh',
        toName: 'Counter',
        date: '2026-10-13',
        remainingBalance: 1200,
      })

      expect(sms).toContain('Annapurna Foods: Received ₹5,000 cash from Nilesh on 13-Oct.')
      expect(sms).toContain('Remaining: ₹1,200.')
      expect(sms).toContain('Thank you!')
      expect(sms.length).toBeLessThan(110)
    })

    it('handles handover without remaining balance', () => {
      const sms = buildCashHandoverSms({
        amount: 2500,
        fromName: 'Counter',
        toName: 'Bank',
        date: '2026-10-13',
        remainingBalance: null,
      })

      expect(sms).toContain('Annapurna Foods: Received ₹2,500 cash from Counter on 13-Oct.')
      expect(sms).not.toContain('Remaining:')
      expect(sms).toContain('Thank you!')
    })
  })
})
