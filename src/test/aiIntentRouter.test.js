import { describe, it, expect } from 'vitest'
import { tryLocalIntentRoute } from '../utils/aiIntentRouter'

describe('aiIntentRouter', () => {
  it('handles stock intent locally with zero tokens', () => {
    const fakeStore = {
      stockSummary: {
        'Anjani 200ml': 150,
        'Bailey 1 Liter': 40,
      },
    }
    const result = tryLocalIntentRoute('ketlo stock che?', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('stock_summary')
    expect(result.data.stockItems.find((s) => s.sku === 'Anjani 200ml').qty).toBe(150)
  })

  it('handles pending orders intent locally with zero tokens', () => {
    const fakeStore = {
      orders: [
        { id: '1', clientName: 'Ramesh', status: 'pending', date: new Date().toISOString().split('T')[0] },
        { id: '2', clientName: 'Suresh', status: 'delivered', date: new Date().toISOString().split('T')[0] },
      ],
    }
    const result = tryLocalIntentRoute('show pending orders', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('orders_list')
    expect(result.data.orders.length).toBe(1)
  })

  it('handles outstanding payments intent locally with zero tokens', () => {
    const fakeStore = {
      clients: [
        { id: 'c1', name: 'Hotel Grand', outstanding: 5000 },
        { id: 'c2', name: 'Zero Due', outstanding: 0, balance: 0 },
        { id: 'c3', name: 'Legacy Client', balance: 2500 },
      ],
    }
    const result = tryLocalIntentRoute('who has outstanding bill?', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('outstanding_list')
    expect(result.data.clients.length).toBe(2)
    expect(result.data.totalPending).toBe(7500)
    expect(result.data.clients[0].outstanding).toBe(5000)
    expect(result.data.clients[1].outstanding).toBe(2500)
  })

  it('returns null for unknown freeform query to pass to AI', () => {
    const fakeStore = {}
    const result = tryLocalIntentRoute('Can you summarize my expenses for last month?', fakeStore)
    expect(result).toBeNull()
  })
})
