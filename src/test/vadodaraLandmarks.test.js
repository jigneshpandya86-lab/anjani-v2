import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchVadodaraLandmarks,
  fetchPhotonSuggestions,
  VADODARA_LANDMARKS,
  VADODARA_COORDINATES,
} from '../utils/vadodaraLandmarks'

describe('vadodaraLandmarks utility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('contains comprehensive Vadodara landmark list with valid coordinates', () => {
    expect(VADODARA_LANDMARKS.length).toBeGreaterThan(30)
    for (let i = 0; i < VADODARA_LANDMARKS.length; i++) {
      const item = VADODARA_LANDMARKS[i]
      expect(item.name).toBeTruthy()
      expect(item.lat).toBeGreaterThan(22.0)
      expect(item.lat).toBeLessThan(23.0)
      expect(item.lng).toBeGreaterThan(72.5)
      expect(item.lng).toBeLessThan(74.0)
      expect(item.address).toBeTruthy()
    }
  })

  it('returns empty array when query is empty, short, or not a string', () => {
    expect(searchVadodaraLandmarks('')).toEqual([])
    expect(searchVadodaraLandmarks('a')).toEqual([])
    expect(searchVadodaraLandmarks(null)).toEqual([])
    expect(searchVadodaraLandmarks(undefined)).toEqual([])
  })

  it('matches landmarks case-insensitively and prioritizes startsWith matches', () => {
    const results = searchVadodaraLandmarks('alkapuri', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].label).toContain('Alkapuri')
    expect(results[0].lat).toBeCloseTo(22.3102)
    expect(results[0].lng).toBeCloseTo(73.1757)
    expect(results[0].mapLink).toBe('https://www.google.com/maps?q=22.3102,73.1757')
    expect(results[0].source).toBe('landmark')
  })

  it('matches landmarks by area or address', () => {
    const results = searchVadodaraLandmarks('GIDC', 5)
    expect(results.length).toBeGreaterThan(0)
    const hasGidc = results.some((r) => r.label.toLowerCase().includes('gidc'))
    expect(hasGidc).toBe(true)
  })

  it('fetches and maps Photon suggestions cleanly', async () => {
    const mockResponse = {
      features: [
        {
          properties: {
            osm_id: 12345,
            name: 'Akota Garden',
            street: 'Akota Stadium Rd',
            district: 'Akota',
            city: 'Vadodara',
          },
          geometry: {
            coordinates: [73.1706, 22.2961],
          },
        },
      ],
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    })
    globalThis.fetch = mockFetch

    const results = await fetchPhotonSuggestions('Akota Garden', 5, 1000)

    expect(results.length).toBe(1)
    expect(results[0].id).toBe('osm-12345')
    expect(results[0].label).toContain('Akota Garden')
    expect(results[0].lat).toBeCloseTo(22.2961)
    expect(results[0].lng).toBeCloseTo(73.1706)
    expect(results[0].source).toBe('osm')
  })

  it('handles fetch failure or non-ok status gracefully in fetchPhotonSuggestions', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    const results = await fetchPhotonSuggestions('Sayajigunj', 5, 500)
    expect(results).toEqual([])
  })
})
