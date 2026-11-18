import React, { useEffect } from 'react'
import { X, ChevronRight } from 'lucide-react'

/**
 * WhatsApp Banking-Style Secondary Action Sheet
 * Renders an ultra-compact, numbered action tray when tapping any card in Anjani AI.
 */
export default function CardActionSheet({
  isOpen,
  onClose,
  title = 'Card Actions',
  subtitle = '',
  itemSummary = null,
  actions = [],
}) {
  // Listen for keyboard ESC and numeric key presses (1-9)
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= actions.length) {
        const targetAction = actions[num - 1]
        if (targetAction && !targetAction.disabled) {
          e.preventDefault()
          targetAction.onSelect?.()
          onClose?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, actions, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title & Dismiss */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-3 text-white flex items-center justify-between shadow-2xs">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded text-white">
                Quick Actions
              </span>
              <h3 className="text-sm font-bold truncate">{title}</h3>
            </div>
            {subtitle && (
              <p className="text-[11px] text-amber-100 truncate mt-0.5 font-medium">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss action menu"
            className="h-7 w-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item Summary Card (if provided) */}
        {itemSummary && (
          <div className="bg-amber-50/70 border-b border-amber-200/70 px-4 py-2 text-xs flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-bold text-gray-900 block truncate">
                {itemSummary.title}
              </span>
              {itemSummary.detail && (
                <span className="text-[11px] text-gray-600 block truncate font-medium">
                  {itemSummary.detail}
                </span>
              )}
            </div>
            {itemSummary.badge && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-amber-200 text-amber-900 shrink-0">
                {itemSummary.badge}
              </span>
            )}
          </div>
        )}

        {/* Action List (WhatsApp Banking Style [1], [2], [3] with 2-3 words) */}
        <div className="p-3 overflow-y-auto space-y-1.5 divide-y divide-gray-100">
          {actions.map((act, index) => {
            const num = act.number || index + 1
            const isDisabled = Boolean(act.disabled)

            return (
              <button
                key={act.id || index}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    act.onSelect?.()
                    onClose?.()
                  }
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer pt-2.5 ${
                  isDisabled
                    ? 'opacity-40 cursor-not-allowed bg-gray-50'
                    : 'hover:bg-amber-50/80 active:bg-amber-100/80 hover:shadow-2xs border border-transparent hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* WhatsApp Banking Numbered Badge */}
                  <span className="h-6 w-6 rounded-lg bg-gray-900 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    {num}
                  </span>

                  {/* Strictly 2-3 Word Label */}
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-gray-900 block truncate">
                      {act.label}
                    </span>
                    {act.description && (
                      <span className="text-[10px] text-gray-500 block truncate">
                        {act.description}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 ml-2" />
              </button>
            )
          })}
        </div>

        {/* Bottom Dismiss Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>💡 Tap or type number (1-{actions.length})</span>
          <button
            type="button"
            onClick={onClose}
            className="font-bold text-gray-700 hover:text-black px-2.5 py-1 rounded bg-gray-200 hover:bg-gray-300 transition-colors cursor-pointer text-xs"
          >
            ✕ Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
