// public/sw-share-target.js
// Handles Web Share Target Level 2 POST requests (e.g. shared GPay receipts, images, PDFs)

const SHARE_DB_NAME = 'anjani-share-store'
const SHARE_STORE_NAME = 'shared-items'
const SHARE_RECORD_KEY = 'latest-share'

function openShareDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'))
    }
    const request = indexedDB.open(SHARE_DB_NAME, 1)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveSharedRecord(data) {
  const db = await openShareDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite')
    const store = tx.objectStore(SHARE_STORE_NAME)
    const req = store.put(data, SHARE_RECORD_KEY)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Intercept POST requests targeting /share-target (from Android Share Sheet)
  if (
    event.request.method === 'POST' &&
    (url.pathname === '/share-target' || url.pathname.endsWith('/share-target'))
  ) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData()

          let sharedFile = null
          // 1. Look for file in 'share_file' or inspect form values for File/Blob
          const fileEntry = formData.get('share_file')
          if (
            fileEntry &&
            typeof fileEntry === 'object' &&
            (fileEntry instanceof File || fileEntry instanceof Blob)
          ) {
            sharedFile = fileEntry
          } else {
            for (const value of formData.values()) {
              if (
                value &&
                typeof value === 'object' &&
                (value instanceof File || value instanceof Blob)
              ) {
                sharedFile = value
                break
              }
            }
          }

          const title = formData.get('share_title') || formData.get('title') || ''
          const text = formData.get('share_text') || formData.get('text') || ''
          const shareUrl = formData.get('share_url') || formData.get('url') || ''

          // Store in IndexedDB for the app to pick up after redirect
          await saveSharedRecord({
            timestamp: Date.now(),
            hasFile: Boolean(sharedFile),
            file: sharedFile || null,
            fileName: sharedFile?.name || 'gpay_receipt.jpg',
            fileType: sharedFile?.type || 'image/jpeg',
            fileSize: sharedFile?.size || 0,
            title: String(title || ''),
            text: String(text || ''),
            url: String(shareUrl || ''),
          })

          // Notify any active open tabs/windows
          if (self.clients && self.clients.matchAll) {
            const clients = await self.clients.matchAll({
              type: 'window',
              includeUncontrolled: true,
            })
            for (const client of clients) {
              client.postMessage({ type: 'ANJANI_SHARE_TARGET_RECEIVED' })
            }
          }

          // HTTP 303: Redirects browser to GET /?shared=media
          return Response.redirect('/?shared=media', 303)
        } catch (err) {
          console.error('[sw-share-target] Failed to process POST share:', err)
          return Response.redirect('/?shared=error', 303)
        }
      })(),
    )
  }
})
