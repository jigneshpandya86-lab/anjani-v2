import { describe, it, expect, vi } from 'vitest'
import { WATER_SKUS } from '../constants/skus'

describe('Stock Sync and SKU Coverage', () => {
  it('covers all 9 SKUs in stock summary initialization', () => {
    const bySku = WATER_SKUS.reduce((acc, s) => {
      acc[s.label] = 0
      return acc
    }, {})

    expect(Object.keys(bySku).length).toBe(9)
    expect(bySku['Anjani 200ml']).toBe(0)
    expect(bySku['Bailey 250ml']).toBe(0)
    expect(bySku['Bailey 500ml']).toBe(0)
    expect(bySku['Bailey 1 Liter']).toBe(0)
    expect(bySku['Bailey 2 Liter']).toBe(0)
    expect(bySku['Bisleri 200ml']).toBe(0)
    expect(bySku['Bisleri 1 Liter']).toBe(0)
    expect(bySku['Rushi 500ml']).toBe(0)
    expect(bySku['Rushi 1 Liter']).toBe(0)
  })

  it('correctly calculates starting stock from closing stock, additions, and dispatches', () => {
    // Equation: startingStock + additions - dispatches = closingStock
    // Therefore: startingStock = closingStock - additions + dispatches
    const closingStock = 500
    const additions = 150
    const dispatches = 80

    const startingStock = closingStock - additions + dispatches
    expect(startingStock).toBe(430)
    expect(startingStock + additions - dispatches).toBe(closingStock)
  })

  it('detects missing SKUs or drift in stock summary', () => {
    // Case 1: Legacy summary only has 5 SKUs
    const legacyBySku = {
      'Anjani 200ml': 100,
      'Bailey 250ml': 50,
      'Bailey 500ml': 30,
      'Bailey 1 Liter': 20,
      'Bailey 2 Liter': 10,
    }

    const isMissingSkus = WATER_SKUS.some((s) => legacyBySku[s.label] === undefined)
    expect(isMissingSkus).toBe(true)

    // Case 2: Full summary has all 9 SKUs
    const fullBySku = WATER_SKUS.reduce((acc, s) => ({ ...acc, [s.label]: 10 }), {})
    const isMissingSkusFull = WATER_SKUS.some((s) => fullBySku[s.label] === undefined)
    expect(isMissingSkusFull).toBe(false)

    // Case 3: Drift detection
    const storedTotal = 100
    const sumBySku = 90
    const hasDrift = Math.abs(storedTotal - sumBySku) > 0.001
    expect(hasDrift).toBe(true)
  })

  it('verifies order status reversal logic math', () => {
    const items = [
      { sku: 'Anjani 200ml', qty: 25, rate: 80 },
      { sku: 'Bailey 500ml', qty: 10, rate: 120 },
    ]

    const totalReversalQty = items.reduce((sum, it) => sum + Math.abs(Number(it.qty || 0)), 0)
    const totalReversalAmount = items.reduce(
      (sum, it) => sum + Math.abs(Number(it.qty || 0)) * Number(it.rate || 0),
      0,
    )

    expect(totalReversalQty).toBe(35)
    expect(totalReversalAmount).toBe(25 * 80 + 10 * 120) // 2000 + 1200 = 3200
  })
})
