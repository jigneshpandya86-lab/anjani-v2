import { describe, it, expect } from 'vitest'
import { WATER_SKUS, DEFAULT_SKU, SKU_LABELS, getSkuMeta } from '../constants/skus'

describe('WATER_SKUS Configuration', () => {
  it('contains Anjani 200ml and all 4 Bailey SKUs', () => {
    expect(WATER_SKUS.length).toBe(5)
    const labels = WATER_SKUS.map((s) => s.label)
    expect(labels).toContain('Anjani 200ml')
    expect(labels).toContain('Bailey 250ml')
    expect(labels).toContain('Bailey 500ml')
    expect(labels).toContain('Bailey 1 Liter')
    expect(labels).toContain('Bailey 2 Liter')
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
    ])
  })

  it('getSkuMeta finds the correct SKU case-insensitively', () => {
    const meta = getSkuMeta('bailey 1 liter')
    expect(meta.id).toBe('bailey_1l')
    expect(meta.brand).toBe('Bailey')
    expect(meta.unit).toBe('Case / Box')
  })

  it('getSkuMeta falls back gracefully to default for unknown or empty input', () => {
    expect(getSkuMeta(null).label).toBe('Anjani 200ml')
    expect(getSkuMeta('').label).toBe('Anjani 200ml')
    expect(getSkuMeta('Unknown Product').label).toBe('Anjani 200ml')
  })
})
