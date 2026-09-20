import { useState, useEffect } from 'react'
import { X, Save, Loader2, Calendar, IndianRupee, ArrowRightLeft, Receipt, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import { DEFAULT_ACCOUNTS } from '../constants/accounts'
import { useClientStore } from '../store/clientStore'

const EXPENSE_CATEGORIES = [
  'Salary',
  'Rent',
  'Electricity',
  'Fuel / Transport',
  'Maintenance',
  'Raw Material',
  'Packaging',
  'Miscellaneous',
]

export default function EditAccountEntryModal({ isOpen, onClose, entry, onSaveSuccess }) {
  const { updateAccountTransfer, updateAccountExpense, updatePaymentAccountEntry } = useClientStore()

  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  // Transfer specific
  const [fromAccount, setFromAccount] = useState('nilesh')
  const [toAccount, setToAccount] = useState('counter')
  // Expense / Payment specific
  const [accountId, setAccountId] = useState('counter')
  const [category, setCategory] = useState('General')

  useEffect(() => {
    if (!isOpen || !entry) return

    const raw = entry.rawDoc || {}
    setAmount(String(entry.amount || raw.amount || ''))

    // Date formatting for input type="date"
    let dStr = new Date().toISOString().slice(0, 10)
    const rawDate = entry.date || raw.date || raw.createdAt || entry.timestamp
    if (rawDate) {
      const d = rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate)
      if (!isNaN(d.getTime())) {
        dStr = d.toISOString().slice(0, 10)
      }
    }
    setDate(dStr)

    if (entry.type === 'transfer') {
      setFromAccount(raw.fromAccountId || entry.fromAccountId || 'nilesh')
      setToAccount(raw.toAccountId || entry.toAccountId || 'counter')
      setNotes(raw.notes || entry.note || '')
    } else if (entry.type === 'expense') {
      setAccountId(raw.accountId || entry.accountId || 'counter')
      setCategory(raw.category || entry.category || 'General')
      setNotes(raw.note || entry.note || '')
    } else {
      // collection / payment
      setAccountId(
        raw.accountId ||
        entry.accountId ||
        (raw.method === 'upi' || raw.method === 'online' ? 'bank' : 'counter')
      )
      setNotes(raw.note || entry.note || '')
    }
  }, [isOpen, entry])

  if (!isOpen || !entry) return null

  const rawDocId = entry.rawId || entry.id?.replace(/^(pay_|exp_|tr_out_|tr_in_)/, '')

  const handleSave = async (e) => {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error('Please enter a valid positive amount')
      return
    }

    setLoading(true)
    try {
      if (entry.type === 'transfer') {
        if (fromAccount === toAccount) {
          toast.error('Source and Destination accounts must be different')
          setLoading(false)
          return
        }
        await updateAccountTransfer(rawDocId, {
          fromAccountId: fromAccount,
          toAccountId: toAccount,
          amount: parsedAmount,
          notes: notes.trim(),
          date: date,
        })
        toast.success('Transfer updated successfully')
      } else if (entry.type === 'expense') {
        await updateAccountExpense(rawDocId, {
          accountId,
          amount: parsedAmount,
          category,
          note: notes.trim(),
          date: date,
        })
        toast.success('Expense updated successfully')
      } else {
        // collection / payment
        await updatePaymentAccountEntry(rawDocId, {
          amount: parsedAmount,
          note: notes.trim(),
          date: date,
          accountId,
        })
        toast.success('Payment updated successfully')
      }

      if (onSaveSuccess) onSaveSuccess()
      onClose()
    } catch (err) {
      console.error('Update entry failed:', err)
      toast.error(err.message || 'Failed to update entry')
    } finally {
      setLoading(false)
    }
  }

  const typeTitle =
    entry.type === 'transfer'
      ? 'Edit Cash Transfer / Handover'
      : entry.type === 'expense'
      ? 'Edit Expense Entry'
      : 'Edit Collection / Payment'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-white/10 text-[#ff9900]">
                {entry.type === 'transfer' ? (
                  <ArrowRightLeft size={16} />
                ) : entry.type === 'expense' ? (
                  <Receipt size={16} />
                ) : (
                  <IndianRupee size={16} />
                )}
              </span>
              <div>
                <h3 className="text-sm font-black leading-tight">{typeTitle}</h3>
                <p className="text-[10px] text-white/70 font-semibold truncate max-w-[240px]">
                  {entry.title || 'Record Entry'}
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
        <form onSubmit={handleSave} className="p-4 space-y-3.5">
          {/* Amount Input */}
          <div>
            <label
              htmlFor="editEntryAmount"
              className="block text-[11px] font-black uppercase text-gray-600 mb-1 tracking-wider"
            >
              Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-black">
                ₹
              </span>
              <input
                id="editEntryAmount"
                type="number"
                step="any"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-3 py-2 text-base font-black rounded-xl border border-gray-200 focus:border-[#ff9900] focus:ring-1 focus:ring-[#ff9900] outline-none"
              />
            </div>
          </div>

          {/* Account Selector(s) */}
          {entry.type === 'transfer' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="editFromAccountSelect"
                  className="block text-[10px] font-black uppercase text-gray-500 mb-1"
                >
                  From (Debited)
                </label>
                <select
                  id="editFromAccountSelect"
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  className="w-full text-xs font-bold rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none bg-gray-50"
                >
                  {DEFAULT_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="editToAccountSelect"
                  className="block text-[10px] font-black uppercase text-gray-500 mb-1"
                >
                  To (Credited)
                </label>
                <select
                  id="editToAccountSelect"
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  className="w-full text-xs font-bold rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none bg-gray-50"
                >
                  {DEFAULT_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label
                htmlFor="editAccountSelect"
                className="block text-[10px] font-black uppercase text-gray-500 mb-1"
              >
                Account
              </label>
              <select
                id="editAccountSelect"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full text-xs font-bold rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none bg-gray-50"
              >
                {DEFAULT_ACCOUNTS.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category (Expense only) */}
          {entry.type === 'expense' && (
            <div>
              <label
                htmlFor="editExpenseCategorySelect"
                className="block text-[10px] font-black uppercase text-gray-500 mb-1"
              >
                Category
              </label>
              <div className="flex gap-1.5">
                <select
                  id="editExpenseCategorySelect"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs font-bold rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none bg-gray-50"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label
              htmlFor="editEntryDate"
              className="block text-[10px] font-black uppercase text-gray-500 mb-1"
            >
              Date
            </label>
            <div className="relative">
              <input
                id="editEntryDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs font-bold rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none bg-gray-50"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="editEntryNotes"
              className="block text-[10px] font-black uppercase text-gray-500 mb-1"
            >
              Notes / Narration
            </label>
            <textarea
              id="editEntryNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarks or reason for edit..."
              rows={2}
              className="w-full text-xs font-medium rounded-xl border border-gray-200 p-2 focus:border-[#ff9900] outline-none resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-xl text-xs font-black uppercase bg-[#131921] hover:bg-black text-white flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save size={13} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
