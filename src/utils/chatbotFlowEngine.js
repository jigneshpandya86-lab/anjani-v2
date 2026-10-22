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

export const FLOW_TYPES = {
  EXPENSE: 'expense',
  ORDER: 'order',
  PAYMENT: 'payment',
  CASH_HANDOVER: 'cash_handover',
  STAFF_ADVANCE: 'staff_advance',
}

export const MAIN_MENU_CHIPS = [
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
    text: `🤖 **Anjani WhatsApp-Style Assistant**\n\nNamaste Jigneshbhai! Please choose what you would like to do from the menu below:`,
    chips: MAIN_MENU_CHIPS,
    isMainMenu: true,
  }
}

/**
 * Starts a specific flow and returns the first bot prompt + chips
 */
export function startChatbotFlow(flowType, context = {}) {
  const { clients = [], staffList = [], accountsSummary = {} } = context

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
      // Pick top 8 clients
      const clientChips = (clients || []).slice(0, 8).map((c) => ({
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
      // Pick top clients, prioritizing those with outstanding balance
      const sortedClients = [...(clients || [])].sort(
        (a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0)
      )
      const clientChips = sortedClients.slice(0, 8).map((c) => {
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
      let rate = 0
      if (client) {
        rate = Number(client.skuRates?.[data.sku] ?? client.rate ?? 0)
      }
      if (rate <= 0) {
        rate = getRecentSkuPrice(data.sku, orders, client?.id)
      }
      if (rate <= 0) {
        const meta = getSkuMeta(data.sku)
        rate = meta.defaultPrice || 120
      }

      const updatedData = { ...data, qty, suggestedRate: rate }

      return {
        flow,
        step: 'rate',
        data: updatedData,
        text: `💰 **Step 4/5: Rate per Unit**\n\nStandard rate for **${data.clientName}** is **₹${rate}**. Select or type custom rate:`,
        chips: [
          { label: `₹${rate} (Standard Rate)`, value: rate },
          { label: `₹${rate - 5}`, value: rate - 5 },
          { label: `₹${rate + 5}`, value: rate + 5 },
          { label: `₹${rate - 10}`, value: Math.max(10, rate - 10) },
          { label: '❌ Cancel', action: 'cancel', isDestructive: true },
        ],
        inputPrompt: `Enter rate (e.g. ${rate})...`,
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
      const updatedData = {
        ...data,
        address: address || data.clientObj?.address || 'Standard Delivery',
        totalAmount,
        date: new Date().toISOString(),
      }

      return {
        flow,
        step: 'confirm',
        data: updatedData,
        isConfirmation: true,
        text: `📦 **Confirm Order Booking**\n\n• **Customer**: ${updatedData.clientName}\n• **Product**: ${updatedData.qty} × ${updatedData.sku}\n• **Rate**: ₹${updatedData.rate} / unit\n• **Total Amount**: ₹${totalAmount.toLocaleString('en-IN')}\n• **Delivery**: ${updatedData.address}\n• **Status**: Pending Delivery\n\nTap **Confirm Order** to book now:`,
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
      const { clientId, clientName, sku, qty, rate, address, totalAmount } = flowData
      if (!store.addOrder) throw new Error('addOrder store method not found')
      const result = await store.addOrder({
        clientId,
        clientName,
        items: [
          {
            sku: sku || DEFAULT_SKU,
            qty: Number(qty) || 1,
            rate: Number(rate) || 0,
            amount: totalAmount,
          },
        ],
        totalQty: Number(qty) || 1,
        totalAmount: Number(totalAmount) || 0,
        address: address || '',
        location: address || '',
        status: 'Pending',
        date: new Date().toISOString(),
      })
      return {
        success: true,
        result,
        text: `✅ **Order Placed Successfully!**\n\n• Customer: ${clientName}\n• Order: ${qty} × ${sku} (@ ₹${rate})\n• Total: ₹${totalAmount.toLocaleString('en-IN')}\n• Delivery: ${address}`,
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

    default:
      throw new Error(`Unknown flow type: ${flowType}`)
  }
}
