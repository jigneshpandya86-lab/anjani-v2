import { useCallback, useState } from 'react'
import { useClientStore } from '../store/clientStore'
import { UserPlus, CheckCircle, MapPinned, ChevronDown, ChevronUp, Package, X } from 'lucide-react'
import toast from 'react-hot-toast'
import GoogleMapPicker from './GoogleMapPicker'
import { WATER_SKUS } from '../constants/skus'
import { parseGoogleMapsLocation } from '../utils/locationUtils'
import { ensureEnglishText, normalizeDigits, hasIndicScript } from '../utils/textUtils'

export default function AddClient({ onDone, client, initialValues = {} }) {
  const data = client || initialValues || {}
  // If editing or prefilling, fill in the blanks. All clients are created in English only!
  const [name, setName] = useState(() => ensureEnglishText(data.name || ''))
  const [phone, setPhone] = useState(() => normalizeDigits(data.mobile || data.phone || '').replace(/\D/g, ''))
  const [address, setAddress] = useState(() => ensureEnglishText(data.address || ''))
  const [rate, setRate] = useState(data.rate !== undefined && data.rate !== null && data.rate !== '' ? String(data.rate) : '')
  const [skuRates, setSkuRates] = useState(() => {
    const initial = {}
    WATER_SKUS.forEach((s) => {
      initial[s.label] = data?.skuRates?.[s.label] !== undefined ? String(data.skuRates[s.label]) : ''
    })
    return initial
  })
  const [showSkuRates, setShowSkuRates] = useState(() => {
    return Boolean(data?.skuRates && Object.values(data.skuRates).some((v) => v !== undefined && v !== ''))
  })
  const [locationAddress, setLocationAddress] = useState(() =>
    ensureEnglishText(data?.location || data?.googleLocation || data?.locationName || ''),
  )
  const [mapLink, setMapLink] = useState(data?.mapLink || data?.googleMap || '')
  const [locationLat, setLocationLat] = useState(() => {
    const parsed = Number(data?.locationLat ?? data?.lat)
    return Number.isFinite(parsed) ? parsed : null
  })
  const [locationLng, setLocationLng] = useState(() => {
    const parsed = Number(data?.locationLng ?? data?.lng)
    return Number.isFinite(parsed) ? parsed : null
  })
  const [status, setStatus] = useState("idle")
  const [isRegular, setIsRegular] = useState(!!data.isRegular)
  const [isDefaulter, setIsDefaulter] = useState(!!data.isDefaulter)

  const addClient = useClientStore((state) => state.addClient)
  const updateClient = useClientStore((state) => state.updateClient)

  const handleLocationChange = useCallback(({ lat, lng, address: resolvedAddress, mapLink: resolvedMapLink }) => {
    if (Number.isFinite(Number(lat))) setLocationLat(Number(lat))
    if (Number.isFinite(Number(lng))) setLocationLng(Number(lng))
    if (resolvedAddress) {
      setLocationAddress(resolvedAddress)
      setAddress((prev) => (prev.trim() ? prev : resolvedAddress))
    }
    if (resolvedMapLink) setMapLink(resolvedMapLink)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('saving')

    try {
      const cleanedSkuRates = {}
      WATER_SKUS.forEach((s) => {
        const val = skuRates[s.label]
        if (val !== '' && val !== undefined && !isNaN(Number(val))) {
          cleanedSkuRates[s.label] = Number(val)
        }
      })
      if (rate !== '' && cleanedSkuRates['Anjani 200ml'] === undefined) {
        cleanedSkuRates['Anjani 200ml'] = Number(rate)
      }

      // Check if locationAddress or mapLink contains coords or URL
      let finalLocation = String(locationAddress || '').trim()
      let finalMapLink = String(mapLink || '').trim()
      let finalLat = Number.isFinite(Number(locationLat)) ? Number(locationLat) : null
      let finalLng = Number.isFinite(Number(locationLng)) ? Number(locationLng) : null

      const parsedAddr = parseGoogleMapsLocation(finalLocation)
      if (parsedAddr) {
        if (!finalMapLink) finalMapLink = parsedAddr.mapLink
        if (finalLat === null && parsedAddr.lat !== null) finalLat = parsedAddr.lat
        if (finalLng === null && parsedAddr.lng !== null) finalLng = parsedAddr.lng
      }

      const parsedLink = parseGoogleMapsLocation(finalMapLink)
      if (parsedLink) {
        if (finalLat === null && parsedLink.lat !== null) finalLat = parsedLink.lat
        if (finalLng === null && parsedLink.lng !== null) finalLng = parsedLink.lng
      }

      if (!finalMapLink && finalLat !== null && finalLng !== null) {
        finalMapLink = `https://www.google.com/maps?q=${finalLat},${finalLng}`
      }

      const payload = {
        name: ensureEnglishText(name || '').trim(),
        mobile: normalizeDigits(phone || '').replace(/\D/g, '').trim(),
        address: ensureEnglishText(address || '').trim(),
        rate: rate === '' ? 0 : Number(rate),
        skuRates: cleanedSkuRates,
        location: ensureEnglishText(finalLocation || finalMapLink || '').trim(),
        mapLink: finalMapLink || '',
        locationLat: finalLat,
        locationLng: finalLng,
        isRegular: Boolean(isRegular),
        isDefaulter: Boolean(isDefaulter),
      }

      if (client?.id) {
        await updateClient(client.id, payload)
        toast.success('Client updated successfully')
      } else {
        await addClient(payload)
        toast.success('Client created successfully')
      }

      setName('')
      setPhone('')
      setAddress('')
      setRate('')
      setSkuRates(WATER_SKUS.reduce((acc, s) => ({ ...acc, [s.label]: '' }), {}))
      setLocationAddress('')
      setMapLink('')
      setLocationLat(null)
      setLocationLng(null)
      setIsRegular(false)
      setIsDefaulter(false)
      setStatus('idle')
      if (onDone) onDone()
    } catch (error) {
      console.error('Error saving client:', error)
      toast.error('Failed to save client: ' + error.message)
      setStatus('idle')
    }
  }

  return (
    <div className="bg-white rounded-2xl w-full flex flex-col max-h-full overflow-hidden">
      <div className="bg-amz-navy text-white px-4 py-3.5 sm:px-5 sm:py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <UserPlus className="text-amz-orange w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg leading-tight">{client ? "Edit Client" : "Add New Client"}</h2>
            <p className="text-[11px] text-gray-300">Enter client details and delivery rates</p>
          </div>
        </div>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close client form"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1">
        {status === 'success' ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 border border-green-200 animate-pulse">
            <CheckCircle className="w-6 h-6" />
            <p className="font-bold">Client Saved Successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="client-name"
                    className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide"
                  >
                    Client Name
                  </label>
                  <input
                    id="client-name"
                    required
                    value={name}
                    onChange={(e) => {
                      const val = e.target.value
                      setName(hasIndicScript(val) ? ensureEnglishText(val) : val)
                    }}
                    onBlur={() => setName((prev) => ensureEnglishText(prev))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mobile-number"
                    className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide"
                  >
                    Mobile Number
                  </label>
                  <input
                    id="mobile-number"
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(normalizeDigits(e.target.value).replace(/\D/g, ''))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                    placeholder="10-digit mobile number"
                  />
                </div>

                <div>
                  <label
                    htmlFor="address-input"
                    className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide"
                  >
                    Delivery Address
                  </label>
                  <textarea
                    id="address-input"
                    required
                    rows="2"
                    value={address}
                    onChange={(e) => {
                      const val = e.target.value
                      setAddress(hasIndicScript(val) ? ensureEnglishText(val) : val)
                    }}
                    onBlur={() => setAddress((prev) => ensureEnglishText(prev))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                    placeholder="Full delivery address..."
                  />
                </div>

                <div>
                  <label
                    htmlFor="rate-input"
                    className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide"
                  >
                    Default Rate (₹ / Unit)
                  </label>
                  <input
                    id="rate-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                    placeholder="e.g. 125"
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSkuRates(!showSkuRates)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amz-navy hover:text-amz-orange transition-colors"
                  >
                    <Package className="w-3.5 h-3.5 text-amz-orange" />
                    <span>{showSkuRates ? 'Hide SKU-Specific Rates' : 'Set SKU-Specific Rates (Bailey & Anjani)'}</span>
                    {showSkuRates ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showSkuRates && (
                    <div className="mt-2.5 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2 text-xs">
                      <p className="text-[11px] text-gray-500">
                        Optional: Set specific rates per SKU for this client. If left blank, the default rate above applies.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {WATER_SKUS.map((s) => (
                          <div key={s.id} className="bg-white p-2 rounded border border-gray-200">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-gray-700">{s.label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.brand === 'Bailey' ? 'bg-cyan-100 text-cyan-800' : 'bg-blue-100 text-blue-800'}`}>
                                {s.brand}
                              </span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-2 top-1.5 text-gray-400 font-bold text-xs">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={s.label === 'Anjani 200ml' ? (rate || '0') : 'Default'}
                                value={skuRates[s.label] || ''}
                                onChange={(e) => setSkuRates({ ...skuRates, [s.label]: e.target.value })}
                                className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-amz-orange focus:border-amz-orange outline-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="location-input"
                    className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide"
                  >
                    Actual Location / Google Maps
                  </label>
                  <GoogleMapPicker initialAddress={locationAddress} onChange={handleLocationChange} />
                  <div className="mt-2 space-y-2">
                    <input
                      id="location-input"
                      type="text"
                      value={locationAddress}
                      onChange={(e) => {
                        let val = e.target.value
                        if (hasIndicScript(val)) {
                          val = ensureEnglishText(val)
                        }
                        setLocationAddress(val)
                        const parsed = parseGoogleMapsLocation(val)
                        if (parsed) {
                          if (parsed.mapLink && !mapLink) setMapLink(parsed.mapLink)
                          if (parsed.lat !== null) setLocationLat(parsed.lat)
                          if (parsed.lng !== null) setLocationLng(parsed.lng)
                        }
                      }}
                      onBlur={() => setLocationAddress((prev) => ensureEnglishText(prev))}
                      className="w-full p-2.5 border border-gray-300 rounded-lg text-base sm:text-xs focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                      placeholder="Area / landmark / shop location text"
                    />

                    <div>
                      <label
                        htmlFor="map-link-input"
                        className="block text-[11px] font-semibold text-gray-500 mb-0.5"
                      >
                        Google Map Link or Pin URL
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="map-link-input"
                          type="text"
                          value={mapLink}
                          onChange={(e) => {
                            const val = e.target.value
                            setMapLink(val)
                            const parsed = parseGoogleMapsLocation(val)
                            if (parsed) {
                              if (parsed.lat !== null) setLocationLat(parsed.lat)
                              if (parsed.lng !== null) setLocationLng(parsed.lng)
                            }
                          }}
                          className="w-full p-2 border border-gray-300 rounded-lg text-base sm:text-xs focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none font-mono"
                          placeholder="Paste Google Maps URL (maps.app.goo.gl/...)"
                        />
                        {mapLink && (
                          <a
                            href={mapLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 flex items-center justify-center shrink-0"
                            title="Open Google Maps link"
                          >
                            <MapPinned className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {locationLat !== null && locationLng !== null && (
                        <p className="mt-1 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          ✓ Pinned: {locationLat.toFixed(5)}, {locationLng.toFixed(5)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">Status & Reminders</p>
                  
                  <div className="flex flex-col gap-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isRegular}
                        onChange={(e) => setIsRegular(e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-gray-300 text-amz-orange focus:ring-amz-orange cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Regular Client</span>
                    </label>
                    
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isDefaulter}
                        onChange={(e) => setIsDefaulter(e.target.checked)}
                        className="h-4.5 w-4.5 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide text-red-600">Defaulter Status</span>
                    </label>
                  </div>
                  
                  <p className="text-[10px] text-gray-400">
                    Defaulters receive automated payment reminders. Regular clients receive scheduled query notifications.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => onDone?.()}
                disabled={status === 'saving'}
                className="w-full bg-gray-100 border border-gray-300 text-gray-700 font-bold py-2.5 px-4 rounded-lg shadow-sm hover:bg-gray-200 active:shadow-inner disabled:opacity-50 transition-all text-sm cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={status === 'saving'}
                className="w-full bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-bold py-2.5 px-4 rounded-lg shadow-sm hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50 transition-all flex justify-center items-center gap-2 text-sm cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                {status === 'saving' ? 'Saving...' : 'Save Client'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
