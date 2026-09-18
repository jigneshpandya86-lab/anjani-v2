import toast from 'react-hot-toast'

/**
 * Escapes characters with special meaning in PDF literal strings.
 */
export const escapePdfText = (text) =>
  String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')

/**
 * Sanitizes strings for PDF Type1 Helvetica (ASCII only, Rs. replacement).
 */
export const san = (t, maxLen = 60) =>
  String(t ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .slice(0, maxLen)

/**
 * Formats numbers into Indian numbering string.
 */
export const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

/**
 * Resolves a Firestore Timestamp OR cached plain object into a JS Date, or null.
 */
export const resolveTimestamp = (ts) => {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts.seconds) return new Date(ts.seconds * 1000)
  if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts)
  return null
}

/**
 * Detects mobile browser or native Capacitor environment.
 */
export const isMobileOrNative =
  Boolean(window?.Capacitor?.isNativePlatform?.()) ||
  /Android|iPhone|iPad/i.test(navigator.userAgent)

/**
 * Converts a raw PDF string into a File/Blob compatible with modern & legacy mobile WebViews.
 */
export const createPdfFile = (pdfText, filename) => {
  const bytes = new TextEncoder().encode(pdfText)
  const blob = new Blob([bytes], { type: 'application/pdf' })
  try {
    return new File([blob], filename, { type: 'application/pdf' })
  } catch {
    blob.name = filename
    return blob
  }
}

/**
 * Shares PDF via native mobile share sheet (WhatsApp, Drive, etc.) or falls back to direct download.
 */
export const shareOrDownloadPdf = async (file, shareTitle = '', shareText = '') => {
  try {
    const canShareWithFile = Boolean(
      navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] })),
    )
    if (canShareWithFile) {
      await navigator.share({ title: shareTitle, text: shareText, files: [file] })
      toast.success('PDF ready — select WhatsApp or any app to share.')
      return
    }
  } catch (err) {
    if (err?.name === 'AbortError') return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file?.name || 'document.pdf'
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => {
    if (!document.hidden) {
      window.open(url, '_blank', 'noopener')
    }
  }, 150)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success('PDF generated.')
}
