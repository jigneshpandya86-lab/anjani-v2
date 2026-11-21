import { describe, it, expect } from 'vitest'
import { parseNaturalDate } from '../utils/orderUtils'

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
