import React, { useState, useMemo } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'
import { formatPaymentNarration } from '../utils/orderUtils'
import { buildAccountsLedgerPdf, shareOrDownloadPdf, resolveTimestamp } from '../utils/pdf'
import toast from 'react-hot-toast'
import {
  X,
  Wallet,
  Calendar,
  Filter,
  FileDown,
  Loader2,
  Users,
  Store,
  CreditCard,
  Layers,
} from 'lucide-react'

export default function AccountsLedgerReportModal({
  isOpen,
  onClose,
  initialAccountId = 'all',
}) {
  const { accountsSummary, clients } = useClientStore()

  // Employee / Account Selection
  const [selectedAccount, setSelectedAccount] = useState(initialAccountId || 'all')

  // Date Range Presets
  const [dateRangePreset, setDateRangePreset] = useState('current-month')

  // Helper to get default YYYY-MM-DD
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const firstOfMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])

  const [customStartDate, setCustomStartDate] = useState(firstOfMonthStr)
  const [customEndDate, setCustomEndDate] = useState(todayStr)

  // Transaction Filter Type
  const [filterType, setFilterType] = useState('all') // 'all', 'collection', 'expense', 'transfer'

  const [generating, setGenerating] = useState(false)

  if (!isOpen) return null

  // Resolve start and end dates from preset
  const computeDateRange = () => {
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

    if (dateRangePreset === 'yesterday') {
      start.setDate(start.getDate() - 1)
      const yesterdayEnd = new Date(start)
      yesterdayEnd.setHours(23, 59, 59, 999)
      label = `Yesterday (${start.toLocaleDateString('en-IN')})`
      return { startDate: start, endDate: yesterdayEnd, label }
    }

    if (dateRangePreset === 'this-week') {
      const day = start.getDay() // 0 = Sun
      const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Monday
      start.setDate(diff)
      label = `This Week (${start.toLocaleDateString('en-IN')} - ${end.toLocaleDateString('en-IN')})`
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

    if (dateRangePreset === 'past-3-months') {
      start.setMonth(start.getMonth() - 3)
      label = `Past 3 Months (${start.toLocaleDateString('en-IN', { month: 'short' })} - ${end.toLocaleDateString('en-IN', { month: 'short' })})`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'past-6-months') {
      start.setMonth(start.getMonth() - 6)
      label = `Past 6 Months (${start.toLocaleDateString('en-IN', { month: 'short' })} - ${end.toLocaleDateString('en-IN', { month: 'short' })})`
      return { startDate: start, endDate: end, label }
    }

    if (dateRangePreset === 'all-time') {
      const allTimeStart = new Date(2020, 0, 1, 0, 0, 0, 0)
      label = 'All Time'
      return { startDate: allTimeStart, endDate: end, label }
    }

    // Custom
    const cStart = new Date(customStartDate)
    cStart.setHours(0, 0, 0, 0)
    const cEnd = new Date(customEndDate)
    cEnd.setHours(23, 59, 59, 999)
    label = `${cStart.toLocaleDateString('en-IN')} to ${cEnd.toLocaleDateString('en-IN')}`
    return { startDate: cStart, endDate: cEnd, label }
  }

  const handleGeneratePdf = async () => {
    setGenerating(true)
    try {
      const { startDate, endDate, label: dateRangeLabel } = computeDateRange()

      // Determine which accounts to fetch
      let targetAccountIds = []
      let accountTitle = 'All Accounts & Staff'
      let accountType = 'Consolidated'

      if (selectedAccount === 'all') {
        targetAccountIds = DEFAULT_ACCOUNTS.map((a) => a.id)
        accountTitle = 'All Accounts & Staff'
        accountType = 'Consolidated Master Ledger'
      } else if (selectedAccount === 'staff_custody') {
        targetAccountIds = ['nilesh', 'hiteshbhai']
        accountTitle = 'Delivery Staff Cash Custody'
        accountType = 'Nilesh + Hiteshbhai'
      } else {
        targetAccountIds = [selectedAccount]
        const meta = getAccountMeta(selectedAccount)
        accountTitle = meta.name
        accountType = meta.description || (meta.type === 'custody' ? 'Staff Cash Custody' : 'Company Account')
      }

      // Fetch collections
      const fetchPayments = async () => {
        if (selectedAccount === 'all') {
          const snap = await getDocs(query(collection(db, 'payments'), limit(500)))
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        }
        if (selectedAccount === 'staff_custody') {
          const snap = await getDocs(
            query(collection(db, 'payments'), where('accountId', 'in', ['nilesh', 'hiteshbhai']), limit(500)),
          )
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        }
        const snap = await getDocs(
          query(collection(db, 'payments'), where('accountId', '==', selectedAccount), limit(500)),
        )
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      }

      // Fetch expenses
      const fetchExpenses = async () => {
        if (selectedAccount === 'all') {
          const snap = await getDocs(query(collection(db, 'expenses'), limit(500)))
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        }
        if (selectedAccount === 'staff_custody') {
          const snap = await getDocs(
            query(collection(db, 'expenses'), where('accountId', 'in', ['nilesh', 'hiteshbhai']), limit(500)),
          )
          return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        }
        const snap = await getDocs(
          query(collection(db, 'expenses'), where('accountId', '==', selectedAccount), limit(500)),
        )
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      }

      // Fetch transfers
      const fetchTransfers = async () => {
        const snap = await getDocs(query(collection(db, 'account_transfers'), limit(500)))
        const allTransfers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

        if (selectedAccount === 'all') {
          return allTransfers
        }
        if (selectedAccount === 'staff_custody') {
          return allTransfers.filter(
            (t) =>
              ['nilesh', 'hiteshbhai'].includes(t.fromAccountId) ||
              ['nilesh', 'hiteshbhai'].includes(t.toAccountId),
          )
        }
        return allTransfers.filter(
          (t) => t.fromAccountId === selectedAccount || t.toAccountId === selectedAccount,
        )
      }

      const [payments, expenses, transfers] = await Promise.all([
        fetchPayments(),
        fetchExpenses(),
        fetchTransfers(),
      ])

      const rawCombined = []

      // 1. Process Collections
      payments.forEach((p) => {
        const amt = Number(p.amount) || 0
        const rawDate = p.date || p.paymentDate || p.createdAt
        const parsedDate = resolveTimestamp(rawDate)
        const ts = parsedDate ? parsedDate.getTime() : Date.now()
        const clientName =
          p.clientName || clients?.find((c) => c.id === p.clientId)?.name || ''
        const narration =
          p.narration ||
          (clientName ? formatPaymentNarration(clientName, rawDate, p.note) : p.note || 'Collection')

        const accMeta = getAccountMeta(p.accountId || 'counter')

        rawCombined.push({
          id: 'pay_' + p.id,
          type: 'collection',
          direction: 'in',
          title: clientName || 'Client Payment',
          note: narration,
          amount: amt,
          timestamp: ts,
          date: parsedDate || rawDate,
          accountId: p.accountId || 'counter',
          accountName: accMeta.shortLabel,
        })
      })

      // 2. Process Expenses
      expenses.forEach((e) => {
        const amt = Number(e.amount) || 0
        const rawDate = e.date || e.createdAt
        const parsedDate = resolveTimestamp(rawDate)
        const ts = parsedDate ? parsedDate.getTime() : Date.now()
        const accMeta = getAccountMeta(e.accountId || 'counter')

        rawCombined.push({
          id: 'exp_' + e.id,
          type: 'expense',
          direction: 'out',
          title: e.category || 'Expense',
          note: e.note || e.description || '-',
          amount: amt,
          timestamp: ts,
          date: parsedDate || rawDate,
          accountId: e.accountId || 'counter',
          accountName: accMeta.shortLabel,
        })
      })

      // 3. Process Transfers
      transfers.forEach((tr) => {
        const amt = Number(tr.amount) || 0
        const rawDate = tr.date || tr.createdAt
        const parsedDate = resolveTimestamp(rawDate)
        const ts = parsedDate ? parsedDate.getTime() : Date.now()
        const fromMeta = getAccountMeta(tr.fromAccountId)
        const toMeta = getAccountMeta(tr.toAccountId)

        if (selectedAccount === 'all') {
          // In consolidated view, record transfer as an internal movement
          rawCombined.push({
            id: 'tr_' + tr.id,
            type: 'transfer',
            direction: 'out',
            title: `${fromMeta.shortLabel} → ${toMeta.shortLabel}`,
            note: tr.notes || 'Internal Account Transfer',
            amount: amt,
            timestamp: ts,
            date: parsedDate || rawDate,
            accountId: tr.fromAccountId,
            accountName: fromMeta.shortLabel,
          })
        } else {
          // If transfer out from selected account
          if (targetAccountIds.includes(tr.fromAccountId)) {
            rawCombined.push({
              id: 'tr_out_' + tr.id,
              type: 'transfer',
              direction: 'out',
              title: `To ${toMeta.shortLabel}`,
              note: tr.notes || 'Handover Out',
              amount: amt,
              timestamp: ts,
              date: parsedDate || rawDate,
              accountId: tr.fromAccountId,
              accountName: fromMeta.shortLabel,
            })
          }
          // If transfer in to selected account
          if (targetAccountIds.includes(tr.toAccountId)) {
            rawCombined.push({
              id: 'tr_in_' + tr.id,
              type: 'transfer',
              direction: 'in',
              title: `From ${fromMeta.shortLabel}`,
              note: tr.notes || 'Handover In',
              amount: amt,
              timestamp: ts,
              date: parsedDate || rawDate,
              accountId: tr.toAccountId,
              accountName: toMeta.shortLabel,
            })
          }
        }
      })

      // Chronological sort: oldest to newest for clean running balance
      rawCombined.sort((a, b) => a.timestamp - b.timestamp)

      // Calculate opening balance for transactions strictly BEFORE startDate
      const startMs = startDate.getTime()
      const endMs = endDate.getTime()

      let calculatedOpeningBalance = 0
      const priorTxns = rawCombined.filter((t) => t.timestamp < startMs)
      priorTxns.forEach((tx) => {
        if (tx.type === 'collection') calculatedOpeningBalance += tx.amount
        else if (tx.type === 'expense') calculatedOpeningBalance -= tx.amount
        else if (tx.type === 'transfer') {
          if (tx.direction === 'in') calculatedOpeningBalance += tx.amount
          else calculatedOpeningBalance -= tx.amount
        }
      })

      // Filter transactions within the selected date range
      let periodTxns = rawCombined.filter((t) => t.timestamp >= startMs && t.timestamp <= endMs)

      // Apply optional transaction type filter
      if (filterType !== 'all') {
        periodTxns = periodTxns.filter((t) => t.type === filterType)
      }

      if (periodTxns.length === 0) {
        toast('No transactions found for the selected criteria, but generating statement.', {
          icon: 'ℹ️',
        })
      }

      const filterTypeLabels = {
        all: 'All Transactions',
        collection: 'Collections Only (+)',
        expense: 'Expenses Only (-)',
        transfer: 'Transfers / Handovers Only',
      }

      // Generate PDF
      const pdfFile = buildAccountsLedgerPdf({
        accountTitle,
        accountType,
        dateRangeLabel,
        accountsSummary,
        txns: periodTxns,
        openingBalance: calculatedOpeningBalance,
        filterTypeLabel: filterTypeLabels[filterType] || 'All Entries',
      })

      await shareOrDownloadPdf(
        pdfFile,
        `Ledger: ${accountTitle}`,
        `Accounts and cash ledger report for ${accountTitle} (${dateRangeLabel})`,
      )
      onClose()
    } catch (err) {
      console.error('Failed to generate Accounts Ledger PDF:', err)
      toast.error('Failed to generate PDF: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const staffCashTotal =
    Number(accountsSummary?.nilesh || 0) + Number(accountsSummary?.hiteshbhai || 0)

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[1000] flex items-end sm:items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-5 space-y-4 text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shadow-xs">
              <Wallet size={20} />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-gray-900">
                Accounts & Cash Ledger (PDF)
              </h2>
              <p className="text-[11px] font-semibold text-gray-500">
                Select employee custody account, date range, and export PDF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* 1. EMPLOYEE & ACCOUNT SELECTION */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <Users size={14} className="text-blue-600" />
              1. Employee / Account Section
            </label>
            <span className="text-[10px] font-bold text-gray-400">
              Select specific employee or all
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* All Accounts Master */}
            <button
              type="button"
              onClick={() => setSelectedAccount('all')}
              className={`p-2.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                selectedAccount === 'all'
                  ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/30'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gray-900 text-white flex items-center justify-center font-black text-xs">
                  <Layers size={14} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-gray-900">All Accounts & Staff</p>
                  <p className="text-[10px] text-gray-500">Consolidated Master Ledger</p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                All
              </span>
            </button>

            {/* All Staff Custody */}
            <button
              type="button"
              onClick={() => setSelectedAccount('staff_custody')}
              className={`p-2.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                selectedAccount === 'staff_custody'
                  ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/30'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                  <Users size={14} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-gray-900">All Delivery Staff</p>
                  <p className="text-[10px] text-gray-500">Nilesh + Hiteshbhai Custody</p>
                </div>
              </div>
              <span className="text-xs font-black text-blue-700">
                ₹{staffCashTotal.toLocaleString('en-IN')}
              </span>
            </button>

            {/* Individual Accounts & Employees */}
            {DEFAULT_ACCOUNTS.map((acc) => {
              const isSelected = selectedAccount === acc.id
              const bal = Number(accountsSummary?.[acc.id] || 0)
              const isEmployee = acc.type === 'custody'

              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedAccount(acc.id)}
                  className={`p-2.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/30'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                    <div>
                      <p className="text-xs font-extrabold text-gray-900 flex items-center gap-1">
                        {acc.name}
                        {isEmployee && (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded">
                            Staff
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-gray-500">{acc.description}</p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-black ${
                      bal > 0
                        ? isEmployee
                          ? 'text-blue-600'
                          : 'text-emerald-600'
                        : bal < 0
                        ? 'text-red-500'
                        : 'text-gray-500'
                    }`}
                  >
                    ₹{bal.toLocaleString('en-IN')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 2. DATE RANGE SELECTION */}
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Calendar size={14} className="text-blue-600" />
            2. Date Range Selection
          </label>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this-week', label: 'This Week' },
              { id: 'current-month', label: 'Current Month' },
              { id: 'last-month', label: 'Last Month' },
              { id: 'past-3-months', label: '3 Months' },
              { id: 'past-6-months', label: '6 Months' },
              { id: 'all-time', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDateRangePreset(p.id)}
                className={`py-1.5 px-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                  dateRangePreset === p.id
                    ? 'bg-[#131921] text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {dateRangePreset === 'custom' && (
            <div className="grid grid-cols-2 gap-2 pt-2 bg-gray-50 p-2.5 rounded-2xl border border-gray-200">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                  Start Date
                </span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-gray-500 block mb-1">
                  End Date
                </span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. TRANSACTION TYPE FILTER */}
        <div className="space-y-1.5 pt-2 border-t border-gray-100">
          <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
            <Filter size={14} className="text-blue-600" />
            3. Transaction Filter
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {[
              { id: 'all', label: 'All Entries' },
              { id: 'collection', label: 'Inward (+)' },
              { id: 'expense', label: 'Expenses (-)' },
              { id: 'transfer', label: 'Transfers' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={`py-1 px-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                  filterType === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={generating}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={handleGeneratePdf}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-md active:scale-98 transition-all cursor-pointer disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating PDF…
              </>
            ) : (
              <>
                <FileDown size={15} />
                Generate PDF Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
