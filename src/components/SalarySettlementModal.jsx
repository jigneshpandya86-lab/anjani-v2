import React, { useState, useMemo } from 'react'
import { X, CheckCircle, Calculator, Wallet, Building2, Calendar, FileText, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import { formatSalaryMonth, calculateSalaryBreakdown } from '../services/staffSalaryService'

export default function SalarySettlementModal({
  isOpen,
  onClose,
  employee,
  activeAdvances = [],
  accountsSummary,
  onSettled,
}) {
  const settleStaffSalary = useClientStore((state) => state.settleStaffSalary)

  // Default to previous month if today is <= 10th of the month, else current month
  const defaultMonth = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth() // 0-indexed
    if (now.getDate() <= 10) {
      const prevDate = new Date(y, m - 1, 1)
      return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    }
    return `${y}-${String(m + 1).padStart(2, '0')}`
  }, [])

  const [month, setMonth] = useState(defaultMonth)
  const [baseSalary, setBaseSalary] = useState(() => employee?.baseSalary || 15000)
  const [incentives, setIncentives] = useState('')
  const [overtime, setOvertime] = useState('')
  const [otherDeductions, setOtherDeductions] = useState('')

  // Sum of unsettled advances
  const totalActiveAdvances = useMemo(() => {
    if (Array.isArray(activeAdvances) && activeAdvances.length > 0) {
      return activeAdvances
        .filter((adv) => adv.status === 'active' || !adv.status)
        .reduce((sum, adv) => sum + (Number(adv.amount) || 0), 0)
    }
    return Number(employee?.advanceBalance || 0)
  }, [activeAdvances, employee])

  const grossEarningsTemp =
    (Number(baseSalary) || 0) + (Number(incentives) || 0) + (Number(overtime) || 0)
  const maxDeductible = Math.max(0, grossEarningsTemp - (Number(otherDeductions) || 0))

  // Default advancesDeducted capped at maxDeductible so excess carries forward automatically
  const [advancesDeducted, setAdvancesDeducted] = useState(() =>
    Math.min(totalActiveAdvances, maxDeductible),
  )
  const [payoutAccountId, setPayoutAccountId] = useState('counter')
  const [payoutDate, setPayoutDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Re-sync advancesDeducted if totalActiveAdvances or maxDeductible changes
  React.useEffect(() => {
    const capped = Math.min(totalActiveAdvances, maxDeductible)
    setAdvancesDeducted(capped)
  }, [totalActiveAdvances, maxDeductible])

  if (!isOpen || !employee) return null

  const counterBal = Number(accountsSummary?.counter || 0)
  const bankBal = Number(accountsSummary?.bank || 0)

  const { grossEarnings, totalDeductions, netPayable } = calculateSalaryBreakdown({
    baseSalary,
    incentives: Number(incentives) || 0,
    overtime: Number(overtime) || 0,
    advancesDeducted: Number(advancesDeducted) || 0,
    otherDeductions: Number(otherDeductions) || 0,
  })

  // Carry-forward advance liability (unrecovered balance that stays active)
  const carryForwardAdvance = Math.max(
    0,
    totalActiveAdvances - (Number(advancesDeducted) || 0),
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!month) {
      toast.error('Please select salary month')
      return
    }

    const deductedNum = Number(advancesDeducted) || 0
    if (deductedNum > grossEarnings) {
      toast.error(
        `Advance deduction cannot exceed gross salary (₹${grossEarnings.toLocaleString(
          'en-IN',
        )}). Excess advance will automatically carry forward to next month.`,
      )
      return
    }

    setIsSubmitting(true)
    try {
      const activeList = activeAdvances.filter(
        (adv) => adv.status === 'active' || !adv.status,
      )
      const activeIds = activeList.map((adv) => adv.id)

      const result = await settleStaffSalary({
        employeeId: employee.id,
        employeeName: employee.name,
        month,
        baseSalary: Number(baseSalary) || 0,
        incentives: Number(incentives) || 0,
        overtime: Number(overtime) || 0,
        advancesDeducted: deductedNum,
        otherDeductions: Number(otherDeductions) || 0,
        payoutAccountId,
        payoutDate: new Date(payoutDate),
        note,
        activeAdvanceIds: activeIds,
        activeAdvances: activeList,
      })

      toast.success(
        `Salary for ${formatSalaryMonth(month)} settled! Net paid: ₹${netPayable.toLocaleString(
          'en-IN',
        )}${carryForwardAdvance > 0 ? ` • ₹${carryForwardAdvance.toLocaleString('en-IN')} advance carried forward` : ''}`,
      )
      if (onSettled) onSettled(result)
      onClose()
    } catch (err) {
      console.error('Failed to settle salary:', err)
      toast.error(err.message || 'Failed to settle salary')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Calculator size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">Settle Monthly Salary</h2>
              <p className="text-xs text-emerald-100">
                Staff: <span className="font-bold text-white">{employee.name}</span> •{' '}
                {formatSalaryMonth(month)}
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Month Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Salary Month (YYYY-MM) *
            </label>
            <input
              type="month"
              required
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full px-3.5 py-2 text-sm font-black rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 text-gray-900"
            />
          </div>

          {/* Earnings Section */}
          <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center justify-between">
              <span>1. Gross Earnings</span>
              <span className="text-emerald-600 font-black">
                ₹{grossEarnings.toLocaleString('en-IN')}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Base Salary (₹)
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Incentives / Bonus (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={incentives}
                  onChange={(e) => setIncentives(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white placeholder:font-normal placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Overtime (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={overtime}
                  onChange={(e) => setOvertime(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white placeholder:font-normal placeholder:text-gray-300"
                />
              </div>
            </div>
          </div>

          {/* Deductions Section */}
          <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-100 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center justify-between">
              <span>2. Deductions & Advances</span>
              <span className="text-rose-600 font-black">
                -₹{totalDeductions.toLocaleString('en-IN')}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold text-rose-700 uppercase">
                    Advance Deducted (₹)
                  </label>
                  <span className="text-[9px] text-gray-500">
                    Active: ₹{totalActiveAdvances.toLocaleString('en-IN')}
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  max={grossEarnings}
                  step="any"
                  value={advancesDeducted}
                  onChange={(e) => setAdvancesDeducted(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-rose-200 bg-white text-rose-900"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-rose-700 uppercase mb-1">
                  Leave / Other Deductions (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={otherDeductions}
                  onChange={(e) => setOtherDeductions(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-rose-200 bg-white placeholder:font-normal placeholder:text-gray-300"
                />
              </div>
            </div>

            {/* Advance Carry-Forward Breakdown Card */}
            {totalActiveAdvances > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-xs">
                <div className="flex items-center justify-between font-bold text-amber-950">
                  <span className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-amber-600 shrink-0" />
                    <span>Advance Settlement Breakdown</span>
                  </span>
                  {carryForwardAdvance > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase">
                      ₹{carryForwardAdvance.toLocaleString('en-IN')} Carried Over
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                      Fully Settled
                    </span>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px] text-amber-900 border-t border-amber-200/60 pt-1.5">
                  <div>
                    <span className="text-[9px] text-amber-700 block uppercase font-semibold">Active Advance</span>
                    <span className="font-black">₹{totalActiveAdvances.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-amber-700 block uppercase font-semibold">Deducting Now</span>
                    <span className="font-black text-rose-700">-₹{(Number(advancesDeducted) || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-amber-700 block uppercase font-semibold">Carries Forward</span>
                    <span className="font-black text-emerald-700">₹{carryForwardAdvance.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                {carryForwardAdvance > 0 && (
                  <p className="text-[10px] text-amber-800 mt-1.5 font-medium leading-relaxed">
                    💡 Nilesh will still have <b>₹{carryForwardAdvance.toLocaleString('en-IN')}</b> in active advance liability after this settlement. None of your advance money will be lost.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Net Payable Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase text-emerald-100 tracking-wider block">
                Net Salary Payable
              </span>
              <p className="text-2xl font-black tracking-tight leading-none mt-1">
                ₹{netPayable.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="text-right text-[11px] text-emerald-100 space-y-0.5">
              <p>Gross: ₹{grossEarnings.toLocaleString('en-IN')}</p>
              <p>Deductions: -₹{totalDeductions.toLocaleString('en-IN')}</p>
            </div>
          </div>

          {/* Payout Source Account */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
              Disburse Net Salary From *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                  payoutAccountId === 'counter'
                    ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payoutAccountId"
                    value="counter"
                    checked={payoutAccountId === 'counter'}
                    onChange={(e) => setPayoutAccountId(e.target.value)}
                    className="sr-only"
                  />
                  <Wallet size={15} className="text-emerald-600" />
                  <span className="text-xs font-bold text-gray-800">Counter Cash</span>
                </div>
                <span className="text-[11px] font-black text-emerald-700">
                  ₹{counterBal.toLocaleString('en-IN')}
                </span>
              </label>

              <label
                className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                  payoutAccountId === 'bank'
                    ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-500/20'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="payoutAccountId"
                    value="bank"
                    checked={payoutAccountId === 'bank'}
                    onChange={(e) => setPayoutAccountId(e.target.value)}
                    className="sr-only"
                  />
                  <Building2 size={15} className="text-orange-600" />
                  <span className="text-xs font-bold text-gray-800">Bank / UPI</span>
                </div>
                <span className="text-[11px] font-black text-orange-700">
                  ₹{bankBal.toLocaleString('en-IN')}
                </span>
              </label>
            </div>
          </div>

          {/* Payout Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Payout Date
              </label>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                Note (Optional)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Paid in full"
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-900 placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100">
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
              className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle size={15} />
              {isSubmitting ? 'Settling…' : 'Confirm & Settle Salary'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
