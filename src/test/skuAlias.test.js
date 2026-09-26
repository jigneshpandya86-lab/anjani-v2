import { describe, it, expect } from 'vitest'
import {
  findMatchingSku,
  normalizeUnit,
  parseQuantityAndSku,
  getSkuShorthandDict,
} from '../utils/skuAliasUtils'

describe('skuAliasUtils', () => {
  describe('normalizeUnit', () => {
    it('normalizes regional slang to standard units', () => {
      expect(normalizeUnit('petli')).toBe('Box')
      expect(normalizeUnit('kedi')).toBe('Box')
      expect(normalizeUnit('crate')).toBe('Box')
      expect(normalizeUnit('khokha')).toBe('Box')
      expect(normalizeUnit('botal')).toBe('Bottle')
      expect(normalizeUnit('btl')).toBe('Bottle')
      expect(normalizeUnit('jar')).toBe('Jar')
      expect(normalizeUnit('batch')).toBe('Jar')
    })
  })

  describe('findMatchingSku', () => {
    it('resolves standard SKUs directly', () => {
      const res = findMatchingSku('Bailey 500ml')
      expect(res.sku.id).toBe('bailey_500ml')
      expect(res.confidence).toBe(1.0)
    })

    it('resolves 200ml and petli to Anjani 200ml', () => {
      expect(findMatchingSku('5 petli').sku.id).toBe('anjani_200ml')
      expect(findMatchingSku('200ml water').sku.id).toBe('anjani_200ml')
      expect(findMatchingSku('anjani 200').sku.id).toBe('anjani_200ml')
    })

    it('resolves 250ml and chhota botal to Bailey 250ml', () => {
      expect(findMatchingSku('chhota botal').sku.id).toBe('bailey_250ml')
      expect(findMatchingSku('10 chhoti').sku.id).toBe('bailey_250ml')
      expect(findMatchingSku('250ml case').sku.id).toBe('bailey_250ml')
    })

    it('resolves 500ml and aadho liter to Bailey 500ml', () => {
      expect(findMatchingSku('aadho liter').sku.id).toBe('bailey_500ml')
      expect(findMatchingSku('half liter bottle').sku.id).toBe('bailey_500ml')
      expect(findMatchingSku('500ml').sku.id).toBe('bailey_500ml')
    })

    it('resolves 1L and badi botal to Bailey 1 Liter', () => {
      expect(findMatchingSku('1 liter').sku.id).toBe('bailey_1l')
      expect(findMatchingSku('badi botal').sku.id).toBe('bailey_1l')
      expect(findMatchingSku('ek liter').sku.id).toBe('bailey_1l')
    })

    it('resolves 2L and family pack to Bailey 2 Liter', () => {
      expect(findMatchingSku('2 liter').sku.id).toBe('bailey_2l')
      expect(findMatchingSku('be liter').sku.id).toBe('bailey_2l')
      expect(findMatchingSku('2L case').sku.id).toBe('bailey_2l')
    })
  })

  describe('parseQuantityAndSku', () => {
    it('parses quantity and resolves SKU correctly', () => {
      const parsed1 = parseQuantityAndSku('5 petli 500ml')
      expect(parsed1.qty).toBe(5)
      expect(parsed1.sku.id).toBe('bailey_500ml')
      expect(parsed1.unit).toBe('Box')

      const parsed2 = parseQuantityAndSku('12 botal badi botal')
      expect(parsed2.qty).toBe(12)
      expect(parsed2.sku.id).toBe('bailey_1l')
      expect(parsed2.unit).toBe('Bottle')
    })
  })

  describe('getSkuShorthandDict', () => {
    it('provides clean slang dictionary for prompts', () => {
      const dict = getSkuShorthandDict()
      expect(Array.isArray(dict)).toBe(true)
      expect(dict.length).toBeGreaterThan(3)
    })
  })
})
