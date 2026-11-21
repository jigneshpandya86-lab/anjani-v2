import React, { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import toast from 'react-hot-toast'
import { parseGoogleMapsLocation } from '../utils/locationUtils'
import {
  VADODARA_50KM_BOUNDS,
  VADODARA_COORDINATES,
  MAX_DELIVERY_RADIUS_KM,
  calculateDistanceKm,
  searchVadodaraLandmarks,
  fetchPhotonSuggestions,
} from '../utils/vadodaraLandmarks'

let mapsScriptPromise = null

const loadGoogleMapsScript = (apiKey) => {
  if (!apiKey) {
    return Promise.resolve(null)
  }

  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(window.google.maps)
  }

  if (typeof window !== 'undefined' && !window.__gmAuthHooked) {
    window.__gmAuthHooked = true
    const prevAuth = window.gm_authFailure
    window.gm_authFailure = () => {
      window.__googleMapsAuthFailed = true
      if (typeof prevAuth === 'function') {
        prevAuth()
      }
    }
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
  const activeSearchIdRef = useRef(0)

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
    const cleanTerm = searchTerm ? searchTerm.trim() : ''
    if (!cleanTerm || cleanTerm.length < 2) {
      setPredictions([])
      setIsSearching(false)
      return
    }

    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    // Step 1: Instant local Vadodara + 50 km landmarks for zero-latency feedback
    const localMatches = searchVadodaraLandmarks(cleanTerm, 6)
    if (localMatches.length > 0) {
      setPredictions(localMatches)
    }

    const currentSearchId = ++activeSearchIdRef.current

    const timer = setTimeout(async () => {
      setIsSearching(true)

      let foundGoogleResults = false
      const isAuthFailed = typeof window !== 'undefined' && Boolean(window.__googleMapsAuthFailed)

      // Step 2: Try Google Places API restricted to 50 km bounds
      if (!isAuthFailed) {
        try {
          const places = await getPlacesLibrary()

          if (places) {
            // Method A: Places API (New) fetchAutocompleteSuggestions
            if (
              places.AutocompleteSuggestion &&
              typeof places.AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function'
            ) {
              if (!sessionTokenRef.current && places.AutocompleteSessionToken) {
                sessionTokenRef.current = new places.AutocompleteSessionToken()
              }

              const newApiPromise = places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
                input: cleanTerm,
                sessionToken: sessionTokenRef.current,
                locationRestriction: VADODARA_50KM_BOUNDS,
                origin: VADODARA_COORDINATES,
                includedRegionCodes: ['in'],
              })

              const timeoutPromise = new Promise((resolve) =>
                setTimeout(() => resolve({ isTimeout: true }), 2000),
              )

              const outcome = await Promise.race([newApiPromise, timeoutPromise])

              if (activeSearchIdRef.current === currentSearchId && outcome && !outcome.isTimeout) {
                const suggestions = outcome.suggestions
                if (Array.isArray(suggestions) && suggestions.length > 0) {
                  const googleList = suggestions.slice(0, 6).map((s) => ({
                    id: s?.placePrediction?.placeId || String(Math.random()),
                    label: s?.placePrediction?.text?.text || 'Unknown location',
                    raw: s,
                    isNewApi: true,
                    source: 'google',
                  }))

                  setPredictions(googleList)
                  setError('')
                  setIsSearching(false)
                  foundGoogleResults = true
                  return
                }
              }
            }

            // Method B: Universal Classic AutocompleteService fallback with strict 50 km bounds
            if (!foundGoogleResults && places.AutocompleteService) {
              const service = new places.AutocompleteService()
              const bounds = window.google?.maps?.LatLngBounds
                ? new window.google.maps.LatLngBounds(
                    new window.google.maps.LatLng(
                      VADODARA_50KM_BOUNDS.south,
                      VADODARA_50KM_BOUNDS.west,
                    ),
                    new window.google.maps.LatLng(
                      VADODARA_50KM_BOUNDS.north,
                      VADODARA_50KM_BOUNDS.east,
                    ),
                  )
                : undefined

              const classicPromise = new Promise((resolve) => {
                service.getPlacePredictions(
                  {
                    input: cleanTerm,
                    bounds,
                    componentRestrictions: { country: 'in' },
                  },
                  (results, status) => {
                    resolve({ results, status })
                  },
                )
              })

              const timeoutPromise = new Promise((resolve) =>
                setTimeout(() => resolve({ isTimeout: true }), 2000),
              )

              const classicOutcome = await Promise.race([classicPromise, timeoutPromise])

              if (
                activeSearchIdRef.current === currentSearchId &&
                classicOutcome &&
                !classicOutcome.isTimeout
              ) {
                const isOk =
                  classicOutcome.status === 'OK' ||
                  classicOutcome.status === window.google?.maps?.places?.PlacesServiceStatus?.OK

                if (
                  isOk &&
                  Array.isArray(classicOutcome.results) &&
                  classicOutcome.results.length > 0
                ) {
                  const classicList = classicOutcome.results.slice(0, 6).map((r) => ({
                    id: r.place_id,
                    label: r.description,
                    placeId: r.place_id,
                    isNewApi: false,
                    source: 'google',
                  }))

                  setPredictions(classicList)
                  setError('')
                  setIsSearching(false)
                  foundGoogleResults = true
                  return
                }
              }
            }
          }
        } catch (_err) {
          // Google Places threw or timed out; fall through to OSM fallback
        }
      }

      if (activeSearchIdRef.current !== currentSearchId) {
        return
      }

      // Step 3: OpenStreetMap Photon fallback with strict 50 km bbox filter
      if (!foundGoogleResults) {
        try {
          const osmResults = await fetchPhotonSuggestions(cleanTerm, 6, 2200)

          if (activeSearchIdRef.current === currentSearchId) {
            if (Array.isArray(osmResults) && osmResults.length > 0) {
              setPredictions(osmResults)
              setError('')
              setIsSearching(false)
              return
            }
          }
        } catch (_osmErr) {
          // Ignore OSM error
        }
      }

      // Step 4: Final resolution - keep local matches or clear
      if (activeSearchIdRef.current === currentSearchId) {
        if (localMatches.length > 0) {
          setPredictions(localMatches)
        } else if (!foundGoogleResults) {
          setPredictions([])
        }
        setIsSearching(false)
      }
    }, 200)

    return () => {
      clearTimeout(timer)
    }
  }, [searchTerm])

  const handleSelectPrediction = async (item) => {
    try {
      // 1. Direct Landmark or OpenStreetMap item (coordinates already known)
      if (
        (item.source === 'landmark' || item.source === 'osm') &&
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lng))
      ) {
        const lat = Number(item.lat)
        const lng = Number(item.lng)
        const dist = calculateDistanceKm(lat, lng)

        if (dist > MAX_DELIVERY_RADIUS_KM) {
          toast.error(
            `Location is ${dist.toFixed(1)} km away. Delivery is restricted to Vadodara + 50 km only.`,
          )
          setError(`Selected location is ${dist.toFixed(1)} km away (exceeds 50 km limit).`)
          return
        }

        const address = item.label || ''
        const mapLink = item.mapLink || `https://www.google.com/maps?q=${lat},${lng}`

        suppressNextSearchRef.current = true
        setSearchTerm(address)
        setPredictions([])
        setError('')
        setIsFocused(false)
        onChangeRef.current?.({ lat, lng, address, mapLink })
        return
      }

      // 2. New Places API resolution
      if (item.isNewApi && item.raw?.placePrediction?.toPlace) {
        const place = item.raw.placePrediction.toPlace()
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location'],
        })

        const lat = place.location?.lat?.()
        const lng = place.location?.lng?.()

        if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
          const dist = calculateDistanceKm(lat, lng)
          if (dist > MAX_DELIVERY_RADIUS_KM) {
            toast.error(
              `Selected place is ${dist.toFixed(1)} km away. Delivery is restricted to Vadodara + 50 km only.`,
            )
            setError(`Selected location is ${dist.toFixed(1)} km away (exceeds 50 km limit).`)
            return
          }

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

      // 3. Geocoder resolution for placeId
      if (item.placeId && window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder()
        geocoder.geocode({ placeId: item.placeId }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry?.location
            const lat = Number(loc?.lat?.()?.toFixed(6))
            const lng = Number(loc?.lng?.()?.toFixed(6))

            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              const dist = calculateDistanceKm(lat, lng)
              if (dist > MAX_DELIVERY_RADIUS_KM) {
                toast.error(
                  `Selected place is ${dist.toFixed(1)} km away. Delivery is restricted to Vadodara + 50 km only.`,
                )
                setError(`Selected location is ${dist.toFixed(1)} km away (exceeds 50 km limit).`)
                return
              }
            }

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

      // 4. Fallback text
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
        const dist = calculateDistanceKm(lat, lng)

        if (dist > MAX_DELIVERY_RADIUS_KM) {
          toast.error(
            `GPS location is ${dist.toFixed(1)} km away. Outside the 50 km Vadodara delivery zone.`,
          )
          setError(`GPS location is ${dist.toFixed(1)} km away (exceeds 50 km limit).`)
          return
        }

        const mapLink = `https://www.google.com/maps?q=${lat},${lng}`
        const label = `GPS: ${lat}, ${lng} (${dist.toFixed(1)} km from Vadodara)`
        suppressNextSearchRef.current = true
        setSearchTerm(label)
        setError('')
        onChangeRef.current?.({ lat, lng, address: label, mapLink })
        toast.success(`Current GPS pinned: ${lat}, ${lng} (${dist.toFixed(1)} km away)`)
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
      if (
        parsed.lat !== null &&
        parsed.lat !== undefined &&
        parsed.lng !== null &&
        parsed.lng !== undefined
      ) {
        const dist = calculateDistanceKm(parsed.lat, parsed.lng)
        if (dist > MAX_DELIVERY_RADIUS_KM) {
          setError(`Pasted location is ${dist.toFixed(1)} km away (outside 50 km Vadodara limit).`)
        } else {
          setError('')
        }
      }
      onChangeRef.current?.({
        lat: parsed.lat,
        lng: parsed.lng,
        address: nextValue,
        mapLink: parsed.mapLink,
      })
    } else {
      setError('')
      onChangeRef.current?.({
        lat: null,
        lng: null,
        address: nextValue,
        mapLink: null,
      })
    }

    if (!nextValue.trim()) {
      setPredictions([])
      setIsSearching(false)
      setError('')
    }
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
              window.setTimeout(() => setIsFocused(false), 250)
            }}
            onChange={handleInputChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            placeholder="Search Vadodara + 50 km (e.g. Alkapuri, Halol, Padra, GIDC)..."
          />
          {isFocused && (isSearching || predictions.length > 0) && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl max-h-60 overflow-y-auto">
              {isSearching && predictions.length === 0 && (
                <p className="px-3 py-2.5 text-xs text-gray-500 font-medium animate-pulse">
                  Searching places within 50 km of Vadodara...
                </p>
              )}
              {predictions.map((item, index) => (
                <button
                  type="button"
                  key={item.id || item.placeId || index}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectPrediction(item)
                  }}
                  className="block w-full border-b border-gray-100 px-3 py-2.5 text-left text-xs text-gray-800 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer"
                >
                  <span className="font-semibold text-amber-700 mr-1.5">📍</span>
                  <span>{item.label}</span>
                  {Number.isFinite(item.distanceKm) && (
                    <span className="ml-2 text-[10px] text-gray-400 font-medium">
                      ({item.distanceKm} km)
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {isFocused && !isSearching && predictions.length === 0 && searchTerm.trim().length >= 2 && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl p-2.5">
              <p className="text-xs text-gray-500">
                No matching places found within 50 km of Vadodara. You can paste map link or tap GPS.
              </p>
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
        Restricted to Vadodara + 50 km range (City, Padra, Karjan, Halol, Savli, GIDCs).
      </p>
      {error && <p className="text-xs text-amber-600 font-medium">{error}</p>}
    </div>
  )
}
