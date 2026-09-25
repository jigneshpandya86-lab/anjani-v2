import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'

export const normalizeOrderWriteData = (data = {}, isUpdate = false) => {
  const result = { ...data }

  if (isUpdate) {
    if (data.address !== undefined) {
      result.address = String(data.address || '').trim()
    }
    if (data.location !== undefined) {
      result.location = String(data.location || '').trim()
    }
    if (data.mapLink !== undefined) {
      result.mapLink = String(data.mapLink || '').trim()
    }
    if (data.locationLat !== undefined) {
      result.locationLat = Number.isFinite(Number(data.locationLat)) ? Number(data.locationLat) : null
    }
    if (data.locationLng !== undefined) {
      result.locationLng = Number.isFinite(Number(data.locationLng)) ? Number(data.locationLng) : null
    }
  } else {
    result.address = data.address === undefined ? '' : String(data.address).trim()
    result.location = data.location === undefined ? '' : String(data.location).trim()
    result.mapLink = data.mapLink === undefined ? '' : String(data.mapLink).trim()
    result.locationLat = Number.isFinite(Number(data.locationLat)) ? Number(data.locationLat) : null
    result.locationLng = Number.isFinite(Number(data.locationLng)) ? Number(data.locationLng) : null
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
    locationLat: Number.isFinite(Number(raw.locationLat ?? raw.lat))
      ? Number(raw.locationLat ?? raw.lat)
      : null,
    locationLng: Number.isFinite(Number(raw.locationLng ?? raw.lng))
      ? Number(raw.locationLng ?? raw.lng)
      : null,
  }
}

export const getOrderSortTime = (o) => {
  if (!o) return 0
  const ts = o.createdAt
  if (ts?.toMillis) return ts.toMillis()
  if (ts?.seconds) return ts.seconds * 1000
  const d = o.date || o.orderDate || o.deliveryDate || ''
  return d ? new Date(d).getTime() : 0
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

  const lat = Number(
    orderToEdit.locationLat ??
    orderToEdit.lat ??
    selectedClient?.locationLat
  )
  const lng = Number(
    orderToEdit.locationLng ??
    orderToEdit.lng ??
    selectedClient?.locationLng
  )

  return {
    clientId,
    date: orderToEdit.date || orderToEdit.deliveryDate || orderToEdit.orderDate || localDate,
    time: orderToEdit.time || orderToEdit.deliveryTime || localTime,
    address: resolvedAddress,
    location: resolvedLocation,
    mapLink: resolvedMapLink,
    locationLat: Number.isFinite(lat) ? lat : null,
    locationLng: Number.isFinite(lng) ? lng : null,
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

export const formatPaymentNarration = (clientName, dateVal) => {
  const formattedDate = formatNarrationDate(dateVal) || formatNarrationDate(new Date())
  const name = String(clientName || '').trim()
  if (name) {
    return `Payment received for "${name}" on ${formattedDate}`
  }
  return `Payment received on ${formattedDate}`
}
