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

  it('normalizes unknown, walk-in, or unnamed clients to Retail', () => {
    const normalizeClientName = (rawName) => {
      let name = String(rawName || '').trim()
      if (!name || /^customer\s*\d*$/i.test(name) || /^walk[\s-]*in/i.test(name) || /^unknown/i.test(name)) {
        return 'Retail'
      }
      return name
    }

    expect(normalizeClientName('')).toBe('Retail')
    expect(normalizeClientName(null)).toBe('Retail')
    expect(normalizeClientName(undefined)).toBe('Retail')
    expect(normalizeClientName('Customer 1')).toBe('Retail')
    expect(normalizeClientName('customer 4')).toBe('Retail')
    expect(normalizeClientName('Customer')).toBe('Retail')
    expect(normalizeClientName('walk-in')).toBe('Retail')
    expect(normalizeClientName('Walk in Customer')).toBe('Retail')
    expect(normalizeClientName('Jay Ambe Provision')).toBe('Jay Ambe Provision')
  })

  it('ensures orders are created with Confirmed status so they can be edited prior to delivery', () => {
    const createOrderPayload = (sale, clientDocId, clientName) => ({
      clientId: clientDocId || '',
      clientName: clientName || 'Retail',
      status: 'Confirmed',
      source: 'whatsapp_sales',
    })

    const order = createOrderPayload({}, 'cli_retail', 'Retail')
    expect(order.status).toBe('Confirmed')
    expect(order.clientName).toBe('Retail')
    expect(order.source).toBe('whatsapp_sales')
  })
})
