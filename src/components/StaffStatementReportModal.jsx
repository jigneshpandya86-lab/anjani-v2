import React, { useState, useMemo } from 'react'
import {
  X,
  FileSpreadsheet,
  FileDown,
  Share2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import {
  buildStaffStatementPdf,
  shareOrDownloadPdf,
  resolveTimestamp,
} from '../utils/pdf'
import { formatSalaryMonth } from '../services/staffSalaryService'

export default function StaffStatementReportModal({
  isOpen,
  onClose,
  initialEmployee = null,
}) {
  const { staffList, staffTransactions, salarySettlements } = useClientStore()

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    () => initialEmployee?.id || 'nilesh',
  )
  const [dateRangePreset, setDateRangePreset] = useState('current-month')

  // Date Range helpers
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const firstOfMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [customStartDate, setCustomStartDate] = useState(firstOfMonthStr)
  const [customEndDate, setCustomEndDate] = useState(todayStr)
  const [isGenerating, setIsGenerating] = useState(false)

  // Current selected employee object
  const currentEmployee = useMemo(() => {
    const found = (staffList || []).find((s) => s.id === selectedEmployeeId)
    if (found) return found
    return (
      initialEmployee || {
        id: 'nilesh',
        name: 'Nilesh',
        role: 'Delivery Staff & Driver',
        mobile: '9925997750',
        baseSalary: 15000,
      }
    )
  }, [staffList, selectedEmployeeId, initialEmployee])

  // Compute start/end dates and label
  const { startDate, endDate, dateRangeLabel } = useMemo(() => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    if (dateRangePreset === 'current-month') {
      start.setDate(1)
      const label = `Current Month (${start.toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      })})`
      return { startDate: start, endDate: end, dateRangeLabel: label }
    }

    if (dateRangePreset === 'last-month') {
      start.setMonth(start.getMonth() - 1, 1)
      const lastMonthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
      const label = `Last Month (${start.toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      })})`
      return { startDate: start, endDate: lastMonthEnd, dateRangeLabel: label }
    }

    if (dateRangePreset === 'last-3-months') {
      start.setMonth(start.getMonth() - 2, 1)
      const label = `Last 3 Months (${start.toLocaleDateString('en-IN', {
        month: 'short',
      })} - ${end.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`
      return { startDate: start, endDate: end, dateRangeLabel: label }
    }

    if (dateRangePreset === 'all-time') {
      const allStart = new Date(2025, 0, 1)
      return {
        startDate: allStart,
        endDate: end,
        dateRangeLabel: `All Records (up to ${end.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })})`,
      }
    }

    // Custom
    const cStart = new Date(customStartDate)
    cStart.setHours(0, 0, 0, 0)
    const cEnd = new Date(customEndDate)
    cEnd.setHours(23, 59, 59, 999)
    const label = `${cStart.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })} - ${cEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    return { startDate: cStart, endDate: cEnd, dateRangeLabel: label }
  }, [dateRangePreset, customStartDate, customEndDate])

  // Filter transactions and salary settlements for current employee
  const employeeTransactions = useMemo(() => {
    return (staffTransactions || []).filter((tx) => tx.employeeId === selectedEmployeeId)
  }, [staffTransactions, selectedEmployeeId])

  const employeeSettlements = useMemo(() => {
    return (salarySettlements || []).filter((sal) => sal.employeeId === selectedEmployeeId)
  }, [salarySettlements, selectedEmployeeId])

  // Filter within date range for preview stats
  const previewStats = useMemo(() => {
    const startMs = startDate.getTime()
    const endMs = endDate.getTime()

    const getMillis = (obj) => {
      if (!obj) return 0
      if (typeof obj.toDate === 'function') return obj.toDate().getTime()
      if (obj.seconds) return obj.seconds * 1000
      if (obj instanceof Date) return obj.getTime()
      if (typeof obj === 'string' || typeof obj === 'number') return new Date(obj).getTime()
      return 0
    }

    let advancesInPeriod = 0
    let settlementsInPeriod = 0
    let entriesCount = 0

    employeeTransactions.forEach((tx) => {
      const t = getMillis(tx.date) || getMillis(tx.createdAt)
      if (t >= startMs && t <= endMs) {
        if (!tx.isCarryForward) {
          advancesInPeriod += Number(tx.amount || 0)
        }
        entriesCount++
      }
    })

    employeeSettlements.forEach((sal) => {
      const t = getMillis(sal.payoutDate) || getMillis(sal.settledAt)
      if (t >= startMs && t <= endMs) {
        settlementsInPeriod += Number(sal.advancesDeducted || 0)
        entriesCount++
      }
    })

    const activeAdvanceBalance = employeeTransactions
      .filter((tx) => tx.status === 'active' || !tx.status)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0)

    return {
      advancesInPeriod,
      settlementsInPeriod,
      entriesCount,
      activeAdvanceBalance,
    }
  }, [employeeTransactions, employeeSettlements, startDate, endDate])

  if (!isOpen) return null

  // Generate PDF file
  const handleGeneratePdf = () => {
    try {
      const pdfFile = buildStaffStatementPdf({
        employee: currentEmployee,
        dateRangeLabel,
        startDate,
        endDate,
        advances: employeeTransactions,
        salarySettlements: employeeSettlements,
      })
      return pdfFile
    } catch (err) {
      console.error('Error generating PDF:', err)
      toast.error('Failed to generate statement PDF')
      return null
    }
  }

  // Action: Download PDF
  const handleDownload = async () => {
    setIsGenerating(true)
    try {
      const pdfFile = handleGeneratePdf()
      if (!pdfFile) return
      await shareOrDownloadPdf(
        pdfFile,
        `Statement - ${currentEmployee.name}`,
        `Advance and Salary statement for ${currentEmployee.name} (${dateRangeLabel})`,
      )
    } finally {
      setIsGenerating(false)
    }
  }

  // Action: Share via WhatsApp
  const handleShareWhatsApp = async () => {
    setIsGenerating(true)
    try {
      const pdfFile = handleGeneratePdf()
      if (!pdfFile) return

      const phone = (currentEmployee.mobile || '9925997750').replace(/\D/g, '')

      const waMessage = [
        `*ANNAPURNA FOODS - STAFF STATEMENT*`,
        `Staff: *${currentEmployee.name}*`,
        `Period: *${dateRangeLabel}*`,
        `Base Monthly Salary: ₹${Number(currentEmployee.baseSalary || 15000).toLocaleString('en-IN')}`,
        ``,
        `📊 *Statement Summary:*`,
        `• Total Advances Taken: ₹${previewStats.advancesInPeriod.toLocaleString('en-IN')}`,
        `• Salary Deductions Settled: -₹${previewStats.settlementsInPeriod.toLocaleString('en-IN')}`,
        `-----------------------------`,
        `👉 *Active Advance Outstanding: ₹${previewStats.activeAdvanceBalance.toLocaleString('en-IN')}*`,
        ``,
        `_Official advance & salary ledger statement. Please review and confirm._`,
      ].join('\n')

      // Check if native Web Share API with file support is available
      const canShareFile = Boolean(
        navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdfFile] })),
      )

      if (canShareFile) {
        try {
          await navigator.share({
            title: `Statement - ${currentEmployee.name}`,
            text: waMessage,
            files: [pdfFile],
          })
          toast.success('Select WhatsApp or any app to send statement')
          return
        } catch (shareErr) {
          if (shareErr?.name === 'AbortError') return
        }
      }

      // Desktop fallback: Trigger PDF download and open WhatsApp web with message
      await shareOrDownloadPdf(
        pdfFile,
        `Statement - ${currentEmployee.name}`,
        waMessage,
      )

      const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(waMessage)}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
      toast.success('Statement downloaded & WhatsApp opened!')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">
                Staff Advance & Salary Statement
              </h2>
              <p className="text-xs text-purple-200">
                Official statement for employee verification & records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Employee Selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
              Select Staff Member
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(staffList || []).map((staff) => {
                const isSelected = staff.id === selectedEmployeeId
                return (
                  <button
                    key={staff.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(staff.id)}
                    className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-400/50 font-bold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                        isSelected
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {staff.name?.[0] || 'S'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{staff.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">
                        ₹{Number(staff.baseSalary || 15000).toLocaleString('en-IN')}/mo
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Period Presets */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-gray-500 block mb-1.5">
              Select Statement Period
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs font-bold">
              {[
                { id: 'current-month', label: 'This Month' },
                { id: 'last-month', label: 'Last Month' },
                { id: 'last-3-months', label: 'Last 3 Months' },
                { id: 'all-time', label: 'All Records' },
                { id: 'custom', label: 'Custom Range…' },
              ].map((preset) => {
                const active = dateRangePreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setDateRangePreset(preset.id)}
                    className={`px-3 py-2 rounded-xl border text-center transition-all cursor-pointer ${
                      active
                        ? 'bg-purple-600 border-purple-600 text-white font-black shadow-xs'
                        : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Date Range pickers if 'custom' is selected */}
          {dateRangePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-purple-50/50 border border-purple-200 animate-in fade-in">
              <div>
                <label className="text-[10px] font-bold uppercase text-purple-900 block mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-purple-200 bg-white text-gray-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-purple-900 block mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-purple-200 bg-white text-gray-900"
                />
              </div>
            </div>
          )}

          {/* Statement Preview Metrics */}
          <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-black text-gray-700">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-purple-600" />
                <span>{dateRangeLabel}</span>
              </span>
              <span className="text-[11px] font-bold text-gray-500">
                {previewStats.entriesCount} ledger record{previewStats.entriesCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-gray-200">
              <div className="p-2 rounded-xl bg-white border border-gray-150">
                <span className="text-[9px] font-bold text-gray-500 uppercase block">
                  Advances Taken
                </span>
                <p className="text-xs sm:text-sm font-black text-rose-600 mt-0.5">
                  ₹{previewStats.advancesInPeriod.toLocaleString('en-IN')}
                </p>
              </div>

              <div className="p-2 rounded-xl bg-white border border-gray-150">
                <span className="text-[9px] font-bold text-gray-500 uppercase block">
                  Salary Settled
                </span>
                <p className="text-xs sm:text-sm font-black text-emerald-600 mt-0.5">
                  -₹{previewStats.settlementsInPeriod.toLocaleString('en-IN')}
                </p>
              </div>

              <div className="p-2 rounded-xl bg-purple-50 border border-purple-200">
                <span className="text-[9px] font-bold text-purple-700 uppercase block">
                  Active Advance
                </span>
                <p className="text-xs sm:text-sm font-black text-purple-700 mt-0.5">
                  ₹{previewStats.activeAdvanceBalance.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-gray-500 text-center">
              The PDF includes date-wise advance receipts, monthly salary deductions, and employee acknowledgement lines.
            </p>
          </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-150 flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 font-bold text-xs cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-2xl bg-white hover:bg-gray-100 border border-purple-300 text-purple-700 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
          >
            <FileDown size={15} />
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={handleShareWhatsApp}
            disabled={isGenerating}
            className="flex-1 min-w-[130px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-95 transition-all"
          >
            <Share2 size={15} />
            <span>Share WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  )
}
