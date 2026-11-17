import { describe, it, expect } from 'vitest'
import { getSkuMeta } from '../constants/skus'
import { isRetailCustomer, consolidateRetailSales, normalizeDateString, normalizeDeliveryTime, parseLocalSalesText } from '../utils/salesBatchUtils'
import { getRecentSkuPrice } from '../utils/orderUtils'

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

  it('populates SKU price from recent orders when rate is not provided', () => {
    const mockOrders = [
      {
        id: 'ord_1',
        createdAt: '2026-09-25T10:00:00.000Z',
        clientId: 'cli_3',
        status: 'Delivered',
        items: [
          { sku: 'Bailey 500ml', qty: 10, rate: 85 },
          { sku: 'Bailey 250ml', qty: 5, rate: 55 },
        ],
      },
      {
        id: 'ord_2',
        createdAt: '2026-09-24T10:00:00.000Z',
        clientId: 'cli_2',
        status: 'Delivered',
        items: [
          { sku: 'Bailey 500ml', qty: 5, rate: 80 },
        ],
      },
    ]

    // 1. Test getRecentSkuPrice directly
    const recent500Price = getRecentSkuPrice('Bailey 500ml', mockOrders)
    expect(recent500Price).toBe(85)

    const clientSpecificPrice = getRecentSkuPrice('Bailey 500ml', mockOrders, 'cli_2')
    expect(clientSpecificPrice).toBe(80)

    // 2. Test consolidateRetailSales auto-populating rate from orders
    const rawSales = [
      {
        clientName: 'Walk-in Cash Customer',
        items: [
          { sku: 'Bailey 500ml', qty: 2 },
        ],
        paymentMode: 'cash',
      },
    ]

    const consolidated = consolidateRetailSales(rawSales, mockClients, mockOrders)
    expect(consolidated.length).toBe(1)
    expect(consolidated[0].items[0].rate).toBe(85)
    expect(consolidated[0].totalAmount).toBe(170)
  })

  it('enforces learned AI memory rate rule when rate is not provided in raw sale', () => {
    const mockMemories = [
      {
        id: 'mem_1',
        rule: 'Hotel Radhika gets Bailey 500ml at 115',
        active: true,
        structured: {
          clientId: 'cli_1', // Hotel Radhika
          clientName: 'Hotel Radhika',
          skuLabel: 'Bailey 500ml',
          enforcedRate: 115,
        },
      },
    ]

    const rawSales = [
      {
        clientName: 'Hotel Radhika',
        items: [{ sku: 'aadho liter', qty: 10 }], // uses slang "aadho liter"
        paymentMode: 'credit',
      },
    ]

    const consolidated = consolidateRetailSales(rawSales, mockClients, [], mockMemories)
    expect(consolidated.length).toBe(1)
    expect(consolidated[0].items[0].sku).toBe('Bailey 500ml')
    expect(consolidated[0].items[0].rate).toBe(115)
    expect(consolidated[0].items[0].ruleApplied).toBe('Learned Rate: ₹115')
    expect(consolidated[0].totalAmount).toBe(1150)
  })

  it('normalizes various date string formats including Gujarati digits', () => {
    expect(normalizeDateString('18/11/26')).toBe('2026-11-18')
    expect(normalizeDateString('20/11/2026')).toBe('2026-11-20')
    expect(normalizeDateString('2026-11-21')).toBe('2026-11-21')
    expect(normalizeDateString('૧૮/૧૧/૨૬')).toBe('2026-11-18')
    expect(normalizeDateString('Date: 21-11-2026')).toBe('2026-11-21')
    expect(normalizeDateString('')).toBeNull()
  })

  it('correctly parses multi-date Gujarati catering orders into discrete individual orders', () => {
    const rawCateringMessage = `Maruti caterers 

Date 18/11/26

1000 nung બોટલ 

Maruti caterers 

20/11/26

બાલાજી પાર્ટી પ્લોટ હરણી રોડ વડોદરા 

4000 નંગ bottle 200ml

Maruti caterers 

Date 21/11/26

Sanje 

4000 hajar nung bottel

PG party plot harni baroda`

    const parsed = parseLocalSalesText(rawCateringMessage, mockClients)
    expect(parsed).toBeDefined()
    expect(parsed.type).toBe('retail_sales')
    expect(parsed.data.sales.length).toBe(3)

    // Order 1: 18/11/26 -> Maruti Caterers, 1000 bottles (rounded up to 21 boxes), default time 11 AM when not defined
    const order1 = parsed.data.sales[0]
    expect(order1.clientName).toContain('Maruti Caterers')
    expect(order1.date).toBe('2026-11-18')
    expect(order1.deliveryTime).toBe('11 AM')
    expect(order1.items[0].qty).toBe(21)
    expect(order1.items[0].originalPieces).toBe(1000)
    expect(order1.items[0].sku).toBe('Anjani 200ml')
    expect(order1.items[0].unit).toBe('Box')

    // Order 2: 20/11/26 -> Balaji Party Plot, Harni Road, Vadodara, 4000 bottles 200ml (4000 / 48 = 83.33 -> rounded up to 84 boxes), default time 11 AM
    const order2 = parsed.data.sales[1]
    expect(order2.clientName).toContain('Maruti Caterers')
    expect(order2.date).toBe('2026-11-20')
    expect(order2.deliveryTime).toBe('11 AM')
    expect(order2.address).toMatch(/Balaji Party Plot.*Harni Road.*Vadodara/i)
    expect(order2.items[0].qty).toBe(84)
    expect(order2.items[0].originalPieces).toBe(4000)
    expect(order2.items[0].sku).toBe('Anjani 200ml')
    expect(order2.items[0].unit).toBe('Box')

    // Order 3: 21/11/26 -> Evening (Sanje -> 4 PM), 4000 hajar nung (vernacular 4000 pcs / 48 = 83.33 -> rounded up to 84 boxes), PG party plot
    const order3 = parsed.data.sales[2]
    expect(order3.clientName).toContain('Maruti Caterers')
    expect(order3.date).toBe('2026-11-21')
    expect(order3.deliveryTime).toBe('4 PM')
    expect(order3.address).toMatch(/PG Party Plot.*Harni.*Baroda/i)
    expect(order3.items[0].qty).toBe(84) // 4000 pieces converted to 84 boxes
    expect(order3.items[0].originalPieces).toBe(4000)
    expect(order3.items[0].sku).toBe('Anjani 200ml')
    expect(order3.items[0].unit).toBe('Box')

    // Consolidation retains individual dates & venue locations
    const enriched = consolidateRetailSales(parsed.data.sales, mockClients)
    expect(enriched.length).toBe(3)
    expect(enriched[0].date).toBe('2026-11-18')
    expect(enriched[0].deliveryTime).toBe('11 AM')
    expect(enriched[1].date).toBe('2026-11-20')
    expect(enriched[1].deliveryTime).toBe('11 AM')
    expect(enriched[2].date).toBe('2026-11-21')
    expect(enriched[2].deliveryTime).toBe('4 PM')
  })

  it('correctly converts pieces (nung / bottle) to boxes using 48 pieces = 1 box rule', () => {
    const note = `Jay Ambe Provision
48 nung 200ml

Rohit Store
96 nung

Maruti Caterers
4800 nung`

    const parsed = parseLocalSalesText(note, mockClients)
    expect(parsed).toBeDefined()
    expect(parsed.data.sales.length).toBe(3)

    // 48 pieces = 1 box
    expect(parsed.data.sales[0].items[0].qty).toBe(1)
    expect(parsed.data.sales[0].items[0].originalPieces).toBe(48)
    expect(parsed.data.sales[0].items[0].unit).toBe('Box')

    // 96 pieces = 2 boxes
    expect(parsed.data.sales[1].items[0].qty).toBe(2)
    expect(parsed.data.sales[1].items[0].originalPieces).toBe(96)
    expect(parsed.data.sales[1].items[0].unit).toBe('Box')

    // 4800 pieces = 100 boxes
    expect(parsed.data.sales[2].items[0].qty).toBe(100)
    expect(parsed.data.sales[2].items[0].originalPieces).toBe(4800)
    expect(parsed.data.sales[2].items[0].unit).toBe('Box')
  })

  it('normalizes delivery times: sanje/evening -> 4 PM, savare -> 9 AM, no time -> 11 AM', () => {
    expect(normalizeDeliveryTime('sanje')).toBe('4 PM')
    expect(normalizeDeliveryTime('Sanje')).toBe('4 PM')
    expect(normalizeDeliveryTime('saanj')).toBe('4 PM')
    expect(normalizeDeliveryTime('સાંજે')).toBe('4 PM')
    expect(normalizeDeliveryTime('Evening')).toBe('4 PM')
    expect(normalizeDeliveryTime('savare')).toBe('9 AM')
    expect(normalizeDeliveryTime('સવારે')).toBe('9 AM')
    expect(normalizeDeliveryTime('bapore')).toBe('1 PM')
    expect(normalizeDeliveryTime('બપોરે')).toBe('1 PM')
    expect(normalizeDeliveryTime('')).toBe('11 AM')
    expect(normalizeDeliveryTime(null)).toBe('11 AM')
    expect(normalizeDeliveryTime(undefined)).toBe('11 AM')
    expect(normalizeDeliveryTime('N/A')).toBe('11 AM')
    expect(normalizeDeliveryTime('2:30 PM')).toBe('2:30 PM')
  })
})
