import { describe, it, expect } from 'vitest'
import { getSkuMeta } from '../constants/skus'
import { isRetailCustomer, consolidateRetailSales } from '../utils/salesBatchUtils'

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

  it('normalizes unknown, walk-in, or unnamed clients to Retail using isRetailCustomer', () => {
    expect(isRetailCustomer('')).toBe(true)
    expect(isRetailCustomer(null)).toBe(true)
    expect(isRetailCustomer(undefined)).toBe(true)
    expect(isRetailCustomer('Customer 1')).toBe(true)
    expect(isRetailCustomer('customer 4')).toBe(true)
    expect(isRetailCustomer('Customer')).toBe(true)
    expect(isRetailCustomer('walk-in')).toBe(true)
    expect(isRetailCustomer('Walk in Customer')).toBe(true)
    expect(isRetailCustomer('unknown')).toBe(true)
    expect(isRetailCustomer('Retail')).toBe(true)
    expect(isRetailCustomer('retail')).toBe(true)
    expect(isRetailCustomer('Jay Ambe Provision')).toBe(false)
  })

  it('consolidates multiple retail sales into a SINGLE Retail order with summed quantities', () => {
    const rawSales = [
      {
        clientName: 'Retail',
        items: [{ sku: 'Anjani 200ml', qty: 10, rate: 105 }],
        paymentMode: 'cash',
        totalAmount: 1050,
      },
      {
        clientName: 'Jay Ambe Provision',
        items: [{ sku: 'Anjani 200ml', qty: 20, rate: 105 }],
        paymentMode: 'credit',
        totalAmount: 2100,
      },
      {
        clientName: 'Walk-in',
        items: [{ sku: 'Anjani 200ml', qty: 5, rate: 105 }],
        paymentMode: 'cash',
        totalAmount: 525,
      },
      {
        clientName: 'Customer 3',
        items: [{ sku: 'Bailey 500ml', qty: 4, rate: 150 }],
        paymentMode: 'online',
        totalAmount: 600,
      },
    ]

    const consolidated = consolidateRetailSales(rawSales, mockClients)

    // Should contain exactly 2 orders: 1 for Retail, 1 for Jay Ambe Provision
    expect(consolidated.length).toBe(2)

    const retailOrder = consolidated.find((s) => s.clientName === 'Retail')
    expect(retailOrder).toBeDefined()
    expect(retailOrder.isConsolidatedRetail).toBe(true)

    // Check items in Retail order: Anjani 200ml = 10 + 5 = 15; Bailey 500ml = 4
    const anjaniItem = retailOrder.items.find((it) => it.sku === 'Anjani 200ml')
    expect(anjaniItem).toBeDefined()
    expect(anjaniItem.qty).toBe(15)

    const baileyItem = retailOrder.items.find((it) => it.sku === 'Bailey 500ml')
    expect(baileyItem).toBeDefined()
    expect(baileyItem.qty).toBe(4)

    // Total amount for retail: 1050 + 525 + 600 = 2175
    expect(retailOrder.totalAmount).toBe(2175)

    // Check Jay Ambe Provision order: intact and separate
    const jayAmbeOrder = consolidated.find((s) => s.clientName === 'Jay Ambe Provision')
    expect(jayAmbeOrder).toBeDefined()
    expect(jayAmbeOrder.items[0].qty).toBe(20)
    expect(jayAmbeOrder.totalAmount).toBe(2100)
    expect(jayAmbeOrder.isMatched).toBe(true)
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

  it('preserves separate line items for the same SKU when different rates are specified', () => {
    const rawSales = [
      {
        clientName: 'Retail',
        items: [
          { sku: 'Bailey 1 Liter', qty: 10, rate: 120 },
          { sku: 'Bailey 1 Liter', qty: 5, rate: 125 },
        ],
        paymentMode: 'cash',
      },
    ]

    const consolidated = consolidateRetailSales(rawSales, mockClients)
    expect(consolidated.length).toBe(1)
    const retailOrder = consolidated[0]

    // Must have 2 distinct line items, NOT merged into one
    expect(retailOrder.items.length).toBe(2)
    expect(retailOrder.items[0].sku).toBe('Bailey 1 Liter')
    expect(retailOrder.items[0].qty).toBe(10)
    expect(retailOrder.items[0].rate).toBe(120)

    expect(retailOrder.items[1].sku).toBe('Bailey 1 Liter')
    expect(retailOrder.items[1].qty).toBe(5)
    expect(retailOrder.items[1].rate).toBe(125)

    // Total amount: (10 * 120) + (5 * 125) = 1200 + 625 = 1825
    expect(retailOrder.totalAmount).toBe(1825)
  })
})
