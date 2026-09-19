/**
 * Zero-Token Local Intent Router.
 * Resolves standard operational queries (Stock, Pending Orders, Outstanding Balances)
 * directly against local clientStore state with ZERO API tokens and instant response time.
 * Complex questions and image bill scans are routed to the cloud AI function.
 */

import { WATER_SKUS, getSkuMeta } from '../constants/skus'

export function tryLocalIntentRoute(query, store) {
  if (!query || typeof query !== 'string') return null
  const q = query.trim().toLowerCase()

  // 1. Stock / Inventory check
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

  // 2. Open / Pending Orders for Today
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

  // 3. Outstanding / Pending Balances & Defaulters
  const paymentPatterns = [
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

  if (paymentPatterns.some((pattern) => pattern.test(q))) {
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

  // 4. Staff Cash Custody & Accounts Overview (Nilesh, Hiteshbhai, Counter, Bank)
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
