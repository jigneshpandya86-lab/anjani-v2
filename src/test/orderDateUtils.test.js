import { describe, it, expect } from 'vitest'
import { parseNaturalDate, normalizeTimeToHHmm, resolveOrderInitialData } from '../utils/orderUtils'

describe('parseNaturalDate helper (Strictly NO REGEX)', () => {
  const refDate = new Date('2026-11-21T12:00:00Z') // Saturday, 21 November 2026

  it('parses "Date 28 November" to 2026-11-28', () => {
    expect(parseNaturalDate('Date 28 November', refDate)).toBe('2026-11-28')
    expect(parseNaturalDate('28 November', refDate)).toBe('2026-11-28')
    expect(parseNaturalDate('28 Nov', refDate)).toBe('2026-11-28')
    expect(parseNaturalDate('28th Nov', refDate)).toBe('2026-11-28')
  })

  it('parses relative terms like "today", "tomorrow", "day after tomorrow"', () => {
    expect(parseNaturalDate('today', refDate)).toBe('2026-11-21')
    expect(parseNaturalDate('tomorrow', refDate)).toBe('2026-11-22')
    expect(parseNaturalDate('kal', refDate)).toBe('2026-11-22')
    expect(parseNaturalDate('day after tomorrow', refDate)).toBe('2026-11-23')
  })

  it('parses standard formats like YYYY-MM-DD and DD-MM-YYYY', () => {
    expect(parseNaturalDate('2026-11-28', refDate)).toBe('2026-11-28')
    expect(parseNaturalDate('28-11-2026', refDate)).toBe('2026-11-28')
    expect(parseNaturalDate('28/11/2026', refDate)).toBe('2026-11-28')
  })

  it('returns null for non-date inputs', () => {
    expect(parseNaturalDate('')).toBe(null)
    expect(parseNaturalDate(null)).toBe(null)
    expect(parseNaturalDate('hello world')).toBe(null)
    expect(parseNaturalDate('Dhwanit Banquet')).toBe(null)
  })
})

describe('normalizeTimeToHHmm helper (Strictly NO REGEX)', () => {
  it('parses time slot ranges to start time in HH:mm', () => {
    expect(normalizeTimeToHHmm('4:00 PM – 5:00 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('4:00 PM - 5:00 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('4 PM to 5 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('11 AM - 12 PM')).toBe('11:00')
    expect(normalizeTimeToHHmm('09:00 AM — 10:00 AM')).toBe('09:00')
  })

  it('parses 12-hour AM/PM formats correctly', () => {
    expect(normalizeTimeToHHmm('4:00 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('04:00 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('4:30 pm')).toBe('16:30')
    expect(normalizeTimeToHHmm('4 PM')).toBe('16:00')
    expect(normalizeTimeToHHmm('4pm')).toBe('16:00')
    expect(normalizeTimeToHHmm('11 AM')).toBe('11:00')
    expect(normalizeTimeToHHmm('9 AM')).toBe('09:00')
    expect(normalizeTimeToHHmm('1 PM')).toBe('13:00')
    expect(normalizeTimeToHHmm('12 PM')).toBe('12:00')
    expect(normalizeTimeToHHmm('12 AM')).toBe('00:00')
    expect(normalizeTimeToHHmm('2:30 PM')).toBe('14:30')
  })

  it('parses 24-hour and ISO formats correctly', () => {
    expect(normalizeTimeToHHmm('16:00')).toBe('16:00')
    expect(normalizeTimeToHHmm('16:00:00')).toBe('16:00')
    expect(normalizeTimeToHHmm('09:30')).toBe('09:30')
    expect(normalizeTimeToHHmm('2026-11-21T16:00:00.000Z')).toBeDefined()
  })

  it('parses Gujarati and colloquial time terms', () => {
    expect(normalizeTimeToHHmm('sanje')).toBe('16:00')
    expect(normalizeTimeToHHmm('savare')).toBe('09:00')
    expect(normalizeTimeToHHmm('bapore')).toBe('13:00')
    expect(normalizeTimeToHHmm('સાંજે')).toBe('16:00')
    expect(normalizeTimeToHHmm('સવારે')).toBe('09:00')
    expect(normalizeTimeToHHmm('બપોરે')).toBe('13:00')
    expect(normalizeTimeToHHmm('night')).toBe('20:00')
  })

  it('returns fallback for invalid or empty inputs', () => {
    expect(normalizeTimeToHHmm('', '11:00')).toBe('11:00')
    expect(normalizeTimeToHHmm(null, '11:00')).toBe('11:00')
    expect(normalizeTimeToHHmm(undefined, '11:00')).toBe('11:00')
    expect(normalizeTimeToHHmm('N/A', '11:00')).toBe('11:00')
  })
})

describe('resolveOrderInitialData with natural language time', () => {
  it('converts preferred time slot "4:00 PM – 5:00 PM" into HH:mm "16:00"', () => {
    const data = resolveOrderInitialData({
      clientId: 'c1',
      deliveryTime: '4:00 PM – 5:00 PM',
      deliveryDate: '2026-11-21',
    })
    expect(data.time).toBe('16:00')
    expect(data.deliveryTime).toBe('4:00 PM – 5:00 PM')
  })

  it('converts "11 AM" and "4 PM" into "11:00" and "16:00"', () => {
    const data1 = resolveOrderInitialData({ time: '11 AM' })
    expect(data1.time).toBe('11:00')

    const data2 = resolveOrderInitialData({ time: '4 PM' })
    expect(data2.time).toBe('16:00')
  })

  it('handles preferredTime property gracefully', () => {
    const data = resolveOrderInitialData({ preferredTime: '4:00 PM – 5:00 PM' })
    expect(data.time).toBe('16:00')
  })
})
