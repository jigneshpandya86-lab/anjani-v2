import { describe, it, expect } from 'vitest'
import {
  detectMemoryIntent,
  isQueryingMemories,
  formatMemoriesForPrompt,
} from '../utils/aiMemoryUtils'

describe('aiMemoryUtils - Self-Learning & Error Avoidance', () => {
  describe('detectMemoryIntent', () => {
    it('detects explicit memory commands', () => {
      const intent1 = detectMemoryIntent('Remember: Royal Hotel rate is 115')
      expect(intent1).not.toBeNull()
      expect(intent1.isMemory).toBe(true)
      expect(intent1.isCorrection).toBe(false)
      expect(intent1.rule).toBe('Royal Hotel rate is 115')
      expect(intent1.category).toBe('client_rule')

      const intent2 = detectMemoryIntent('Remember that 1 petli means 200ml box of 48 bottles')
      expect(intent2).not.toBeNull()
      expect(intent2.isMemory).toBe(true)
      expect(intent2.category).toBe('shorthand')
    })

    it('detects conversational error corrections', () => {
      const correction1 = detectMemoryIntent("That's wrong, Royal Hotel rate is 115 not 120")
      expect(correction1).not.toBeNull()
      expect(correction1.isMemory).toBe(true)
      expect(correction1.isCorrection).toBe(true)
      expect(correction1.category).toBe('error_correction')
      expect(correction1.rule).toContain('Royal Hotel rate is 115 not 120')

      const correction2 = detectMemoryIntent("Correction: Jay Ambe is in Manjalpur, never use Gotri")
      expect(correction2).not.toBeNull()
      expect(correction2.isCorrection).toBe(true)
      expect(correction2.category).toBe('error_correction')

      const correction3 = detectMemoryIntent("Don't repeat this mistake, Nilesh handles cash handover")
      expect(correction3).not.toBeNull()
      expect(correction3.isCorrection).toBe(true)
      expect(correction3.category).toBe('error_correction')
    })

    it('detects Gujarati / Indic memory triggers', () => {
      const gujIntent = detectMemoryIntent('Yad rakhjo: Kalali delivery bapore thase')
      expect(gujIntent).not.toBeNull()
      expect(gujIntent.isMemory).toBe(true)
      expect(gujIntent.rule).toBe('Kalali delivery bapore thase')

      const fromNowOn = detectMemoryIntent('From now on, always add ₹5 delivery charge for out-of-city')
      expect(fromNowOn).not.toBeNull()
      expect(fromNowOn.isMemory).toBe(true)
    })

    it('returns null for standard orders and general chatter', () => {
      expect(detectMemoryIntent('Order 10 boxes 200ml for Jay Ambe')).toBeNull()
      expect(detectMemoryIntent('Current stock in warehouse')).toBeNull()
      expect(detectMemoryIntent('Received 5000 from Royal Hotel via GPay')).toBeNull()
      expect(detectMemoryIntent('Hello')).toBeNull()
      expect(detectMemoryIntent('')).toBeNull()
    })
  })

  describe('isQueryingMemories', () => {
    it('identifies memory query phrases', () => {
      expect(isQueryingMemories('What do you remember?')).toBe(true)
      expect(isQueryingMemories('Show memories')).toBe(true)
      expect(isQueryingMemories('List memories')).toBe(true)
      expect(isQueryingMemories('Show my rules')).toBe(true)
      expect(isQueryingMemories('What are your rules?')).toBe(true)
      expect(isQueryingMemories('What did you learn?')).toBe(true)
    })

    it('returns false for normal business prompts', () => {
      expect(isQueryingMemories('Pending deliveries today')).toBe(false)
      expect(isQueryingMemories('Who owes money?')).toBe(false)
      expect(isQueryingMemories('How many boxes in stock?')).toBe(false)
    })
  })

  describe('formatMemoriesForPrompt', () => {
    it('formats active memories into organized prompt block with category headers', () => {
      const memories = [
        {
          id: '1',
          rule: 'Royal Hotel rate is 115, NEVER use 120',
          category: 'error_correction',
          active: true,
        },
        {
          id: '2',
          rule: '1 petli means 200ml box (48 bottles)',
          category: 'shorthand',
          active: true,
        },
        {
          id: '3',
          rule: 'Old rule to ignore',
          category: 'general_rule',
          active: false, // inactive should be filtered out
        },
        {
          id: '4',
          rule: 'Nilesh collects cash from Jay Ambe on Thursdays',
          category: 'staff_rule',
          active: true,
        },
      ]

      const formatted = formatMemoriesForPrompt(memories)

      expect(formatted).toContain('## 🧠 PERMANENT BUSINESS MEMORIES & LEARNED ERROR CORRECTIONS')
      expect(formatted).toContain('Royal Hotel rate is 115, NEVER use 120')
      expect(formatted).toContain('1 petli means 200ml box (48 bottles)')
      expect(formatted).toContain('Nilesh collects cash from Jay Ambe on Thursdays')
      expect(formatted).not.toContain('Old rule to ignore')
    })

    it('returns empty string if no active memories', () => {
      expect(formatMemoriesForPrompt([])).toBe('')
      expect(formatMemoriesForPrompt([{ rule: 'xyz', active: false }])).toBe('')
    })
  })
})
