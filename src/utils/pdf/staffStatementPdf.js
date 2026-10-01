import { san, fmt, resolveTimestamp, formatSalaryMonth } from './pdfCore'

/**
 * Builds an official, branded Staff Salary & Advance Ledger Statement PDF for any selected period.
 * Summarizes advances taken, salary deductions, carry-forward balances, and net employee liability.
 */
export function buildStaffStatementPdf({
  employee = {},
  dateRangeLabel = 'Selected Period',
  startDate,
  endDate,
  advances = [],
  salarySettlements = [],
}) {
  const pW = 595
  const pH = 842
  const mg = 32
  const usableW = pW - mg * 2 // 531 pt

  // Column definitions for ledger table (Total = 531 pt)
  // Sr(22) + Date(60) + Particulars(145) + Mode(54) + Advance(60) + Settled(60) + Balance(60) + Note(70) = 531
  const cW = [22, 60, 145, 54, 60, 60, 60, 70]
  const cHdr = [
    'Sr',
    'Date',
    'Particulars / Event',
    'Mode',
    'Advance (+)',
    'Settled (-)',
    'Advance Bal',
    'Notes / Ref',
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
    const maxLens = [4, 12, 34, 12, 12, 12, 12, 16]
    cells.forEach((cell, i) => {
      // Right align monetary columns: Advance(+), Settled(-), Advance Bal
      const isAmt = i >= 4 && i <= 6
      const cellText = String(cell ?? '')
      const xPos = isAmt
        ? xOff + cW[i] - 3 - Math.min(cellText.length * 3.6, cW[i] - 4)
        : xOff + 3
      lines.push(txt(xPos, y + 4, fontSize, cellText, maxLens[i], font))
      xOff += cW[i]
    })
    lines.push('0 0 0 rg')
  }

  const getMillis = (obj) => {
    if (!obj) return 0
    if (typeof obj.toDate === 'function') return obj.toDate().getTime()
    if (obj.seconds) return obj.seconds * 1000
    if (obj instanceof Date) return obj.getTime()
    if (typeof obj === 'string' || typeof obj === 'number') return new Date(obj).getTime()
    return 0
  }

  const startMs = startDate ? new Date(startDate).getTime() : 0
  const endMs = endDate ? new Date(endDate).getTime() : Infinity

  // 1. Calculate opening advance balance before startDate
  let openingAdvance = 0
  advances.forEach((adv) => {
    const t = getMillis(adv.date) || getMillis(adv.createdAt)
    if (t < startMs && !adv.isCarryForward) {
      openingAdvance += Number(adv.amount || 0)
    }
  })
  salarySettlements.forEach((sal) => {
    const t = getMillis(sal.payoutDate) || getMillis(sal.settledAt)
    if (t < startMs) {
      openingAdvance -= Number(sal.advancesDeducted || 0)
    }
  })
  openingAdvance = Math.max(0, openingAdvance)

  // 2. Collect transactions within period
  const rawEvents = []

  advances.forEach((adv) => {
    const t = getMillis(adv.date) || getMillis(adv.createdAt)
    if (t >= startMs && t <= endMs) {
      const isCF = Boolean(adv.isCarryForward)
      rawEvents.push({
        millis: t,
        date: resolveTimestamp(adv.date) || resolveTimestamp(adv.createdAt) || new Date(t),
        type: isCF ? 'carry_forward' : 'advance',
        particulars: isCF ? 'Advance Balance Carried Forward' : 'Salary Advance Disbursed',
        mode:
          adv.sourceAccountId === 'bank'
            ? 'Bank / UPI'
            : adv.sourceAccountId === 'custody_deduction'
            ? 'Route Custody'
            : 'Counter Cash',
        advanceGiven: Number(adv.amount || 0),
        salarySettled: 0,
        note: adv.note || (isCF ? 'Carry-forward balance' : 'Advance to staff'),
      })
    }
  })

  salarySettlements.forEach((sal) => {
    const t = getMillis(sal.payoutDate) || getMillis(sal.settledAt)
    if (t >= startMs && t <= endMs) {
      const monthLabel = sal.month ? formatSalaryMonth(sal.month) : 'Salary'
      rawEvents.push({
        millis: t,
        date: resolveTimestamp(sal.payoutDate) || resolveTimestamp(sal.settledAt) || new Date(t),
        type: 'settlement',
        particulars: `Salary Settled (${monthLabel})`,
        mode: String(sal.payoutAccountId || 'counter').toUpperCase(),
        advanceGiven: 0,
        salarySettled: Number(sal.advancesDeducted || 0),
        note: `Gross ₹${fmt(sal.grossEarnings || sal.baseSalary)} | Net ₹${fmt(sal.netPaid)}${
          sal.note ? ` | ${sal.note}` : ''
        }`,
      })
    }
  })

  // Sort chronologically
  rawEvents.sort((a, b) => a.millis - b.millis)

  // 3. Compute running balance and summary totals
  let runningBal = openingAdvance
  let totalAdvancesPeriod = 0
  let totalSettledPeriod = 0

  const dataRows = rawEvents.map((ev, idx) => {
    runningBal += ev.advanceGiven - ev.salarySettled
    if (ev.type !== 'carry_forward') {
      totalAdvancesPeriod += ev.advanceGiven
    }
    totalSettledPeriod += ev.salarySettled

    const dateStr = ev.date
      ? ev.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '-'

    return {
      type: ev.type,
      cells: [
        idx + 1,
        dateStr,
        ev.particulars,
        ev.mode,
        ev.advanceGiven > 0 ? `Rs.${fmt(ev.advanceGiven)}` : '-',
        ev.salarySettled > 0 ? `Rs.${fmt(ev.salarySettled)}` : '-',
        `Rs.${fmt(Math.max(0, runningBal))}`,
        ev.note,
      ],
    }
  })

  const closingAdvanceBalance = Math.max(0, runningBal)

  // 4. Build PDF Streams
  const buildPageStream = (pageRows, isFirstPage, pageNum, totalPages) => {
    const lines = []
    let y = pH - mg

    if (isFirstPage) {
      // 1. Top Brand Banner
      lines.push('0.06 0.13 0.28 rg')
      lines.push(`${mg} ${y - 42} ${usableW} 42 re f`)
      lines.push('1 1 1 rg')
      lines.push(txt(mg + 12, y - 16, 13, 'ANNAPURNA FOODS - STAFF ADVANCE STATEMENT', 48, '/F2'))
      lines.push(
        txt(
          mg + 12,
          y - 30,
          7.5,
          'Authorized Distributorship for Anjani & Bailey Packaged Water, Vadodara',
          70,
          '/F1',
        ),
      )
      lines.push(
        txt(
          pW - mg - 170,
          y - 20,
          7.5,
          `Generated: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString(
            'en-IN',
            { hour: '2-digit', minute: '2-digit', hour12: true },
          )}`,
          38,
          '/F1',
        ),
      )
      lines.push(txt(pW - mg - 170, y - 31, 7.5, 'Official Staff Advance Passbook', 35, '/F1'))
      lines.push('0 0 0 rg')
      y -= 50

      // 2. Employee Profile & Statement Parameters
      lines.push('0.96 0.97 0.99 rg')
      lines.push(`${mg} ${y - 32} ${usableW} 32 re f`)
      lines.push('0.85 0.88 0.92 RG 0.5 w')
      lines.push(`${mg} ${y - 32} ${usableW} 32 re s`)
      lines.push('0.1 0.1 0.1 rg')

      lines.push(
        txt(mg + 8, y - 13, 8.5, `Staff: ${employee.name || 'Nilesh'} (${employee.role || 'Delivery Staff'})`, 40, '/F2'),
      )
      lines.push(txt(mg + 8, y - 25, 7.5, `Contact: +91 ${employee.mobile || '9925997750'}`, 30, '/F1'))

      lines.push(txt(mg + 280, y - 13, 8, `Statement Period: ${dateRangeLabel}`, 35, '/F2'))
      lines.push(
        txt(
          mg + 280,
          y - 25,
          7.5,
          `Base Monthly Salary: Rs.${fmt(employee.baseSalary || 15000)}`,
          35,
          '/F1',
        ),
      )
      y -= 38

      // 3. Three Metric Summary Boxes
      lines.push('0.94 0.96 0.99 rg')
      lines.push(`${mg} ${y - 30} ${usableW} 30 re f`)
      lines.push('0.8 0.85 0.92 RG 0.5 w')
      lines.push(`${mg} ${y - 30} ${usableW} 30 re s`)

      const colW = usableW / 3
      // Box 1: Total Advances Given
      lines.push(txt(mg + 8, y - 11, 7, 'TOTAL ADVANCES IN PERIOD (+)', 28, '/F2'))
      lines.push('0.75 0.15 0.15 rg')
      lines.push(txt(mg + 8, y - 23, 10, `Rs.${fmt(totalAdvancesPeriod)}`, 16, '/F2'))
      lines.push('0 0 0 rg')

      // Box 2: Total Settled via Salary
      lines.push(txt(mg + colW + 8, y - 11, 7, 'SALARY ADVANCES SETTLED (-)', 28, '/F2'))
      lines.push('0.05 0.55 0.25 rg')
      lines.push(txt(mg + colW + 8, y - 23, 10, `Rs.${fmt(totalSettledPeriod)}`, 16, '/F2'))
      lines.push('0 0 0 rg')

      // Box 3: Net Active Advance
      lines.push(txt(mg + colW * 2 + 8, y - 11, 7, 'NET OUTSTANDING ADVANCE', 28, '/F2'))
      lines.push(closingAdvanceBalance > 0 ? '0.85 0.3 0.05 rg' : '0.1 0.1 0.1 rg')
      lines.push(txt(mg + colW * 2 + 8, y - 23, 10, `Rs.${fmt(closingAdvanceBalance)}`, 16, '/F2'))
      lines.push('0 0 0 rg')
      y -= 36
    } else {
      // Subsequent page compact header
      lines.push('0.4 0.4 0.4 rg')
      lines.push(
        txt(
          mg,
          y - 10,
          7.5,
          `ANNAPURNA FOODS - Staff Statement: ${employee.name || 'Nilesh'} (${dateRangeLabel})`,
          65,
          '/F2',
        ),
      )
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
      const isAmt = i >= 4 && i <= 6
      const xPos = isAmt ? hX + cW[i] - 3 - Math.min(h.length * 4, cW[i] - 4) : hX + 3
      lines.push(txt(xPos, y + 4, 6.5, h, 15, '/F2'))
      hX += cW[i]
    })
    lines.push('0 0 0 rg')
    y -= rH

    // Opening Balance Row on Page 1 (if starting with previous balance)
    if (isFirstPage && openingAdvance > 0) {
      drawRow(
        lines,
        y,
        ['', '-', 'Opening Advance Balance B/F', '-', '-', '-', `Rs.${fmt(openingAdvance)}`, 'Balance brought forward'],
        '0.95 0.95 0.98',
        '0.2 0.3 0.5',
        '/F2',
        6.5,
      )
      y -= rH
    }

    // Data rows
    pageRows.forEach((rowObj, ri) => {
      const bg = ri % 2 === 1 ? '0.98 0.98 0.99' : null
      let textCol = '0.1 0.1 0.1'
      if (rowObj.type === 'advance') textCol = '0.7 0.1 0.1'
      else if (rowObj.type === 'settlement') textCol = '0.05 0.45 0.2'
      else if (rowObj.type === 'carry_forward') textCol = '0.75 0.35 0.05'

      drawRow(lines, y, rowObj.cells, bg, textCol, '/F1', 6.5)
      y -= rH
    })

    // Footer on each page
    lines.push('0.6 0.6 0.6 rg')
    lines.push(
      txt(
        mg,
        mg - 4,
        6.5,
        'Staff Salary & Advance Ledger - Confidential - Annapurna Foods, Vadodara',
        70,
      ),
    )
    lines.push(txt(pW - mg - 60, mg - 4, 6.5, `Page ${pageNum} of ${totalPages}`, 20))
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Summary and Signatures Stream for bottom of final page
  const buildSummaryStream = () => {
    const lines = []
    const y = mg + 3 * rH + 16

    // Divider line
    lines.push('0.7 0.7 0.7 RG 0.5 w')
    lines.push(`${mg} ${y + 2 * rH} ${usableW} 0.5 re f`)

    // Period Totals Row
    drawRow(
      lines,
      y + rH,
      [
        '',
        '',
        'NET TOTALS',
        `${dataRows.length} entries`,
        fmt(totalAdvancesPeriod),
        fmt(totalSettledPeriod),
        `Rs.${fmt(closingAdvanceBalance)}`,
        'Closing Balance',
      ],
      '0.88 0.91 0.96',
      '0.08 0.15 0.3',
      '/F2',
      7,
    )

    // Employee Declaration Text
    lines.push('0.3 0.3 0.3 rg')
    lines.push(
      txt(
        mg,
        y - 2,
        6.5,
        `Declaration: I confirm that I have reviewed the above advance entries and agree with the closing advance balance of Rs.${fmt(closingAdvanceBalance)}.`,
        85,
        '/F1',
      ),
    )

    // Signatures bar
    lines.push('0.4 0.4 0.4 rg')
    lines.push(txt(mg + 20, y - 20, 7, `Employee Signature (${employee.name || 'Staff'})`, 40, '/F2'))
    lines.push(txt(pW - mg - 170, y - 20, 7, 'Authorized Signatory (Annapurna Foods)', 40, '/F2'))
    lines.push('0.7 0.7 0.7 RG 0.5 w')
    lines.push(`${mg + 20} ${y - 8} 140 0.5 re f`)
    lines.push(`${pW - mg - 170} ${y - 8} 150 0.5 re f`)
    lines.push('0 0 0 rg')

    return lines.join('\n')
  }

  // Pagination calculation
  const firstPageHeaderH = 42 + 8 + 32 + 6 + 30 + 6 + rH + (openingAdvance > 0 ? rH : 0)
  const summaryBlockH = 3 * rH + 34
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

  // Standard PDF 1.4 catalog and objects
  const fontRegularNum = 3 + pages.length * 2
  const fontBoldNum = 4 + pages.length * 2
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  const objs = []

  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj`)

  streams.forEach((stream, i) => {
    const enc = new TextEncoder().encode(stream)
    objs.push(
      `${3 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Contents ${
        4 + i * 2
      } 0 R /Resources << /Font << /F1 ${fontRegularNum} 0 R /F2 ${fontBoldNum} 0 R >> >> >>\nendobj`,
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

  const safeEmpName = String(employee.name || 'Staff').replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeFilename = `Staff_Statement_${safeEmpName}_${new Date().toISOString().slice(0, 10)}.pdf`
  return new File([pdf], safeFilename, { type: 'application/pdf' })
}
