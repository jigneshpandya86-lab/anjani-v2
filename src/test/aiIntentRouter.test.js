import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: {},
}))

import { tryLocalIntentRoute } from '../utils/aiIntentRouter'

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
  })
})

