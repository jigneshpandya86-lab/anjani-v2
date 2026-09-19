import { memo, useEffect, useState } from 'react'
import { useClientStore } from '../store/clientStore'
import { useAnalyticsStore } from '../store/analyticsStore'
import toast from 'react-hot-toast'
import {
  IndianRupee,
  Calendar,
  Clock,
  ShoppingBag,
  RotateCcw,
  Trash2,
  Wallet,
  ArrowRightLeft,
  BookOpen,
} from 'lucide-react'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'
import CashHandoverModal from './CashHandoverModal'
import AccountPassbookModal from './AccountPassbookModal'

const TRANSACTION_FEED_LIMIT = 15

function PaymentDashboard() {
  const { clients, deletePayment, accountsSummary, fetchAccountsSummary } = useClientStore()
  const [handoverModalOpen, setHandoverModalOpen] = useState(false)
  const [selectedHandoverSource, setSelectedHandoverSource] = useState('nilesh')
  const [passbookModalOpen, setPassbookModalOpen] = useState(false)
  const [selectedPassbookAccount, setSelectedPassbookAccount] = useState('nilesh')

  const {
    recentPayments: history,
    recentLoading: isLoading,
    subscribeToRecentPayments,
    unsubscribeFromRecentPayments,
  } = useAnalyticsStore()

  useEffect(() => {
    const unsub = fetchAccountsSummary()
    return () => {
      if (unsub) unsub()
    }
  }, [fetchAccountsSummary])

  useEffect(() => {
    subscribeToRecentPayments()
    return unsubscribeFromRecentPayments
  }, [subscribeToRecentPayments, unsubscribeFromRecentPayments])

  const getClientName = (id) => clients.find((c) => c.id === id)?.name || 'Unknown Client'

  const getOrderId = (tx) => {
    if (tx.orderId) return tx.orderId

    const narration = tx.narration || tx.note || ''
    const match = narration.match(/\bORD-\d+\b/i)
    return match ? match[0].toUpperCase() : ''
  }

  const handleDeletePayment = async (tx) => {
    const transactionRef = tx.orderId || tx.id
    const firstConfirm = window.confirm(
      `Delete transaction ${transactionRef}? This will update the client balance.`,
    )
    if (!firstConfirm) return

    const secondConfirm = window.confirm(
      `Final confirmation: permanently delete ${transactionRef}?`,
    )
    if (!secondConfirm) return

    try {
      await deletePayment(tx.id)
      toast.success(`Transaction ${transactionRef} deleted`)
    } catch (error) {
      console.error('Payment delete failed', error)
      toast.error('Failed to delete transaction')
    }
  }
  const formatDate = (tx) => {
    const rawDate = tx.date || tx.paymentDate || tx.createdAt
    if (!rawDate) return 'No Date Found'
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN')
    if (typeof rawDate === 'string') return rawDate
    return new Date(rawDate).toLocaleDateString('en-IN')
  }

  const totalBilled = history
    .filter((tx) => tx.type === 'invoice')
    .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  return (
    <div className="space-y-2 pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3.5 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-2">
          <h2 className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">
            Payment Ledger
          </h2>
          <div className="shrink-0 flex items-center gap-1 text-[10px] bg-white/20 text-white px-2 py-1 rounded-full font-black uppercase shadow-sm backdrop-blur-sm">
            <Clock size={11} /> {TRANSACTION_FEED_LIMIT} Recent
          </div>
        </div>

        <div className="relative mt-2 flex items-center justify-between gap-2">
          <p className="truncate text-3xl font-black leading-none">
            ₹{totalBilled.toLocaleString('en-IN')}
          </p>
          <p className="truncate text-[11px] text-white/75 font-semibold tracking-wide text-right">
            {history.length} txns ·{' '}
            {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ─── Cash Custody / Accounts Bar ─── */}
      <div className="bg-white rounded-3xl p-3.5 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="p-1.5 rounded-lg bg-orange-50 text-[#ff9900]">
              <Wallet size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-800">
                Staff Cash Custody & Accounts
              </h3>
              <p className="text-[10px] text-gray-400 font-semibold">
                Live balances & cash handover tracking
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedHandoverSource('nilesh')
              setHandoverModalOpen(true)
            }}
            className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase bg-[#131921] hover:bg-black text-white flex items-center gap-1 shadow-xs active:scale-95 transition-all"
          >
            <ArrowRightLeft size={12} />
            Handover Cash
          </button>
        </div>

        {/* Account Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DEFAULT_ACCOUNTS.map((acc) => {
            const balance = Number(accountsSummary?.[acc.id] || 0)
            const isCustody = acc.type === 'custody'

            return (
              <div
                key={acc.id}
                className="relative overflow-hidden bg-gray-50/80 hover:bg-gray-50 border border-gray-100 rounded-2xl p-2.5 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-extrabold text-[11px] text-gray-800 truncate">
                    {acc.name}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: acc.color }}
                  />
                </div>

                <div className="my-2">
                  <span className="text-[9px] font-extrabold uppercase text-gray-400 block tracking-wider">
                    {isCustody ? 'Cash in Hand' : 'Balance'}
                  </span>
                  <p
                    className={`text-lg font-black leading-none ${
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

                <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPassbookAccount(acc.id)
                      setPassbookModalOpen(true)
                    }}
                    className="flex-1 py-1 px-1.5 rounded-lg text-[9px] font-black uppercase bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 flex items-center justify-center gap-1 transition-all"
                  >
                    <BookOpen size={10} /> Passbook
                  </button>

                  {isCustody && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHandoverSource(acc.id)
                        setHandoverModalOpen(true)
                      }}
                      className="py-1 px-1.5 rounded-lg text-[9px] font-black uppercase bg-[#ff9900]/10 hover:bg-[#ff9900]/20 text-[#ff9900] border border-[#ff9900]/20 flex items-center justify-center gap-0.5 transition-all"
                      title="Settle / Handover Cash"
                    >
                      <ArrowRightLeft size={10} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isLoading && (
        <div
          className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic"
          role="status"
          aria-live="polite"
        >
          Loading transactions…
        </div>
      )}

      {!isLoading && history.length === 0 && (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">
          No transactions found.
        </div>
      )}

      {history.map((tx, index) => {
        const isCharge = tx.type === 'invoice'
        const isAdjustment = tx.type === 'adjustment'

        let borderColor = 'border-l-green-500'
        let iconBg = 'bg-green-50 text-green-600'
        let amountColor = 'text-green-600'
        let sign = '+'
        let label = 'RECEIVED'
        let Icon = IndianRupee

        if (isCharge) {
          borderColor = 'border-l-red-500'
          iconBg = 'bg-red-50 text-red-500'
          amountColor = 'text-red-500'
          sign = '+'
          label = 'BILLED (CHARGE)'
          Icon = ShoppingBag
        } else if (isAdjustment) {
          borderColor = 'border-l-blue-500'
          iconBg = 'bg-blue-50 text-blue-500'
          amountColor = 'text-blue-500'
          sign = '-' // Reversals decrease the client's balance
          label = 'SYSTEM REVERSAL'
          Icon = RotateCcw
        }

        const orderId = getOrderId(tx)

        const isAlternateRow = index % 2 === 1

        return (
          <div
            key={tx.id}
            className={`relative overflow-hidden ${isAlternateRow ? 'bg-slate-50/95' : 'bg-white'} px-2.5 py-2 rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-white/80 border-l-[3px] ${borderColor} transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)]`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.5),transparent_35%,rgba(148,163,184,0.04))]" />
            <div className="relative space-y-1">
              <div className="flex items-start gap-2">
                <div className={`p-1.5 rounded-lg shadow-inner ${iconBg} shrink-0`}>
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-extrabold text-sm text-gray-900 leading-tight">
                      {getClientName(tx.clientId)}
                    </p>
                    {orderId && (
                      <span className="shrink-0 text-[9px] font-semibold text-gray-500 tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full">
                        {orderId}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePayment(tx)}
                  className="shrink-0 flex items-center justify-center rounded-md bg-red-50 p-1 text-red-500 transition-colors hover:bg-red-100"
                  title="Delete transaction"
                  aria-label={`Delete transaction ${orderId || tx.id}`}
                >
                  <Trash2 size={12} />
                </button>
                <p className={`shrink-0 font-black text-lg leading-none ${amountColor}`}>
                  {sign}₹{tx.amount}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 pl-8">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <p className="truncate text-[10px] text-gray-500 flex items-center gap-1 uppercase tracking-wide font-bold">
                    <Calendar size={10} /> {formatDate(tx)} • {tx.method || 'SYSTEM'}
                  </p>
                  {tx.accountId && (
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
                        getAccountMeta(tx.accountId).bgLight
                      }`}
                    >
                      {getAccountMeta(tx.accountId).shortLabel}
                    </span>
                  )}
                </div>
                <p className="shrink-0 inline-flex text-[8px] text-gray-600 font-extrabold uppercase tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {label}
                </p>
              </div>
            </div>
          </div>
        )
      })}

      {/* Handover Modal */}
      <CashHandoverModal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        initialSource={selectedHandoverSource}
        accountsSummary={accountsSummary}
      />

      {/* Passbook / Statement Modal */}
      <AccountPassbookModal
        isOpen={passbookModalOpen}
        onClose={() => setPassbookModalOpen(false)}
        accountId={selectedPassbookAccount}
        currentBalance={Number(accountsSummary?.[selectedPassbookAccount] || 0)}
        onOpenHandover={(srcId) => {
          setSelectedHandoverSource(srcId)
          setHandoverModalOpen(true)
        }}
      />
    </div>
  )
}

export default memo(PaymentDashboard)
