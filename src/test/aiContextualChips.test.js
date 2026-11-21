import { describe, it, expect } from 'vitest'
import { getContextualAiChips } from '../utils/aiContextualChips'

describe('aiContextualChips', () => {
  const mockClients = [
    { id: 'c1', name: 'Bhaveshbhai', displayName: 'Bhaveshbhai' },
    { id: 'c2', name: 'Maruti Caterers', displayName: 'Maruti Caterers' },
    { id: 'c3', name: 'Kamleshbhai', displayName: 'Kamleshbhai' },
    { id: 'c4', name: 'Jay Ambe Provision', displayName: 'Jay Ambe' },
  ]

  const mockOrders = [
    { clientId: 'c1', clientName: 'Bhaveshbhai' },
    { clientId: 'c1', clientName: 'Bhaveshbhai' },
    { clientId: 'c2', clientName: 'Maruti Caterers' },
  ]

  it('provides customer chips when AI asks who the order is for', () => {
    const chips = getContextualAiChips({
      text: 'Who is this order for, and how many boxes should I book?',
      lastUserMessage: 'book order',
      clients: mockClients,
      orders: mockOrders,
    })

    expect(chips.length).toBeGreaterThanOrEqual(4)
    expect(chips.some((c) => c.label.includes('Bhaveshbhai'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Walk-in Retail'))).toBe(true)
    expect(chips.some((c) => c.value === '20 boxes')).toBe(true)
  })

  it('provides customer chips when user prompt is book order without client', () => {
    const chips = getContextualAiChips({
      text: 'Please provide customer details.',
      lastUserMessage: 'book order',
      clients: mockClients,
      orders: mockOrders,
    })

    expect(chips.some((c) => c.label.includes('Bhaveshbhai'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Walk-in Retail'))).toBe(true)
  })

  it('provides quantity chips when AI asks for quantity', () => {
    const chips = getContextualAiChips({
      text: 'Got it, Bhaveshbhai! How many boxes should I book?',
      lastUserMessage: 'Book order for Bhaveshbhai',
      clients: mockClients,
      orders: mockOrders,
    })

    expect(chips).toHaveLength(4)
    expect(chips[0].value).toBe('10 boxes')
    expect(chips[1].value).toBe('20 boxes')
    expect(chips[2].value).toBe('50 boxes')
    expect(chips[3].value).toBe('100 boxes')
  })

  it('provides shift and timing chips when AI asks for delivery time', () => {
    const chips = getContextualAiChips({
      text: 'What time or which shift would you like this delivered?',
      lastUserMessage: '50 boxes',
    })

    expect(chips).toHaveLength(4)
    expect(chips.some((c) => c.label.includes('Morning'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Afternoon'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Evening'))).toBe(true)
  })

  it('provides confirmation chips when AI asks for confirmation', () => {
    const chips = getContextualAiChips({
      text: 'I have drafted 50 boxes for Bhaveshbhai for 11 AM today. Shall I proceed?',
      lastUserMessage: '11 AM',
    })

    expect(chips).toHaveLength(2)
    expect(chips[0].label).toContain('Yes, proceed')
    expect(chips[0].isPrimary).toBe(true)
    expect(chips[1].label).toContain('Cancel')
    expect(chips[1].isDestructive).toBe(true)
  })

  it('provides payment mode chips when AI asks about payment method', () => {
    const chips = getContextualAiChips({
      text: 'Which payment method was used (cash or online)?',
      lastUserMessage: 'received 5000 from Bhaveshbhai',
    })

    expect(chips).toHaveLength(3)
    expect(chips.some((c) => c.label.includes('Counter Cash'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Online / UPI'))).toBe(true)
    expect(chips.some((c) => c.label.includes('Bank Transfer'))).toBe(true)
  })

  it('provides post-order chips when an order is completed', () => {
    const chips = getContextualAiChips({
      text: 'Order #ORD-1234 successfully booked for Bhaveshbhai!',
      lastUserMessage: 'Yes, proceed',
    })

    expect(chips.some((c) => c.value === "today's orders")).toBe(true)
    expect(chips.some((c) => c.value === 'check stock')).toBe(true)
    expect(chips.some((c) => c.value === 'book order')).toBe(true)
  })

  it('provides stock management chips when stock is queried', () => {
    const chips = getContextualAiChips({
      text: 'Here is the current warehouse inventory and available stock balance.',
      lastUserMessage: 'check stock',
    })

    expect(chips.some((c) => c.value === 'book order')).toBe(true)
    expect(chips.some((c) => c.value === "today's orders")).toBe(true)
    expect(chips.some((c) => c.label.includes('Inward Stock'))).toBe(true)
  })

  it('provides dues management chips when outstanding dues are queried', () => {
    const chips = getContextualAiChips({
      text: 'Total outstanding dues across clients is ₹45,000.',
      lastUserMessage: 'outstanding dues',
    })

    expect(chips.some((c) => c.value === 'record payment')).toBe(true)
    expect(chips.some((c) => c.value === 'generate statement')).toBe(true)
  })

  it('provides default launcher chips on greeting or generic text', () => {
    const chips = getContextualAiChips({
      text: 'Hello! I am Anjani AI, your operations assistant. How can I assist you today?',
      lastUserMessage: 'hello',
    })

    expect(chips).toHaveLength(5)
    expect(chips[0].label).toBe('📦 Book Order')
    expect(chips[1].label).toBe("📦 Today's Orders")
    expect(chips[2].label).toBe('📊 Check Stock')
    expect(chips[3].label).toBe('💳 Outstanding Dues')
    expect(chips[4].label).toBe('📋 Staff Tasks')
  })

  it('handles null, undefined, or empty parameters gracefully', () => {
    const chips = getContextualAiChips()
    expect(chips).toHaveLength(5)
    expect(chips[0].label).toBe('📦 Book Order')
  })
})
