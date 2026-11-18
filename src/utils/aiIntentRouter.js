/**
 * Zero-Token Local Intent Router.
 * Resolves standard operational queries:
 * 1. Order Creation & Sales
 * 2. Payments / Receiving Money
 * 3. New Clients Creation
 * 4. Remaining: Stock, Pending Deliveries, Outstanding Balances, Staff Cash Custody
 *
 * All sequence strictly adheres to: Order creation -> Payments -> Clients -> Remaining.
 */

import { WATER_SKUS, getSkuMeta, DEFAULT_SKU } from '../constants/skus'
import { ensureEnglishText, normalizeDigits } from './textUtils'
import { getRecentSkuPrice } from './orderUtils'
import { findMatchingClient } from './clientMatchingUtils'
import { findMatchingSku } from './skuAliasUtils'
import { resolveStaffMember, checkIsDayTime } from '../services/taskService'
import { parseLocalSalesText, consolidateRetailSales } from './salesBatchUtils'

// Helper: Match SKU from text
function matchSkuFromText(text) {
  if (!text) return DEFAULT_SKU
  const match = findMatchingSku(text)
  return match?.sku?.label || DEFAULT_SKU
}

// Helper: Match client from text against store.clients (with phonetic & fuzzy matching)
function matchClientFromText(text, clients = []) {
  if (!text || !Array.isArray(clients) || clients.length === 0) return null
  const norm = text.toLowerCase()
  // 1. Exact or contains match (longest first)
  const sorted = [...clients].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))
  for (const c of sorted) {
    if (c.name && norm.includes(c.name.toLowerCase().trim())) {
      return c
    }
  }

  // 2. Extracted candidate patterns (e.g. "order for Sandeep", "from Sandeep", "Sandeep paid 500")
  const candidatePatterns = [
    /(?:for|to|of|client|customer)\s+([A-Za-z0-9\s]{2,25})(?:$|\s+(?:mobile|phone|address|rate|qty|@|\d))/i,
    /(?:from|by)\s+([A-Za-z0-9\s]{2,25})(?:$|\s+(?:via|through|cash|upi|gpay|online))/i,
    /^([A-Za-z0-9\s]{2,20})\s+(?:paid|jama|order|bhav|rate|\d)/i,
  ]
  for (const pat of candidatePatterns) {
    const m = text.match(pat)
    if (m && m[1]) {
      const match = findMatchingClient(m[1].trim(), clients)
      if (match?.client) return match.client
    }
  }

  // 3. Check word tokens against findMatchingClient (phonetic equivalence e.g. Sandeep <-> Sandip)
  const tokens = text.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3)
  for (const token of tokens) {
    const match = findMatchingClient(token, clients)
    if (match?.client && match.matchType === 'phonetic') {
      return match.client
    }
  }

  return null
}

export function parsePriceUpdateIntent(query, store = {}) {
  if (!query || typeof query !== 'string') return null
  if (store.isClientMode || store.isPaymentMode || store.isSalesMode) return null
  const rawQ = query.trim()
  const normDigitsQ = normalizeDigits(rawQ)
  const normQ = normDigitsQ.toLowerCase()

  // 1. Must NOT be an explicit order creation, payment received, or client creation command
  const isOrderCreation = /^(?:create\s+order|new\s+order|place\s+order|book\s+order|order\s+for|order\s+\d+)\b/i.test(normQ)
  const isPaymentReceived = /^(?:received|payment\s+received|jama\s+kary[ao]|paid|rupiya\s+malya)\b/i.test(normQ)
  const isClientCreation =
    /^(?:add|new|create)\s+(?:client|customer|party|shop)\b/i.test(normQ) ||
    /(?:નવો|નવા|નવી)\s+(?:ગ્રાહક|કસ્ટમર|ક્લાયન્ટ|પાર્ટી|દુકાન)/i.test(rawQ) ||
    /(?:नया|नए|नई)\s+(?:ग्राहक|कस्टमर|क्लाइंट|पार्टी|दुकान)/i.test(rawQ) ||
    /(?:mobile|phone|address|મોબાઈલ|ફોન|સરનામું|એડ્રેસ)\s*[:=]?/i.test(rawQ)

  if (isOrderCreation || isPaymentReceived || isClientCreation) {
    return null
  }

  // 2. Identify price/rate update intent
  const isPriceVerbCombo =
    /(?:update|change|set|edit|modify)\s+(?:the\s+)?(?:price|rate|bhav|ભાવ|રેટ)/i.test(normQ) ||
    /(?:price|rate|bhav|ભાવ|રેટ)\s*(?:update|change|set|edit|modify|badlo|બદલો)\b/i.test(normQ) ||
    /^(?:update|change|set)\s+(?:the\s+)?(?:price|rate|bhav)/i.test(normQ)

  const isBhavKaroCombo =
    /(?:rate|bhav|price|ભાવ|રેટ)\s*[:=]?\s*\d+\s*(?:karo|karjo|kari\s*aapo|કરો|કરજો|કરી\s*આપો)/i.test(normQ) ||
    /\d+\s*(?:bhav|rate|price|ભાવ|રેટ)\s*(?:karo|karjo|kari\s*aapo|કરો|કરજો|કરી\s*આપો)/i.test(normQ)

  const isDirectRateCommand =
    /^(?:rate|bhav|price|ભાવ|રેટ)\s*[:=]?\s*\d+(?:\.\d+)?$/i.test(normQ) ||
    /^([A-Za-z0-9\s]{2,25})\s+(?:rate|bhav|price|ભાવ|રેટ)\s*[:=]?\s*\d+(?:\.\d+)?$/i.test(normQ) ||
    /^(?:rate|bhav|price|ભાવ|રેટ)\s*[:=]?\s*\d+(?:\.\d+)?\s*(?:for|to|of)\s+([A-Za-z0-9\s]{2,25})$/i.test(normQ)

  const isPriceUpdate = isPriceVerbCombo || isBhavKaroCombo || isDirectRateCommand
  if (!isPriceUpdate) return null

  // 3. Extract rate
  let rate = null
  const rateMatch =
    normQ.match(/(?:rate|bhav|price|ભાવ|રેટ|to|is|as|@|₹|rs\.?)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
    normQ.match(/(\d+(?:\.\d+)?)\s*(?:bhav|rate|price|ભાવ|રેટ|karo|કરો|rs|rupees)/i) ||
    normQ.match(/\b(\d+(?:\.\d+)?)\b/)

  if (rateMatch && rateMatch[1]) {
    const val = parseFloat(rateMatch[1])
    if (!isNaN(val) && val > 0) {
      rate = val
    }
  }

  // 4. Extract client if mentioned
  const matchedClient = matchClientFromText(rawQ, store.clients || [])

  // 5. Extract SKU if mentioned
  const matchedSku = findMatchingSku(rawQ)?.sku?.label || DEFAULT_SKU

  return {
    handled: true,
    type: 'update_price',
    data: {
      rate,
      sku: matchedSku,
      client: matchedClient
        ? { id: matchedClient.id, name: matchedClient.name, skuRates: matchedClient.skuRates, rate: matchedClient.rate }
        : null,
      clientName: matchedClient?.name || null,
      rawQuery: rawQ,
    },
    text: rate
      ? `💰 Price update to ₹${rate} detected.`
      : `💰 Please specify the price/rate (e.g., "update price to 140").`,
    chips: !rate
      ? [
          { label: '₹120', rate: 120, action: 'apply_rate' },
          { label: '₹125', rate: 125, action: 'apply_rate' },
          { label: '₹130', rate: 130, action: 'apply_rate' },
          { label: '₹135', rate: 135, action: 'apply_rate' },
          { label: '₹140', rate: 140, action: 'apply_rate' },
          { label: '₹150', rate: 150, action: 'apply_rate' },
        ]
      : undefined,
  }
}

export function parseQuantityUpdateIntent(query, store = {}) {
  if (!query || typeof query !== 'string') return null
  if (store.isClientMode || store.isPaymentMode || store.isSalesMode) return null
  const rawQ = query.trim()
  const normDigitsQ = normalizeDigits(rawQ)
  const normQ = normDigitsQ.toLowerCase()

  // 1. Must NOT be an explicit new order creation command or payment received
  const isOrderCreation = /^(?:create\s+order|new\s+order|place\s+order|book\s+order|order\s+for)\b/i.test(normQ)
  const isPaymentReceived = /^(?:received|payment\s+received|jama\s+kary[ao]|paid|rupiya\s+malya)\b/i.test(normQ)
  const isClientCreation =
    /^(?:add|new|create)\s+(?:client|customer|party|shop)\b/i.test(normQ) ||
    /(?:નવો|નવા|નવી)\s+(?:ગ્રાહક|કસ્ટમર|ક્લાયન્ટ|પાર્ટી|દુકાન)/i.test(rawQ) ||
    /(?:नया|नए|नई)\s+(?:ग्राहक|कस्टमर|क्लाइंट|पार्टी|दुकान)/i.test(rawQ) ||
    /(?:mobile|phone|address|મોબાઈલ|ફોન|સરનામું|એડ્રેસ)\s*[:=]?/i.test(rawQ)

  if (isOrderCreation || isPaymentReceived || isClientCreation) {
    return null
  }

  // 2. Identify quantity update intent
  const isQtyVerbCombo =
    /(?:update|change|set|edit|modify)\s+(?:the\s+)?(?:order\s+)?(?:qty|quantity|boxes|peti|count)\b/i.test(normQ) ||
    /(?:order\s+)?(?:qty|quantity|boxes|peti|count)\s*(?:update|change|set|edit|modify|badlo|બદલો)\b/i.test(normQ) ||
    /^(?:make\s+it|karo|karjo)\s+\d+/i.test(normQ)

  const isBoxKaroCombo =
    /\b\d+\s*(?:box|boxes|peti|case|bxs|બોક્સ|બોક્ષ|pcs|piece|pieces|nung|nang|નંગ|bottle|bottles|બોટલ)\s*(?:karo|karjo|kari\s*aapo|કરો|કરજો|કરી\s*આપો|kar\s*do|rakho|kardo)\b/i.test(normQ) ||
    /(?:karo|karjo|kari\s*aapo|કરો|કરજો|કરી\s*આપો|kar\s*do|rakho)\s+\d+\s*(?:box|boxes|peti|case|bxs|બોક્સ|બોક્ષ|pcs|piece|pieces|nung|nang|નંગ)/i.test(normQ)

  const isDirectQtyCommand =
    /^(?:update\s+)?(?:order\s+)?(?:qty|quantity)\s*[:=]?\s*\d+\s*(?:box|boxes|peti|pcs|pieces|nung|nang|નંગ)?$/i.test(normQ) ||
    /^(?:order\s+)?(?:qty|quantity)\s*[:=]?\s*\d+\s*(?:for|to|of)\s+([A-Za-z0-9\s]{2,25})$/i.test(normQ) ||
    /^([A-Za-z0-9\s]{2,25})\s+(?:qty|quantity)\s*[:=]?\s*\d+$/i.test(normQ)

  const isQtyUpdate = isQtyVerbCombo || isBoxKaroCombo || isDirectQtyCommand
  if (!isQtyUpdate) return null

  // 3. Extract quantity value
  let qty = null
  let isPieces = false

  // Check pieces / nung / nang / pcs
  const piecesMatch =
    normQ.match(/(\d+(?:\.\d+)?)\s*(?:pcs|piece|pieces|nung|nang|નંગ|bottle|bottles|બોટલ)/i) ||
    normQ.match(/(?:pcs|piece|pieces|nung|nang|નંગ|bottle|bottles|બોટલ)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)

  if (piecesMatch && piecesMatch[1]) {
    const rawPieces = parseFloat(piecesMatch[1])
    if (!isNaN(rawPieces) && rawPieces > 0) {
      qty = Math.ceil(rawPieces / 48)
      isPieces = true
    }
  }

  if (qty === null) {
    const qtyMatch =
      normQ.match(/(?:qty|quantity|boxes?|peti|to|is|as)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
      normQ.match(/(\d+(?:\.\d+)?)\s*(?:box|boxes|peti|case|bxs|બોક્સ|બોક્ષ|karo|કરો)/i) ||
      normQ.match(/\b(\d+(?:\.\d+)?)\b/)

    if (qtyMatch && qtyMatch[1]) {
      const val = parseFloat(qtyMatch[1])
      if (!isNaN(val) && val > 0) {
        qty = Math.ceil(val)
      }
    }
  }

  // 4. Extract client if mentioned
  const matchedClient = matchClientFromText(rawQ, store.clients || [])

  return {
    handled: true,
    type: 'update_qty',
    data: {
      qty,
      isPieces,
      client: matchedClient
        ? { id: matchedClient.id, name: matchedClient.name, displayName: matchedClient.displayName, skuRates: matchedClient.skuRates, rate: matchedClient.rate }
        : null,
      clientName: matchedClient?.displayName || matchedClient?.name || null,
      rawQuery: rawQ,
    },
    text: qty
      ? `📦 Order quantity update to ${qty} boxes detected.`
      : `📦 Please specify the quantity (e.g., "update qty to 20").`,
    chips: !qty
      ? [
          { label: '10 Boxes', qty: 10, action: 'apply_qty' },
          { label: '20 Boxes', qty: 20, action: 'apply_qty' },
          { label: '30 Boxes', qty: 30, action: 'apply_qty' },
          { label: '50 Boxes', qty: 50, action: 'apply_qty' },
        ]
      : undefined,
  }
}

/**
 * Constructs a human-like, polite delivery reminder SMS/WhatsApp message for delivery staff.
 *
 * @param {Object} options
 * @param {string} [options.staffName='Nilesh'] - Recipient staff member's name
 * @param {Array} [options.orders=[]] - Orders to remind about
 * @returns {string} Clean formatted reminder message
 */
export function buildStaffDeliveryReminderMessage({ staffName = 'Nilesh', orders = [] }) {
  const staffGreeting = staffName.toLowerCase().endsWith('bhai') ? staffName : `${staffName}bhai`
  if (!orders || orders.length === 0) {
    return `${staffGreeting}, today no pending delivery orders. - Anjani Water`
  }

  if (orders.length === 1) {
    const o = orders[0]
    const cName = o.clientName || o.name || 'Customer'
    const qty = o.qty || o.totalQty || 1
    const sku = o.sku || o.product || '200ml'
    const addr = o.address ? `📍 ${o.address}` : ''
    const time = o.time || o.deliveryTime ? `⏰ ${o.time || o.deliveryTime}` : ''
    const details = [addr, time].filter(Boolean).join(' ')
    return `${staffGreeting}, ${cName} nu ${qty} box ${sku} delivery baki chhe.${details ? ' ' + details + '.' : ''} Dispatch kari dejo. - Anjani Water`
  }

  const itemsSummary = orders
    .slice(0, 5)
    .map((o, idx) => {
      const cName = o.clientName || o.name || 'Customer'
      const qty = o.qty || o.totalQty || 1
      const sku = o.sku || o.product || '200ml'
      const addr = o.address ? ` (${o.address})` : ''
      return `${idx + 1}) ${cName}: ${qty}b ${sku}${addr}`
    })
    .join('\n')

  const extraCount = orders.length > 5 ? `\n...and ${orders.length - 5} more` : ''
  return `${staffGreeting}, aajna ${orders.length} orders delivery baki chhe:\n${itemsSummary}${extraCount}\nDispatch kari dejo. - Anjani Water`
}

export function tryLocalIntentRoute(query, store = {}) {
  if (!query || typeof query !== 'string') return null
  const rawQ = query.trim()
  const q = rawQ.toLowerCase()

  // ==========================================
  // SEQUENCE 0.0: CARD ACTION NUMERIC QUICK-SELECT (WhatsApp Banking style 1, 2, 3)
  // ==========================================
  if (Array.isArray(store.activeCardActions) && store.activeCardActions.length > 0) {
    const num = parseInt(rawQ, 10)
    if (!isNaN(num) && num >= 1 && num <= store.activeCardActions.length && String(num) === rawQ) {
      const action = store.activeCardActions[num - 1]
      if (action) {
        return {
          handled: true,
          type: 'card_action_select',
          text: `Executing [${num}] ${action.label}...`,
          data: {
            action,
            number: num,
          },
        }
      }
    }
  }

  // ==========================================
  // SEQUENCE 0: PRICE & RATE UPDATE (Zero tokens & Instant response)
  // ==========================================
  const priceUpdateRoute = parsePriceUpdateIntent(rawQ, store)
  if (priceUpdateRoute && priceUpdateRoute.handled) {
    return priceUpdateRoute
  }

  // ==========================================
  // SEQUENCE 0.5: ORDER QUANTITY UPDATE (Zero tokens & Instant response)
  // ==========================================
  const qtyUpdateRoute = parseQuantityUpdateIntent(rawQ, store)
  if (qtyUpdateRoute && qtyUpdateRoute.handled) {
    return qtyUpdateRoute
  }

  // ==========================================
  // SEQUENCE 0.6: FEEDBACK STATUS & QUEUE CHECK (Zero tokens & Instant response)
  // ==========================================
  if (/^(?:check\s+(?:for\s+)?(?:new\s+)?feedback|run\s+feedback|trigger\s+feedback|review\s+feedback|feedback\s+check)\b/i.test(q)) {
    const list = store.aiFeedbacks || []
    const pending = list.filter(
      (f) => f.status === 'pending_review' || f.status === 'pending_weekly_review'
    )
    if (pending.length === 0) {
      return {
        handled: true,
        type: 'feedback_status',
        data: { pendingCount: 0, pending: [] },
        text: '✅ **Feedback Queue Status**: All caught up! There are **0 pending feedback requests** in Firestore.\n\n*(Autonomous hourly daemon schedule is active at `0 * * * *`, checking every hour automatically).*',
        chips: [{ label: 'Submit Feedback', action: 'open_feedback_modal' }],
      }
    } else {
      const summaryLines = pending
        .map((f, i) => `${i + 1}. **"${f.message}"**`)
        .join('\n')
      return {
        handled: true,
        type: 'feedback_status',
        data: { pendingCount: pending.length, pending },
        text: `⚡ **Found ${pending.length} Pending Feedback Request(s) in Queue**:\n\n${summaryLines}\n\n*(The hourly daemon will process these automatically, or you can ask the pair programming assistant to execute immediately).*`,
        chips: [{ label: 'Check Again', action: 'manual_feedback_check' }],
      }
    }
  }

  // Multi-date catering / sales orders local parsing (Zero tokens & Instant response)
  const isSingleOrderCommand = /^(?:create\s+order|new\s+order|place\s+order|book\s+order|order\s+for|order\s+\d+)\b/i.test(q)
  if (!store.isClientMode && !store.isPaymentMode && !isSingleOrderCommand) {
    const isMultiOrCatering =
      rawQ.includes('\n') ||
      /(?:caterer|caterers|party\s*plot|પાર્ટી\s*પ્લોટ|nung|nang|નંગ|hajar|હજાર|sanje|savare)/i.test(
        rawQ
      )
    if (isMultiOrCatering) {
      const localSales = parseLocalSalesText(rawQ, store.clients || [])
      if (localSales && Array.isArray(localSales.data?.sales) && localSales.data.sales.length > 0) {
        const enrichedSales = consolidateRetailSales(
          localSales.data.sales,
          store.clients || [],
          store.orders || [],
          store.aiMemories || []
        )
        return {
          handled: true,
          type: 'retail_sales',
          text: `📋 **Parsed ${enrichedSales.length} Catering/Retail Order${enrichedSales.length !== 1 ? 's' : ''}**`,
          data: {
            summary: {
              totalOrders: enrichedSales.length,
              totalQty: enrichedSales.reduce(
                (sum, s) => sum + (s.items || []).reduce((isum, it) => isum + Number(it.qty || 0), 0),
                0
              ),
            },
            sales: enrichedSales,
          },
        }
      }
    }
  }

  // ==========================================
  // SEQUENCE 1: ORDER CREATION & QUICK SALES
  // ==========================================
  const isOrderCreationIntent =
    !store.isClientMode &&
    !store.isPaymentMode &&
    (/^(?:create\s+order|new\s+order|place\s+order|book\s+order|order\s+\d+|order\s+for)\b/i.test(q) ||
      /(?:create\s+order|new\s+order)\b/i.test(q))

  if (isOrderCreationIntent) {
    const clients = store.clients || []
    let matchedClient = matchClientFromText(rawQ, clients)
    const sku = matchSkuFromText(rawQ)
    const skuMeta = getSkuMeta(sku)

    // Extract quantity
    const qtyMatch = rawQ.match(/\b(\d+)\s*(?:boxes?|cases?|peti|bxs?|units?|bottles?|jar|nung|nang|નંગ|pieces?|pcs?|બોટલ)?\b/i)
    let qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10

    // Check if quantity is specified in pieces (nung, bottles)
    const isPieces =
      /(?:nung|nang|નંગ|pieces?|pcs?)\b/i.test(rawQ) ||
      (/(?:bottle|bottel|બોટલ)\b/i.test(rawQ) && !/(?:box|boxes|petli|case|cases)\b/i.test(rawQ))

    let originalPieces = null
    if (isPieces && (sku === 'Anjani 200ml' || !sku || sku.includes('200ml'))) {
      originalPieces = qty
      qty = Math.ceil(qty / 48)
    }

    // Extract rate
    let rate = 0
    const rateMatch = rawQ.match(/(?:@|rate|bhav)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    if (rateMatch) {
      rate = parseFloat(rateMatch[1])
    } else if (matchedClient) {
      rate = Number(matchedClient.skuRates?.[sku] ?? matchedClient.rate ?? 0)
    }
    if (rate <= 0) {
      rate = getRecentSkuPrice(sku, store.orders || [], matchedClient?.id)
    }

    let clientName = matchedClient ? matchedClient.name : ''
    if (!clientName) {
      // Try to extract customer name following "for", "to", "of", "client"
      const nameMatch = rawQ.match(/(?:for|to|client|customer)\s+([A-Za-z0-9\s]{2,25})(?:$|\s+(?:mobile|phone|address|rate|qty|@|\d))/i)
      if (nameMatch) {
        clientName = nameMatch[1].trim()
      } else {
        clientName = 'Retail'
      }
    }
    if (clientName.toLowerCase() === 'retail' || clientName.toLowerCase() === 'counter') {
      clientName = 'Retail'
      if (matchedClient && matchedClient.name?.toLowerCase().trim() !== 'retail') {
        matchedClient = null
      }
    }

    // Extract delivery address / location from text (e.g. "at Waghodia road", "deliver to Manjalpur", "near D-Mart")
    let detectedAddress = ''
    const addrMatch = rawQ.match(
      /(?:at|in|near|address[:\s]+|location[:\s]+|deliver(?:y)?\s+(?:to|at))\s+([A-Za-z0-9\s,.-]{2,40}?)(?:$|\s+(?:mobile|phone|rate|qty|@|\d+\s*(?:box|case|petli)|with|for))/i
    )
    if (addrMatch && addrMatch[1]) {
      const candidate = addrMatch[1].trim()
      if (
        candidate.toLowerCase() !== clientName.toLowerCase() &&
        !candidate.toLowerCase().includes(sku.toLowerCase())
      ) {
        detectedAddress = candidate
      }
    }
    const formatTitleCase = (val) => {
      const eng = ensureEnglishText(val)
      return eng ? eng.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : ''
    }
    const effectiveAddress = formatTitleCase(
      detectedAddress || matchedClient?.address || matchedClient?.location || ''
    )
    const effectiveLocation = formatTitleCase(
      detectedAddress || matchedClient?.location || matchedClient?.address || ''
    )

    const items = [
      {
        sku,
        qty,
        rate,
        unit: skuMeta.unit,
        amount: qty * rate,
        ...(originalPieces ? { originalPieces } : {}),
      },
    ]

    const pieceLabel = originalPieces ? ` (${originalPieces} pcs = ${qty} ${skuMeta.unit})` : ` ${skuMeta.unit}`

    return {
      handled: true,
      type: 'order_draft',
      text: `🛒 **New Order Draft**: Ready to place order for **${clientName}**${effectiveAddress ? ` (📍 *${effectiveAddress}*)` : ''}:\n• **${qty}${pieceLabel}** — *${sku}* @ ₹${rate}/unit = **₹${(qty * rate).toLocaleString('en-IN')}**`,
      data: {
        clientId: matchedClient?.id || '',
        clientName,
        items,
        totalQty: qty,
        totalAmount: qty * rate,
        mobile: matchedClient?.mobile || '',
        address: effectiveAddress,
        location: effectiveLocation,
        date: new Date().toISOString().slice(0, 10),
      },
    }
  }

  // ==========================================
  // SEQUENCE 2: PAYMENTS (RECEIVING MONEY)
  // ==========================================
  const isPaymentIntent =
    /(?:received|payment\s+received|jama\s+kary[ao]|paid|rupiya\s+malya|rupaye\s+mile|collected)\b/i.test(q) &&
    /\d+/.test(q) &&
    !/(?:stock|order|delivery|invoice)\b/i.test(q)

  if (isPaymentIntent) {
    const clients = store.clients || []
    const matchedClient = matchClientFromText(rawQ, clients)

    // Extract amount
    const amtMatch = rawQ.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:₹|rs\.?|rupees|rupiya)?/i)
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0

    if (amount > 0) {
      let clientName = matchedClient ? matchedClient.name : ''
      if (!clientName) {
        const fromMatch = rawQ.match(/(?:from|by|client|customer)\s+([A-Za-z0-9\s]{2,25})(?:$|\s+(?:via|through|cash|upi|gpay|online))/i)
        if (fromMatch) {
          clientName = fromMatch[1].trim()
        } else {
          // If query starts with client name: "Ramesh paid 1500"
          const leadMatch = rawQ.match(/^([A-Za-z0-9\s]{2,20})\s+(?:paid|jama)/i)
          if (leadMatch) clientName = leadMatch[1].trim()
          else clientName = 'Customer'
        }
      }

      const isOnline = /(?:gpay|phonepe|paytm|upi|online|bank|transfer|neft|rtgs|cheque)/i.test(rawQ)
      const isCash = /(?:cash|rokda|counter)/i.test(rawQ)
      const method = isOnline ? 'online' : (isCash ? 'cash' : 'online')
      const accountId = isOnline ? 'bank' : 'counter'

      return {
        handled: true,
        type: 'receive_payment',
        text: `💰 **Payment Received**: Ready to record payment of **₹${amount.toLocaleString('en-IN')}** from **${clientName}**:`,
        data: {
          clientId: matchedClient?.id || '',
          clientName,
          amount,
          method,
          accountId,
          date: new Date().toISOString().slice(0, 10),
          notes: rawQ,
        },
      }
    }
  }

  // ==========================================
  // SEQUENCE 3: CLIENTS (NEW CLIENT CREATION)
  // All clients must be created in English only even if source is in any language
  // ==========================================
  const isClientCreationIntent =
    Boolean(store.isClientMode) ||
    /^(?:add|new|create)\s+(?:client|customer|party|dukaan|shop)\b/i.test(q) ||
    /(?:add\s+new\s+client|create\s+new\s+client)\b/i.test(q) ||
    /\b(?:new|add|create|register)\s+(?:client|customer|party|shop|account|dukaan)\b/i.test(q) ||
    /\b(?:client|customer|party)\s*[:=]\s*[A-Za-z]/i.test(q) ||
    /(?:નવો|નવા|નવી)\s+(?:ગ્રાહક|કસ્ટમર|ક્લાયન્ટ|પાર્ટી|દુકાન)/i.test(rawQ) ||
    /(?:નવો\s+ગ્રાહક\s+બનાવો|નવા\s+ક્લાયન્ટ\s+ઉમેરો)/i.test(rawQ) ||
    /(?:नया|नए|नई)\s+(?:ग्राहक|कस्टमर|क्लाइंट|पार्टी|दुकान)/i.test(rawQ) ||
    /(?:नया\s+ग्राहक\s+बनाओ|नया\s+ग्राहक\s+जोड़ो)/i.test(rawQ)

  if (isClientCreationIntent) {
    const normalizedInput = normalizeDigits(rawQ)

    // 1. Extract 10-digit mobile
    const mobileMatch = normalizedInput.match(/\b([6-9]\d{9})\b/)
    const mobile = mobileMatch ? mobileMatch[1] : ''

    // 2. Extract base rate
    const rateMatch = normalizedInput.match(/(?:rate|bhav|ભાવ|रेट|@)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)
    const rate = rateMatch ? parseFloat(rateMatch[1]) : 0

    // 3. Extract address
    let address = ''
    const addrMatch = normalizedInput.match(
      /(?:\baddress\b|\blocation\b|\barea\b|\bat\b|સરનામું|એડ્રેસ|પતા)\s*[:=]?\s*([^,;\n]+?)(?:[,;\n]|$|\s+(?:mobile|phone|rate|bhav|ભાવ|रेट|@))/i,
    )
    if (addrMatch) {
      address = addrMatch[1].trim()
    } else if (normalizedInput.includes(',')) {
      const segments = normalizedInput.split(',').map((s) => s.trim()).filter(Boolean)
      if (segments.length >= 2) {
        for (let i = 1; i < segments.length; i++) {
          const seg = segments[i]
          if (
            !/\b[6-9]\d{9}\b/.test(seg) &&
            !/(?:rate|bhav|ભાવ|रेट|@)\s*[:=]?\s*\d+/i.test(seg)
          ) {
            address = seg
            break
          }
        }
      }
    }

    // 4. Extract Name: remove command words, mobile, rate, address
    let cleanedForName = normalizedInput
      .replace(/^(?:add|new|create)\s+(?:client|customer|party|dukaan|shop)\s*/i, '')
      .replace(/\b(?:new|add|create|register)\s+(?:client|customer|party|shop|account|dukaan)\s*/i, '')
      .replace(/(?:નવો|નવા|નવી)\s+(?:ગ્રાહક|કસ્ટમર|ક્લાયન્ટ|પાર્ટી|દુકાન)\s*(?:બનાવો|ઉમેરો)?/i, '')
      .replace(/(?:नया|नए|नई)\s+(?:ग्राहक|कस्टमर|क्लाइंट|पार्टी|दुकान)\s*(?:बनाओ|जोड़ो)?/i, '')
      .replace(/\b[6-9]\d{9}\b/g, '')
      .replace(/(?:rate|bhav|ભાવ|रेट|@)\s*[:=]?\s*\d+(?:\.\d+)?/gi, '')
      .replace(/(?:\baddress\b|\blocation\b|\barea\b|\bat\b|સરનામું|એડ્રેસ|પતા)\s*[:=]?\s*[^,;\n]+/gi, '')

    if (address) {
      cleanedForName = cleanedForName.replace(address, '')
    }

    cleanedForName = cleanedForName.replace(/[,;:]+/g, ' ').trim()

    // 5. Enforce English-only output for client name and address
    const name = ensureEnglishText(cleanedForName.length > 1 ? cleanedForName : 'New Client')
    const englishAddress = ensureEnglishText(address)

    return {
      handled: true,
      type: 'create_client',
      text: `👤 **New Client Detected**: Ready to add **${name}** to your client master (in English):`,
      data: {
        name,
        mobile,
        address: englishAddress,
        rate,
        isRegular: false,
      },
    }
  }

  // ==========================================
  // SEQUENCE 4: REMAINING (STOCK, DISPATCH, BALANCES, ACCOUNTS)
  // ==========================================

  // 4A. Stock / Inventory check
  const stockPatterns = [
    /^stock$/i,
    /^check stock/i,
    /^current stock/i,
    /^live stock/i,
    /ketlo stock/i,
    /kitna stock/i,
    /stock summary/i,
    /^inventory/i,
    /godown/i,
  ]

  if (stockPatterns.some((pattern) => pattern.test(q))) {
    const summary = store.stockSummary || {}
    let stockItems = WATER_SKUS.map((sku) => ({
      sku: sku.label,
      label: sku.label,
      brand: sku.brand,
      qty: Number(summary[sku.label] ?? summary[sku.id] ?? summary[sku.shortLabel] ?? 0),
      unit: sku.unit,
      color: sku.color,
    }))

    let totalUnits = stockItems.reduce((sum, item) => sum + item.qty, 0)
    if (totalUnits === 0 && Number(store.stockTotal || 0) > 0) {
      totalUnits = Number(store.stockTotal || 0)
      if (Array.isArray(store.stockEntries) && store.stockEntries.length > 0) {
        const counts = {}
        store.stockEntries.forEach((entry) => {
          const meta = getSkuMeta(entry.sku || 'Anjani 200ml')
          counts[meta.label] = (counts[meta.label] || 0) + (Number(entry.qty) || 0)
        })
        stockItems = WATER_SKUS.map((sku) => ({
          sku: sku.label,
          label: sku.label,
          brand: sku.brand,
          qty: Number(counts[sku.label] || 0),
          unit: sku.unit,
          color: sku.color,
        }))
      }
    }

    return {
      handled: true,
      type: 'stock_summary',
      text: `📦 **Live Warehouse Inventory** (Total: **${totalUnits.toLocaleString()}** units):\nHere is your current available stock across all ${WATER_SKUS.length} water products:`,
      data: {
        stockItems,
        totalUnits,
        lastUpdated: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      },
    }
  }

  // 4B. Open / Pending Orders for Today
  const orderPatterns = [
    /open order/i,
    /pending order/i,
    /today order/i,
    /today's order/i,
    /aaj na order/i,
    /aaj ke order/i,
    /pending deliver/i,
    /deliveries today/i,
    /^orders$/i,
  ]

  if (orderPatterns.some((pattern) => pattern.test(q))) {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`

    const allOrders = store.orders || []
    const pendingOrders = allOrders
      .filter((o) => {
        const isCancelled = o.status === 'cancelled' || o.isCancelled === true
        const isDelivered = o.status === 'delivered'
        const isToday = o.date === todayStr || !o.date
        return !isCancelled && !isDelivered && isToday
      })
      .slice(0, 8)

    if (pendingOrders.length === 0) {
      return {
        handled: true,
        type: 'orders_list',
        text: `🚚 **Today's Deliveries**: All scheduled deliveries for today are completed or there are no pending orders!`,
        data: { orders: [] },
      }
    }

    return {
      handled: true,
      type: 'orders_list',
      text: `🚚 **Pending Deliveries Today**: Found **${pendingOrders.length}** open order${pendingOrders.length > 1 ? 's' : ''} needing dispatch:`,
      data: { orders: pendingOrders },
    }
  }

  // 4C. Outstanding / Pending Balances & Defaulters
  const outstandingPatterns = [
    /outstanding/i,
    /pending payment/i,
    /baki rupiya/i,
    /baaki/i,
    /defaulter/i,
    /unpaid/i,
    /who owes/i,
    /balance due/i,
    /due balance/i,
    /lena hai/i,
    /lene ke/i,
  ]

  if (outstandingPatterns.some((pattern) => pattern.test(q))) {
    const clients = store.clients || []
    const getClientDue = (c) =>
      Number(c.outstanding ?? c.balance ?? c.due ?? c.pendingAmount ?? 0)

    const allDueClients = clients.filter((c) => getClientDue(c) > 0 || c.isDefaulter)
    const totalPendingAmount = allDueClients.reduce((sum, c) => sum + getClientDue(c), 0)

    const dueClients = [...allDueClients]
      .sort((a, b) => getClientDue(b) - getClientDue(a))
      .slice(0, 10)
      .map((c) => ({
        ...c,
        balance: getClientDue(c),
        outstanding: getClientDue(c),
      }))

    if (dueClients.length === 0) {
      return {
        handled: true,
        type: 'outstanding_list',
        text: `💰 **Outstanding Balances**: Great news! No clients currently have pending dues or defaulter tags.`,
        data: { clients: [], totalPending: 0 },
      }
    }

    return {
      handled: true,
      type: 'outstanding_list',
      text: `💰 **Customer Outstanding Balances** (Total: **₹${Math.round(totalPendingAmount).toLocaleString()}** across **${allDueClients.length}** clients):\nHere are top clients with pending balances:`,
      data: {
        clients: dueClients,
        totalPending: totalPendingAmount,
      },
    }
  }

  // 4C. Staff Salary & Advance (Nilesh / Hiteshbhai)
  const salaryAdvancePatterns = [
    /advance/i,
    /salary/i,
    /upad/i, // Gujarati for advance
    /pagar/i, // Gujarati for salary
    /vetan/i,
  ]

  if (
    salaryAdvancePatterns.some((pattern) => pattern.test(q)) &&
    (/nilesh/i.test(q) || /hitesh/i.test(q) || /staff/i.test(q) || /driver/i.test(q))
  ) {
    const staffList = store.staffList || []
    const isNilesh = /nilesh/i.test(q) || !/hitesh/i.test(q)
    const empId = isNilesh ? 'nilesh' : 'hiteshbhai'
    const emp = staffList.find((s) => s.id === empId) || {
      name: isNilesh ? 'Nilesh' : 'Hiteshbhai',
      baseSalary: 15000,
      advanceBalance: 0,
    }

    const txs = (store.staffTransactions || []).filter(
      (tx) => tx.employeeId === empId && (tx.status === 'active' || !tx.status),
    )
    const activeAdvanceTotal =
      txs.length > 0
        ? txs.reduce((s, tx) => s + (Number(tx.amount) || 0), 0)
        : Number(emp.advanceBalance || 0)
    const baseSal = Number(emp.baseSalary || 15000)
    const pendingPay = Math.max(0, baseSal - activeAdvanceTotal)

    return {
      handled: true,
      type: 'staff_salary_summary',
      text: `💳 **${emp.name}'s Salary & Advance Summary**:\n• **Monthly Base Salary**: ₹${baseSal.toLocaleString('en-IN')}\n• **Active / Unsettled Advance**: ₹${activeAdvanceTotal.toLocaleString('en-IN')}\n• **Est. Pending Salary**: ₹${pendingPay.toLocaleString('en-IN')}\n\nYou can manage advances and settle monthly salary in the **Staff & Salaries** section from the menu.`,
      data: {
        employee: emp,
        activeAdvanceTotal,
        baseSalary: baseSal,
        estimatedPendingSalary: pendingPay,
      },
    }
  }

  // ==========================================
  // SEQUENCE 4D-1: CONTEXTUAL ORDER DELIVERY REMINDERS (e.g. "Remind Nilesh for it", "Remind driver", "Remind Nilesh for delivery")
  // ==========================================
  const mentionsStaff =
    /(?:nilesh(?:bhai)?|hitesh(?:bhai)?|driver|staff|delivery\s*(?:boy|man|person))\b/i.test(q)
  const mentionsReminder =
    /(?:remind|msg|message|sms|alert|notify|inform|janavo|kaho|moklo|send\s*(?:reminder|msg|message|sms)|follow\s*up|dispatch\s+karva|delivery\s+karva)\b/i.test(q)
  const hasOrderPronounOrRef =
    /(?:for\s+(?:it|this|these|orders?|delivery|deliveries|dispatch)|about\s+(?:it|this|these|orders?|delivery|deliveries|dispatch)|regarding\s+(?:it|this|these|orders?|delivery|deliveries|dispatch)|delivery\s+mate|dispatch\s+mate|aa\s+order\s+mate|order\s+mate|delivery\s+nu|order\s+nu|\bfor\s+(?:it|this|them|these)\b)/i.test(q) ||
    /^(?:remind|msg|sms|notify)\s+(?:nilesh|hitesh|driver|staff)\s*$/i.test(q)

  // Look backward in recentMessages for the latest order context
  let contextOrders = []
  let recentWasOrders = false
  if (Array.isArray(store.recentMessages) && store.recentMessages.length > 0) {
    for (let i = store.recentMessages.length - 1; i >= 0; i--) {
      const m = store.recentMessages[i]
      if (m.type === 'orders_list' && Array.isArray(m.data?.orders) && m.data.orders.length > 0) {
        contextOrders = m.data.orders
        recentWasOrders = true
        break
      }
      if (m.type === 'retail_sales' && Array.isArray(m.data?.sales) && m.data.sales.length > 0) {
        contextOrders = m.data.sales
        recentWasOrders = true
        break
      }
      if (m.type === 'single_order' && m.data?.order) {
        contextOrders = [m.data.order]
        recentWasOrders = true
        break
      }
    }
  }

  // Also check store.orders if contextOrders is empty
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const todayStr = `${yyyy}-${mm}-${dd}`
  const openOrdersInStore = (store.orders || []).filter((o) => {
    const isCancelled = o.status === 'cancelled' || o.isCancelled === true
    const isDelivered = o.status === 'delivered'
    const isToday = o.date === todayStr || !o.date
    return !isCancelled && !isDelivered && isToday
  })

  const isOrderDeliveryReminder =
    mentionsStaff &&
    mentionsReminder &&
    (hasOrderPronounOrRef ||
      recentWasOrders ||
      /(?:order|orders|delivery|deliveries|dispatch)\b/i.test(q))

  if (isOrderDeliveryReminder) {
    let assignedStaff = resolveStaffMember('nilesh', store.staffList) || {
      id: 'nilesh',
      name: 'Nilesh',
      mobile: '7990943652',
    }
    if (/hitesh/i.test(q)) {
      assignedStaff = resolveStaffMember('hiteshbhai', store.staffList) || {
        id: 'hiteshbhai',
        name: 'Hiteshbhai',
        mobile: '7778077617',
      }
    }

    const ordersToRemind = contextOrders.length > 0 ? contextOrders : openOrdersInStore
    const daytimeCheck = checkIsDayTime()
    const staffName = assignedStaff?.name || 'Nilesh'
    const staffPhone = assignedStaff?.mobile || '7990943652'

    const reminderMessage = buildStaffDeliveryReminderMessage({
      staffName,
      orders: ordersToRemind,
    })

    return {
      handled: true,
      type: 'staff_order_reminder',
      text:
        ordersToRemind.length > 0
          ? `🚚 **Order Delivery Reminder**: Ready to send SMS reminder to ${staffName}bhai for **${ordersToRemind.length}** open order${ordersToRemind.length > 1 ? 's' : ''}:`
          : `🚚 **Order Delivery Reminder**: No open orders found right now to remind ${staffName}bhai about.`,
      data: {
        orders: ordersToRemind,
        assignedTo: assignedStaff?.id || 'nilesh',
        assignedStaffName: staffName,
        staffPhone,
        message: reminderMessage,
        daytimeCheck,
        noOrders: ordersToRemind.length === 0,
      },
    }
  }

  // 4D. Staff Cash Custody & Accounts Overview (Nilesh, Hiteshbhai, Counter, Bank)
  const cashCustodyPatterns = [
    /nilesh/i,
    /hitesh/i,
    /cash in hand/i,
    /staff cash/i,
    /cash custody/i,
    /counter cash/i,
    /drawer/i,
    /kitna cash/i,
    /ketla cash/i,
    /ketla rupiya/i,
    /kitne rupaye/i,
    /cash balance/i,
    /handover/i,
    /^accounts$/i,
  ]

  if (
    cashCustodyPatterns.some((pattern) => pattern.test(q)) &&
    !/(?:task|tasks|kaam|follow\s*up|followup|assign|remind|message|msg|sms|delivery|deliveries|dispatch|order|orders)\b/i.test(q)
  ) {
    const summary = store.accountsSummary || {}
    const nileshBal = Number(summary.nilesh || 0)
    const hiteshBal = Number(summary.hiteshbhai || 0)
    const counterBal = Number(summary.counter || 0)
    const bankBal = Number(summary.bank || 0)
    const totalStaffCash = nileshBal + hiteshBal

    if (/nilesh/i.test(q) && !/hitesh/i.test(q)) {
      return {
        handled: true,
        type: 'accounts_summary',
        text: `💼 **Cash with Nilesh**: **₹${nileshBal.toLocaleString('en-IN')}**\nNilesh currently has ₹${nileshBal.toLocaleString('en-IN')} in delivery cash custody. You can record a partial or full handover in the Payments tab.`,
        data: {
          specificAccount: 'nilesh',
          balances: { nilesh: nileshBal, hiteshbhai: hiteshBal, counter: counterBal, bank: bankBal },
          totalStaffCash,
        },
      }
    }

    if (/hitesh/i.test(q) && !/nilesh/i.test(q)) {
      return {
        handled: true,
        type: 'accounts_summary',
        text: `💼 **Cash with Hiteshbhai**: **₹${hiteshBal.toLocaleString('en-IN')}**\nHiteshbhai currently has ₹${hiteshBal.toLocaleString('en-IN')} in delivery cash custody. You can record a partial or full handover in the Payments tab.`,
        data: {
          specificAccount: 'hiteshbhai',
          balances: { nilesh: nileshBal, hiteshbhai: hiteshBal, counter: counterBal, bank: bankBal },
          totalStaffCash,
        },
      }
    }

    return {
      handled: true,
      type: 'accounts_summary',
      text: `💼 **Staff Cash Custody & Account Balances**:\n• **Nilesh**: ₹${nileshBal.toLocaleString('en-IN')}\n• **Hiteshbhai**: ₹${hiteshBal.toLocaleString('en-IN')}\n• **Total with Delivery Staff**: ₹${totalStaffCash.toLocaleString('en-IN')}\n• **Counter Cash**: ₹${counterBal.toLocaleString('en-IN')}\n• **Bank / UPI**: ₹${bankBal.toLocaleString('en-IN')}`,
      data: {
        specificAccount: null,
        balances: { nilesh: nileshBal, hiteshbhai: hiteshBal, counter: counterBal, bank: bankBal },
        totalStaffCash,
      },
    }
  }

  // ==========================================
  // SEQUENCE 4E: STAFF TASK ASSIGNMENT & FOLLOW-UP TASK CREATION
  // ==========================================
  const isTaskCreation =
    /(?:assign\s+ta[sk]k?s?|create\s+ta[sk]k?s?|new\s+ta[sk]k?s?|add\s+ta[sk]k?s?|follow\s*up\s+ta[sk]k?s?|ta[sk]k?\s+for|kaam\s+aapo|kaam\s+sopo)\b/i.test(q) ||
    (/(?:remind|follow\s*up\s+with)\s+(?:nilesh|hitesh|staff|driver)\b/i.test(q) && /(?:to|about|for|regarding)\b/i.test(q))

  if (isTaskCreation) {
    const isFollowUp = /(?:follow\s*up|reminder|recheck|revisit)\b/i.test(q)
    let assignedStaff = resolveStaffMember('nilesh', store.staffList)
    if (/hitesh/i.test(q)) {
      assignedStaff = resolveStaffMember('hiteshbhai', store.staffList)
    } else if (/nilesh/i.test(q)) {
      assignedStaff = resolveStaffMember('nilesh', store.staffList)
    }

    // Determine due date
    const now = new Date()
    let dueDateStr = now.toISOString().slice(0, 10)
    let targetLabel = 'Today'
    if (/tomorrow|kal|kale\b/i.test(q)) {
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      dueDateStr = tomorrow.toISOString().slice(0, 10)
      targetLabel = 'Tomorrow'
    } else if (/in\s+2\s+days|parso\b/i.test(q)) {
      const d2 = new Date(now)
      d2.setDate(d2.getDate() + 2)
      dueDateStr = d2.toISOString().slice(0, 10)
      targetLabel = 'In 2 Days'
    }

    // Clean task description from input text
    let taskText = rawQ
      .replace(/^(?:assign\s+ta[sk]k?s?\s+to|create\s+ta[sk]k?s?\s+for|new\s+ta[sk]k?s?\s+for|add\s+ta[sk]k?s?\s+for|follow\s*up\s+ta[sk]k?s?\s+for|ta[sk]k?\s+for|kaam\s+aapo|kaam\s+sopo)\s+/i, '')
      .replace(/^(?:remind|follow\s*up\s+with)\s+(?:nilesh|hitesh|staff|driver)\s+(?:to|about|for|regarding)\s+/i, '')
      .replace(/^(?:nilesh|hiteshbhai|hitesh)\s*(?:ne|ko)?\s*(?:ta[sk]k?s?|kaam)?\s*[:=]?\s*/i, '')
      .replace(/\b(?:by\s+tomorrow|tomorrow|by\s+today|today|kale|kal)\b/gi, '')
      .replace(/^[;:,-\s]+/, '')
      .trim()

    if (!taskText || taskText.length < 2 || /^(?:it|this|these|that|them)$/i.test(taskText)) {
      taskText = isFollowUp ? 'Follow up with customer on delivery / collection' : 'Delivery & customer service task'
    }

    const daytimeCheck = checkIsDayTime()
    const staffName = assignedStaff?.name || 'Nilesh'
    const staffPhone = assignedStaff?.mobile || '7990943652'

    return {
      handled: true,
      type: 'staff_task_draft',
      text: '',
      data: {
        text: taskText,
        assignedTo: assignedStaff?.id || 'nilesh',
        assignedStaffName: staffName,
        staffPhone,
        dueDate: dueDateStr,
        targetLabel,
        isFollowUp,
        daytimeCheck,
      },
    }
  }

  // ==========================================
  // SEQUENCE 4F: STAFF TASKS LIST & PENDING FOLLOW-UPS QUERY
  // ==========================================
  const isTaskQuery =
    /^(?:ta[sk]k?s?|staff\s+ta[sk]k?s?|pending\s+ta[sk]k?s?|open\s+ta[sk]k?s?|follow\s*ups?|all\s+ta[sk]k?s?|today'?s?\s+ta[sk]k?s?)\b/i.test(q) ||
    /(?:show\s+ta[sk]k?s?|view\s+ta[sk]k?s?|list\s+ta[sk]k?s?|pending\s+ta[sk]k?s?|follow\s*up\s+ta[sk]k?s?|staff\s+ta[sk]k?s?|get\s+ta[sk]k?s?|give\s+(?:me\s+)?ta[sk]k?s?|what\s+are\s+(?:the\s+)?(?:staff\s+)?ta[sk]k?s?|aaj\s+na\s+kaam|staff\s+kaam)\b/i.test(q) ||
    /(?:nilesh|hitesh)\s*(?:na|ke|'s)?\s*(?:ta[sk]k?s?|kaam)\b/i.test(q)

  if (isTaskQuery) {
    const allJobs = Array.isArray(store.jobs) ? store.jobs : []
    const isNileshFilter = /nilesh/i.test(q)
    const isHiteshFilter = /hitesh/i.test(q)
    const staffFilter = isNileshFilter ? 'nilesh' : isHiteshFilter ? 'hiteshbhai' : null

    const activeJobs = allJobs.filter((job) => {
      const isComplete = job.stage === 'complete' || job.stage === 'archived'
      if (isComplete) return false
      if (staffFilter && job.assignedTo && job.assignedTo !== staffFilter) return false
      return true
    })

    const daytimeCheck = checkIsDayTime()
    const filterName = isNileshFilter ? 'Nilesh' : isHiteshFilter ? 'Hiteshbhai' : 'All Staff'

    if (activeJobs.length === 0) {
      return {
        handled: true,
        type: 'staff_tasks_list',
        text: '',
        data: {
          tasks: [],
          staffFilter,
          filterName,
          daytimeCheck,
        },
      }
    }

    return {
      handled: true,
      type: 'staff_tasks_list',
      text: '',
      data: {
        tasks: activeJobs,
        staffFilter,
        filterName,
        daytimeCheck,
      },
    }
  }

  // Not a predefined local intent; route to AI
  return null
}
