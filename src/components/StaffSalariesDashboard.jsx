import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Wallet,
  DollarSign,
  Plus,
  Calculator,
  Calendar,
  FileText,
  Trash2,
  Share2,
  FileDown,
  CheckCircle2,
  Clock,
  Pencil,
  AlertCircle,
  Truck,
  Building2,
  ChevronRight,
  TrendingDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import GiveAdvanceModal from './GiveAdvanceModal'
import SalarySettlementModal from './SalarySettlementModal'
import { formatSalaryMonth } from '../services/staffSalaryService'
import { buildSalarySlipPdf } from '../utils/pdf/salarySlipPdf'
import { shareOrDownloadPdf, resolveTimestamp } from '../utils/pdf/pdfCore'

export default function StaffSalariesDashboard() {
  const {
    staffList,
    staffLoading,
    fetchStaff,
    staffTransactions,
    staffTransactionsLoading,
    fetchStaffTransactions,
    salarySettlements,
    salarySettlementsLoading,
    fetchSalarySettlements,
    accountsSummary,
    fetchAccountsSummary,
    updateStaffProfile,
    deleteStaffTransaction,
  } = useClientStore()

  // Selected employee (defaults to 'nilesh')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('nilesh')
  const [activeTab, setActiveTab] = useState('advances') // 'advances' | 'settlements'

  // Modals
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)
  const [settlementModalOpen, setSettlementModalOpen] = useState(false)
  const [isEditingBaseSalary, setIsEditingBaseSalary] = useState(false)
  const [newBaseSalary, setNewBaseSalary] = useState('')

  // Subscriptions
  useEffect(() => {
    const unsubStaff = fetchStaff()
    const unsubSummary = fetchAccountsSummary()
    return () => {
      if (unsubStaff) unsubStaff()
      if (unsubSummary) unsubSummary()
    }
  }, [fetchStaff, fetchAccountsSummary])

  useEffect(() => {
    const unsubTx = fetchStaffTransactions(selectedEmployeeId)
    const unsubSet = fetchSalarySettlements(selectedEmployeeId)
    return () => {
      if (unsubTx) unsubTx()
      if (unsubSet) unsubSet()
    }
  }, [selectedEmployeeId, fetchStaffTransactions, fetchSalarySettlements])

  // Current selected employee object
  const currentEmployee = useMemo(() => {
    const found = (staffList || []).find((s) => s.id === selectedEmployeeId)
    if (found) return found
    return (
      (staffList || [])[0] || {
        id: 'nilesh',
        name: 'Nilesh',
        role: 'Delivery Staff & Driver',
        mobile: '9925997750',
        baseSalary: 15000,
        advanceBalance: 0,
      }
    )
  }, [staffList, selectedEmployeeId])

  // Active advances for selected employee
  const activeAdvances = useMemo(() => {
    return (staffTransactions || []).filter(
      (tx) => tx.employeeId === selectedEmployeeId && (tx.status === 'active' || !tx.status),
    )
  }, [staffTransactions, selectedEmployeeId])

  // Total active advance amount
  const totalActiveAdvanceAmount = useMemo(() => {
    return activeAdvances.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)
  }, [activeAdvances])

  // Estimated pending salary
  const baseSalaryNum = Number(currentEmployee.baseSalary || 15000)
  const estimatedPendingSalary = Math.max(0, baseSalaryNum - totalActiveAdvanceAmount)

  // Cash custody for current employee (e.g. accountsSummary.nilesh)
  const custodyBal = Number(accountsSummary?.[selectedEmployeeId] || 0)

  // Handle Base Salary Update
  const handleSaveBaseSalary = async (e) => {
    e.preventDefault()
    const num = Number(newBaseSalary)
    if (!num || num <= 0) {
      toast.error('Please enter a valid salary amount')
      return
    }
    try {
      await updateStaffProfile(selectedEmployeeId, { baseSalary: num })
      toast.success(`${currentEmployee.name}'s base salary updated to ₹${num.toLocaleString('en-IN')}`)
      setIsEditingBaseSalary(false)
    } catch (err) {
      toast.error('Failed to update base salary')
    }
  }

  // Handle PDF Export for a Settlement
  const handleDownloadSlip = async (settlement) => {
    try {
      // Find advances settled in this slip
      const settledAdvances = (staffTransactions || []).filter(
        (tx) => tx.settledInSalaryId === settlement.id,
      )

      const file = buildSalarySlipPdf({
        employee: currentEmployee,
        settlement,
        advances: settledAdvances,
      })

      const monthName = formatSalaryMonth(settlement.month)
      await shareOrDownloadPdf(
        file,
        `Salary Slip - ${currentEmployee.name} (${monthName})`,
        `Salary Slip for ${currentEmployee.name} for ${monthName}. Net paid: ₹${Number(
          settlement.netPaid || 0,
        ).toLocaleString('en-IN')}`,
      )
    } catch (err) {
      console.error('PDF Slip generation error:', err)
      toast.error('Failed to generate salary slip PDF')
    }
  }

  return (
    <div className="space-y-3 pb-24 max-w-4xl mx-auto px-1 sm:px-2">
      {/* ─── Header & Employee Switcher ─── */}
      <div className="bg-white rounded-3xl p-3.5 sm:p-5 shadow-xs border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-sm">
              <Users size={20} />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-gray-900 leading-tight">
                Staff Salaries & Advances
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                Manage monthly salary, day-to-day advances, and settlement slips
              </p>
            </div>
          </div>

          {/* Employee Selector Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-gray-100 border border-gray-200 self-start sm:self-auto">
            {(staffList && staffList.length > 0 ? staffList : [currentEmployee]).map((emp) => {
              const isSelected = emp.id === selectedEmployeeId
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-blue-700 shadow-xs border border-gray-200'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                  }`}
                >
                  {emp.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── 4 Metric Highlights ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          {/* Card 1: Base Monthly Salary */}
          <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
                Monthly Salary
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewBaseSalary(String(baseSalaryNum))
                  setIsEditingBaseSalary(true)
                }}
                className="text-gray-400 hover:text-blue-600 p-0.5"
                title="Edit base salary"
              >
                <Pencil size={11} />
              </button>
            </div>
            <p className="text-lg font-black text-gray-900 mt-1">
              ₹{baseSalaryNum.toLocaleString('en-IN')}
            </p>
            <span className="text-[9px] text-gray-400 font-medium">Fixed base amount</span>
          </div>

          {/* Card 2: Unsettled Advances */}
          <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                Active Advance
              </span>
              <AlertCircle size={13} className="text-rose-500" />
            </div>
            <p className="text-lg font-black text-rose-600 mt-1">
              ₹{totalActiveAdvanceAmount.toLocaleString('en-IN')}
            </p>
            <span className="text-[9px] text-rose-500 font-medium">
              {activeAdvances.length} active advance{activeAdvances.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Card 3: Est. Pending Salary */}
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Est. Pending Pay
              </span>
              <Calculator size={13} className="text-emerald-500" />
            </div>
            <p className="text-lg font-black text-emerald-600 mt-1">
              ₹{estimatedPendingSalary.toLocaleString('en-IN')}
            </p>
            <span className="text-[9px] text-emerald-600 font-medium">Salary minus advance</span>
          </div>

          {/* Card 4: Route Cash Custody */}
          <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                Route Custody
              </span>
              <Truck size={13} className="text-blue-500" />
            </div>
            <p className="text-lg font-black text-blue-600 mt-1">
              ₹{custodyBal.toLocaleString('en-IN')}
            </p>
            <span className="text-[9px] text-blue-500 font-medium">Delivery cash on hand</span>
          </div>
        </div>

        {/* ─── Action Buttons Bar ─── */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 flex-wrap">
          <button
            type="button"
            onClick={() => setAdvanceModalOpen(true)}
            className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={16} />
            <span>Give Advance</span>
          </button>

          <button
            type="button"
            onClick={() => setSettlementModalOpen(true)}
            className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Calculator size={16} />
            <span>Settle Monthly Salary</span>
          </button>
        </div>
      </div>

      {/* ─── Inline Edit Base Salary Form (if opened) ─── */}
      {isEditingBaseSalary && (
        <form
          onSubmit={handleSaveBaseSalary}
          className="bg-white rounded-2xl p-3.5 border border-blue-200 shadow-sm flex items-center gap-3 animate-in fade-in"
        >
          <div className="flex-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
              Update {currentEmployee.name}&apos;s Monthly Base Salary (₹)
            </label>
            <input
              type="number"
              required
              min="1"
              value={newBaseSalary}
              onChange={(e) => setNewBaseSalary(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => setIsEditingBaseSalary(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* ─── Sub-Tabs: Advances vs Settlements ─── */}
      <div className="bg-white rounded-3xl p-3 sm:p-4 shadow-xs border border-gray-100 space-y-3">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('advances')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'advances'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <DollarSign size={14} />
              <span>Advances & Repayments</span>
              {activeAdvances.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black">
                  {activeAdvances.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settlements')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-tight transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settlements'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <CheckCircle2 size={14} />
              <span>Settled Salary Slips</span>
              {(salarySettlements || []).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-600 text-white text-[9px] font-black">
                  {(salarySettlements || []).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Advances List */}
        {activeTab === 'advances' && (
          <div className="space-y-2">
            {staffTransactionsLoading ? (
              <div className="py-8 text-center text-xs text-gray-400 font-medium">
                Loading advances…
              </div>
            ) : (staffTransactions || []).length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <DollarSign size={32} className="mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-500">No advances recorded yet</p>
                <p className="text-[11px] text-gray-400">
                  Click &quot;+ Give Advance&quot; above to log an advance payout
                </p>
              </div>
            ) : (
              (staffTransactions || []).map((tx) => {
                const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
                const dateStr = txDate
                  ? txDate.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Recent'
                const isSettled = tx.status === 'settled'

                return (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isSettled
                        ? 'bg-gray-50/60 border-gray-100 opacity-70'
                        : 'bg-white border-gray-150 hover:border-gray-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSettled
                            ? 'bg-gray-100 text-gray-400'
                            : tx.sourceAccountId === 'bank'
                            ? 'bg-orange-100 text-orange-600'
                            : tx.sourceAccountId === 'custody_deduction'
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        {tx.sourceAccountId === 'bank' ? (
                          <Building2 size={16} />
                        ) : tx.sourceAccountId === 'custody_deduction' ? (
                          <Truck size={16} />
                        ) : (
                          <Wallet size={16} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-gray-900">
                            ₹{Number(tx.amount || 0).toLocaleString('en-IN')}
                          </p>
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isSettled
                                ? 'bg-gray-200 text-gray-600'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {isSettled ? 'Settled' : 'Active Advance'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {tx.note || 'Salary Advance'} •{' '}
                          <span className="text-gray-400">
                            via{' '}
                            {tx.sourceAccountId === 'bank'
                              ? 'Bank / UPI'
                              : tx.sourceAccountId === 'custody_deduction'
                              ? 'Route Custody'
                              : 'Counter Cash'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-bold text-gray-400">{dateStr}</span>
                      {!isSettled && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm('Delete this advance and refund the account balance?')) {
                              try {
                                await deleteStaffTransaction(tx.id)
                                toast.success('Advance removed and balance refunded')
                              } catch (err) {
                                toast.error('Failed to delete advance')
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete Advance"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* Tab 2: Salary Settlements List */}
        {activeTab === 'settlements' && (
          <div className="space-y-2">
            {salarySettlementsLoading ? (
              <div className="py-8 text-center text-xs text-gray-400 font-medium">
                Loading salary history…
              </div>
            ) : (salarySettlements || []).length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-500">No salary settled yet</p>
                <p className="text-[11px] text-gray-400">
                  Click &quot;Settle Monthly Salary&quot; when month-end arrives
                </p>
              </div>
            ) : (
              (salarySettlements || []).map((sal) => {
                const monthLabel = formatSalaryMonth(sal.month)
                const payoutDate = resolveTimestamp(sal.payoutDate) || resolveTimestamp(sal.settledAt)
                const dateStr = payoutDate
                  ? payoutDate.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : '-'

                return (
                  <div
                    key={sal.id}
                    className="p-3.5 rounded-2xl border border-gray-150 bg-white hover:border-gray-200 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-gray-900">{monthLabel}</span>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Paid
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-600 font-medium flex-wrap">
                        <span>Gross: ₹{Number(sal.grossEarnings || sal.baseSalary || 0).toLocaleString('en-IN')}</span>
                        <span className="text-gray-300">•</span>
                        <span className="text-rose-600">
                          Advance Deducted: -₹{Number(sal.advancesDeducted || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span>Mode: {String(sal.payoutAccountId || 'counter').toUpperCase()}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">Paid on {dateStr}</p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                      <div className="text-left sm:text-right">
                        <span className="text-[9px] font-bold text-gray-400 uppercase block">
                          Net Disbursed
                        </span>
                        <p className="text-base font-black text-emerald-600">
                          ₹{Number(sal.netPaid || 0).toLocaleString('en-IN')}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownloadSlip(sal)}
                        className="px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                        title="Export PDF Salary Slip & Share"
                      >
                        <FileDown size={13} />
                        <span>Slip PDF</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      <GiveAdvanceModal
        isOpen={advanceModalOpen}
        onClose={() => setAdvanceModalOpen(false)}
        employee={currentEmployee}
        accountsSummary={accountsSummary}
      />

      <SalarySettlementModal
        isOpen={settlementModalOpen}
        onClose={() => setSettlementModalOpen(false)}
        employee={currentEmployee}
        activeAdvances={activeAdvances}
        accountsSummary={accountsSummary}
        onSettled={(result) => {
          handleDownloadSlip(result)
        }}
      />
    </div>
  )
}
