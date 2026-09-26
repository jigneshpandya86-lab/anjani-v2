import { describe, it, expect } from 'vitest'
import {
  extractStructuredRuleData,
  detectRuleConflict,
  sliceMemoriesForContext,
  detectMemoryIntent,
} from '../utils/aiMemoryUtils'

describe('aiMemoryConflict and Structured Metadata', () => {
  const mockClients = [
    { id: 'c_royal', name: 'Royal Hotel', mobile: '9876543210' },
    { id: 'c_jay_ambe', name: 'Jay Ambe Provision Store', mobile: '9988776655' },
  ]

  describe('extractStructuredRuleData', () => {
    it('extracts client, SKU, and rate accurately', () => {
      const text = 'Royal Hotel always gets Bailey 500ml at 115 rs'
      const data = extractStructuredRuleData(text, mockClients)

      expect(data.type).toBe('client_rate')
      expect(data.clientId).toBe('c_royal')
      expect(data.clientName).toBe('Royal Hotel')
      expect(data.skuId).toBe('bailey_500ml')
      expect(data.skuLabel).toBe('Bailey 500ml')
      expect(data.enforcedRate).toBe(115)
    })

    it('extracts client and delivery day accurately', () => {
      const text = 'Jay Ambe deliveries happen only on Wednesday'
      const data = extractStructuredRuleData(text, mockClients)

      expect(data.type).toBe('client_delivery_day')
      expect(data.clientId).toBe('c_jay_ambe')
      expect(data.deliveryDay).toBe('Wednesday')
    })
  })

  describe('detectRuleConflict', () => {
    it('detects rate conflict for same client and SKU', () => {
      const existingMemories = [
        {
          id: 'mem_1',
          rule: 'Royal Hotel rate is 115',
          active: true,
          structured: {
            clientId: 'c_royal',
            clientName: 'Royal Hotel',
            skuId: 'bailey_500ml',
            enforcedRate: 115,
          },
        },
      ]

      const newIntent = detectMemoryIntent('Remember: Royal Hotel rate is 110', mockClients)
      const conflict = detectRuleConflict(newIntent, existingMemories, mockClients)

      expect(conflict.hasConflict).toBe(true)
      expect(conflict.conflictingMemory.id).toBe('mem_1')
      expect(conflict.reason).toContain('Found existing rate rule of ₹115')
    })

    it('does not flag conflict for different clients', () => {
      const existingMemories = [
        {
          id: 'mem_1',
          rule: 'Royal Hotel rate is 115',
          active: true,
          structured: {
            clientId: 'c_royal',
            clientName: 'Royal Hotel',
            enforcedRate: 115,
          },
        },
      ]

      const newIntent = detectMemoryIntent('Remember: Jay Ambe rate is 120', mockClients)
      const conflict = detectRuleConflict(newIntent, existingMemories, mockClients)

      expect(conflict.hasConflict).toBe(false)
    })

    it('detects delivery schedule conflict for same client', () => {
      const existingMemories = [
        {
          id: 'mem_2',
          rule: 'Jay Ambe delivery on Tuesday',
          active: true,
          structured: {
            clientId: 'c_jay_ambe',
            clientName: 'Jay Ambe Provision Store',
            deliveryDay: 'Tuesday',
          },
        },
      ]

      const newIntent = detectMemoryIntent('Remember: Jay Ambe delivery on Wednesday', mockClients)
      const conflict = detectRuleConflict(newIntent, existingMemories, mockClients)

      expect(conflict.hasConflict).toBe(true)
      expect(conflict.conflictingMemory.id).toBe('mem_2')
      expect(conflict.reason).toContain('Found existing delivery schedule (Tuesday)')
    })
  })

  describe('sliceMemoriesForContext', () => {
    it('prioritizes error corrections and client-matched rules when memory bank is large', () => {
      const memories = []
      // Add 25 dummy memories
      for (let i = 1; i <= 25; i++) {
        memories.push({
          id: `mem_${i}`,
          rule: `General business rule ${i}`,
          active: true,
          category: 'general_rule',
        })
      }

      // Add a client rule and an error correction
      memories.push({
        id: 'mem_royal',
        rule: 'Royal Hotel gets Bailey 500ml at 115',
        active: true,
        category: 'client_rule',
        structured: { clientName: 'Royal Hotel' },
      })
      memories.push({
        id: 'mem_err',
        rule: 'Never mix cash drawer with driver float',
        active: true,
        category: 'error_correction',
      })

      const sliced = sliceMemoriesForContext(memories, { queryText: 'Please create order for Royal Hotel' })

      expect(sliced.length).toBeLessThanOrEqual(20)
      expect(sliced.some((m) => m.id === 'mem_royal')).toBe(true)
      expect(sliced.some((m) => m.id === 'mem_err')).toBe(true)
    })
  })
})
