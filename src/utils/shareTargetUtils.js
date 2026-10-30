/**
 * Utility functions for handling Android Web Share Target payloads and
 * extracting phone numbers, contact names, and map locations.
 */
import { parseGoogleMapsLocation, extractGoogleMapsUrl } from './locationUtils'

const INDIA_PHONE_REGEX = /(?:(?:\+?91|0)?[ -]?)?([6-9]\d{2}[ -]?\d{3}[ -]?\d{4}|[6-9]\d{4}[ -]?\d{5}|[6-9]\d{9})\b/

/**
 * Extracts a clean 10-digit Indian phone number from arbitrary text/URL.
 * Supports +91, leading 0, hyphens, spaces, tel: links, etc.
 *
 * @param {string} text
 * @returns {string} 10-digit phone number or empty string
 */
export const extractPhoneNumber = (text) => {
  if (!text || typeof text !== 'string') return ''

  // 1. Direct tel: link pattern
  const telMatch = text.match(/tel:(?:\+?91|0)?([6-9]\d{9})/i)
  if (telMatch && telMatch[1]) return telMatch[1]

  // 2. Scan for Indian 10-digit pattern
  const match = text.match(INDIA_PHONE_REGEX)
  if (match && match[1]) {
    const clean = match[1].replace(/\D/g, '')
    if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) {
      return clean
    }
  }

  // 3. Fallback: strip everything except digits and test length
  const digitsOnly = text.replace(/\D/g, '')
  if (digitsOnly.length === 10 && /^[6-9]\d{9}$/.test(digitsOnly)) {
    return digitsOnly
  }
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    const candidate = digitsOnly.slice(1)
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate
  }
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    const candidate = digitsOnly.slice(2)
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate
  }

  return ''
}

/**
 * Extracts a probable contact name from share payload (title or text).
 *
 * @param {Object} param0
 * @param {string} [param0.title]
 * @param {string} [param0.text]
 * @param {string} [param0.phone]
 * @returns {string}
 */
export const extractNameFromShare = ({ title = '', text = '', phone = '' } = {}) => {
  const cleanTitle = (title || '').trim()
  const cleanText = (text || '').trim()

  // 1. If title is provided and doesn't look like just the phone number, use title
  if (cleanTitle) {
    const titleDigits = cleanTitle.replace(/\D/g, '')
    const isJustPhoneNumber = (phone && titleDigits === phone) || /^[0-9+ -]+$/.test(cleanTitle)
    if (!isJustPhoneNumber) {
      return cleanTitle
    }
  }

  // 2. If text contains "Name: Phone" or "Name - Phone"
  if (cleanText) {
    // 1. If text contains "Contact: Name" or "Name: Name"
    const contactMatch = cleanText.match(/(?:contact|name|client):\s*([^,\n\r]+)/i)
    if (contactMatch && contactMatch[1]) {
      const parsed = contactMatch[1].trim()
      if (parsed && !/^[0-9+ -]+$/.test(parsed)) {
        return parsed
      }
    }

    // 2. If text contains "Name: Phone" or "Name - Phone"
    const delimiterMatch = cleanText.match(/^([^:\n\r-]+)[:\-–]\s*(.*)$/)
    if (delimiterMatch) {
      const candidateName = delimiterMatch[1].trim()
      const isKeyword = /^(contact|name|client|mobile|phone|tel)$/i.test(candidateName)
      if (!isKeyword && candidateName && !/^[0-9+ -]+$/.test(candidateName)) {
        return candidateName
      }
    }
  }

  return ''
}

/**
 * Parses URL query parameters for Web Share Target GET requests.
 * Standard params: share_text, text, share_title, title, share_url, url, mapLink, geo.
 *
 * @param {string} search - window.location.search or query string
 * @returns {Object|null}
 */
export const parseShareTargetUrl = (search = '') => {
  if (!search) return null

  let query = search
  if (query.startsWith('?')) query = query.slice(1)
  if (!query) return null

  const params = new URLSearchParams(query)

  const rawText = params.get('share_text') || params.get('text') || ''
  const rawTitle = params.get('share_title') || params.get('title') || ''
  const rawUrl =
    params.get('share_url') ||
    params.get('url') ||
    params.get('mapLink') ||
    params.get('map') ||
    params.get('location') ||
    params.get('geo') ||
    ''

  if (!rawText && !rawTitle && !rawUrl) {
    return null
  }

  const combined = [rawTitle, rawText, rawUrl].filter(Boolean).join(' ')
  const phone =
    extractPhoneNumber(rawText) ||
    extractPhoneNumber(rawTitle) ||
    extractPhoneNumber(rawUrl) ||
    extractPhoneNumber(combined)
  const name = extractNameFromShare({ title: rawTitle, text: rawText, phone })

  // Extract Google Maps URL and coordinates (for New Order mapLink integration)
  const mapLink =
    extractGoogleMapsUrl(rawUrl) ||
    extractGoogleMapsUrl(rawText) ||
    extractGoogleMapsUrl(rawTitle) ||
    extractGoogleMapsUrl(combined) ||
    ''

  let locationLat = null
  let locationLng = null
  if (mapLink) {
    const locParsed =
      parseGoogleMapsLocation(mapLink) ||
      parseGoogleMapsLocation(rawUrl) ||
      parseGoogleMapsLocation(rawText)
    if (locParsed?.lat !== null && locParsed?.lat !== undefined) {
      locationLat = locParsed.lat
      locationLng = locParsed.lng
    }
  }

  return {
    rawText,
    rawTitle,
    rawUrl,
    phone,
    name,
    mapLink,
    locationLat,
    locationLng,
    hasMapLink: Boolean(mapLink),
    isShareTarget: true,
  }
}

/**
 * Checks if a given phone number already exists in active clients or leads.
 *
 * @param {string} phone - 10-digit normalized phone
 * @param {Object} collections
 * @param {Array} [collections.clients]
 * @param {Array} [collections.leads]
 * @returns {Object}
 */
export const checkNumberCollisions = (phone, { clients = [], leads = [] } = {}) => {
  if (!phone || typeof phone !== 'string') {
    return { isClient: false, client: null, isLead: false, lead: null }
  }

  const cleanPhone = phone.replace(/\D/g, '').slice(-10)
  if (!cleanPhone) {
    return { isClient: false, client: null, isLead: false, lead: null }
  }

  // Check Clients
  let matchedClient = null
  for (const c of clients) {
    if (!c) continue
    const cPhone = String(c.mobile || c.phone || c.contact || '').replace(/\D/g, '').slice(-10)
    if (cPhone && cPhone === cleanPhone) {
      matchedClient = c
      break
    }
  }

  // Check Leads
  let matchedLead = null
  for (const l of leads) {
    if (!l) continue
    const lPhone = String(l.mobile || l.phone || '').replace(/\D/g, '').slice(-10)
    if (lPhone && lPhone === cleanPhone) {
      matchedLead = l
      break
    }
  }

  return {
    isClient: Boolean(matchedClient),
    client: matchedClient,
    isLead: Boolean(matchedLead),
    lead: matchedLead,
  }
}

/**
 * IndexedDB storage utilities for Web Share Target Level 2 (POST file/image transfers from Android Share Sheet).
 */
export const SHARE_DB_NAME = 'anjani-share-store'
export const SHARE_STORE_NAME = 'shared-items'
export const SHARE_RECORD_KEY = 'latest-share'

export const openShareDb = () => {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      return resolve(null)
    }
    try {
      const request = indexedDB.open(SHARE_DB_NAME, 1)
      request.onupgradeneeded = (event) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
          db.createObjectStore(SHARE_STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Retrieves the latest shared record (file/text from GPay or Android Share) and removes it from IndexedDB.
 *
 * @returns {Promise<Object|null>}
 */
export const getLatestSharedRecord = async () => {
  try {
    const db = await openShareDb()
    if (!db) return null
    return new Promise((resolve) => {
      const tx = db.transaction(SHARE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(SHARE_STORE_NAME)
      const req = store.get(SHARE_RECORD_KEY)
      req.onsuccess = () => {
        const result = req.result
        if (result) {
          // Immediately delete so page reloads do not re-trigger
          store.delete(SHARE_RECORD_KEY)
        }
        resolve(result || null)
      }
      req.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn('Could not read shared record from DB:', err)
    return null
  }
}

/**
 * Saves a shared record to IndexedDB (used by tests and Service Worker).
 *
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
export const saveSharedRecord = async (data) => {
  try {
    const db = await openShareDb()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(SHARE_STORE_NAME, 'readwrite')
      const store = tx.objectStore(SHARE_STORE_NAME)
      const req = store.put(data, SHARE_RECORD_KEY)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch (err) {
    console.warn('Could not save shared record to DB:', err)
    return false
  }
}
