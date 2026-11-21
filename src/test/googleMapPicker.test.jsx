import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GoogleMapPicker from '../components/GoogleMapPicker'

describe('GoogleMapPicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.head.innerHTML = ''
    delete window.google
    delete window.__googleMapsAuthFailed
    delete window.__gmAuthHooked
  })

  it('renders input field with initial address and GPS button', () => {
    render(<GoogleMapPicker initialAddress="Alkapuri, Vadodara" onChange={vi.fn()} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('Alkapuri, Vadodara')

    const gpsBtn = screen.getByTitle(/detect and use current device gps location/i)
    expect(gpsBtn).toBeInTheDocument()
  })

  it('calls onChange with raw text when user types a location', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.change(input, { target: { value: 'Gotri Road' } })

    expect(handleChange).toHaveBeenCalledWith({
      lat: null,
      lng: null,
      address: 'Gotri Road',
      mapLink: null,
    })
  })

  it('automatically parses coordinates when pasted into input', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.change(input, { target: { value: '22.3072, 73.1812' } })

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: expect.closeTo(22.3072),
        lng: expect.closeTo(73.1812),
        address: '22.3072, 73.1812',
        mapLink: 'https://www.google.com/maps?q=22.3072,73.1812',
      }),
    )
  })

  it('automatically parses Google Maps URLs when pasted into input', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.change(input, {
      target: { value: 'https://maps.app.goo.gl/abcdef12345' },
    })

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'https://maps.app.goo.gl/abcdef12345',
        mapLink: 'https://maps.app.goo.gl/abcdef12345',
      }),
    )
  })

  it('uses device GPS when GPS button is clicked', async () => {
    const handleChange = vi.fn()
    const mockGetCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 22.312345,
          longitude: 73.189012,
        },
      })
    })

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const gpsBtn = screen.getByTitle(/detect and use current device gps location/i)
    fireEvent.click(gpsBtn)

    await waitFor(() => {
      expect(mockGetCurrentPosition).toHaveBeenCalled()
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 22.312345,
          lng: 73.189012,
          mapLink: 'https://www.google.com/maps?q=22.312345,73.189012',
        }),
      )
    })
  })

  it('displays instant curated Vadodara landmark suggestions and selects one with coordinates', async () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Alkapuri' } })

    // Instant local landmark matching should display Alkapuri
    await waitFor(() => {
      expect(screen.getByText(/Alkapuri, Vadodara, Gujarat/i)).toBeInTheDocument()
    })

    // Click prediction item
    const itemBtn = screen.getByText(/Alkapuri, Vadodara, Gujarat/i).closest('button')
    fireEvent.mouseDown(itemBtn)

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 22.3102,
          lng: 73.1757,
          address: 'Alkapuri, Vadodara, Gujarat',
          mapLink: 'https://www.google.com/maps?q=22.3102,73.1757',
        }),
      )
    })
  })

  it('never hangs when Google Maps silently drops autocomplete callbacks (RefererNotAllowedMapError)', async () => {
    // Simulate Google Maps AutocompleteService that never calls back (hung/blocked API)
    const mockHungGetPlacePredictions = vi.fn((_req, _cb) => {
      // Intentionally never call _cb to simulate RefererNotAllowedMapError silent failure
    })

    window.google = {
      maps: {
        places: {
          AutocompleteService: vi.fn(() => ({
            getPlacePredictions: mockHungGetPlacePredictions,
          })),
          PlacesServiceStatus: { OK: 'OK' },
        },
      },
    }

    render(<GoogleMapPicker initialAddress="" onChange={vi.fn()} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Karelibaug' } })

    // Local matches show immediately and UI does not stay frozen
    await waitFor(() => {
      expect(screen.getByText(/Karelibaug, Vadodara, Gujarat/i)).toBeInTheDocument()
    })

    // Advance timers / wait for race resolution
    await waitFor(
      () => {
        expect(screen.queryByText(/Searching places in Vadodara\.\.\./i)).not.toBeInTheDocument()
      },
      { timeout: 3500 },
    )
  })

  it('falls back to classic AutocompleteService when AutocompleteSuggestion is not enabled', async () => {
    const mockGetPlacePredictions = vi.fn((_req, cb) => {
      cb(
        [
          {
            place_id: 'place_123',
            description: 'P G Party Plot, Harni, Vadodara',
          },
        ],
        'OK',
      )
    })

    window.google = {
      maps: {
        places: {
          AutocompleteService: vi.fn(() => ({
            getPlacePredictions: mockGetPlacePredictions,
          })),
          PlacesServiceStatus: { OK: 'OK' },
        },
      },
    }

    render(<GoogleMapPicker initialAddress="" onChange={vi.fn()} />)

    const input = screen.getByPlaceholderText(/search landmark, coords/i)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'P G Party Plot' } })

    await waitFor(() => {
      expect(screen.getByText(/P G Party Plot, Harni, Vadodara/i)).toBeInTheDocument()
    })
  })
})
