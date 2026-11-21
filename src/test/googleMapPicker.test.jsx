import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GoogleMapPicker from '../components/GoogleMapPicker'

describe('GoogleMapPicker Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.head.innerHTML = ''
    delete window.google
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
