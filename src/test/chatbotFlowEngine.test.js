import { describe, it, expect, vi } from 'vitest'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: {},
}))

import {
  getMainMenuMessage,
  startChatbotFlow,
  advanceChatbotFlow,
  executeFlowSave,
  getLocalDateStr,
  getLocalTimeStr,
  getMostUsedClients,
  getMostUsedPaymentClients,
  getPopularRatesForSku,
  FLOW_TYPES,
  MAIN_MENU_CHIPS,
} from '../utils/chatbotFlowEngine'

describe('WhatsApp-Style Chatbot Flow Engine', () => {
  const mockContext = {
    clients: [
      { id: 'client_1', name: 'Royal Hotel', balance: 3500, address: 'Ajwa Road, Vadodara' },
      { id: 'client_2', name: 'Shreenathji Snacks', balance: 1200, address: 'Waghodia Road' },
    ],
    orders: [
      { clientId: 'client_1', items: [{ sku: '200ml Box (48 pcs)', rate: 115 }] },
    ],
    staffList: [
      { id: 'nilesh', name: 'Nilesh', advanceBalance: 2500 },
      { id: 'hiteshbhai', name: 'Hiteshbhai', advanceBalance: 1000 },
    ],
    accountsSummary: {
      balances: {
        counter: 12500,
        bank: 45000,
        nilesh: 4850,
        hiteshbhai: 3200,
      },
    },
  }

  it('provides the main menu message with all 5 flows and quick checks', () => {
    const menu = getMainMenuMessage()
    expect(menu.text).toContain('Anjani WhatsApp-Style Assistant')
    expect(menu.chips).toHaveLength(MAIN_MENU_CHIPS.length)
    expect(menu.chips.some((c) => c.flow === FLOW_TYPES.EXPENSE)).toBe(true)
    expect(menu.chips.some((c) => c.flow === FLOW_TYPES.ORDER)).toBe(true)
    expect(menu.chips.some((c) => c.flow === FLOW_TYPES.PAYMENT)).toBe(true)
    expect(menu.chips.some((c) => c.flow === FLOW_TYPES.CASH_HANDOVER)).toBe(true)
    expect(menu.chips.some((c) => c.flow === FLOW_TYPES.STAFF_ADVANCE)).toBe(true)
  })

  describe('1. Expense Flow', () => {
    it('guides step-by-step through amount, category, account, note, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.EXPENSE, mockContext)
      expect(s1.step).toBe('amount')
      expect(s1.chips.some((c) => c.value === 500)).toBe(true)

      // Step 2: Amount selected (500)
      const s2 = advanceChatbotFlow(s1, { value: 500 }, mockContext)
      expect(s2.step).toBe('category')
      expect(s2.data.amount).toBe(500)
      expect(s2.chips.some((c) => c.value === 'Fuel / Transport')).toBe(true)

      // Step 3: Category selected
      const s3 = advanceChatbotFlow(s2, { value: 'Fuel / Transport' }, mockContext)
      expect(s3.step).toBe('account')
      expect(s3.data.category).toBe('Fuel / Transport')
      expect(s3.chips.some((c) => c.value === 'counter')).toBe(true)

      // Step 4: Account selected (counter)
      const s4 = advanceChatbotFlow(s3, { value: 'counter', accountName: 'Counter Cash' }, mockContext)
      expect(s4.step).toBe('note')
      expect(s4.data.accountId).toBe('counter')

      // Step 5: Note added
      const s5 = advanceChatbotFlow(s4, 'Delivery van diesel', mockContext)
      expect(s5.step).toBe('confirm')
      expect(s5.isConfirmation).toBe(true)
      expect(s5.data.amount).toBe(500)
      expect(s5.data.category).toBe('Fuel / Transport')
      expect(s5.data.note).toBe('Delivery van diesel')

      // Execution Save
      const mockAddExpense = vi.fn().mockResolvedValue({ id: 'exp_1' })
      const saveRes = await executeFlowSave(FLOW_TYPES.EXPENSE, s5.data, {
        addExpense: mockAddExpense,
      })

      expect(saveRes.success).toBe(true)
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          category: 'Fuel / Transport',
          accountId: 'counter',
          note: 'Delivery van diesel',
        })
      )
    })
  })

  describe('2. Order Flow', () => {
    it('guides step-by-step through client, sku, qty, rate, address, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.ORDER, mockContext)
      expect(s1.step).toBe('client')
      expect(s1.chips.some((c) => c.clientName === 'Royal Hotel')).toBe(true)

      // Step 2: Client selected
      const s2 = advanceChatbotFlow(s1, { value: 'client_1', clientName: 'Royal Hotel' }, mockContext)
      expect(s2.step).toBe('sku')
      expect(s2.data.clientName).toBe('Royal Hotel')

      // Step 3: SKU selected
      const s3 = advanceChatbotFlow(s2, { value: '200ml Box (48 pcs)' }, mockContext)
      expect(s3.step).toBe('qty')
      expect(s3.data.sku).toBe('200ml Box (48 pcs)')

      // Step 4: Qty selected (20)
      const s4 = advanceChatbotFlow(s3, { value: 20 }, mockContext)
      expect(s4.step).toBe('rate')
      expect(s4.data.qty).toBe(20)
      // Popular price chips generated for SKU
      expect(s4.chips.some((c) => c.value === 115)).toBe(true)

      // Step 5: Rate selected (115)
      const s5 = advanceChatbotFlow(s4, { value: 115 }, mockContext)
      expect(s5.step).toBe('address')
      expect(s5.data.rate).toBe(115)

      // Step 6: Address confirmed
      const s6 = advanceChatbotFlow(s5, 'Ajwa Road, Vadodara', mockContext)
      expect(s6.step).toBe('confirm')
      expect(s6.isConfirmation).toBe(true)
      expect(s6.data.totalAmount).toBe(2300) // 20 * 115
      expect(s6.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(s6.data.time).toMatch(/^\d{2}:\d{2}$/)

      // Save execution
      const mockAddOrder = vi.fn().mockResolvedValue({ id: 'ord_1' })
      const saveRes = await executeFlowSave(FLOW_TYPES.ORDER, s6.data, {
        addOrder: mockAddOrder,
      })

      expect(saveRes.success).toBe(true)
      expect(mockAddOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'Royal Hotel',
          totalQty: 20,
          totalAmount: 2300,
          address: 'Ajwa Road, Vadodara',
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          time: expect.stringMatching(/^\d{2}:\d{2}$/),
        })
      )
    })
  })

  describe('3. Payment Flow', () => {
    it('guides through client, amount with dues suggestions, payment mode, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.PAYMENT, mockContext)
      expect(s1.step).toBe('client')

      // Step 2: Client selected with 3500 dues
      const s2 = advanceChatbotFlow(s1, { value: 'client_1', clientName: 'Royal Hotel', dues: 3500 }, mockContext)
      expect(s2.step).toBe('amount')
      expect(s2.chips.some((c) => c.value === 3500)).toBe(true)

      // Step 3: Amount selected (2000)
      const s3 = advanceChatbotFlow(s2, { value: 2000 }, mockContext)
      expect(s3.step).toBe('method')
      expect(s3.data.amount).toBe(2000)

      // Step 4: Method selected (upi)
      const s4 = advanceChatbotFlow(s3, { value: 'upi', accountId: 'bank' }, mockContext)
      expect(s4.step).toBe('account')
      expect(s4.data.method).toBe('upi')

      // Step 5: Account selected (bank)
      const s5 = advanceChatbotFlow(s4, { value: 'bank', accountName: 'Bank Account' }, mockContext)
      expect(s5.step).toBe('note')

      // Step 6: Note added
      const s6 = advanceChatbotFlow(s5, 'Google Pay UPI', mockContext)
      expect(s6.step).toBe('confirm')
      expect(s6.data.remainingDues).toBe(1500) // 3500 - 2000

      // Save execution
      const mockAddPayment = vi.fn().mockResolvedValue({ id: 'pay_1' })
      const saveRes = await executeFlowSave(FLOW_TYPES.PAYMENT, s6.data, {
        addPayment: mockAddPayment,
      })

      expect(saveRes.success).toBe(true)
      expect(mockAddPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'Royal Hotel',
          amount: 2000,
          method: 'upi',
          accountId: 'bank',
        })
      )
    })
  })

  describe('4. Cash Handover Flow', () => {
    it('guides through source account with current balance, amount, destination, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.CASH_HANDOVER, mockContext)
      expect(s1.step).toBe('fromAccount')

      // Step 2: From Nilesh (holding 4850)
      const s2 = advanceChatbotFlow(s1, { value: 'nilesh', accountName: 'Nilesh Route Cash', currentBalance: 4850 }, mockContext)
      expect(s2.step).toBe('amount')
      expect(s2.chips.some((c) => c.value === 4850)).toBe(true)

      // Step 3: Amount (4000)
      const s3 = advanceChatbotFlow(s2, { value: 4000 }, mockContext)
      expect(s3.step).toBe('toAccount')
      expect(s3.data.amount).toBe(4000)

      // Step 4: To Account (counter)
      const s4 = advanceChatbotFlow(s3, { value: 'counter', toAccountName: 'Counter Cash Drawer' }, mockContext)
      expect(s4.step).toBe('note')

      // Step 5: Note
      const s5 = advanceChatbotFlow(s4, 'Evening route handover', mockContext)
      expect(s5.step).toBe('confirm')

      // Save execution
      const mockRecordAccountTransfer = vi.fn().mockResolvedValue({ id: 'tx_1' })
      const saveRes = await executeFlowSave(FLOW_TYPES.CASH_HANDOVER, s5.data, {
        recordAccountTransfer: mockRecordAccountTransfer,
      })

      expect(saveRes.success).toBe(true)
      expect(mockRecordAccountTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'nilesh',
          toAccountId: 'counter',
          amount: 4000,
          notes: 'Evening route handover',
        })
      )
    })
  })

  describe('5. Staff Advance Flow', () => {
    it('guides through staff member, amount, payout account, note, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.STAFF_ADVANCE, mockContext)
      expect(s1.step).toBe('staff')
      expect(s1.chips.some((c) => c.staffName === 'Nilesh')).toBe(true)

      // Step 2: Staff selected
      const s2 = advanceChatbotFlow(s1, { value: 'nilesh', staffName: 'Nilesh', currentAdvance: 2500 }, mockContext)
      expect(s2.step).toBe('amount')

      // Step 3: Amount (1000)
      const s3 = advanceChatbotFlow(s2, { value: 1000 }, mockContext)
      expect(s3.step).toBe('account')

      // Step 4: Account (counter)
      const s4 = advanceChatbotFlow(s3, { value: 'counter', accountName: 'Counter Cash' }, mockContext)
      expect(s4.step).toBe('note')

      // Step 5: Note
      const s5 = advanceChatbotFlow(s4, 'Diwali shopping advance', mockContext)
      expect(s5.step).toBe('confirm')
      expect(s5.data.newAdvanceTotal).toBe(3500) // 2500 + 1000

      // Save execution
      const mockRecordStaffAdvance = vi.fn().mockResolvedValue({ id: 'adv_1' })
      const saveRes = await executeFlowSave(FLOW_TYPES.STAFF_ADVANCE, s5.data, {
        recordStaffAdvance: mockRecordStaffAdvance,
      })

      expect(saveRes.success).toBe(true)
      expect(mockRecordStaffAdvance).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'nilesh',
          amount: 1000,
          sourceAccountId: 'counter',
          note: 'Diwali shopping advance',
        })
      )
    })
  })

  describe('Cancellation', () => {
    it('cancels active flow gracefully when user taps Cancel or types cancel', () => {
      const s1 = startChatbotFlow(FLOW_TYPES.EXPENSE, mockContext)
      const cancelRes = advanceChatbotFlow(s1, 'cancel', mockContext)

      expect(cancelRes.cancelled).toBe(true)
      expect(cancelRes.text).toContain('cancelled')
      expect(cancelRes.chips).toHaveLength(MAIN_MENU_CHIPS.length)
    })
  })

  describe('Most Used Clients Frequency Ranking', () => {
    it('ranks clients with highest order counts at the top of client chips', () => {
      const clients = [
        { id: 'c_a', name: 'Alka Restaurant', balance: 0 },
        { id: 'c_b', name: 'Bombay Snacks', balance: 0 },
        { id: 'c_z', name: 'Zodiac Hotel', balance: 0 },
      ]
      // Zodiac Hotel has 10 orders, Bombay Snacks has 3 orders, Alka has 0
      const orders = [
        ...Array(10).fill({ clientId: 'c_z' }),
        ...Array(3).fill({ clientId: 'c_b' }),
      ]

      const ranked = getMostUsedClients(clients, orders, 8)
      expect(ranked[0].name).toBe('Zodiac Hotel')
      expect(ranked[1].name).toBe('Bombay Snacks')
      expect(ranked[2].name).toBe('Alka Restaurant')
    })

    it('breaks ties using most recent order time', () => {
      const clients = [
        { id: 'c_1', name: 'Client One' },
        { id: 'c_2', name: 'Client Two' },
      ]
      // Both have 2 orders, but c_2 has a more recent order
      const orders = [
        { clientId: 'c_1', date: '2026-09-01' },
        { clientId: 'c_1', date: '2026-09-02' },
        { clientId: 'c_2', date: '2026-09-01' },
        { clientId: 'c_2', date: '2026-10-20' },
      ]

      const ranked = getMostUsedClients(clients, orders, 8)
      expect(ranked[0].id).toBe('c_2')
      expect(ranked[1].id).toBe('c_1')
    })

    it('falls back to alphabetical order when no orders exist', () => {
      const clients = [
        { id: 'c_z', name: 'Zaveri Sweets' },
        { id: 'c_a', name: 'Aakash Food' },
      ]
      const ranked = getMostUsedClients(clients, [], 8)
      expect(ranked[0].name).toBe('Aakash Food')
      expect(ranked[1].name).toBe('Zaveri Sweets')
    })

    it('populates top most used clients in startChatbotFlow for ORDER flow', () => {
      const clients = [
        { id: 'c_a', name: 'AAA Walk-in' },
        { id: 'c_f', name: 'Frequent Client' },
      ]
      const orders = [
        { clientId: 'c_f' },
        { clientId: 'c_f' },
        { clientId: 'c_f' },
      ]

      const flow = startChatbotFlow(FLOW_TYPES.ORDER, { clients, orders })
      expect(flow.chips[0].clientName).toBe('Frequent Client')
      expect(flow.chips[1].clientName).toBe('AAA Walk-in')
    })
  })

  describe('Most Used Pricing per SKU', () => {
    it('prioritizes client custom rate first, followed by top popular price points for that SKU', () => {
      const sku = '200ml Box (48 pcs)'
      const orders = [
        { items: [{ sku, rate: 110 }] },
        { items: [{ sku, rate: 110 }] },
        { items: [{ sku, rate: 110 }] },
        { items: [{ sku, rate: 110 }] },
        { items: [{ sku, rate: 110 }] }, // 110 used 5 times -> (Popular)
        { items: [{ sku, rate: 120 }] },
        { items: [{ sku, rate: 120 }] }, // 120 used 2 times
        { items: [{ sku: '500ml (24 pcs)', rate: 140 }] }, // different SKU ignored
      ]

      const chips = getPopularRatesForSku(sku, orders, 105, 120)
      // Client rate 105 must be first
      expect(chips[0].value).toBe(105)
      expect(chips[0].label).toContain('Client Rate')
      expect(chips[0].isPrimary).toBe(true)

      // Most used 110 must be next
      expect(chips[1].value).toBe(110)
      expect(chips[1].label).toContain('Popular')

      // 120 next
      expect(chips[2].value).toBe(120)

      // Deduplication: no duplicate rates
      const values = chips.map((c) => c.value)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })

    it('provides smart fallback price points when historical order data is empty', () => {
      const chips = getPopularRatesForSku('200ml Box (48 pcs)', [], 0, 120)
      expect(chips.length).toBeGreaterThanOrEqual(4)
      expect(chips.some((c) => c.value === 120)).toBe(true)
    })
  })

  describe('Date and Time Format Standardization', () => {
    it('formats local date as YYYY-MM-DD and local time as HH:mm', () => {
      const d = new Date(2026, 9, 22, 15, 30) // 22 Oct 2026 15:30
      expect(getLocalDateStr(d)).toBe('2026-10-22')
      expect(getLocalTimeStr(d)).toBe('15:30')
    })
  })

  describe('6. Staff Task Assignment Flow', () => {
    it('guides step-by-step through staff selection, task type, description, due date, and confirmation', async () => {
      // Step 1: Start
      const s1 = startChatbotFlow(FLOW_TYPES.STAFF_TASK, mockContext)
      expect(s1.step).toBe('staff')
      expect(s1.chips.some((c) => c.value === 'nilesh')).toBe(true)

      // Step 2: Select Nilesh
      const s2 = advanceChatbotFlow(
        s1,
        { value: 'nilesh', staffName: 'Nilesh', staffPhone: '7990943652' },
        mockContext,
      )
      expect(s2.step).toBe('taskType')
      expect(s2.data.assignedTo).toBe('nilesh')
      expect(s2.data.assignedStaffName).toBe('Nilesh')

      // Step 3: Select Follow-up Task
      const s3 = advanceChatbotFlow(
        s2,
        { value: true, isFollowUp: true },
        mockContext,
      )
      expect(s3.step).toBe('taskText')
      expect(s3.data.isFollowUp).toBe(true)
      expect(s3.chips.some((c) => c.label.includes('Collect Empty Jars'))).toBe(true)

      // Step 4: Enter Task Description
      const s4 = advanceChatbotFlow(
        s3,
        'Collect 15 empty petli from Royal Hotel',
        mockContext,
      )
      expect(s4.step).toBe('dueDate')
      expect(s4.data.text).toBe('Collect 15 empty petli from Royal Hotel')

      // Step 5: Select Due Date (Tomorrow)
      const s5 = advanceChatbotFlow(
        s4,
        { value: 'tomorrow', days: 1 },
        mockContext,
      )
      expect(s5.step).toBe('confirm')
      expect(s5.isConfirmation).toBe(true)
      expect(s5.text).toContain('Nilesh')
      expect(s5.text).toContain('Collect 15 empty petli from Royal Hotel')
      expect(s5.text).toContain('💬')
      expect(s5.chips.some((c) => c.label.includes('Save Task'))).toBe(true)
      expect(s5.chips.some((c) => c.label.includes('SMS Staff'))).toBe(true)
      expect(s5.chips.some((c) => c.label.includes('WhatsApp Staff'))).toBe(true)

      // Save flow
      const mockAddJob = vi.fn().mockResolvedValue({ id: 'job-999', smsSent: true })
      const saveRes = await executeFlowSave(
        FLOW_TYPES.STAFF_TASK,
        { ...s5.data, sendSms: true },
        { addStaffJob: mockAddJob },
      )
      expect(saveRes.success).toBe(true)
      expect(mockAddJob).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Collect 15 empty petli from Royal Hotel',
          assignedTo: 'nilesh',
          isFollowUp: true,
          sendNotificationSms: true,
        }),
      )
      expect(saveRes.text).toContain('Assigned to Nilesh')
      expect(saveRes.text).toContain('Nilesh')
    })
  })
})
