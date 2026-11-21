import React, { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseGoogleMapsLocation } from '../utils/locationUtils'

let mapsScriptPromise = null

const VADODARA_RESTRICTION = {
  north: 22.45,
  south: 22.2,
  east: 73.3,
  west: 72.95,
}

const VADODARA_ORIGIN = { lat: 22.3072, lng: 73.1812 }

const loadGoogleMapsScript = (apiKey) => {
  if (!apiKey) {
    return Promise.resolve(null)
  }

  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }

  if (!mapsScriptPromise) {
    mapsScriptPromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        resolve(null)
        return
      }

      const existing = document.querySelector('script[data-google-maps-loader="true"]')
      if (existing) {
        if (window.google?.maps) {
          resolve(window.google.maps)
          return
        }
        existing.addEventListener('load', () => resolve(window.google?.maps || null))
        existing.addEventListener('error', () => {
          mapsScriptPromise = null
          reject(new Error('Failed to load Google Maps script.'))
        })
        return
      }

      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      script.async = true
      script.defer = true
      script.dataset.googleMapsLoader = 'true'
      script.onload = () => {
        resolve(window.google?.maps || null)
      }
      script.onerror = () => {
        mapsScriptPromise = null
        reject(new Error('Failed to load Google Maps script.'))
      }
      document.head.appendChild(script)
    })
  }

  return mapsScriptPromise
}

const getPlacesLibrary = async () => {
  if (typeof window === 'undefined') return null
  if (window.google?.maps?.places) return window.google.maps.places
  if (window.google?.maps?.importLibrary) {
    try {
      const lib = await window.google.maps.importLibrary('places')
      if (lib) return lib
    } catch (_e) {
      // fallback
    }
  }
  return window.google?.maps?.places || null
}

export default function GoogleMapPicker({ initialAddress = '', onChange }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const onChangeRef = useRef(onChange)
  const sessionTokenRef = useRef(null)
  const suppressNextSearchRef = useRef(false)
  const [searchTerm, setSearchTerm] = useState(initialAddress || '')
  const [predictions, setPredictions] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [gettingGps, setGettingGps] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!isFocused) {
      setSearchTerm(initialAddress || '')
    }
  }, [initialAddress, isFocused])

  useEffect(() => {
    let isActive = true

    const initializePlaces = async () => {
      if (!apiKey) return
      try {
        const maps = await loadGoogleMapsScript(apiKey)
        if (!isActive || !maps) return

        const places = await getPlacesLibrary()
        if (places?.AutocompleteSessionToken) {
          sessionTokenRef.current = new places.AutocompleteSessionToken()
        }
      } catch (err) {
        if (!isActive) return
        console.warn('Google Places suggestion loader notice:', err?.message)
      }
    }

    initializePlaces()

    return () => {
      isActive = false
    }
  }, [apiKey])

  useEffect(() => {
    if (!searchTerm || !searchTerm.trim()) {
      setPredictions([])
      setIsSearching(false)
      return
    }
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const places = await getPlacesLibrary()
        if (!places) {
          setIsSearching(false)
          return
        }

        // Method A: Places API (New) fetchAutocompleteSuggestions
        if (
          places.AutocompleteSuggestion &&
          typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function'
        ) {
          if (!sessionTokenRef.current && places.AutocompleteSessionToken) {
            sessionTokenRef.current = new places.AutocompleteSessionToken()
          }

          try {
            const { suggestions } =
              await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                input: searchTerm,
                sessionToken: sessionTokenRef.current,
                locationRestriction: VADODARA_RESTRICTION,
                origin: VADODARA_ORIGIN,
                includedRegionCodes: ['in'],
              })

            if (Array.isArray(suggestions) && suggestions.length > 0) {
              setPredictions(
                suggestions.slice(0, 6).map((s) => ({
                  id: s?.placePrediction?.placeId || String(Math.random()),
                  label: s?.placePrediction?.text?.text || 'Unknown location',
                  raw: s,
                  isNewApi: true,
                })),
              )
              setError('')
              setIsSearching(false)
              return
            }
          } catch (newApiErr) {
            console.warn('AutocompleteSuggestion failed, trying AutocompleteService:', newApiErr?.message)
          }
        }

        // Method B: Universal Classic AutocompleteService fallback
        if (places.AutocompleteService) {
          const service = new places.AutocompleteService()
          const bounds = window.google?.maps?.LatLngBounds
            ? new window.google.maps.LatLngBounds(
                new window.google.maps.LatLng(VADODARA_RESTRICTION.south, VADODARA_RESTRICTION.west),
                new window.google.maps.LatLng(VADODARA_RESTRICTION.north, VADODARA_RESTRICTION.east),
              )
            : undefined

          service.getPlacePredictions(
            {
              input: searchTerm,
              bounds,
              componentRestrictions: { country: 'in' },
            },
            (results, status) => {
              setIsSearching(false)
              const isOk =
                status === 'OK' || status === window.google?.maps?.places?.PlacesServiceStatus?.OK
              if (isOk && Array.isArray(results) && results.length > 0) {
                setPredictions(
                  results.slice(0, 6).map((r) => ({
                    id: r.place_id,
                    label: r.description,
                    placeId: r.place_id,
                    isNewApi: false,
                  })),
                )
                setError('')
              } else {
                setPredictions([])
              }
            },
          )
          return
        }

        setPredictions([])
        setIsSearching(false)
      } catch (err) {
        setPredictions([])
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSelectPrediction = async (item) => {
    try {
      // 1. New Places API resolution
      if (item.isNewApi && item.raw?.placePrediction?.toPlace) {
        const place = item.raw.placePrediction.toPlace()
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        })

        const lat = place.location?.lat?.()
        const lng = place.location?.lng?.()

        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
          const address = place.formattedAddress || item.label || ''
          const mapLink = `https://www.google.com/maps?q=${lat},${lng}`

          suppressNextSearchRef.current = true
          setSearchTerm(address)
          setPredictions([])
          setError('')
          setIsFocused(false)
          onChangeRef.current?.({ lat, lng, address, mapLink })

          const places = await getPlacesLibrary()
          if (places?.AutocompleteSessionToken) {
            sessionTokenRef.current = new places.AutocompleteSessionToken()
          }
          return
        }
      }

      // 2. Geocoder resolution for placeId
      if (item.placeId && window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ placeId: item.placeId }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry?.location
            const lat = Number(loc?.lat?.()?.toFixed(6))
            const lng = Number(loc?.lng?.()?.toFixed(6))
            const address = results[0].formatted_address || item.label || ''
            const mapLink = `https://www.google.com/maps?q=${lat},${lng}`

            suppressNextSearchRef.current = true
            setSearchTerm(address)
            setPredictions([])
            setError('')
            setIsFocused(false)
            onChangeRef.current?.({ lat, lng, address, mapLink })
          } else {
            suppressNextSearchRef.current = true
            setSearchTerm(item.label)
            setPredictions([])
            setError('')
            setIsFocused(false)
            onChangeRef.current?.({ lat: null, lng: null, address: item.label, mapLink: null })
          }
        })
        return
      }

      // 3. Fallback text
      suppressNextSearchRef.current = true
      setSearchTerm(item.label)
      setPredictions([])
      setError('')
      setIsFocused(false)
      onChangeRef.current?.({ lat: null, lng: null, address: item.label, mapLink: null })
    } catch (err) {
      setError(err?.message || 'Unable to fetch selected place details.')
    }
  }

  const handleUseCurrentGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }
    setGettingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingGps(false)
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`
        const label = `GPS: ${lat}, ${lng}`
        suppressNextSearchRef.current = true
        setSearchTerm(label)
        setError('')
        onChangeRef.current?.({ lat, lng, address: label, mapLink })
        toast.success(`Current GPS pinned: ${lat}, ${lng}`)
      },
      (err) => {
        setGettingGps(false)
        toast.error(`GPS Error: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleInputChange = (e) => {
    const nextValue = e.target.value
    suppressNextSearchRef.current = false
    setSearchTerm(nextValue)

    // Check if input is a pasted coordinates or Google Maps URL
    const parsed = parseGoogleMapsLocation(nextValue)
    if (parsed) {
      onChangeRef.current?.({
        lat: parsed.lat,
        lng: parsed.lng,
        address: nextValue,
        mapLink: parsed.mapLink,
      })
    } else {
      onChangeRef.current?.({
        lat: null,
        lng: null,
        address: nextValue,
        mapLink: null,
      })
    }

    if (!nextValue.trim()) setPredictions([])
  }

  return (
    <div className="space-y-1.5">
      <div className="relative flex items-center gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setIsFocused(false), 200)
            }}
            onChange={handleInputChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="Search landmark, coords (e.g. 22.3, 73.1), or paste map URL"
          />
          {isFocused && (isSearching || predictions.length > 0) && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl max-h-56 overflow-y-auto">
              {isSearching && (
                <p className="px-3 py-2.5 text-xs text-gray-500 font-medium">
                  Searching places in Vadodara...
                </p>
              )}
              {!isSearching &&
                predictions.map((item, index) => (
                  <button
                    type="button"
                    key={item.id || item.placeId || index}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelectPrediction(item)
                    }}
                    className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-xs text-gray-800 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer"
                  >
                    📍 {item.label}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* GPS location button */}
        <button
          type="button"
          onClick={handleUseCurrentGps}
          disabled={gettingGps}
          className="px-2.5 py-2 bg-gray-100 hover:bg-orange-50 hover:text-amber-700 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          title="Detect and use current device GPS location"
        >
          <LocateFixed
            className={`w-3.5 h-3.5 ${gettingGps ? 'animate-spin text-amber-600' : 'text-gray-600'}`}
          />
          <span className="hidden sm:inline">GPS</span>
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        Type landmark in Vadodara, paste Google Maps link, or tap GPS.
      </p>
      {error && <p className="text-xs text-amber-600 font-medium">{error}</p>}
    </div>
  )
}
