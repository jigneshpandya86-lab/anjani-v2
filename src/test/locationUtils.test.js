import { describe, it, expect } from 'vitest'
import { parseGoogleMapsLocation, buildGoogleMapsUrl } from '../utils/locationUtils'

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
  })

  it('parses Google Maps short link without immediate coords', () => {
    const res = parseGoogleMapsLocation('https://maps.app.goo.gl/abcdef12345')
    expect(res).not.toBeNull()
    expect(res.mapLink).toBe('https://maps.app.goo.gl/abcdef12345')
  })

  it('builds Google Maps URL properly', () => {
    expect(buildGoogleMapsUrl(22.3072, 73.1812)).toBe('https://www.google.com/maps?q=22.3072,73.1812')
    expect(buildGoogleMapsUrl(null, null, 'Waghodia Road, Vadodara')).toContain('https://www.google.com/maps/search/?api=1&query=')
  })
})
