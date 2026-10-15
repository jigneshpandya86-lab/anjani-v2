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
  buildLeadWhatsAppMessage,
  sendCashHandoverTransferSms,
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

    it('scans arbitrary fields for 10-digit Indian numbers and ignores date/timestamp fields', () => {
      expect(getLeadPhone({ notes: 'Please call Ravi at 9825012345 after 5pm' })).toBe('9825012345')
      expect(getLeadPhone({ Phone_No: '+91 9712345678' })).toBe('9712345678')
      expect(getLeadPhone({ createdAt: '2026-09-30T14:40:11.000Z', notes: 'No number here' })).toBe('')
      expect(getLeadPhone({ timestamp: 1727707211000 })).toBe('')
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

  describe('buildLeadWhatsAppMessage', () => {
    it('creates shortened retail-focused message mentioning owner of Anjani Water, Bailey and Bisleri', () => {
      const msg = buildLeadWhatsAppMessage({ name: 'Rahul Patel' })

      expect(msg).toContain('Hello Rahul Patel! 👋')
      expect(msg).toContain('owner of *Anjani Water*')
      expect(msg).toContain('Bailey')
      expect(msg).toContain('Bisleri')
      expect(msg).toContain('Marriages & Family Events')
      expect(msg).toContain('Customer Branding')
      expect(msg).toContain('Retail & Daily Supply')
    })

    it('handles lead without name or generic names cleanly', () => {
      const msgNoName = buildLeadWhatsAppMessage({})
      expect(msgNoName).toContain('Hello! 👋')
      expect(msgNoName).toContain('owner of *Anjani Water*')

      const msgGeneric = buildLeadWhatsAppMessage({ name: 'Call Lead' })
      expect(msgGeneric).toContain('Hello! 👋')
    })
  })

  describe('sendCashHandoverTransferSms', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('formats and dispatches debit SMS when staff hands over cash to bank/counter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      globalThis.fetch = mockFetch

      const result = await sendCashHandoverTransferSms({
        transferDoc: {
          fromAccountId: 'nilesh',
          toAccountId: 'bank',
          amount: 2100,
          date: '2026-10-14T12:00:00',
        },
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const calledUrl = decodeURIComponent(mockFetch.mock.calls[0][0])
      expect(calledUrl).toContain('phone=917990943652')
      expect(calledUrl).toContain('mobile=7990943652')
      expect(calledUrl).toContain('Hi Nilesh, Rs. 2,100 DEBITED from cash custody')
      expect(calledUrl).toContain('Handed over to Bank on 14-Oct.')
      expect(calledUrl).not.toContain('₹') // Verify no non-ASCII ₹ currency sign
      expect(result.phone).toBe('7990943652')
      expect(result.staffMember.name).toBe('Nilesh')
    })

    it('formats and dispatches credit SMS when counter gives cash to staff custody', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
      globalThis.fetch = mockFetch

      const result = await sendCashHandoverTransferSms({
        transferDoc: {
          fromAccountId: 'counter',
          toAccountId: 'nilesh',
          amount: 1500,
          date: '2026-10-14T12:00:00',
        },
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const calledUrl = decodeURIComponent(mockFetch.mock.calls[0][0])
      expect(calledUrl).toContain('phone=917990943652')
      expect(calledUrl).toContain('Hi Nilesh, Rs. 1,500 CREDITED to cash custody')
      expect(calledUrl).toContain('Received from Counter Cash on 14-Oct.')
      expect(result.staffMember.name).toBe('Nilesh')
    })

    it('throws error when neither source nor destination is a custody account', async () => {
      await expect(
        sendCashHandoverTransferSms({
          transferDoc: {
            fromAccountId: 'counter',
            toAccountId: 'bank',
            amount: 5000,
          },
        })
      ).rejects.toThrow('This transfer does not involve a staff custody account')
    })
  })
})
