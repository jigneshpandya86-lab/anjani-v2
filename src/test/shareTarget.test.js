import { describe, it, expect } from 'vitest'
import {
  extractPhoneNumber,
  extractNameFromShare,
  parseShareTargetUrl,
  checkNumberCollisions,
  getLatestSharedRecord,
  saveSharedRecord,
  SHARE_DB_NAME,
  SHARE_STORE_NAME,
  SHARE_RECORD_KEY,
} from '../utils/shareTargetUtils'
import { processAiBillImage } from '../utils/aiImageHelper'

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
      expect(parsed.hasMapLink).toBe(false)
      expect(parsed.mapLink).toBe('')
    })

    it('supports alternative parameter names (text and title) for leads', () => {
      const parsed = parseShareTargetUrl('?text=9825012345&title=Client+X')
      expect(parsed).not.toBeNull()
      expect(parsed.phone).toBe('9825012345')
      expect(parsed.name).toBe('Client X')
      expect(parsed.hasMapLink).toBe(false)
    })

    it('extracts Google Maps shortlink from share_url for New Order', () => {
      const parsed = parseShareTargetUrl(
        '?share_url=https://maps.app.goo.gl/abcdef12345&share_title=Store+Location',
      )
      expect(parsed).not.toBeNull()
      expect(parsed.hasMapLink).toBe(true)
      expect(parsed.mapLink).toBe('https://maps.app.goo.gl/abcdef12345')
      expect(parsed.name).toBe('Store Location')
    })

    it('extracts Google Maps URL with lat/lng coordinates', () => {
      const parsed = parseShareTargetUrl(
        '?share_url=https://www.google.com/maps?q=22.3072,73.1812',
      )
      expect(parsed).not.toBeNull()
      expect(parsed.hasMapLink).toBe(true)
      expect(parsed.mapLink).toBe('https://www.google.com/maps?q=22.3072,73.1812')
      expect(parsed.locationLat).toBeCloseTo(22.3072)
      expect(parsed.locationLng).toBeCloseTo(73.1812)
    })

    it('handles mixed share text containing both client phone and map link', () => {
      const parsed = parseShareTargetUrl(
        '?share_text=Deliver+to+Ramesh+9825012345+at+https://maps.app.goo.gl/xyz123',
      )
      expect(parsed).not.toBeNull()
      expect(parsed.phone).toBe('9825012345')
      expect(parsed.hasMapLink).toBe(true)
      expect(parsed.mapLink).toBe('https://maps.app.goo.gl/xyz123')
    })

    it('handles geo: scheme query param', () => {
      const parsed = parseShareTargetUrl('?mapLink=geo:22.3072,73.1812')
      expect(parsed).not.toBeNull()
      expect(parsed.hasMapLink).toBe(true)
      expect(parsed.mapLink).toBe('https://www.google.com/maps?q=22.3072,73.1812')
      expect(parsed.locationLat).toBeCloseTo(22.3072)
      expect(parsed.locationLng).toBeCloseTo(73.1812)
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

  describe('Web Share Target Level 2 (POST files & GPay receipts)', () => {
    it('defines share target IndexedDB constants properly', () => {
      expect(SHARE_DB_NAME).toBe('anjani-share-store')
      expect(SHARE_STORE_NAME).toBe('shared-items')
      expect(SHARE_RECORD_KEY).toBe('latest-share')
    })

    it('processes PDF receipts cleanly via processAiBillImage', async () => {
      const mockPdf = new File(['%PDF-1.4 mock content'], 'gpay_receipt.pdf', {
        type: 'application/pdf',
      })
      const result = await processAiBillImage(mockPdf)
      expect(result.mimeType).toBe('application/pdf')
      expect(result.fileName).toBe('gpay_receipt.pdf')
      expect(result.isAudio).toBe(false)
      expect(typeof result.base64).toBe('string')
    })

    it('stores and retrieves shared records in IndexedDB', async () => {
      // Mock indexedDB if not present in jsdom
      const storeMap = new Map()
      const mockDb = {
        transaction: () => ({
          objectStore: () => ({
            put: (data, key) => {
              storeMap.set(key, data)
              const req = { onsuccess: null, onerror: null }
              setTimeout(() => req.onsuccess && req.onsuccess({ target: { result: key } }), 0)
              return req
            },
            get: (key) => {
              const val = storeMap.get(key)
              const req = { onsuccess: null, onerror: null, result: val }
              setTimeout(() => req.onsuccess && req.onsuccess({ target: { result: val } }), 0)
              return req
            },
            delete: (key) => {
              storeMap.delete(key)
              const req = { onsuccess: null, onerror: null }
              setTimeout(() => req.onsuccess && req.onsuccess({ target: { result: true } }), 0)
              return req
            },
          }),
        }),
      }

      const origIndexedDb = globalThis.indexedDB
      globalThis.indexedDB = {
        open: () => {
          const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: mockDb }
          setTimeout(() => req.onsuccess && req.onsuccess({ target: { result: mockDb } }), 0)
          return req
        },
      }

      try {
        const testFile = new File(['image-bytes'], 'gpay_receipt_1300.jpg', { type: 'image/jpeg' })
        const record = {
          hasFile: true,
          file: testFile,
          fileName: 'gpay_receipt_1300.jpg',
          fileType: 'image/jpeg',
          text: 'Payment of ₹1,300 received via GPay',
          title: 'Google Pay Receipt',
          timestamp: Date.now(),
        }

        const saved = await saveSharedRecord(record)
        expect(saved).toBe(true)

        const retrieved = await getLatestSharedRecord()
        expect(retrieved).not.toBeNull()
        expect(retrieved.hasFile).toBe(true)
        expect(retrieved.fileName).toBe('gpay_receipt_1300.jpg')
        expect(retrieved.text).toBe('Payment of ₹1,300 received via GPay')

        // Second retrieval returns null because it was consumed and deleted
        const secondRetrieved = await getLatestSharedRecord()
        expect(secondRetrieved).toBeNull()
      } finally {
        globalThis.indexedDB = origIndexedDb
      }
    })
  })
})
