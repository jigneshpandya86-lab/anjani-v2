import QRCode from "qrcode"
import jsQR from "jsqr"

export const DEFAULT_UPI_ID = "9925997750@okbizaxis"
export const DEFAULT_PAYEE_NAME = "Annapurna Foods"

/**
 * Builds standard UPI payment URI
 */
export function buildUpiPayload({ upiId = DEFAULT_UPI_ID, payeeName = DEFAULT_PAYEE_NAME, amount = 0, orderId = "" }) {
  const safeUpi = String(upiId || DEFAULT_UPI_ID).trim()
  const safeName = String(payeeName || DEFAULT_PAYEE_NAME).trim()
  const numAmount = Number(amount) || 0
  const orderRef = orderId ? "Invoice " + String(orderId).trim() : "Annapurna Foods Invoice"

  let uri = `upi://pay?pa=${encodeURIComponent(safeUpi)}&pn=${encodeURIComponent(safeName)}`
  if (numAmount > 0) {
    uri += `&am=${numAmount.toFixed(2)}&cu=INR`
  }
  uri += `&tn=${encodeURIComponent(orderRef)}`
  return uri
}

/**
 * Converts a JPEG data URL to a hex string for PDF /ASCIIHexDecode /DCTDecode filter
 */
export function jpegDataUrlToHex(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  let binaryString = ''
  if (typeof atob === 'function') {
    binaryString = atob(base64)
  } else if (typeof globalThis !== 'undefined' && globalThis.Buffer) {
    binaryString = globalThis.Buffer.from(base64, 'base64').toString('binary')
  }

  let hex = ""
  for (let i = 0; i < binaryString.length; i += 1) {
    hex += binaryString.charCodeAt(i).toString(16).padStart(2, "0")
  }
  return hex + " >\n"
}

/**
 * Generates vector PDF drawing stream for a QR code
 */
export function buildVectorQrStream(payload, startX, startY, totalSize) {
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: "M" })
    const count = qr.modules.size
    const modSize = Number((totalSize / count).toFixed(3))
    const lines = ["0 0 0 rg"]

    for (let r = 0; r < count; r += 1) {
      let startC = -1
      for (let c = 0; c < count; c += 1) {
        const isDark = qr.modules.get(r, c)
        if (isDark && startC === -1) {
          startC = c
        } else if (!isDark && startC !== -1) {
          const w = Number(((c - startC) * modSize).toFixed(3))
          const h = modSize
          const rx = Number((startX + startC * modSize).toFixed(3))
          const ry = Number((startY + (count - 1 - r) * modSize).toFixed(3))
          lines.push(`${rx} ${ry} ${w} ${h} re f`)
          startC = -1
        }
      }
      if (startC !== -1) {
        const w = Number(((count - startC) * modSize).toFixed(3))
        const h = modSize
        const rx = Number((startX + startC * modSize).toFixed(3))
        const ry = Number((startY + (count - 1 - r) * modSize).toFixed(3))
        lines.push(`${rx} ${ry} ${w} ${h} re f`)
      }
    }
    return lines.join("\n")
  } catch (err) {
    console.error("Failed to build vector QR stream:", err)
    return ""
  }
}

/**
 * Processes an uploaded image file into a square 300x300 white-padded JPEG
 * and scans for any embedded UPI QR code using jsQR.
 */
export async function processUploadedQrFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided"))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read image file"))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Invalid image format"))
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = 300
          canvas.height = 300
          const ctx = canvas.getContext("2d")

          // Fill white background
          ctx.fillStyle = "#ffffff"
          ctx.fillRect(0, 0, 300, 300)

          // Center image with padding
          const padding = 10
          const maxDim = 300 - padding * 2
          const scale = Math.min(maxDim / img.width, maxDim / img.height)
          const drawW = img.width * scale
          const drawH = img.height * scale
          const drawX = (300 - drawW) / 2
          const drawY = (300 - drawH) / 2
          ctx.drawImage(img, drawX, drawY, drawW, drawH)

          let detectedUpiId = null
          let detectedPayee = null
          let rawQrPayload = null

          try {
            const imgData = ctx.getImageData(0, 0, 300, 300)
            const code = jsQR(imgData.data, 300, 300)
            if (code && code.data) {
              rawQrPayload = code.data
              if (code.data.startsWith("upi://")) {
                try {
                  const url = new URL(code.data.replace(/^upi:\/\/pay\?/, "https://dummy.com/?"))
                  detectedUpiId = url.searchParams.get("pa")
                  detectedPayee = url.searchParams.get("pn")
                } catch {
                  const paMatch = code.data.match(/[?&]pa=([^&]+)/)
                  if (paMatch) detectedUpiId = decodeURIComponent(paMatch[1])
                  const pnMatch = code.data.match(/[?&]pn=([^&]+)/)
                  if (pnMatch) detectedPayee = decodeURIComponent(pnMatch[1])
                }
              }
            }
          } catch (scanErr) {
            console.warn("jsQR scan error:", scanErr)
          }

          const dataUrl = canvas.toDataURL("image/jpeg", 0.88)
          resolve({
            dataUrl,
            detectedUpiId,
            detectedPayee,
            rawQrPayload,
            width: 300,
            height: 300,
          })
        } catch (canvasErr) {
          reject(canvasErr)
        }
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
