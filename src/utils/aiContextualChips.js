import { getMostUsedClients } from './chatbotFlowEngine'

/**
 * Generates dynamic, context-aware chips based on conversational AI responses.
 * Strictly adheres to NO REGEX rule (uses only string & array operations).
 *
 * @param {Object} params
 * @param {string} [params.text] - The response text from AI / assistant
 * @param {string} [params.lastUserMessage] - The last message or prompt from the user
 * @param {Array} [params.clients] - Firestore clients list
 * @param {Array} [params.orders] - Firestore orders list
 * @returns {Array<{ label: string, value?: string, action?: string, isPrimary?: boolean, isDestructive?: boolean }>}
 */
export function getContextualAiChips({
  text = '',
  lastUserMessage = '',
  clients = [],
  orders = [],
} = {}) {
  const t = (text || '').toLowerCase().trim()
  const u = (lastUserMessage || '').toLowerCase().trim()

  // 1. Customer Selection Context
  // Gemini asks who the order is for, or user initiated order booking without a client
  const isAskingCustomer =
    t.includes('who is this order for') ||
    t.includes('which customer') ||
    t.includes('specify the customer') ||
    t.includes('who should i book') ||
    t.includes('customer name') ||
    t.includes('client name') ||
    t.includes('which client') ||
    t.includes('for which customer') ||
    t.includes('name of the customer') ||
    t.includes('please provide the customer') ||
    u === 'book order' ||
    u === 'order' ||
    u === 'create order' ||
    u === 'new order' ||
    (u.startsWith('book order') && !u.includes('for '))

  if (isAskingCustomer) {
    const chips = []
    const topClients = getMostUsedClients(clients, orders, 4)
    for (const c of topClients) {
      const name = c.displayName || c.name
      if (name && name.trim().length > 0) {
        chips.push({
          label: `👤 ${name.trim()}`,
          value: `Book order for ${name.trim()}`,
        })
      }
    }

    chips.push({
      label: '🏪 Walk-in Retail',
      value: 'Book order for Retail',
    })

    // If AI also asked about quantity in the same sentence (e.g. "Who is this order for, and how many boxes should I book?")
    if (
      t.includes('how many') ||
      t.includes('quantity') ||
      t.includes('how much') ||
      t.includes('box')
    ) {
      chips.push({ label: '📦 20 Boxes', value: '20 boxes' })
      chips.push({ label: '📦 50 Boxes', value: '50 boxes' })
    }

    return chips
  }

  // 2. Quantity Selection Context
  const isAskingQuantity =
    t.includes('how many boxes') ||
    t.includes('how many cases') ||
    t.includes('how many') ||
    t.includes('quantity') ||
    t.includes('how much box') ||
    t.includes('number of boxes') ||
    t.includes('specify the quantity')

  if (isAskingQuantity) {
    return [
      { label: '📦 10 Boxes', value: '10 boxes' },
      { label: '📦 20 Boxes', value: '20 boxes' },
      { label: '📦 50 Boxes', value: '50 boxes' },
      { label: '📦 100 Boxes', value: '100 boxes' },
    ]
  }

  // 3. Delivery Shift / Time Selection Context
  const isAskingTiming =
    t.includes('what time') ||
    t.includes('which time') ||
    t.includes('which shift') ||
    t.includes('what shift') ||
    t.includes('delivery time') ||
    t.includes('delivery shift') ||
    t.includes('when should i deliver') ||
    t.includes('when would you like') ||
    t.includes('delivery date') ||
    t.includes('which date')

  if (isAskingTiming) {
    return [
      { label: '🌅 Morning (9 AM)', value: 'Morning shift 9 AM' },
      { label: '☀️ Afternoon (1 PM)', value: 'Afternoon shift 1 PM' },
      { label: '🌆 Evening (4 PM)', value: 'Evening shift 4 PM' },
      { label: '📅 Tomorrow 11 AM', value: 'Tomorrow 11 AM' },
    ]
  }

  // 4. Confirmation / Approval Context
  const isAskingConfirmation =
    t.includes('shall i proceed') ||
    t.includes('shall i book') ||
    t.includes('should i book') ||
    t.includes('should i proceed') ||
    t.includes('confirm this order') ||
    t.includes('confirm booking') ||
    t.includes('would you like to confirm') ||
    t.includes('do you want to confirm') ||
    t.includes('do you want to proceed') ||
    t.includes('please confirm')

  if (isAskingConfirmation) {
    return [
      { label: '✅ Yes, proceed', value: 'Yes, proceed', isPrimary: true },
      { label: '❌ Cancel', value: 'Cancel', isDestructive: true },
    ]
  }

  // 5. Payment Method Selection Context
  const isAskingPaymentMode =
    t.includes('payment mode') ||
    t.includes('payment method') ||
    t.includes('how was the payment') ||
    t.includes('cash or online') ||
    t.includes('which account') ||
    t.includes('cash counter')

  if (isAskingPaymentMode) {
    return [
      { label: '💵 Counter Cash', value: 'Cash counter' },
      { label: '📱 Online / UPI', value: 'Online UPI' },
      { label: '🏦 Bank Transfer', value: 'Bank transfer' },
    ]
  }

  // 6. Order Just Booked / Draft Created Context
  const isOrderCompleted =
    t.includes('order booked') ||
    t.includes('order created') ||
    t.includes('successfully booked') ||
    t.includes('draft created') ||
    t.includes('order saved')

  if (isOrderCompleted) {
    return [
      { label: "📦 Today's Orders", action: 'query_orders', value: "today's orders" },
      { label: '📊 Check Stock', action: 'query_stock', value: 'check stock' },
      { label: '📦 Book Another Order', flow: 'order', value: 'book order' },
      { label: '💳 Outstanding Dues', action: 'query_dues', value: 'outstanding dues' },
    ]
  }

  // 7. Stock / Inventory Inquiries
  const isStockInfo =
    t.includes('stock balance') ||
    t.includes('current stock') ||
    t.includes('available stock') ||
    t.includes('warehouse inventory')

  if (isStockInfo) {
    return [
      { label: '📦 Book Order', flow: 'order', value: 'book order' },
      { label: "📦 Today's Orders", action: 'query_orders', value: "today's orders" },
      { label: '🚚 Inward Stock', value: 'add 100 boxes 200ml to production' },
    ]
  }

  // 8. Outstanding Dues / Balances Inquiries
  const isDuesInfo =
    t.includes('outstanding dues') ||
    t.includes('pending receivables') ||
    t.includes('unpaid balance')

  if (isDuesInfo) {
    return [
      { label: '💳 Record Payment', value: 'record payment' },
      { label: '📄 Client Statement', value: 'generate statement' },
      { label: "📦 Today's Orders", action: 'query_orders', value: "today's orders" },
    ]
  }

  // 9. Default Fallback (Main Menu Launcher)
  return [
    { label: '📦 Book Order', flow: 'order', value: 'book order' },
    { label: "📦 Today's Orders", action: 'query_orders', value: "today's orders" },
    { label: '📊 Check Stock', action: 'query_stock', value: 'check stock' },
    { label: '💳 Outstanding Dues', action: 'query_dues', value: 'outstanding dues' },
    { label: '📋 Staff Tasks', action: 'query_tasks', value: 'show staff tasks' },
  ]
}
