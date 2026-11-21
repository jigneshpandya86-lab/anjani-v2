import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'
import { normalizeCoordinate } from './locationUtils'

export const normalizeOrderWriteData = (data = {}, isUpdate = false) => {
  const result = { ...data }

  if (isUpdate) {
    if (data.address !== undefined) {
      result.address = String(data.address || '').trim()
    }
    if (data.location !== undefined) {
      result.location = String(data.location || '').trim()
    }
    if (result.address && !result.location) {
      result.location = result.address
    } else if (result.location && !result.address) {
      result.address = result.location
    }
    if (data.mapLink !== undefined) {
      result.mapLink = String(data.mapLink || '').trim()
    }
    if (data.locationLat !== undefined) {
      result.locationLat = normalizeCoordinate(data.locationLat)
    }
    if (data.locationLng !== undefined) {
      result.locationLng = normalizeCoordinate(data.locationLng)
    }
  } else {
    const rawAddr = data.address === undefined ? '' : String(data.address).trim()
    const rawLoc = data.location === undefined ? '' : String(data.location).trim()
    result.address = rawAddr || rawLoc
    result.location = rawLoc || rawAddr
    result.mapLink = data.mapLink === undefined ? '' : String(data.mapLink).trim()
    result.locationLat = normalizeCoordinate(data.locationLat)
    result.locationLng = normalizeCoordinate(data.locationLng)
  }

  if (data.date !== undefined) {
    if (typeof data.date === 'string' && data.date.includes('T')) {
      const parsed = new Date(data.date)
      if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear()
        const mm = String(parsed.getMonth() + 1).padStart(2, '0')
        const dd = String(parsed.getDate()).padStart(2, '0')
        result.date = `${yyyy}-${mm}-${dd}`
        if (!result.time) {
          result.time = `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
        }
      }
    } else if (data.date instanceof Date) {
      const yyyy = data.date.getFullYear()
      const mm = String(data.date.getMonth() + 1).padStart(2, '0')
      const dd = String(data.date.getDate()).padStart(2, '0')
      result.date = `${yyyy}-${mm}-${dd}`
      if (!result.time) {
        result.time = `${String(data.date.getHours()).padStart(2, '0')}:${String(data.date.getMinutes()).padStart(2, '0')}`
      }
    }
  }

  if (!result.date && data.deliveryDate) {
    result.date = data.deliveryDate
  }
  if (!result.deliveryDate && result.date) {
    result.deliveryDate = result.date
  }
  if (!result.time && (data.deliveryTime || data.preferredTime || data.preferred_time)) {
    result.time = data.deliveryTime || data.preferredTime || data.preferred_time
  }
  if (!result.deliveryTime && result.time) {
    result.deliveryTime = result.time
  }
  if (result.time) {
    result.time = normalizeTimeToHHmm(result.time, result.time)
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    result.items = data.items.map((it) => {
      const itQty = Number(it.qty) || 0
      const itRate = Number(it.rate) || 0
      const itSku = it.sku || DEFAULT_SKU
      const itMeta = getSkuMeta(itSku)
      return {
        sku: itSku,
        qty: itQty,
        rate: itRate,
        amount: itQty * itRate,
        unit: it.unit || itMeta.unit,
      }
    })
    result.totalQty = result.items.reduce((sum, it) => sum + it.qty, 0)
    result.totalAmount = result.items.reduce((sum, it) => sum + it.amount, 0)
    result.qty = result.totalQty
    result.rate =
      Number(data.rate) ||
      (result.totalQty > 0 ? Math.round((result.totalAmount / result.totalQty) * 100) / 100 : 0)
    result.sku =
      result.items.length === 1 ? result.items[0].sku : result.items.map((it) => it.sku).join(', ')
  }

  return result
}

export const getNormalizedOrderStatus = (status) => {
  if (!status) return 'Pending'
  const s = String(status).trim().toLowerCase()
  if (s === 'delivered') return 'Delivered'
  if (s === 'confirmed') return 'Confirmed'
  if (s === 'pending' || s === 'open' || s === 'legacy') return 'Pending'
  return status
}

export const normalizeOrderDoc = (raw = {}) => {
  const hasLegacyProducedDelivered = raw.produced !== undefined || raw.delivered !== undefined
  const hasDirectQty =
    raw.qty !== undefined || raw.boxes !== undefined || raw.quantity !== undefined
  let baseQty = Number(raw.qty || raw.boxes || raw.quantity) || 0

  if (hasLegacyProducedDelivered && !hasDirectQty) {
    baseQty = (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
  }

  const rawItems = Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : null
  let items = []
  if (rawItems) {
    items = rawItems.map((it) => {
      const itQty = Number(it.qty) || 0
      const itRate = Number(it.rate) || 0
      const itSku = it.sku || DEFAULT_SKU
      const itMeta = getSkuMeta(itSku)
      return {
        sku: itSku,
        qty: itQty,
        rate: itRate,
        amount: itQty * itRate,
        unit: it.unit || itMeta.unit,
      }
    })
  } else {
    const primarySku = raw.sku || raw.product || DEFAULT_SKU
    const itMeta = getSkuMeta(primarySku)
    const itRate = Number(raw.rate) || 0
    items = [
      {
        sku: primarySku,
        qty: baseQty,
        rate: itRate,
        amount: baseQty * itRate,
        unit: itMeta.unit,
      },
    ]
  }

  const totalQty = items.reduce((sum, it) => sum + it.qty, 0)
  const totalAmount =
    raw.totalAmount !== undefined
      ? Number(raw.totalAmount)
      : items.reduce((sum, it) => sum + it.amount, 0)

  const skuSummary =
    items.length === 1
      ? items[0].sku
      : items.map((it) => `${it.qty}× ${it.sku}`).join(', ')

  return {
    ...raw,
    items,
    totalQty,
    totalAmount,
    qty: totalQty,
    sku: raw.sku || skuSummary,
    status: getNormalizedOrderStatus(raw.status),
    rate:
      Number(raw.rate) ||
      (totalQty > 0 ? Math.round((totalAmount / totalQty) * 100) / 100 : 0),
    date: raw.date || raw.deliveryDate || raw.orderDate || '',
    time: raw.time || raw.deliveryTime || '',
    clientId: raw.clientId || raw.customerId || '',
    address: raw.address || raw.deliveryAddress || raw.location || '',
    location:
      raw.location ||
      raw.googleLocation ||
      raw.locationName ||
      raw.mapLink ||
      raw.googleMap ||
      '',
    mapLink: raw.mapLink || raw.googleMap || '',
    locationLat: normalizeCoordinate(raw.locationLat ?? raw.lat),
    locationLng: normalizeCoordinate(raw.locationLng ?? raw.lng),
  }
}

export const getOrderSortTime = (o) => {
  if (!o) return 0
  try {
    const ts = o.createdAt
    if (ts?.toMillis && typeof ts.toMillis === 'function') return ts.toMillis()
    if (Number.isFinite(ts?.seconds)) return ts.seconds * 1000
    const d = o.date || o.orderDate || o.deliveryDate || ''
    const t = d ? new Date(d).getTime() : 0
    return Number.isFinite(t) ? t : 0
  } catch {
    return 0
  }
}

export const resolveOrderInitialData = (orderToEdit, clients = []) => {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const localDate = `${yyyy}-${mm}-${dd}`
  const hh = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const localTime = `${hh}:${min}`

  if (!orderToEdit || Object.keys(orderToEdit).length === 0) {
    return {
      clientId: '',
      date: localDate,
      time: localTime,
      address: '',
      location: '',
      mapLink: '',
      locationLat: null,
      locationLng: null,
      proofUrl: '',
    }
  }

  const clientId = orderToEdit.clientId || orderToEdit.customerId || ''
  const selectedClient = clients.find((c) => c.id === clientId)

  const resolvedAddress = String(
    orderToEdit.address ||
    orderToEdit.deliveryAddress ||
    orderToEdit.location ||
    orderToEdit.locationName ||
    orderToEdit.googleLocation ||
    orderToEdit.area ||
    selectedClient?.address ||
    selectedClient?.deliveryAddress ||
    selectedClient?.location ||
    ''
  ).trim()

  const resolvedLocation = String(
    orderToEdit.location ||
    orderToEdit.googleLocation ||
    orderToEdit.locationName ||
    selectedClient?.location ||
    selectedClient?.mapLink ||
    ''
  ).trim()

  const resolvedMapLink = String(
    orderToEdit.mapLink ||
    orderToEdit.googleMap ||
    selectedClient?.mapLink ||
    ''
  ).trim()

  const lat = normalizeCoordinate(
    orderToEdit.locationLat ??
    orderToEdit.lat ??
    selectedClient?.locationLat
  )
  const lng = normalizeCoordinate(
    orderToEdit.locationLng ??
    orderToEdit.lng ??
    selectedClient?.locationLng
  )

  const rawTime =
    orderToEdit.time ||
    orderToEdit.deliveryTime ||
    orderToEdit.preferredTime ||
    orderToEdit.preferred_time ||
    orderToEdit.delivery_time ||
    ''

  const resolvedTime = normalizeTimeToHHmm(rawTime, localTime)

  return {
    clientId,
    date: orderToEdit.date || orderToEdit.deliveryDate || orderToEdit.orderDate || localDate,
    time: resolvedTime,
    deliveryTime: orderToEdit.deliveryTime || resolvedTime,
    deliveryDate: orderToEdit.deliveryDate || orderToEdit.date || orderToEdit.orderDate || localDate,
    address: resolvedAddress,
    location: resolvedLocation,
    mapLink: resolvedMapLink,
    locationLat: lat,
    locationLng: lng,
    proofUrl: orderToEdit.proofUrl || '',
  }
}

export const formatNarrationDate = (dateVal) => {
  if (!dateVal) return ''
  let d = dateVal
  if (d && typeof d.toDate === 'function') d = d.toDate()
  else if (d && d.seconds) d = new Date(d.seconds * 1000)
  else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
    const [yyyy, mm, dd] = d.trim().split('-')
    return `${dd}/${mm}/${yyyy}`
  } else if (!(d instanceof Date)) d = new Date(d)

  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export const formatPaymentNarration = (clientName, dateVal, customNote = '') => {
  const formattedDate = formatNarrationDate(dateVal) || formatNarrationDate(new Date())
  const name = String(clientName || '').trim()
  let base = name
    ? `Payment received for "${name}" on ${formattedDate}`
    : `Payment received on ${formattedDate}`

  const cleanNote = String(customNote || '').trim()
  if (
    cleanNote &&
    !cleanNote.toLowerCase().startsWith('payment received') &&
    !base.toLowerCase().includes(cleanNote.toLowerCase())
  ) {
    base = `${base} (${cleanNote})`
  }
  return base
}

export const getRecentSkuPrice = (skuLabelOrId, orders = [], clientId = null) => {
  try {
    if (!Array.isArray(orders) || orders.length === 0) return 0
    const targetMeta = getSkuMeta(skuLabelOrId)
    if (!targetMeta?.id) return 0

    // 1. If clientId provided, check client's most recent order for this SKU first
    if (clientId) {
      const clientOrders = orders
        .filter(
          (o) =>
            o &&
            (o.clientId === clientId || o.customerId === clientId) &&
            o.status !== 'Cancelled',
        )
        .sort((a, b) => getOrderSortTime(b) - getOrderSortTime(a))

      for (const ord of clientOrders) {
        if (!ord) continue
        if (Array.isArray(ord.items) && ord.items.length > 0) {
          const item = ord.items.find(
            (it) => it && (it.sku || it.name || it.label) && getSkuMeta(it.sku || it.name || it.label)?.id === targetMeta.id,
          )
          if (item && Number(item.rate) > 0) return Number(item.rate)
        } else if (
          ord.sku &&
          getSkuMeta(ord.sku)?.id === targetMeta.id &&
          Number(ord.rate) > 0
        ) {
          return Number(ord.rate)
        }
      }
    }

    // 2. Check across all recent orders (sorted newest to oldest)
    const sortedOrders = [...orders]
      .filter((o) => o && o.status !== 'Cancelled')
      .sort((a, b) => getOrderSortTime(b) - getOrderSortTime(a))

    for (const ord of sortedOrders) {
      if (!ord) continue
      if (Array.isArray(ord.items) && ord.items.length > 0) {
        const item = ord.items.find(
          (it) => it && (it.sku || it.name || it.label) && getSkuMeta(it.sku || it.name || it.label)?.id === targetMeta.id,
        )
        if (item && Number(item.rate) > 0) return Number(item.rate)
      } else if (
        ord.sku &&
        getSkuMeta(ord.sku)?.id === targetMeta.id &&
        Number(ord.rate) > 0
      ) {
        return Number(ord.rate)
      }
    }

    return 0
  } catch (err) {
    console.error('getRecentSkuPrice error:', err)
    return 0
  }
}

/**
 * Natural language date parser for conversational order booking and rescheduling.
 * Parses "Date 28 November", "28 Nov", "tomorrow", "today", "28-11-2026", etc.
 * Strictly NO REGEX used.
 */
export function parseNaturalDate(input, referenceDate = new Date()) {
  if (!input || typeof input !== 'string') return null
  const str = input.toLowerCase().trim()
  if (!str) return null

  // Fast exact match for relative dates
  if (str === 'today' || str === 'aaj') {
    const y = referenceDate.getFullYear()
    const m = String(referenceDate.getMonth() + 1).padStart(2, '0')
    const d = String(referenceDate.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (str === 'tomorrow' || str === 'kal') {
    const tmrw = new Date(referenceDate)
    tmrw.setDate(tmrw.getDate() + 1)
    const y = tmrw.getFullYear()
    const m = String(tmrw.getMonth() + 1).padStart(2, '0')
    const d = String(tmrw.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (str === 'day after tomorrow' || str === 'parso') {
    const dayAfter = new Date(referenceDate)
    dayAfter.setDate(dayAfter.getDate() + 2)
    const y = dayAfter.getFullYear()
    const m = String(dayAfter.getMonth() + 1).padStart(2, '0')
    const d = String(dayAfter.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Handle months
  const months = [
    ['january', 'jan', '01'],
    ['february', 'feb', '02'],
    ['march', 'mar', '03'],
    ['april', 'apr', '04'],
    ['may', 'may', '05'],
    ['june', 'jun', '06'],
    ['july', 'jul', '07'],
    ['august', 'aug', '08'],
    ['september', 'sep', '09'],
    ['october', 'oct', '10'],
    ['november', 'nov', '11'],
    ['december', 'dec', '12'],
  ]

  let matchedMonthNum = ''
  for (let i = 0; i < months.length; i++) {
    const [longName, shortName, mNum] = months[i]
    if (str.includes(longName) || str.includes(shortName)) {
      matchedMonthNum = mNum
      break
    }
  }

  if (matchedMonthNum) {
    const tokens = str.split(' ')
    let day = null
    for (let t = 0; t < tokens.length; t++) {
      let tok = tokens[t].trim()
      if (
        tok.endsWith('th') ||
        tok.endsWith('st') ||
        tok.endsWith('nd') ||
        tok.endsWith('rd')
      ) {
        tok = tok.slice(0, tok.length - 2)
      }
      const parsedNum = parseInt(tok, 10)
      if (Number.isFinite(parsedNum) && parsedNum >= 1 && parsedNum <= 31) {
        day = parsedNum
        break
      }
    }
    if (day !== null) {
      const year = referenceDate.getFullYear()
      const dayStr = day < 10 ? '0' + String(day) : String(day)
      return `${year}-${matchedMonthNum}-${dayStr}`
    }
  }

  // Handle standard YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY
  if (str.includes('-') || str.includes('/')) {
    const sep = str.includes('-') ? '-' : '/'
    const parts = str.split(sep)
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const y = parts[0]
        const m = parts[1].padStart(2, '0')
        const d = parts[2].padStart(2, '0')
        return `${y}-${m}-${d}`
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY
        const d = parts[0].padStart(2, '0')
        const m = parts[1].padStart(2, '0')
        const y = parts[2]
        return `${y}-${m}-${d}`
      }
    }
  }

  return null
}

/**
 * Normalizes any natural language or 12h/24h time string into standard HH:mm format.
 * Suitable for HTML <input type="time"> and 24-hour chronological sorting.
 * Handles:
 * - Time slots/ranges: "4:00 PM – 5:00 PM", "4 PM to 5 PM", "11 AM - 12 PM" (extracts start time)
 * - 12h formats: "4:00 PM", "4:30 pm", "4 PM", "11 AM", "9 AM", "1 PM", "12 PM", "12 AM"
 * - 24h formats: "16:00", "16:00:00", "09:30"
 * - Gujarati / colloquial: "sanje" / "સાંજે" -> "16:00", "savare" / "સવારે" -> "09:00", "bapore" / "બપોરે" -> "13:00", "night" / "રાત્રે" -> "20:00"
 * - Date objects and ISO strings with "T"
 * Strictly NO REGEX used.
 */
export function normalizeTimeToHHmm(rawTime, fallback = '') {
  if (rawTime === null || rawTime === undefined) {
    return fallback
  }

  if (rawTime instanceof Date && !isNaN(rawTime.getTime())) {
    const hh = String(rawTime.getHours()).padStart(2, '0')
    const mm = String(rawTime.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  if (typeof rawTime !== 'string') {
    return fallback
  }

  let s = rawTime.trim()
  if (!s || s === 'N/A' || s === 'null' || s === 'undefined') {
    return fallback
  }

  // If ISO date string, extract time
  if (s.includes('T')) {
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      const hh = String(parsed.getHours()).padStart(2, '0')
      const mm = String(parsed.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }
  }

  // Handle range / slot: "4:00 PM – 5:00 PM", "4 PM to 5 PM", "11 AM - 12 PM"
  if (s.includes('–')) {
    s = s.split('–')[0].trim()
  } else if (s.includes('—')) {
    s = s.split('—')[0].trim()
  } else {
    const toIdx = s.toLowerCase().indexOf(' to ')
    if (toIdx !== -1) {
      s = s.slice(0, toIdx).trim()
    } else if (s.includes(' - ')) {
      s = s.split(' - ')[0].trim()
    } else if (s.includes('-') && !s.startsWith('20') && !s.startsWith('19')) {
      s = s.split('-')[0].trim()
    }
  }

  const lower = s.toLowerCase()

  // Gujarati / colloquial shortcuts
  if (
    lower.includes('sanje') ||
    lower.includes('saanj') ||
    lower.includes('evening') ||
    lower.includes('shyam') ||
    lower.includes('સાંજે') ||
    lower.includes('સાંજ')
  ) {
    return '16:00'
  }
  if (
    lower.includes('savare') ||
    lower.includes('sakal') ||
    lower.includes('morning') ||
    lower.includes('સવારે') ||
    lower.includes('સવાર')
  ) {
    return '09:00'
  }
  if (
    lower.includes('bapore') ||
    lower.includes('dupahar') ||
    lower.includes('afternoon') ||
    lower.includes('બપોરે') ||
    lower.includes('બપોર')
  ) {
    return '13:00'
  }
  if (
    lower.includes('night') ||
    lower.includes('raat') ||
    lower.includes('raatre') ||
    lower.includes('રાત્રે') ||
    lower.includes('રાત')
  ) {
    return '20:00'
  }

  const isPM = lower.includes('pm') || lower.includes('p.m.')
  const isAM = lower.includes('am') || lower.includes('a.m.')

  let clean = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ((ch >= '0' && ch <= '9') || ch === ':') {
      clean += ch
    }
  }

  if (clean.includes(':')) {
    const parts = clean.split(':')
    let hours = parseInt(parts[0], 10)
    let minutes = parseInt(parts[1], 10) || 0
    if (isNaN(hours)) return fallback

    if (isPM && hours < 12) hours += 12
    else if (isAM && hours === 12) hours = 0

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  } else if (clean.length > 0) {
    let hours = parseInt(clean, 10)
    let minutes = 0
    if (isNaN(hours)) return fallback

    if (isPM && hours < 12) hours += 12
    else if (isAM && hours === 12) hours = 0

    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }
  }

  return fallback
}

