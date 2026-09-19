import { useState, useEffect } from 'react'
import { useClientStore } from '../store/clientStore'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'
import { IndianRupee, ArrowRight, X, Check, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'

export default function CashHandoverModal({
  isOpen,
  onClose,
  initialSource = 'nilesh',
  accountsSummary = {},
}) {
  const recordAccountTransfer = useClientStore((state) => state.recordAccountTransfer)

  const [fromAccountId, setFromAccountId] = useState(initialSource)
  const [toAccountId, setToAccountId] = useState('counter')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFromAccountId(initialSource || 'nilesh')
      // If from is counter, default to bank or nilesh; otherwise default to counter
      setToAccountId(initialSource === 'counter' ? 'bank' : 'counter')
      setAmount('')
      setNotes('')
      setDate(new Date().toISOString().slice(0, 10))
    }
  }, [isOpen, initialSource])

  if (!isOpen) return null

  const currentSourceBalance = Number(accountsSummary[fromAccountId] || 0)
  const enteredAmount = Number(amount) || 0
  const remainingBalance = currentSourceBalance - enteredAmount

  const fromMeta = getAccountMeta(fromAccountId)
  const toMeta = getAccountMeta(toAccountId)

  const handleQuickAmount = (val) => {
    setAmount(String(val))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!enteredAmount || enteredAmount <= 0) {
      toast.error('Please enter a valid handover amount')
      return
    }
    if (fromAccountId === toAccountId) {
      toast.error('Source and Destination accounts must be different')
      return
    }

    // Confirmation if transferring more than current balance
    if (currentSourceBalance > 0 && enteredAmount > currentSourceBalance) {
      const confirmed = window.confirm(
        `Note: Handover amount (₹${enteredAmount.toLocaleString('en-IN')}) is higher than ${fromMeta.name}'s recorded balance (₹${currentSourceBalance.toLocaleString('en-IN')}). Proceed anyway?`,
      )
      if (!confirmed) return
    }

    setSubmitting(true)
    try {
      await recordAccountTransfer({
        fromAccountId,
        toAccountId,
        amount: enteredAmount,
        notes,
        date: new Date(`${date}T12:00:00`),
      })

      toast.success(
        `₹${enteredAmount.toLocaleString('en-IN')} handed over from ${fromMeta.shortLabel} to ${toMeta.shortLabel}`,
      )
      onClose()
    } catch (err) {
      console.error('Handover failed:', err)
      toast.error('Transfer failed: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-white/10 text-white backdrop-blur-xs">
                <ArrowRightLeft size={18} />
              </div>
              <div>
                <h2 className="text-base font-black leading-tight">Cash Handover / Journal Transfer</h2>
                <p className="text-[11px] text-white/70 font-semibold">
                  Transfer or settle cash between staff, drawer & bank
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* Transfer Flow Visual */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3">
            <div className="grid grid-cols-2 gap-2 items-center">
              {/* From Account */}
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  From (Staff / Cashier)
                </span>
                <select
                  value={fromAccountId}
                  onChange={(e) => {
                    const newFrom = e.target.value
                    setFromAccountId(newFrom)
                    if (newFrom === toAccountId) {
                      setToAccountId(newFrom === 'counter' ? 'bank' : 'counter')
                    }
                  }}
                  className="w-full px-2.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#ff9900]"
                >
                  {DEFAULT_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-bold">
                  <span className="text-gray-400">Balance:</span>
                  <span
                    className={currentSourceBalance > 0 ? 'text-blue-600' : 'text-gray-600'}
                  >
                    ₹{currentSourceBalance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* To Account */}
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  To (Received By)
                </span>
                <select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full px-2.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#ff9900]"
                >
                  {DEFAULT_ACCOUNTS.filter((acc) => acc.id !== fromAccountId).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-bold">
                  <span className="text-gray-400">Balance:</span>
                  <span className="text-emerald-600">
                    ₹{(Number(accountsSummary[toAccountId]) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Section */}
          <div className="space-y-2">
            <label
              htmlFor="handover-amount"
              className="block text-xs font-black text-gray-700 uppercase tracking-wider"
            >
              Handover Amount (₹)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-gray-400 font-bold text-lg">₹</span>
              <input
                id="handover-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                min="1"
                step="any"
                className="w-full pl-9 pr-4 py-3 bg-white border-2 border-gray-200 rounded-2xl text-xl font-black outline-none focus:border-[#ff9900] focus:ring-2 focus:ring-[#ff9900]/20 transition-all"
              />
            </div>

            {/* Quick Shortcut Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {currentSourceBalance > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(currentSourceBalance)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
                  >
                    All (₹{currentSourceBalance.toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(Math.floor(currentSourceBalance / 2))}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all"
                  >
                    50% (₹{Math.floor(currentSourceBalance / 2).toLocaleString('en-IN')})
                  </button>
                </>
              )}
              {[500, 1000, 2000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-all"
                >
                  ₹{val.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            {/* Partial Handover Remaining Balance Indicator */}
            {enteredAmount > 0 && currentSourceBalance > 0 && (
              <div
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between ${
                  remainingBalance >= 0
                    ? 'bg-blue-50 text-blue-800 border-blue-100'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span>Remaining with {fromMeta.shortLabel}:</span>
                <span className="text-sm font-black">
                  ₹{remainingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="handover-date"
                className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1"
              >
                Date
              </label>
              <input
                id="handover-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#ff9900]"
              />
            </div>
            <div>
              <label
                htmlFor="handover-notes"
                className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1"
              >
                Notes (Optional)
              </label>
              <input
                id="handover-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Evening route settlement"
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-[#ff9900]"
              />
            </div>
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={submitting || !enteredAmount}
            className="w-full bg-[#131921] hover:bg-black text-white py-3 rounded-2xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              'Processing Transfer…'
            ) : (
              <>
                <Check size={16} /> Confirm Handover (₹{enteredAmount.toLocaleString('en-IN')})
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
