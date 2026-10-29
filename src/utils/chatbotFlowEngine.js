/**
 * WhatsApp-Style Guided Chatbot State Machine Engine.
 * 
 * Provides deterministic, multi-step questionnaires with interactive selection chips:
 * 1. 'expense'       -> Amount -> Category -> Account -> Note -> Confirm & Save
 * 2. 'order'         -> Customer -> SKU -> Quantity -> Rate -> Delivery Address -> Confirm & Save
 * 3. 'payment'       -> Customer -> Amount -> Payment Mode -> Deposit Account -> Note -> Confirm & Save
 * 4. 'cash_handover' -> From Staff/Account -> Amount -> To Account -> Note -> Confirm & Save
 * 5. 'staff_advance' -> Staff Member -> Advance Amount -> Payout Account -> Note -> Confirm & Save
 * 
 * Cost: ZERO Gemini API Tokens ($0.00 / 100% Free)
 * Speed: 0ms Latency (instant client-side execution)
 * Zero typing on mobile: Guided clickable selection chips
 */

import { WATER_SKUS, getSkuMeta, DEFAULT_SKU } from '../constants/skus'
import { findMatchingClient } from './clientMatchingUtils'
import { getRecentSkuPrice } from './orderUtils'
import { DEFAULT_ACCOUNTS } from '../constants/accounts'
import { DEFAULT_STAFF } from '../constants/staff'
import {
  checkIsDayTime,
  buildHumanLikeFollowUpMessage,
  buildNewTaskAssignmentMessage,
  resolveStaffMember,
  createStaffTaskInDb,
} from '../services/taskService'

export const FLOW_TYPES = {
  EXPENSE: 'expense',
  ORDER: 'order',
  PAYMENT: 'payment',
  CASH_HANDOVER: 'cash_handover',
  STAFF_ADVANCE: 'staff_advance',
  STAFF_TASK: 'staff_task',
}

export const MAIN_MENU_CHIPS = [
  { id: 'flow_task', label: '📋 Assign Staff Task', flow: FLOW_TYPES.STAFF_TASK, color: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100' },
  { id: 'quick_tasks', label: '⏰ Staff Tasks & Follow-up', action: 'query_tasks', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100' },
  { id: 'flow_expense', label: '💸 Record Expense', flow: FLOW_TYPES.EXPENSE, color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
  { id: 'flow_order', label: '📦 Book Order', flow: FLOW_TYPES.ORDER, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
  { id: 'flow_payment', label: '💰 Receive Payment (Jama)', flow: FLOW_TYPES.PAYMENT, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
  { id: 'flow_cash', label: '🤝 Cash Handover', flow: FLOW_TYPES.CASH_HANDOVER, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
  { id: 'flow_staff', label: '🚚 Staff Advance', flow: FLOW_TYPES.STAFF_ADVANCE, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
  { id: 'quick_stock', label: '📊 Check Stock', action: 'query_stock', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' },
  { id: 'quick_dues', label: '💳 Outstanding Dues', action: 'query_dues', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
]

export const EXPENSE_CATEGORIES = [
  { label: '⛽ Fuel / Diesel', value: 'Fuel / Transport' },
  { label: '🚗 Vehicle Repair', value: 'Maintenance' },
  { label: '💡 Electricity / Factory', value: 'Electricity' },
  { label: '💧 Caps / Jars / Raw Material', value: 'Raw Material' },
  { label: '📦 Packaging Material', value: 'Packaging' },
  { label: '☕ Tea & Refreshments', value: 'Miscellaneous' },
  { label: '🏢 Rent / Property', value: 'Rent' },
  { label: '📋 Other / Misc', value: 'Miscellaneous' },
]

/**
 * Returns main menu greeting and top-level action chips
 */
export function getMainMenuMessage() {
  return {
    text: '',
    chips: MAIN_MENU_CHIPS,
    isMainMenu: true,
  }
}

/**
 * Helper to get local date in standard YYYY-MM-DD format
 */
export function getLocalDateStr(d = new Date()) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Helper to get local time in standard HH:mm format
 */
export function getLocalTimeStr(d = new Date()) {
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${min}`
}

/**
 * Ranks clients by usage frequency (order count and recency) so that the most
 * frequently used clients populate the top clickable chips instead of alphabetical order.
 */
export function getMostUsedClients(clients = [], orders = [], limit = 8) {
  if (!Array.isArray(clients) || clients.length === 0) return []

  const orderCountById = new Map()
  const orderCountByName = new Map()
  const lastOrderTimeById = new Map()
  const lastOrderTimeByName = new Map()

  if (Array.isArray(orders)) {
    for (const o of orders) {
      const cId = o.clientId || o.customerId
      const cName = (o.clientName || o.customerName || '').trim().toLowerCase()

      let ts = 0
      if (o.createdAt?.toMillis && typeof o.createdAt.toMillis === 'function') {
        ts = o.createdAt.toMillis()
      } else if (Number.isFinite(o.createdAt?.seconds)) {
        ts = o.createdAt.seconds * 1000
      } else if (o.date) {
        ts = new Date(o.date).getTime() || 0
      }

      if (cId) {
        orderCountById.set(cId, (orderCountById.get(cId) || 0) + 1)
        if (ts > (lastOrderTimeById.get(cId) || 0)) {
          lastOrderTimeById.set(cId, ts)
        }
      }

      if (cName) {
        orderCountByName.set(cName, (orderCountByName.get(cName) || 0) + 1)
        if (ts > (lastOrderTimeByName.get(cName) || 0)) {
          lastOrderTimeByName.set(cName, ts)
        }
      }
    }
  }

  const scored = clients.map((c) => {
    const idCount = c.id ? (orderCountById.get(c.id) || 0) : 0
    const normName = (c.name || '').trim().toLowerCase()
    const nameCount = normName ? (orderCountByName.get(normName) || 0) : 0
    const totalOrders = Math.max(idCount, nameCount)

    const idTime = c.id ? (lastOrderTimeById.get(c.id) || 0) : 0
    const nameTime = normName ? (lastOrderTimeByName.get(normName) || 0) : 0
    const lastTime = Math.max(idTime, nameTime)

    return {
      client: c,
      totalOrders,
      lastTime,
      dues: Number(c.balance) || 0,
    }
  })

  // Sort descending:
  // 1. Most orders placed (highest usage)
  // 2. Most recent order time (recency)
  // 3. Outstanding balance (dues)
  // 4. Alphabetical by name
  scored.sort((a, b) => {
    if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders
    if (b.lastTime !== a.lastTime) return b.lastTime - a.lastTime
    if (b.dues !== a.dues) return b.dues - a.dues
    return (a.client.name || '').localeCompare(b.client.name || '')
  })

  return scored.slice(0, limit).map((s) => s.client)
}

/**
 * Computes top clients for payment collection, prioritizing those with outstanding
 * balance, followed by order usage frequency.
 */
export function getMostUsedPaymentClients(clients = [], orders = [], limit = 8) {
  if (!Array.isArray(clients) || clients.length === 0) return []

  const orderCounts = new Map()
  if (Array.isArray(orders)) {
    for (const o of orders) {
      const cId = o.clientId || o.customerId
      const cName = (o.clientName || o.customerName || '').trim().toLowerCase()
      if (cId) orderCounts.set(cId, (orderCounts.get(cId) || 0) + 1)
      if (cName) orderCounts.set(`name:${cName}`, (orderCounts.get(`name:${cName}`) || 0) + 1)
    }
  }

  const scored = clients.map((c) => {
    const dues = Number(c.balance) || 0
    const count = Math.max(
      c.id ? (orderCounts.get(c.id) || 0) : 0,
      (c.name ? orderCounts.get(`name:${c.name.trim().toLowerCase()}`) : 0) || 0
    )
    return { client: c, dues, count }
  })

  scored.sort((a, b) => {
    const aHasDues = a.dues > 0
    const bHasDues = b.dues > 0
    if (aHasDues && !bHasDues) return -1
    if (!aHasDues && bHasDues) return 1
    if (aHasDues && bHasDues) {
      if (b.dues !== a.dues) return b.dues - a.dues
      return b.count - a.count
    }
    if (b.count !== a.count) return b.count - a.count
    return (a.client.name || '').localeCompare(b.client.name || '')
  })

  return scored.slice(0, limit).map((s) => s.client)
}

/**
 * Computes the most frequently used price points for a specific SKU from historical orders,
 * prioritizing the client's configured rate first, followed by top popular rates.
 */
export function getPopularRatesForSku(sku, orders = [], clientRate = 0, defaultRate = 120) {
  const rateCounts = new Map()
  const targetSku = (sku || '').trim().toLowerCase()

  if (Array.isArray(orders)) {
    for (const order of orders) {
      if (Array.isArray(order.items)) {
        for (const it of order.items) {
          const itSku = (it.sku || '').trim().toLowerCase()
          const r = Number(it.rate)
          if (itSku === targetSku && Number.isFinite(r) && r > 0) {
            rateCounts.set(r, (rateCounts.get(r) || 0) + 1)
          }
        }
      } else {
        const orderSku = (order.sku || '').trim().toLowerCase()
        const r = Number(order.rate)
        if (orderSku === targetSku && Number.isFinite(r) && r > 0) {
          rateCounts.set(r, (rateCounts.get(r) || 0) + 1)
        }
      }
    }
  }

  // Sort historical rates by frequency desc
  const sortedPopularRates = [...rateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r)

  const chips = []
  const seenRates = new Set()

  // 1. Client's own custom or recent rate first
  const validClientRate = Number(clientRate)
  if (Number.isFinite(validClientRate) && validClientRate > 0) {
    chips.push({
      label: `₹${validClientRate} (Client Rate)`,
      value: validClientRate,
      isPrimary: true,
    })
    seenRates.add(validClientRate)
  }

  // 2. Most frequently ordered rates for this SKU
  for (const r of sortedPopularRates) {
    if (!seenRates.has(r)) {
      const count = rateCounts.get(r)
      const countTag = count >= 5 ? ' (Popular)' : ''
      chips.push({
        label: `₹${r}${countTag}`,
        value: r,
      })
      seenRates.add(r)
      if (chips.length >= 4) break
    }
  }

  // 3. Fallback rates around default / client rate if history is scarce
  const base = validClientRate > 0 ? validClientRate : defaultRate
  const fallbacks = [base, base - 5, base + 5, base - 10, base + 10, 100, 110, 120, 130, 140]
  for (const f of fallbacks) {
    if (f > 0 && !seenRates.has(f)) {
      chips.push({
        label: `₹${f}`,
        value: f,
      })
      seenRates.add(f)
      if (chips.length >= 4) break
    }
  }

  return chips
}

/**
 * Starts a specific flow and returns the first bot prompt + chips
 */
export function startChatbotFlow(flowType, context = {}) {
  const { clients = [], orders = [], staffList = [], accountsSummary = {} } = context

  switch (flowType) {
    // ----------------------------------------------------
    // 1. EXPENSE FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.EXPENSE:
      return {
        flow: FLOW_TYPES.EXPENSE,
        step: 'amount',
        data: {},
        text: `💸 **Step 1/4: Expense Amount**\n\nHow much was spent? Select a quick amount or type below:`,
        chips: [
          { label: '₹50', value: 50 },
          { label: '₹100', value: 100 },
          { label: '₹200', value: 200 },
          { label: '₹500', value: 500 },
          { label: '₹1,000', value: 1000 },
          { label: '₹2,000', value: 2000 },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Enter amount in ₹...',
      }

    // ----------------------------------------------------
    // 2. ORDER FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.ORDER: {
      // Pick top most used clients instead of alphabetical
      const topClients = getMostUsedClients(clients, orders, 8)
      const clientChips = topClients.map((c) => ({
        label: `👤 ${c.name}`,
        value: c.id,
        clientName: c.name,
      }))

      return {
        flow: FLOW_TYPES.ORDER,
        step: 'client',
        data: {},
        text: `📦 **Step 1/5: Select Customer**\n\nWho is this order for? Select from frequent customers or type a name:`,
        chips: [
          ...clientChips,
          { label: '🏪 Retail Walk-in', value: 'retail', clientName: 'Retail' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type client name or select...',
      }
    }

    // ----------------------------------------------------
    // 3. PAYMENT FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.PAYMENT: {
      // Pick top clients, prioritizing those with outstanding balance, followed by most used
      const topPaymentClients = getMostUsedPaymentClients(clients, orders, 8)
      const clientChips = topPaymentClients.map((c) => {
        const dues = Number(c.balance) || 0
        const duesLabel = dues > 0 ? ` (Dues: ₹${dues.toLocaleString('en-IN')})` : ''
        return {
          label: `👤 ${c.name}${duesLabel}`,
          value: c.id,
          clientName: c.name,
          dues,
        }
      })

      return {
        flow: FLOW_TYPES.PAYMENT,
        step: 'client',
        data: {},
        text: `💰 **Step 1/5: Select Customer (Payment Received)**\n\nReceived payment from which customer? Select or type:`,
        chips: [
          ...clientChips,
          { label: '🏪 Retail Customer', value: 'retail', clientName: 'Retail', dues: 0 },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type client name or select...',
      }
    }

    // ----------------------------------------------------
    // 4. CASH HANDOVER FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.CASH_HANDOVER: {
      const balances = accountsSummary?.balances || {}
      return {
        flow: FLOW_TYPES.CASH_HANDOVER,
        step: 'fromAccount',
        data: {},
        text: `🤝 **Step 1/4: Source (Who is handing over cash?)**\n\nSelect source account:`,
        chips: [
          {
            label: `🚚 Nilesh Route Cash (₹${(balances.nilesh || 0).toLocaleString('en-IN')})`,
            value: 'nilesh',
            accountName: 'Nilesh Route Cash',
            currentBalance: balances.nilesh || 0,
          },
          {
            label: `🚚 Hiteshbhai Route Cash (₹${(balances.hiteshbhai || 0).toLocaleString('en-IN')})`,
            value: 'hiteshbhai',
            accountName: 'Hiteshbhai Route Cash',
            currentBalance: balances.hiteshbhai || 0,
          },
          {
            label: `💵 Counter Cash Drawer (₹${(balances.counter || 0).toLocaleString('en-IN')})`,
            value: 'counter',
            accountName: 'Counter Cash Drawer',
            currentBalance: balances.counter || 0,
          },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select source account...',
      }
    }

    // ----------------------------------------------------
    // 5. STAFF ADVANCE FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.STAFF_ADVANCE: {
      const staffMembers = (staffList && staffList.length > 0)
        ? staffList
        : [
            { id: 'nilesh', name: 'Nilesh', advanceBalance: 0 },
            { id: 'hiteshbhai', name: 'Hiteshbhai', advanceBalance: 0 },
          ]

      const staffChips = staffMembers.map((s) => ({
        label: `👤 ${s.name} ${s.advanceBalance ? `(Adv: ₹${Number(s.advanceBalance).toLocaleString('en-IN')})` : ''}`,
        value: s.id,
        staffName: s.name,
        currentAdvance: Number(s.advanceBalance) || 0,
      }))

      return {
        flow: FLOW_TYPES.STAFF_ADVANCE,
        step: 'staff',
        data: {},
        text: `🚚 **Step 1/4: Select Staff Member**\n\nWho are you giving advance to?`,
        chips: [
          ...staffChips,
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select staff member...',
      }
    }

    // ----------------------------------------------------
    // 6. STAFF TASK ASSIGNMENT FLOW
    // ----------------------------------------------------
    case FLOW_TYPES.STAFF_TASK: {
      const staffMembers = (staffList && staffList.length > 0)
        ? staffList
        : DEFAULT_STAFF

      const staffChips = staffMembers.map((s) => ({
        label: `👤 ${s.name}`,
        value: s.id,
        staffName: s.name,
        staffPhone: s.mobile || '7990943652',
      }))

      return {
        flow: FLOW_TYPES.STAFF_TASK,
        step: 'staff',
        data: {},
        text: `📋 **Step 1/4: Select Staff Member**\n\nAssign task to which staff member?`,
        chips: [
          ...staffChips,
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select staff member...',
      }
    }

    default:
      return null
  }
}

/**
 * Advances the active flow by one step based on user selection or typed input
 */
export function advanceChatbotFlow(currentFlowState, inputPayload, context = {}) {
  const { flow, step, data } = currentFlowState
  const { clients = [], orders = [], staffList = [], accountsSummary = {} } = context

  // Check cancellation
  if (
    inputPayload === 'cancel' ||
    (typeof inputPayload === 'object' && inputPayload?.action === 'cancel') ||
    (typeof inputPayload === 'string' && /^(cancel|reset|stop|exit|menu|quit)$/i.test(inputPayload.trim()))
  ) {
    return {
      cancelled: true,
      text: `❌ Action cancelled. Returning to main menu.`,
      chips: MAIN_MENU_CHIPS,
    }
  }

  // ====================================================
  // 1. EXPENSE FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.EXPENSE) {
    if (step === 'amount') {
      let num = typeof inputPayload === 'object' ? inputPayload.value : parseFloat(String(inputPayload).replace(/[^\d.]/g, ''))
      if (!num || isNaN(num) || num <= 0) {
        return {
          ...currentFlowState,
          text: `⚠️ Please select or type a valid expense amount in ₹ (e.g. 500):`,
        }
      }
      const updatedData = { ...data, amount: num }
      return {
        flow,
        step: 'category',
        data: updatedData,
        text: `📁 **Step 2/4: Category**\n\nWhat was this **₹${num.toLocaleString('en-IN')}** spent on?`,
        chips: [
          ...EXPENSE_CATEGORIES,
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select category or type...',
      }
    }

    if (step === 'category') {
      const cat = typeof inputPayload === 'object' ? (inputPayload.value || inputPayload.label) : String(inputPayload).trim()
      const updatedData = { ...data, category: cat }

      const balances = accountsSummary?.balances || {}
      return {
        flow,
        step: 'account',
        data: updatedData,
        text: `💵 **Step 3/4: Paid From Account**\n\nPaid from which cash or bank account?`,
        chips: [
          { label: `💵 Counter Cash (₹${(balances.counter || 0).toLocaleString('en-IN')})`, value: 'counter', accountName: 'Counter Cash' },
          { label: `🏦 Bank / Online UPI (₹${(balances.bank || 0).toLocaleString('en-IN')})`, value: 'bank', accountName: 'Bank Account' },
          { label: `🚚 Nilesh Route Cash`, value: 'nilesh', accountName: 'Nilesh Custody' },
          { label: `🚚 Hiteshbhai Route Cash`, value: 'hiteshbhai', accountName: 'Hiteshbhai Custody' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select account...',
      }
    }

    if (step === 'account') {
      const accId = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const accName = typeof inputPayload === 'object' ? (inputPayload.accountName || inputPayload.label) : accId
      const updatedData = { ...data, accountId: accId, accountName: accName }

      return {
        flow,
        step: 'note',
        data: updatedData,
        text: `📝 **Step 4/4: Notes / Vehicle No.**\n\nAdd note or vehicle details (or tap Skip):`,
        chips: [
          { label: 'Delivery van diesel', value: 'Delivery van diesel' },
          { label: 'Factory tea & refreshments', value: 'Factory tea & refreshments' },
          { label: 'Routine vehicle repair', value: 'Routine vehicle repair' },
          { label: '⏩ Skip Note', value: '' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type note or tap skip...',
      }
    }

    if (step === 'note') {
      const note = typeof inputPayload === 'object' ? (inputPayload.value ?? '') : String(inputPayload).trim()
      const updatedData = { ...data, note: note === '⏩ Skip Note' ? '' : note, date: new Date() }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `🧾 **Confirm Expense Details**\n\n• **Amount**: ₹${updatedData.amount.toLocaleString('en-IN')}\n• **Category**: ${updatedData.category}\n• **Paid From**: ${updatedData.accountName || updatedData.accountId}\n• **Note**: ${updatedData.note || 'None'}\n• **Date**: Today (${new Date().toLocaleDateString('en-IN')})\n\nTap **Confirm & Save Expense** to write to ledger:`,
        chips: [
          { label: '✅ Confirm & Save Expense', action: 'save', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  // ====================================================
  // 2. ORDER FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.ORDER) {
    if (step === 'client') {
      let clientId = null
      let clientName = ''
      let matchedClient = null

      if (typeof inputPayload === 'object') {
        clientId = inputPayload.value
        clientName = inputPayload.clientName || inputPayload.label
        matchedClient = clients.find((c) => c.id === clientId)
      } else {
        const queryText = String(inputPayload).trim()
        const match = findMatchingClient(queryText, clients)
        if (match?.client) {
          matchedClient = match.client
          clientId = matchedClient.id
          clientName = matchedClient.name
        } else {
          clientName = queryText
          clientId = null
        }
      }

      const updatedData = {
        ...data,
        clientId,
        clientName,
        clientObj: matchedClient,
      }

      // SKU selection chips
      const skuChips = WATER_SKUS.map((s) => ({
        label: `💧 ${s.label}`,
        value: s.label,
        skuId: s.id,
      }))

      return {
        flow,
        step: 'sku',
        data: updatedData,
        text: `💧 **Step 2/5: Select Product (SKU)**\n\nWhich water product for **${clientName}**?`,
        chips: [
          ...skuChips,
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select SKU or type...',
      }
    }

    if (step === 'sku') {
      const skuLabel = typeof inputPayload === 'object' ? (inputPayload.value || inputPayload.label) : String(inputPayload).trim()
      const updatedData = { ...data, sku: skuLabel }

      return {
        flow,
        step: 'qty',
        data: updatedData,
        text: `🔢 **Step 3/5: Quantity**\n\nHow many boxes / units of **${skuLabel}**? Select or type:`,
        chips: [
          { label: '5 Boxes', value: 5 },
          { label: '10 Boxes', value: 10 },
          { label: '15 Boxes', value: 15 },
          { label: '20 Boxes', value: 20 },
          { label: '25 Boxes', value: 25 },
          { label: '30 Boxes', value: 30 },
          { label: '50 Boxes', value: 50 },
          { label: '100 Boxes', value: 100 },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Enter quantity (e.g. 20)...',
      }
    }

    if (step === 'qty') {
      let qty = typeof inputPayload === 'object' ? inputPayload.value : parseInt(String(inputPayload).replace(/\D/g, ''), 10)
      if (!qty || isNaN(qty) || qty <= 0) {
        return {
          ...currentFlowState,
          text: `⚠️ Please select or enter a valid number of boxes (e.g. 10):`,
        }
      }

      // Determine price
      const client = data.clientObj
      let clientRate = 0
      if (client) {
        clientRate = Number(client.skuRates?.[data.sku] ?? client.rate ?? 0)
      }
      if (clientRate <= 0) {
        clientRate = getRecentSkuPrice(data.sku, orders, client?.id)
      }

      const meta = getSkuMeta(data.sku)
      const defaultRate = meta.defaultPrice || 120
      const suggestedRate = clientRate > 0 ? clientRate : defaultRate

      const updatedData = { ...data, qty, suggestedRate }

      const popularChips = getPopularRatesForSku(data.sku, orders, clientRate, defaultRate)

      return {
        flow,
        step: 'rate',
        data: updatedData,
        text: `💰 **Step 4/5: Rate per Unit**\n\n${clientRate > 0 ? `Standard rate for **${data.clientName}** is **₹${clientRate}**.` : `Standard rate for **${data.sku}** is **₹${defaultRate}**.`} Select from most used rates or type custom rate:`,
        chips: [
          ...popularChips,
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: `Enter rate (e.g. ${suggestedRate})...`,
      }
    }

    if (step === 'rate') {
      let rate = typeof inputPayload === 'object' ? inputPayload.value : parseFloat(String(inputPayload).replace(/[^\d.]/g, ''))
      if (!rate || isNaN(rate) || rate <= 0) rate = data.suggestedRate || 120

      const updatedData = { ...data, rate }
      const client = data.clientObj
      const existingAddress = client?.address || client?.location || ''

      return {
        flow,
        step: 'address',
        data: updatedData,
        text: `📍 **Step 5/5: Delivery Address**\n\nDelivery destination for **${data.clientName}**:`,
        chips: [
          ...(existingAddress ? [{ label: `📍 Use Client Address: ${existingAddress.slice(0, 30)}...`, value: existingAddress }] : []),
          { label: '🏭 Factory / Warehouse Pickup', value: 'Factory Pickup' },
          { label: '⏩ Skip / Standard Delivery', value: existingAddress || 'Standard Delivery' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type delivery address or tap skip...',
      }
    }

    if (step === 'address') {
      const address = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).trim()
      const totalAmount = (data.qty || 1) * (data.rate || 0)
      const now = new Date()
      const localDate = getLocalDateStr(now)
      const localTime = getLocalTimeStr(now)

      const updatedData = {
        ...data,
        address: address || data.clientObj?.address || 'Standard Delivery',
        totalAmount,
        date: localDate,
        time: localTime,
      }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `📦 **Confirm Order Booking**\n\n• **Customer**: ${updatedData.clientName}\n• **Product**: ${updatedData.qty} × ${updatedData.sku}\n• **Rate**: ₹${updatedData.rate} / unit\n• **Total Amount**: ₹${totalAmount.toLocaleString('en-IN')}\n• **Date**: Today (${localDate} @ ${localTime})\n• **Delivery**: ${updatedData.address}\n• **Status**: Pending Delivery\n\nTap **Confirm Order** to book now:`,
        chips: [
          { label: '✅ Confirm & Book Order', action: 'save', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  // ====================================================
  // 3. PAYMENT FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.PAYMENT) {
    if (step === 'client') {
      let clientId = null
      let clientName = ''
      let dues = 0

      if (typeof inputPayload === 'object') {
        clientId = inputPayload.value
        clientName = inputPayload.clientName || inputPayload.label
        dues = inputPayload.dues || 0
      } else {
        const queryText = String(inputPayload).trim()
        const match = findMatchingClient(queryText, clients)
        if (match?.client) {
          clientId = match.client.id
          clientName = match.client.name
          dues = Number(match.client.balance) || 0
        } else {
          clientName = queryText
          clientId = null
        }
      }

      const updatedData = { ...data, clientId, clientName, dues }

      const amountChips = []
      if (dues > 0) {
        amountChips.push({ label: `₹${dues.toLocaleString('en-IN')} (Full Balance)`, value: dues })
        if (dues > 500) {
          amountChips.push({ label: `₹${Math.round(dues / 2).toLocaleString('en-IN')} (Half)`, value: Math.round(dues / 2) })
        }
      }
      amountChips.push(
        { label: '₹500', value: 500 },
        { label: '₹1,000', value: 1000 },
        { label: '₹2,000', value: 2000 },
        { label: '₹5,000', value: 5000 },
        { label: '❌ Cancel', action: 'cancel', isDestructive: true }
      )

      return {
        flow,
        step: 'amount',
        data: updatedData,
        text: `💵 **Step 2/5: Payment Amount**\n\nCustomer: **${clientName}** ${dues > 0 ? `(Dues: ₹${dues.toLocaleString('en-IN')})` : ''}\nHow much payment was received?`,
        chips: amountChips,
        inputPrompt: 'Enter amount in ₹...',
      }
    }

    if (step === 'amount') {
      let num = typeof inputPayload === 'object' ? inputPayload.value : parseFloat(String(inputPayload).replace(/[^\d.]/g, ''))
      if (!num || isNaN(num) || num <= 0) {
        return {
          ...currentFlowState,
          text: `⚠️ Please select or enter a valid payment amount (e.g. 1000):`,
        }
      }

      const updatedData = { ...data, amount: num }
      return {
        flow,
        step: 'method',
        data: updatedData,
        text: `💳 **Step 3/5: Payment Mode**\n\nHow was the **₹${num.toLocaleString('en-IN')}** paid?`,
        chips: [
          { label: '💵 Cash', value: 'cash', accountId: 'counter' },
          { label: '📱 GPay / UPI', value: 'upi', accountId: 'bank' },
          { label: '🏦 Bank Transfer (NEFT/IMPS)', value: 'bank', accountId: 'bank' },
          { label: '📄 Cheque', value: 'cheque', accountId: 'bank' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select payment mode...',
      }
    }

    if (step === 'method') {
      const method = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const suggestedAcc = typeof inputPayload === 'object' ? (inputPayload.accountId || 'counter') : (method === 'upi' ? 'bank' : 'counter')
      const updatedData = { ...data, method, accountId: suggestedAcc }

      const balances = accountsSummary?.balances || {}
      return {
        flow,
        step: 'account',
        data: updatedData,
        text: `📥 **Step 4/5: Deposit Account**\n\nDeposited / collected into which account?`,
        chips: [
          { label: `💵 Counter Cash Drawer (₹${(balances.counter || 0).toLocaleString('en-IN')})`, value: 'counter', accountName: 'Counter Cash' },
          { label: `🏦 Bank Account (₹${(balances.bank || 0).toLocaleString('en-IN')})`, value: 'bank', accountName: 'Bank Account' },
          { label: `🚚 Nilesh Route Custody`, value: 'nilesh', accountName: 'Nilesh Custody' },
          { label: `🚚 Hiteshbhai Route Custody`, value: 'hiteshbhai', accountName: 'Hiteshbhai Custody' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select account...',
      }
    }

    if (step === 'account') {
      const accId = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const accName = typeof inputPayload === 'object' ? (inputPayload.accountName || inputPayload.label) : accId
      const updatedData = { ...data, accountId: accId, accountName: accName }

      return {
        flow,
        step: 'note',
        data: updatedData,
        text: `📝 **Step 5/5: Note / Reference (Optional)**\n\nAdd UPI reference or receipt note:`,
        chips: [
          { label: 'Cash payment received', value: 'Cash payment received' },
          { label: 'Google Pay UPI', value: 'Google Pay UPI' },
          { label: 'Part bill settlement', value: 'Part bill settlement' },
          { label: '⏩ Skip Note', value: '' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type note or tap skip...',
      }
    }

    if (step === 'note') {
      const note = typeof inputPayload === 'object' ? (inputPayload.value ?? '') : String(inputPayload).trim()
      const dues = data.dues || 0
      const remainingDues = Math.max(0, dues - data.amount)
      const updatedData = { ...data, note: note === '⏩ Skip Note' ? '' : note, remainingDues, date: new Date() }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `💰 **Confirm Payment Entry (Jama)**\n\n• **Customer**: ${updatedData.clientName}\n• **Amount Received**: ₹${updatedData.amount.toLocaleString('en-IN')}\n• **Payment Mode**: ${updatedData.method?.toUpperCase() || 'CASH'}\n• **Deposit Account**: ${updatedData.accountName || updatedData.accountId}\n• **Remaining Balance**: ₹${remainingDues.toLocaleString('en-IN')}\n• **Note**: ${updatedData.note || 'None'}\n\nTap **Record Payment** to update ledger:`,
        chips: [
          { label: '✅ Confirm & Record Payment', action: 'save', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  // ====================================================
  // 4. CASH HANDOVER FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.CASH_HANDOVER) {
    if (step === 'fromAccount') {
      const fromAcc = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const fromName = typeof inputPayload === 'object' ? (inputPayload.accountName || inputPayload.label) : fromAcc
      const curBal = typeof inputPayload === 'object' ? (inputPayload.currentBalance || 0) : 0
      const updatedData = { ...data, fromAccountId: fromAcc, fromAccountName: fromName, currentBalance: curBal }

      const amountChips = []
      if (curBal > 0) {
        amountChips.push({ label: `₹${curBal.toLocaleString('en-IN')} (Full Balance)`, value: curBal })
      }
      amountChips.push(
        { label: '₹500', value: 500 },
        { label: '₹1,000', value: 1000 },
        { label: '₹2,000', value: 2000 },
        { label: '₹3,000', value: 3000 },
        { label: '₹5,000', value: 5000 },
        { label: '❌ Cancel', action: 'cancel', isDestructive: true }
      )

      return {
        flow,
        step: 'amount',
        data: updatedData,
        text: `💵 **Step 2/4: Handover Amount**\n\nFrom: **${fromName}** ${curBal ? `(Custody: ₹${curBal.toLocaleString('en-IN')})` : ''}\nHow much cash is being handed over?`,
        chips: amountChips,
        inputPrompt: 'Enter handover amount in ₹...',
      }
    }

    if (step === 'amount') {
      let num = typeof inputPayload === 'object' ? inputPayload.value : parseFloat(String(inputPayload).replace(/[^\d.]/g, ''))
      if (!num || isNaN(num) || num <= 0) {
        return {
          ...currentFlowState,
          text: `⚠️ Please select or enter a valid handover amount (e.g. 2000):`,
        }
      }

      const updatedData = { ...data, amount: num }
      return {
        flow,
        step: 'toAccount',
        data: updatedData,
        text: `📥 **Step 3/4: Destination Account**\n\nWhere is this **₹${num.toLocaleString('en-IN')}** being handed over / deposited?`,
        chips: [
          { label: '💵 Counter Cash Drawer', value: 'counter', toAccountName: 'Counter Cash Drawer' },
          { label: '🏦 Bank Account (Deposit)', value: 'bank', toAccountName: 'Bank Account' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select destination account...',
      }
    }

    if (step === 'toAccount') {
      const toAcc = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const toName = typeof inputPayload === 'object' ? (inputPayload.toAccountName || inputPayload.label) : toAcc
      const updatedData = { ...data, toAccountId: toAcc, toAccountName: toName }

      return {
        flow,
        step: 'note',
        data: updatedData,
        text: `📝 **Step 4/4: Handover Note**\n\nAdd note (or tap Skip):`,
        chips: [
          { label: 'Route collection handover', value: 'Route collection handover' },
          { label: 'Daily evening settlement', value: 'Daily evening settlement' },
          { label: '⏩ Skip Note', value: '' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type note or tap skip...',
      }
    }

    if (step === 'note') {
      const note = typeof inputPayload === 'object' ? (inputPayload.value ?? '') : String(inputPayload).trim()
      const updatedData = { ...data, notes: note === '⏩ Skip Note' ? '' : note, date: new Date() }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `🤝 **Confirm Cash Handover**\n\n• **From**: ${updatedData.fromAccountName || updatedData.fromAccountId}\n• **To**: ${updatedData.toAccountName || updatedData.toAccountId}\n• **Amount**: ₹${updatedData.amount.toLocaleString('en-IN')}\n• **Note**: ${updatedData.notes || 'None'}\n• **Date**: Today (${new Date().toLocaleDateString('en-IN')})\n\nTap **Confirm Cash Handover** to transfer:`,
        chips: [
          { label: '✅ Confirm Cash Handover', action: 'save', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  // ====================================================
  // 5. STAFF ADVANCE FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.STAFF_ADVANCE) {
    if (step === 'staff') {
      const staffId = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const staffName = typeof inputPayload === 'object' ? (inputPayload.staffName || inputPayload.label) : staffId
      const curAdv = typeof inputPayload === 'object' ? (inputPayload.currentAdvance || 0) : 0
      const updatedData = { ...data, employeeId: staffId, employeeName: staffName, currentAdvance: curAdv }

      return {
        flow,
        step: 'amount',
        data: updatedData,
        text: `💵 **Step 2/4: Advance Amount**\n\nGiving advance to **${staffName}** ${curAdv ? `(Current Advance: ₹${curAdv.toLocaleString('en-IN')})` : ''}\nHow much advance to give?`,
        chips: [
          { label: '₹500', value: 500 },
          { label: '₹1,000', value: 1000 },
          { label: '₹2,000', value: 2000 },
          { label: '₹3,000', value: 3000 },
          { label: '₹5,000', value: 5000 },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Enter advance amount in ₹...',
      }
    }

    if (step === 'amount') {
      let num = typeof inputPayload === 'object' ? inputPayload.value : parseFloat(String(inputPayload).replace(/[^\d.]/g, ''))
      if (!num || isNaN(num) || num <= 0) {
        return {
          ...currentFlowState,
          text: `⚠️ Please select or enter a valid advance amount (e.g. 1000):`,
        }
      }

      const updatedData = { ...data, amount: num }
      return {
        flow,
        step: 'account',
        data: updatedData,
        text: `💳 **Step 3/4: Disbursed From Account**\n\nWhere is this **₹${num.toLocaleString('en-IN')}** being paid from?`,
        chips: [
          { label: '💵 Counter Cash Drawer', value: 'counter', accountName: 'Counter Cash' },
          { label: '🏦 Bank / Online UPI', value: 'bank', accountName: 'Bank Account' },
          { label: '🚚 Deduct from route cash custody', value: 'custody_deduction', accountName: 'Route Custody Deduction' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select payout account...',
      }
    }

    if (step === 'account') {
      const accId = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).toLowerCase().trim()
      const accName = typeof inputPayload === 'object' ? (inputPayload.accountName || inputPayload.label) : accId
      const updatedData = { ...data, sourceAccountId: accId, sourceAccountName: accName }

      return {
        flow,
        step: 'note',
        data: updatedData,
        text: `📝 **Step 4/4: Advance Purpose / Note**\n\nPurpose of advance (or tap Skip):`,
        chips: [
          { label: 'Personal advance', value: 'Personal advance' },
          { label: 'Festival / Diwali advance', value: 'Festival advance' },
          { label: 'Emergency medical advance', value: 'Emergency advance' },
          { label: '⏩ Skip Note', value: '' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type note or tap skip...',
      }
    }

    if (step === 'note') {
      const note = typeof inputPayload === 'object' ? (inputPayload.value ?? '') : String(inputPayload).trim()
      const newAdvTotal = (data.currentAdvance || 0) + data.amount
      const updatedData = {
        ...data,
        note: note === '⏩ Skip Note' ? '' : note,
        newAdvanceTotal: newAdvTotal,
        date: new Date(),
      }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `🚚 **Confirm Staff Advance**\n\n• **Employee**: ${updatedData.employeeName}\n• **Advance Amount**: ₹${updatedData.amount.toLocaleString('en-IN')}\n• **Paid From**: ${updatedData.sourceAccountName || updatedData.sourceAccountId}\n• **New Advance Total**: ₹${newAdvTotal.toLocaleString('en-IN')}\n• **Note**: ${updatedData.note || 'None'}\n\nTap **Disburse Advance** to save:`,
        chips: [
          { label: '✅ Disburse Advance', action: 'save', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  // ====================================================
  // 6. STAFF TASK ASSIGNMENT FLOW STEPS
  // ====================================================
  if (flow === FLOW_TYPES.STAFF_TASK) {
    if (step === 'staff') {
      let staffId = typeof inputPayload === 'object' ? inputPayload.value : String(inputPayload).trim()
      let staffName = typeof inputPayload === 'object' ? inputPayload.staffName : ''
      let staffPhone = typeof inputPayload === 'object' ? inputPayload.staffPhone : ''

      if (!staffName || !staffPhone) {
        const staffObj = resolveStaffMember(staffId, staffList)
        if (staffObj) {
          staffId = staffObj.id
          staffName = staffObj.name
          staffPhone = staffObj.mobile || '7990943652'
        } else {
          staffName = staffId
          staffPhone = '7990943652'
        }
      }

      const updatedData = {
        ...data,
        assignedTo: staffId,
        assignedStaffName: staffName,
        staffPhone,
      }

      return {
        flow,
        step: 'taskType',
        data: updatedData,
        text: `📋 **Step 2/4: Task Type for ${staffName}**\n\nIs this a new task or a follow-up task?`,
        chips: [
          { label: '🆕 New Task', value: false, isFollowUp: false },
          { label: '🔄 Follow-up Task', value: true, isFollowUp: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select task type...',
      }
    }

    if (step === 'taskType') {
      const isFollowUp = typeof inputPayload === 'object' ? Boolean(inputPayload.isFollowUp ?? inputPayload.value) : /follow/i.test(String(inputPayload))
      const updatedData = { ...data, isFollowUp }

      return {
        flow,
        step: 'taskText',
        data: updatedData,
        text: `📝 **Step 3/4: Task Description**\n\nWhat should **${data.assignedStaffName}** do? Tap a common task or type custom instructions:`,
        chips: [
          { label: '🫙 Collect Empty Jars', value: 'Collect empty jars & petli from market' },
          { label: '💰 Collect Payment', value: 'Collect pending customer payments & issue receipt' },
          { label: '📦 Deliver Water Stock', value: 'Deliver scheduled water boxes to customers' },
          { label: '🚗 Vehicle Maintenance', value: 'Check delivery vehicle diesel, tyre air & maintenance' },
          { label: '🏢 Godown Unloading', value: 'Assist in truck unloading and stock stacking at godown' },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Type task details or select preset...',
      }
    }

    if (step === 'taskText') {
      const textVal = typeof inputPayload === 'object' ? (inputPayload.value || inputPayload.label) : String(inputPayload).trim()
      if (!textVal || textVal.length < 2) {
        return {
          ...currentFlowState,
          text: `⚠️ Please enter or select a task description for **${data.assignedStaffName}**:`,
        }
      }
      const updatedData = { ...data, text: textVal }

      return {
        flow,
        step: 'dueDate',
        data: updatedData,
        text: `📅 **Step 4/4: Target Due Date**\n\nWhen should **${data.assignedStaffName}** complete this?`,
        chips: [
          { label: '📅 Today', value: 'today', days: 0 },
          { label: '📅 Tomorrow', value: 'tomorrow', days: 1 },
          { label: '📅 In 2 Days', value: 'in_2_days', days: 2 },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: 'Select due date or type date (YYYY-MM-DD)...',
      }
    }

    if (step === 'dueDate') {
      const rawDateInput = typeof inputPayload === 'object' ? (inputPayload.value || inputPayload.days) : String(inputPayload).trim()
      const now = new Date()
      let dueDateStr = now.toISOString().slice(0, 10)
      let targetLabel = 'Today'

      if (rawDateInput === 'tomorrow' || rawDateInput === 1 || /tomorrow|kal/i.test(String(rawDateInput))) {
        const tom = new Date(now)
        tom.setDate(tom.getDate() + 1)
        dueDateStr = tom.toISOString().slice(0, 10)
        targetLabel = 'Tomorrow'
      } else if (rawDateInput === 'in_2_days' || rawDateInput === 2 || /2\s*day/i.test(String(rawDateInput))) {
        const d2 = new Date(now)
        d2.setDate(d2.getDate() + 2)
        dueDateStr = d2.toISOString().slice(0, 10)
        targetLabel = 'In 2 Days'
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(rawDateInput))) {
        dueDateStr = String(rawDateInput)
        targetLabel = dueDateStr
      }

      const daytimeCheck = checkIsDayTime()
      const updatedData = {
        ...data,
        dueDate: dueDateStr,
        targetLabel,
        daytimeCheck,
      }

      const smsPreview = data.isFollowUp
        ? buildHumanLikeFollowUpMessage({
            staffName: data.assignedStaffName,
            taskText: data.text,
            followUpCount: 0,
            dueDateStr: targetLabel,
          })
        : buildNewTaskAssignmentMessage({
            staffName: data.assignedStaffName,
            taskText: data.text,
            dueDateStr: targetLabel,
            isFollowUp: false,
          })

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `📋 **${data.assignedStaffName}** • 🎯 ${targetLabel} (${dueDateStr}) ${daytimeCheck.isDayTime ? '☀️ 9AM–8PM' : '🌙 Night'}\n💬 _"${smsPreview}"_`,
        chips: [
          { label: '💾 Save Task', action: 'save', sendSms: false, isPrimary: true },
          { label: '📲 SMS Staff', action: 'save', sendSms: true, isPrimary: true },
          { label: '💬 WhatsApp Staff', action: 'save_and_whatsapp', isPrimary: true },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
      }
    }
  }

  return null
}

/**
 * Executes the final save for any of the 5 flows using clientStore
 */
export async function executeFlowSave(flowType, flowData, store = {}) {
  switch (flowType) {
    case FLOW_TYPES.EXPENSE: {
      const { amount, category, accountId, note } = flowData
      if (!store.addExpense) throw new Error('addExpense store method not found')
      const result = await store.addExpense({
        amount,
        category,
        accountId: accountId || 'counter',
        note: note || '',
        date: new Date(),
      })
      return {
        success: true,
        result,
        text: `✅ **Expense of ₹${amount.toLocaleString('en-IN')} Saved!**\n\n• Category: ${category}\n• Account: ${accountId}\n• Account balance automatically debited.`,
      }
    }

    case FLOW_TYPES.ORDER: {
      const { clientId, clientName, sku, qty, rate, address, totalAmount, date, time } = flowData
      if (!store.addOrder) throw new Error('addOrder store method not found')
      const now = new Date()
      const localDate = date || getLocalDateStr(now)
      const localTime = time || getLocalTimeStr(now)

      const result = await store.addOrder({
        clientId,
        clientName,
        items: [
          {
            sku: sku || DEFAULT_SKU,
            qty: Number(qty) || 1,
            rate: Number(rate) || 0,
            amount: Number(totalAmount) || (Number(qty) || 1) * (Number(rate) || 0),
          },
        ],
        totalQty: Number(qty) || 1,
        totalAmount: Number(totalAmount) || (Number(qty) || 1) * (Number(rate) || 0),
        qty: Number(qty) || 1,
        rate: Number(rate) || 0,
        sku: sku || DEFAULT_SKU,
        address: address || '',
        location: address || '',
        status: 'Pending',
        date: localDate,
        time: localTime,
      })
      return {
        success: true,
        result,
        text: `✅ **Order Placed Successfully!**\n\n• Customer: ${clientName}\n• Order: ${qty} × ${sku} (@ ₹${rate})\n• Total: ₹${Number(totalAmount).toLocaleString('en-IN')}\n• Date: ${localDate} @ ${localTime}\n• Delivery: ${address}`,
      }
    }

    case FLOW_TYPES.PAYMENT: {
      const { clientId, clientName, amount, method, accountId, note, remainingDues } = flowData
      if (!store.addPayment) throw new Error('addPayment store method not found')
      const result = await store.addPayment({
        clientId,
        clientName,
        amount: Number(amount),
        method: method || 'cash',
        accountId: accountId || 'counter',
        note: note || '',
        date: new Date(),
      })
      return {
        success: true,
        result,
        text: `✅ **Payment of ₹${Number(amount).toLocaleString('en-IN')} Recorded!**\n\n• Customer: ${clientName}\n• Mode: ${method?.toUpperCase()}\n• Deposited To: ${accountId}\n• Remaining Dues: ₹${(remainingDues || 0).toLocaleString('en-IN')}`,
      }
    }

    case FLOW_TYPES.CASH_HANDOVER: {
      const { fromAccountId, toAccountId, amount, notes } = flowData
      if (!store.recordAccountTransfer) throw new Error('recordAccountTransfer store method not found')
      const result = await store.recordAccountTransfer({
        fromAccountId,
        toAccountId,
        amount: Number(amount),
        notes: notes || '',
        date: new Date(),
      })
      return {
        success: true,
        result,
        text: `✅ **Cash Handover of ₹${Number(amount).toLocaleString('en-IN')} Completed!**\n\n• From: ${fromAccountId}\n• To: ${toAccountId}\n• Balances updated automatically.`,
      }
    }

    case FLOW_TYPES.STAFF_ADVANCE: {
      const { employeeId, employeeName, amount, sourceAccountId, note, newAdvanceTotal } = flowData
      if (!store.recordStaffAdvance) throw new Error('recordStaffAdvance store method not found')
      const result = await store.recordStaffAdvance({
        employeeId,
        employeeName,
        amount: Number(amount),
        sourceAccountId: sourceAccountId || 'counter',
        note: note || '',
        date: new Date(),
      })
      return {
        success: true,
        result,
        text: `✅ **Advance of ₹${Number(amount).toLocaleString('en-IN')} Disbursed!**\n\n• Staff: ${employeeName}\n• Paid From: ${sourceAccountId}\n• Total Active Advance: ₹${(newAdvanceTotal || 0).toLocaleString('en-IN')}`,
      }
    }

    case FLOW_TYPES.STAFF_TASK: {
      const { text, assignedTo, assignedStaffName, staffPhone, dueDate, isFollowUp, sendSms } = flowData
      const payload = {
        text,
        assignedTo,
        assignedStaffName,
        staffPhone,
        dueDate,
        isFollowUp: Boolean(isFollowUp),
        sendNotificationSms: Boolean(sendSms),
      }
      const result = store.addStaffJob
        ? await store.addStaffJob(payload)
        : await createStaffTaskInDb(payload)

      const smsNotice = sendSms
        ? (result?.smsSent
            ? ` • 📲 SMS sent!`
            : ` • 🌙 SMS held (outside daytime)`)
        : ''

      return {
        success: true,
        result,
        text: `✅ **${isFollowUp ? 'Follow-up' : 'Task'} Assigned to ${assignedStaffName}**\n• 🎯 ${dueDate}${smsNotice}\n• "${text}"`,
      }
    }

    default:
      throw new Error(`Unknown flow type: ${flowType}`)
  }
}
