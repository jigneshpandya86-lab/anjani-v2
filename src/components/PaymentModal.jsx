import { useMemo, useState } from 'react'
import { useClientStore } from '../store/clientStore'
import { IndianRupee, Save, CreditCard, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import { DEFAULT_ACCOUNTS } from '../constants/accounts'
import { formatPaymentNarration } from '../utils/orderUtils'

const getToday = () => new Date().toISOString().slice(0, 10)
const getCurrentTime = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

export default function PaymentModal({ client, onClose, initialValues = {} }) {
  const addPayment = useClientStore((state) => state.addPayment)
  const clients = useClientStore((state) => state.clients)
  const [amount, setAmount] = useState(initialValues.amount ? String(initialValues.amount) : '')
  const [method, setMethod] = useState(initialValues.method || 'cash')
  const [accountId, setAccountId] = useState(initialValues.accountId || 'counter')
  const [note, setNote] = useState(initialValues.note || '')
  const [paymentDate, setPaymentDate] = useState(initialValues.date || getToday())
  const [paymentTime, setPaymentTime] = useState(initialValues.time || getCurrentTime())
  const [selectedClientId, setSelectedClientId] = useState(client?.id || initialValues?.clientId || '')
  const [loading, setLoading] = useState(false)
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || (client?.id ? client : null),
    [clients, selectedClientId, client],
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || amount <= 0 || !selectedClient) return

    const paymentAmount = parseFloat(amount)
    const outstandingAmount = selectedClient?.outstanding || 0
    const isExcessPayment = outstandingAmount >= 0 && paymentAmount > outstandingAmount

    if (isExcessPayment) {
      const overpaidBy = paymentAmount - outstandingAmount
      const firstConfirmation = window.confirm(
        `This payment is ₹${overpaidBy.toLocaleString()} more than the due amount. Do you want to continue?`,
      )

      if (!firstConfirmation) return

      const secondConfirmation = window.confirm(
        'Please confirm again: this will save an excess payment and create a negative balance.',
      )

      if (!secondConfirmation) return
    }

    setLoading(true)
    try {
      const pDate = new Date(`${paymentDate}T${paymentTime || '00:00'}`)
      const narration = formatPaymentNarration(selectedClient.name, pDate)
      await addPayment({
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        amount: paymentAmount,
        type: 'payment',
        method,
        accountId,
        narration,
        note: note.trim() || narration,
        date: pDate,
      })
      toast.success('Payment recorded successfully')
      onClose()
    } catch (err) {
      toast.error('Failed to record payment: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const newBalance = (selectedClient?.outstanding || 0) - (parseFloat(amount) || 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b pb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Record Payment</h2>
          <p className="text-xs text-gray-500">{selectedClient?.name || 'Select client'}</p>
        </div>
      </div>

      {!client?.id && (
        <div>
          <label
            htmlFor="client-select"
            className="block text-xs font-bold text-gray-500 uppercase mb-2"
          >
            Client
          </label>
          <select
            id="client-select"
            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#ff9900] outline-none"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            required
          >
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="bg-gray-50 p-3 rounded-xl flex justify-between items-center border border-gray-100">
        <span className="text-gray-600 font-medium text-sm">Current Balance:</span>
        <span
          className={`font-bold text-lg ${(selectedClient?.outstanding || 0) > 0 ? 'text-red-500' : 'text-green-600'}`}
        >
          ₹{selectedClient?.outstanding?.toLocaleString() || 0}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Amount Input */}
        <div>
          <label
            htmlFor="amount-input"
            className="block text-xs font-bold text-gray-500 uppercase mb-2"
          >
            Amount Received (₹)
          </label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              id="amount-input"
              type="number"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Payment Method Toggle */}
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor="date-input">
            <span className="block text-xs font-bold text-gray-500 uppercase mb-2">
              Payment Date
            </span>
            <input
              id="date-input"
              type="date"
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#ff9900] outline-none"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </label>
          <label htmlFor="time-input">
            <span className="block text-xs font-bold text-gray-500 uppercase mb-2">
              Payment Time
            </span>
            <input
              id="time-input"
              type="time"
              className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-[#ff9900] outline-none"
              value={paymentTime}
              onChange={(e) => setPaymentTime(e.target.value)}
              required
            />
          </label>
        </div>

        <div>
          <label
            htmlFor="payment-method"
            className="block text-xs font-bold text-gray-500 uppercase mb-2"
          >
            Payment Method
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setMethod('cash')
                if (accountId === 'bank') setAccountId('counter')
              }}
              className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all ${method === 'cash' ? 'border-[#ff9900] bg-orange-50 text-[#ff9900]' : 'border-gray-100 bg-white text-gray-500'}`}
            >
              <Banknote size={18} /> Cash
            </button>
            <button
              type="button"
              onClick={() => {
                setMethod('upi')
                setAccountId('bank')
              }}
              className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all ${method === 'upi' ? 'border-[#ff9900] bg-orange-50 text-[#ff9900]' : 'border-gray-100 bg-white text-gray-500'}`}
            >
              <CreditCard size={18} /> UPI / Online
            </button>
          </div>
        </div>

        <div>
          <span className="block text-xs font-bold text-gray-500 uppercase mb-2">
            Collected By / Received In
          </span>
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_ACCOUNTS.map((acc) => {
              const isSelected = accountId === acc.id
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => {
                    setAccountId(acc.id)
                    if (acc.id === 'bank') {
                      setMethod('upi')
                    } else if (method === 'upi') {
                      setMethod('cash')
                    }
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-[#ff9900] bg-orange-50 ring-2 ring-[#ff9900]/20'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-900">{acc.name}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: acc.color }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 truncate mt-0.5">{acc.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Note */}
        <div>
          <label
            htmlFor="notes-input"
            className="block text-xs font-bold text-gray-500 uppercase mb-2"
          >
            Notes (Optional)
          </label>
          <input
            id="notes-input"
            className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#ff9900] outline-none"
            placeholder={
              selectedClient?.name
                ? `e.g. Payment received for "${selectedClient.name}"`
                : 'e.g. Payment received'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Preview Balance */}
        {amount > 0 && (
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100 animate-pulse">
            <p className="text-xs text-blue-600 font-medium uppercase">New Balance after saving</p>
            <p className="text-lg font-bold text-blue-800">₹{newBalance.toLocaleString()}</p>
          </div>
        )}

        <button
          disabled={loading || !selectedClient}
          className="w-full bg-[#131921] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50"
        >
          {loading ? (
            'Saving...'
          ) : (
            <>
              <Save size={20} /> Save Transaction
            </>
          )}
        </button>
      </form>
    </div>
  )
}
