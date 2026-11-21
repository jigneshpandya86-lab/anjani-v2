/**
 * Curated Vadodara landmarks and open geocoding fallback.
 * Strictly NO REGEX used.
 */

export const VADODARA_COORDINATES = {
  lat: 22.3072,
  lng: 73.1812,
}

export const VADODARA_BOUNDS = {
  north: 22.45,
  south: 22.2,
  east: 73.3,
  west: 72.95,
}

export const VADODARA_LANDMARKS = [
  { name: 'Alkapuri', area: 'Central West', lat: 22.3102, lng: 73.1757, address: 'Alkapuri, Vadodara, Gujarat' },
  { name: 'Vadodara Railway Station', area: 'Alkapuri / Sayajigunj', lat: 22.3111, lng: 73.1808, address: 'Vadodara Junction Railway Station, Alkapuri, Vadodara' },
  { name: 'Central Bus Station', area: 'Sayajigunj', lat: 22.3125, lng: 73.184, address: 'Central Bus Station (Kadakbazar), Sayajigunj, Vadodara' },
  { name: 'Sayajigunj', area: 'Central', lat: 22.3135, lng: 73.1852, address: 'Sayajigunj, Vadodara, Gujarat' },
  { name: 'Sayaji Baug (Kamati Baug)', area: 'Sayajigunj', lat: 22.313, lng: 73.1895, address: 'Sayaji Baug (Kamati Baug), Vadodara, Gujarat' },
  { name: 'Akota', area: 'West', lat: 22.2961, lng: 73.1706, address: 'Akota, Vadodara, Gujarat' },
  { name: 'Old Padra Road', area: 'West', lat: 22.2931, lng: 73.1615, address: 'Old Padra Road (OP Road), Vadodara, Gujarat' },
  { name: 'Fatehgunj', area: 'North Central', lat: 22.3278, lng: 73.1873, address: 'Fatehgunj, Vadodara, Gujarat' },
  { name: 'Karelibaug', area: 'North East', lat: 22.3248, lng: 73.2039, address: 'Karelibaug, Vadodara, Gujarat' },
  { name: 'Manjalpur', area: 'South', lat: 22.2759, lng: 73.1879, address: 'Manjalpur, Vadodara, Gujarat' },
  { name: 'Makarpura GIDC', area: 'South Industrial', lat: 22.2536, lng: 73.1953, address: 'Makarpura GIDC, Vadodara, Gujarat' },
  { name: 'Gotri', area: 'West', lat: 22.3155, lng: 73.1438, address: 'Gotri, Vadodara, Gujarat' },
  { name: 'Gotri Sevasi Road', area: 'West', lat: 22.3188, lng: 73.1285, address: 'Gotri-Sevasi Road, Vadodara, Gujarat' },
  { name: 'Sevasi', area: 'West', lat: 22.3235, lng: 73.1167, address: 'Sevasi, Vadodara, Gujarat' },
  { name: 'Bhayli', area: 'South West', lat: 22.2882, lng: 73.1197, address: 'Bhayli, Vadodara, Gujarat' },
  { name: 'Vasna Road', area: 'South West', lat: 22.2934, lng: 73.1472, address: 'Vasna Road, Vadodara, Gujarat' },
  { name: 'Vasna-Bhayli Road', area: 'South West', lat: 22.2925, lng: 73.1358, address: 'Vasna - Bhayli Main Road, Vadodara, Gujarat' },
  { name: 'Atladara', area: 'South West', lat: 22.2764, lng: 73.1537, address: 'Atladara, Vadodara, Gujarat' },
  { name: 'Kalali', area: 'South West', lat: 22.2687, lng: 73.1523, address: 'Kalali, Vadodara, Gujarat' },
  { name: 'Subhanpura', area: 'West', lat: 22.3275, lng: 73.1611, address: 'Subhanpura, Vadodara, Gujarat' },
  { name: 'Ellora Park', area: 'West', lat: 22.3201, lng: 73.1654, address: 'Ellora Park, Subhanpura, Vadodara' },
  { name: 'Gorwa', area: 'North West', lat: 22.3381, lng: 73.1517, address: 'Gorwa BIDC, Vadodara, Gujarat' },
  { name: 'Nizampura', area: 'North', lat: 22.3378, lng: 73.1795, address: 'Nizampura, Vadodara, Gujarat' },
  { name: 'Chhani', area: 'North', lat: 22.3687, lng: 73.1856, address: 'Chhani, Vadodara, Gujarat' },
  { name: 'Sama', area: 'North', lat: 22.3414, lng: 73.2034, address: 'Sama, Vadodara, Gujarat' },
  { name: 'Sama-Savli Road', area: 'North', lat: 22.355, lng: 73.2095, address: 'Sama-Savli Road, Vadodara, Gujarat' },
  { name: 'Harni', area: 'North East', lat: 22.3387, lng: 73.2289, address: 'Harni, Vadodara, Gujarat' },
  { name: 'Vadodara Airport', area: 'North East', lat: 22.3361, lng: 73.2263, address: 'Vadodara Airport (Civil Aerodrome), Harni, Vadodara' },
  { name: 'New VIP Road', area: 'East', lat: 22.3188, lng: 73.2307, address: 'New VIP Road, Vadodara, Gujarat' },
  { name: 'Waghodia Road', area: 'East', lat: 22.3005, lng: 73.2345, address: 'Waghodia Road, Vadodara, Gujarat' },
  { name: 'Waghodia GIDC', area: 'East Industrial', lat: 22.305, lng: 73.342, address: 'Waghodia GIDC, Vadodara, Gujarat' },
  { name: 'Ajwa Road', area: 'East', lat: 22.3085, lng: 73.2312, address: 'Ajwa Road, Vadodara, Gujarat' },
  { name: 'Panigate', area: 'East Central', lat: 22.3025, lng: 73.2185, address: 'Panigate, Vadodara, Gujarat' },
  { name: 'Mandvi', area: 'Old City', lat: 22.3001, lng: 73.2081, address: 'Mandvi, Old City, Vadodara, Gujarat' },
  { name: 'Raopura', area: 'Old City', lat: 22.3039, lng: 73.2033, address: 'Raopura, Vadodara, Gujarat' },
  { name: 'Dandia Bazar', area: 'Old City', lat: 22.2982, lng: 73.1995, address: 'Dandia Bazar, Vadodara, Gujarat' },
  { name: 'Laxmi Vilas Palace', area: 'Central South', lat: 22.2938, lng: 73.1908, address: 'Laxmi Vilas Palace, J N Marg, Vadodara' },
  { name: 'Pratapnagar', area: 'South East', lat: 22.2855, lng: 73.213, address: 'Pratapnagar, Vadodara, Gujarat' },
  { name: 'Tarsali', area: 'South East', lat: 22.2573, lng: 73.2168, address: 'Tarsali, Vadodara, Gujarat' },
  { name: 'Danteshwar', area: 'South East', lat: 22.2721, lng: 73.2125, address: 'Danteshwar, Vadodara, Gujarat' },
  { name: 'Warasia', area: 'East', lat: 22.316, lng: 73.218, address: 'Warasia, Vadodara, Gujarat' },
  { name: 'Maneja', area: 'South', lat: 22.235, lng: 73.1945, address: 'Maneja, Vadodara, Gujarat' },
  { name: 'Sun Pharma Road', area: 'South West', lat: 22.274, lng: 73.161, address: 'Sun Pharma Road, Atladara, Vadodara' },
  { name: 'Bill (Bill-Chapad)', area: 'South West', lat: 22.251, lng: 73.1495, address: 'Bill Village / Bill-Chapad Road, Vadodara' },
  { name: 'Chapad', area: 'South West', lat: 22.238, lng: 73.145, address: 'Chapad, Vadodara, Gujarat' },
  { name: 'Por GIDC', area: 'South Highway', lat: 22.175, lng: 73.188, address: 'Por GIDC / Highway, Vadodara, Gujarat' },
  { name: 'Nandesari GIDC', area: 'North Industrial', lat: 22.408, lng: 73.098, address: 'Nandesari GIDC, Vadodara, Gujarat' },
  { name: 'Ranoli GIDC', area: 'North Industrial', lat: 22.385, lng: 73.135, address: 'Ranoli GIDC, Vadodara, Gujarat' },
  { name: 'Bajwa', area: 'North Industrial', lat: 22.378, lng: 73.149, address: 'Bajwa, Vadodara, Gujarat' },
  { name: 'Khanderao Market', area: 'Central', lat: 22.2975, lng: 73.2045, address: 'Khanderao Market, Vadodara, Gujarat' },
]

/**
 * Search local Vadodara landmarks instantly without network.
 * Strictly NO REGEX.
 */
export function searchVadodaraLandmarks(query, limit = 6) {
  if (!query || typeof query !== 'string') return []
  const clean = query.trim().toLowerCase()
  if (clean.length < 2) return []

  const startsWithMatches = []
  const includesMatches = []

  for (let i = 0; i < VADODARA_LANDMARKS.length; i++) {
    const item = VADODARA_LANDMARKS[i]
    const nameLower = item.name.toLowerCase()
    const areaLower = item.area.toLowerCase()
    const addressLower = item.address.toLowerCase()

    const itemObj = {
      id: 'landmark-' + String(i),
      label: item.address,
      lat: item.lat,
      lng: item.lng,
      mapLink: 'https://www.google.com/maps?q=' + item.lat + ',' + item.lng,
      source: 'landmark',
    }

    if (nameLower.startsWith(clean)) {
      startsWithMatches.push(itemObj)
    } else if (
      nameLower.includes(clean) ||
      areaLower.includes(clean) ||
      addressLower.includes(clean)
    ) {
      includesMatches.push(itemObj)
    }
  }

  const combined = startsWithMatches.concat(includesMatches)
  return combined.slice(0, limit)
}

/**
 * Fetch suggestions from Photon / OSM API with timeout guard.
 * Strictly NO REGEX.
 */
export async function fetchPhotonSuggestions(query, limit = 6, timeoutMs = 2500) {
  if (!query || typeof query !== 'string') return []
  const clean = query.trim()
  if (clean.length < 2) return []

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = setTimeout(() => {
    if (controller) controller.abort()
  }, timeoutMs)

  try {
    const url =
      'https://photon.komoot.io/api/?q=' +
      encodeURIComponent(clean + ' Vadodara') +
      '&lat=' +
      String(VADODARA_COORDINATES.lat) +
      '&lon=' +
      String(VADODARA_COORDINATES.lng) +
      '&limit=' +
      String(limit)

    const fetchOpts = controller ? { signal: controller.signal } : {}
    const res = await fetch(url, fetchOpts)
    clearTimeout(timeoutId)

    if (!res.ok) return []
    const data = await res.json()
    const features = data?.features || []

    const results = []
    for (let i = 0; i < features.length; i++) {
      const feat = features[i]
      const props = feat.properties || {}
      const coords = feat.geometry?.coordinates || []
      const lng = Number(coords[0])
      const lat = Number(coords[1])

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const parts = []
        if (props.name) parts.push(props.name)
        if (props.street && props.street !== props.name) parts.push(props.street)
        if (props.district && props.district !== props.name) parts.push(props.district)
        if (props.city && props.city !== props.name) parts.push(props.city)
        if (props.state && props.state !== 'Gujarat') parts.push(props.state)

        const label = parts.length > 0 ? parts.join(', ') : 'Vadodara Location'

        results.push({
          id: 'osm-' + String(props.osm_id || i),
          label: label,
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          mapLink: 'https://www.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6),
          source: 'osm',
        })
      }
    }

    return results
  } catch (_e) {
    clearTimeout(timeoutId)
    return []
  }
}
