import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchVadodaraLandmarks,
  fetchPhotonSuggestions,
  calculateDistanceKm,
  isWithinVadodara50Km,
  VADODARA_LANDMARKS,
  VADODARA_COORDINATES,
  MAX_DELIVERY_RADIUS_KM,
  VADODARA_50KM_BOUNDS,
} from '../utils/vadodaraLandmarks'

describe('vadodaraLandmarks utility (50 km restriction)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates geographic distance accurately and checks 50km boundary', () => {
    // Vadodara center to Alkapuri (~0.7 km)
    const dAlkapuri = calculateDistanceKm(22.3102, 73.1757)
    expect(dAlkapuri).toBeLessThan(2.0)
    expect(isWithinVadodara50Km(22.3102, 73.1757)).toBe(true)

    // Padra (~13 km)
    const dPadra = calculateDistanceKm(22.24, 73.08)
    expect(dPadra).toBeGreaterThan(10.0)
    expect(dPadra).toBeLessThan(16.0)
    expect(isWithinVadodara50Km(22.24, 73.08)).toBe(true)

    // Halol (~36 km)
    const dHalol = calculateDistanceKm(22.5, 73.47)
    expect(dHalol).toBeGreaterThan(30.0)
    expect(dHalol).toBeLessThan(45.0)
    expect(isWithinVadodara50Km(22.5, 73.47)).toBe(true)

    // Ahmedabad (~101 km) - must be rejected
    const dAhmedabad = calculateDistanceKm(23.02, 72.57)
    expect(dAhmedabad).toBeGreaterThan(90.0)
    expect(isWithinVadodara50Km(23.02, 72.57)).toBe(false)

    // Surat (~131 km) - must be rejected
    const dSurat = calculateDistanceKm(21.17, 72.83)
    expect(dSurat).toBeGreaterThan(120.0)
    expect(isWithinVadodara50Km(21.17, 72.83)).toBe(false)
  })

  it('all curated landmarks are strictly within 50 km of Vadodara center', () => {
    expect(VADODARA_LANDMARKS.length).toBeGreaterThan(40)
    for (let i = 0; i < VADODARA_LANDMARKS.length; i++) {
      const item = VADODARA_LANDMARKS[i]
      const dist = calculateDistanceKm(item.lat, item.lng)
      expect(dist).toBeLessThanOrEqual(MAX_DELIVERY_RADIUS_KM)
    }
  })

  it('returns empty array when query is empty, short, or not a string', () => {
    expect(searchVadodaraLandmarks('')).toEqual([])
    expect(searchVadodaraLandmarks('a')).toEqual([])
    expect(searchVadodaraLandmarks(null)).toEqual([])
    expect(searchVadodaraLandmarks(undefined)).toEqual([])
  })

  it('matches landmarks and includes distance in kilometers', () => {
    const results = searchVadodaraLandmarks('alkapuri', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].label).toContain('Alkapuri')
    expect(results[0].lat).toBeCloseTo(22.3102)
    expect(results[0].lng).toBeCloseTo(73.1757)
    expect(results[0].distanceKm).toBeLessThan(2.0)
    expect(results[0].mapLink).toBe('https://www.google.com/maps?q=22.3102,73.1757')
    expect(results[0].source).toBe('landmark')
  })

  it('matches surrounding towns and GIDCs within 50 km', () => {
    const halolResults = searchVadodaraLandmarks('halol', 5)
    expect(halolResults.length).toBeGreaterThan(0)
    expect(halolResults[0].distanceKm).toBeLessThan(50.0)

    const karjanResults = searchVadodaraLandmarks('karjan', 5)
    expect(karjanResults.length).toBeGreaterThan(0)
    expect(karjanResults[0].distanceKm).toBeLessThan(50.0)
  })

  it('matches party plots including Reva Party Plot from user feedback', () => {
    const revaResults = searchVadodaraLandmarks('Reva p', 5)
    expect(revaResults.length).toBeGreaterThan(0)
    expect(revaResults[0].label).toContain('Reva Party Plot')
    expect(revaResults[0].lat).toBeCloseTo(22.2573)
    expect(revaResults[0].lng).toBeCloseTo(73.2168)
    expect(revaResults[0].distanceKm).toBeLessThan(10.0)
    expect(revaResults[0].label).toContain('Tarsali')
    expect(revaResults[0].resolvedAddress).toContain('Tarsali')

    const pgResults = searchVadodaraLandmarks('PG Party', 5)
    expect(pgResults.length).toBeGreaterThan(0)
    expect(pgResults[0].label).toContain('PG Party Plot')

    const balajiResults = searchVadodaraLandmarks('Balaji Party', 5)
    expect(balajiResults.length).toBeGreaterThan(0)
    expect(balajiResults[0].label).toContain('Balaji Party Plot')
  })

  it('fetches and filters Photon suggestions, dropping any outside 50 km', async () => {
    const mockResponse = {
      features: [
        {
          properties: {
            osm_id: 101,
            name: 'Akota Garden',
            street: 'Akota Stadium Rd',
            district: 'Akota',
            city: 'Vadodara',
          },
          geometry: {
            coordinates: [73.1706, 22.2961], // ~1.5 km
          },
        },
        {
          properties: {
            osm_id: 999,
            name: 'Faraway Place',
            street: 'High Road',
            city: 'Ahmedabad',
          },
          geometry: {
            coordinates: [72.57, 23.02], // ~101 km (OUTSIDE 50 km)
          },
        },
      ],
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })
    globalThis.fetch = mockFetch

    const results = await fetchPhotonSuggestions('Akota', 5, 1000)

    // Should only include the within-50km result (Akota Garden)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe('osm-101')
    expect(results[0].label).toContain('Akota Garden')
    expect(results[0].distanceKm).toBeLessThan(5.0)
  })

  it('handles fetch failure or non-ok status gracefully in fetchPhotonSuggestions', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const results = await fetchPhotonSuggestions('Sayajigunj', 5, 500)
    expect(results).toEqual([])
  })
})
