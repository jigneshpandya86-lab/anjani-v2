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

// Helper: Match SKU from text
function matchSkuFromText(text) {
  const norm = String(text || '').toLowerCase()
  if (norm.includes('200ml') || norm.includes('anjani')) return 'Anjani 200ml'
  if (norm.includes('250ml')) return 'Bailey 250ml'
  if (norm.includes('500ml')) return 'Bailey 500ml'
  if (norm.includes('1l') || norm.includes('1 liter') || norm.includes('1 litre') || norm.includes('1 ltr')) return 'Bailey 1 Liter'
  if (norm.includes('2l') || norm.includes('2 liter') || norm.includes('2 litre') || norm.includes('2 ltr')) return 'Bailey 2 Liter'
  return DEFAULT_SKU
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

export function tryLocalIntentRoute(query, store = {}) {
  if (!query || typeof query !== 'string') return null
  const rawQ = query.trim()
  const q = rawQ.toLowerCase()

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
    const matchedClient = matchClientFromText(rawQ, clients)
    const sku = matchSkuFromText(rawQ)
    const skuMeta = getSkuMeta(sku)

    // Extract quantity
    const qtyMatch = rawQ.match(/\b(\d+)\s*(?:boxes?|cases?|peti|bxs?|units?|bottles?|jar)?\b/i)
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 10

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

    const items = [
      {
        sku,
        qty,
        rate,
        unit: skuMeta.unit,
        amount: qty * rate,
      },
    ]

    return {
      handled: true,
      type: 'order_draft',
      text: `🛒 **New Order Draft**: Ready to place order for **${clientName}**:\n• **${qty} ${skuMeta.unit}** — *${sku}* @ ₹${rate}/unit = **₹${(qty * rate).toLocaleString('en-IN')}**`,
      data: {
        clientId: matchedClient?.id || '',
        clientName,
        items,
        totalQty: qty,
        totalAmount: qty * rate,
        mobile: matchedClient?.mobile || '',
        location: matchedClient?.location || matchedClient?.address || '',
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
      text: `📦 **Live Warehouse Inventory** (Total: **${totalUnits.toLocaleString()}** units):\nHere is your current available stock across all 5 water products:`,
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

  if (cashCustodyPatterns.some((pattern) => pattern.test(q))) {
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

  // Not a predefined local intent; route to AI
  return null
}
