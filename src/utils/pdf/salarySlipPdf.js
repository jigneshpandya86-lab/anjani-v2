import { san, fmt, resolveTimestamp, createPdfFile, formatSalaryMonth } from './pdfCore'

/**
 * Generates an official, branded Staff Salary Slip & Advance Statement PDF
 */
export function buildSalarySlipPdf({
  employee,
  settlement,
  advances = [],
}) {
  const pW = 595,
    pH = 842,
    mg = 36
  const usableW = pW - mg * 2 // 523

  const txt = (x, y, size, t, maxLen = 60, font = '/F1') =>
    `BT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t, maxLen)}) Tj ET`

  const lines = []
  let y = pH - mg - 10

  // 1. Company Brand Header
  lines.push('0.06 0.12 0.27 rg') // Deep Navy
  lines.push(`${mg} ${y - 32} ${usableW} 40 re f`)
  lines.push('1 1 1 rg')
  lines.push(txt(mg + 14, y - 14, 13, 'ANNAPURNA FOODS - STAFF SALARY SLIP', 45, '/F2'))
  lines.push(txt(mg + 14, y - 26, 7.5, 'Authorized Distributorship for Anjani & Bailey Packaged Water, Vadodara', 65, '/F1'))

  y -= 45

  // 2. Employee & Period Info Box
  lines.push('0.97 0.98 0.99 rg')
  lines.push(`${mg} ${y - 38} ${usableW} 38 re f`)
  lines.push('0.85 0.88 0.92 RG')
  lines.push(`${mg} ${y - 38} ${usableW} 38 re S`)

  const monthLabel = settlement.month ? formatSalaryMonth(settlement.month) : 'Current Period'
  const payoutDateStr = settlement.payoutDate
    ? (resolveTimestamp(settlement.payoutDate) || new Date()).toLocaleDateString('en-IN')
    : new Date().toLocaleDateString('en-IN')

  lines.push('0.1 0.1 0.1 rg')
  lines.push(txt(mg + 10, y - 14, 9, `Employee: ${employee.name || 'Nilesh'}`, 35, '/F2'))
  lines.push(txt(mg + 10, y - 24, 7.5, `Designation: ${employee.role || 'Delivery Staff & Driver'}`, 35))
  lines.push(txt(mg + 10, y - 33, 7, `Contact: +91 ${employee.mobile || '9925997750'}`, 30))

  lines.push(txt(mg + 300, y - 14, 8.5, `Salary Month: ${monthLabel}`, 30, '/F2'))
  lines.push(txt(mg + 300, y - 24, 7.5, `Disbursed Date: ${payoutDateStr}`, 30))
  lines.push(txt(mg + 300, y - 33, 7, `Payment Mode: ${String(settlement.payoutAccountId || 'counter').toUpperCase()}`, 30))

  y -= 52

  // 3. Earnings vs. Deductions Grid (2 Columns)
  const colW = (usableW - 10) / 2 // ~256
  const colH = 110

  // Earnings Box (Left)
  lines.push('0.95 0.99 0.96 rg') // Soft green
  lines.push(`${mg} ${y - colH} ${colW} ${colH} re f`)
  lines.push('0.7 0.88 0.74 RG')
  lines.push(`${mg} ${y - colH} ${colW} ${colH} re S`)

  lines.push('0.1 0.5 0.2 rg')
  lines.push(txt(mg + 10, y - 14, 9, 'EARNINGS', 20, '/F2'))
  lines.push('0.2 0.2 0.2 rg')

  let ey = y - 30
  const baseSal = Number(settlement.baseSalary || employee.baseSalary || 0)
  const inc = Number(settlement.incentives || 0)
  const ot = Number(settlement.overtime || 0)
  const gross = settlement.grossEarnings || baseSal + inc + ot

  lines.push(txt(mg + 10, ey, 7.5, 'Basic Monthly Salary:'))
  lines.push(txt(mg + colW - 55, ey, 7.5, `Rs. ${fmt(baseSal)}`, 15, '/F2'))
  ey -= 16

  lines.push(txt(mg + 10, ey, 7.5, 'Incentives & Performance:'))
  lines.push(txt(mg + colW - 55, ey, 7.5, `Rs. ${fmt(inc)}`, 15))
  ey -= 16

  lines.push(txt(mg + 10, ey, 7.5, 'Overtime & Delivery Bonus:'))
  lines.push(txt(mg + colW - 55, ey, 7.5, `Rs. ${fmt(ot)}`, 15))
  ey -= 24

  // Total Gross Line
  lines.push('0.15 0.5 0.25 rg')
  lines.push(`${mg + 8} ${ey + 12} ${colW - 16} 0.5 re f`)
  lines.push(txt(mg + 10, ey, 8.5, 'Total Gross Earnings:', 25, '/F2'))
  lines.push(txt(mg + colW - 60, ey, 8.5, `Rs. ${fmt(gross)}`, 15, '/F2'))

  // Deductions Box (Right)
  const dX = mg + colW + 10
  lines.push('0.99 0.95 0.95 rg') // Soft rose
  lines.push(`${dX} ${y - colH} ${colW} ${colH} re f`)
  lines.push('0.92 0.75 0.75 RG')
  lines.push(`${dX} ${y - colH} ${colW} ${colH} re S`)

  lines.push('0.7 0.15 0.15 rg')
  lines.push(txt(dX + 10, y - 14, 9, 'DEDUCTIONS', 20, '/F2'))
  lines.push('0.2 0.2 0.2 rg')

  let dy = y - 30
  const advDed = Number(settlement.advancesDeducted || 0)
  const othDed = Number(settlement.otherDeductions || 0)
  const totalDed = settlement.totalDeductions || advDed + othDed

  lines.push(txt(dX + 10, dy, 7.5, 'Salary Advances Recovered:'))
  lines.push(txt(dX + colW - 55, dy, 7.5, `Rs. ${fmt(advDed)}`, 15, '/F2'))
  dy -= 16

  lines.push(txt(dX + 10, dy, 7.5, 'Leaves & Other Deductions:'))
  lines.push(txt(dX + colW - 55, dy, 7.5, `Rs. ${fmt(othDed)}`, 15))
  dy -= 16

  lines.push(txt(dX + 10, dy, 7.5, 'Taxes / PF (if applicable):'))
  lines.push(txt(dX + colW - 55, dy, 7.5, 'Rs. 0', 15))
  dy -= 24

  // Total Deductions Line
  lines.push('0.7 0.2 0.2 rg')
  lines.push(`${dX + 8} ${dy + 12} ${colW - 16} 0.5 re f`)
  lines.push(txt(dX + 10, dy, 8.5, 'Total Deductions:', 25, '/F2'))
  lines.push(txt(dX + colW - 60, dy, 8.5, `-Rs. ${fmt(totalDed)}`, 15, '/F2'))

  y -= colH + 15

  // 4. Net Salary Highlight Bar
  const netPaid = Number(settlement.netPaid || gross - totalDed)
  lines.push('0.06 0.45 0.35 rg') // Rich emerald
  lines.push(`${mg} ${y - 32} ${usableW} 34 re f`)
  lines.push('1 1 1 rg')
  lines.push(txt(mg + 14, y - 14, 9, 'NET SALARY DISBURSED', 30, '/F2'))
  lines.push(txt(mg + 14, y - 25, 7.5, 'Transferred / Handed over in full settlement', 45, '/F1'))
  lines.push(txt(mg + usableW - 130, y - 20, 15, `Rs. ${fmt(netPaid)}`, 20, '/F2'))

  y -= 45

  // 5. Itemized Advances Table (if any)
  if (Array.isArray(advances) && advances.length > 0) {
    lines.push('0.1 0.1 0.1 rg')
    lines.push(txt(mg, y, 9, 'Advances Settled In This Slip:', 40, '/F2'))
    y -= 14

    // Table Header
    const tW = [30, 75, 110, 80, 228]
    lines.push('0.92 0.94 0.96 rg')
    lines.push(`${mg} ${y - 4} ${usableW} 16 re f`)
    lines.push('0.2 0.2 0.2 rg')
    let xH = mg
    const headers = ['Sr', 'Date', 'Amount', 'Disbursed Via', 'Note / Reason']
    headers.forEach((h, idx) => {
      lines.push(txt(xH + 3, y + 2, 7, h, 25, '/F2'))
      xH += tW[idx]
    })
    y -= 16

    // Rows (up to 8 items to stay strictly on page 1)
    advances.slice(0, 8).forEach((adv, idx) => {
      const rowBg = idx % 2 === 0 ? '0.98 0.98 0.99' : '1 1 1'
      lines.push(`${rowBg} rg`)
      lines.push(`${mg} ${y - 3} ${usableW} 14 re f`)
      lines.push('0.2 0.2 0.2 rg')

      const advDate = resolveTimestamp(adv.date) || resolveTimestamp(adv.createdAt)
      const dStr = advDate ? advDate.toLocaleDateString('en-IN') : '-'
      const srcLabel =
        adv.sourceAccountId === 'bank'
          ? 'Bank / UPI'
          : adv.sourceAccountId === 'custody_deduction'
          ? 'Route Cash'
          : 'Counter Cash'

      let xC = mg
      const cells = [
        String(idx + 1),
        dStr,
        `Rs. ${fmt(adv.amount)}`,
        srcLabel,
        adv.note || 'Advance',
      ]
      cells.forEach((c, cIdx) => {
        lines.push(txt(xC + 3, y + 2, 6.5, c, 38))
        xC += tW[cIdx]
      })
      y -= 14
    })
    y -= 10
  }

  // 6. Signatures & Confirmation
  const sigY = Math.max(y - 30, mg + 45)
  lines.push('0.7 0.7 0.7 RG')
  lines.push(`${mg + 30} ${sigY + 18} 140 0.5 re S`)
  lines.push(`${mg + usableW - 170} ${sigY + 18} 140 0.5 re S`)

  lines.push('0.3 0.3 0.3 rg')
  lines.push(txt(mg + 45, sigY + 6, 7.5, `Employee: ${employee.name || 'Nilesh'}`, 30, '/F2'))
  lines.push(txt(mg + 55, sigY - 4, 6.5, '(Signature / Receiver)', 25))

  lines.push(txt(mg + usableW - 165, sigY + 6, 7.5, 'Authorized Signatory (Jignesh Pandya)', 35, '/F2'))
  lines.push(txt(mg + usableW - 145, sigY - 4, 6.5, 'Annapurna Foods, Vadodara', 30))

  // Construct PDF Output
  const streamContent = lines.join('\n')
  const streamLength = new TextEncoder().encode(streamContent).length

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`,
    `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`,
  ]

  let offset = 9
  const xref = ['xref', '0 7', '0000000000 65535 f ']
  const body = objects
    .map((obj) => {
      const pos = offset
      xref.push(String(pos).padStart(10, '0') + ' 00000 n ')
      offset += new TextEncoder().encode(obj + '\n').length
      return obj
    })
    .join('\n')

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`
  const rawPdf = `%PDF-1.4\n${body}\n${xref.join('\n')}\n${trailer}`

  const safeEmp = String(employee.name || 'Nilesh').replace(/\s+/g, '_')
  const safeMonth = String(settlement.month || 'Settlement').replace(/-/g, '_')
  const filename = `Salary_Slip_${safeEmp}_${safeMonth}.pdf`

  return createPdfFile(rawPdf, filename)
}
