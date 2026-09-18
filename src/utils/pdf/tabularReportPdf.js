import { san, createPdfFile } from './pdfCore'

/**
 * Builds a multi-page tabular PDF report from column/row data.
 * Ideal for stock statements and inventory logs.
 */
export const buildTabularReportPdf = ({
  title,
  columns,
  rows,
  metadata = [],
  filename = 'report.pdf',
  columnWidths = null,
}) => {
  const txt = (x, y, size, t) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t)}) Tj ET`
  const pW = 595,
    pH = 842,
    mg = 36,
    usableW = pW - mg * 2

  const calculatedWidths =
    columnWidths && columnWidths.length === columns.length
      ? columnWidths.map((w) => w * usableW)
      : columns.map(() => usableW / Math.max(columns.length, 1))

  const getColX = (index) => {
    let x = mg
    for (let i = 0; i < index; i++) {
      x += calculatedWidths[i]
    }
    return x
  }

  const rH = 18

  const buildPageStream = (pageRows, isFirstPage) => {
    const lines = []
    let y = pH - mg - 20

    if (isFirstPage) {
      lines.push(txt(mg, y, 14, title))
      y -= 20
      lines.push('0.5 0.5 0.5 rg')
      lines.push(
        txt(
          mg,
          y,
          8,
          `Generated: ${new Date().toLocaleString('en-IN').replace(/[^\x20-\x7E]/g, '')}`,
        ),
      )
      lines.push('0 0 0 rg')
      y -= 14
      for (const m of metadata.filter(Boolean)) {
        lines.push('0.5 0.5 0.5 rg')
        lines.push(txt(mg, y, 8, m))
        lines.push('0 0 0 rg')
        y -= 12
      }
      y -= 6
    }

    // Column header bar
    lines.push('0.2 0.2 0.2 rg')
    lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
    lines.push('1 1 1 rg')
    columns.forEach((col, i) => lines.push(txt(getColX(i) + 4, y + 4, 7, col)))
    lines.push('0 0 0 rg')
    y -= rH

    pageRows.forEach((row, ri) => {
      if (ri % 2 === 0) {
        lines.push('0.95 0.95 0.95 rg')
        lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
        lines.push('0 0 0 rg')
      }
      row.forEach((cell, i) => lines.push(txt(getColX(i) + 4, y + 4, 7, cell)))
      y -= rH
    })

    return lines.join('\n')
  }

  const metaCount = metadata.filter(Boolean).length
  const firstPageRowStartY = pH - mg - 20 - 20 - 14 - metaCount * 12 - 6 - rH
  const rowsOnFirstPage = Math.max(1, Math.floor((firstPageRowStartY - (mg + rH)) / rH))

  const subseqRowStartY = pH - mg - 20 - rH
  const rowsPerSubsequentPage = Math.max(1, Math.floor((subseqRowStartY - (mg + rH)) / rH))

  const pages = []
  pages.push(rows.slice(0, rowsOnFirstPage))
  let offset = rowsOnFirstPage
  while (offset < rows.length) {
    pages.push(rows.slice(offset, offset + rowsPerSubsequentPage))
    offset += rowsPerSubsequentPage
  }

  const streams = pages.map((pageRows, i) => buildPageStream(pageRows, i === 0))

  const fontObjNum = 3 + pages.length * 2
  const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')

  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    `2 0 obj << /Type /Pages /Count ${pages.length} /Kids [${pageKids}] >> endobj`,
  ]
  pages.forEach((_, i) => {
    objs.push(
      `${3 + i * 2} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >> endobj`,
    )
    objs.push(
      `${4 + i * 2} 0 obj << /Length ${streams[i].length} >> stream\n${streams[i]}\nendstream endobj`,
    )
  })
  objs.push(`${fontObjNum} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`)

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objs.forEach((obj) => {
    offsets.push(pdf.length)
    pdf += `${obj}\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objs.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return createPdfFile(pdf, filename)
}
