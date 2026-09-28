import { describe, it, expect } from 'vitest'
import {
  escapePdfText,
  san,
  fmt,
  resolveTimestamp,
  createPdfFile,
  buildLedgerPdf,
  buildSimpleInvoicePdfFile,
  buildTabularReportPdf,
  buildAccountsLedgerPdf,
} from '../utils/pdf'

describe('PDF Utilities & Generators', () => {
  it('escapes PDF special characters and sanitizes text', () => {
    expect(escapePdfText('Test (Parens) \\ Backslash')).toBe('Test \\(Parens\\) \\\\ Backslash')
    expect(san('Price: ₹150 (inclusive)')).toBe('Price: Rs.150 \\(inclusive\\)')
  })

  it('formats numbers into Indian numbering system', () => {
    expect(fmt(1234567)).toBe('12,34,567')
    expect(fmt(0)).toBe('0')
  })

  it('resolves timestamps from Firestore objects, strings, numbers, and null', () => {
    expect(resolveTimestamp(null)).toBeNull()
    const fromSecs = resolveTimestamp({ seconds: 1700000000 })
    expect(fromSecs).toBeInstanceOf(Date)
    expect(fromSecs?.getTime()).toBe(1700000000000)

    const fromDateObj = resolveTimestamp({
      toDate: () => new Date('2026-01-01T00:00:00Z'),
    })
    expect(fromDateObj?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('creates valid PDF Blob/File', () => {
    const file = createPdfFile('%PDF-1.4 test', 'test.pdf')
    expect(file).toBeDefined()
    expect(file.type).toBe('application/pdf')
  })

  it('generates a customer statement PDF with correct forward balance', () => {
    const txns = [
      { type: 'invoice', amount: 500, createdAt: { seconds: 1700000100 }, narration: 'Order #1' },
      { type: 'payment', amount: 200, createdAt: { seconds: 1700000200 }, narration: 'Cash' },
    ]
    const file = buildLedgerPdf({
      clientName: 'ABC Traders',
      dateRangeLabel: 'Current Month',
      txns,
      openingBalance: 100,
    })
    expect(file).toBeDefined()
    expect(file.size).toBeGreaterThan(100)
    expect(file.name).toBe('ledger.pdf')
  })

  it('generates an itemized invoice PDF', () => {
    const order = {
      orderId: 'ORD-999',
      date: '2026-09-18',
      time: '12:00',
      totalAmount: 1200,
      items: [
        { sku: 'Anjani 200ml', qty: 10, rate: 120 },
      ],
    }
    const file = buildSimpleInvoicePdfFile({
      order,
      clientName: 'Client X',
      mobile: '9876543210',
    })
    expect(file).toBeDefined()
    expect(file.name).toBe('invoice-ORD-999.pdf')
  })

  it('generates a tabular report PDF', () => {
    const file = buildTabularReportPdf({
      title: 'Stock Report',
      columns: ['SKU', 'Available Qty'],
      rows: [['Anjani 200ml', '50 Boxes']],
      filename: 'stock_test.pdf',
    })
    expect(file).toBeDefined()
    expect(file.name).toBe('stock_test.pdf')
  })

  it('generates an accounts and cash ledger PDF for an employee with running balance', () => {
    const txns = [
      {
        type: 'collection',
        direction: 'in',
        amount: 2500,
        title: 'Jay Ambe Provision',
        note: 'Payment received for "Jay Ambe Provision" on 28/09/2026 (GPay)',
        timestamp: 1700000100000,
        accountName: 'Nilesh',
      },
      {
        type: 'expense',
        direction: 'out',
        amount: 300,
        title: 'Fuel',
        note: 'Van diesel refuel',
        timestamp: 1700000200000,
        accountName: 'Nilesh',
      },
      {
        type: 'transfer',
        direction: 'out',
        amount: 1500,
        title: 'To Counter Cash',
        note: 'Evening handover to Jigneshbhai',
        timestamp: 1700000300000,
        accountName: 'Nilesh',
      },
    ]

    const file = buildAccountsLedgerPdf({
      accountTitle: 'Nilesh',
      accountType: 'Staff Cash Custody',
      dateRangeLabel: 'Current Month (Sep 2026)',
      accountsSummary: { nilesh: 1200, hiteshbhai: 800, counter: 5000, bank: 20000 },
      txns,
      openingBalance: 500,
      filterTypeLabel: 'All Transactions',
    })

    expect(file).toBeDefined()
    expect(file.type).toBe('application/pdf')
    expect(file.name).toContain('Accounts_Ledger_Nilesh_')
    expect(file.size).toBeGreaterThan(500)
  })

  it('generates multi-page accounts ledger PDF when many transactions exist', () => {
    const txns = []
    for (let i = 0; i < 40; i++) {
      txns.push({
        type: i % 2 === 0 ? 'collection' : 'expense',
        direction: i % 2 === 0 ? 'in' : 'out',
        amount: 100 * (i + 1),
        title: i % 2 === 0 ? `Client ${i}` : 'Daily Expense',
        note: `Transaction note #${i}`,
        timestamp: 1700000000000 + i * 3600000,
        accountName: 'Counter',
      })
    }

    const file = buildAccountsLedgerPdf({
      accountTitle: 'Counter Cash',
      accountType: 'Cash Drawer',
      dateRangeLabel: '01/09/2026 to 28/09/2026',
      accountsSummary: { nilesh: 1000, hiteshbhai: 500, counter: 8000, bank: 15000 },
      txns,
      openingBalance: 2000,
      filterTypeLabel: 'All Entries',
    })

    expect(file).toBeDefined()
    expect(file.size).toBeGreaterThan(1500)
  })
})

