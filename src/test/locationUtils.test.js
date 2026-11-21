import { describe, it, expect } from 'vitest'
import {
  parseGoogleMapsLocation,
  buildGoogleMapsUrl,
  extractGoogleMapsUrl,
  isValidCoordinate,
  isValidMapLink,
  normalizeCoordinate,
} from '../utils/locationUtils'

describe('locationUtils', () => {
  it('parses lat/lng coordinates correctly', () => {
    const res = parseGoogleMapsLocation('22.3072, 73.1812')
    expect(res).not.toBeNull()
    expect(res.lat).toBeCloseTo(22.3072)
    expect(res.lng).toBeCloseTo(73.1812)
    expect(res.mapLink).toBe('https://www.google.com/maps?q=22.3072,73.1812')
  })

  it('parses Google Maps search URL with coords', () => {
    const res = parseGoogleMapsLocation('https://www.google.com/maps?q=22.3072,73.1812')
    expect(res).not.toBeNull()
    expect(res.lat).toBeCloseTo(22.3072)
    expect(res.lng).toBeCloseTo(73.1812)
    expect(res.mapLink).toContain('https://www.google.com/maps')

    // Test search URL with query and URL-encoded comma (%2C) as reported in feedback
    const resEncoded = parseGoogleMapsLocation(
      'https://www.google.com/maps/search/?api=1&query=22.307428896764883%2C73.1415809616383',
    )
    expect(resEncoded).not.toBeNull()
    expect(resEncoded.lat).toBeCloseTo(22.307428)
    expect(resEncoded.lng).toBeCloseTo(73.14158)
  })

  it('parses Google Maps short link without immediate coords', () => {
    const res = parseGoogleMapsLocation('https://maps.app.goo.gl/abcdef12345')
    expect(res).not.toBeNull()
    expect(res.mapLink).toBe('https://maps.app.goo.gl/abcdef12345')
  })

  it('parses geo: URI scheme', () => {
    const res = parseGoogleMapsLocation('geo:22.3072,73.1812')
    expect(res).not.toBeNull()
    expect(res.lat).toBeCloseTo(22.3072)
    expect(res.lng).toBeCloseTo(73.1812)
    expect(res.mapLink).toBe('https://www.google.com/maps?q=22.3072,73.1812')
  })

  it('parses embedded Google Maps link inside text message', () => {
    const res = parseGoogleMapsLocation(
      'Deliver 10 boxes here: https://maps.app.goo.gl/abcdef12345 please fast',
    )
    expect(res).not.toBeNull()
    expect(res.mapLink).toBe('https://maps.app.goo.gl/abcdef12345')
  })

  it('extractGoogleMapsUrl finds and normalizes URLs from text, shortlinks and geo URIs', () => {
    expect(extractGoogleMapsUrl('https://maps.app.goo.gl/abcdef12345')).toBe(
      'https://maps.app.goo.gl/abcdef12345',
    )
    expect(
      extractGoogleMapsUrl('Location: https://www.google.com/maps?q=22.3,73.18 (near shop)'),
    ).toBe('https://www.google.com/maps?q=22.3,73.18')
    expect(extractGoogleMapsUrl('geo:22.3072,73.1812')).toBe(
      'https://www.google.com/maps?q=22.3072,73.1812',
    )
    expect(extractGoogleMapsUrl('22.3072, 73.1812')).toBe(
      'https://www.google.com/maps?q=22.3072,73.1812',
    )
    expect(extractGoogleMapsUrl('Just a regular text message')).toBe('')
    expect(extractGoogleMapsUrl('')).toBe('')
  })

  it('builds Google Maps URL properly', () => {
    expect(buildGoogleMapsUrl(22.3072, 73.1812)).toBe('https://www.google.com/maps?q=22.3072,73.1812')
    expect(buildGoogleMapsUrl(null, null, 'Waghodia Road, Vadodara')).toContain('https://www.google.com/maps/search/?api=1&query=')
    // Rejects 0,0 and falls back to address
    expect(buildGoogleMapsUrl(0, 0, 'reva party plot')).toBe('https://www.google.com/maps/search/?api=1&query=reva%20party%20plot')
    expect(buildGoogleMapsUrl('0', '0', 'reva party plot')).toBe('https://www.google.com/maps/search/?api=1&query=reva%20party%20plot')
  })

  it('validates coordinates and map links to prevent 0,0 bugs', () => {
    expect(isValidCoordinate(0, 0)).toBe(false)
    expect(isValidCoordinate('0', '0')).toBe(false)
    expect(isValidCoordinate(null, null)).toBe(false)
    expect(isValidCoordinate('', '')).toBe(false)
    expect(isValidCoordinate(22.3, 73.1)).toBe(true)

    expect(isValidMapLink('https://www.google.com/maps/search/?api=1&query=0,0')).toBe(false)
    expect(isValidMapLink('https://www.google.com/maps?q=0,0')).toBe(false)
    expect(isValidMapLink('https://www.google.com/maps/search/?api=1&query=0.0,0.0')).toBe(false)
    expect(isValidMapLink('https://maps.app.goo.gl/abcdef12345')).toBe(true)
    expect(isValidMapLink('https://www.google.com/maps?q=22.3,73.1')).toBe(true)

    expect(normalizeCoordinate('')).toBeNull()
    expect(normalizeCoordinate(null)).toBeNull()
    expect(normalizeCoordinate(undefined)).toBeNull()
    expect(normalizeCoordinate(0)).toBeNull()
    expect(normalizeCoordinate('0')).toBeNull()
    expect(normalizeCoordinate('22.3072')).toBe(22.3072)
    expect(normalizeCoordinate(22.3072)).toBe(22.3072)
  })
})
