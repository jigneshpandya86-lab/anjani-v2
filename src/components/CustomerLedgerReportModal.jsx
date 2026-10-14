import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  startAfter,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { buildLedgerPdf, shareOrDownloadPdf, resolveTimestamp } from '../utils/pdf'
import toast from 'react-hot-toast'
import {
  X,
  BookText,
  Calendar,
  FileDown,
  Share2,
  Users,
  Search,
  IndianRupee,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

const LEDGER_QUERY_PAGE_SIZE = 500

export default function CustomerLedgerReportModal({
  isOpen,
  onClose,
  initialClientId = '',
}) {
  const { clients, paymentSettings } = useClientStore()

  // Selected Client ID
  const [selectedClientId, setSelectedClientId] = useState(() => {
    if (initialClientId) return initialClientId
    return clients?.[0]?.id || 'all'
  })

  // Client search query
  const [clientSearch, setClientSearch] = useState('')

  // Date Range Presets
  const [dateRangePreset, setDateRangePreset] = useState('current-month')

  // Date helpers
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const firstOfMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [customStartDate, setCustomStartDate] = useState(firstOfMonthStr)
  const [customEndDate, setCustomEndDate] = useState(todayStr)

  // Live preview data states
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewStats, setPreviewStats] = useState({
    openingBalance: 0,
    totalBilled: 0,
    totalPaid: 0,
    closingBalance: 0,
    entriesCount: 0,
  })
  const [filteredTxns, setFilteredTxns] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Sync initialClientId when prop changes or modal opens
  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId)
    } else if (clients?.length > 0 && selectedClientId !== 'all') {
      const exists = clients.some((c) => c.id === selectedClientId)
      if (!exists) setSelectedClientId(clients[0].id)
    }
  }, [initialClientId, clients])

  // Resolve current selected client object
  const selectedClient = useMemo(() => {
    if (selectedClientId === 'all') {
      return {
        id: 'all',
        name: 'All Clients (Consolidated)',
        mobile: '',
        address: 'Consolidated Ledger',
        outstanding: clients.reduce((sum, c) => sum + (Number(c.outstanding) || 0), 0),
      }
    }
    return clients.find((c) => c.id === selectedClientId) || null
  }, [selectedClientId, clients])

  // Filter client dropdown list
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients || []
    const q = clientSearch.toLowerCase().trim()
    return (clients || []).filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.mobile || '').includes(q) ||
        (c.shortId || '').toLowerCase().includes(q),
    )
  }, [clients, clientSearch])

  // Compute start/end date from preset
  const computeDateRange = useCallback(() => {
    const now = new Date()
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)

    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    let label = 'Current Month'

    if (dateRangePreset === 'today') {
      label = `Today (${now.toLocaleDateString('en-IN')})`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'current-month') {
      start.setDate(1)
      label = `Current Month (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'last-month') {
      start.setMonth(start.getMonth() - 1, 1)
      const lastMonthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
      label = `Last Month (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})`
      return { startDate: start, endDate: lastMonthEnd, label }
    }

    if (dateRangePreset === 'past-6-months') {
      start.setMonth(start.getMonth() - 6)
      label = `Past 6 Months (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} - Present)`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'past-1-year') {
      start.setFullYear(start.getFullYear() - 1)
      label = `Past 1 Year (${start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} - Present)`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'this-fy') {
      // Indian Financial Year: April 1 to March 31
      const curYear = now.getFullYear()
      const curMonth = now.getMonth() // 0-indexed
      const fyStartYear = curMonth >= 3 ? curYear : curYear - 1
      const fyStartDate = new Date(fyStartYear, 3, 1, 0, 0, 0, 0)
      label = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`
      return { startDate: fyStartDate, endDate: end, label }
    }

    if (dateRangePreset === 'all-time') {
      const allStart = new Date(2020, 0, 1, 0, 0, 0, 0)
      label = 'All Time'
      return { startDate: allStart, endDate: end, label }
    }

    if (dateRangePreset === 'custom' && customStartDate && customEndDate) {
      const s = new Date(`${customStartDate}T00:00:00`)
      const e = new Date(`${customEndDate}T23:59:59.999`)
      label = `${s.toLocaleDateString('en-IN')} to ${e.toLocaleDateString('en-IN')}`
      return { startDate: s, endDate: e, label }
    }

    start.setDate(1)
    return { startDate: start, endDate: end, label }
  }, [dateRangePreset, customStartDate, customEndDate])

  // Fetch payments for selected client and period
  const fetchLedgerData = useCallback(async () => {
    if (!selectedClient) return
    setLoadingPreview(true)

    try {
      const { startDate, endDate } = computeDateRange()

      let allPayments = []
      let lastVisibleDoc = null

      while (true) {
        const constraints =
          selectedClient.id === 'all'
            ? [limit(LEDGER_QUERY_PAGE_SIZE)]
            : [where('clientId', '==', selectedClient.id), limit(LEDGER_QUERY_PAGE_SIZE)]

        if (lastVisibleDoc) constraints.push(startAfter(lastVisibleDoc))
        const snap = await getDocs(query(collection(db, 'payments'), ...constraints))
        if (snap.empty) break

        allPayments.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        if (snap.docs.length < LEDGER_QUERY_PAGE_SIZE) break
        lastVisibleDoc = snap.docs[snap.docs.length - 1]
      }

      // Chronological sort
      allPayments.sort((a, b) => {
        const ta = (resolveTimestamp(a.date) || resolveTimestamp(a.createdAt) || new Date(0)).getTime()
        const tb = (resolveTimestamp(b.date) || resolveTimestamp(b.createdAt) || new Date(0)).getTime()
        return ta - tb
      })

      // Calculate opening balance before startDate
      let openingBalance = 0
      if (selectedClient.id !== 'all') {
        openingBalance = allPayments.reduce((acc, tx) => {
          const d = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
          if (!d || d >= startDate) return acc
          const amt = Number(tx.amount || 0)
          if (tx.type === 'invoice') return acc + Math.abs(amt)
          if (tx.type === 'payment') return acc - Math.abs(amt)
          return amt < 0 ? acc + Math.abs(amt) : acc - amt
        }, 0)
      }

      // Filter txns in range
      const inRangeTxns = allPayments.filter((tx) => {
        const d = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
        return d && d >= startDate && d <= endDate
      })

      let running = openingBalance
      let totalBilled = 0
      let totalPaid = 0

      inRangeTxns.forEach((tx) => {
        const amt = Number(tx.amount || 0)
        if (tx.type === 'invoice') {
          running += Math.abs(amt)
          totalBilled += Math.abs(amt)
        } else if (tx.type === 'payment') {
          running -= Math.abs(amt)
          totalPaid += Math.abs(amt)
        } else {
          if (amt < 0) {
            running += Math.abs(amt)
            totalBilled += Math.abs(amt)
          } else {
            running -= amt
            totalPaid += amt
          }
        }
      })

      setFilteredTxns(inRangeTxns)
      setPreviewStats({
        openingBalance,
        totalBilled,
        totalPaid,
        closingBalance: running,
        entriesCount: inRangeTxns.length,
      })
    } catch (err) {
      console.error('Failed to load customer ledger:', err)
      toast.error('Failed to load ledger preview.')
    } finally {
      setLoadingPreview(false)
    }
  }, [selectedClient, computeDateRange])

  // Load preview data whenever client or date range changes
  useEffect(() => {
    if (isOpen) {
      fetchLedgerData()
    }
  }, [isOpen, fetchLedgerData])

  // Generate PDF file
  const handleGeneratePdf = () => {
    if (!selectedClient) {
      toast.error('Please select a client.')
      return null
    }

    const { label: dateRangeLabel } = computeDateRange()
    const safeClientName = String(selectedClient.name || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')
    const dateStr = new Date().toISOString().slice(0, 10)
    const filename = `Customer_Ledger_${safeClientName}_${dateStr}.pdf`

    return buildLedgerPdf({
      clientName: selectedClient.name,
      clientMobile: selectedClient.mobile || '',
      clientAddress: selectedClient.address || '',
      clientId: selectedClient.shortId || selectedClient.id || '',
      dateRangeLabel,
      txns: filteredTxns,
      openingBalance: previewStats.openingBalance,
      paymentSettings: paymentSettings || {},
      filename,
    })
  }

  // Download / Save PDF
  const handleDownload = async () => {
    setIsGenerating(true)
    try {
      const pdfFile = handleGeneratePdf()
      if (!pdfFile) return

      await shareOrDownloadPdf(
        pdfFile,
        `Customer Ledger - ${selectedClient?.name || 'Statement'}`,
        `Customer Account Statement for ${selectedClient?.name || 'Customer'} (${computeDateRange().label})`,
      )
      onClose()
    } catch (err) {
      console.error('Download ledger PDF error:', err)
      toast.error('Error creating PDF.')
    } finally {
      setIsGenerating(false)
    }
  }

  // Share via WhatsApp
  const handleShareWhatsApp = async () => {
    setIsGenerating(true)
    try {
      const pdfFile = handleGeneratePdf()
      if (!pdfFile) return

      const clientMobile = selectedClient?.mobile?.replace(/\D/g, '') || ''
      const dueText =
        previewStats.closingBalance > 0
          ? `Outstanding Balance Due: Rs. ${previewStats.closingBalance.toLocaleString('en-IN')}`
          : previewStats.closingBalance < 0
            ? `Advance Credit Balance: Rs. ${Math.abs(previewStats.closingBalance).toLocaleString('en-IN')}`
            : 'All Dues Settled (Nil Balance)'

      const shareText = `*Account Ledger Statement - Anjani Water Suppliers*\nClient: *${selectedClient?.name || 'Customer'}*\nPeriod: ${computeDateRange().label}\n${dueText}\n\n_Official customer ledger statement attached._`

      // Try native share first
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))) {
        await navigator.share({
          title: `Ledger - ${selectedClient?.name || 'Statement'}`,
          text: shareText,
          files: [pdfFile],
        })
        toast.success('Shared successfully!')
        onClose()
        return
      }

      // Fallback: download PDF and open WhatsApp web/app link
      await shareOrDownloadPdf(
        pdfFile,
        `Customer Ledger - ${selectedClient?.name || 'Statement'}`,
        shareText,
      )

      if (clientMobile) {
        const waUrl = `https://wa.me/91${clientMobile}?text=${encodeURIComponent(shareText)}`
        window.open(waUrl, '_blank', 'noopener')
      }
      onClose()
    } catch (err) {
      if (err?.name === 'AbortError') return
      console.error('Share WhatsApp error:', err)
      toast.error('Error sharing ledger.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[1000] flex items-end sm:items-center justify-center p-2 sm:p-4 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-[#0f224a] to-[#183974] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#ff9900]">
              <BookText size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold tracking-tight">Customer Ledger Statement</h3>
              <p className="text-[11px] text-white/70">
                Generate official Dr/Cr statement with verified balances
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-gray-800 text-sm">
          {/* Customer Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Users size={13} className="text-[#ff9900]" /> Select Customer
              </label>
              {selectedClient && selectedClient.id !== 'all' && (
                <span
                  className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                    selectedClient.outstanding > 0
                      ? 'bg-red-50 text-red-600'
                      : 'bg-green-50 text-green-700'
                  }`}
                >
                  Current Due: ₹{Number(selectedClient.outstanding || 0).toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* Search filter for long customer lists */}
            {clients.length > 8 && (
              <div className="relative mb-2">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer name or mobile..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-[#ff9900] outline-none"
                />
              </div>
            )}

            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#ff9900]"
            >
              <option value="all">★ All Clients (Consolidated Ledger)</option>
              {filteredClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Unnamed Client'} {c.mobile ? `(${c.mobile})` : ''} — Due: ₹
                  {Number(c.outstanding || 0).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Selection */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-[#ff9900]" /> Statement Period
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-2.5">
              {[
                { id: 'today', label: 'Today' },
                { id: 'current-month', label: 'This Month' },
                { id: 'last-month', label: 'Last Month' },
                { id: 'past-6-months', label: '6 Months' },
                { id: 'this-fy', label: 'Financial Year' },
                { id: 'custom', label: 'Custom' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDateRangePreset(preset.id)}
                  className={`py-1.5 px-2 text-xs font-bold rounded-lg border transition-all text-center ${
                    dateRangePreset === preset.id
                      ? 'bg-[#0f224a] text-white border-[#0f224a] shadow-xs'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {dateRangePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-2 pt-1 pb-1 animate-in fade-in duration-150">
                <div>
                  <span className="text-[11px] font-bold text-gray-500">From Date</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-[#ff9900]"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-gray-500">To Date</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-[#ff9900]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Live Preview & Summary Metrics Card */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                <IndianRupee size={13} className="text-[#ff9900]" /> Statement Summary Preview
              </span>
              {loadingPreview ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600">
                  <Loader2 size={12} className="animate-spin" /> Calculating...
                </span>
              ) : (
                <span className="text-[11px] font-extrabold text-gray-500">
                  {previewStats.entriesCount} record{previewStats.entriesCount === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-2xs">
                <p className="text-[10px] font-bold uppercase text-gray-400">Opening (B/F)</p>
                <p className="text-xs font-black text-gray-700 truncate mt-0.5">
                  ₹{previewStats.openingBalance.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-2xs">
                <p className="text-[10px] font-bold uppercase text-blue-500">Billed (+Dr)</p>
                <p className="text-xs font-black text-blue-700 truncate mt-0.5">
                  +₹{previewStats.totalBilled.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-2xs">
                <p className="text-[10px] font-bold uppercase text-emerald-500">Paid (-Cr)</p>
                <p className="text-xs font-black text-emerald-700 truncate mt-0.5">
                  -₹{previewStats.totalPaid.toLocaleString('en-IN')}
                </p>
              </div>
              <div
                className={`rounded-xl p-2.5 border shadow-2xs ${
                  previewStats.closingBalance > 0
                    ? 'bg-red-50 border-red-100'
                    : previewStats.closingBalance < 0
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-white border-gray-100'
                }`}
              >
                <p
                  className={`text-[10px] font-bold uppercase ${
                    previewStats.closingBalance > 0
                      ? 'text-red-500'
                      : previewStats.closingBalance < 0
                        ? 'text-emerald-600'
                        : 'text-gray-400'
                  }`}
                >
                  {previewStats.closingBalance > 0
                    ? 'Closing Due'
                    : previewStats.closingBalance < 0
                      ? 'Advance Bal'
                      : 'Balance'}
                </p>
                <p
                  className={`text-xs font-black truncate mt-0.5 ${
                    previewStats.closingBalance > 0
                      ? 'text-red-600'
                      : previewStats.closingBalance < 0
                        ? 'text-emerald-700'
                        : 'text-gray-800'
                  }`}
                >
                  ₹{previewStats.closingBalance.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Note on zero transactions */}
            {!loadingPreview && previewStats.entriesCount === 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                <AlertCircle size={14} className="shrink-0" />
                <span>
                  No movements in this date range. Opening balance (₹
                  {previewStats.openingBalance.toLocaleString('en-IN')}) will be shown on the PDF statement.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Buttons */}
        <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              disabled={isGenerating || loadingPreview}
              onClick={handleShareWhatsApp}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all disabled:opacity-50"
            >
              <Share2 size={14} />
              Share (WhatsApp)
            </button>

            <button
              type="button"
              disabled={isGenerating || loadingPreview}
              onClick={handleDownload}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0f224a] hover:bg-[#183974] text-white text-xs font-extrabold shadow-sm transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <FileDown size={14} /> Download PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
