import { useState, useEffect, useMemo } from 'react'
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
import CashHandoverModal from './CashHandoverModal'
import toast from 'react-hot-toast'
import {
  Wallet,
  ArrowRightLeft,
  Calendar,
  Loader2,
  AlertCircle,
  PlusCircle,
  MinusCircle,
  Receipt,
  SlidersHorizontal,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react'

export default function AccountsDashboard() {
  const { accountsSummary, fetchAccountsSummary, updateAccountBalanceDirect } = useClientStore()
  const [selectedAccountId, setSelectedAccountId] = useState('nilesh')
  const [entries, setEntries] = useState([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [filterType, setFilterType] = useState('all') // 'all', 'collection', 'expense', 'transfer'
  const [handoverModalOpen, setHandoverModalOpen] = useState(false)
  const [handoverSource, setHandoverSource] = useState('nilesh')

  useEffect(() => {
    const unsub = fetchAccountsSummary()
    return () => {
      if (unsub) unsub()
    }
  }, [fetchAccountsSummary])

  const selectedMeta = getAccountMeta(selectedAccountId)
  const currentBalance = Number(accountsSummary?.[selectedAccountId] || 0)

  // Fetch statement entries for selected account
  useEffect(() => {
    let isMounted = true
    setLoadingEntries(true)

    const fetchLedger = async () => {
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

        if (!isMounted) return

        const combined = []

        // Collections
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
            type: 'expense',
            direction: 'out',
            title: d.category || 'Expense',
            subtitle: d.note ? `Note: ${d.note}` : 'Staff Expense Paid',
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
            type: 'transfer',
            direction: 'out',
            title: `Handover to ${targetMeta.shortLabel}`,
            subtitle: d.notes ? `Note: ${d.notes}` : 'Cash Handover / Settlement',
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
            type: 'transfer',
            direction: 'in',
            title: `Received from ${sourceMeta.shortLabel}`,
            subtitle: d.notes ? `Note: ${d.notes}` : 'Cash Inward Transfer',
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
        if (isMounted) setLoadingEntries(false)
      }
    }

    fetchLedger()

    return () => {
      isMounted = false
    }
  }, [selectedAccountId])

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
      `Set opening or reconciled balance for ${selectedMeta.name} (current: ₹${currentBalance}):`,
      String(currentBalance || 0),
    )
    if (input === null) return
    const parsed = parseFloat(input)
    if (isNaN(parsed)) {
      toast.error('Invalid number entered')
      return
    }
    try {
      await updateAccountBalanceDirect(selectedAccountId, parsed)
      toast.success(
        `Balance for ${selectedMeta.shortLabel} set to ₹${parsed.toLocaleString('en-IN')}`,
      )
    } catch (err) {
      toast.error('Failed to update balance: ' + err.message)
    }
  }

  const formatEntryDate = (entry) => {
    if (!entry.date) return ''
    if (entry.date.toDate) return entry.date.toDate().toLocaleDateString('en-IN')
    if (typeof entry.date === 'string') return entry.date.slice(0, 10)
    return new Date(entry.timestamp).toLocaleDateString('en-IN')
  }

  const totalStaffCash =
    Number(accountsSummary?.nilesh || 0) + Number(accountsSummary?.hiteshbhai || 0)

  return (
    <div className="space-y-4 px-2 sm:px-0 pb-20">
      {/* ─── Top Page Header ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-4 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-white/10 text-white backdrop-blur-xs">
              <Wallet size={20} />
            </div>
            <div>
              <h1 className="text-base font-black tracking-wide leading-tight">
                Accounts & Staff Cash Custody
              </h1>
              <p className="text-xs text-white/70 font-semibold">
                Zoho Books ledger & cash handover tracking
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setHandoverSource(selectedAccountId)
              setHandoverModalOpen(true)
            }}
            className="px-3 py-2 rounded-xl text-xs font-black uppercase bg-[#ff9900] hover:bg-orange-600 text-white flex items-center gap-1.5 shadow-md active:scale-95 transition-all shrink-0"
          >
            <ArrowRightLeft size={14} />
            Handover Cash
          </button>
        </div>

        {/* Global Overview Numbers */}
        <div className="relative mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] font-black uppercase text-white/70 tracking-wider block">
              Total with Delivery Staff
            </span>
            <p className="text-2xl font-black text-amber-300 leading-tight">
              ₹{totalStaffCash.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-black uppercase text-white/70 tracking-wider block">
              Counter Cash Drawer
            </span>
            <p className="text-2xl font-black text-emerald-300 leading-tight">
              ₹{(Number(accountsSummary?.counter) || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>

      {/* ─── 4 Account Cards (Tap to switch passbook) ─── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black text-gray-500 uppercase tracking-wider">
            Select Account to View Statement
          </span>
          <span className="text-[10px] text-gray-400 font-bold">
            Tap a card to inspect ledger
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DEFAULT_ACCOUNTS.map((acc) => {
            const isSelected = selectedAccountId === acc.id
            const balance = Number(accountsSummary?.[acc.id] || 0)
            const isCustody = acc.type === 'custody'

            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                className={`text-left p-3 rounded-2xl border-2 transition-all flex flex-col justify-between relative overflow-hidden ${
                  isSelected
                    ? 'border-[#ff9900] bg-orange-50/50 shadow-md ring-2 ring-[#ff9900]/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                    <span className="font-extrabold text-xs text-gray-900 truncate">
                      {acc.name}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="text-[#ff9900] shrink-0">
                      <CheckCircle2 size={14} />
                    </span>
                  )}
                </div>

                <div className="my-2.5">
                  <span className="text-[9px] font-extrabold uppercase text-gray-400 block tracking-wider">
                    {isCustody ? 'Cash with Staff' : 'Balance'}
                  </span>
                  <p
                    className={`text-xl font-black leading-none ${
                      balance > 0
                        ? isCustody
                          ? 'text-blue-600'
                          : 'text-emerald-600'
                        : balance < 0
                        ? 'text-red-500'
                        : 'text-gray-600'
                    }`}
                  >
                    ₹{balance.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] font-extrabold">
                  <span className={isSelected ? 'text-[#ff9900]' : 'text-gray-400'}>
                    {isSelected ? 'Viewing Statement' : 'View Passbook'}
                  </span>
                  <ChevronRight
                    size={12}
                    className={isSelected ? 'text-[#ff9900]' : 'text-gray-300'}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── Spacious Account Statement / Passbook Section ─── */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 space-y-4">
        {/* Passbook Header Banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="w-5 h-5 rounded-full border-2 border-white shadow-xs shrink-0"
              style={{ backgroundColor: selectedMeta.color }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-900">{selectedMeta.name}</h2>
                <span
                  className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${selectedMeta.bgLight}`}
                >
                  {selectedMeta.description}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Live statement showing collections, expenses, and handovers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-right">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                Current Balance
              </span>
              <span className="text-lg font-black text-emerald-600 leading-tight">
                ₹{currentBalance.toLocaleString('en-IN')}
              </span>
            </div>

            <button
              type="button"
              onClick={handlePromptAdjustBalance}
              className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shadow-xs"
              title="Set Opening / Reconciled Balance"
            >
              <SlidersHorizontal size={16} />
            </button>

            {selectedMeta.type === 'custody' && (
              <button
                type="button"
                onClick={() => {
                  setHandoverSource(selectedAccountId)
                  setHandoverModalOpen(true)
                }}
                className="px-3 py-2 rounded-xl text-xs font-black uppercase bg-[#131921] hover:bg-black text-white flex items-center gap-1.5 shadow-xs transition-all"
              >
                <ArrowRightLeft size={13} />
                Handover Cash
              </button>
            )}
          </div>
        </div>

        {/* Statement Totals Breakdown */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-2.5">
            <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block">
              Total Collections
            </span>
            <p className="text-base font-black text-emerald-800 mt-0.5">
              +₹{totals.collections.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-red-50/70 border border-red-100 rounded-2xl p-2.5">
            <span className="text-[10px] font-black uppercase text-red-700 tracking-wider block">
              Staff Expenses Paid
            </span>
            <p className="text-base font-black text-red-800 mt-0.5">
              -₹{totals.expenses.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-2.5">
            <span className="text-[10px] font-black uppercase text-blue-700 tracking-wider block">
              Cash Handovers Out
            </span>
            <p className="text-base font-black text-blue-800 mt-0.5">
              -₹{totals.handovers.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'All Transactions' },
              { id: 'collection', label: 'Customer Collections' },
              { id: 'expense', label: 'Expenses' },
              { id: 'transfer', label: 'Cash Transfers' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                  filterType === tab.id
                    ? 'bg-[#131921] text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-xs font-extrabold text-gray-400 shrink-0">
            {filteredEntries.length} Records
          </span>
        </div>

        {/* Transactions Feed */}
        <div className="space-y-2">
          {loadingEntries ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 font-bold italic gap-2">
              <Loader2 className="animate-spin text-blue-500" size={26} />
              Loading statement entries…
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-center space-y-2 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
              <AlertCircle size={36} className="text-gray-300" />
              <p className="text-xs font-bold italic">
                No statement entries recorded for {selectedMeta.name}
              </p>
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
                  className="relative overflow-hidden bg-white p-3.5 rounded-2xl border border-gray-100 hover:border-gray-200 shadow-xs transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-2xl shrink-0 ${iconBg}`}>
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-sm text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</p>
                      <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1 mt-1">
                        <Calendar size={11} /> {formatEntryDate(item)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-black text-base ${
                        isPositive ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {isPositive ? '+' : '-'}₹{item.amount.toLocaleString('en-IN')}
                    </p>
                    <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                      {item.type}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Cash Handover / Transfer Modal */}
      <CashHandoverModal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        initialSource={handoverSource}
        accountsSummary={accountsSummary}
      />
    </div>
  )
}
