import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useClientStore } from '../store/clientStore'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'
import { DEFAULT_STAFF } from '../services/staffSalaryService'
import { sendBackgroundSms } from '../services/leadSmsService'
import {
  evaluateArithmetic,
  hasArithmeticOperators,
  buildCashHandoverSms,
} from '../utils/calculatorUtils'
import {
  ArrowRightLeft,
  X,
  Check,
  Calculator,
  MessageSquare,
  Delete,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'

export default function CashHandoverModal({
  isOpen,
  onClose,
  initialSource = 'nilesh',
  accountsSummary = {},
}) {
  const recordAccountTransfer = useClientStore((state) => state.recordAccountTransfer)
  const staffList = useClientStore((state) => state.staffList) || []
  const fetchStaff = useClientStore((state) => state.fetchStaff)

  const [fromAccountId, setFromAccountId] = useState(initialSource)
  const [toAccountId, setToAccountId] = useState('counter')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Calculator state
  const [showCalculator, setShowCalculator] = useState(false)

  // SMS / MacroDroid state
  const [sendSms, setSendSms] = useState(false)
  const [smsPhone, setSmsPhone] = useState('')
  const [showMacroDroidMenu, setShowMacroDroidMenu] = useState(false)
  const [testingSms, setTestingSms] = useState(false)

  // Helper to identify if an account belongs to staff (custody)
  const isStaffAccount = useCallback(
    (accId) => {
      if (!accId) return false
      const meta = getAccountMeta(accId)
      if (meta?.type === 'custody') return true
      return (
        (staffList || []).some((s) => s.id === accId) ||
        DEFAULT_STAFF.some((s) => s.id === accId)
      )
    },
    [staffList],
  )

  // Helper to find staff phone by account ID
  const lookupAccountPhone = useCallback(
    (accId) => {
      const fromStaffList = (staffList || []).find((s) => s.id === accId)
      if (fromStaffList?.mobile) return fromStaffList.mobile
      const fromDefault = DEFAULT_STAFF.find((s) => s.id === accId)
      if (fromDefault?.mobile) return fromDefault.mobile
      return ''
    },
    [staffList],
  )

  // Helper to get staff member object by account ID
  const getStaffMember = useCallback(
    (accId) => {
      const fromStaffList = (staffList || []).find((s) => s.id === accId)
      if (fromStaffList) return fromStaffList
      const fromDefault = DEFAULT_STAFF.find((s) => s.id === accId)
      if (fromDefault) return fromDefault
      return null
    },
    [staffList],
  )

  // Accounting Context for Staff Custody
  const isFromStaff = isStaffAccount(fromAccountId)
  const isToStaff = isStaffAccount(toAccountId)

  // Target staff member whose custody account is being modified
  const targetStaff = useMemo(() => {
    if (isFromStaff) return getStaffMember(fromAccountId)
    if (isToStaff) return getStaffMember(toAccountId)
    return null
  }, [isFromStaff, isToStaff, fromAccountId, toAccountId, getStaffMember])

  // Entry type from staff perspective:
  // - Staff -> Counter/Bank: DEBIT (deducted from staff custody)
  // - Counter/Bank -> Staff: CREDIT (added to staff custody)
  const entryType = useMemo(() => {
    if (isFromStaff) return 'debit'
    if (isToStaff) return 'credit'
    return null
  }, [isFromStaff, isToStaff])

  useEffect(() => {
    if (isOpen) {
      if (typeof fetchStaff === 'function') {
        fetchStaff()
      }

      const initialFrom = initialSource || 'nilesh'
      const initialTo = initialFrom === 'counter' ? 'bank' : 'counter'

      setFromAccountId(initialFrom)
      setToAccountId(initialTo)
      setAmount('')
      setNotes('')
      setShowCalculator(false)
      setShowMacroDroidMenu(false)
      setDate(new Date().toISOString().slice(0, 10))

      // Auto-configure SMS based on staff account (staff receives the notification)
      const staffTarget = isStaffAccount(initialFrom)
        ? initialFrom
        : isStaffAccount(initialTo)
        ? initialTo
        : null

      if (staffTarget) {
        const detectedPhone = lookupAccountPhone(staffTarget)
        if (detectedPhone) {
          setSmsPhone(detectedPhone)
          setSendSms(true)
        } else {
          setSmsPhone('')
          setSendSms(true)
        }
      } else {
        setSmsPhone('')
        setSendSms(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSource])

  // Keep phone updated if staffList finishes loading after mount
  useEffect(() => {
    if (isOpen && targetStaff) {
      const found = (staffList || []).find((s) => s.id === targetStaff.id)
      const phoneToUse = found?.mobile || targetStaff.mobile || lookupAccountPhone(targetStaff.id)
      if (phoneToUse && !smsPhone) {
        setSmsPhone(phoneToUse)
        setSendSms(true)
      }
    }
  }, [isOpen, staffList, targetStaff, smsPhone, lookupAccountPhone])

  // Update SMS phone and entry routing when accounts change
  const handleFromAccountChange = (newFrom) => {
    setFromAccountId(newFrom)
    let newTo = toAccountId
    if (newFrom === toAccountId) {
      newTo = newFrom === 'counter' ? 'bank' : 'counter'
      setToAccountId(newTo)
    }

    const staffTarget = isStaffAccount(newFrom)
      ? newFrom
      : isStaffAccount(newTo)
      ? newTo
      : null

    if (staffTarget) {
      const detectedPhone = lookupAccountPhone(staffTarget)
      setSendSms(true)
      if (detectedPhone) {
        setSmsPhone(detectedPhone)
      }
    } else {
      setSmsPhone('')
      setSendSms(false)
    }
  }

  const handleToAccountChange = (newTo) => {
    setToAccountId(newTo)
    const staffTarget = isStaffAccount(fromAccountId)
      ? fromAccountId
      : isStaffAccount(newTo)
      ? newTo
      : null

    if (staffTarget) {
      const detectedPhone = lookupAccountPhone(staffTarget)
      setSendSms(true)
      if (detectedPhone) {
        setSmsPhone(detectedPhone)
      }
    } else {
      setSmsPhone('')
      setSendSms(false)
    }
  }

  // Evaluate amount if it's an arithmetic expression
  const enteredAmount = useMemo(() => {
    if (!amount) return 0
    const str = String(amount).trim()
    if (hasArithmeticOperators(str)) {
      const res = evaluateArithmetic(str)
      return res !== null && res > 0 ? res : 0
    }
    const num = Number(str.replace(/,/g, ''))
    return !Number.isNaN(num) && num > 0 ? num : 0
  }, [amount])

  const currentSourceBalance = Number(accountsSummary[fromAccountId] || 0)
  const remainingBalance = currentSourceBalance - enteredAmount

  const fromMeta = getAccountMeta(fromAccountId)
  const toMeta = getAccountMeta(toAccountId)

  // Quick chips
  const handleQuickAmount = (val) => {
    setAmount(String(val))
  }

  // Keypad button click
  const handleKeypadPress = (key) => {
    if (key === 'C') {
      setAmount('')
      return
    }

    if (key === '⌫') {
      setAmount((prev) => (prev.length > 0 ? prev.slice(0, -1) : ''))
      return
    }

    if (key === '=') {
      if (enteredAmount > 0) {
        setAmount(String(enteredAmount))
      }
      return
    }

    setAmount((prev) => prev + key)
  }

  // Compute staff custody balance for SMS
  const staffBalanceAfterTransfer = useMemo(() => {
    if (entryType === 'debit') {
      const current = Number(accountsSummary[fromAccountId] || 0)
      return current - enteredAmount
    }
    if (entryType === 'credit') {
      const current = Number(accountsSummary[toAccountId] || 0)
      return current + enteredAmount
    }
    return currentSourceBalance > 0 ? remainingBalance : null
  }, [entryType, accountsSummary, fromAccountId, toAccountId, enteredAmount, currentSourceBalance, remainingBalance])

  // Live Khatabook-style SMS preview text with Debit / Credit accounting entry
  const smsPreviewText = buildCashHandoverSms({
    amount: enteredAmount,
    fromName: fromMeta.shortLabel || fromMeta.name,
    toName: toMeta.shortLabel || toMeta.name,
    date,
    remainingBalance: staffBalanceAfterTransfer,
    entryType,
    staffName: targetStaff?.name || '',
  })

  // Test SMS trigger directly from the MacroDroid menu
  const handleSendTestSms = async () => {
    if (!smsPhone) {
      toast.error('Please enter a recipient phone number first')
      return
    }
    setTestingSms(true)
    const testMsg = `Annapurna Foods: Test SMS via MacroDroid for ${targetStaff?.name || 'Staff'}. Webhook is working properly!`
    try {
      await sendBackgroundSms({
        phone: smsPhone,
        message: testMsg,
      })
      toast.success(`Test SMS dispatched to ${smsPhone}! Check recipient phone.`, { duration: 4000 })
    } catch (err) {
      console.error('Test SMS failed:', err)
      toast.error(`Test SMS failed: ${err.message}`)
    } finally {
      setTestingSms(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!enteredAmount || enteredAmount <= 0) {
      toast.error('Please enter a valid handover amount or formula')
      return
    }
    if (fromAccountId === toAccountId) {
      toast.error('Source and Destination accounts must be different')
      return
    }

    // Confirmation if transferring more than current balance
    if (currentSourceBalance > 0 && enteredAmount > currentSourceBalance) {
      const confirmed = window.confirm(
        `Note: Handover amount (₹${enteredAmount.toLocaleString('en-IN')}) is higher than ${fromMeta.name}'s recorded balance (₹${currentSourceBalance.toLocaleString('en-IN')}). Proceed anyway?`,
      )
      if (!confirmed) return
    }

    setSubmitting(true)
    try {
      // 1. Record transfer in database
      await recordAccountTransfer({
        fromAccountId,
        toAccountId,
        amount: enteredAmount,
        notes,
        date: new Date(`${date}T12:00:00`),
      })

      // 2. Send SMS via MacroDroid if enabled
      let smsSentSuccessfully = false
      if (sendSms && smsPhone) {
        try {
          await sendBackgroundSms({
            phone: smsPhone,
            message: smsPreviewText,
          })
          smsSentSuccessfully = true
        } catch (smsErr) {
          console.warn('Handover SMS failed:', smsErr)
          toast.error(`Transfer recorded, but SMS failed: ${smsErr.message}`)
        }
      }

      if (smsSentSuccessfully) {
        const staffLabel = targetStaff?.name || fromMeta.shortLabel
        const actionVerb = entryType === 'debit' ? 'handed over' : 'transferred'
        const entryLabel = entryType ? ` (${entryType.toUpperCase()} SMS sent to ${staffLabel})` : ` & SMS sent to ${staffLabel}`
        toast.success(
          `₹${enteredAmount.toLocaleString('en-IN')} ${actionVerb}${entryLabel}!`,
        )
      } else if (sendSms && !smsPhone) {
        toast.success(
          `₹${enteredAmount.toLocaleString('en-IN')} recorded (SMS skipped: no mobile number)`,
        )
      } else if (!sendSms) {
        toast.success(
          `₹${enteredAmount.toLocaleString('en-IN')} handed over from ${fromMeta.shortLabel} to ${toMeta.shortLabel} (SMS disabled)`,
        )
      } else {
        toast.success(
          `₹${enteredAmount.toLocaleString('en-IN')} handed over from ${fromMeta.shortLabel} to ${toMeta.shortLabel}`,
        )
      }

      onClose()
    } catch (err) {
      console.error('Handover failed:', err)
      toast.error('Transfer failed: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] px-4 py-3 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-[#ff9900]" />
              <h2 className="text-xs font-black uppercase tracking-wider">Cash Handover</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3.5 space-y-3 overflow-y-auto">
          {/* Transfer Flow Visual */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-2.5">
            <div className="grid grid-cols-2 gap-2 items-center">
              {/* From Account */}
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  From (Payer)
                </span>
                <select
                  value={fromAccountId}
                  onChange={(e) => handleFromAccountChange(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:ring-1 focus:ring-[#ff9900]"
                >
                  {DEFAULT_ACCOUNTS.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 flex items-center gap-1 text-[10px] font-bold">
                  <span className="text-gray-400">Balance:</span>
                  <span
                    className={currentSourceBalance > 0 ? 'text-blue-600' : 'text-gray-600'}
                  >
                    ₹{currentSourceBalance.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* To Account */}
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">
                  To (Receiver)
                </span>
                <select
                  value={toAccountId}
                  onChange={(e) => handleToAccountChange(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-900 outline-none focus:ring-1 focus:ring-[#ff9900]"
                >
                  {DEFAULT_ACCOUNTS.filter((acc) => acc.id !== fromAccountId).map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 flex items-center gap-1 text-[10px] font-bold">
                  <span className="text-gray-400">Balance:</span>
                  <span className="text-emerald-600">
                    ₹{(Number(accountsSummary[toAccountId]) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Amount Section with Khatabook Calculator */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="handover-amount"
                className="block text-[10px] font-black text-gray-600 uppercase tracking-wider"
              >
                Amount (₹)
              </label>
              <button
                type="button"
                onClick={() => setShowCalculator((prev) => !prev)}
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer ${
                  showCalculator
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                }`}
                title="Toggle Khatabook Calculator"
              >
                <Calculator size={12} />
                <span>{showCalculator ? 'Hide Calc' : 'Calculator'}</span>
              </button>
            </div>

            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-gray-400 font-bold text-lg select-none">₹</span>
              <input
                id="handover-amount"
                type="text"
                inputMode="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00 or e.g. 1000+500"
                required
                className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-lg font-black outline-none focus:border-[#ff9900] focus:ring-1 focus:ring-[#ff9900] transition-all"
              />
            </div>

            {/* Live Arithmetic Result Banner if Formula is Typed */}
            {hasArithmeticOperators(amount) && enteredAmount > 0 && (
              <div className="flex items-center justify-between text-xs font-bold bg-amber-50 text-amber-900 px-2.5 py-1.5 rounded-xl border border-amber-200 animate-in fade-in">
                <span>Calculated: = ₹{enteredAmount.toLocaleString('en-IN')}</span>
                <button
                  type="button"
                  onClick={() => setAmount(String(enteredAmount))}
                  className="text-[10px] font-black uppercase text-amber-950 bg-amber-200 hover:bg-amber-300 px-2 py-0.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                >
                  Use Total (=)
                </button>
              </div>
            )}

            {/* Embedded Khatabook Calculator Keypad */}
            {showCalculator && (
              <div className="bg-gray-100/90 p-2 rounded-2xl border border-gray-200 space-y-1 animate-in slide-in-from-top-2 duration-150">
                <div className="grid grid-cols-4 gap-1">
                  {/* Row 1 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('C')}
                    className="p-2 rounded-xl font-black text-xs text-rose-600 bg-white border border-rose-100 hover:bg-rose-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    C
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('(')}
                    className="p-2 rounded-xl font-bold text-xs text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    (
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress(')')}
                    className="p-2 rounded-xl font-bold text-xs text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    )
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('÷')}
                    className="p-2 rounded-xl font-black text-sm text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    ÷
                  </button>

                  {/* Row 2 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('7')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    7
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('8')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    8
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('9')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    9
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('×')}
                    className="p-2 rounded-xl font-black text-sm text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    ×
                  </button>

                  {/* Row 3 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('4')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    4
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('5')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    5
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('6')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    6
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('-')}
                    className="p-2 rounded-xl font-black text-sm text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    -
                  </button>

                  {/* Row 4 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('1')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('2')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('3')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    3
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('+')}
                    className="p-2 rounded-xl font-black text-sm text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    +
                  </button>

                  {/* Row 5 */}
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('0')}
                    className="p-2 rounded-xl font-black text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('00')}
                    className="p-2 rounded-xl font-bold text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    00
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('.')}
                    className="p-2 rounded-xl font-bold text-xs text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    .
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeypadPress('=')}
                    className="p-2 rounded-xl font-black text-sm text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 shadow-sm transition-all cursor-pointer"
                  >
                    =
                  </button>
                </div>
              </div>
            )}

            {/* Quick Shortcut Chips */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              {currentSourceBalance > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(currentSourceBalance)}
                    className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all cursor-pointer"
                  >
                    All (₹{currentSourceBalance.toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAmount(Math.floor(currentSourceBalance / 2))}
                    className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-all cursor-pointer"
                  >
                    50% (₹{Math.floor(currentSourceBalance / 2).toLocaleString('en-IN')})
                  </button>
                </>
              )}
              {[500, 1000, 2000, 5000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAmount(val)}
                  className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-all cursor-pointer"
                >
                  ₹{val.toLocaleString('en-IN')}
                </button>
              ))}
            </div>

            {/* Partial Handover Remaining Balance Indicator */}
            {enteredAmount > 0 && currentSourceBalance > 0 && (
              <div
                className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between ${
                  remainingBalance >= 0
                    ? 'bg-blue-50 text-blue-800 border-blue-100'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                <span>Remaining with {fromMeta.shortLabel}:</span>
                <span className="text-xs font-black">
                  ₹{remainingBalance.toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="handover-date"
                className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-0.5"
              >
                Date
              </label>
              <input
                id="handover-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 outline-none focus:ring-1 focus:ring-[#ff9900]"
              />
            </div>
            <div>
              <label
                htmlFor="handover-notes"
                className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-0.5"
              >
                Note
              </label>
              <input
                id="handover-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note"
                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 outline-none focus:ring-1 focus:ring-[#ff9900]"
              />
            </div>
          </div>

          {/* SMS Confirmation (Khatabook Style via MacroDroid) - Click to Open */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden transition-all bg-gray-50/70">
            {/* Click to open toggle header */}
            <button
              type="button"
              onClick={() => setShowMacroDroidMenu((prev) => !prev)}
              className="w-full p-2.5 flex items-center justify-between text-left cursor-pointer select-none hover:bg-gray-100/70 transition-colors"
              aria-expanded={showMacroDroidMenu}
              aria-label="Toggle MacroDroid SMS confirmation menu"
              title={showMacroDroidMenu ? 'Click to collapse MacroDroid SMS menu' : 'Click to open MacroDroid SMS menu'}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                  <MessageSquare size={13} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800 leading-tight truncate">
                    SMS Confirmation (MacroDroid)
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {sendSms && smsPhone
                      ? targetStaff
                        ? `Send to ${targetStaff.name}: ${smsPhone}`
                        : `Send to ${smsPhone}`
                      : sendSms
                      ? 'No recipient phone entered'
                      : 'SMS is off'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {entryType && sendSms && (
                  <span
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                      entryType === 'debit'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {entryType}
                  </span>
                )}
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                    sendSms && smsPhone
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : sendSms
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {sendSms && smsPhone
                    ? `SMS: ${targetStaff?.name || 'Staff'}`
                    : sendSms
                    ? 'No Phone'
                    : 'SMS Off'}
                </span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight hidden sm:inline">
                  {showMacroDroidMenu ? 'Hide' : 'Click to open'}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-gray-400 transition-transform duration-200 ${
                    showMacroDroidMenu ? 'rotate-180 text-orange-500' : ''
                  }`}
                />
              </div>
            </button>

            {/* Expandable MacroDroid SMS Menu Body */}
            {showMacroDroidMenu && (
              <div className="p-3 pt-2.5 bg-white border-t border-gray-200 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendSms}
                      onChange={(e) => setSendSms(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-gray-300"
                    />
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      Send SMS Confirmation (MacroDroid)
                    </span>
                  </label>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      sendSms ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {sendSms ? 'On' : 'Off'}
                  </span>
                </div>

                {sendSms && (
                  <div className="space-y-2 pt-0.5">
                    {/* Staff Account Entry Info Card */}
                    {targetStaff && (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-orange-50/60 border border-orange-200">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                              entryType === 'debit'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {entryType === 'debit' ? 'DEBIT ENTRY' : 'CREDIT ENTRY'}
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {targetStaff.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">
                          {entryType === 'debit'
                            ? 'Deducted from cash custody'
                            : 'Added to cash custody'}
                        </span>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="sms-phone"
                        className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1"
                      >
                        Recipient Mobile Number {targetStaff ? `(Staff: ${targetStaff.name})` : ''}
                      </label>
                      <input
                        id="sms-phone"
                        type="tel"
                        value={smsPhone}
                        onChange={(e) => setSmsPhone(e.target.value)}
                        placeholder={targetStaff?.mobile ? `e.g. ${targetStaff.mobile}` : 'e.g. 7990943652'}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>

                    {/* Live SMS Preview */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 text-[11px] text-gray-600">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-400 block text-[9px] uppercase tracking-wider">
                          SMS Preview ({entryType ? `${entryType.toUpperCase()} ENTRY` : 'Khatabook Style'}):
                        </span>
                        <span className="text-[9px] font-semibold text-gray-400">
                          {smsPreviewText.length} chars
                        </span>
                      </div>
                      <p className="font-medium text-gray-800 italic">
                        "{smsPreviewText}"
                      </p>
                    </div>

                    {/* Direct MacroDroid Test Button */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-500 font-medium">
                        Test MacroDroid Webhook:
                      </span>
                      <button
                        type="button"
                        onClick={handleSendTestSms}
                        disabled={testingSms || !smsPhone}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-orange-100 hover:bg-orange-200 text-orange-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {testingSms ? 'Sending Test…' : 'Send Test SMS'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Button */}
          <button
            type="submit"
            disabled={submitting || !enteredAmount}
            className="w-full bg-[#131921] hover:bg-black text-white py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {submitting ? (
              'Processing…'
            ) : sendSms && smsPhone ? (
              <>
                <MessageSquare size={13} className="text-orange-400" />
                <span>Confirm & Send SMS to {targetStaff?.name || 'Staff'} (₹{enteredAmount.toLocaleString('en-IN')})</span>
              </>
            ) : (
              <>
                <Check size={14} /> Confirm Handover (₹{enteredAmount.toLocaleString('en-IN')})
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
