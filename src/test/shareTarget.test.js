import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractPhoneNumber,
  extractNameFromShare,
  parseShareTargetUrl,
  checkNumberCollisions,
} from '../utils/shareTargetUtils'

describe('shareTargetUtils', () => {
  describe('extractPhoneNumber', () => {
    it('extracts plain 10-digit Indian numbers', () => {
      expect(extractPhoneNumber('9825012345')).toBe('9825012345')
      expect(extractPhoneNumber('7984123456')).toBe('7984123456')
      expect(extractPhoneNumber('6351234567')).toBe('6351234567')
    })

    it('extracts numbers with country code (+91 or 91)', () => {
      expect(extractPhoneNumber('+919825012345')).toBe('9825012345')
      expect(extractPhoneNumber('+91 98250 12345')).toBe('9825012345')
      expect(extractPhoneNumber('+91-98250-12345')).toBe('9825012345')
      expect(extractPhoneNumber('919825012345')).toBe('9825012345')
    })

    it('extracts numbers with leading 0', () => {
      expect(extractPhoneNumber('09825012345')).toBe('9825012345')
      expect(extractPhoneNumber('0 98250 12345')).toBe('9825012345')
    })

    it('extracts numbers from tel: links', () => {
      expect(extractPhoneNumber('tel:9825012345')).toBe('9825012345')
      expect(extractPhoneNumber('tel:+919825012345')).toBe('9825012345')
    })

    it('extracts phone numbers embedded inside text or call log summaries', () => {
      expect(
        extractPhoneNumber('Incoming call from Ramesh Patel: +91 98250 12345 (duration 2m 15s)'),
      ).toBe('9825012345')
      expect(extractPhoneNumber('Sunil Shop - 99259 97750')).toBe('9925997750')
    })

    it('returns empty string for invalid numbers or text without phone', () => {
      expect(extractPhoneNumber('')).toBe('')
      expect(extractPhoneNumber('hello world')).toBe('')
      expect(extractPhoneNumber('12345')).toBe('')
      expect(extractPhoneNumber(null)).toBe('')
    })
  })

  describe('extractNameFromShare', () => {
    it('uses title when provided as contact name', () => {
      expect(
        extractNameFromShare({
          title: 'Dr. Rahul Vasava',
          text: '+91 98250 12345',
          phone: '9825012345',
        }),
      ).toBe('Dr. Rahul Vasava')
    })

    it('ignores title if title is just the phone number itself', () => {
      expect(
        extractNameFromShare({
          title: '+91 98250 12345',
          text: '+91 98250 12345',
          phone: '9825012345',
        }),
      ).toBe('')
    })

    it('extracts name from "Name: Phone" or "Name - Phone" in text', () => {
      expect(
        extractNameFromShare({
          title: '',
          text: 'Harshil Dairy: 98250 12345',
          phone: '9825012345',
        }),
      ).toBe('Harshil Dairy')

      expect(
        extractNameFromShare({
          title: '',
          text: 'Contact: Nilesh Patel, 9825012345',
          phone: '9825012345',
        }),
      ).toBe('Nilesh Patel')
    })
  })

  describe('parseShareTargetUrl', () => {
    it('parses standard Web Share Target GET query parameters', () => {
      const parsed = parseShareTargetUrl(
        '?share_text=%2B91+98250+12345&share_title=Sunil+Shop&share_url=',
      )
      expect(parsed).not.toBeNull()
      expect(parsed.phone).toBe('9825012345')
      expect(parsed.name).toBe('Sunil Shop')
      expect(parsed.isShareTarget).toBe(true)
    })

    it('supports alternative parameter names (text and title)', () => {
      const parsed = parseShareTargetUrl('?text=9825012345&title=Client+X')
      expect(parsed).not.toBeNull()
      expect(parsed.phone).toBe('9825012345')
      expect(parsed.name).toBe('Client X')
    })

    it('returns null if query string has no share parameters', () => {
      expect(parseShareTargetUrl('')).toBeNull()
      expect(parseShareTargetUrl('?tab=leads')).toBeNull()
      expect(parseShareTargetUrl(null)).toBeNull()
    })
  })

  describe('checkNumberCollisions', () => {
    const clients = [
      { id: 'c1', name: 'Dr. Rahul Vasava', businessName: 'Vasava Clinic', mobile: '9825012345' },
      { id: 'c2', name: 'Alka Restaurant', mobile: '9925997750' },
    ]
    const leads = [
      { id: 'l1', name: 'Pooja Mart', mobile: '9123456780', Tag: 'SMS_SENT' },
    ]

    it('detects existing client collision', () => {
      const result = checkNumberCollisions('9825012345', { clients, leads })
      expect(result.isClient).toBe(true)
      expect(result.client.name).toBe('Dr. Rahul Vasava')
      expect(result.isLead).toBe(false)
    })

    it('detects existing lead collision', () => {
      const result = checkNumberCollisions('9123456780', { clients, leads })
      expect(result.isClient).toBe(false)
      expect(result.isLead).toBe(true)
      expect(result.lead.name).toBe('Pooja Mart')
    })

    it('returns false for completely new number', () => {
      const result = checkNumberCollisions('9000000000', { clients, leads })
      expect(result.isClient).toBe(false)
      expect(result.isLead).toBe(false)
    })
  })
})
