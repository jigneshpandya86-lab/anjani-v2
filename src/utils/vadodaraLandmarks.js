/**
 * Curated Vadodara landmarks and open geocoding fallback.
 * Strictly restricted to Vadodara + 50 km range only.
 * Strictly NO REGEX used.
 */

export const VADODARA_COORDINATES = {
  lat: 22.3072,
  lng: 73.1812,
}

export const MAX_DELIVERY_RADIUS_KM = 50.0

// 50 km circumscribing bounding box around Vadodara center
export const VADODARA_50KM_BOUNDS = {
  north: 22.7563,
  south: 21.8581,
  east: 73.6667,
  west: 72.6957,
}

// Backwards compatibility alias
export const VADODARA_BOUNDS = VADODARA_50KM_BOUNDS

/**
 * Calculates geographic distance in kilometers using the Haversine formula.
 * Strictly NO REGEX.
 */
export function calculateDistanceKm(
  lat1,
  lng1,
  lat2 = VADODARA_COORDINATES.lat,
  lng2 = VADODARA_COORDINATES.lng,
) {
  const nLat1 = Number(lat1)
  const nLng1 = Number(lng1)
  const nLat2 = Number(lat2)
  const nLng2 = Number(lng2)

  if (
    !Number.isFinite(nLat1) ||
    !Number.isFinite(nLng1) ||
    !Number.isFinite(nLat2) ||
    !Number.isFinite(nLng2)
  ) {
    return Infinity
  }

  const toRad = (deg) => (deg * Math.PI) / 180.0
  const dLat = toRad(nLat1 - nLat2)
  const dLng = toRad(nLng1 - nLng2)

  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos(toRad(nLat2)) *
      Math.cos(toRad(nLat1)) *
      Math.sin(dLng / 2.0) *
      Math.sin(dLng / 2.0)

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a))
  const earthRadiusKm = 6371.0
  return earthRadiusKm * c
}

/**
 * Checks if coordinates fall within 50 km of Vadodara center.
 * Strictly NO REGEX.
 */
export function isWithinVadodara50Km(lat, lng) {
  const dist = calculateDistanceKm(lat, lng)
  return dist <= MAX_DELIVERY_RADIUS_KM
}

export const VADODARA_LANDMARKS = [
  // --- Vadodara City Core & Localities ---
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
  { name: 'Gorwa', area: 'North West', lat: 22.3381, lng: 73.1517, address: 'Gorwa, Vadodara, Gujarat' },
  { name: 'Nizampura', area: 'North', lat: 22.3378, lng: 73.1795, address: 'Nizampura, Vadodara, Gujarat' },
  { name: 'Chhani', area: 'North', lat: 22.3687, lng: 73.1856, address: 'Chhani, Vadodara, Gujarat' },
  { name: 'Sama', area: 'North', lat: 22.3414, lng: 73.2034, address: 'Sama, Vadodara, Gujarat' },
  { name: 'Sama-Savli Road', area: 'North', lat: 22.355, lng: 73.2095, address: 'Sama-Savli Road, Vadodara, Gujarat' },
  { name: 'Harni', area: 'North East', lat: 22.3387, lng: 73.2289, address: 'Harni, Vadodara, Gujarat' },
  { name: 'Vadodara Airport', area: 'North East', lat: 22.3361, lng: 73.2263, address: 'Vadodara Airport (Civil Aerodrome), Harni, Vadodara' },
  { name: 'New VIP Road', area: 'East', lat: 22.3188, lng: 73.2307, address: 'New VIP Road, Vadodara, Gujarat' },
  { name: 'Waghodia Road', area: 'East', lat: 22.3005, lng: 73.2345, address: 'Waghodia Road, Vadodara, Gujarat' },
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
  { name: 'Bajwa', area: 'North Industrial', lat: 22.378, lng: 73.149, address: 'Bajwa, Vadodara, Gujarat' },
  { name: 'Khanderao Market', area: 'Central', lat: 22.2975, lng: 73.2045, address: 'Khanderao Market, Vadodara, Gujarat' },

  // --- Popular Party Plots, Banquets & Event Venues within 50 km ---
  { name: 'Reva Party Plot', area: 'Tarsali Road (6.7 km)', lat: 22.2573, lng: 73.2168, address: 'Reva Party Plot, Akshar Vintage, Tarsali Rd, Adarsh Nagar, Tarsali, Vadodara, Gujarat 390009' },
  { name: 'PG Party Plot', area: 'Harni Road (5.6 km)', lat: 22.3387, lng: 73.2289, address: 'PG Party Plot, Harni Road, Vadodara, Gujarat 390022' },
  { name: 'Balaji Party Plot', area: 'Harni Road (5.4 km)', lat: 22.338, lng: 73.226, address: 'Balaji Party Plot, Harni Road, Vadodara, Gujarat 390022' },
  { name: 'Suramya Party Plot', area: 'Sevasi (6.9 km)', lat: 22.3235, lng: 73.1167, address: 'Suramya Party Plot, Sevasi - Canal Road, Sevasi, Vadodara, Gujarat 391101' },
  { name: 'Rajpath Party Plot', area: 'Vasna-Bhayli (5.0 km)', lat: 22.2925, lng: 73.1358, address: 'Rajpath Party Plot, Vasna - Bhayli Main Road, Bhayli, Vadodara, Gujarat 391410' },
  { name: 'Samvedna Party Plot', area: 'Gotri (4.0 km)', lat: 22.3155, lng: 73.1438, address: 'Samvedna Party Plot, Gotri Road, Vadodara, Gujarat 390021' },
  { name: 'Aura Party Plot', area: 'Bhayli (6.7 km)', lat: 22.2882, lng: 73.1197, address: 'Aura Party Plot, Bhayli, Vadodara, Gujarat 391410' },
  { name: 'Shukan Party Plot', area: 'Manjalpur (3.5 km)', lat: 22.2759, lng: 73.1879, address: 'Shukan Party Plot, Manjalpur, Vadodara, Gujarat 390011' },
  { name: 'Nirant Party Plot', area: 'Tarsali (6.0 km)', lat: 22.257, lng: 73.215, address: 'Nirant Party Plot, Tarsali, Vadodara, Gujarat 390009' },
  { name: 'Pariwar Party Plot', area: 'Waghodia Road (5.5 km)', lat: 22.3005, lng: 73.2345, address: 'Pariwar Party Plot, Waghodia Road, Vadodara, Gujarat 390019' },
  { name: 'Vrundavan Party Plot', area: 'Ajwa Road (5.2 km)', lat: 22.3085, lng: 73.2312, address: 'Vrundavan Party Plot, Ajwa Road, Vadodara, Gujarat 390019' },
  { name: 'Dhwanit Party Plot & Banquet', area: 'New VIP Road (5.2 km)', lat: 22.3188, lng: 73.2307, address: 'Dhwanit Party Plot & Banquet, New VIP Road, Vadodara, Gujarat 390022' },
  { name: 'Siddheshwar Party Plot', area: 'Sama-Savli (6.1 km)', lat: 22.355, lng: 73.2095, address: 'Siddheshwar Party Plot, Sama-Savli Road, Vadodara, Gujarat 390008' },
  { name: 'Labh Party Plot', area: 'New VIP Road (5.4 km)', lat: 22.32, lng: 73.232, address: 'Labh Party Plot, New VIP Road, Vadodara, Gujarat 390022' },
  { name: 'Bansari Party Plot', area: 'Gotri-Sevasi (5.5 km)', lat: 22.318, lng: 73.129, address: 'Bansari Party Plot, Gotri-Sevasi Road, Vadodara, Gujarat 390021' },
  { name: 'Royal Party Plot', area: 'Kalali (5.2 km)', lat: 22.2687, lng: 73.1523, address: 'Royal Party Plot, Kalali Road, Vadodara, Gujarat 390012' },
  { name: 'Utsav Party Plot', area: 'Subhanpura (3.1 km)', lat: 22.3275, lng: 73.1611, address: 'Utsav Party Plot, Subhanpura, Vadodara, Gujarat 390023' },
  { name: 'Shreeji Party Plot', area: 'Atladara (4.5 km)', lat: 22.2764, lng: 73.1537, address: 'Shreeji Party Plot, Atladara, Vadodara, Gujarat 390012' },
  { name: 'Madhuban Party Plot', area: 'Sun Pharma Road (4.2 km)', lat: 22.274, lng: 73.161, address: 'Madhuban Party Plot, Sun Pharma Road, Atladara, Vadodara, Gujarat 390012' },
  { name: 'Kashi Party Plot', area: 'Manjalpur (3.9 km)', lat: 22.273, lng: 73.189, address: 'Kashi Party Plot, Manjalpur, Vadodara, Gujarat 390011' },
  { name: 'Mangalam Party Plot', area: 'Waghodia Road (5.9 km)', lat: 22.302, lng: 73.238, address: 'Mangalam Party Plot, Waghodia Road, Vadodara, Gujarat 390019' },
  { name: 'Nilkanth Party Plot', area: 'Chhani (6.8 km)', lat: 22.3687, lng: 73.1856, address: 'Nilkanth Party Plot, Chhani, Vadodara, Gujarat 391740' },
  { name: 'Swagat Party Plot', area: 'Akota (1.7 km)', lat: 22.2961, lng: 73.1706, address: 'Swagat Party Plot, Akota, Vadodara, Gujarat 390020' },
  { name: 'Shalimar Party Plot', area: 'Vasna Road (3.8 km)', lat: 22.2934, lng: 73.1472, address: 'Shalimar Party Plot, Vasna Road, Vadodara, Gujarat 390007' },
  { name: 'Golden Party Plot', area: 'Gotri (4.1 km)', lat: 22.316, lng: 73.142, address: 'Golden Party Plot, Gotri, Vadodara, Gujarat 390021' },
  { name: 'Sagar Party Plot', area: 'Maneja (8.1 km)', lat: 22.235, lng: 73.1945, address: 'Sagar Party Plot, Maneja, Vadodara, Gujarat 390013' },
  { name: 'Green Meadows Party Plot', area: 'Sevasi (7.1 km)', lat: 22.324, lng: 73.115, address: 'Green Meadows Party Plot, Sevasi, Vadodara, Gujarat 391101' },
  { name: 'Radhe Party Plot', area: 'Dabhoi Road (5.4 km)', lat: 22.28, lng: 73.225, address: 'Radhe Party Plot, Dabhoi Road, Vadodara, Gujarat 390025' },
  { name: 'Tulsi Party Plot', area: 'Ajwa Road (5.5 km)', lat: 22.31, lng: 73.235, address: 'Tulsi Party Plot, Ajwa Road, Vadodara, Gujarat 390019' },
  { name: 'Siddhi Party Plot', area: 'Harni-Sama (5.4 km)', lat: 22.345, lng: 73.215, address: 'Siddhi Party Plot, Harni-Sama Link Road, Vadodara, Gujarat 390022' },
  { name: 'Aakash Party Plot', area: 'Tarsali (6.9 km)', lat: 22.255, lng: 73.22, address: 'Aakash Party Plot, Tarsali Bypass, Vadodara, Gujarat 390009' },
  { name: 'Kabir Party Plot', area: 'Sevasi-Bhayli (5.9 km)', lat: 22.3, lng: 73.125, address: 'Kabir Party Plot, Sevasi-Bhayli Road, Vadodara, Gujarat 391410' },
  { name: 'Amar Party Plot', area: 'Old Padra Road (2.6 km)', lat: 22.2931, lng: 73.1615, address: 'Amar Party Plot, Old Padra Road, Vadodara, Gujarat 390020' },
  { name: 'Rameshwar Mahadev Temple', area: 'Ajwa Road (4.8 km)', lat: 22.312, lng: 73.228, address: 'Shri Rameshwar Mahadev Temple, Opp Block 93, Kishanwadi, Ajwa Road, Vadodara, Gujarat 390019' },

  // --- Industrial Zones (GIDCs) within 50 km ---
  { name: 'Makarpura GIDC', area: 'Industrial South (7 km)', lat: 22.2536, lng: 73.1953, address: 'Makarpura GIDC, Vadodara, Gujarat' },
  { name: 'Gorwa BIDC', area: 'Industrial West (5 km)', lat: 22.3381, lng: 73.1517, address: 'Gorwa BIDC, Vadodara, Gujarat' },
  { name: 'Por GIDC', area: 'Industrial South (15 km)', lat: 22.175, lng: 73.188, address: 'Por GIDC / Highway, Vadodara, Gujarat' },
  { name: 'Waghodia GIDC', area: 'Industrial East (16 km)', lat: 22.305, lng: 73.342, address: 'Waghodia GIDC, Vadodara, Gujarat' },
  { name: 'Ranoli GIDC', area: 'Industrial North (10 km)', lat: 22.385, lng: 73.135, address: 'Ranoli GIDC, Vadodara, Gujarat' },
  { name: 'Nandesari GIDC', area: 'Industrial North (14 km)', lat: 22.408, lng: 73.098, address: 'Nandesari GIDC, Vadodara, Gujarat' },
  { name: 'Manjusar GIDC', area: 'Industrial North East (17 km)', lat: 22.45, lng: 73.23, address: 'Manjusar GIDC, Savli, Vadodara, Gujarat' },
  { name: 'Halol GIDC', area: 'Industrial East (34 km)', lat: 22.49, lng: 73.45, address: 'Halol GIDC, Panchmahal / Vadodara, Gujarat' },
  { name: 'Karjan GIDC', area: 'Industrial South (29 km)', lat: 22.05, lng: 73.12, address: 'Karjan GIDC, Karjan, Vadodara, Gujarat' },
  { name: 'Koyali Refinery', area: 'Industrial North West (12 km)', lat: 22.368, lng: 73.12, address: 'Gujarat Refinery / IOCL Koyali, Vadodara, Gujarat' },

  // --- Surrounding Towns & Talukas within 50 km ---
  { name: 'Padra', area: 'Town (13 km)', lat: 22.24, lng: 73.08, address: 'Padra, Vadodara District, Gujarat' },
  { name: 'Karjan', area: 'Town (29 km)', lat: 22.05, lng: 73.12, address: 'Karjan, Vadodara District, Gujarat' },
  { name: 'Dabhoi', area: 'Town (29 km)', lat: 22.18, lng: 73.43, address: 'Dabhoi, Vadodara District, Gujarat' },
  { name: 'Halol', area: 'Town (36 km)', lat: 22.5, lng: 73.47, address: 'Halol, Panchmahal / Vadodara Road, Gujarat' },
  { name: 'Pavagadh', area: 'Pilgrimage (39 km)', lat: 22.46, lng: 73.52, address: 'Pavagadh Foothill, Panchmahal, Gujarat' },
  { name: 'Savli', area: 'Town (28 km)', lat: 22.56, lng: 73.22, address: 'Savli, Vadodara District, Gujarat' },
  { name: 'Jarod', area: 'Village (21 km)', lat: 22.42, lng: 73.35, address: 'Jarod, Waghodia Road, Vadodara, Gujarat' },
  { name: 'Varnama', area: 'Town (13 km)', lat: 22.19, lng: 73.19, address: 'Varnama, Vadodara District, Gujarat' },
  { name: 'Waghodia Town', area: 'Town (24 km)', lat: 22.3, lng: 73.42, address: 'Waghodia Town, Vadodara District, Gujarat' },
  { name: 'Dessar', area: 'Taluka (39 km)', lat: 22.65, lng: 73.25, address: 'Dessar, Vadodara District, Gujarat' },
  { name: 'Shinor', area: 'Taluka (47 km)', lat: 21.91, lng: 73.34, address: 'Shinor, Vadodara District, Gujarat' },
  { name: 'Sankheda', area: 'Taluka (44 km)', lat: 22.16, lng: 73.58, address: 'Sankheda, Chhota Udepur / Vadodara, Gujarat' },
  { name: 'Anklav', area: 'Town (21 km)', lat: 22.38, lng: 72.99, address: 'Anklav, Anand / Vadodara Border, Gujarat' },
  { name: 'Borsad', area: 'Town (31 km)', lat: 22.41, lng: 72.9, address: 'Borsad, Anand District, Gujarat' },
  { name: 'Anand', area: 'City (37 km)', lat: 22.56, lng: 72.95, address: 'Anand, Gujarat' },
]

/**
 * Search local landmarks within 50 km of Vadodara instantly without network.
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

    // Enforce 50 km radius limit
    const distance = calculateDistanceKm(item.lat, item.lng)
    if (distance > MAX_DELIVERY_RADIUS_KM) {
      continue
    }

    const itemObj = {
      id: 'landmark-' + String(i),
      label: item.address,
      resolvedAddress: item.address,
      lat: item.lat,
      lng: item.lng,
      distanceKm: Number(distance.toFixed(1)),
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
 * Fetch suggestions from Photon / OSM API strictly restricted to Vadodara + 50 km bbox.
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
    const bboxParam =
      String(VADODARA_50KM_BOUNDS.west) +
      ',' +
      String(VADODARA_50KM_BOUNDS.south) +
      ',' +
      String(VADODARA_50KM_BOUNDS.east) +
      ',' +
      String(VADODARA_50KM_BOUNDS.north)

    const url =
      'https://photon.komoot.io/api/?q=' +
      encodeURIComponent(clean) +
      '&bbox=' +
      bboxParam +
      '&lat=' +
      String(VADODARA_COORDINATES.lat) +
      '&lon=' +
      String(VADODARA_COORDINATES.lng) +
      '&limit=' +
      String(limit * 2)

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
        // Enforce strict 50 km radius limit from Vadodara center
        const distance = calculateDistanceKm(lat, lng)
        if (distance > MAX_DELIVERY_RADIUS_KM) {
          continue
        }

        const parts = []
        if (props.name) parts.push(props.name)
        if (props.street && props.street !== props.name) parts.push(props.street)
        if (props.district && props.district !== props.name) parts.push(props.district)
        if (props.city && props.city !== props.name) parts.push(props.city)
        if (props.state && props.state !== 'Gujarat') parts.push(props.state)

        const label = parts.length > 0 ? parts.join(', ') : 'Vadodara Area Location'

        results.push({
          id: 'osm-' + String(props.osm_id || i),
          label: label,
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          distanceKm: Number(distance.toFixed(1)),
          mapLink: 'https://www.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6),
          source: 'osm',
        })

        if (results.length >= limit) {
          break
        }
      }
    }

    return results
  } catch (_e) {
    clearTimeout(timeoutId)
    return []
  }
}
