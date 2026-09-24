import { useState, useEffect } from 'react'
import { WifiOff, CheckCircle2 } from 'lucide-react'

export default function NetworkStatusBar() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true,
  )
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    let reconnectTimeout = null

    const handleOnline = () => {
      setIsOnline(true)
      setShowReconnected(true)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      reconnectTimeout = setTimeout(() => {
        setShowReconnected(false)
      }, 3500)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowReconnected(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [])

  if (isOnline && !showReconnected) {
    return null
  }

  return (
    <aside
      aria-label="Network Status"
      className="w-full transition-all duration-300 animate-in fade-in slide-in-from-top-1"
    >
      {!isOnline ? (
        <div className="bg-[#131921] border-b border-amber-500/40 px-3 py-1.5 flex items-center justify-center gap-2 shadow-xs">
          <WifiOff size={13} className="text-amber-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-bold text-amber-300">Offline Mode</span>
          <span className="text-[10px] text-gray-400 font-medium">· Changes saved locally</span>
        </div>
      ) : (
        <div className="bg-[#131921] border-b border-emerald-500/40 px-3 py-1.5 flex items-center justify-center gap-2 shadow-xs">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <span className="text-[11px] font-bold text-emerald-300">Online</span>
          <span className="text-[10px] text-gray-400 font-medium">· Synced with server</span>
        </div>
      )}
    </aside>
  )
}
