import { useState, useEffect, useMemo } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { getAccountMeta } from '../constants/accounts'
import { useClientStore } from '../store/clientStore'
import toast from 'react-hot-toast'
import {
  X,
  IndianRupee,
  Receipt,
  ArrowRightLeft,
  Loader2,
  Calendar,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  SlidersHorizontal,
} from 'lucide-react'

export default function AccountPassbookModal({
  isOpen,
  onClose,
  accountId = 'nilesh',
  currentBalance = 0,
  onOpenHandover,
}) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all') // 'all', 'collection', 'expense', 'transfer'
  const updateAccountBalanceDirect = useClientStore((state) => state.updateAccountBalanceDirect)

  const accountMeta = getAccountMeta(accountId)

  const handlePromptAdjustBalance = async () => {
    const input = window.prompt(
      `Set opening / reconciled balance for ${accountMeta.name} (current: ₹${currentBalance}):`,
      String(currentBalance || 0),
    )
    if (input === null) return
    const parsed = parseFloat(input)
    if (isNaN(parsed)) {
      toast.error('Invalid number entered')
      return
    }
    try {
      await updateAccountBalanceDirect(accountId, parsed)
      toast.success(`Balance for ${accountMeta.shortLabel} set to ₹${parsed.toLocaleString('en-IN')}`)
    } catch (err) {
      toast.error('Failed to update balance: ' + err.message)
    }
  }

  useEffect(() => {
    if (!isOpen || !accountId) return

    let isMounted = true
    setLoading(true)

    const fetchLedger = async () => {
      try {
        // 1. Fetch payments collected by this account
        const paymentsQ = query(
          collection(db, 'payments'),
          where('accountId', '==', accountId),
          limit(60),
        )

        // 2. Fetch expenses paid from this account
        const expensesQ = query(
          collection(db, 'expenses'),
          where('accountId', '==', accountId),
          limit(60),
        )

        // 3. Fetch transfers OUT from this account
        const transfersOutQ = query(
          collection(db, 'account_transfers'),
          where('fromAccountId', '==', accountId),
          limit(60),
        )

        // 4. Fetch transfers IN to this account
        const transfersInQ = query(
          collection(db, 'account_transfers'),
          where('toAccountId', '==', accountId),
          limit(60),
        )

        const [paySnap, expSnap, trOutSnap, trInSnap] = await Promise.all([
          getDocs(paymentsQ),
          getDocs(expensesQ),
          getDocs(transfersOutQ),
          getDocs(transfersInQ),
        ])

        if (!isMounted) return

        const combined = []

        // Parse payments (Collections / Inflow)
        paySnap.docs.forEach((docSnap) => {
          const d = docSnap.data()
          const amt = Number(d.amount) || 0
          const rawDate = d.date || d.paymentDate || d.createdAt
          const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
          combined.push({
            id: 'pay_' + docSnap.id,
            type: 'collection',
            direction: 'in',
            title: d.clientName || 'Customer Payment',
            subtitle: d.note ? `Note: ${d.note}` : 'Payment Received',
            amount: amt,
            timestamp: timestamp || Date.now(),
            date: rawDate,
            raw: d,
          })
        })

        // Parse expenses (Outflow)
        expSnap.docs.forEach((docSnap) => {
          const d = docSnap.data()
          const amt = Number(d.amount) || 0
          const rawDate = d.date || d.createdAt
          const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
          combined.push({
            id: 'exp_' + docSnap.id,
            type: 'expense',
            direction: 'out',
            title: d.category || 'Expense',
            subtitle: d.note ? `Note: ${d.note}` : 'Staff Expense Paid',
            amount: amt,
            timestamp: timestamp || Date.now(),
            date: rawDate,
            raw: d,
          })
        })

        // Parse transfers OUT (Cash Handover to Counter/Bank)
        trOutSnap.docs.forEach((docSnap) => {
          const d = docSnap.data()
          const amt = Number(d.amount) || 0
          const targetMeta = getAccountMeta(d.toAccountId)
          const rawDate = d.date || d.createdAt
          const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
          combined.push({
            id: 'tr_out_' + docSnap.id,
            type: 'transfer',
            direction: 'out',
            title: `Handover to ${targetMeta.shortLabel}`,
            subtitle: d.notes ? `Note: ${d.notes}` : 'Cash Handover / Settlement',
            amount: amt,
            timestamp: timestamp || Date.now(),
            date: rawDate,
            raw: d,
          })
        })

        // Parse transfers IN (Cash received from staff/counter)
        trInSnap.docs.forEach((docSnap) => {
          const d = docSnap.data()
          const amt = Number(d.amount) || 0
          const sourceMeta = getAccountMeta(d.fromAccountId)
          const rawDate = d.date || d.createdAt
          const timestamp = rawDate?.seconds ? rawDate.seconds * 1000 : new Date(rawDate).getTime()
          combined.push({
            id: 'tr_in_' + docSnap.id,
            type: 'transfer',
            direction: 'in',
            title: `Received from ${sourceMeta.shortLabel}`,
            subtitle: d.notes ? `Note: ${d.notes}` : 'Cash Inward Transfer',
            amount: amt,
            timestamp: timestamp || Date.now(),
            date: rawDate,
            raw: d,
          })
        })

        // Sort descending by timestamp
        combined.sort((a, b) => b.timestamp - a.timestamp)

        setEntries(combined)
      } catch (err) {
        console.error('Failed to load passbook:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchLedger()

    return () => {
      isMounted = false
    }
  }, [isOpen, accountId])

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

  if (!isOpen) return null

  const formatEntryDate = (entry) => {
    if (!entry.date) return ''
    if (entry.date.toDate) return entry.date.toDate().toLocaleDateString('en-IN')
    if (typeof entry.date === 'string') return entry.date.slice(0, 10)
    return new Date(entry.timestamp).toLocaleDateString('en-IN')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Passbook Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 rounded-full border-2 border-white/40 shrink-0"
                style={{ backgroundColor: accountMeta.color }}
              />
              <div>
                <h2 className="text-base font-black leading-tight">
                  {accountMeta.name} Passbook
                </h2>
                <p className="text-[11px] text-white/70 font-semibold">
                  Account Ledger & Custody Statement
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

          {/* Balance & Stat Cards */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/70 block">
                  Current Balance
                </span>
                <button
                  type="button"
                  onClick={handlePromptAdjustBalance}
                  className="text-[9px] font-extrabold uppercase bg-white/10 hover:bg-white/20 text-white px-1.5 py-0.5 rounded flex items-center gap-1 transition-all"
                  title="Set or adjust opening/reconciled balance"
                >
                  <SlidersHorizontal size={9} /> Set
                </button>
              </div>
              <p className="text-2xl font-black leading-tight text-emerald-300 mt-1">
                ₹{Number(currentBalance).toLocaleString('en-IN')}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] font-black uppercase text-white/80">
                <span>Collections</span>
                <span className="text-emerald-300">+₹{totals.collections.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-black uppercase text-white/80">
                <span>Expenses</span>
                <span className="text-red-300">-₹{totals.expenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-black uppercase text-white/80">
                <span>Handovers</span>
                <span className="text-blue-300">-₹{totals.handovers.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs & Quick Action */}
        <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'collection', label: 'Collections' },
              { id: 'expense', label: 'Expenses' },
              { id: 'transfer', label: 'Transfers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase transition-all ${
                  filterType === tab.id
                    ? 'bg-[#131921] text-white shadow-xs'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {accountMeta.type === 'custody' && onOpenHandover && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenHandover(accountId)
              }}
              className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-[#ff9900] text-white hover:bg-orange-600 shadow-xs flex items-center gap-1 active:scale-95 transition-all shrink-0"
            >
              <ArrowRightLeft size={12} />
              Handover Cash
            </button>
          )}
        </div>

        {/* Entries List */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 font-bold italic gap-2">
              <Loader2 className="animate-spin text-blue-500" size={24} />
              Loading statement…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center space-y-2 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <AlertCircle size={32} className="text-gray-300" />
              <p className="text-xs font-bold italic">No statement entries recorded</p>
            </div>
          ) : (
            filteredEntries.map((item) => {
              const isPositive = item.direction === 'in'
              let iconBg = isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
              let Icon = isPositive ? PlusCircle : MinusCircle

              if (item.type === 'transfer') {
                iconBg = isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                Icon = ArrowRightLeft
              } else if (item.type === 'expense') {
                Icon = Receipt
              }

              return (
                <div
                  key={item.id}
                  className="relative overflow-hidden bg-white p-2.5 rounded-2xl border border-gray-100 shadow-xs hover:border-gray-200 transition-all flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${iconBg}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-xs text-gray-900 truncate">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate">{item.subtitle}</p>
                      <p className="text-[9px] text-gray-400 font-semibold flex items-center gap-1 mt-0.5">
                        <Calendar size={9} /> {formatEntryDate(item)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-black text-sm ${
                        isPositive ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {isPositive ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </p>
                    <span className="text-[8px] font-black uppercase text-gray-400 tracking-wider">
                      {item.type}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
