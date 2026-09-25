import { useState, useEffect, useMemo, useCallback } from 'react'
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
import CashHandoverModal from './CashHandoverModal'
import EditAccountEntryModal from './EditAccountEntryModal'
import toast from 'react-hot-toast'
import {
  Wallet,
  ArrowRightLeft,
  SlidersHorizontal,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react'

export default function AccountsDashboard() {
  const {
    accountsSummary,
    fetchAccountsSummary,
    updateAccountBalanceDirect,
    deleteAccountTransfer,
    deleteAccountExpense,
    deletePayment,
    clients,
  } = useClientStore()
  const [selectedAccountId, setSelectedAccountId] = useState('nilesh')
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [filterType, setFilterType] = useState('all') // 'all', 'collection', 'expense', 'transfer'
  const [handoverModalOpen, setHandoverModalOpen] = useState(false)
  const [handoverSource, setHandoverSource] = useState('nilesh')
  const [editingEntry, setEditingEntry] = useState(null)

  useEffect(() => {
    const unsub = fetchAccountsSummary()
    return () => {
      if (unsub) unsub()
    }
  }, [fetchAccountsSummary])

  const selectedMeta = getAccountMeta(selectedAccountId)
  const currentBalance = Number(accountsSummary?.[selectedAccountId] || 0)

  // Fetch statement entries for selected account
  const fetchLedger = useCallback(async () => {
    setLoadingEntries(true)
    try {
      const paymentsQ = query(
        collection(db, 'payments'),
        where('accountId', '==', selectedAccountId),
        limit(80),
      )

      const expensesQ = query(
        collection(db, 'expenses'),
        where('accountId', '==', selectedAccountId),
        limit(80),
      )

      const transfersOutQ = query(
        collection(db, 'account_transfers'),
        where('fromAccountId', '==', selectedAccountId),
        limit(80),
      )

      const transfersInQ = query(
        collection(db, 'account_transfers'),
        where('toAccountId', '==', selectedAccountId),
        limit(80),
      )

      const [paySnap, expSnap, trOutSnap, trInSnap] = await Promise.all([
        getDocs(paymentsQ),
        getDocs(expensesQ),
        getDocs(transfersOutQ),
        getDocs(transfersInQ),
      ])

      const combined = []

      // Collections
      paySnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        const amt = Number(d.amount) || 0
        const rawDate = d.date || d.paymentDate || d.createdAt
        const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
        const clientName =
          d.clientName || clients?.find((c) => c.id === d.clientId)?.name || ''
        const narration =
          d.narration ||
          (clientName ? formatPaymentNarration(clientName, rawDate) : d.note || '')
        combined.push({
          id: 'pay_' + docSnap.id,
          rawId: docSnap.id,
          rawDoc: d,
          type: 'collection',
          direction: 'in',
          title: clientName || 'Payment',
          note: narration,
          amount: amt,
          timestamp: timestamp || Date.now(),
          date: rawDate,
        })
      })

      // Expenses
      expSnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        const amt = Number(d.amount) || 0
        const rawDate = d.date || d.createdAt
        const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
        combined.push({
          id: 'exp_' + docSnap.id,
          rawId: docSnap.id,
          rawDoc: d,
          type: 'expense',
          direction: 'out',
          title: d.category || 'Expense',
          note: d.note || '',
          amount: amt,
          timestamp: timestamp || Date.now(),
          date: rawDate,
        })
      })

      // Transfers OUT (Handover to Counter/Bank)
      trOutSnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        const amt = Number(d.amount) || 0
        const targetMeta = getAccountMeta(d.toAccountId)
        const rawDate = d.date || d.createdAt
        const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
        combined.push({
          id: 'tr_out_' + docSnap.id,
          rawId: docSnap.id,
          rawDoc: d,
          type: 'transfer',
          direction: 'out',
          title: `To ${targetMeta.shortLabel}`,
          note: d.notes || '',
          amount: amt,
          timestamp: timestamp || Date.now(),
          date: rawDate,
        })
      })

      // Transfers IN (Received from other account)
      trInSnap.docs.forEach((docSnap) => {
        const d = docSnap.data()
        const amt = Number(d.amount) || 0
        const sourceMeta = getAccountMeta(d.fromAccountId)
        const rawDate = d.date || d.createdAt
        const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
        combined.push({
          id: 'tr_in_' + docSnap.id,
          rawId: docSnap.id,
          rawDoc: d,
          type: 'transfer',
          direction: 'in',
          title: `From ${sourceMeta.shortLabel}`,
          note: d.notes || '',
          amount: amt,
          timestamp: timestamp || Date.now(),
          date: rawDate,
        })
      })

      combined.sort((a, b) => b.timestamp - a.timestamp)
      setEntries(combined)
    } catch (err) {
      console.error('Failed to load ledger:', err)
    } finally {
      setLoadingEntries(false)
    }
  }, [selectedAccountId])

  useEffect(() => {
    fetchLedger()
  }, [fetchLedger])

  const handleDeleteEntry = async (item) => {
    const isOk = window.confirm(
      `Are you sure you want to delete this ${item.type} of ₹${item.amount.toLocaleString('en-IN')}?\nBalances will be updated automatically.`
    )
    if (!isOk) return

    try {
      if (item.type === 'transfer') {
        await deleteAccountTransfer(item.rawId)
      } else if (item.type === 'expense') {
        await deleteAccountExpense(item.rawId)
      } else if (item.type === 'collection') {
        await deletePayment(item.rawId)
      }
      toast.success('Entry deleted and balances adjusted')
      fetchLedger()
    } catch (err) {
      console.error('Delete failed:', err)
      toast.error('Failed to delete: ' + err.message)
    }
  }

  const filteredEntries = useMemo(() => {
    if (filterType === 'all') return entries
    return entries.filter((item) => item.type === filterType)
  }, [entries, filterType])

  const totals = useMemo(() => {
    let collections = 0
    let expenses = 0
    let handovers = 0

    entries.forEach((e) => {
      if (e.type === 'collection') collections += e.amount
      else if (e.type === 'expense') expenses += e.amount
      else if (e.type === 'transfer' && e.direction === 'out') handovers += e.amount
    })

    return { collections, expenses, handovers }
  }, [entries])

  const handlePromptAdjustBalance = async () => {
    const input = window.prompt(
      `Set balance for ${selectedMeta.name} (current: ₹${currentBalance}):`,
      String(currentBalance || 0),
    )
    if (input === null) return
    const parsed = parseFloat(input)
    if (isNaN(parsed)) {
      toast.error('Invalid number')
      return
    }
    try {
      await updateAccountBalanceDirect(selectedAccountId, parsed)
      toast.success(`${selectedMeta.shortLabel} balance set to ₹${parsed.toLocaleString('en-IN')}`)
    } catch (err) {
      toast.error('Update failed: ' + err.message)
    }
  }

  const formatEntryDate = (entry) => {
    if (!entry.date) return ''
    const d = entry.date.toDate ? entry.date.toDate() : new Date(entry.timestamp || entry.date)
    if (isNaN(d.getTime())) return ''
    return (
      d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
      ', ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    )
  }

  const totalStaffCash =
    Number(accountsSummary?.nilesh || 0) + Number(accountsSummary?.hiteshbhai || 0)

  return (
    <div className="space-y-2 pb-20">
      {/* ─── Compact Top Banner ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3 text-white shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Wallet size={15} className="text-[#ff9900]" />
            <h1 className="text-xs font-black uppercase tracking-wider">
              Accounts & Cash
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setHandoverSource(selectedAccountId)
              setHandoverModalOpen(true)
            }}
            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-[#ff9900] hover:bg-orange-600 text-white flex items-center gap-1 shadow-xs active:scale-95 transition-all shrink-0"
          >
            <ArrowRightLeft size={12} />
            Handover Cash
          </button>
        </div>

        <div className="mt-2 pt-2 border-t border-white/10 grid grid-cols-2 gap-2">
          <div>
            <span className="text-[9px] font-black uppercase text-white/60 tracking-wider block">
              Staff Cash
            </span>
            <p className="text-lg font-black text-amber-300 leading-tight">
              ₹{totalStaffCash.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-black uppercase text-white/60 tracking-wider block">
              Counter Drawer
            </span>
            <p className="text-lg font-black text-emerald-300 leading-tight">
              ₹{(Number(accountsSummary?.counter) || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* ─── 4 Account Cards (Compact Grid) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {DEFAULT_ACCOUNTS.map((acc) => {
          const isSelected = selectedAccountId === acc.id
          const balance = Number(accountsSummary?.[acc.id] || 0)
          const isCustody = acc.type === 'custody'

          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => setSelectedAccountId(acc.id)}
              className={`p-2 rounded-xl border transition-all text-left flex flex-col justify-between ${
                isSelected
                  ? 'border-[#ff9900] bg-orange-50/70 shadow-xs ring-1 ring-[#ff9900]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: acc.color }}
                  />
                  <span className="font-extrabold text-xs text-gray-900 truncate">
                    {acc.name}
                  </span>
                </div>
                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff9900] shrink-0" />
                )}
              </div>

              <div className="mt-1">
                <p
                  className={`text-base font-black leading-none ${
                    balance > 0
                      ? isCustody
                        ? 'text-blue-600'
                        : 'text-emerald-600'
                      : balance < 0
                      ? 'text-red-500'
                      : 'text-gray-500'
                  }`}
                >
                  ₹{balance.toLocaleString('en-IN')}
                </p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ─── Passbook Statement Section ─── */}
      <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-gray-100 space-y-2">
        {/* Passbook Header Toolbar */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selectedMeta.color }}
            />
            <span className="font-black text-xs uppercase tracking-wide text-gray-800 truncate">
              {selectedMeta.name} Passbook
            </span>
            <button
              type="button"
              onClick={handlePromptAdjustBalance}
              className="text-[9px] font-bold text-gray-500 hover:text-gray-800 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 flex items-center gap-0.5 shrink-0"
              title="Set Opening or Reconciled Balance"
            >
              <SlidersHorizontal size={9} />
              Set
            </button>
          </div>

          {/* 3-metric compact totals */}
          <div className="flex items-center gap-1.5 text-[10px] font-black shrink-0">
            <span className="text-emerald-600">+{totals.collections.toLocaleString('en-IN')}</span>
            <span className="text-gray-300">|</span>
            <span className="text-red-500">-{totals.expenses.toLocaleString('en-IN')}</span>
            <span className="text-gray-300">|</span>
            <span className="text-blue-600">-{totals.handovers.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'collection', label: 'In (+)' },
              { id: 'expense', label: 'Expenses (-)' },
              { id: 'transfer', label: 'Transfers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-[#131921] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[10px] font-bold text-gray-400 shrink-0">
            {filteredEntries.length} entries
          </span>
        </div>

        {/* Dense, Clean Statement Feed */}
        <div className="space-y-1">
          {loadingEntries ? (
            <div className="flex items-center justify-center py-8 text-gray-400 font-bold gap-2 text-xs">
              <Loader2 className="animate-spin text-blue-500" size={16} />
              Loading…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-6 text-center text-xs font-bold text-gray-400">
              No transactions recorded
            </div>
          ) : (
            filteredEntries.map((item) => {
              const isPositive = item.direction === 'in'

              return (
                <div
                  key={item.id}
                  className="bg-white px-2.5 py-2 rounded-xl border border-gray-100 hover:border-gray-200 flex items-center justify-between gap-2 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-gray-900 truncate">
                        {item.title}
                      </span>
                      {item.note && (
                        <span
                          className="text-[10px] text-gray-400 truncate max-w-[200px] sm:max-w-xs"
                          title={item.note}
                        >
                          • {item.note}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 font-semibold block">
                      {formatEntryDate(item)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span
                        className={`font-black text-xs block ${
                          isPositive ? 'text-emerald-600' : 'text-red-500'
                        }`}
                      >
                        {isPositive ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[8px] font-black uppercase text-gray-400">
                        {item.type === 'collection'
                          ? 'Inward'
                          : item.type === 'expense'
                          ? 'Expense'
                          : 'Transfer'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 border-l border-gray-100 pl-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingEntry(item)}
                        className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                        title="Edit Entry"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEntry(item)}
                        className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                        title="Delete Entry"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Cash Handover Modal */}
      <CashHandoverModal
        isOpen={handoverModalOpen}
        onClose={() => {
          setHandoverModalOpen(false)
          fetchLedger()
        }}
        initialSource={handoverSource}
        accountsSummary={accountsSummary}
      />

      {/* Edit Account Entry Modal */}
      <EditAccountEntryModal
        isOpen={Boolean(editingEntry)}
        onClose={() => setEditingEntry(null)}
        entry={editingEntry}
        onSaveSuccess={() => {
          fetchLedger()
        }}
      />
    </div>
  )
}
