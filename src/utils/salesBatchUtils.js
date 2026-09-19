import { DEFAULT_SKU, getSkuMeta } from '../constants/skus'

/**
 * Checks if a customer name represents an unknown, walk-in, or retail customer.
 */
export function isRetailCustomer(rawName) {
  const name = String(rawName || '').trim()
  if (!name) return true
  if (name.toLowerCase() === 'retail') return true
  if (/^customer\s*\d*$/i.test(name)) return true
  if (/^walk[\s-]*in/i.test(name)) return true
  if (/^unknown/i.test(name)) return true
  return false
}

/**
 * Consolidates a raw list of sales so that all unnamed, walk-in, and "Retail" entries
 * are merged into a SINGLE master "Retail" sale entry, while preserving named business clients.
 *
 * @param {Array} rawSales - Array of parsed sale objects
 * @param {Array} clients - Array of existing customer documents
 * @returns {Array} Enriched and consolidated sales array
 */
export function consolidateRetailSales(rawSales = [], clients = []) {
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
    const matched = clients.find(
      (c) =>
        (c.name && c.name.toLowerCase().trim() === rawName.toLowerCase().trim()) ||
        (c.mobile &&
          sale.mobile &&
          String(c.mobile).replace(/\D/g, '') === String(sale.mobile).replace(/\D/g, ''))
    )

    const rawItems =
      Array.isArray(sale.items) && sale.items.length > 0
        ? sale.items
        : [{ sku: DEFAULT_SKU, qty: Number(sale.qty) || 1, rate: Number(sale.rate) || 0 }]

    const items = rawItems.map((it) => {
      const meta = getSkuMeta(it.sku || DEFAULT_SKU)
      let rate = Number(it.rate) || 0
      if (rate <= 0 && matched) {
        rate = Number(matched.skuRates?.[meta.label] ?? matched.rate ?? 0)
      }
      return {
        sku: meta.label,
        qty: Math.max(1, Number(it.qty) || 1),
        rate: rate > 0 ? rate : 0,
        unit: meta.unit,
      }
    })

    const calcTotal = items.reduce((s, it) => s + it.qty * it.rate, 0)
    const totalAmount = Number(sale.totalAmount) > 0 ? Number(sale.totalAmount) : calcTotal

    enrichedSales.push({
      id: sale.id || `sale-named-${Date.now()}-${idx}`,
      clientName: rawName,
      clientId: matched?.id || null,
      isMatched: !!matched,
      mobile: sale.mobile || matched?.mobile || '',
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
        const meta = getSkuMeta(it.sku || DEFAULT_SKU)
        const qty = Math.max(1, Number(it.qty) || 1)
        let rate = Number(it.rate) || 0
        if (rate <= 0 && matchedRetail) {
          rate = Number(matchedRetail.skuRates?.[meta.label] ?? matchedRetail.rate ?? 0)
        }

        if (!mergedItemsMap[meta.label]) {
          mergedItemsMap[meta.label] = {
            sku: meta.label,
            qty: 0,
            rate: rate > 0 ? rate : 0,
            unit: meta.unit,
          }
        }
        mergedItemsMap[meta.label].qty += qty
        if (rate > 0 && mergedItemsMap[meta.label].rate === 0) {
          mergedItemsMap[meta.label].rate = rate
        }
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
