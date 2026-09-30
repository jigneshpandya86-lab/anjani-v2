import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getLeadPhone,
  normalizeIndianPhone,
  sendBackgroundSms,
  DEFAULT_MACRO_URL,
  buildInitialSmsMessage,
  buildFollowUpSmsMessage,
  getDueReminderContext,
  buildInitialSmsUpdate,
} from '../services/leadSmsService'

describe('leadSmsService', () => {
  describe('getLeadPhone', () => {
    it('extracts and normalizes phone from various field names', () => {
      expect(getLeadPhone({ mobile: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ phone: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ Mobile: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ Phone: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ contact: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ Contact: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ mobileNumber: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ mobileNo: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ number: '9925997750' })).toBe('9925997750')
      expect(getLeadPhone({ whatsapp: '9925997750' })).toBe('9925997750')
    })

    it('strips non-digits, country codes (+91, 91), and leading zeros', () => {
      expect(getLeadPhone({ mobile: '+91 99259 97750' })).toBe('9925997750')
      expect(getLeadPhone({ mobile: '09925997750' })).toBe('9925997750')
      expect(getLeadPhone({ mobile: '919925997750' })).toBe('9925997750')
      expect(getLeadPhone({ mobile: '99259-97750' })).toBe('9925997750')
      expect(getLeadPhone({ contact: 9925997750 })).toBe('9925997750')
    })

    it('returns empty string for missing or invalid numbers', () => {
      expect(getLeadPhone(null)).toBe('')
      expect(getLeadPhone({})).toBe('')
      expect(getLeadPhone({ mobile: '' })).toBe('')
      expect(getLeadPhone({ mobile: '12345' })).toBe('')
      expect(getLeadPhone({ mobile: 'invalid-text' })).toBe('')
    })
  })

  describe('normalizeIndianPhone', () => {
    it('prepends 91 to 10-digit number', () => {
      expect(normalizeIndianPhone('9925997750')).toBe('919925997750')
      expect(normalizeIndianPhone('+91 99259 97750')).toBe('919925997750')
      expect(normalizeIndianPhone('09925997750')).toBe('919925997750')
    })
  })

  describe('sendBackgroundSms', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('uses DEFAULT_MACRO_URL when macroUrl is empty or omitted', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      globalThis.fetch = mockFetch

      await sendBackgroundSms({
        macroUrl: '',
        phone: '9925997750',
        message: 'Hello test',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const calledUrl = mockFetch.mock.calls[0][0]
      expect(calledUrl.startsWith(DEFAULT_MACRO_URL)).toBe(true)
      expect(calledUrl).toContain(encodeURIComponent('919925997750@@@Hello test'))
    })

    it('throws when webhook fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
      globalThis.fetch = mockFetch

      await expect(
        sendBackgroundSms({
          macroUrl: '',
          phone: '9925997750',
          message: 'Hello test',
        })
      ).rejects.toThrow('Webhook failed with status 500')
    })
  })
})
