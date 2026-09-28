import { san, fmt, resolveTimestamp } from './pdfCore'

/**
 * Builds a multi-page, professional Accounts & Cash Ledger PDF report.
 * Supports individual employee accounts (Nilesh, Hiteshbhai, Counter, Bank)
 * or consolidated multi-account statements with full visible metrics and running balance.
 */
export const buildAccountsLedgerPdf = ({
  accountTitle = 'Accounts & Cash Ledger',
  accountType = 'All Accounts',
  dateRangeLabel = 'Current Month',
  accountsSummary = {},
  txns = [],
  openingBalance = 0,
  filterTypeLabel = 'All Entries',
}) => {
  // A4 portrait geometry (595 x 842 pt)
  const pW = 595
  const pH = 842
  const mg = 32
  const usableW = pW - mg * 2 // 531 pt

  // Column definitions: sum of widths = 531 pt
  // Sr(20) + DateTime(72) + Account(54) + Type(46) + Particulars(100) + Narration(119) + In(40) + Out(40) + Bal(40) = 531
  const cW = [20, 72, 54, 46, 100, 119, 40, 40, 40]
  const cHdr = [
    'Sr',
    'Date & Time',
    'Account',
    'Type',
    'Particulars',
    'Narration / Note',
    'In (+)',
    'Out (-)',
    'Balance',
  ]
  const rH = 17

  const txt = (x, y, size, t, maxLen = 60, font = '/F1') =>
    `BT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t, maxLen)}) Tj ET`

  const drawRow = (
    lines,
    y,
    cells,
    bg = null,
    textColor = '0 0 0',
    font = '/F1',
    fontSize = 6.5,
  ) => {
    if (bg) {
      lines.push(`${bg} rg`)
      lines.push(`${mg} ${y - 3} ${usableW} ${rH} re f`)
    }
    lines.push(`${textColor} rg`)
    let xOff = mg
    const maxLens = [4, 18, 12, 10, 22, 28, 10, 10, 10]
    cells.forEach((cell, i) => {
      // Align amounts to right if In, Out, or Balance
      const isAmt = i >= 6
      const cellText = String(cell ?? '')
      const xPos = isAmt ? xOff + cW[i] - 3 - Math.min(cellText.length * 3.5, cW[i] - 4) : xOff + 3
      lines.push(txt(xPos, y + 4, fontSize, cellText, maxLens[i], font))
      xOff += cW[i]
    })
    lines.push('0 0 0 rg')
  }

  // Pre-calculate running balances and totals
  let runningBal = Number(openingBalance || 0)
  let totalInward = 0
  let totalExpenses = 0
  let totalHandoversOut = 0
  let totalTransfersIn = 0

  const dataRows = txns.map((tx, idx) => {
    const amt = Number(tx.amount || 0)
    let inAmt = ''
    let outAmt = ''

    if (tx.type === 'collection') {
      runningBal += amt
      inAmt = fmt(amt)
      totalInward += amt
    } else if (tx.type === 'expense') {
      runningBal -= amt
      outAmt = fmt(amt)
      totalExpenses += amt
    } else if (tx.type === 'transfer') {
      if (tx.direction === 'in') {
        runningBal += amt
        inAmt = fmt(amt)
        totalTransfersIn += amt
      } else {
        runningBal -= amt
        outAmt = fmt(amt)
        totalHandoversOut += amt
      }
    } else {
      if (amt >= 0) {
        runningBal += amt
        inAmt = fmt(amt)
        totalInward += amt
      } else {
        runningBal -= Math.abs(amt)
        outAmt = fmt(Math.abs(amt))
        totalExpenses += Math.abs(amt)
      }
    }

    const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt) || (tx.timestamp ? new Date(tx.timestamp) : null)
    let dateStr = '-'
    if (txDate && !isNaN(txDate.getTime())) {
      const dStr = txDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })
      const tStr = txDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      dateStr = `${dStr} ${tStr}`
    }

    const typeDisplay =
      tx.type === 'collection'
        ? 'Inward'
        : tx.type === 'expense'
        ? 'Expense'
        : tx.direction === 'in'
        ? 'Transfer In'
        : 'Transfer Out'

    const particulars = tx.title || tx.clientName || tx.category || 'General'
    const narration = tx.note || tx.narration || '-'
    const accountLabel = tx.accountName || tx.accountLabel || tx.accountId || '-'

    return {
      cells: [
        String(idx + 1),
        dateStr,
        accountLabel,
        typeDisplay,
        particulars,
        narration,
        inAmt,
        outAmt,
        `Rs.${fmt(runningBal)}`,
      ],
      type: tx.type,
      direction: tx.direction,
    }
  })

  const closingBalance = runningBal
  const totalOutflow = totalExpenses + totalHandoversOut
  const netMovement = totalInward + totalTransfersIn - totalOutflow

  // Visible Balance Snapshot
  const staffCashTotal =
    Number(accountsSummary?.nilesh || 0) + Number(accountsSummary?.hiteshbhai || 0)
  const counterTotal = Number(accountsSummary?.counter || 0)
  const bankTotal = Number(accountsSummary?.bank || 0)

  // Builds Page 1 Stream with Executive Summary + First batch of rows
  const buildPageStream = (pageRows, isFirstPage, pageNum, totalPages) => {
    const lines = []
    let y = pH - mg

    if (isFirstPage) {
      // 1. Top Brand Banner
      lines.push('0.06 0.13 0.28 rg')
      lines.push(`${mg} ${y - 40} ${usableW} 40 re f`)
      lines.push('1 1 1 rg')
      lines.push(txt(mg + 10, y - 18, 14, 'ANJANI WATER SUPPLIERS', 40, '/F2'))
      lines.push(txt(mg + 10, y - 32, 9, 'ACCOUNTS & CASH LEDGER REPORT', 40, '/F2'))
      lines.push(txt(pW - mg - 160, y - 22, 7.5, `Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`, 35, '/F1'))
      lines.push(txt(pW - mg - 160, y - 32, 7.5, 'Official Accounting Passbook', 35, '/F1'))
      lines.push('0 0 0 rg')
      y -= 48

      // 2. Report Parameters Line
      lines.push('0.96 0.97 0.98 rg')
      lines.push(`${mg} ${y - 20} ${usableW} 20 re f`)
      lines.push('0.85 0.88 0.92 RG 0.5 w')
      lines.push(`${mg} ${y - 20} ${usableW} 20 re s`)
      lines.push('0.1 0.1 0.1 rg')
      lines.push(txt(mg + 8, y - 12, 7.5, `Account / Employee: ${accountTitle} (${accountType})`, 55, '/F2'))
      lines.push(txt(mg + 270, y - 12, 7.5, `Date Range: ${dateRangeLabel}`, 40, '/F2'))
      lines.push(txt(pW - mg - 95, y - 12, 7.5, `Filter: ${filterTypeLabel}`, 25, '/F1'))
      y -= 26

      // 3. Four Visible Account Balances (Snapshot Box)
      lines.push('0.92 0.94 0.98 rg')
      lines.push(`${mg} ${y - 28} ${usableW} 28 re f`)
      lines.push('0.78 0.84 0.92 RG 0.5 w')
      lines.push(`${mg} ${y - 28} ${usableW} 28 re s`)

      const colW = usableW / 4
      // Box 1: Staff Cash
      lines.push(txt(mg + 6, y - 11, 6.5, 'STAFF CASH (CUSTODY)', 24, '/F2'))
      lines.push('0.12 0.35 0.75 rg')
      lines.push(txt(mg + 6, y - 22, 9, `Rs.${fmt(staffCashTotal)}`, 16, '/F2'))
      lines.push('0 0 0 rg')

      // Box 2: Counter Drawer
      lines.push(txt(mg + colW + 6, y - 11, 6.5, 'COUNTER CASH DRAWER', 24, '/F2'))
      lines.push('0.05 0.55 0.25 rg')
      lines.push(txt(mg + colW + 6, y - 22, 9, `Rs.${fmt(counterTotal)}`, 16, '/F2'))
      lines.push('0 0 0 rg')

      // Box 3: Bank / UPI
      lines.push(txt(mg + colW * 2 + 6, y - 11, 6.5, 'BANK / UPI COLLECTIONS', 24, '/F2'))
      lines.push('0.85 0.45 0.05 rg')
      lines.push(txt(mg + colW * 2 + 6, y - 22, 9, `Rs.${fmt(bankTotal)}`, 16, '/F2'))
      lines.push('0 0 0 rg')

      // Box 4: Current / Closing Balance
      lines.push(txt(mg + colW * 3 + 6, y - 11, 6.5, 'ACCOUNT BALANCE', 24, '/F2'))
      lines.push('0.1 0.1 0.1 rg')
      lines.push(txt(mg + colW * 3 + 6, y - 22, 9, `Rs.${fmt(closingBalance)}`, 16, '/F2'))
      y -= 34

      // 4. Period Activity Metrics (3 Columns)
      lines.push('0.98 0.98 0.98 rg')
      lines.push(`${mg} ${y - 20} ${usableW} 20 re f`)
      lines.push('0.88 0.88 0.88 RG 0.5 w')
      lines.push(`${mg} ${y - 20} ${usableW} 20 re s`)

      lines.push('0.05 0.55 0.25 rg')
      lines.push(txt(mg + 8, y - 13, 7.5, `Total Inward (+): Rs.${fmt(totalInward + totalTransfersIn)}`, 30, '/F2'))

      lines.push('0.85 0.15 0.15 rg')
      lines.push(txt(mg + 185, y - 13, 7.5, `Total Outflow (-): Rs.${fmt(totalOutflow)}`, 30, '/F2'))

      lines.push('0.15 0.25 0.55 rg')
      lines.push(txt(mg + 360, y - 13, 7.5, `Net Movement: ${netMovement >= 0 ? '+' : ''}Rs.${fmt(netMovement)}`, 30, '/F2'))
      lines.push('0 0 0 rg')
      y -= 26
    } else {
      // Subsequent page compact header
      lines.push('0.4 0.4 0.4 rg')
      lines.push(txt(mg, y - 10, 7.5, `ANJANI WATER SUPPLIERS - Accounts & Cash Ledger (${accountTitle})`, 65, '/F2'))
      lines.push(txt(pW - mg - 70, y - 10, 7.5, `Page ${pageNum} of ${totalPages}`, 20, '/F1'))
      lines.push('0.8 0.8 0.8 RG 0.5 w')
      lines.push(`${mg} ${y - 14} ${usableW} 0.5 re f`)
      lines.push('0 0 0 rg')
      y -= 22
    }

    // Table Column Header Bar
    lines.push('0.10 0.18 0.32 rg')
    lines.push(`${mg} ${y - 3} ${usableW} ${rH} re f`)
    lines.push('1 1 1 rg')
    let hX = mg
    cHdr.forEach((h, i) => {
      const isAmt = i >= 6
      const xPos = isAmt ? hX + cW[i] - 3 - Math.min(h.length * 4, cW[i] - 4) : hX + 3
      lines.push(txt(xPos, y + 4, 6.5, h, 15, '/F2'))
      hX += cW[i]
    })
    lines.push('0 0 0 rg')
    y -= rH

    // Opening Balance Row on Page 1
    if (isFirstPage && Number(openingBalance) !== 0) {
      drawRow(
        lines,
        y,
        ['', '-', accountTitle, 'B/F', 'Opening Balance', 'Balance Brought Forward', '', '', `Rs.${fmt(openingBalance)}`],
        '0.93 0.95 0.98',
        '0.2 0.3 0.5',
        '/F2',
        6.5,
      )
      y -= rH
    }

    // Transaction rows
    pageRows.forEach((rowObj, ri) => {
      const bg = ri % 2 === 1 ? '0.97 0.97 0.98' : null
      let textCol = '0.1 0.1 0.1'
      if (rowObj.type === 'collection') textCol = '0 0.4 0.15'
      else if (rowObj.type === 'expense') textCol = '0.7 0.1 0.1'
      else if (rowObj.type === 'transfer') textCol = '0.1 0.25 0.65'

      drawRow(lines, y, rowObj.cells, bg, textCol, '/F1', 6.5)
      y -= rH
    })

    // Footer on each page
    lines.push('0.6 0.6 0.6 rg')
    lines.push(txt(mg, mg - 4, 6.5, 'Confidential - For Internal Management and Audit Only - Anjani Water Suppliers', 70))
    lines.push(txt(pW - mg - 60, mg - 4, 6.5, `Page ${pageNum} of ${totalPages}`, 20))
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Summary stream at bottom of last page
  const buildSummaryStream = () => {
    const lines = []
    const y = mg + 3 * rH + 4

    // Divider rule
    lines.push('0.7 0.7 0.7 RG 0.5 w')
    lines.push(`${mg} ${y + 2 * rH} ${usableW} 0.5 re f`)

    // Period Totals Row
    drawRow(
      lines,
      y + rH,
      [
        '',
        '',
        '',
        'TOTAL',
        'Period Net Totals',
        `${dataRows.length} entries`,
        fmt(totalInward + totalTransfersIn),
        fmt(totalOutflow),
        `Rs.${fmt(closingBalance)}`,
      ],
      '0.88 0.91 0.96',
      '0.08 0.15 0.3',
      '/F2',
      7,
    )

    // Signatures bar
    lines.push('0.4 0.4 0.4 rg')
    lines.push(txt(mg + 20, y - 6, 7, 'Prepared By: Staff Custodian / Accountant', 45, '/F1'))
    lines.push(txt(pW - mg - 180, y - 6, 7, 'Verified By: Jigneshbhai / Management', 45, '/F2'))
    lines.push('0.7 0.7 0.7 RG 0.5 w')
    lines.push(`${mg + 20} ${y + 6} 150 0.5 re f`)
    lines.push(`${pW - mg - 180} ${y + 6} 160 0.5 re f`)
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Calculate dynamic multi-page pagination
  const firstPageHeaderH = 40 + 8 + 20 + 6 + 28 + 6 + 20 + 6 + rH + (Number(openingBalance) !== 0 ? rH : 0)
  const summaryBlockH = 3 * rH + 20
  const rowsOnFirstPage = Math.max(
    1,
    Math.floor((pH - mg - firstPageHeaderH - summaryBlockH) / rH),
  )
  const subseqRowStartY = pH - mg - 24 - rH
  const rowsPerSubseqPage = Math.max(1, Math.floor((subseqRowStartY - (mg + rH * 2)) / rH))

  const pages = []
  if (dataRows.length <= rowsOnFirstPage) {
    pages.push(dataRows)
  } else {
    pages.push(dataRows.slice(0, rowsOnFirstPage))
    let off = rowsOnFirstPage
    while (off < dataRows.length) {
      pages.push(dataRows.slice(off, off + rowsPerSubseqPage))
      off += rowsPerSubseqPage
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

  const safeFilename = `Accounts_Ledger_${String(accountTitle).replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
  return new File([pdf], safeFilename, { type: 'application/pdf' })
}
