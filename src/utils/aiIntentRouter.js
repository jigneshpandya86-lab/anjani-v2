/**
 * Zero-Token Local Intent Router.
 * Resolves standard operational queries (Stock, Pending Orders, Outstanding Balances)
 * directly against local clientStore state with ZERO API tokens and instant response time.
 * Complex questions and image bill scans are routed to the cloud AI function.
 */

import { WATER_SKUS } from '../constants/skus'

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
    const stockItems = WATER_SKUS.map((sku) => ({
      sku: sku.label,
      label: sku.label,
      brand: sku.brand,
      qty: Number(summary[sku.label] ?? summary[sku.id] ?? 0),
      unit: sku.unit,
      color: sku.color,
    }))

    const totalUnits = stockItems.reduce((sum, item) => sum + item.qty, 0)

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
  ]

  if (paymentPatterns.some((pattern) => pattern.test(q))) {
    const clients = store.clients || []
    const dueClients = clients
      .filter((c) => Number(c.balance || 0) > 0 || c.isDefaulter)
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0))
      .slice(0, 8)

    const totalPendingAmount = dueClients.reduce((sum, c) => sum + Number(c.balance || 0), 0)

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
      text: `💰 **Top Pending Customer Balances** (Total: **₹${totalPendingAmount.toLocaleString()}**):\nHere are clients with outstanding dues:`,
      data: {
        clients: dueClients,
        totalPending: totalPendingAmount,
      },
    }
  }

  // Not a predefined local intent; route to AI
  return null
}
