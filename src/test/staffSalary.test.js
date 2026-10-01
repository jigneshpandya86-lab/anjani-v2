import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateSalaryBreakdown,
  formatSalaryMonth,
  recordStaffAdvance,
  deleteStaffTransaction,
  settleStaffSalary,
  deleteSalarySettlement,
  restoreExcessAdvance,
  DEFAULT_STAFF,
} from '../services/staffSalaryService'
import { buildSalarySlipPdf } from '../utils/pdf/salarySlipPdf'
import { buildStaffStatementPdf } from '../utils/pdf/staffStatementPdf'
import { tryLocalIntentRoute } from '../utils/aiIntentRouter'

// Mock Firebase
vi.mock('../firebase-config', () => ({
  db: {},
}))

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'mock_doc_id' })
const mockSetDoc = vi.fn().mockResolvedValue({})
const mockUpdateDoc = vi.fn().mockResolvedValue({})
const mockDeleteDoc = vi.fn().mockResolvedValue({})
const mockGetDoc = vi.fn()
const mockGetDocs = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, _col, id) => ({ id })),
  addDoc: (...args) => mockAddDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: {
    fromDate: vi.fn((d) => ({ toDate: () => d })),
  },
  increment: vi.fn((n) => `INCREMENT(${n})`),
}))

describe('Staff Salary & Advance Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('calculateSalaryBreakdown', () => {
    it('computes gross earnings, total deductions, and net payable accurately', () => {
      const result = calculateSalaryBreakdown({
        baseSalary: 15000,
        incentives: 1000,
        overtime: 500,
        advancesDeducted: 3000,
        otherDeductions: 500,
      })

      expect(result.grossEarnings).toBe(16500)
      expect(result.totalDeductions).toBe(3500)
      expect(result.netPayable).toBe(13000)
    })

    it('prevents negative net payable when deductions exceed earnings', () => {
      const result = calculateSalaryBreakdown({
        baseSalary: 5000,
        advancesDeducted: 7000,
      })
      expect(result.grossEarnings).toBe(5000)
      expect(result.totalDeductions).toBe(7000)
      expect(result.netPayable).toBe(0)
    })
  })

  describe('formatSalaryMonth', () => {
    it('converts YYYY-MM into readable month and year', () => {
      expect(formatSalaryMonth('2026-09')).toBe('September 2026')
      expect(formatSalaryMonth('2026-10')).toBe('October 2026')
    })
  })

  describe('recordStaffAdvance', () => {
    it('records advance from Counter Cash and debits counter balance', async () => {
      const res = await recordStaffAdvance({
        employeeId: 'nilesh',
        employeeName: 'Nilesh',
        amount: 2000,
        sourceAccountId: 'counter',
        date: new Date('2026-10-01'),
        note: 'Diwali shopping',
      })

      expect(res.amount).toBe(2000)
      expect(mockAddDoc).toHaveBeenCalledTimes(1)
      // Checks staff doc advanceBalance incremented
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({ advanceBalance: 'INCREMENT(2000)' }),
        { merge: true },
      )
      // Checks accounts summary counter balance decremented
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          balances: { counter: 'INCREMENT(-2000)' },
        }),
        { merge: true },
      )
    })

    it('records advance deducted from route cash custody', async () => {
      await recordStaffAdvance({
        employeeId: 'nilesh',
        employeeName: 'Nilesh',
        amount: 1500,
        sourceAccountId: 'custody_deduction',
        date: new Date('2026-10-02'),
        note: 'Kept from collection',
      })

      // Accounts summary nilesh custody balance decremented
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          balances: { nilesh: 'INCREMENT(-1500)' },
        }),
        { merge: true },
      )
    })
  })

  describe('settleStaffSalary', () => {
    it('settles monthly salary, posts expense, debits payout account, and settles advances', async () => {
      const result = await settleStaffSalary({
        employeeId: 'nilesh',
        employeeName: 'Nilesh',
        month: '2026-09',
        baseSalary: 15000,
        incentives: 1000,
        overtime: 0,
        advancesDeducted: 3000,
        otherDeductions: 0,
        payoutAccountId: 'counter',
        payoutDate: new Date('2026-10-05'),
        activeAdvanceIds: ['adv_1', 'adv_2'],
      })

      expect(result.netPaid).toBe(13000)
      expect(result.grossEarnings).toBe(16000)

      // 1. Expense added under 'Salary'
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          category: 'Salary',
          amount: 16000,
        }),
      )

      // 2. Counter balance decremented by net pay (13000)
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          balances: { counter: 'INCREMENT(-13000)' },
        }),
        { merge: true },
      )

      // 3. Employee advance balance reduced by 3000
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({
          advanceBalance: 'INCREMENT(-3000)',
          lastSettlementMonth: '2026-09',
        }),
        { merge: true },
      )

      // 4. Advances marked as settled
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'adv_1' }),
        expect.objectContaining({ status: 'settled' }),
      )
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'adv_2' }),
        expect.objectContaining({ status: 'settled' }),
      )
    })

    it('settles advances with chronological partial carry-forward when advances exceed deduction (e.g. 16600 advance vs 15000 salary)', async () => {
      const result = await settleStaffSalary({
        employeeId: 'nilesh',
        employeeName: 'Nilesh',
        month: '2026-09',
        baseSalary: 15000,
        advancesDeducted: 15000,
        payoutAccountId: 'counter',
        payoutDate: new Date('2026-10-01'),
        activeAdvances: [
          { id: 'adv_a', amount: 10000, date: new Date('2026-09-05'), note: 'Advance 1' },
          { id: 'adv_b', amount: 6600, date: new Date('2026-09-20'), note: 'Advance 2' },
        ],
      })

      expect(result.netPaid).toBe(0)
      expect(result.advancesDeducted).toBe(15000)

      // Adv A (10,000) is fully settled
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'adv_a' }),
        expect.objectContaining({
          status: 'settled',
          settledAmount: 10000,
        }),
      )

      // Adv B (6,600) is partially settled (5,000) with 1,600 carried forward
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'adv_b' }),
        expect.objectContaining({
          status: 'settled',
          settledAmount: 5000,
          partialCarryForward: true,
          carryForwardAmount: 1600,
        }),
      )

      // Active carry-forward advance of 1,600 is recorded in staff_transactions
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 1600,
          status: 'active',
          isCarryForward: true,
          employeeId: 'nilesh',
        }),
      )

      // Employee advance balance decremented by 15,000 (leaving 1,600)
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({
          advanceBalance: 'INCREMENT(-15000)',
        }),
        { merge: true },
      )
    })
  })

  describe('deleteSalarySettlement', () => {
    it('reverts settled advances, deletes carry-forward records, and refunds account', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          employeeId: 'nilesh',
          month: '2026-09',
          advancesDeducted: 15000,
          netPaid: 0,
          expenseId: 'exp_sal_1',
          payoutAccountId: 'counter',
        }),
      })

      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [
          { id: 'cf_1', ref: { id: 'cf_1' } },
        ],
      })

      const success = await deleteSalarySettlement('settle_123', 'nilesh')
      expect(success).toBe(true)

      // Restores advance balance by adding back 15000
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({
          advanceBalance: 'INCREMENT(15000)',
        }),
        { merge: true },
      )

      // Deletes expense
      expect(mockDeleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'exp_sal_1' }),
      )
      // Deletes settlement record
      expect(mockDeleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'settle_123' }),
      )
    })
  })

  describe('restoreExcessAdvance', () => {
    it('creates active carry-forward advance and increments employee advance balance', async () => {
      const res = await restoreExcessAdvance({
        employeeId: 'nilesh',
        employeeName: 'Nilesh',
        amount: 1600,
        note: 'Restored excess advance',
      })

      expect(res.amount).toBe(1600)
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          amount: 1600,
          status: 'active',
          isCarryForward: true,
        }),
      )
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({
          advanceBalance: 'INCREMENT(1600)',
        }),
        { merge: true },
      )
    })
  })

  describe('deleteStaffTransaction', () => {
    it('reverses advance and refunds balance to source account', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          employeeId: 'nilesh',
          amount: 2000,
          type: 'advance',
          sourceAccountId: 'counter',
          status: 'active',
        }),
      })

      await deleteStaffTransaction('adv_123')

      // Employee advance balance decremented by 2000
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'nilesh' }),
        expect.objectContaining({ advanceBalance: 'INCREMENT(-2000)' }),
        { merge: true },
      )

      // Counter refunded by 2000
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          balances: { counter: 'INCREMENT(2000)' },
        }),
        { merge: true },
      )

      expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
    })
  })

  describe('buildSalarySlipPdf', () => {
    it('creates a valid PDF document with employee details and breakdown', () => {
      const file = buildSalarySlipPdf({
        employee: DEFAULT_STAFF[0],
        settlement: {
          month: '2026-09',
          baseSalary: 15000,
          incentives: 1000,
          overtime: 500,
          advancesDeducted: 3000,
          otherDeductions: 0,
          grossEarnings: 16500,
          totalDeductions: 3000,
          netPaid: 13500,
          payoutAccountId: 'counter',
          payoutDate: new Date('2026-10-05'),
        },
        advances: [
          {
            id: 'a1',
            amount: 2000,
            date: new Date('2026-09-10'),
            sourceAccountId: 'counter',
            note: 'Festival advance',
          },
          {
            id: 'a2',
            amount: 1000,
            date: new Date('2026-09-20'),
            sourceAccountId: 'custody_deduction',
            note: 'Route deduction',
          },
        ],
      })

      expect(file).toBeDefined()
      expect(file.name).toContain('Salary_Slip_Nilesh_2026_09.pdf')
      expect(file.size).toBeGreaterThan(500)
    })
  })

  describe('buildStaffStatementPdf', () => {
    it('creates a period advance & salary ledger PDF with chronological rows and summaries', () => {
      const file = buildStaffStatementPdf({
        employee: DEFAULT_STAFF[0],
        dateRangeLabel: 'September 2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        advances: [
          {
            id: 'adv_1',
            amount: 6000,
            date: new Date('2026-09-05'),
            sourceAccountId: 'counter',
            note: 'Advance 1',
          },
          {
            id: 'adv_2',
            amount: 6000,
            date: new Date('2026-09-15'),
            sourceAccountId: 'bank',
            note: 'Advance 2',
          },
          {
            id: 'adv_3',
            amount: 4600,
            date: new Date('2026-09-22'),
            sourceAccountId: 'counter',
            note: 'Advance 3',
          },
        ],
        salarySettlements: [
          {
            id: 'sal_1',
            month: '2026-09',
            grossEarnings: 15000,
            advancesDeducted: 15000,
            netPaid: 0,
            payoutAccountId: 'counter',
            payoutDate: new Date('2026-09-30'),
          },
        ],
      })

      expect(file).toBeDefined()
      expect(file.name).toContain('Staff_Statement_Nilesh_')
      expect(file.size).toBeGreaterThan(500)
    })
  })

  describe('AI Intent Router for Staff Salary & Advance', () => {
    const fakeStore = {
      staffList: [
        { id: 'nilesh', name: 'Nilesh', baseSalary: 15000, advanceBalance: 2500 },
      ],
      staffTransactions: [
        { employeeId: 'nilesh', amount: 2500, status: 'active' },
      ],
      accountsSummary: {
        nilesh: 4000,
        hiteshbhai: 1000,
        counter: 8000,
        bank: 25000,
      },
    }

    it('routes Nilesh advance query with zero tokens', () => {
      const res = tryLocalIntentRoute('Nilesh advance ketlo chhe?', fakeStore)
      expect(res).not.toBeNull()
      expect(res.handled).toBe(true)
      expect(res.type).toBe('staff_salary_summary')
      expect(res.text).toContain('Nilesh')
      expect(res.text).toContain('₹2,500')
      expect(res.data.activeAdvanceTotal).toBe(2500)
    })

    it('routes Nilesh salary query with zero tokens', () => {
      const res = tryLocalIntentRoute('What is Nilesh salary?', fakeStore)
      expect(res).not.toBeNull()
      expect(res.handled).toBe(true)
      expect(res.type).toBe('staff_salary_summary')
      expect(res.data.baseSalary).toBe(15000)
      expect(res.data.estimatedPendingSalary).toBe(12500)
    })

    it('routes Cash with Nilesh query to cash custody (accounts_summary)', () => {
      const res = tryLocalIntentRoute('How much cash with Nilesh?', fakeStore)
      expect(res).not.toBeNull()
      expect(res.handled).toBe(true)
      expect(res.type).toBe('accounts_summary')
      expect(res.data.balances.nilesh).toBe(4000)
    })
  })
})
