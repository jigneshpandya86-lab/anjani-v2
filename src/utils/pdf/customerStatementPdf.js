import { san, fmt, resolveTimestamp } from './pdfCore'

/**
 * Builds a professional, multi-page Customer Ledger Statement PDF.
 * Includes official company header, customer details card, account summary metrics,
 * right-aligned currency amounts, running balances, zebra-striped rows, settlement status,
 * and UPI payment details with dual signatures.
 */
export const buildLedgerPdf = ({
  clientName = 'Valued Customer',
  clientMobile = '',
  clientAddress = '',
  clientId = '',
  dateRangeLabel = 'Current Month',
  txns = [],
  openingBalance = 0,
  paymentSettings = {},
  filename = '',
}) => {
  // A4 portrait geometry (595 x 842 pt)
  const pW = 595
  const pH = 842
  const mg = 32
  const usableW = pW - mg * 2 // 531 pt

  // Column definitions: Sr(20) + Date(56) + Type(48) + Particulars(197) + Debit(70) + Credit(70) + Balance(70) = 531 pt
  const cW = [20, 56, 48, 197, 70, 70, 70]
  const cHdr = [
    'Sr',
    'Date',
    'Type',
    'Particulars / Narration',
    'Debit (+ Dr)',
    'Credit (- Cr)',
    'Balance (Rs.)',
  ]
  const rH = 16

  const txt = (x, y, size, t, maxLen = 60, font = '/F1') =>
    `BT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t, maxLen)}) Tj ET`

  const drawRow = (
    lines,
    y,
    cells,
    bg = null,
    textColor = '0.1 0.1 0.1',
    font = '/F1',
    fontSize = 6.5,
  ) => {
    if (bg) {
      lines.push(`${bg} rg`)
      lines.push(`${mg} ${y - 3} ${usableW} ${rH} re f`)
    }
    lines.push(`${textColor} rg`)
    let xOff = mg
    const maxLens = [4, 12, 12, 55, 20, 20, 20]

    cells.forEach((cell, i) => {
      const cellText = String(cell ?? '')
      const isAmt = i >= 4 // Debit, Credit, Balance are right-aligned
      if (isAmt) {
        // Approximate width for right alignment in Helvetica
        const estWidth = cellText.length * 3.7 + (cellText.includes('Rs.') ? 3 : 0)
        const xPos = xOff + cW[i] - 4 - Math.min(estWidth, cW[i] - 6)
        lines.push(txt(xPos, y + 4, fontSize, cellText, maxLens[i], font))
      } else {
        lines.push(txt(xOff + 3, y + 4, fontSize, cellText, maxLens[i], font))
      }
      xOff += cW[i]
    })
    lines.push('0 0 0 rg')
  }

  // Pre-calculate running balances and totals
  let runningBal = Number(openingBalance || 0)
  let totalDr = 0
  let totalCr = 0

  const dataRows = (txns || []).map((tx, idx) => {
    const rawAmt = Number(tx.amount || 0)
    let dr = ''
    let cr = ''
    const isInvoice = tx.type === 'invoice'
    const isPayment = tx.type === 'payment'

    if (isInvoice) {
      const amt = Math.abs(rawAmt)
      runningBal += amt
      dr = fmt(amt)
      totalDr += amt
    } else if (isPayment) {
      const amt = Math.abs(rawAmt)
      runningBal -= amt
      cr = fmt(amt)
      totalCr += amt
    } else {
      // Reversal or manual adjustments
      if (rawAmt < 0) {
        const amt = Math.abs(rawAmt)
        runningBal += amt
        dr = fmt(amt)
        totalDr += amt
      } else {
        const amt = Math.abs(rawAmt)
        runningBal -= amt
        cr = fmt(amt)
        totalCr += amt
      }
    }

    const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
    const dateStr = txDate
      ? txDate.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '-'

    const typeLabel =
      tx.type === 'invoice'
        ? 'Invoice'
        : tx.type === 'payment'
          ? (tx.method ? `Paid (${tx.method.toUpperCase()})` : 'Payment')
          : 'Reversal'

    const narrationText =
      tx.narration ||
      tx.note ||
      (isInvoice ? `Order #${tx.orderId || ''}` : 'Cash / Online Payment')

    return {
      type: tx.type,
      cells: [
        String(idx + 1),
        dateStr,
        typeLabel,
        narrationText,
        dr,
        cr,
        `Rs.${fmt(runningBal)}`,
      ],
    }
  })

  const closingBalance = runningBal

  // Build page stream
  const buildPageStream = (pageRows, isFirstPage, pageNum, totalPages) => {
    const lines = []
    let y = pH - mg

    if (isFirstPage) {
      // 1. Top Company Branding Header Banner (42 pt height)
      lines.push('0.06 0.13 0.29 rg') // Deep navy
      lines.push(`${mg} ${y - 42} ${usableW} 42 re f`)

      lines.push('1 1 1 rg')
      lines.push(txt(mg + 10, y - 16, 13, 'ANJANI WATER SUPPLIERS', 40, '/F2'))
      lines.push('0.85 0.92 1 rg')
      lines.push(txt(mg + 10, y - 29, 7.5, 'Pure & Hygienic Packaged Drinking Water | Mineral Beverages', 60, '/F1'))
      lines.push(txt(pW - mg - 190, y - 16, 6.5, 'Surat, Gujarat, India', 40, '/F1'))
      lines.push(txt(pW - mg - 190, y - 27, 6.5, 'Helpline: +91 99259 97750, +91 79909 43652', 45, '/F2'))
      y -= 48

      // 2. Document Title & Period Banner
      lines.push('0.1 0.1 0.1 rg')
      lines.push(txt(mg, y - 4, 10.5, 'CUSTOMER ACCOUNT LEDGER STATEMENT', 45, '/F2'))
      lines.push('0.45 0.45 0.45 rg')
      const nowStr = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      lines.push(txt(pW - mg - 180, y - 4, 7, `Generated: ${nowStr}`, 40, '/F1'))
      y -= 16

      // 3. Customer Info Card & Account Overview Card (2 columns, 54 pt height)
      const cardW = (usableW - 10) / 2 // 260.5 pt
      const cardH = 54

      // Left Card: Customer Details
      lines.push('0.96 0.97 0.99 rg')
      lines.push(`${mg} ${y - cardH} ${cardW} ${cardH} re f`)
      lines.push('0.82 0.86 0.92 RG 0.5 w')
      lines.push(`${mg} ${y - cardH} ${cardW} ${cardH} re S`)

      lines.push('0.07 0.15 0.32 rg')
      lines.push(txt(mg + 8, y - 13, 8.5, clientName || 'Valued Customer', 35, '/F2'))
      lines.push('0.3 0.3 0.3 rg')
      if (clientMobile) {
        lines.push(txt(mg + 8, y - 24, 7, `Mobile: +91 ${clientMobile}`, 30, '/F1'))
      }
      if (clientAddress) {
        lines.push(txt(mg + 8, y - 35, 6.5, `Address: ${clientAddress}`, 48, '/F1'))
      }
      if (clientId && clientId !== 'all') {
        lines.push(txt(mg + 8, y - 46, 6.5, `Client ID: ${clientId}`, 30, '/F1'))
      }

      // Right Card: Statement Period & Balance Summary
      const rCardX = mg + cardW + 10
      lines.push('0.96 0.97 0.99 rg')
      lines.push(`${rCardX} ${y - cardH} ${cardW} ${cardH} re f`)
      lines.push('0.82 0.86 0.92 RG 0.5 w')
      lines.push(`${rCardX} ${y - cardH} ${cardW} ${cardH} re S`)

      lines.push('0.3 0.3 0.3 rg')
      lines.push(txt(rCardX + 8, y - 13, 7, `Period: ${dateRangeLabel}`, 40, '/F2'))
      lines.push(txt(rCardX + 8, y - 24, 6.5, `Opening Bal (B/F): Rs.${fmt(openingBalance)}`, 35, '/F1'))
      lines.push(txt(rCardX + 8, y - 35, 6.5, `Total Billed (Dr): +Rs.${fmt(totalDr)} | Paid (Cr): -Rs.${fmt(totalCr)}`, 45, '/F1'))

      // Net Balance in card
      const balColor = closingBalance > 0 ? '0.75 0.1 0.1' : closingBalance < 0 ? '0.1 0.5 0.1' : '0.2 0.2 0.2'
      lines.push(`${balColor} rg`)
      const balTag = closingBalance > 0 ? 'DUE / PAYABLE' : closingBalance < 0 ? 'ADVANCE' : 'NIL'
      lines.push(txt(rCardX + 8, y - 46, 7.5, `Closing Balance: Rs.${fmt(closingBalance)} (${balTag})`, 40, '/F2'))

      y -= cardH + 10
    } else {
      // Subsequent page compact header
      lines.push('0.07 0.15 0.32 rg')
      lines.push(txt(mg, y - 4, 8.5, `${clientName || 'Customer'} - Ledger Statement (Contd.)`, 50, '/F2'))
      lines.push('0.4 0.4 0.4 rg')
      lines.push(txt(pW - mg - 140, y - 4, 7, `Period: ${dateRangeLabel}`, 35, '/F1'))
      y -= 14
    }

    // 4. Column Headers Bar (Drawn on every page)
    lines.push('0.12 0.22 0.42 rg')
    lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
    lines.push('1 1 1 rg')
    let hX = mg
    cHdr.forEach((h, i) => {
      const isAmt = i >= 4
      if (isAmt) {
        const estWidth = h.length * 3.8
        const xPos = hX + cW[i] - 4 - Math.min(estWidth, cW[i] - 6)
        lines.push(txt(xPos, y + 4, 6.5, h, 20, '/F2'))
      } else {
        lines.push(txt(hX + 3, y + 4, 6.5, h, 25, '/F2'))
      }
      hX += cW[i]
    })
    lines.push('0 0 0 rg')
    y -= rH

    // 5. Opening Balance Row (on Page 1 only)
    if (isFirstPage) {
      drawRow(
        lines,
        y,
        ['-', '-', 'B/F', 'Opening Balance Brought Forward', '', '', `Rs.${fmt(openingBalance)}`],
        '0.92 0.95 0.99',
        '0.15 0.25 0.5',
        '/F2',
        6.5,
      )
      y -= rH
    }

    // 6. Transaction rows
    pageRows.forEach((rowObj, ri) => {
      const bg = ri % 2 === 1 ? '0.98 0.98 0.99' : null
      let textCol = '0.1 0.1 0.1'
      if (rowObj.type === 'payment') textCol = '0 0.45 0.15'
      else if (rowObj.type === 'reversal') textCol = '0.6 0.15 0.15'

      drawRow(lines, y, rowObj.cells, bg, textCol, '/F1', 6.5)
      y -= rH
    })

    // 7. Footer on every page
    lines.push('0.55 0.55 0.55 rg')
    lines.push(txt(mg, mg - 4, 6.5, 'Confidential - For Customer Account Verification - Anjani Water Suppliers (+91 99259 97750)', 70, '/F1'))
    lines.push(txt(pW - mg - 60, mg - 4, 6.5, `Page ${pageNum} of ${totalPages}`, 20, '/F1'))
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Summary stream at bottom of final page
  const buildSummaryStream = () => {
    const lines = []
    let y = mg + 6 * rH + 6

    // Period Totals Row
    drawRow(
      lines,
      y,
      [
        '',
        '',
        'TOTAL',
        `Period Summary (${dataRows.length} entries)`,
        fmt(totalDr),
        fmt(totalCr),
        `Rs.${fmt(closingBalance)}`,
      ],
      '0.88 0.91 0.96',
      '0.06 0.13 0.29',
      '/F2',
      7,
    )
    y -= rH + 6

    // Status Banner Box (Due vs Advance vs Cleared)
    if (closingBalance > 0) {
      lines.push('0.99 0.93 0.93 rg')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re f`)
      lines.push('0.85 0.5 0.5 RG 0.5 w')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re S`)
      lines.push('0.75 0.1 0.1 rg')
      lines.push(txt(mg + 10, y - 3, 7.5, `NET AMOUNT PAYABLE: Rs.${fmt(closingBalance)} (Kindly clear at your earliest convenience)`, 65, '/F2'))
    } else if (closingBalance < 0) {
      lines.push('0.93 0.98 0.93 rg')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re f`)
      lines.push('0.5 0.8 0.5 RG 0.5 w')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re S`)
      lines.push('0.1 0.5 0.1 rg')
      lines.push(txt(mg + 10, y - 3, 7.5, `ADVANCE CREDIT BALANCE: Rs.${fmt(Math.abs(closingBalance))} (Adjustable against future orders)`, 65, '/F2'))
    } else {
      lines.push('0.95 0.96 0.97 rg')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re f`)
      lines.push('0.7 0.7 0.7 RG 0.5 w')
      lines.push(`${mg} ${y - 14} ${usableW} 18 re S`)
      lines.push('0.2 0.2 0.2 rg')
      lines.push(txt(mg + 10, y - 3, 7.5, 'ALL DUES ARE FULLY SETTLED - ZERO BALANCE OUTSTANDING', 60, '/F2'))
    }
    y -= 22

    // Bank Details & Payment Instructions Bar
    const upiId = paymentSettings.upiId || 'annapurnafoods@icici'
    const payeeName = paymentSettings.payeeName || 'Annapurna Foods'
    lines.push('0.96 0.97 0.99 rg')
    lines.push(`${mg} ${y - 14} ${usableW} 18 re f`)
    lines.push('0.8 0.84 0.9 RG 0.5 w')
    lines.push(`${mg} ${y - 14} ${usableW} 18 re S`)
    lines.push('0.2 0.25 0.4 rg')
    lines.push(txt(mg + 10, y - 3, 6.5, `Payment Options: Cash / Online UPI (GPay, PhonePe, Paytm) - UPI ID: ${upiId} (${payeeName})`, 75, '/F1'))
    y -= 24

    // Signatures Block
    lines.push('0.4 0.4 0.4 rg')
    lines.push(txt(mg + 15, y - 4, 7, 'Customer Signature / Confirmation', 40, '/F1'))
    lines.push(txt(pW - mg - 190, y - 4, 7, 'For ANJANI WATER SUPPLIERS (Authorized Signatory)', 45, '/F2'))
    lines.push('0.7 0.7 0.7 RG 0.5 w')
    lines.push(`${mg + 15} ${y + 6} 140 0.5 re f`)
    lines.push(`${pW - mg - 190} ${y + 6} 170 0.5 re f`)
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Exact pagination math to prevent overlap
  const firstPageHeaderH = 48 + 16 + 54 + 10 + rH + rH // 160 pt
  const summaryBlockH = 6 * rH + 40 // ~136 pt
  const rowsOnFirstPageAlone = Math.max(
    1,
    Math.floor((pH - mg * 2 - firstPageHeaderH - summaryBlockH) / rH), // ~28 rows
  )
  const rowsOnFirstPageMulti = Math.max(
    1,
    Math.floor((pH - mg * 2 - firstPageHeaderH) / rH), // ~37 rows
  )
  const subseqHeaderH = 14 + rH
  const rowsPerSubseqPage = Math.max(
    1,
    Math.floor((pH - mg * 2 - subseqHeaderH) / rH), // ~45 rows
  )
  const rowsOnLastSubseqPage = Math.max(
    1,
    Math.floor((pH - mg * 2 - subseqHeaderH - summaryBlockH) / rH), // ~36 rows
  )

  const pages = []
  if (dataRows.length <= rowsOnFirstPageAlone) {
    // Fits entirely on 1 page!
    pages.push(dataRows)
  } else {
    // Multi-page
    pages.push(dataRows.slice(0, rowsOnFirstPageMulti))
    let off = rowsOnFirstPageMulti
    while (off < dataRows.length) {
      const remaining = dataRows.length - off
      if (remaining <= rowsOnLastSubseqPage) {
        pages.push(dataRows.slice(off))
        off = dataRows.length
      } else {
        pages.push(dataRows.slice(off, off + rowsPerSubseqPage))
        off += rowsPerSubseqPage
      }
    }
  }

  const totalPages = pages.length
  const streams = pages.map((pr, i) => buildPageStream(pr, i === 0, i + 1, totalPages))
  streams[streams.length - 1] += '\n' + buildSummaryStream()

  // Build standard PDF 1.4 objects
  const fontRegularNum = 3 + pages.length * 2
  const fontBoldNum = 4 + pages.length * 2
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  const objs = []

  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj`)

  streams.forEach((stream, i) => {
    const enc = new TextEncoder().encode(stream)
    objs.push(
      `${3 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> >>\nendobj`,
    )
    objs.push(
      `${4 + i * 2} 0 obj\n<< /Length ${enc.length} >>\nstream\n${stream}\nendstream\nendobj`,
    )
  })

  objs.push(`${fontRegularNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`)
  objs.push(`${fontBoldNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`)

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((obj) => {
    offsets.push(pdf.length)
    pdf += obj + '\n'
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((o) => {
    pdf += String(o).padStart(10, '0') + ' 00000 n \n'
  })
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  const safeClient = String(clientName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')
  const defaultFilename = `Customer_Ledger_${safeClient}_${new Date().toISOString().slice(0, 10)}.pdf`
  const finalFilename = filename || (clientName === 'Valued Customer' ? 'ledger.pdf' : defaultFilename)

  return new File([pdf], finalFilename, { type: 'application/pdf' })
}
