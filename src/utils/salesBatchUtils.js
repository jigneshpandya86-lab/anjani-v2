import { DEFAULT_SKU, getSkuMeta } from '../constants/skus'
import { getRecentSkuPrice } from './orderUtils'
import { findMatchingClient } from './clientMatchingUtils'
import { findMatchingSku, normalizeUnit } from './skuAliasUtils'
import { normalizeDigits, transliterateIndicToEnglish, ensureEnglishText } from './textUtils'

/**
 * Normalizes various date string representations (DD/MM/YY, DD/MM/YYYY, DD-MM-YY, YYYY-MM-DD)
 * to standard ISO YYYY-MM-DD.
 */
export function normalizeDateString(dateStr) {
  if (!dateStr) return null
  const s = normalizeDigits(String(dateStr).trim())
  if (!s) return null

  // If already standard YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s
  }

  // DD/MM/YY or DD/MM/YYYY or DD-MM-YY or DD-MM-YYYY
  const m = s.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = m[2].padStart(2, '0')
    let year = m[3]
    if (year.length === 2) {
      year = `20${year}`
    }
    return `${year}-${month}-${day}`
  }

  // YYYY/MM/DD
  const mIso = s.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/)
  if (mIso) {
    const year = mIso[1]
    const month = mIso[2].padStart(2, '0')
    const day = mIso[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Normalizes delivery time strings according to Anjani business rules:
 * - "sanje" / "evening" -> "4 PM"
 * - "savare" / "morning" -> "9 AM"
 * - "bapore" / "afternoon" -> "1 PM"
 * - When no time is defined or empty -> "11 AM"
 */
export function normalizeDeliveryTime(rawTime) {
  if (!rawTime || typeof rawTime !== 'string' || !rawTime.trim() || rawTime.trim() === 'N/A') {
    return '11 AM'
  }
  const t = rawTime.trim()
  if (/(?:\b(?:sanje|saanj|saanje|evening|shyam)\b|સાંજે|સાંજ)/i.test(t)) {
    return '4 PM'
  }
  if (/(?:\b(?:savare|sakal|morning)\b|સવારે|સવાર)/i.test(t)) {
    return '9 AM'
  }
  if (/(?:\b(?:bapore|dupahar|afternoon)\b|બપોરે|બપોર)/i.test(t)) {
    return '1 PM'
  }
  return t
}

/**
 * Checks if a customer name represents an unknown, walk-in, or retail customer.
 */
export function isRetailCustomer(rawName) {
  const name = String(rawName || '').trim()
  if (!name) return true
  if (name.toLowerCase() === 'retail') return true
  if (name.toLowerCase() === 'counter') return true
  if (name.toLowerCase() === 'walkin' || /^walk[\s-]*in/i.test(name)) return true
  if (/^customer\s*\d*$/i.test(name)) return true
  if (/^unknown/i.test(name)) return true
  return false
}

/**
 * Consolidates a raw list of sales so that all unnamed, walk-in, and "Retail" entries
 * are merged into a SINGLE master "Retail" sale entry, while preserving named business clients.
 *
 * @param {Array} rawSales - Array of parsed sale objects
 * @param {Array} clients - Array of existing customer documents
 * @param {Array} orders - Array of past orders (for recent price fallback)
 * @param {Array} activeMemories - Array of active AI memories/rules
 * @returns {Array} Enriched and consolidated sales array
 */
export function consolidateRetailSales(rawSales = [], clients = [], orders = [], activeMemories = []) {
  if (!Array.isArray(rawSales) || rawSales.length === 0) return []

  const namedSales = []
  const retailSales = []

  for (let i = 0; i < rawSales.length; i++) {
    const sale = rawSales[i]
    const rawName = String(sale.clientName || '').trim()
    if (isRetailCustomer(rawName)) {
      retailSales.push(sale)
    } else {
      namedSales.push(sale)
    }
  }

  const enrichedSales = []

  // 1. Process regular named customers (each gets their own distinct order)
  namedSales.forEach((sale, idx) => {
    const rawName = String(sale.clientName || '').trim()
    const matchResult = findMatchingClient(rawName, clients, { mobile: sale.mobile })
    const matched = matchResult?.client || null
    const canonicalClientName = matched?.name || rawName
    const matchType = matchResult?.matchType || null

    const rawItems =
      Array.isArray(sale.items) && sale.items.length > 0
        ? sale.items
        : [{ sku: DEFAULT_SKU, qty: Number(sale.qty) || 1, rate: Number(sale.rate) || 0 }]

    const items = rawItems.map((it) => {
      // Deterministically resolve SKU including slang (petli, aadho liter, chhota, etc.)
      const skuMatch = findMatchingSku(it.sku || DEFAULT_SKU)
      const meta = skuMatch?.sku || getSkuMeta(DEFAULT_SKU)
      let rate = Number(it.rate) || 0
      let ruleApplied = null

      // Check client profile rate
      if (rate <= 0 && matched) {
        rate = Number(matched.skuRates?.[meta.label] ?? matched.rate ?? 0)
      }

      // Check learned AI Memory Rules (Pre-Save Guardrail)
      if (rate <= 0 && Array.isArray(activeMemories) && activeMemories.length > 0) {
        const mem = activeMemories.find((m) => {
          if (!m || m.active === false) return false
          const st = m.structured
          if (!st || st.enforcedRate === null) return false
          const clientMatch =
            (matched && st.clientId && st.clientId === matched.id) ||
            (matched && st.clientName && st.clientName.toLowerCase() === matched.name?.toLowerCase()) ||
            (st.clientName && st.clientName.toLowerCase() === rawName.toLowerCase())
          if (!clientMatch) return false
          if (st.skuLabel && st.skuLabel !== meta.label) return false
          return true
        })
        if (mem) {
          rate = Number(mem.structured.enforcedRate)
          ruleApplied = `Learned Rate: ₹${rate}`
        }
      }

      // Fallback to recent order history
      if (rate <= 0 && Array.isArray(orders) && orders.length > 0) {
        rate = getRecentSkuPrice(meta.label, orders, matched?.id)
      }

      let itQty = Number(it.qty) || 1
      let itUnit = it.unit ? normalizeUnit(it.unit) : meta.unit
      let origPieces = it.originalPieces || null

      // Check piece conversion for Anjani 200ml (48 pieces = 1 Box)
      if (
        !origPieces &&
        (itUnit === 'Piece' || it.unit === 'Bottle') &&
        (meta.id === 'anjani_200ml' || meta.label.includes('200ml'))
      ) {
        origPieces = itQty
        itQty = Math.ceil(itQty / 48)
        itUnit = 'Box'
      }

      return {
        sku: meta.label,
        qty: Math.max(0.01, itQty),
        rate: rate > 0 ? rate : 0,
        unit: itUnit,
        ruleApplied,
        ...(origPieces ? { originalPieces: origPieces } : {}),
      }
    })

    const calcTotal = items.reduce((s, it) => s + it.qty * it.rate, 0)
    const totalAmount = Number(sale.totalAmount) > 0 ? Number(sale.totalAmount) : calcTotal

    const effectiveAddress = sale.address || matched?.address || sale.location || matched?.location || ''
    const effectiveLocation = sale.location || matched?.location || sale.address || matched?.address || ''

    enrichedSales.push({
      id: sale.id || `sale-named-${Date.now()}-${idx}`,
      clientName: canonicalClientName,
      rawClientName: rawName !== canonicalClientName ? rawName : undefined,
      clientId: matched?.id || null,
      isMatched: !!matched,
      matchType,
      mobile: sale.mobile || matched?.mobile || '',
      date: sale.date ? normalizeDateString(sale.date) || sale.date : undefined,
      deliveryDate: sale.deliveryDate
        ? normalizeDateString(sale.deliveryDate) || sale.deliveryDate
        : sale.date
        ? normalizeDateString(sale.date) || sale.date
        : undefined,
      deliveryTime: normalizeDeliveryTime(sale.deliveryTime || sale.time),
      time: sale.time || normalizeDeliveryTime(sale.deliveryTime || sale.time),
      address: effectiveAddress,
      location: effectiveLocation,
      paymentMode: ['cash', 'online', 'credit'].includes(sale.paymentMode)
        ? sale.paymentMode
        : 'credit',
      items,
      totalAmount,
      notes: sale.notes || '',
    })
  })

  // 2. Consolidate ALL retail / walk-in sales into a SINGLE "Retail" sale entry
  if (retailSales.length > 0) {
    const matchedRetail = clients.find(
      (c) => c.name && c.name.toLowerCase().trim() === 'retail'
    )

    const mergedItemsMap = {}
    let retailTotalAmount = 0
    const paymentModes = []
    const notesList = []

    retailSales.forEach((rs) => {
      if (rs.notes && String(rs.notes).trim()) {
        notesList.push(String(rs.notes).trim())
      }
      if (rs.paymentMode) paymentModes.push(rs.paymentMode)
      if (Number(rs.totalAmount) > 0) retailTotalAmount += Number(rs.totalAmount)

      const rawItems =
        Array.isArray(rs.items) && rs.items.length > 0
          ? rs.items
          : [{ sku: DEFAULT_SKU, qty: Number(rs.qty) || 1, rate: Number(rs.rate) || 0 }]

      rawItems.forEach((it) => {
        const skuMatch = findMatchingSku(it.sku || DEFAULT_SKU)
        const meta = skuMatch?.sku || getSkuMeta(DEFAULT_SKU)
        let qty = Math.max(0.01, Number(it.qty) || 1)
        let rate = Number(it.rate) || 0
        if (rate <= 0 && matchedRetail) {
          rate = Number(matchedRetail.skuRates?.[meta.label] ?? matchedRetail.rate ?? 0)
        }
        if (rate <= 0 && Array.isArray(orders) && orders.length > 0) {
          rate = getRecentSkuPrice(meta.label, orders, matchedRetail?.id)
        }

        const effectiveRate = rate > 0 ? rate : 0
        let unit = it.unit ? normalizeUnit(it.unit) : meta.unit
        let origPieces = it.originalPieces || null

        // Check piece conversion for Anjani 200ml (48 pieces = 1 Box)
        if (
          !origPieces &&
          (unit === 'Piece' || it.unit === 'Bottle') &&
          (meta.id === 'anjani_200ml' || meta.label.includes('200ml'))
        ) {
          origPieces = qty
          qty = Math.ceil(qty / 48)
          unit = 'Box'
        }

        // Key by both SKU and rate so distinct rates for the same SKU remain as separate lines
        const itemKey = `${meta.label}__rate__${effectiveRate}`

        if (!mergedItemsMap[itemKey]) {
          mergedItemsMap[itemKey] = {
            sku: meta.label,
            qty: 0,
            rate: effectiveRate,
            unit,
            ...(origPieces ? { originalPieces: origPieces } : {}),
          }
        }
        mergedItemsMap[itemKey].qty += qty
      })
    })

    const consolidatedItems = Object.values(mergedItemsMap)
    const calcTotal = consolidatedItems.reduce((s, it) => s + it.qty * it.rate, 0)
    const finalTotal = retailTotalAmount > 0 ? retailTotalAmount : calcTotal

    let finalPaymentMode = 'cash'
    if (paymentModes.length > 0) {
      if (paymentModes.every((m) => m === 'online')) {
        finalPaymentMode = 'online'
      } else if (paymentModes.every((m) => m === 'credit')) {
        finalPaymentMode = 'credit'
      } else if (
        paymentModes.includes('credit') &&
        !paymentModes.includes('cash') &&
        !paymentModes.includes('online')
      ) {
        finalPaymentMode = 'credit'
      }
    }

    const uniqueNotes = Array.from(new Set(notesList)).join('; ')

    enrichedSales.unshift({
      id: `sale-retail-consolidated-${Date.now()}`,
      clientName: 'Retail',
      clientId: matchedRetail?.id || null,
      isMatched: !!matchedRetail,
      mobile: matchedRetail?.mobile || '',
      paymentMode: finalPaymentMode,
      items: consolidatedItems,
      totalAmount: finalTotal,
      notes: uniqueNotes || 'Consolidated Retail / Counter Sales',
      isConsolidatedRetail: true,
    })
  }

  return enrichedSales
}

/**
 * Local offline parser for multi-date catering orders and sales text.
 * Can parse structured sales notes from WhatsApp messages like:
 * "Maruti caterers
 *  Date 18/11/26
 *  1000 nung બોટલ
 *
 *  Maruti caterers
 *  20/11/26
 *  બાલાજી પાર્ટી પ્લોટ હરણી રોડ વડોદરા
 *  4000 નંગ bottle 200ml
 *
 *  Maruti caterers
 *  Date 21/11/26
 *  Sanje
 *  4000 hajar nung bottel
 *  PG party plot harni baroda"
 */
export function parseLocalSalesText(rawText = '', clients = []) {
  if (!rawText || typeof rawText !== 'string') return null
  const cleanInput = normalizeDigits(rawText.trim())
  if (!cleanInput) return null

  const lines = cleanInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  // Check if text indicates catering/sales orders
  const isCateringOrSales =
    /(?:caterer|caterers|mandap|decorator|party\s*plot|પાર્ટી\s*પ્લોટ|nung|nang|નંગ|botal|bottel|bottle|બોટલ|sales|box|petli)/i.test(
      cleanInput
    ) || lines.some((l) => /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(l))

  if (!isCateringOrSales) return null

  const orders = []
  let currentOrder = null
  let defaultClientName = 'Retail'

  // Helper to commit currentOrder
  const commitCurrentOrder = () => {
    if (!currentOrder) return
    if (!currentOrder.items || currentOrder.items.length === 0) {
      if (currentOrder.pendingQty) {
        currentOrder.items = [
          {
            sku: currentOrder.pendingSku || DEFAULT_SKU,
            qty: currentOrder.pendingQty,
            rate: 0,
            unit: 'Box',
          },
        ]
      }
    }
    if (currentOrder.items && currentOrder.items.length > 0) {
      const finalDeliveryTime = normalizeDeliveryTime(currentOrder.deliveryTime)
      orders.push({
        clientName: currentOrder.clientName || defaultClientName,
        date: currentOrder.date || undefined,
        deliveryDate: currentOrder.deliveryDate || currentOrder.date || undefined,
        deliveryTime: finalDeliveryTime,
        address: currentOrder.address || '',
        items: currentOrder.items,
        totalAmount: 0,
        paymentMode: 'credit',
        notes: [
          currentOrder.notes,
          finalDeliveryTime ? `Time: ${finalDeliveryTime}` : '',
          currentOrder.address ? `Venue: ${currentOrder.address}` : '',
        ]
          .filter(Boolean)
          .join(' • '),
      })
    }
    currentOrder = null
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const lineEn = ensureEnglishText(transliterateIndicToEnglish(rawLine))

    // 1. Check Date
    const dateMatch = rawLine.match(/\b(?:Date[:\s-]*)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i)
    if (dateMatch) {
      const parsedDate = normalizeDateString(dateMatch[1])
      if (
        currentOrder &&
        (currentOrder.date ||
          (currentOrder.items && currentOrder.items.length > 0) ||
          currentOrder.pendingQty)
      ) {
        commitCurrentOrder()
      }
      if (!currentOrder) {
        currentOrder = {
          clientName: defaultClientName,
          date: parsedDate,
          deliveryDate: parsedDate,
          items: [],
          notes: '',
        }
      } else {
        currentOrder.date = parsedDate
        currentOrder.deliveryDate = parsedDate
      }
      continue
    }

    // 2. Check Shift / Delivery Time
    if (/\b(?:sanje|saanj|shyam|evening|સાંજે|સાંજ)\b/i.test(rawLine)) {
      if (!currentOrder) currentOrder = { clientName: defaultClientName, items: [] }
      currentOrder.deliveryTime = '4 PM'
      continue
    }
    if (/\b(?:savare|sakal|morning|સવારે|સવાર)\b/i.test(rawLine)) {
      if (!currentOrder) currentOrder = { clientName: defaultClientName, items: [] }
      currentOrder.deliveryTime = '9 AM'
      continue
    }
    if (/\b(?:bapore|dupahar|afternoon|બપોરે|બપોર)\b/i.test(rawLine)) {
      if (!currentOrder) currentOrder = { clientName: defaultClientName, items: [] }
      currentOrder.deliveryTime = '1 PM'
      continue
    }

    // 3. Check Quantity & SKU
    // Handles: "1000 nung બોટલ", "4000 નંગ bottle 200ml", "4000 hajar nung bottel", "48 nung", "4800 nung"
    const hasQty =
      /\d+/.test(rawLine) &&
      /(?:nung|nang|નંગ|bottle|bottel|બોટલ|box|cases?|petli|hajar|હજાર|ml|pieces?|pcs?)/i.test(rawLine)

    if (hasQty) {
      const m = rawLine.match(/(\d+)/)
      if (m) {
        let num = parseInt(m[1], 10)
        // Redundant colloquial "4000 hajar" vs multiplier "4 hajar"
        if (/hajar|હજાર/i.test(rawLine)) {
          if (num < 100) {
            num = num * 1000
          }
        }

        // Determine SKU
        let sku = DEFAULT_SKU
        if (/200\s*ml|200ml/i.test(rawLine)) {
          sku = 'Anjani 200ml'
        } else if (/250\s*ml|250ml/i.test(rawLine)) {
          sku = 'Bailey 250ml'
        } else if (/500\s*ml|500ml/i.test(rawLine)) {
          sku = 'Bailey 500ml'
        } else if (/1\s*l(?:iter|tr)?/i.test(rawLine)) {
          sku = 'Bailey 1 Liter'
        } else if (/2\s*l(?:iter|tr)?/i.test(rawLine)) {
          sku = 'Bailey 2 Liter'
        }

        // Detect if quantity is specified in pieces (nung, bottles)
        const isPieces =
          /(?:nung|nang|નંગ|bottle|bottel|બોટલ|pieces?|pcs?)\b/i.test(rawLine) &&
          !/(?:box|boxes|petli|case|cases|kedi)\b/i.test(rawLine)

        let finalQty = num
        let originalPieces = null
        if (isPieces && (sku === 'Anjani 200ml' || !sku || sku.includes('200ml'))) {
          originalPieces = num
          finalQty = Math.ceil(num / 48)
        }

        if (!currentOrder) currentOrder = { clientName: defaultClientName, items: [] }
        currentOrder.items = currentOrder.items || []
        currentOrder.items.push({
          sku,
          qty: finalQty,
          rate: 0,
          unit: 'Box',
          ...(originalPieces ? { originalPieces } : {}),
        })
        if (originalPieces) {
          const pieceNote = `${originalPieces} pcs (${finalQty} boxes)`
          currentOrder.notes = currentOrder.notes ? `${currentOrder.notes} • ${pieceNote}` : pieceNote
        }
        continue
      }
    }

    // 4. Check Venue / Party Plot / Address
    const isVenue =
      /(?:party\s*plot|પાર્ટી\s*પ્લોટ|road|રોડ|nagar|નગર|harni|હરણી|wadi|વાળી|વાડી|hall|હોલ|circle|circle|plot|કોમ્પ્લેક્સ)/i.test(
        rawLine
      )
    if (isVenue) {
      if (!currentOrder) currentOrder = { clientName: defaultClientName, items: [] }
      currentOrder.address = lineEn
      continue
    }

    // 5. Check Client Name (e.g. "Maruti caterers")
    const isClientLine =
      /(?:caterer|caterers|catering|decorators|mandap|traders|agency|enterprise|dairy|store)/i.test(
        rawLine
      ) ||
      clients.some((c) => {
        const cName = c?.name?.toLowerCase().trim()
        const cDisplay = c?.displayName?.toLowerCase().trim()
        const cBase = c?.displayName ? c.displayName.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim() : ''
        const norm = rawLine.toLowerCase()
        return (
          (cName && cName.length > 2 && norm.includes(cName)) ||
          (cDisplay && cDisplay.length > 2 && norm.includes(cDisplay)) ||
          (cBase && cBase.length > 2 && norm.includes(cBase))
        )
      })

    if (isClientLine) {
      const detectedName = lineEn
      defaultClientName = detectedName
      if (
        currentOrder &&
        ((currentOrder.items && currentOrder.items.length > 0) || currentOrder.pendingQty)
      ) {
        commitCurrentOrder()
      }
      if (!currentOrder) {
        currentOrder = { clientName: detectedName, items: [] }
      } else {
        currentOrder.clientName = detectedName
      }
      continue
    }

    // 6. Generic single or short word line without numbers
    if (!/\d/.test(rawLine) && rawLine.length < 35 && !currentOrder?.clientName) {
      defaultClientName = lineEn
      if (!currentOrder) {
        currentOrder = { clientName: defaultClientName, items: [] }
      } else {
        currentOrder.clientName = defaultClientName
      }
    }
  }

  commitCurrentOrder()

  if (orders.length === 0) return null

  return {
    type: 'retail_sales',
    data: {
      summary: {
        totalOrders: orders.length,
        totalQty: orders.reduce(
          (sum, o) => sum + (o.items || []).reduce((isum, it) => isum + it.qty, 0),
          0
        ),
      },
      sales: orders,
    },
  }
}
