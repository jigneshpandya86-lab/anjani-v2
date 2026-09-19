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

  it('handles Nilesh cash custody intent locally with zero tokens', () => {
    const fakeStore = {
      accountsSummary: {
        nilesh: 3500,
        hiteshbhai: 1200,
        counter: 8000,
        bank: 15000,
      },
    }
    const result = tryLocalIntentRoute('How much cash with Nilesh?', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('accounts_summary')
    expect(result.data.specificAccount).toBe('nilesh')
    expect(result.data.balances.nilesh).toBe(3500)
    expect(result.text).toContain('3,500')
  })

  it('handles general staff cash custody overview intent locally', () => {
    const fakeStore = {
      accountsSummary: {
        nilesh: 2000,
        hiteshbhai: 3000,
        counter: 5000,
        bank: 10000,
      },
    }
    const result = tryLocalIntentRoute('cash in hand summary', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('accounts_summary')
    expect(result.data.totalStaffCash).toBe(5000)
    expect(result.data.balances.counter).toBe(5000)
  })

  it('returns null for unknown freeform query to pass to AI', () => {
    const fakeStore = {}
    const result = tryLocalIntentRoute('Can you summarize my expenses for last month?', fakeStore)
    expect(result).toBeNull()
  })
})
