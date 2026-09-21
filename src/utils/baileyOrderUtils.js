import { WATER_SKUS, getSkuMeta } from '../constants/skus'

/**
 * Filter all Bailey brand SKUs from the master SKU list
 */
export const BAILEY_SKUS = WATER_SKUS.filter((s) => s.brand === 'Bailey')

/**
 * Safely parse any date representation (Firestore Timestamp, ISO string, DD-MM-YYYY, Date, number)
 */
export function parseDateToMillis(dateVal) {
  if (!dateVal) return 0
  if (typeof dateVal === 'number') return dateVal
  if (dateVal.toMillis && typeof dateVal.toMillis === 'function') return dateVal.toMillis()
  if (dateVal.seconds) return dateVal.seconds * 1000
  if (dateVal instanceof Date) return dateVal.getTime()

  if (typeof dateVal === 'string') {
    const ddmmyyyy = dateVal.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
    }
    const parsed = new Date(dateVal).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Calculate consumption pattern for each Bailey SKU over a given window in days
 *
 * @param {Object} options
 * @param {Array} options.orders List of orders
 * @param {Array} options.stockEntries List of stock ledger entries
 * @param {Object} options.stockSummary Current stock by SKU label
 * @param {number} options.daysWindow Number of days in window (default 14)
 * @param {number} options.nowMillis Reference timestamp for testing / current time
 */
export function calculateBaileyConsumptionStats({
  orders = [],
  stockEntries = [],
  stockSummary = {},
  daysWindow = 14,
  nowMillis = Date.now(),
}) {
  const windowDays = Math.max(1, Number(daysWindow) || 14)
  const windowStartMillis = nowMillis - windowDays * 24 * 60 * 60 * 1000

  // 1. Accumulate consumption per SKU from orders
  const orderSalesBySku = {}
  BAILEY_SKUS.forEach((s) => {
    orderSalesBySku[s.label] = 0
  })

  orders.forEach((order) => {
    const orderTime =
      parseDateToMillis(order.createdAt) ||
      parseDateToMillis(order.date) ||
      parseDateToMillis(order.orderDate) ||
      parseDateToMillis(order.deliveryDate)

    if (orderTime >= windowStartMillis && orderTime <= nowMillis + 86400000) {
      if (Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item) => {
          const itemSkuMeta = getSkuMeta(item.sku || '')
          if (itemSkuMeta && itemSkuMeta.brand === 'Bailey') {
            const label = itemSkuMeta.label
            const qty = Math.max(0, Number(item.qty) || 0)
            orderSalesBySku[label] = (orderSalesBySku[label] || 0) + qty
          }
        })
      } else if (order.sku) {
        const itemSkuMeta = getSkuMeta(order.sku)
        if (itemSkuMeta && itemSkuMeta.brand === 'Bailey') {
          const label = itemSkuMeta.label
          const qty = Math.max(0, Number(order.qty) || 0)
          orderSalesBySku[label] = (orderSalesBySku[label] || 0) + qty
        }
      }
    }
  })

  // 2. Accumulate consumption per SKU from stock ledger outward dispatches
  const dispatchSalesBySku = {}
  BAILEY_SKUS.forEach((s) => {
    dispatchSalesBySku[s.label] = 0
  })

  stockEntries.forEach((entry) => {
    const entryTime =
      parseDateToMillis(entry.createdAt) ||
      parseDateToMillis(entry.date)

    if (entryTime >= windowStartMillis && entryTime <= nowMillis + 86400000) {
      const entrySkuMeta = getSkuMeta(entry.sku || entry.product || '')
      if (entrySkuMeta && entrySkuMeta.brand === 'Bailey') {
        const label = entrySkuMeta.label
        const rawQty = Number(entry.qty) || 0
        if (entry.type === 'dispatch' || rawQty < 0) {
          dispatchSalesBySku[label] = (dispatchSalesBySku[label] || 0) + Math.abs(rawQty)
        }
      }
    }
  })

  // 3. Formulate SKU-wise stats
  return BAILEY_SKUS.map((sku) => {
    const label = sku.label
    const ordersSold = orderSalesBySku[label] || 0
    const dispatchedSold = dispatchSalesBySku[label] || 0
    // Use maximum of order sales or dispatched outward to avoid missing sales
    const totalConsumed = Math.max(ordersSold, dispatchedSold)
    const dailyRunRate = Math.round((totalConsumed / windowDays) * 10) / 10

    const currentStock = Number(stockSummary?.[label] ?? 0)

    let runwayDays = 0
    if (dailyRunRate > 0) {
      runwayDays = Math.max(0, Math.round((currentStock / dailyRunRate) * 10) / 10)
    } else {
      runwayDays = currentStock > 0 ? 999 : 0
    }

    let status = {
      label: 'Healthy Stock',
      level: 'healthy', // 'danger' | 'warning' | 'healthy' | 'dormant'
      color: 'green',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    }

    if (currentStock <= 0) {
      status = {
        label: 'Out of Stock',
        level: 'danger',
        color: 'red',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      }
    } else if (dailyRunRate > 0 && runwayDays < 3) {
      status = {
        label: `Critical (${runwayDays}d)`,
        level: 'danger',
        color: 'red',
        badgeClass: 'bg-red-100 text-red-800 border-red-200',
      }
    } else if (dailyRunRate > 0 && runwayDays < 7) {
      status = {
        label: `Low Stock (${runwayDays}d)`,
        level: 'warning',
        color: 'yellow',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      }
    } else if (dailyRunRate === 0 && currentStock > 0) {
      status = {
        label: 'Sufficient (No recent sales)',
        level: 'dormant',
        color: 'gray',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      }
    }

    return {
      sku,
      label,
      shortLabel: sku.shortLabel,
      size: sku.size,
      unit: sku.unit,
      currentStock,
      totalConsumed,
      dailyRunRate,
      runwayDays,
      status,
      ordersSold,
      dispatchedSold,
    }
  })
}

/**
 * Compute smart replenishment order quantities given stats and buffer days
 *
 * @param {Array} consumptionStats Output of calculateBaileyConsumptionStats
 * @param {number} targetBufferDays Safety buffer target in days (e.g. 7, 10, 14)
 * @param {Object} userOverrides Optional map of { [skuLabel]: number }
 */
export function calculateBaileyReplenishment({
  consumptionStats = [],
  targetBufferDays = 14,
  userOverrides = {},
}) {
  const bufferDays = Math.max(1, Number(targetBufferDays) || 14)

  return consumptionStats.map((stat) => {
    const { label, currentStock, dailyRunRate } = stat
    const targetRequiredStock = Math.ceil(dailyRunRate * bufferDays)
    const rawDeficit = targetRequiredStock - currentStock
    const recommendedQty = Math.max(0, rawDeficit)

    // User override takes precedence if set, otherwise recommendation
    const hasOverride = Object.prototype.hasOwnProperty.call(userOverrides, label)
    const finalOrderQty = hasOverride
      ? Math.max(0, Number(userOverrides[label]) || 0)
      : recommendedQty

    return {
      ...stat,
      targetBufferDays: bufferDays,
      targetRequiredStock,
      recommendedQty,
      finalOrderQty,
      hasOverride,
    }
  })
}

/**
 * Generate formatted WhatsApp Purchase Order text
 */
export function generateBaileyPurchaseOrderWhatsApp({
  poNumber,
  orderDate = new Date().toLocaleDateString('en-IN'),
  items = [],
  supplierName = 'Bailey Plant / Bottler',
  distributorName = 'Annapurna Foods',
  distributorLocation = 'Ajwa Road, Vadodara',
  contactPerson = 'Jignesh Pandya',
  contactMobile = '9825126388',
  notes = '',
}) {
  const activeItems = items.filter((it) => (Number(it.finalOrderQty) || 0) > 0)
  const totalCases = activeItems.reduce(
    (sum, it) => sum + (Number(it.finalOrderQty) || 0),
    0
  )

  const itemsLines = activeItems
    .map((it) => {
      const qty = Number(it.finalOrderQty) || 0
      const unit = it.unit || 'Cases'
      const runRate = it.dailyRunRate !== undefined ? ` (Daily: ${it.dailyRunRate}/d)` : ''
      return `• *${it.label}*: *${qty} ${unit}*${runRate}`
    })
    .join('\n')

  return `📦 *PURCHASE ORDER: BAILEY WATER*
━━━━━━━━━━━━━━━━━━━━━━
📋 *PO Number*: ${poNumber || `PO-${Date.now()}`}
📅 *Date*: ${orderDate}
🏭 *Supplier*: ${supplierName}
🏢 *Distributor*: *${distributorName}*
👤 *Contact*: ${contactPerson} (${contactMobile})
📍 *Delivery To*: ${distributorLocation}

*SKU Requirements to Dispatch:*
${itemsLines || '• No items selected'}

📦 *TOTAL CONSIGNMENT*: *${totalCases} Cases*
━━━━━━━━━━━━━━━━━━━━━━
${notes ? `📝 *Special Instructions*: ${notes}\n` : ''}✅ *Please confirm loading schedule and truck vehicle number.*`
}

/**
 * Generate HTML for Print / PDF export of Purchase Order
 */
export function generateBaileyPurchaseOrderHtml({
  poNumber,
  orderDate = new Date().toLocaleDateString('en-IN'),
  items = [],
  supplierName = 'Bailey Water Bottling Plant',
  distributorName = 'Annapurna Foods (Authorized Distributor)',
  distributorAddress = 'Ajwa Road, Vadodara, Gujarat',
  distributorPhone = '9825126388',
  notes = '',
}) {
  const activeItems = items.filter((it) => (Number(it.finalOrderQty) || 0) > 0)
  const totalCases = activeItems.reduce(
    (sum, it) => sum + (Number(it.finalOrderQty) || 0),
    0
  )

  const rowsHtml = activeItems
    .map((it, idx) => {
      return `<tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td><strong>${it.label}</strong> (${it.size})</td>
        <td style="text-align: center;">${it.unit || 'Cases'}</td>
        <td style="text-align: right;">${it.currentStock ?? '-'}</td>
        <td style="text-align: right;">${it.dailyRunRate ? `${it.dailyRunRate}/day` : '0/day'}</td>
        <td style="text-align: right; font-weight: bold; color: #065f46; font-size: 15px;">${it.finalOrderQty}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bailey Purchase Order - ${poNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; color: #1e293b; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
    .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
    .meta-box { font-size: 12px; text-align: right; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .party-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 13px; }
    .party-card strong { display: block; margin-bottom: 4px; color: #0f172a; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { border-bottom: 1px solid #e2e8f0; padding: 10px; }
    .total-row { background: #f1f5f9; font-weight: bold; font-size: 14px; }
    .total-cell { text-align: right; font-size: 16px; color: #065f46; }
    .footer { margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 12px; color: #64748b; }
    @media print {
      body { margin: 10mm; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">PURCHASE ORDER</h1>
      <div class="subtitle">Bailey Packaged Drinking Water Replenishment Consignment</div>
    </div>
    <div class="meta-box">
      <p><strong>PO No:</strong> ${poNumber}</p>
      <p><strong>Date:</strong> ${orderDate}</p>
    </div>
  </div>

  <div class="parties">
    <div class="party-card">
      <strong>To / Supplier:</strong>
      <p style="margin: 2px 0;">${supplierName}</p>
      <p style="margin: 2px 0; color: #64748b;">Bailey Water Manufacturing & Bottling Depot</p>
    </div>
    <div class="party-card">
      <strong>From / Distributor:</strong>
      <p style="margin: 2px 0;">${distributorName}</p>
      <p style="margin: 2px 0; color: #64748b;">${distributorAddress}</p>
      <p style="margin: 2px 0; color: #64748b;">Phone: ${distributorPhone}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px; text-align: center;">#</th>
        <th>Product SKU</th>
        <th style="width: 80px; text-align: center;">Pack Unit</th>
        <th style="width: 100px; text-align: right;">Current Stock</th>
        <th style="width: 100px; text-align: right;">Daily Velocity</th>
        <th style="width: 120px; text-align: right;">Order Quantity</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="6" style="text-align: center; color: #64748b;">No items ordered</td></tr>'}
      <tr class="total-row">
        <td colspan="5" style="text-align: right;">TOTAL CONSIGNMENT:</td>
        <td class="total-cell">${totalCases} Cases</td>
      </tr>
    </tbody>
  </table>

  ${notes ? `<div style="margin-bottom: 20px; font-size: 13px; background: #fffbeb; border: 1px solid #fef3c7; padding: 10px 14px; border-radius: 6px;"><strong>Delivery Notes:</strong> ${notes}</div>` : ''}

  <div class="footer">
    <p>This is a computer-generated Purchase Order generated by Annapurna Foods Inventory Management System.</p>
  </div>
</body>
</html>`
}
