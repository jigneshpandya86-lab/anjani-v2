import React, { useState, useEffect, useMemo } from 'react'
import {
  Users,
  Wallet,
  DollarSign,
  Plus,
  Calculator,
  FileText,
  Trash2,
  FileDown,
  CheckCircle2,
  Pencil,
  AlertCircle,
  Truck,
  Building2,
  ChevronDown,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import GiveAdvanceModal from './GiveAdvanceModal'
import SalarySettlementModal from './SalarySettlementModal'
import StaffStatementReportModal from './StaffStatementReportModal'
import { formatSalaryMonth } from '../services/staffSalaryService'
import { buildSalarySlipPdf } from '../utils/pdf/salarySlipPdf'
import { shareOrDownloadPdf, resolveTimestamp } from '../utils/pdf/pdfCore'

export default function StaffSalariesDashboard() {
  const {
    staffList,
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
    deleteSalarySettlement,
    restoreExcessAdvance,
  } = useClientStore()

  // Selected employee (defaults to 'nilesh')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('nilesh')

  // Click-to-expand accordion states
  const [isAdvancesOpen, setIsAdvancesOpen] = useState(false)
  const [isSettlementsOpen, setIsSettlementsOpen] = useState(false)
  const [advanceFilter, setAdvanceFilter] = useState('active') // 'active' | 'all'
  const [expandedAdvanceId, setExpandedAdvanceId] = useState(null)
  const [expandedSettlementId, setExpandedSettlementId] = useState(null)

  // Modals & Inline Edits
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)
  const [settlementModalOpen, setSettlementModalOpen] = useState(false)
  const [statementModalOpen, setStatementModalOpen] = useState(false)
  const [isEditingBaseSalary, setIsEditingBaseSalary] = useState(false)
  const [newBaseSalary, setNewBaseSalary] = useState('')
  const [isRestoringAdvance, setIsRestoringAdvance] = useState(false)

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

  // Settled advances count
  const settledAdvancesCount = useMemo(() => {
    return (staffTransactions || []).filter((tx) => tx.status === 'settled').length
  }, [staffTransactions])

  // Filtered advances for the accordion view
  const displayedAdvances = useMemo(() => {
    const list = staffTransactions || []
    if (advanceFilter === 'active') {
      return list.filter((tx) => tx.status === 'active' || !tx.status)
    }
    return list
  }, [staffTransactions, advanceFilter])

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
    } catch (_err) {
      toast.error('Failed to update base salary')
    }
  }

  // Handle PDF Export for a Settlement
  const handleDownloadSlip = async (settlement) => {
    try {
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

  // Detect uncarried advance discrepancy from recent settlements
  const detectedDiscrepancy = useMemo(() => {
    if (!salarySettlements || salarySettlements.length === 0) return null
    const latest = salarySettlements[0]

    const gross = Number(latest.grossEarnings || latest.baseSalary || 0)
    const ded = Number(latest.advancesDeducted || 0)

    // Check 1: advancesDeducted > gross earnings
    if (ded > gross) {
      return {
        amount: ded - gross,
        month: latest.month,
        settlement: latest,
      }
    }

    // Check 2: Past advances totaling more than advancesDeducted were marked settled under this slip
    const settledUnderThis = (staffTransactions || []).filter(
      (tx) => tx.settledInSalaryId === latest.id && tx.status === 'settled',
    )
    const sumSettledUnder = settledUnderThis.reduce(
      (s, tx) => s + (Number(tx.amount) || 0),
      0,
    )
    if (sumSettledUnder > ded) {
      return {
        amount: sumSettledUnder - ded,
        month: latest.month,
        settlement: latest,
      }
    }

    return null
  }, [salarySettlements, staffTransactions])

  // Delete / Undo a settlement slip
  const handleDeleteSettlement = async (sal) => {
    const monthLabel = formatSalaryMonth(sal.month)
    if (
      !window.confirm(
        `Delete salary settlement slip for ${currentEmployee.name} (${monthLabel})?\n\nThis will:\n1. Restore settled advances back to Active\n2. Refund ₹${Number(
          sal.netPaid || 0,
        ).toLocaleString('en-IN')} to ${sal.payoutAccountId || 'counter'}\n3. Remove salary expense from P&L`,
      )
    ) {
      return
    }

    try {
      await deleteSalarySettlement(sal.id, selectedEmployeeId)
      toast.success(`Settlement for ${monthLabel} deleted and advances restored!`)
    } catch (err) {
      console.error('Failed to delete settlement:', err)
      toast.error(err.message || 'Failed to delete settlement')
    }
  }

  // 1-Click Restore uncarried advance
  const handleRestoreExcessAdvance = async (amountToRestore) => {
    const amt = Number(amountToRestore)
    if (!amt || amt <= 0) return
    setIsRestoringAdvance(true)
    try {
      await restoreExcessAdvance({
        employeeId: selectedEmployeeId,
        employeeName: currentEmployee.name,
        amount: amt,
        note: `Restored carry-forward advance balance from ${formatSalaryMonth(
          detectedDiscrepancy?.month || salarySettlements[0]?.month,
        )} salary settlement`,
      })
      toast.success(
        `₹${amt.toLocaleString('en-IN')} active advance restored successfully for ${
          currentEmployee.name
        }!`,
      )
    } catch (err) {
      console.error('Failed to restore advance:', err)
      toast.error('Failed to restore advance')
    } finally {
      setIsRestoringAdvance(false)
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
                  onClick={() => {
                    setSelectedEmployeeId(emp.id)
                    setExpandedAdvanceId(null)
                    setExpandedSettlementId(null)
                  }}
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

        {/* ─── 4 Metric Highlights (Compact, Click to expand corresponding drawer) ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
          {/* Card 1: Base Monthly Salary */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500">
                Monthly Salary
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewBaseSalary(String(baseSalaryNum))
                  setIsEditingBaseSalary(true)
                }}
                className="text-gray-400 hover:text-blue-600 p-0.5 cursor-pointer"
                title="Edit base salary"
              >
                <Pencil size={11} />
              </button>
            </div>
            <p className="text-base sm:text-lg font-black text-gray-900 mt-0.5">
              ₹{baseSalaryNum.toLocaleString('en-IN')}
            </p>
            <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium truncate">Fixed base amount</span>
          </div>

          {/* Card 2: Unsettled Advances (Click to toggle Advances Section) */}
          <button
            type="button"
            onClick={() => setIsAdvancesOpen((prev) => !prev)}
            className={`p-2 sm:p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none ${
              isAdvancesOpen
                ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-300/60 shadow-xs'
                : 'bg-rose-50/70 border-rose-200/80 hover:border-rose-300 hover:bg-rose-50/90'
            }`}
            title="Click to expand advances and repayments"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-rose-700">
                Active Advance
              </span>
              <div className="flex items-center gap-1">
                <AlertCircle size={11} className="text-rose-500" />
                <ChevronDown
                  size={11}
                  className={`text-rose-600 transition-transform duration-200 ${
                    isAdvancesOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>
            <p className="text-base sm:text-lg font-black text-rose-600 mt-0.5">
              ₹{totalActiveAdvanceAmount.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center justify-between mt-0.5 text-[8px] sm:text-[9px]">
              <span className="text-rose-500 font-medium truncate">
                {activeAdvances.length} active
              </span>
              <span className="font-bold text-rose-600 uppercase tracking-tight ml-1 shrink-0">
                {isAdvancesOpen ? 'Open' : 'Expand'}
              </span>
            </div>
          </button>

          {/* Card 3: Est. Pending Salary (Click to toggle Settled Slips Section) */}
          <button
            type="button"
            onClick={() => setIsSettlementsOpen((prev) => !prev)}
            className={`p-2 sm:p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer select-none ${
              isSettlementsOpen
                ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-300/60 shadow-xs'
                : 'bg-emerald-50/70 border-emerald-200/80 hover:border-emerald-300 hover:bg-emerald-50/90'
            }`}
            title="Click to expand settled monthly salary slips"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-700">
                Est. Pending Pay
              </span>
              <div className="flex items-center gap-1">
                <Calculator size={11} className="text-emerald-500" />
                <ChevronDown
                  size={11}
                  className={`text-emerald-600 transition-transform duration-200 ${
                    isSettlementsOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </div>
            <p className="text-base sm:text-lg font-black text-emerald-600 mt-0.5">
              ₹{estimatedPendingSalary.toLocaleString('en-IN')}
            </p>
            <div className="flex items-center justify-between mt-0.5 text-[8px] sm:text-[9px]">
              <span className="text-emerald-600 font-medium truncate">Salary - advance</span>
              <span className="font-bold text-emerald-700 uppercase tracking-tight ml-1 shrink-0">
                {isSettlementsOpen ? 'Open' : 'Expand'}
              </span>
            </div>
          </button>

          {/* Card 4: Route Cash Custody */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-blue-700">
                Route Custody
              </span>
              <Truck size={11} className="text-blue-500" />
            </div>
            <p className="text-base sm:text-lg font-black text-blue-600 mt-0.5">
              ₹{custodyBal.toLocaleString('en-IN')}
            </p>
            <span className="text-[8px] sm:text-[9px] text-blue-500 font-medium truncate">Cash on hand</span>
          </div>
        </div>

        {/* ─── Action Buttons Bar ─── */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setAdvanceModalOpen(true)
              setIsAdvancesOpen(true)
            }}
            className="flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>Give Advance</span>
          </button>

          <button
            type="button"
            onClick={() => setSettlementModalOpen(true)}
            className="flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <Calculator size={15} />
            <span>Settle Monthly Salary</span>
          </button>

          <button
            type="button"
            onClick={() => setStatementModalOpen(true)}
            className="flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-black text-xs uppercase tracking-wider shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            title="Generate statement PDF for selected period and share with staff"
          >
            <FileSpreadsheet size={15} />
            <span>Statement (PDF)</span>
          </button>
        </div>

        {/* ─── Discrepancy & Recovery Banner (Auto-detects uncarried advance) ─── */}
        {detectedDiscrepancy && totalActiveAdvanceAmount === 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-black text-amber-950">
                  Advance Discrepancy Detected: ₹{detectedDiscrepancy.amount.toLocaleString('en-IN')} Uncarried Advance
                </p>
                <p className="text-amber-800 mt-0.5 text-[11px] leading-relaxed">
                  In {formatSalaryMonth(detectedDiscrepancy.month)}, your advance was settled without carrying forward the remaining <b>₹{detectedDiscrepancy.amount.toLocaleString('en-IN')}</b>, causing active advance to show ₹0. Click below to restore this active advance balance.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
              <button
                type="button"
                onClick={() => handleRestoreExcessAdvance(detectedDiscrepancy.amount)}
                disabled={isRestoringAdvance}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
              >
                <RotateCcw size={13} />
                <span>Restore ₹{detectedDiscrepancy.amount.toLocaleString('en-IN')} Active Advance</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSettlement(detectedDiscrepancy.settlement)}
                className="px-3 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-100 text-amber-900 font-bold text-xs cursor-pointer transition-all"
              >
                Delete Slip & Re-settle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Inline Edit Base Salary Form (if opened) ─── */}
      {isEditingBaseSalary && (
        <form
          onSubmit={handleSaveBaseSalary}
          className="bg-white rounded-2xl p-3.5 border border-blue-200 shadow-sm flex items-center gap-3 animate-in fade-in"
        >
          <div className="flex-1">
            <label
              htmlFor="editBaseSalaryInput"
              className="text-[10px] font-bold text-gray-500 uppercase block mb-1"
            >
              Update {currentEmployee.name}&apos;s Monthly Base Salary (₹)
            </label>
            <input
              id="editBaseSalaryInput"
              type="number"
              required
              min="1"
              value={newBaseSalary}
              onChange={(e) => setNewBaseSalary(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-gray-900"
            />
          </div>
          <div className="flex items-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => setIsEditingBaseSalary(false)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {/* ─── Expandable Section 1: Advances & Repayments (Click to Expand Accordion) ─── */}
      <div className="rounded-3xl border border-gray-150 bg-white overflow-hidden shadow-xs transition-all">
        <button
          type="button"
          onClick={() => setIsAdvancesOpen((prev) => !prev)}
          className={`w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none ${
            isAdvancesOpen ? 'bg-rose-50/30 border-b border-gray-150' : 'hover:bg-gray-50/60'
          }`}
          aria-expanded={isAdvancesOpen}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0">
              <DollarSign size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black text-gray-900 tracking-tight">
                  Advances & Repayments
                </h2>
                {activeAdvances.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">
                    {activeAdvances.length} Active (₹{totalActiveAdvanceAmount.toLocaleString('en-IN')})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                    0 Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                {activeAdvances.length > 0
                  ? `${activeAdvances.length} active advance${
                      activeAdvances.length === 1 ? '' : 's'
                    } pending deduction • ${settledAdvancesCount} settled in past slips`
                  : (staffTransactions || []).length > 0
                  ? `All ${(staffTransactions || []).length} past advances have been settled`
                  : 'No advances recorded yet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider hidden sm:inline">
              {isAdvancesOpen ? 'Collapse' : 'Tap to expand'}
            </span>
            <div
              className={`p-1.5 rounded-xl border transition-all ${
                isAdvancesOpen
                  ? 'border-rose-200 bg-rose-100/50 text-rose-700'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isAdvancesOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>

        {isAdvancesOpen && (
          <div className="p-3 sm:p-4 space-y-3 animate-in fade-in">
            {/* Filter Pills */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 flex-wrap">
              <div className="flex items-center gap-1.5 p-0.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setAdvanceFilter('active')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    advanceFilter === 'active'
                      ? 'bg-white text-rose-700 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Active Only ({activeAdvances.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdvanceFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    advanceFilter === 'all'
                      ? 'bg-white text-gray-900 shadow-2xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  All History ({(staffTransactions || []).length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeAdvances.length === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const amtStr = window.prompt(
                        `Enter unrecorded advance balance to restore for ${currentEmployee.name} (₹):`,
                        '1600',
                      )
                      if (amtStr) {
                        const num = Number(amtStr)
                        if (num > 0) handleRestoreExcessAdvance(num)
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <RotateCcw size={11} />
                    <span>Restore Unclaimed Advance</span>
                  </button>
                )}
                <span className="text-[10px] text-gray-400 font-medium hidden sm:inline">
                  Click any row for full audit & delete options
                </span>
              </div>
            </div>

            {/* Advances List */}
            {staffTransactionsLoading ? (
              <div className="py-6 text-center text-xs text-gray-400 font-medium">
                Loading advances…
              </div>
            ) : displayedAdvances.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <DollarSign size={28} className="mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-600">
                  {advanceFilter === 'active'
                    ? 'No active advances pending settlement'
                    : 'No advance history recorded yet'}
                </p>
                <p className="text-[11px] text-gray-400">
                  Use the &quot;+ Give Advance&quot; button above to log a payout
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {displayedAdvances.map((tx) => {
                  const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
                  const dateStr = txDate
                    ? txDate.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Recent'
                  const timeStr = txDate
                    ? txDate.toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''
                  const isSettled = tx.status === 'settled'
                  const isRowExpanded = expandedAdvanceId === tx.id

                  return (
                    <div
                      key={tx.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isSettled
                          ? 'bg-gray-50/70 border-gray-150'
                          : 'bg-white border-gray-150 hover:border-gray-300 shadow-2xs'
                      }`}
                    >
                      {/* Compact clickable summary row */}
                      <button
                        type="button"
                        aria-label={`Toggle advance ${tx.id} details`}
                        onClick={() =>
                          setExpandedAdvanceId((prev) => (prev === tx.id ? null : tx.id))
                        }
                        className="w-full p-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
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
                              <Building2 size={15} />
                            ) : tx.sourceAccountId === 'custody_deduction' ? (
                              <Truck size={15} />
                            ) : (
                              <Wallet size={15} />
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
                                    : tx.isCarryForward
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {isSettled
                                  ? 'Settled'
                                  : tx.isCarryForward
                                  ? 'Carry-Forward'
                                  : 'Active Advance'}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">
                              {tx.note || 'Salary Advance'} •{' '}
                              <span className="text-gray-400">
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
                          <ChevronDown
                            size={13}
                            className={`text-gray-400 transition-transform duration-200 ${
                              isRowExpanded ? 'rotate-180 text-rose-600' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {/* Click-to-expand audit details & delete option */}
                      {isRowExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/50 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                            <div>
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">
                                Recorded At
                              </span>
                              <p className="text-gray-700 font-semibold">
                                {dateStr} {timeStr ? `at ${timeStr}` : ''}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">
                                Payout Account
                              </span>
                              <p className="text-gray-700 font-semibold">
                                {tx.sourceAccountId === 'bank'
                                  ? 'Bank / UPI Collections'
                                  : tx.sourceAccountId === 'custody_deduction'
                                  ? 'Route Delivery Cash Custody'
                                  : 'Counter Cash Drawer'}
                              </p>
                            </div>
                          </div>

                          {tx.note && (
                            <div className="text-[11px] bg-white p-2 rounded-xl border border-gray-150">
                              <span className="text-gray-400 block text-[10px] font-bold uppercase">
                                Note / Reason
                              </span>
                              <p className="text-gray-800 font-medium mt-0.5">{tx.note}</p>
                            </div>
                          )}

                          {isSettled ? (
                            <div className="text-[10px] text-gray-500 font-medium bg-gray-100 px-2.5 py-1.5 rounded-xl flex items-center justify-between">
                              <span>Settled in salary slip</span>
                              <span className="font-bold text-gray-700">
                                Slip ID: {tx.settledInSalaryId || 'Past Slip'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end pt-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    window.confirm(
                                      `Delete this advance of ₹${Number(
                                        tx.amount || 0,
                                      ).toLocaleString('en-IN')} and refund ${
                                        tx.sourceAccountId === 'bank'
                                          ? 'Bank / UPI'
                                          : tx.sourceAccountId === 'custody_deduction'
                                          ? 'Route Custody'
                                          : 'Counter Cash'
                                      }?`,
                                    )
                                  ) {
                                    try {
                                      await deleteStaffTransaction(tx.id)
                                      toast.success('Advance removed and balance refunded')
                                    } catch (_err) {
                                      toast.error('Failed to delete advance')
                                    }
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-red-600 hover:bg-red-50 border border-red-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <Trash2 size={12} />
                                <span>Delete Advance & Refund</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Expandable Section 2: Settled Monthly Salary Slips (Click to Expand Accordion) ─── */}
      <div className="rounded-3xl border border-gray-150 bg-white overflow-hidden shadow-xs transition-all">
        <button
          type="button"
          onClick={() => setIsSettlementsOpen((prev) => !prev)}
          className={`w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer select-none ${
            isSettlementsOpen ? 'bg-emerald-50/30 border-b border-gray-150' : 'hover:bg-gray-50/60'
          }`}
          aria-expanded={isSettlementsOpen}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black text-gray-900 tracking-tight">
                  Settled Salary Slips
                </h2>
                {(salarySettlements || []).length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                    {(salarySettlements || []).length} Paid
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                    0 Paid
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                {(salarySettlements || []).length > 0
                  ? `Latest: ${formatSalaryMonth(salarySettlements[0].month)} • Net ₹${Number(
                      salarySettlements[0].netPaid || 0,
                    ).toLocaleString('en-IN')}`
                  : 'No monthly salary slips settled yet'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider hidden sm:inline">
              {isSettlementsOpen ? 'Collapse' : 'Tap to expand'}
            </span>
            <div
              className={`p-1.5 rounded-xl border transition-all ${
                isSettlementsOpen
                  ? 'border-emerald-200 bg-emerald-100/50 text-emerald-700'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isSettlementsOpen ? 'rotate-180' : ''}`}
              />
            </div>
          </div>
        </button>

        {isSettlementsOpen && (
          <div className="p-3 sm:p-4 space-y-3 animate-in fade-in">
            {salarySettlementsLoading ? (
              <div className="py-6 text-center text-xs text-gray-400 font-medium">
                Loading salary history…
              </div>
            ) : (salarySettlements || []).length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 size={28} className="mx-auto text-gray-300" />
                <p className="text-xs font-bold text-gray-600">No salary settled yet</p>
                <p className="text-[11px] text-gray-400">
                  Click &quot;Settle Monthly Salary&quot; above when month-end arrives
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(salarySettlements || []).map((sal) => {
                  const monthLabel = formatSalaryMonth(sal.month)
                  const payoutDate = resolveTimestamp(sal.payoutDate) || resolveTimestamp(sal.settledAt)
                  const dateStr = payoutDate
                    ? payoutDate.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '-'
                  const isRowExpanded = expandedSettlementId === sal.id

                  return (
                    <div
                      key={sal.id}
                      className="rounded-2xl border border-gray-150 bg-white hover:border-gray-300 transition-all shadow-2xs overflow-hidden"
                    >
                      {/* Compact row */}
                      <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
                        <button
                          type="button"
                          aria-label={`Toggle ${monthLabel} slip breakdown`}
                          onClick={() =>
                            setExpandedSettlementId((prev) => (prev === sal.id ? null : sal.id))
                          }
                          className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                        >
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <FileText size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-900">{monthLabel}</span>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                Paid
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5 truncate">
                              Disbursed:{' '}
                              <span className="font-black text-emerald-600">
                                ₹{Number(sal.netPaid || 0).toLocaleString('en-IN')}
                              </span>{' '}
                              • {dateStr}
                            </p>
                          </div>
                          <ChevronDown
                            size={13}
                            className={`text-gray-400 ml-1 transition-transform duration-200 shrink-0 ${
                              isRowExpanded ? 'rotate-180 text-emerald-600' : ''
                            }`}
                          />
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadSlip(sal)}
                            className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                            title="Export PDF Salary Slip & Share"
                          >
                            <FileDown size={13} />
                            <span>Slip PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSettlement(sal)}
                            className="p-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 transition-all cursor-pointer"
                            title="Delete this settlement slip and restore advances"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail breakdown */}
                      {isRowExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/50 space-y-2 text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                            <div className="p-2 rounded-xl bg-white border border-gray-150">
                              <span className="text-gray-400 block text-[9px] font-bold uppercase">
                                Gross Base
                              </span>
                              <p className="font-black text-gray-900">
                                ₹{Number(sal.grossEarnings || sal.baseSalary || 0).toLocaleString('en-IN')}
                              </p>
                            </div>
                            <div className="p-2 rounded-xl bg-white border border-gray-150">
                              <span className="text-rose-500 block text-[9px] font-bold uppercase">
                                Advance Deducted
                              </span>
                              <p className="font-black text-rose-600">
                                -₹{Number(sal.advancesDeducted || 0).toLocaleString('en-IN')}
                              </p>
                            </div>
                            <div className="p-2 rounded-xl bg-white border border-gray-150">
                              <span className="text-gray-400 block text-[9px] font-bold uppercase">
                                Payout Mode
                              </span>
                              <p className="font-bold text-gray-700 uppercase">
                                {String(sal.payoutAccountId || 'counter')}
                              </p>
                            </div>
                            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                              <span className="text-emerald-700 block text-[9px] font-bold uppercase">
                                Net Disbursed
                              </span>
                              <p className="font-black text-emerald-700 text-sm">
                                ₹{Number(sal.netPaid || 0).toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 flex-wrap gap-2">
                            <span>Settled and logged in Firebase on {dateStr}</span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleDeleteSettlement(sal)}
                                className="text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={11} />
                                <span>Delete / Undo Slip</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadSlip(sal)}
                                className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <FileDown size={11} />
                                <span>Download Official Slip PDF</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
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
          setIsSettlementsOpen(true)
          handleDownloadSlip(result)
        }}
      />

      <StaffStatementReportModal
        isOpen={statementModalOpen}
        onClose={() => setStatementModalOpen(false)}
        initialEmployee={currentEmployee}
      />
    </div>
  )
}
