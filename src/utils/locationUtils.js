/**
 * Google Maps location parsing and URL helpers.
 * Robustly parses URLs, coordinate strings, and landmarks.
 */

export function parseGoogleMapsLocation(input) {
  if (!input || typeof input !== 'string') return null
  const str = input.trim()
  if (!str) return null

  // 1. Lat/Lng regex matching: standard decimal degrees
  // e.g. "22.3072, 73.1812" or "22.3072,73.1812" or "@22.3072,73.1812" or "?q=22.3072,73.1812"
  const coordRegex = /(?:@|\?q=|loc:)?\s*([-+]?[1-8]?\d(?:\.\d+)?|90(?:\.0+)?)[,\s]+([-+]?(?:180(?:\.0+)?|(?:1[0-7]\d|\d{1,2})(?:\.\d+)?))/i
  const coordMatch = str.match(coordRegex)

  if (coordMatch) {
    const lat = parseFloat(coordMatch[1])
    const lng = parseFloat(coordMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const isUrl = str.startsWith('http://') || str.startsWith('https://')
      return {
        lat,
        lng,
        mapLink: isUrl ? str : `https://www.google.com/maps?q=${lat},${lng}`,
        raw: str,
      }
    }
  }

  // 2. Short links or named query links: https://maps.app.goo.gl/... or https://goo.gl/maps/...
  if (
    /^https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
      str,
    )
  ) {
    return {
      lat: null,
      lng: null,
      mapLink: str,
      raw: str,
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
