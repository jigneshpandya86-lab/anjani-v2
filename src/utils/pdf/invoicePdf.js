import { escapePdfText, createPdfFile } from './pdfCore'
import {
  jpegDataUrlToHex,
  buildUpiPayload,
  buildVectorQrStream,
  DEFAULT_UPI_ID,
  DEFAULT_PAYEE_NAME,
} from '../qrHelper'
export const buildSimpleInvoicePdfFile = ({
  order,
  clientName,
  mobile,
  paymentSettings = {},
}) => {
  const activePaymentSettings = paymentSettings || {}
  const rawItems =
    Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [
          {
            sku: order.sku || order.product || 'Anjani 200ml',
            qty: Number(order.qty) || 0,
            rate: Number(order.rate) || 0,
          },
        ]

  const items = rawItems.map((it) => {
    const skuName = it.sku || 'Anjani 200ml'
    const unit = skuName.toLowerCase().includes('anjani') ? 'Boxes' : 'Cases'
    const qty = Number(it.qty) || 0
    const rate = Number(it.rate) || 0
    return {
      sku: skuName,
      unit,
      qty,
      rate,
      amount: qty * rate,
      description: `${skuName} Supply`,
    }
  })

  const grandTotal =
    Number(order.totalAmount) || items.reduce((sum, it) => sum + it.amount, 0)
  const orderId = order.orderId || order.id || 'NA'
  const issuedAt = new Date().toLocaleString('en-IN')
  const invoiceDateTime = `${order.date || '-'} ${order.time || ''}`.trim()
  const clientAddress = String(order.address || '')
    .replace(/[\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  const textAt = (x, y, size, text) =>
    `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
  const boldAt = (x, y, size, text) =>
    `BT /F2 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`

  const tableHeaderY = clientAddress ? 606 : 622
  const rowHeight = 24
  const itemStreamLines = []
  let currentY = tableHeaderY

  items.forEach((item, idx) => {
    const rowY = currentY - rowHeight
    const bg = idx % 2 === 0 ? '0.96 0.96 0.96 rg' : '1 1 1 rg'
    itemStreamLines.push(
      bg,
      `40 ${rowY} 515 ${rowHeight} re f`,
      '0.88 0.88 0.88 RG',
      '0.5 w',
      `40 ${rowY} 515 ${rowHeight} re S`,
      '0 0 0 rg',
      textAt(52, rowY + 7, 9, item.description),
      textAt(305, rowY + 7, 9, `${item.qty} ${item.unit}`),
      textAt(385, rowY + 7, 9, `INR ${item.rate.toLocaleString('en-IN')}`),
      textAt(475, rowY + 7, 9, `INR ${item.amount.toLocaleString('en-IN')}`),
    )
    currentY = rowY
  })

  const totalBoxY = currentY - 45
  const footerStartY = totalBoxY - 20

  const qrHex = activePaymentSettings.qrImageDataUrl
    ? jpegDataUrlToHex(activePaymentSettings.qrImageDataUrl)
    : null
  const hasImageQr = Boolean(qrHex)

  let qrStreamLines = []
  if (hasImageQr) {
    // Draw image XObject inside the card
    qrStreamLines = [
      'q',
      `86 0 0 86 424 ${footerStartY - 114} cm`,
      '/Img1 Do',
      'Q',
    ]
  } else {
    // Vector QR fallback with exact invoice amount
    const upiPayload = buildUpiPayload({
      upiId: activePaymentSettings.upiId || DEFAULT_UPI_ID,
      payeeName: activePaymentSettings.payeeName || DEFAULT_PAYEE_NAME,
      amount: grandTotal,
      orderId: order.orderId || order.id || '',
    })
    const vectorQr = buildVectorQrStream(upiPayload, 424, footerStartY - 114, 86)
    qrStreamLines = [vectorQr]
  }

  const upiDisplay = activePaymentSettings.upiId || DEFAULT_UPI_ID

  const stream = [
    'q',
    // Header band (dark navy)
    '0.06 0.12 0.27 rg',
    '40 695 515 147 re f',

    // INVOICE title
    '1 1 1 rg',
    boldAt(52, 822, 22, 'INVOICE'),
    '0.8 0.85 0.95 rg',
    textAt(380, 822, 9, `Invoice #: ${orderId}`),
    textAt(380, 808, 9, `Issued: ${issuedAt}`),

    // BILL FROM
    '0.6 0.65 0.75 rg',
    textAt(52, 796, 8, 'BILL FROM'),
    '1 1 1 rg',
    boldAt(52, 782, 11, 'ANNAPURNA FOODS'),
    '0.85 0.88 0.93 rg',
    textAt(52, 768, 9, 'Shop No. 21, VR One Commercial Business Center'),
    textAt(52, 755, 9, 'Between Ajwa & Waghodia Chokadi'),
    textAt(52, 742, 9, 'Opp. L&T Knowledge City'),
    textAt(52, 729, 9, 'Vadodara, Gujarat 390019, India'),
    '0.7 0.75 0.83 rg',
    textAt(52, 716, 9, 'GSTIN: 24ABHFA6857D1ZI'),

    // BILL TO
    '0.5 0.5 0.5 rg',
    textAt(52, 683, 8, 'BILL TO'),
    '0 0 0 rg',
    boldAt(52, 669, 11, clientName || 'Unknown Client'),
    textAt(52, 655, 9, `Mobile: ${mobile || '-'}`),
    textAt(315, 669, 9, `Delivery: ${invoiceDateTime || '-'}`),
    textAt(315, 655, 9, `Status: ${order.status || '-'}`),
    ...(clientAddress
      ? ['0.35 0.35 0.35 rg', textAt(52, 641, 9, `Address: ${clientAddress}`), '0 0 0 rg']
      : []),

    // separator
    '0.8 0.8 0.8 RG',
    '0.5 w',
    `40 ${clientAddress ? 628 : 644} m 555 ${clientAddress ? 628 : 644} l S`,

    // ITEM TABLE HEADER
    '0.15 0.15 0.15 rg',
    `40 ${tableHeaderY} 515 20 re f`,
    '1 1 1 rg',
    textAt(52, tableHeaderY + 6, 9, 'Description'),
    textAt(305, tableHeaderY + 6, 9, 'Qty'),
    textAt(385, tableHeaderY + 6, 9, 'Rate'),
    textAt(475, tableHeaderY + 6, 9, 'Amount'),

    // ROWS
    ...itemStreamLines,

    // TOTAL BOX
    '0.92 0.92 0.92 rg',
    `350 ${totalBoxY} 205 36 re f`,
    '0.75 0.75 0.75 RG',
    '1 w',
    `350 ${totalBoxY} 205 36 re S`,
    '0 0 0 rg',
    textAt(362, totalBoxY + 13, 10, 'Total'),
    boldAt(440, totalBoxY + 13, 12, `INR ${grandTotal.toLocaleString('en-IN')}`),

    // FOOTER
    '0.7 0.7 0.7 RG',
    '1 w',
    `40 ${footerStartY} m 555 ${footerStartY} l S`,

    // Notes
    '0.4 0.4 0.4 rg',
    boldAt(40, footerStartY - 13, 9, 'Notes'),
    '0 0 0 rg',
    textAt(40, footerStartY - 27, 9, 'Thanks for your business.'),

    // Bank details
    '0.8 0.8 0.8 RG',
    '0.5 w',
    `40 ${footerStartY - 40} m 365 ${footerStartY - 40} l S`,
    '0.4 0.4 0.4 rg',
    boldAt(40, footerStartY - 53, 9, "Company's Bank Details"),
    '0 0 0 rg',
    textAt(40, footerStartY - 67, 9, 'Bank Name: Kotak Mahindra Bank'),
    textAt(40, footerStartY - 81, 9, 'Account Holder: Annapurna Foods'),
    textAt(40, footerStartY - 95, 9, 'IFSC Code: KKBK0002748'),
    textAt(40, footerStartY - 109, 9, 'Account Number: 1712426768'),

    // Contact
    '0.8 0.8 0.8 RG',
    '0.5 w',
    `40 ${footerStartY - 121} m 365 ${footerStartY - 121} l S`,
    '0 0 0 rg',
    textAt(40, footerStartY - 134, 9, 'Contact Number: 9925997750'),

    // SCAN & PAY CARD
    '1 1 1 rg',
    `380 ${footerStartY - 142} 175 136 re f`,
    '0.82 0.82 0.82 RG',
    '1 w',
    `380 ${footerStartY - 142} 175 136 re S`,
    '0.06 0.12 0.27 rg',
    `380 ${footerStartY - 22} 175 16 re f`,
    '1 1 1 rg',
    boldAt(410, footerStartY - 18, 8, 'SCAN & PAY (GPAY / UPI)'),

    ...qrStreamLines,

    '0.4 0.4 0.4 rg',
    boldAt(398, footerStartY - 126, 6.5, 'Google Pay • PhonePe • Paytm • BHIM'),
    '0.1 0.1 0.1 rg',
    textAt(388, footerStartY - 137, 7, `UPI: ${upiDisplay}`),

    'Q',
  ].join('\n')

  const objects = []
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj')
  objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj')
  objects.push(
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${
      hasImageQr ? ' /XObject << /Img1 7 0 R >>' : ''
    } >> >> endobj`,
  )
  objects.push(`4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`)
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj')
  objects.push('6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj')
  if (hasImageQr) {
    objects.push(
      `7 0 obj << /Type /XObject /Subtype /Image /Width 300 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${qrHex.length} >> stream\n${qrHex}\nendstream endobj`,
    )
  }

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((obj) => {
    offsets.push(pdf.length)
    pdf += `${obj}\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return createPdfFile(pdf, `invoice-${orderId}.pdf`)
}
