import { describe, it, expect } from 'vitest'
import {
  BAILEY_SKUS,
  parseDateToMillis,
  calculateBaileyConsumptionStats,
  calculateBaileyReplenishment,
  generateBaileyPurchaseOrderWhatsApp,
  generateBaileyPurchaseOrderHtml,
} from '../utils/baileyOrderUtils'

describe('baileyOrderUtils', () => {
  it('identifies all 4 Bailey SKUs', () => {
    const labels = BAILEY_SKUS.map((s) => s.label)
    expect(labels).toHaveLength(4)
    expect(labels).toContain('Bailey 250ml')
    expect(labels).toContain('Bailey 500ml')
    expect(labels).toContain('Bailey 1 Liter')
    expect(labels).toContain('Bailey 2 Liter')
  })

  it('correctly parses various date formats', () => {
    const d = new Date('2026-09-20T12:00:00Z')
    expect(parseDateToMillis(d)).toBe(d.getTime())
    expect(parseDateToMillis({ seconds: 1700000000 })).toBe(1700000000000)
    expect(parseDateToMillis({ toMillis: () => 1720000000000 })).toBe(1720000000000)
    expect(parseDateToMillis('20-09-2026')).toBe(new Date('2026-09-20T00:00:00').getTime())
    expect(parseDateToMillis('2026-09-20')).toBe(new Date('2026-09-20').getTime())
  })

  it('calculates consumption stats and daily run-rate from orders and stock dispatches', () => {
    const now = new Date('2026-09-21T12:00:00Z').getTime()
    const twoDaysAgo = now - 2 * 86400000
    const fiveDaysAgo = now - 5 * 86400000
    const twentyDaysAgo = now - 20 * 86400000 // Out of 14-day window

    const orders = [
      {
        createdAt: twoDaysAgo,
        items: [
          { sku: 'Bailey 500ml', qty: 28 },
          { sku: 'Bailey 1 Liter', qty: 42 },
          { sku: 'Anjani 200ml', qty: 100 }, // Non-bailey, should be ignored
        ],
      },
      {
        createdAt: fiveDaysAgo,
        items: [
          { sku: 'Bailey 500ml', qty: 14 },
          { sku: 'Bailey 250ml', qty: 14 },
        ],
      },
      {
        createdAt: twentyDaysAgo,
        items: [{ sku: 'Bailey 500ml', qty: 999 }],
      },
    ]

    const stockSummary = {
      'Bailey 250ml': 10,
      'Bailey 500ml': 6,
      'Bailey 1 Liter': 0,
      'Bailey 2 Liter': 50,
    }

    const stats = calculateBaileyConsumptionStats({
      orders,
      stockEntries: [],
      stockSummary,
      daysWindow: 14,
      nowMillis: now,
    })

    expect(stats).toHaveLength(4)

    // Bailey 500ml: 28 + 14 = 42 cases over 14 days => 3.0 cases/day. Current stock 6 => runway 2.0 days (Critical <3d)
    const b500 = stats.find((s) => s.label === 'Bailey 500ml')
    expect(b500.totalConsumed).toBe(42)
    expect(b500.dailyRunRate).toBe(3)
    expect(b500.runwayDays).toBe(2)
    expect(b500.status.level).toBe('danger')

    // Bailey 1 Liter: 42 cases over 14 days => 3.0 cases/day. Current stock 0 => Out of Stock
    const b1l = stats.find((s) => s.label === 'Bailey 1 Liter')
    expect(b1l.totalConsumed).toBe(42)
    expect(b1l.dailyRunRate).toBe(3)
    expect(b1l.status.label).toBe('Out of Stock')

    // Bailey 250ml: 14 cases over 14 days => 1.0 cases/day. Current stock 10 => runway 10 days (Healthy)
    const b250 = stats.find((s) => s.label === 'Bailey 250ml')
    expect(b250.totalConsumed).toBe(14)
    expect(b250.dailyRunRate).toBe(1)
    expect(b250.runwayDays).toBe(10)
    expect(b250.status.level).toBe('healthy')

    // Bailey 2 Liter: 0 consumed over 14 days. Current stock 50 => Dormant / Sufficient
    const b2l = stats.find((s) => s.label === 'Bailey 2 Liter')
    expect(b2l.totalConsumed).toBe(0)
    expect(b2l.dailyRunRate).toBe(0)
    expect(b2l.status.level).toBe('dormant')
  })

  it('calculates replenishment recommendation based on target buffer days', () => {
    const stats = [
      {
        label: 'Bailey 500ml',
        currentStock: 6,
        dailyRunRate: 3.0,
      },
      {
        label: 'Bailey 1 Liter',
        currentStock: 0,
        dailyRunRate: 5.0,
      },
      {
        label: 'Bailey 250ml',
        currentStock: 25,
        dailyRunRate: 1.0,
      },
    ]

    // Target 7-day buffer:
    // Bailey 500ml needs 3 * 7 = 21 cases. Current: 6 => Reorder 15 cases.
    // Bailey 1 Liter needs 5 * 7 = 35 cases. Current: 0 => Reorder 35 cases.
    // Bailey 250ml needs 1 * 7 = 7 cases. Current: 25 => Reorder 0 cases.
    const plan7 = calculateBaileyReplenishment({
      consumptionStats: stats,
      targetBufferDays: 7,
    })

    expect(plan7.find((s) => s.label === 'Bailey 500ml').recommendedQty).toBe(15)
    expect(plan7.find((s) => s.label === 'Bailey 1 Liter').recommendedQty).toBe(35)
    expect(plan7.find((s) => s.label === 'Bailey 250ml').recommendedQty).toBe(0)

    // User overrides
    const planWithOverride = calculateBaileyReplenishment({
      consumptionStats: stats,
      targetBufferDays: 7,
      userOverrides: { 'Bailey 500ml': 20 },
    })
    expect(planWithOverride.find((s) => s.label === 'Bailey 500ml').finalOrderQty).toBe(20)
    expect(planWithOverride.find((s) => s.label === 'Bailey 500ml').hasOverride).toBe(true)
  })

  it('generates formatted WhatsApp purchase order and HTML', () => {
    const items = [
      { label: 'Bailey 500ml', finalOrderQty: 50, unit: 'Cases', dailyRunRate: 5 },
      { label: 'Bailey 1 Liter', finalOrderQty: 100, unit: 'Cases', dailyRunRate: 10 },
      { label: 'Bailey 250ml', finalOrderQty: 0, unit: 'Cases', dailyRunRate: 1 },
    ]

    const waText = generateBaileyPurchaseOrderWhatsApp({
      poNumber: 'PO-TEST-123',
      orderDate: '21/09/2026',
      items,
      notes: 'Load in afternoon dispatch',
    })

    expect(waText).toContain('PO-TEST-123')
    expect(waText).toContain('• *Bailey 500ml*: *50 Cases*')
    expect(waText).toContain('• *Bailey 1 Liter*: *100 Cases*')
    expect(waText).toContain('TOTAL CONSIGNMENT*: *150 Cases')
    expect(waText).toContain('Load in afternoon dispatch')
    expect(waText).toContain('9925997750')
    expect(waText).not.toContain('Daily:')

    const html = generateBaileyPurchaseOrderHtml({
      poNumber: 'PO-TEST-123',
      items,
    })
    expect(html).toContain('PURCHASE ORDER')
    expect(html).toContain('PO-TEST-123')
    expect(html).toContain('150 Cases')
    expect(html).toContain('9925997750')
    expect(html).not.toContain('Daily Velocity')
    expect(html).not.toContain('Current Stock')

    // Test with purchase rate
    const itemsWithRates = [
      { label: 'Bailey 500ml', finalOrderQty: 50, unit: 'Cases', purchaseRate: 120 },
      { label: 'Bailey 1 Liter', finalOrderQty: 100, unit: 'Cases', purchaseRate: 150 },
    ]
    const waWithRates = generateBaileyPurchaseOrderWhatsApp({
      poNumber: 'PO-TEST-456',
      items: itemsWithRates,
    })
    expect(waWithRates).toContain('• *Bailey 500ml*: *50 Cases* @ ₹120 = ₹6,000')
    expect(waWithRates).toContain('• *Bailey 1 Liter*: *100 Cases* @ ₹150 = ₹15,000')
    expect(waWithRates).toContain('TOTAL ESTIMATE*: *₹21,000*')

    const htmlWithRates = generateBaileyPurchaseOrderHtml({
      poNumber: 'PO-TEST-456',
      items: itemsWithRates,
    })
    expect(htmlWithRates).toContain('Rate (₹)')
    expect(htmlWithRates).toContain('Amount (₹)')
    expect(htmlWithRates).toContain('₹21,000')
  })
})
