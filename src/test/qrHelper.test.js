import { describe, it, expect } from "vitest"
import {
  buildUpiPayload,
  jpegDataUrlToHex,
  buildVectorQrStream,
  DEFAULT_UPI_ID,
  DEFAULT_PAYEE_NAME,
} from "../utils/qrHelper"

describe("QR & UPI Helper", () => {
  it("generates correct UPI URI payload", () => {
    const payload = buildUpiPayload({
      upiId: "9925997750@okbizaxis",
      payeeName: "Annapurna Foods",
      amount: 1950,
      orderId: "ORD-101",
    })
    expect(payload).toContain("upi://pay?")
    expect(payload).toContain("pa=9925997750%40okbizaxis")
    expect(payload).toContain("pn=Annapurna%20Foods")
    expect(payload).toContain("am=1950.00")
    expect(payload).toContain("cu=INR")
    expect(payload).toContain("tn=Invoice%20ORD-101")
  })

  it("handles default values gracefully when arguments are missing", () => {
    const payload = buildUpiPayload({})
    expect(payload).toContain(encodeURIComponent(DEFAULT_UPI_ID))
    expect(payload).toContain(encodeURIComponent(DEFAULT_PAYEE_NAME))
  })

  it("converts JPEG base64 data URL to hex stream format", () => {
    const testJpgBase64 =
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
    const hex = jpegDataUrlToHex(testJpgBase64)
    expect(hex).toBeTruthy()
    expect(hex).toMatch(/^[0-9a-f]+ >\n$/)
    expect(hex.startsWith("ffd8ff")).toBe(true)
  })

  it("generates non-empty vector QR stream lines", () => {
    const payload = "upi://pay?pa=test@okaxis&pn=Test&am=100.00&cu=INR"
    const stream = buildVectorQrStream(payload, 100, 100, 50)
    expect(stream).toBeTruthy()
    expect(stream).toContain("0 0 0 rg")
    expect(stream).toContain("re f")
  })
})
