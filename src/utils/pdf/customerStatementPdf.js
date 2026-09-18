import { san, fmt, resolveTimestamp } from './pdfCore'

/**
 * Purpose-built customer ledger statement PDF:
 * Dr / Cr / Running Balance with clean A4 multi-page pagination.
 */
export const buildLedgerPdf = ({ clientName, dateRangeLabel, txns, openingBalance }) => {
  // A4 portrait geometry
  const pW = 595,
    pH = 842,
    mg = 36
  const usableW = pW - mg * 2 // 523

  // Column widths (must sum to usableW = 523)
  const cW = [22, 58, 52, 68, 68, 72, 183] // Sr | Date | Type | Dr | Cr | Balance | Narration
  const cHdr = ['Sr', 'Date', 'Type', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Narration']
  const rH = 18

  const txt = (x, y, size, t, maxLen) =>
    `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t, maxLen)}) Tj ET`

  const drawRow = (lines, y, cells, bg, textRgb = '0 0 0') => {
    if (bg) {
      lines.push(`${bg} rg`)
      lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
    }
    lines.push(`${textRgb} rg`)
    let xOff = mg
    const maxLens = [4, 12, 9, 10, 10, 10, 42]
    cells.forEach((cell, i) => {
      lines.push(txt(xOff + 3, y + 4, 7, cell, maxLens[i]))
      xOff += cW[i]
    })
    lines.push('0 0 0 rg')
  }

  // Compute forward running balance rows
  let balance = openingBalance
  const dataRows = txns.map((tx, idx) => {
    const amount = Number(tx.amount || 0)
    let dr = '',
      cr = ''
    if (tx.type === 'invoice') {
      balance += Math.abs(amount)
      dr = fmt(Math.abs(amount))
    } else if (tx.type === 'payment') {
      balance -= Math.abs(amount)
      cr = fmt(Math.abs(amount))
    } else {
      if (amount < 0) {
        balance += Math.abs(amount)
        dr = fmt(Math.abs(amount))
      } else {
        balance -= amount
        cr = fmt(amount)
      }
    }
    const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
    const dateStr = txDate ? txDate.toLocaleDateString('en-IN') : '-'
    const typeLabel =
      tx.type === 'invoice' ? 'Invoice' : tx.type === 'payment' ? 'Payment' : 'Reversal'
    return [
      String(idx + 1),
      dateStr,
      typeLabel,
      dr,
      cr,
      `Rs.${fmt(balance)}`,
      tx.narration || '-',
    ]
  })

  const closingBalance = balance
  const totalDr = txns.reduce(
    (s, tx) => (tx.type === 'invoice' ? s + Math.abs(Number(tx.amount || 0)) : s),
    0,
  )
  const totalCr = txns.reduce(
    (s, tx) => (tx.type === 'payment' ? s + Math.abs(Number(tx.amount || 0)) : s),
    0,
  )

  const buildPageStream = (pageRows, isFirstPage) => {
    const lines = []
    let y = pH - mg - 20

    if (isFirstPage) {
      // Title
      lines.push('0.08 0.08 0.08 rg')
      lines.push(txt(mg, y, 13, 'Ledger Statement', 40))
      y -= 18
      lines.push('0.4 0.4 0.4 rg')
      lines.push(
        txt(
          mg,
          y,
          8,
          `Generated: ${new Date().toLocaleString('en-IN').replace(/[^\x20-\x7E]/g, '')}`,
          50,
        ),
      )
      y -= 13
      lines.push(txt(mg, y, 8, `Client: ${clientName || 'All Clients'}`, 50))
      y -= 13
      lines.push(txt(mg, y, 8, `Period: ${dateRangeLabel}`, 50))
      y -= 13
      lines.push('0 0 0 rg')
      y -= 10

      // Divider rule
      lines.push('0.8 0.8 0.8 RG')
      lines.push('0.5 w')
      lines.push(`${mg} ${y} m ${pW - mg} ${y} l S`)
      y -= 8
    }

    // Column header bar (drawn on every page)
    lines.push('0.15 0.2 0.35 rg')
    lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
    lines.push('1 1 1 rg')
    let hX = mg
    cHdr.forEach((h, i) => {
      lines.push(txt(hX + 3, y + 4, 7, h, 15))
      hX += cW[i]
    })
    lines.push('0 0 0 rg')
    y -= rH

    // Opening balance row (first page only)
    if (isFirstPage) {
      drawRow(
        lines,
        y,
        ['', '', 'Opening Bal.', '', '', `Rs.${fmt(openingBalance)}`, 'B/F Balance'],
        '0.93 0.95 0.98',
        '0.2 0.3 0.5',
      )
      y -= rH
    }

    // Data rows
    pageRows.forEach((row, ri) => {
      const bg = ri % 2 === 1 ? '0.97 0.97 0.97' : null
      drawRow(lines, y, row, bg)
      y -= rH
    })

    return lines.join('\n')
  }

  // Summary box
  const buildSummaryStream = () => {
    const lines = []
    let y = mg + 2 * rH + 4
    // Total Debits / Credits row
    drawRow(
      lines,
      y + rH,
      ['', '', 'Period Total', fmt(totalDr), fmt(totalCr), '', ''],
      '0.88 0.9 0.94',
      '0.1 0.1 0.1',
    )
    // Closing Balance row
    drawRow(
      lines,
      y,
      [
        '',
        '',
        'Closing Bal.',
        '',
        '',
        `Rs.${fmt(closingBalance)}`,
        closingBalance < 0 ? 'Advance' : 'Outstanding',
      ],
      '0.2 0.5 0.2',
      '1 1 1',
    )

    return lines.join('\n')
  }

  // Pagination
  const firstPageHeaderH = 20 + 18 + 13 + 13 + 13 + 10 + 8 + rH
  const rowsOnFirstPage = Math.max(
    1,
    Math.floor((pH - mg - firstPageHeaderH - (mg + rH * 2)) / rH),
  )
  const subseqRowStartY = pH - mg - 20 - rH
  const rowsPerSubseqPage = Math.max(1, Math.floor((subseqRowStartY - (mg + rH * 2)) / rH))

  const pages = []
  pages.push(dataRows.slice(0, rowsOnFirstPage))
  let off = rowsOnFirstPage
  while (off < dataRows.length) {
    pages.push(dataRows.slice(off, off + rowsPerSubseqPage))
    off += rowsPerSubseqPage
  }

  const streams = pages.map((pr, i) => buildPageStream(pr, i === 0))
  streams[streams.length - 1] += '\n' + buildSummaryStream()

  // Assemble PDF structure
  const fontObjNum = 3 + pages.length * 2
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
  const objs = []
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj`)
  streams.forEach((stream, i) => {
    const enc = new TextEncoder().encode(stream)
    objs.push(
      `${3 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj`,
    )
    objs.push(
      `${4 + i * 2} 0 obj\n<< /Length ${enc.length} >>\nstream\n${stream}\nendstream\nendobj`,
    )
  })
  objs.push(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`)

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

  return new File([pdf], 'ledger.pdf', { type: 'application/pdf' })
}
