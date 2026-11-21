import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GoogleMapPicker from '../components/GoogleMapPicker'

describe('GoogleMapPicker Component (Vadodara + 50 km restriction)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.head.innerHTML = ''
    delete window.google
    delete window.__googleMapsAuthFailed
    delete window.__gmAuthHooked
  })

  it('renders input field with initial address and GPS button', () => {
    render(<GoogleMapPicker initialAddress="Alkapuri, Vadodara" onChange={vi.fn()} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('Alkapuri, Vadodara')

    const gpsBtn = screen.getByTitle('Detect and use current device GPS location')
    expect(gpsBtn).toBeInTheDocument()
  })

  it('calls onChange with raw text when user types a location', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    fireEvent.change(input, { target: { value: 'Gotri Road' } })

    expect(handleChange).toHaveBeenCalledWith({
      lat: null,
      lng: null,
      address: 'Gotri Road',
      mapLink: null,
    })
  })

  it('automatically parses coordinates when pasted within 50 km', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
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

  it('warns when pasted coordinates exceed 50 km boundary', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    // Ahmedabad coordinates (~101 km away)
    fireEvent.change(input, { target: { value: '23.0225, 72.5714' } })

    expect(
      screen.getByText((content) =>
        content.toLowerCase().includes('outside 50 km vadodara limit'),
      ),
    ).toBeInTheDocument()
  })

  it('automatically parses Google Maps URLs when pasted into input', () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
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

  it('uses device GPS when within 50 km', async () => {
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

    const gpsBtn = screen.getByTitle('Detect and use current device GPS location')
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

  it('blocks GPS selection when device is outside 50 km', async () => {
    const handleChange = vi.fn()
    const mockGetCurrentPosition = vi.fn((success) => {
      success({
        coords: {
          latitude: 23.0225, // Ahmedabad (~101 km)
          longitude: 72.5714,
        },
      })
    })

    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const gpsBtn = screen.getByTitle('Detect and use current device GPS location')
    fireEvent.click(gpsBtn)

    await waitFor(() => {
      expect(mockGetCurrentPosition).toHaveBeenCalled()
      expect(handleChange).not.toHaveBeenCalled()
      expect(
        screen.getByText((content) =>
          content.toLowerCase().includes('exceeds 50 km limit'),
        ),
      ).toBeInTheDocument()
    })
  })

  it('displays instant curated Vadodara landmark suggestions and selects one within 50 km', async () => {
    const handleChange = vi.fn()
    render(<GoogleMapPicker initialAddress="" onChange={handleChange} />)

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Halol' } })

    // Instant local landmark matching should display Halol
    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes('Halol, Panchmahal')),
      ).toBeInTheDocument()
    })

    // Click prediction item
    const itemBtn = screen
      .getByText((content) => content.includes('Halol, Panchmahal'))
      .closest('button')
    fireEvent.mouseDown(itemBtn)

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 22.5,
          lng: 73.47,
          address: 'Halol, Panchmahal / Vadodara Road, Gujarat',
          mapLink: 'https://www.google.com/maps?q=22.5,73.47',
        }),
      )
    })
  })

  it('never hangs when Google Maps silently drops autocomplete callbacks', async () => {
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

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Karelibaug' } })

    // Local matches show immediately and UI does not stay frozen
    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes('Karelibaug, Vadodara')),
      ).toBeInTheDocument()
    })

    // Advance timers / wait for race resolution
    await waitFor(
      () => {
        expect(
          screen.queryByText((content) =>
            content.includes('Searching places within 50 km of Vadodara'),
          ),
        ).not.toBeInTheDocument()
      },
      { timeout: 3500 },
    )
  })

  it('falls back to classic AutocompleteService with 50 km bounds', async () => {
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

    const input = screen.getByPlaceholderText(
      'Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)...',
    )
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'P G Party Plot' } })

    await waitFor(() => {
      expect(
        screen.getByText((content) =>
          content.includes('P G Party Plot, Harni, Vadodara'),
        ),
      ).toBeInTheDocument()
    })
  })
})
