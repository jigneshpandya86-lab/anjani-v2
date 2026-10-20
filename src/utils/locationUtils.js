/**
 * Google Maps location parsing and URL helpers.
 * Robustly parses URLs, coordinate strings, and landmarks.
 */

export function extractGoogleMapsUrl(input) {
  if (!input || typeof input !== 'string') return ''
  const str = input.trim()
  if (!str) return ''

  // 1. Direct or embedded Google Maps URL
  const urlMatch = str.match(
    /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s<>"')*]*/i,
  )
  if (urlMatch) {
    return urlMatch[0]
  }

  // 2. geo: URI scheme (e.g. geo:22.3072,73.1812 or geo:0,0?q=22.3072,73.1812)
  const geoMatch = str.match(
    /geo:(?:0,0\?q=)?\s*([-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))/i,
  )
  if (geoMatch) {
    const lat = parseFloat(geoMatch[1])
    const lng = parseFloat(geoMatch[2])
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return `https://www.google.com/maps?q=${lat},${lng}`
    }
  }

  // 3. Raw decimal coordinates string like "22.3072, 73.1812"
  const parsed = parseGoogleMapsLocation(str)
  if (parsed?.mapLink && parsed.lat !== null && parsed.lng !== null) {
    return parsed.mapLink
  }

  return ''
}

export function parseGoogleMapsLocation(input) {
  if (!input || typeof input !== 'string') return null
  const str = input.trim()
  if (!str) return null

  // 1. First check for embedded or direct Google Maps URLs
  const urlMatch = str.match(
    /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s<>"')*]*/i,
  )
  if (urlMatch) {
    const url = urlMatch[0]
    // Check if coordinates exist in query or path (e.g. ?q=22.3072,73.1812 or @22.3072,73.1812)
    const urlCoordMatch = url.match(
      /(?:@|\?q=|loc:)\s*([-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))/i,
    )
    let lat = null
    let lng = null
    if (urlCoordMatch) {
      const parsedLat = parseFloat(urlCoordMatch[1])
      const parsedLng = parseFloat(urlCoordMatch[2])
      if (
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180
      ) {
        lat = parsedLat
        lng = parsedLng
      }
    }
    return {
      lat,
      lng,
      mapLink: url,
      raw: str,
    }
  }

  // 2. geo: URI scheme (e.g. geo:22.3072,73.1812 or geo:0,0?q=22.3072,73.1812)
  const geoMatch = str.match(
    /geo:(?:0,0\?q=)?\s*([-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))/i,
  )
  if (geoMatch) {
    const lat = parseFloat(geoMatch[1])
    const lng = parseFloat(geoMatch[2])
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return {
        lat,
        lng,
        mapLink: `https://www.google.com/maps?q=${lat},${lng}`,
        raw: str,
      }
    }
  }

  // 3. Decimal coordinates (e.g. "22.3072, 73.1812" or "@22.3072,73.1812")
  // Requires decimal points to avoid matching Indian phone numbers like "+91 98250 12345"
  const hasPrefix = /(?:@|\?q=|loc:)/i.test(str)
  const coordRegex = hasPrefix
    ? /(?:@|\?q=|loc:)\s*([-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?))[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))/i
    : /(?:^|[\s,;])([-+]?(?:[1-8]?\d\.\d+|90\.0+))[,\s]+([-+]?(?:1[0-7]\d\.\d+|\d{1,2}\.\d+|180\.0+))/i

  const coordMatch = str.match(coordRegex)
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1])
    const lng = parseFloat(coordMatch[2])
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      const isUrl = str.startsWith('http://') || str.startsWith('https://')
      return {
        lat,
        lng,
        mapLink: isUrl ? str : `https://www.google.com/maps?q=${lat},${lng}`,
        raw: str,
      }
    }
  }

  return null
}

export function buildGoogleMapsUrl(lat, lng, address) {
  if (
    lat !== null &&
    lat !== undefined &&
    lat !== '' &&
    lng !== null &&
    lng !== undefined &&
    lng !== '' &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  ) {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }
  const cleanAddr = String(address || '').trim()
  if (cleanAddr) {
    if (cleanAddr.startsWith('http://') || cleanAddr.startsWith('https://')) {
      return cleanAddr
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddr)}`
  }
  return null
}
