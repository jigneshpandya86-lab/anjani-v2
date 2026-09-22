import { useEffect, useRef, useState } from 'react'
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

  if (window.google?.maps?.places) return Promise.resolve(window.google.maps)

  if (!mapsScriptPromise) {
    mapsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps-loader="true"]')
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google.maps))
        existing.addEventListener('error', () =>
          reject(new Error('Failed to load Google Maps script.')),
        )
        return
      }

      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      script.async = true
      script.defer = true
      script.dataset.googleMapsLoader = 'true'
      script.onload = () => {
        if (!window.google?.maps?.places) {
          reject(new Error('Google Places is not available after script load.'))
          return
        }
        resolve(window.google.maps)
      }
      script.onerror = () => reject(new Error('Failed to load Google Maps script.'))
      document.head.appendChild(script)
    })
  }

  return mapsScriptPromise
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
    let isActive = true

    const initializePlaces = async () => {
      if (!apiKey) return
      try {
        const maps = await loadGoogleMapsScript(apiKey)
        if (!isActive || !maps) return

        if (!window.google.maps.places.AutocompleteSuggestion) {
          return
        }
        sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
      } catch (err) {
        if (!isActive) return
        console.warn('Google Places suggestion loader notice:', err.message)
      }
    }

    initializePlaces()

    return () => {
      isActive = false
    }
  }, [apiKey])

  useEffect(() => {
    if (!searchTerm.trim()) return
    if (!window.google?.maps?.places?.AutocompleteSuggestion) return
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
        }

        const { suggestions } =
          await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: searchTerm,
            sessionToken: sessionTokenRef.current,
            locationRestriction: VADODARA_RESTRICTION,
            origin: VADODARA_ORIGIN,
            includedRegionCodes: ['in'],
          })

        setPredictions(Array.isArray(suggestions) ? suggestions.slice(0, 6) : [])
        setError('')
      } catch (err) {
        setPredictions([])
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSelectPrediction = async (suggestion) => {
    try {
      const place = suggestion?.placePrediction?.toPlace?.()
      if (!place) {
        setError('Unable to fetch selected place details.')
        return
      }

      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      })

      const lat = place.location?.lat?.()
      const lng = place.location?.lng?.()

      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        setError('Selected place does not include coordinates.')
        return
      }

      const address = place.formattedAddress || suggestion?.placePrediction?.text?.text || ''
      const mapLink = `https://www.google.com/maps?q=${lat},${lng}`

      suppressNextSearchRef.current = true
      setSearchTerm(address)
      setPredictions([])
      setError('')
      setIsFocused(false)
      onChangeRef.current?.({ lat, lng, address, mapLink })

      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    } catch (err) {
      setError(err?.message || 'Unable to fetch selected place details.')
    }
  }

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
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
              window.setTimeout(() => setIsFocused(false), 120)
            }}
            onChange={handleInputChange}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amz-orange focus:border-amz-orange"
            placeholder="Type place name, coords (e.g. 22.3, 73.1), or paste map URL"
          />
          {isFocused && (isSearching || predictions.length > 0) && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
              {isSearching && <p className="px-3 py-2 text-xs text-gray-500">Searching...</p>}
              {!isSearching &&
                predictions.map((item, index) => (
                  <button
                    type="button"
                    key={item?.placePrediction?.placeId || index}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleSelectPrediction(item)
                    }}
                    className="block w-full border-b border-gray-100 px-3 py-2 text-left text-xs hover:bg-gray-50"
                  >
                    {item?.placePrediction?.text?.text || 'Unknown location'}
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
          className="px-2.5 py-2 bg-gray-100 hover:bg-orange-50 hover:text-amz-orange border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
          title="Detect and use current device GPS location"
        >
          <LocateFixed className={`w-3.5 h-3.5 ${gettingGps ? 'animate-spin text-amz-orange' : 'text-gray-600'}`} />
          <span className="hidden sm:inline">GPS</span>
        </button>
      </div>

      <p className="text-[11px] text-gray-500">
        Type location, paste Google Maps link/coords, or tap GPS.
      </p>
      {error && <p className="text-xs text-amber-600">{error}</p>}
    </div>
  )
}
