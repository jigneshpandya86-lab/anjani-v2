import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: {},
}))

import { tryLocalIntentRoute, buildStaffDeliveryReminderMessage } from '../utils/aiIntentRouter'
import { getOrderCardActions, getClientCardActions } from '../utils/cardActionRegistry'

describe('aiIntentRouter', () => {
  it('handles order creation draft intent locally with zero tokens', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Jay Ambe Provision', mobile: '9825012345', rate: 65 }],
    }
    const result = tryLocalIntentRoute('Create order 15 boxes Anjani 200ml for Jay Ambe Provision', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('order_draft')
    expect(result.data.clientName).toBe('Jay Ambe Provision')
    expect(result.data.clientId).toBe('c1')
    expect(result.data.items[0].qty).toBe(15)
    expect(result.data.items[0].sku).toBe('Anjani 200ml')
  })

  it('converts piece quantity (nung / bottle) to boxes in order creation intent using 48 pieces = 1 box rule', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Jay Ambe Provision', mobile: '9825012345', rate: 130 }],
    }
    // 96 nung = 2 boxes
    const result = tryLocalIntentRoute('Order 96 nung for Jay Ambe Provision', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('order_draft')
    expect(result.data.items[0].qty).toBe(2)
    expect(result.data.items[0].originalPieces).toBe(96)
    expect(result.data.totalQty).toBe(2)
    expect(result.data.totalAmount).toBe(260) // 2 boxes * 130
    expect(result.text).toContain('96 pcs = 2 Box')
  })

  it('extracts delivery address/location when dictated in order creation intent', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Jay Ambe Provision', mobile: '9825012345', rate: 65, address: 'Old Padra Road' }],
    }
    const result = tryLocalIntentRoute('Order 20 boxes Anjani 200ml for Jay Ambe Provision at Waghodia road', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('order_draft')
    expect(result.data.address).toBe('Waghodia Road')
    expect(result.data.location).toBe('Waghodia Road')
    expect(result.text).toContain('Waghodia Road')
  })

  it('handles payment received intent locally with zero tokens', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Ramesh Store', mobile: '9825000000' }],
    }
    const result = tryLocalIntentRoute('Received ₹1500 from Ramesh Store via GPay', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('receive_payment')
    expect(result.data.amount).toBe(1500)
    expect(result.data.clientId).toBe('c1')
    expect(result.data.method).toBe('online')
    expect(result.data.accountId).toBe('bank')
  })

  it('handles client creation intent locally with zero tokens', () => {
    const fakeStore = {}
    const result = tryLocalIntentRoute('Add client Shreeji Mart mobile 9825012345 address Karelibaug rate 65', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('create_client')
    expect(result.data.name).toContain('Shreeji Mart')
    expect(result.data.mobile).toBe('9825012345')
    expect(result.data.address).toContain('Karelibaug')
    expect(result.data.rate).toBe(65)
  })

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

  it('extracts client creation in Gujarati or Hindi and creates it strictly in English', () => {
    const fakeStore = {}
    const result = tryLocalIntentRoute(
      'નવો ગ્રાહક બનાવો જય અંબે ડેરી, address: માંજલપુર, mobile: ૯૮૨૫૯૯૭૭૫૦, rate: 65',
      fakeStore,
    )
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('create_client')
    expect(result.data.name).toContain('Jay Ambe Dairy')
    expect(result.data.address).toContain('Manjalpur')
    expect(result.data.mobile).toBe('9825997750')
    expect(result.data.rate).toBe(65)
  })

  it('handles client creation when isClientMode is true without prefix keywords', () => {
    const fakeStore = { isClientMode: true }
    const result = tryLocalIntentRoute('Shiv Dhaba, Manjalpur, 9825098250, rate 65', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('create_client')
    expect(result.data.name).toContain('Shiv Dhaba')
    expect(result.data.address).toContain('Manjalpur')
    expect(result.data.mobile).toBe('9825098250')
    expect(result.data.rate).toBe(65)
  })

  it('ensures client creation with rate and 200ml does not trigger order draft', () => {
    const fakeStore = { isClientMode: true }
    const result = tryLocalIntentRoute('Maruti Kirana, 9825012345, Karelibaug, 200ml rate 65', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('create_client')
    expect(result.type).not.toBe('order_draft')
    expect(result.data.mobile).toBe('9825012345')
  })

  it('handles staff task assignment intent for Nilesh with target date', () => {
    const fakeStore = {
      staffList: [{ id: 'nilesh', name: 'Nilesh', mobile: '7990943652' }],
    }
    const result = tryLocalIntentRoute('Assign task to Nilesh: collect empty jars from Krishna Hotel by tomorrow', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('staff_task_draft')
    expect(result.data.assignedTo).toBe('nilesh')
    expect(result.data.assignedStaffName).toBe('Nilesh')
    expect(result.data.staffPhone).toBe('7990943652')
    expect(result.data.targetLabel).toBe('Tomorrow')
    expect(result.data.text).toContain('collect empty jars from Krishna Hotel')
  })

  it('handles follow-up task creation for Hitesh', () => {
    const fakeStore = {
      staffList: [{ id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '7778077617' }],
    }
    const result = tryLocalIntentRoute('Create follow up task for Hitesh regarding payment collection from Radhe Store', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('staff_task_draft')
    expect(result.data.isFollowUp).toBe(true)
    expect(result.data.assignedTo).toBe('hiteshbhai')
    expect(result.data.assignedStaffName).toBe('Hiteshbhai')
    expect(result.data.text).toContain('payment collection from Radhe Store')
  })

  it('handles staff tasks query intent and filters active jobs', () => {
    const fakeStore = {
      jobs: [
        { id: 'j1', text: 'Deliver 15 boxes to Royal Hotel', assignedTo: 'nilesh', stage: 'new' },
        { id: 'j2', text: 'Vehicle servicing', assignedTo: 'hiteshbhai', stage: 'due' },
        { id: 'j3', text: 'Old done task', assignedTo: 'nilesh', stage: 'complete' },
      ],
    }

    const allResult = tryLocalIntentRoute('show staff tasks', fakeStore)
    expect(allResult).not.toBeNull()
    expect(allResult.type).toBe('staff_tasks_list')
    expect(allResult.data.tasks).toHaveLength(2)

    const nileshResult = tryLocalIntentRoute('nilesh na task', fakeStore)
    expect(nileshResult).not.toBeNull()
    expect(nileshResult.type).toBe('staff_tasks_list')
    expect(nileshResult.data.tasks).toHaveLength(1)
    expect(nileshResult.data.tasks[0].id).toBe('j1')

    // Handle common typos like 'staff taks'
    const typoResult = tryLocalIntentRoute('staff taks', fakeStore)
    expect(typoResult).not.toBeNull()
    expect(typoResult.type).toBe('staff_tasks_list')
    expect(typoResult.data.tasks).toHaveLength(2)

    // Handle natural questions
    const questionResult = tryLocalIntentRoute('what are staff tasks today', fakeStore)
    expect(questionResult).not.toBeNull()
    expect(questionResult.type).toBe('staff_tasks_list')
  })

  it('handles task assignment even with common typos like taks', () => {
    const fakeStore = { staffList: [{ id: 'nilesh', name: 'Nilesh', mobile: '7990943652' }] }
    const res = tryLocalIntentRoute('assign taks to nilesh collect empty jars', fakeStore)
    expect(res).not.toBeNull()
    expect(res.type).toBe('staff_task_draft')
    expect(res.data.assignedTo).toBe('nilesh')
    expect(res.data.text).toContain('collect empty jars')
  })

  it('handles price and rate update commands locally with zero tokens', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Maruti Caterers', mobile: '9825012345', rate: 130 }],
    }

    // 1. "update price to 140"
    const res1 = tryLocalIntentRoute('update price to 140', fakeStore)
    expect(res1).not.toBeNull()
    expect(res1.handled).toBe(true)
    expect(res1.type).toBe('update_price')
    expect(res1.data.rate).toBe(140)

    // 2. "change rate to 135"
    const res2 = tryLocalIntentRoute('change rate to 135', fakeStore)
    expect(res2).not.toBeNull()
    expect(res2.handled).toBe(true)
    expect(res2.type).toBe('update_price')
    expect(res2.data.rate).toBe(135)

    // 3. Gujarati vernacular: "bhav 140 karo"
    const res3 = tryLocalIntentRoute('bhav 140 karo', fakeStore)
    expect(res3).not.toBeNull()
    expect(res3.handled).toBe(true)
    expect(res3.type).toBe('update_price')
    expect(res3.data.rate).toBe(140)

    // 4. "rate 140"
    const res4 = tryLocalIntentRoute('rate 140', fakeStore)
    expect(res4).not.toBeNull()
    expect(res4.handled).toBe(true)
    expect(res4.type).toBe('update_price')
    expect(res4.data.rate).toBe(140)

    // 5. Client specified: "update price for Maruti Caterers to 140"
    const res5 = tryLocalIntentRoute('update price for Maruti Caterers to 140', fakeStore)
    expect(res5).not.toBeNull()
    expect(res5.handled).toBe(true)
    expect(res5.type).toBe('update_price')
    expect(res5.data.rate).toBe(140)
    expect(res5.data.clientName).toBe('Maruti Caterers')

    // 6. Generic "update price" without amount -> prompts with quick chips
    const res6 = tryLocalIntentRoute('update price', fakeStore)
    expect(res6).not.toBeNull()
    expect(res6.handled).toBe(true)
    expect(res6.type).toBe('update_price')
    expect(res6.data.rate).toBeNull()
    expect(res6.chips).toBeDefined()
    expect(res6.chips.length).toBeGreaterThan(0)
  })

  it('handles order quantity update intent locally with zero tokens and pieces ceiling conversion', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Maruti Caterers', mobile: '9825012345', rate: 130 }],
    }

    // 1. "update qty to 20"
    const res1 = tryLocalIntentRoute('update qty to 20', fakeStore)
    expect(res1).not.toBeNull()
    expect(res1.handled).toBe(true)
    expect(res1.type).toBe('update_qty')
    expect(res1.data.qty).toBe(20)

    // 2. "20 box karo"
    const res2 = tryLocalIntentRoute('20 box karo', fakeStore)
    expect(res2).not.toBeNull()
    expect(res2.handled).toBe(true)
    expect(res2.type).toBe('update_qty')
    expect(res2.data.qty).toBe(20)

    // 3. "make it 30 boxes"
    const res3 = tryLocalIntentRoute('make it 30 boxes', fakeStore)
    expect(res3).not.toBeNull()
    expect(res3.handled).toBe(true)
    expect(res3.type).toBe('update_qty')
    expect(res3.data.qty).toBe(30)

    // 4. "1000 pieces karo" -> ceil(1000 / 48) = 21 boxes
    const res4 = tryLocalIntentRoute('1000 pieces karo', fakeStore)
    expect(res4).not.toBeNull()
    expect(res4.handled).toBe(true)
    expect(res4.type).toBe('update_qty')
    expect(res4.data.qty).toBe(21)
    expect(res4.data.isPieces).toBe(true)

    // 5. Client specified: "update qty for Maruti Caterers to 25"
    const res5 = tryLocalIntentRoute('update qty for Maruti Caterers to 25', fakeStore)
    expect(res5).not.toBeNull()
    expect(res5.handled).toBe(true)
    expect(res5.type).toBe('update_qty')
    expect(res5.data.qty).toBe(25)
    expect(res5.data.clientName).toBe('Maruti Caterers')
  })

  it('removes verbose instruction text from drafted catering/retail orders in AI chat', () => {
    const fakeStore = {
      clients: [{ id: 'c1', name: 'Maruti Caterers', mobile: '9825012345', rate: 130 }],
    }
    const salesNote = '18/11/26\nsanje\nMaruti Caterers\n4800 nung 200ml'
    const result = tryLocalIntentRoute(salesNote, fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('retail_sales')
    expect(result.text).not.toContain('Review the order list below')
    expect(result.text).not.toContain('You can adjust quantities, change payment modes, or remove items before confirming:')
    expect(result.text).toBe('📋 **Parsed 1 Catering/Retail Order**')
  })

  it('handles feedback check and review intent locally with zero tokens', () => {
    const emptyStore = { aiFeedbacks: [] }
    const resEmpty = tryLocalIntentRoute('check for new feedback', emptyStore)
    expect(resEmpty).not.toBeNull()
    expect(resEmpty.handled).toBe(true)
    expect(resEmpty.type).toBe('feedback_status')
    expect(resEmpty.text).toContain('0 pending feedback requests')

    const resAnyPending = tryLocalIntentRoute('any feedback pending for processing?', emptyStore)
    expect(resAnyPending).not.toBeNull()
    expect(resAnyPending.handled).toBe(true)
    expect(resAnyPending.type).toBe('feedback_status')
    expect(resAnyPending.text).toContain('0 pending feedback requests')

    const pendingStore = {
      aiFeedbacks: [
        { id: 'f1', message: 'Improve order quantity update', status: 'pending_review' },
      ],
    }
    const resPending = tryLocalIntentRoute('check for new feedback', pendingStore)
    expect(resPending).not.toBeNull()
    expect(resPending.handled).toBe(true)
    expect(resPending.type).toBe('feedback_status')
    expect(resPending.text).toContain('Found 1 Pending Feedback Request')
    expect(resPending.text).toContain('Improve order quantity update')

    const resCheck = tryLocalIntentRoute('check feedback', pendingStore)
    expect(resCheck).not.toBeNull()
    expect(resCheck.handled).toBe(true)
    expect(resCheck.text).toContain('Found 1 Pending Feedback Request')
  })

  it('recognizes location update intent with Google Maps link and does not draft new order', () => {
    const fakeStore = {
      clients: [{ id: 'c-maruti', name: 'Maruti caterers' }],
      orders: [
        {
          id: 'ord-maruti-1',
          clientId: 'c-maruti',
          clientName: 'Maruti caterers',
          status: 'Confirmed',
          date: 'tomorrow',
        },
      ],
    }
    const query =
      'https://maps.app.goo.gl/DGYmDSZJb7YwMu1D9\n\nThis is location for tomorrow\'s maruti order'
    const result = tryLocalIntentRoute(query, fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('location_update')
    expect(result.text).toContain('Location Detected for Maruti caterers')
    expect(result.text).toContain('No duplicate order was created')
    expect(result.data.mapLink).toBe('https://maps.app.goo.gl/DGYmDSZJb7YwMu1D9')
    expect(result.data.order?.id).toBe('ord-maruti-1')
  })

  it('routes "Remind Nilesh for it" to staff_order_reminder when previous message was orders_list', () => {
    const fakeStore = {
      recentMessages: [
        {
          id: 'msg-1',
          sender: 'assistant',
          type: 'orders_list',
          data: {
            orders: [
              {
                id: 'ord-1',
                clientName: 'Patel Enterprise',
                qty: 10,
                sku: 'Anjani 200ml',
                address: 'Near Bus Stand',
                time: '4 PM',
              },
            ],
          },
        },
      ],
    }

    const result = tryLocalIntentRoute('Remind Nilesh for it', fakeStore)
    expect(result).not.toBeNull()
    expect(result.handled).toBe(true)
    expect(result.type).toBe('staff_order_reminder')
    expect(result.data.assignedStaffName).toBe('Nilesh')
    expect(result.data.staffPhone).toBe('7990943652')
    expect(result.data.orders.length).toBe(1)
    expect(result.data.message).toContain('Nileshbhai')
    expect(result.data.message).toContain('Patel Enterprise nu 10 box Anjani 200ml delivery baki chhe')
    expect(result.data.message).toContain('Near Bus Stand')
    expect(result.data.message).toContain('Dispatch kari dejo')
  })

  it('routes variations like "Remind driver", "Remind Nilesh for this", and "Nilesh ne message karo" to staff_order_reminder', () => {
    const fakeStore = {
      recentMessages: [
        {
          id: 'msg-1',
          sender: 'assistant',
          type: 'orders_list',
          data: {
            orders: [
              {
                id: 'ord-1',
                clientName: 'Shreeji Mart',
                qty: 5,
                sku: 'Bailey 500ml',
                address: 'Station Road',
              },
            ],
          },
        },
      ],
    }

    const resDriver = tryLocalIntentRoute('Remind driver for it', fakeStore)
    expect(resDriver.type).toBe('staff_order_reminder')
    expect(resDriver.data.assignedStaffName).toBe('Nilesh')

    const resThis = tryLocalIntentRoute('Remind Nilesh for this', fakeStore)
    expect(resThis.type).toBe('staff_order_reminder')

    const resMsg = tryLocalIntentRoute('Nilesh ne message karo aa order mate', fakeStore)
    expect(resMsg.type).toBe('staff_order_reminder')
  })

  it('routes to Hiteshbhai when "Remind Hiteshbhai for it" is requested', () => {
    const fakeStore = {
      recentMessages: [
        {
          id: 'msg-1',
          sender: 'assistant',
          type: 'orders_list',
          data: {
            orders: [
              {
                id: 'ord-1',
                clientName: 'Om Traders',
                qty: 12,
                sku: 'Anjani 200ml',
              },
            ],
          },
        },
      ],
    }

    const result = tryLocalIntentRoute('Remind Hiteshbhai for it', fakeStore)
    expect(result.type).toBe('staff_order_reminder')
    expect(result.data.assignedStaffName).toBe('Hiteshbhai')
    expect(result.data.staffPhone).toBe('7778077617')
    expect(result.data.message).toContain('Hiteshbhai')
  })

  it('formats multiple orders correctly in buildStaffDeliveryReminderMessage', () => {
    const orders = [
      { clientName: 'Patel Enterprise', qty: 10, sku: 'Anjani 200ml', address: 'Old Padra' },
      { clientName: 'Shreeji Mart', qty: 5, sku: 'Bailey 500ml', address: 'Gotri' },
    ]

    const msg = buildStaffDeliveryReminderMessage({ staffName: 'Nilesh', orders })
    expect(msg).toContain('Nileshbhai, aajna 2 orders delivery baki chhe:')
    expect(msg).toContain('1) Patel Enterprise: 10b Anjani 200ml (Old Padra)')
    expect(msg).toContain('2) Shreeji Mart: 5b Bailey 500ml (Gotri)')
    expect(msg).toContain('Dispatch kari dejo. - Anjani Water')
  })

  it('safely distinguishes explicit task assignment from order delivery reminders', () => {
    const fakeStore = {}
    const resTask = tryLocalIntentRoute('Assign task to Nilesh: Clean delivery van', fakeStore)
    expect(resTask.type).toBe('staff_task_draft')
    expect(resTask.data.text).toContain('Clean delivery van')

    // Prevention of "it" tasks
    const resPronoun = tryLocalIntentRoute('create task for nilesh: it', fakeStore)
    expect(resPronoun.type).toBe('staff_task_draft')
    expect(resPronoun.data.text).not.toBe('it')
    expect(resPronoun.data.text).toBe('Delivery & customer service task')
  })

  it('generates strictly 2-3 word option labels for Order Card and Client Card', () => {
    const dummyOrder = { id: 'ord-1', clientName: 'Maruti Caterers', qty: 20, sku: 'Anjani 200ml' }
    const orderActions = getOrderCardActions({ order: dummyOrder })
    expect(orderActions.length).toBeGreaterThanOrEqual(4)

    orderActions.forEach((act) => {
      // Strip emojis and check word count
      const cleanLabel = act.label.replace(/[^\w\s]/gi, '').trim()
      const words = cleanLabel.split(/\s+/).filter(Boolean)
      expect(words.length).toBeGreaterThanOrEqual(1)
      expect(words.length).toBeLessThanOrEqual(3)
    })

    const dummyClient = { id: 'c1', name: 'Maruti Caterers', mobile: '9825012345' }
    const clientActions = getClientCardActions({ client: dummyClient })
    clientActions.forEach((act) => {
      const cleanLabel = act.label.replace(/[^\w\s]/gi, '').trim()
      const words = cleanLabel.split(/\s+/).filter(Boolean)
      expect(words.length).toBeGreaterThanOrEqual(1)
      expect(words.length).toBeLessThanOrEqual(3)
    })
  })

  it('routes single digit input (1, 2, 3) to card_action_select when activeCardActions is provided', () => {
    const dummyActions = [
      { id: 'remind', number: 1, label: '📲 Remind Nilesh' },
      { id: 'whatsapp', number: 2, label: '💬 WhatsApp Nilesh' },
    ]

    const fakeStore = { activeCardActions: dummyActions }
    const res1 = tryLocalIntentRoute('1', fakeStore)
    expect(res1).not.toBeNull()
    expect(res1.handled).toBe(true)
    expect(res1.type).toBe('card_action_select')
    expect(res1.data.number).toBe(1)
    expect(res1.data.action.id).toBe('remind')

    const res2 = tryLocalIntentRoute('2', fakeStore)
    expect(res2.handled).toBe(true)
    expect(res2.data.number).toBe(2)
    expect(res2.data.action.id).toBe('whatsapp')
  })

  it('multi-turn context: carries client and order from previous orders_list to "update price" and "update qty"', () => {
    const fakeOrdersListMsg = {
      type: 'orders_list',
      data: {
        orders: [
          {
            id: 'ord-nilesh-1',
            clientName: 'Nilesh Bhai (Bhaji Pav)',
            clientId: 'c-nilesh',
            qty: 10,
            sku: 'Anjani 200ml',
            rate: 120,
            totalAmount: 1200,
          },
        ],
      },
    }

    const fakeStore = {
      clients: [
        { id: 'c-nilesh', name: 'Nilesh Bhai (Bhaji Pav)', displayName: 'Nilesh Bhai (Bhaji Pav)', rate: 120 },
      ],
      recentMessages: [fakeOrdersListMsg],
    }

    // 1. User says "update price" without mentioning customer or rate
    const resPricePrompt = tryLocalIntentRoute('update price', fakeStore)
    expect(resPricePrompt).not.toBeNull()
    expect(resPricePrompt.handled).toBe(true)
    expect(resPricePrompt.type).toBe('update_price')
    expect(resPricePrompt.data.clientName).toBe('Nilesh Bhai (Bhaji Pav)')
    expect(resPricePrompt.data.order.id).toBe('ord-nilesh-1')
    expect(resPricePrompt.text).toContain('Nilesh Bhai (Bhaji Pav)')
    expect(resPricePrompt.chips).toBeDefined()

    // 2. User says "update price to 140"
    const resPriceUpdate = tryLocalIntentRoute('update price to 140', fakeStore)
    expect(resPriceUpdate.handled).toBe(true)
    expect(resPriceUpdate.type).toBe('update_price')
    expect(resPriceUpdate.data.rate).toBe(140)
    expect(resPriceUpdate.data.clientName).toBe('Nilesh Bhai (Bhaji Pav)')
    expect(resPriceUpdate.data.order.id).toBe('ord-nilesh-1')

    // 3. Follow-up: User enters single number "140" when previous was price prompt
    const fakePricePromptMsg = {
      sender: 'assistant',
      type: 'update_price',
      text: '💰 **Update Price**: Set price for **Nilesh Bhai (Bhaji Pav)**:',
      chips: [{ label: '₹140', rate: 140, action: 'apply_rate' }],
      data: { order: fakeOrdersListMsg.data.orders[0], clientName: 'Nilesh Bhai (Bhaji Pav)' },
    }
    const storeWithPrompt = {
      ...fakeStore,
      recentMessages: [fakeOrdersListMsg, fakePricePromptMsg],
    }
    const resNumberPrice = tryLocalIntentRoute('140', storeWithPrompt)
    expect(resNumberPrice.handled).toBe(true)
    expect(resNumberPrice.type).toBe('update_price')
    expect(resNumberPrice.data.rate).toBe(140)
    expect(resNumberPrice.data.clientName).toBe('Nilesh Bhai (Bhaji Pav)')

    // 4. User says "update qty"
    const resQtyPrompt = tryLocalIntentRoute('update qty', fakeStore)
    expect(resQtyPrompt.handled).toBe(true)
    expect(resQtyPrompt.type).toBe('update_qty')
    expect(resQtyPrompt.data.clientName).toBe('Nilesh Bhai (Bhaji Pav)')
    expect(resQtyPrompt.data.order.id).toBe('ord-nilesh-1')

    // 5. User says "make it 30 boxes" or "30 box karo"
    const resQtyUpdate = tryLocalIntentRoute('30 box karo', fakeStore)
    expect(resQtyUpdate.handled).toBe(true)
    expect(resQtyUpdate.type).toBe('update_qty')
    expect(resQtyUpdate.data.qty).toBe(30)
    expect(resQtyUpdate.data.clientName).toBe('Nilesh Bhai (Bhaji Pav)')
    expect(resQtyUpdate.data.order.id).toBe('ord-nilesh-1')
  })

  it('orders_list has clean empty text so only compact order cards render without boilerplate sentences', () => {
    const fakeStore = {
      orders: [
        { id: '1', clientName: 'Nilesh Bhai', status: 'Pending', date: new Date().toISOString().split('T')[0] },
      ],
    }
    const result = tryLocalIntentRoute('orders', fakeStore)
    expect(result.handled).toBe(true)
    expect(result.type).toBe('orders_list')
    expect(result.text).toBe('')
  })

  it('routes "Order for tomorrow?" to orders_list instead of drafting an order (Feedback QBsZq5EAdkaCNzuPI4EB)', () => {
    const tm = new Date()
    tm.setDate(tm.getDate() + 1)
    const tmYyyy = tm.getFullYear()
    const tmMm = String(tm.getMonth() + 1).padStart(2, '0')
    const tmDd = String(tm.getDate()).padStart(2, '0')
    const tomorrowStr = `${tmYyyy}-${tmMm}-${tmDd}`

    const fakeStore = {
      orders: [
        { id: 'ord-tm', clientName: 'Maruti Caterers', status: 'Pending', date: tomorrowStr, deliveryDate: tomorrowStr },
      ],
    }

    const res = tryLocalIntentRoute('Order for tomorrow?', fakeStore)
    expect(res).not.toBeNull()
    expect(res.handled).toBe(true)
    expect(res.type).toBe('orders_list')
    expect(res.data.orders.length).toBe(1)
    expect(res.data.orders[0].id).toBe('ord-tm')
  })

  it('strictly filters "Today\'s orders?" and never leaks tomorrow orders (Feedback gbkpx34bt1pTIxDQqTll)', () => {
    const tm = new Date()
    tm.setDate(tm.getDate() + 1)
    const tmYyyy = tm.getFullYear()
    const tmMm = String(tm.getMonth() + 1).padStart(2, '0')
    const tmDd = String(tm.getDate()).padStart(2, '0')
    const tomorrowStr = `${tmYyyy}-${tmMm}-${tmDd}`

    const fakeStore = {
      orders: [
        { id: 'ord-tm', clientName: 'Maruti Caterers', status: 'Pending', date: tomorrowStr, deliveryDate: tomorrowStr },
      ],
    }

    const res = tryLocalIntentRoute("Today's orders?", fakeStore)
    expect(res).not.toBeNull()
    expect(res.handled).toBe(true)
    expect(res.type).toBe('orders_list')
    expect(res.data.orders.length).toBe(0)
    expect(res.text).toContain('No delivery orders scheduled for today')
  })

  it('recognizes client display names and handles "make <client> regular client" command', () => {
    const fakeStore = {
      clients: [
        {
          id: 'c-maa',
          name: 'Nirmalbhai',
          displayName: 'Maa Excellence (Nirmalbhai)',
          isRegular: false,
          rate: 130,
        },
      ],
    }

    // 1. "make Maa Excellence a regular client"
    const res1 = tryLocalIntentRoute('make Maa Excellence a regular client', fakeStore)
    expect(res1).not.toBeNull()
    expect(res1.handled).toBe(true)
    expect(res1.type).toBe('client_regular_status')
    expect(res1.data.clientId).toBe('c-maa')
    expect(res1.data.isRegular).toBe(true)
    expect(res1.text).toContain('Maa Excellence (Nirmalbhai)')

    // 2. Gujarati vernacular: "Maa Excellence ne regular client banao"
    const res2 = tryLocalIntentRoute('Maa Excellence ne regular client banao', fakeStore)
    expect(res2).not.toBeNull()
    expect(res2.handled).toBe(true)
    expect(res2.type).toBe('client_regular_status')
    expect(res2.data.clientId).toBe('c-maa')
    expect(res2.data.isRegular).toBe(true)

    // 3. Remove regular status: "remove Maa Excellence from regular"
    const res3 = tryLocalIntentRoute('remove Maa Excellence from regular', fakeStore)
    expect(res3).not.toBeNull()
    expect(res3.handled).toBe(true)
    expect(res3.type).toBe('client_regular_status')
    expect(res3.data.clientId).toBe('c-maa')
    expect(res3.data.isRegular).toBe(false)

    // 4. Order command using business alias: "order 20 boxes for Maa Excellence"
    const resOrder = tryLocalIntentRoute('order 20 boxes for Maa Excellence', fakeStore)
    expect(resOrder).not.toBeNull()
    expect(resOrder.handled).toBe(true)
    expect(resOrder.data.clientId).toBe('c-maa')
    expect(resOrder.data.clientName).toBe('Maa Excellence (Nirmalbhai)')
  })

  it('handles user prompt for Kamleshbhai Panchal new order with delivery date, time, and venue', () => {
    const tm = new Date()
    tm.setDate(tm.getDate() + 1)
    const tomorrowStr = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`

    const fakeStore = {
      clients: [
        { id: 'c-kamlesh', name: 'Kamleshbhai Panchal', displayName: 'Kamleshbhai Panchal', rate: 140 },
      ],
      orders: [],
      recentMessages: [],
    }

    // 1. Full prompt from user with "new order"
    const res = tryLocalIntentRoute(
      'Kamleshbhai Panchal new order 30 box tomorrow 11 AM at jashan kitchen n lawns Rate 130 Rs',
      fakeStore
    )
    expect(res).not.toBeNull()
    expect(res.handled).toBe(true)
    expect(res.type).toBe('order_draft')
    expect(res.data.clientId).toBe('c-kamlesh')
    expect(res.data.clientName).toBe('Kamleshbhai Panchal')
    expect(res.data.totalQty).toBe(30)
    expect(res.data.items[0].rate).toBe(130)
    expect(res.data.totalAmount).toBe(3900)
    expect(res.data.date).toBe(tomorrowStr)
    expect(res.data.deliveryDate).toBe(tomorrowStr)
    expect(res.data.time).toBe('11 AM')
    expect(res.data.deliveryTime).toBe('11 AM')
    expect(res.data.address).toBe('Jashan Kitchen N Lawns')
    expect(res.data.location).toBe('Jashan Kitchen N Lawns')
    expect(res.text).toContain('Tomorrow at 11 AM')
    expect(res.text).toContain('Jashan Kitchen N Lawns')
    expect(res.text).toContain('₹3,900')

    // 2. Client-first prompt without the word "new"
    const res2 = tryLocalIntentRoute(
      'Kamleshbhai Panchal order 30 box tomorrow 11 AM at jashan kitchen n lawns Rate 130 Rs',
      fakeStore
    )
    expect(res2).not.toBeNull()
    expect(res2.handled).toBe(true)
    expect(res2.type).toBe('order_draft')
    expect(res2.data.clientId).toBe('c-kamlesh')
    expect(res2.data.totalQty).toBe(30)
    expect(res2.data.deliveryDate).toBe(tomorrowStr)
    expect(res2.data.deliveryTime).toBe('11 AM')

    // 3. Vernacular evening time "sanje" -> "4 PM"
    const res3 = tryLocalIntentRoute(
      'order 20 box kal sanje for Kamleshbhai Panchal at jashan lawns Rate 130 Rs',
      fakeStore
    )
    expect(res3.data.deliveryTime).toBe('4 PM')
    expect(res3.data.deliveryDate).toBe(tomorrowStr)
    expect(res3.data.address).toBe('Jashan Lawns')
  })
})

