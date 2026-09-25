import { describe, it, expect } from 'vitest'
import {
  normalizeOrderWriteData,
  normalizeOrderDoc,
  resolveOrderInitialData,
  formatNarrationDate,
  formatPaymentNarration,
} from '../utils/orderUtils'

describe('Order address normalization and update preservation', () => {
  it('preserves undefined address and location when isUpdate is true (does not wipe)', () => {
    const partialUpdate = { status: 'Confirmed' }
    const normalized = normalizeOrderWriteData(partialUpdate, true)

    expect(normalized.status).toBe('Confirmed')
    expect(normalized.address).toBeUndefined()
    expect(normalized.location).toBeUndefined()
    expect(normalized.mapLink).toBeUndefined()
    expect(normalized.locationLat).toBeUndefined()
    expect(normalized.locationLng).toBeUndefined()
  })

  it('normalizes address and location when explicitly provided in isUpdate mode', () => {
    const updateWithAddress = {
      address: '  12, GIDC Industrial Estate, Makarpura  ',
      location: '  Makarpura GIDC  ',
      mapLink: 'https://maps.google.com/?q=22.3,73.1',
      locationLat: 22.3,
      locationLng: 73.1,
    }
    const normalized = normalizeOrderWriteData(updateWithAddress, true)

    expect(normalized.address).toBe('12, GIDC Industrial Estate, Makarpura')
    expect(normalized.location).toBe('Makarpura GIDC')
    expect(normalized.mapLink).toBe('https://maps.google.com/?q=22.3,73.1')
    expect(normalized.locationLat).toBe(22.3)
    expect(normalized.locationLng).toBe(73.1)
  })

  it('defaults address and location to empty strings when creating new orders (isUpdate = false)', () => {
    const newOrderData = { clientId: 'client-1' }
    const normalized = normalizeOrderWriteData(newOrderData, false)

    expect(normalized.address).toBe('')
    expect(normalized.location).toBe('')
    expect(normalized.mapLink).toBe('')
    expect(normalized.locationLat).toBeNull()
    expect(normalized.locationLng).toBeNull()
  })

  it('normalizes raw order doc falling back to location when address is absent', () => {
    const rawDocWithOnlyLocation = {
      id: 'ord-123',
      location: 'Near Old Padra Road, Vadodara',
    }
    const normalized = normalizeOrderDoc(rawDocWithOnlyLocation)

    expect(normalized.address).toBe('Near Old Padra Road, Vadodara')
    expect(normalized.location).toBe('Near Old Padra Road, Vadodara')
  })

  it('preserves explicit address in normalizeOrderDoc even when location differs', () => {
    const rawDocWithBoth = {
      id: 'ord-456',
      address: 'Shop 4, Ground Floor, Gotri Plaza',
      location: 'Gotri Road',
    }
    const normalized = normalizeOrderDoc(rawDocWithBoth)

    expect(normalized.address).toBe('Shop 4, Ground Floor, Gotri Plaza')
    expect(normalized.location).toBe('Gotri Road')
  })
})

describe('resolveOrderInitialData', () => {
  const mockClients = [
    {
      id: 'client-101',
      name: 'Shreeji Mart',
      address: 'Near Old Padra Road, Vadodara',
      location: 'Old Padra Road',
      mapLink: 'https://maps.google.com/?q=22.3,73.18',
      locationLat: 22.3,
      locationLng: 73.18,
    },
    {
      id: 'client-102',
      name: 'Baroda Tea Stall',
      address: '',
      location: 'Karelibaug Char Rasta',
    },
  ]

  it('returns clean empty template for new orders', () => {
    const initial = resolveOrderInitialData({}, mockClients)
    expect(initial.clientId).toBe('')
    expect(initial.address).toBe('')
    expect(initial.location).toBe('')
  })

  it('resolves address from client master when order itself lacks explicit address', () => {
    const orderWithoutAddress = {
      id: 'ord-789',
      clientId: 'client-101',
      date: '2026-09-24',
      time: '14:30',
    }
    const initial = resolveOrderInitialData(orderWithoutAddress, mockClients)

    expect(initial.clientId).toBe('client-101')
    expect(initial.address).toBe('Near Old Padra Road, Vadodara')
    expect(initial.location).toBe('Old Padra Road')
    expect(initial.mapLink).toBe('https://maps.google.com/?q=22.3,73.18')
    expect(initial.locationLat).toBe(22.3)
    expect(initial.locationLng).toBe(73.18)
  })

  it('preserves order-specific delivery address override over client master', () => {
    const orderWithCustomAddress = {
      id: 'ord-999',
      clientId: 'client-101',
      address: 'Special Site Delivery: Godown 4, Halol Highway',
    }
    const initial = resolveOrderInitialData(orderWithCustomAddress, mockClients)

    expect(initial.address).toBe('Special Site Delivery: Godown 4, Halol Highway')
  })

  it('falls back to client location when client address is empty string', () => {
    const orderForClient102 = {
      id: 'ord-102',
      clientId: 'client-102',
    }
    const initial = resolveOrderInitialData(orderForClient102, mockClients)

    expect(initial.address).toBe('Karelibaug Char Rasta')
    expect(initial.location).toBe('Karelibaug Char Rasta')
  })
})

describe('Payment narration formatting', () => {
  it('formats dates consistently to DD/MM/YYYY', () => {
    // Standard JS Date (months are 0-indexed: 8 is September)
    const d = new Date(2026, 8, 25)
    expect(formatNarrationDate(d)).toBe('25/09/2026')

    // String YYYY-MM-DD
    expect(formatNarrationDate('2026-09-25')).toBe('25/09/2026')

    // Firestore timestamp mock with toDate()
    const firestoreTimestamp = {
      toDate: () => new Date(2026, 8, 25),
    }
    expect(formatNarrationDate(firestoreTimestamp)).toBe('25/09/2026')

    // Firestore timestamp mock with seconds
    const unixSeconds = Math.floor(new Date(2026, 8, 25, 12, 0, 0).getTime() / 1000)
    expect(formatNarrationDate({ seconds: unixSeconds })).toBe('25/09/2026')

    // Null or empty
    expect(formatNarrationDate(null)).toBe('')
    expect(formatNarrationDate(undefined)).toBe('')
  })

  it('formats payment narration as: Payment received for "client Name" on Date', () => {
    const d = new Date(2026, 8, 25)
    expect(formatPaymentNarration('Shree Ram Hotel', d)).toBe(
      'Payment received for "Shree Ram Hotel" on 25/09/2026',
    )
  })

  it('trims whitespace and handles missing or empty client names cleanly', () => {
    const d = new Date(2026, 8, 25)
    expect(formatPaymentNarration('  Nilesh Collection  ', d)).toBe(
      'Payment received for "Nilesh Collection" on 25/09/2026',
    )
    expect(formatPaymentNarration('', d)).toBe('Payment received on 25/09/2026')
    expect(formatPaymentNarration(null, d)).toBe('Payment received on 25/09/2026')
  })
})

