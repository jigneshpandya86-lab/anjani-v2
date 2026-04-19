const RELOAD_FLAG = 'anjani-preload-error-reloaded'

export function isDynamicImportFailure(error) {
  if (!error) return false
  const message = typeof error === 'string' ? error : error.message || ''
  return /Failed to fetch dynamically imported module/i.test(message)
    || /Importing a module script failed/i.test(message)
    || /error loading dynamically imported module/i.test(message)
}

export function installPreloadErrorHandler() {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadOnce()
  })

  window.addEventListener('error', (event) => {
    if (isDynamicImportFailure(event.error)) {
      reloadOnce()
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isDynamicImportFailure(event.reason)) {
      reloadOnce()
    }
  })
}

function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return
    sessionStorage.setItem(RELOAD_FLAG, '1')
  } catch {
    // sessionStorage unavailable: allow reload anyway
  }
  window.location.reload()
}
