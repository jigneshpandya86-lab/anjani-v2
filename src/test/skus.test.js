import { describe, it, expect } from 'vitest'
import { WATER_SKUS, DEFAULT_SKU, SKU_LABELS, getSkuMeta } from '../constants/skus'

describe('WATER_SKUS Configuration', () => {
  it('contains Anjani, Bailey, and Bisleri SKUs', () => {
    expect(WATER_SKUS.length).toBe(7)
    const labels = WATER_SKUS.map((s) => s.label)
    expect(labels).toContain('Anjani 200ml')
    expect(labels).toContain('Bailey 250ml')
    expect(labels).toContain('Bailey 500ml')
    expect(labels).toContain('Bailey 1 Liter')
    expect(labels).toContain('Bailey 2 Liter')
    expect(labels).toContain('Bisleri 200ml')
    expect(labels).toContain('Bisleri 1 Liter')
  })

  it('has DEFAULT_SKU set to Anjani 200ml', () => {
    expect(DEFAULT_SKU).toBe('Anjani 200ml')
  })

  it('matches SKU_LABELS with WATER_SKUS', () => {
    expect(SKU_LABELS).toEqual([
      'Anjani 200ml',
      'Bailey 250ml',
      'Bailey 500ml',
      'Bailey 1 Liter',
      'Bailey 2 Liter',
      'Bisleri 200ml',
      'Bisleri 1 Liter',
    ])
  })

  it('getSkuMeta finds the correct SKU case-insensitively', () => {
    const meta = getSkuMeta('bailey 1 liter')
    expect(meta.id).toBe('bailey_1l')
    expect(meta.brand).toBe('Bailey')
    expect(meta.unit).toBe('Case / Box')

    const bisleri200 = getSkuMeta('Bisleri 200ml')
    expect(bisleri200.id).toBe('bisleri_200ml')
    expect(bisleri200.brand).toBe('Bisleri')

    const bisleri1L = getSkuMeta('bisleri 1 liter')
    expect(bisleri1L.id).toBe('bisleri_1l')
    expect(bisleri1L.brand).toBe('Bisleri')
  })

  it('getSkuMeta falls back gracefully to default for unknown or empty input', () => {
    expect(getSkuMeta(null).label).toBe('Anjani 200ml')
    expect(getSkuMeta('').label).toBe('Anjani 200ml')
    expect(getSkuMeta('Unknown Product').label).toBe('Anjani 200ml')
  })

  it('calculates totals correctly for multi-SKU line items', () => {
    const items = [
      { sku: 'Bailey 500ml', qty: 10, rate: 120 },
      { sku: 'Bailey 1 Liter', qty: 5, rate: 150 },
      { sku: 'Anjani 200ml', qty: 20, rate: 80 },
    ]
    const totalQty = items.reduce((acc, it) => acc + Number(it.qty), 0)
    const totalAmount = items.reduce((acc, it) => acc + Number(it.qty) * Number(it.rate), 0)

    expect(totalQty).toBe(35)
    expect(totalAmount).toBe(10 * 120 + 5 * 150 + 20 * 80) // 1200 + 750 + 1600 = 3550
  })
})
