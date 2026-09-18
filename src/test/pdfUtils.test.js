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
})
