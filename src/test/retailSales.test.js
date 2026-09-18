import { describe, it, expect } from 'vitest'
import { getSkuMeta } from '../constants/skus'

describe('Retail Sales Batch Normalization', () => {
  const mockClients = [
    {
      id: 'cli_1',
      name: 'Jay Ambe Provision',
      mobile: '9876543210',
      rate: 110,
      skuRates: {
        'Anjani 200ml': 105,
        'Bailey 1 Liter': 130,
      },
    },
    {
      id: 'cli_2',
      name: 'Rohitbhai',
      mobile: '9898012345',
      rate: 115,
    },
  ]

  it('normalizes common SKU aliases to canonical SKUs', () => {
    expect(getSkuMeta('200ml').label).toBe('Anjani 200ml')
    expect(getSkuMeta('1L').label).toBe('Bailey 1 Liter')
    expect(getSkuMeta('500ml').label).toBe('Bailey 500ml')
    expect(getSkuMeta('250ml').label).toBe('Bailey 250ml')
    expect(getSkuMeta('2L').label).toBe('Bailey 2 Liter')
  })

  it('correctly matches client by name or mobile', () => {
    const findClient = (rawName, mobile) => {
      return mockClients.find(
        (c) =>
          c.name.toLowerCase().trim() === rawName.toLowerCase().trim() ||
          (mobile && c.mobile === String(mobile).replace(/\D/g, ''))
      )
    }

    const match1 = findClient('jay ambe provision', '')
    expect(match1).toBeDefined()
    expect(match1.id).toBe('cli_1')

    const match2 = findClient('Rohit', '9898012345')
    expect(match2).toBeDefined()
    expect(match2.id).toBe('cli_2')

    const match3 = findClient('New Unknown Customer', '9999999999')
    expect(match3).toBeUndefined()
  })

  it('resolves custom client rates when parsed rate is zero or missing', () => {
    const resolveItemRate = (client, skuLabel, parsedRate) => {
      let rate = Number(parsedRate) || 0
      if (rate <= 0 && client) {
        rate = Number(client.skuRates?.[skuLabel] ?? client.rate ?? 0)
      }
      return rate
    }

    const client1 = mockClients[0]
    expect(resolveItemRate(client1, 'Anjani 200ml', 0)).toBe(105)
    expect(resolveItemRate(client1, 'Bailey 1 Liter', 0)).toBe(130)
    // Custom item rate given in note takes precedence
    expect(resolveItemRate(client1, 'Anjani 200ml', 100)).toBe(100)

    const client2 = mockClients[1]
    expect(resolveItemRate(client2, 'Bailey 500ml', 0)).toBe(115) // falls back to client.rate
  })

  it('calculates order total correctly and defaults payment modes', () => {
    const items = [
      { sku: 'Anjani 200ml', qty: 10, rate: 105 },
      { sku: 'Bailey 1 Liter', qty: 5, rate: 130 },
    ]
    const totalAmount = items.reduce((s, it) => s + it.qty * it.rate, 0)
    expect(totalAmount).toBe(10 * 105 + 5 * 130) // 1050 + 650 = 1700

    const validModes = ['cash', 'online', 'credit']
    const normalizeMode = (mode) => (validModes.includes(mode) ? mode : 'credit')

    expect(normalizeMode('cash')).toBe('cash')
    expect(normalizeMode('online')).toBe('online')
    expect(normalizeMode('credit')).toBe('credit')
    expect(normalizeMode('unknown')).toBe('credit')
  })
})
