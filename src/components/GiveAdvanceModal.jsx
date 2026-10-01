import React, { useState } from 'react'
import { X, DollarSign, Calendar, FileText, Wallet, Building2, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'

export default function GiveAdvanceModal({ isOpen, onClose, employee, accountsSummary }) {
  const recordStaffAdvance = useClientStore((state) => state.recordStaffAdvance)

  const [amount, setAmount] = useState('')
  const [sourceAccountId, setSourceAccountId] = useState('counter')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !employee) return null

  const counterBal = Number(accountsSummary?.counter || 0)
  const bankBal = Number(accountsSummary?.bank || 0)
  const custodyBal = Number(accountsSummary?.[employee.id] || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const numAmount = Number(amount)
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid advance amount')
      return
    }

    setIsSubmitting(true)
    try {
      await recordStaffAdvance({
        employeeId: employee.id,
        employeeName: employee.name,
        amount: numAmount,
        sourceAccountId,
        date: new Date(date),
        note,
      })
      toast.success(`₹${numAmount.toLocaleString('en-IN')} advance recorded for ${employee.name}`)
      onClose()
    } catch (err) {
      console.error('Failed to record advance:', err)
      toast.error(err.message || 'Failed to record advance')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <DollarSign size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">Give Salary Advance</h2>
              <p className="text-xs text-blue-100">
                Staff: <span className="font-bold text-white">{employee.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Advance Amount (₹) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-base">
                ₹
              </span>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full pl-8 pr-3.5 py-2.5 text-base font-black rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-gray-900 placeholder:font-normal placeholder:text-gray-300"
                autoFocus
              />
            </div>
          </div>

          {/* Source Account Options */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Disbursed From (Source) *
            </label>
            <div className="space-y-2">
              {/* Option 1: Counter Cash Drawer */}
              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  sourceAccountId === 'counter'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="sourceAccountId"
                    value="counter"
                    checked={sourceAccountId === 'counter'}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="sr-only"
                  />
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Counter Cash Drawer</p>
                    <p className="text-[10px] text-gray-500">Paid in cash from office drawer</p>
                  </div>
                </div>
                <span className="text-xs font-black text-emerald-700">
                  ₹{counterBal.toLocaleString('en-IN')}
                </span>
              </label>

              {/* Option 2: Bank / Online UPI */}
              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  sourceAccountId === 'bank'
                    ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="sourceAccountId"
                    value="bank"
                    checked={sourceAccountId === 'bank'}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="sr-only"
                  />
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Bank / Online UPI</p>
                    <p className="text-[10px] text-gray-500">Transferred via GPay / PhonePe / NEFT</p>
                  </div>
                </div>
                <span className="text-xs font-black text-orange-700">
                  ₹{bankBal.toLocaleString('en-IN')}
                </span>
              </label>

              {/* Option 3: Custody Retain (Route Cash Deduction) */}
              <label
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  sourceAccountId === 'custody_deduction'
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name="sourceAccountId"
                    value="custody_deduction"
                    checked={sourceAccountId === 'custody_deduction'}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="sr-only"
                  />
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Truck size={16} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Retain from Cash Custody</p>
                    <p className="text-[10px] text-gray-500">Kept from customer delivery collections</p>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-700">
                  ₹{custodyBal.toLocaleString('en-IN')}
                </span>
              </label>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Advance Date
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Calendar size={15} />
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs font-medium rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900"
              />
            </div>
          </div>

          {/* Reason / Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Reason / Narration (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-400">
                <FileText size={15} />
              </span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Diwali advance, family emergency, bike repair"
                className="w-full pl-9 pr-3.5 py-2 text-xs font-medium rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Recording…' : 'Record Advance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
