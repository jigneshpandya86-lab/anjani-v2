import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  limit,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import {
  Tag,
  Plus,
  Trash2,
  Loader2,
  PiggyBank,
  Receipt,
  FileText,
  AlertCircle,
  Copy,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Default categories if config doesn't exist
const DEFAULT_CATEGORIES = [
  'Salary',
  'Rent',
  'Electricity',
  'Fuel / Transport',
  'Maintenance',
  'Raw Material',
  'Packaging',
  'Miscellaneous',
]

export default function ExpensesDashboard() {
  const [expenses, setExpenses] = useState([])
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [categories, setCategories] = useState([])
  
  const [loadingExpenses, setLoadingExpenses] = useState(true)
  const [loadingFinance, setLoadingFinance] = useState(true)
  const [loadingCategories, setLoadingCategories] = useState(true)

  // Form states
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [dateTime, setDateTime] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Category management
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showCatPanel, setShowCatPanel] = useState(false)

  // Period filter state: 'this-month', 'last-30', 'this-fy', 'all-time'
  const [period, setPeriod] = useState('this-month')

  // Default DateTime to now (Indian timezone compatible local string format)
  useEffect(() => {
    const tzoffset = new Date().getTimezoneOffset() * 60000
    const localISOTime = new Date(Date.now() - tzoffset).toISOString().slice(0, 16)
    setDateTime(localISOTime)
  }, [])

  // 1. Subscribe to Expenses
  useEffect(() => {
    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'), limit(500))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setExpenses(list)
        setLoadingExpenses(false)
      },
      (err) => {
        console.error('Error loading expenses:', err)
        toast.error('Failed to load expenses')
        setLoadingExpenses(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // 2. Subscribe to Orders & Payments for Running Profit calculation
  useEffect(() => {
    // Listen to orders
    const unsubscribeOrders = onSnapshot(
      collection(db, 'orders'),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setOrders(list)
      },
      (err) => console.error('Error fetching orders:', err)
    )

    // Listen to payments
    const unsubscribePayments = onSnapshot(
      collection(db, 'payments'),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setPayments(list)
        setLoadingFinance(false)
      },
      (err) => console.error('Error fetching payments:', err)
    )

    return () => {
      unsubscribeOrders()
      unsubscribePayments()
    }
  }, [])

  // 3. Subscribe to Categories
  useEffect(() => {
    const docRef = doc(db, 'config', 'expenseCategories')
    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          setCategories(snapshot.data().categories || [])
          setLoadingCategories(false)
        } else {
          // Initialize default categories if doc does not exist
          try {
            await setDoc(docRef, { categories: DEFAULT_CATEGORIES })
            setCategories(DEFAULT_CATEGORIES)
          } catch (err) {
            console.error('Error initializing categories:', err)
          }
          setLoadingCategories(false)
        }
      },
      (err) => {
        console.error('Error loading expense categories:', err)
        setLoadingCategories(false)
      }
    )
    return () => unsubscribe()
  }, [])

  // Set default category when categories list loads
  useEffect(() => {
    if (categories.length > 0 && !category) {
      setCategory(categories[0])
    }
  }, [categories, category])

  // --- Date Range Filter Helpers ---
  const getOrderDate = useCallback((o) => {
    if (o.date && typeof o.date === 'string') {
      const parts = o.date.split('-').map(Number)
      if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2])
    }
    if (o.deliveryDate && typeof o.deliveryDate === 'string') {
      const parts = o.deliveryDate.split('-').map(Number)
      if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2])
    }
    if (o.orderDate && typeof o.orderDate === 'string') {
      const parts = o.orderDate.split('-').map(Number)
      if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2])
    }
    if (o.createdAt?.toDate) return o.createdAt.toDate()
    return null
  }, [])

  const getPaymentDate = useCallback((p) => {
    const rawDate = p.date || p.createdAt
    if (!rawDate) return null
    if (rawDate.toDate) return rawDate.toDate()
    return new Date(rawDate)
  }, [])

  const getExpenseDate = useCallback((e) => {
    if (e.date?.toDate) return e.date.toDate()
    return e.date ? new Date(e.date) : null
  }, [])

  const filterByDateRange = useCallback((items, range, dateFieldExtractor) => {
    if (range === 'all-time') return items

    const now = new Date()
    let limitDate

    if (range === 'this-month') {
      limitDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (range === 'last-30') {
      limitDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else if (range === 'this-fy') {
      const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
      limitDate = new Date(startYear, 3, 1)
    } else {
      return items
    }

    return items.filter((item) => {
      const itemDate = dateFieldExtractor(item)
      return itemDate && itemDate >= limitDate
    })
  }, [])

  // --- Financial Calculations ---
  const totals = useMemo(() => {
    const filteredOrders = filterByDateRange(orders, period, getOrderDate)
    const filteredPayments = filterByDateRange(payments, period, getPaymentDate)
    const filteredExpenses = filterByDateRange(expenses, period, getExpenseDate)

    // Total Revenue: sum of Delivered orders
    const totalRevenue = filteredOrders
      .filter((o) => o.status === 'Delivered')
      .reduce((sum, o) => {
        const amt = o.amount || (Number(o.qty || 0) * Number(o.rate || 0))
        return sum + Number(amt || 0)
      }, 0)

    // Total Cash Collected: sum of payments where type is payment/undefined (and not invoice/reversal)
    const totalCashCollected = filteredPayments
      .filter((p) => p.type === 'payment' || p.type === undefined || p.mode)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)

    // Total Expenses
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)

    const accrualProfit = totalRevenue - totalExpenses
    const cashProfit = totalCashCollected - totalExpenses

    return {
      totalRevenue,
      totalCashCollected,
      totalExpenses,
      accrualProfit,
      cashProfit,
    }
  }, [orders, payments, expenses, period, filterByDateRange, getOrderDate, getPaymentDate, getExpenseDate])

  const filteredExpensesList = useMemo(() => {
    return filterByDateRange(expenses, period, getExpenseDate)
  }, [expenses, period, filterByDateRange, getExpenseDate])

  // --- Form Handlers ---
  const handleRecordExpense = async (e) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    if (!category) {
      toast.error('Please select or add a category')
      return
    }

    setIsSubmitting(true)
    try {
      const expenseDate = dateTime ? new Date(dateTime) : new Date()
      await addDoc(collection(db, 'expenses'), {
        amount: Number(amount),
        category: category,
        date: Timestamp.fromDate(expenseDate),
        createdAt: serverTimestamp(),
        note: note.trim(),
      })

      // Reset form (except category & date/time)
      setAmount('')
      setNote('')
      toast.success('Expense recorded successfully')
    } catch (err) {
      console.error('Error saving expense:', err)
      toast.error('Failed to save expense: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteExpense = async (id, cat, amt) => {
    if (!window.confirm(`Are you sure you want to delete the expense ₹${amt} (${cat})?`)) return
    try {
      await deleteDoc(doc(db, 'expenses', id))
      toast.success('Expense entry deleted')
    } catch (err) {
      console.error('Failed to delete expense:', err)
      toast.error('Deletion failed')
    }
  }
  const handleCopyExpense = (exp) => {
    setAmount(exp.amount || '')
    setCategory(exp.category || '')
    setNote(exp.note || '')

    // Set date time to now (local string format)
    const tzoffset = new Date().getTimezoneOffset() * 60000
    const localISOTime = new Date(Date.now() - tzoffset).toISOString().slice(0, 16)
    setDateTime(localISOTime)

    toast.success('Expense copied! Date set to now.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name) return

    if (categories.includes(name)) {
      toast.error('Category already exists')
      return
    }

    const updatedList = [...categories, name]
    try {
      await updateDoc(doc(db, 'config', 'expenseCategories'), {
        categories: updatedList,
      })
      setNewCategoryName('')
      setCategory(name)
      toast.success(`Category "${name}" added`)
    } catch (err) {
      console.error('Failed to add category:', err)
      toast.error('Failed to update categories')
    }
  }

  const handleRemoveCategory = async (catToRemove) => {
    if (categories.length <= 1) {
      toast.error('At least one category must remain')
      return
    }
    if (!window.confirm(`Delete category "${catToRemove}"? Expenses already recorded under this will remain unchanged.`)) return

    const updatedList = categories.filter((c) => c !== catToRemove)
    try {
      await updateDoc(doc(db, 'config', 'expenseCategories'), {
        categories: updatedList,
      })
      if (category === catToRemove) {
        setCategory(updatedList[0])
      }
      toast.success(`Category "${catToRemove}" removed`)
    } catch (err) {
      console.error('Failed to remove category:', err)
      toast.error('Failed to remove category')
    }
  }

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val)
  }

  const formatDate = (rawDate) => {
    if (!rawDate) return '-'
    let dateObj
    if (rawDate.toDate) dateObj = rawDate.toDate()
    else dateObj = new Date(rawDate)
    
    return dateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  const isProfitAccrual = totals.accrualProfit >= 0
  const isProfitCash = totals.cashProfit >= 0

  return (
    <div className="space-y-2.5 pb-20">
      {/* ─── Header Card: Running Profit (Zoho Books Style) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/70">
            <PiggyBank size={12} /> Profit & Loss Dashboard
          </h2>
          <span className="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">
            Realtime
          </span>
        </div>

        {/* Period Selector Tabs */}
        <div className="relative mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="text-[9px] text-white/50 font-black uppercase tracking-wider">Period</span>
          <div className="flex items-center gap-0.5 bg-black/20 rounded-xl p-0.5 border border-white/5">
            {[
              { id: 'this-month', label: 'This Month' },
              { id: 'last-30', label: 'Last 30 Days' },
              { id: 'this-fy', label: 'This FY' },
              { id: 'all-time', label: 'All Time' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-1.5 py-0.5 rounded-md text-[7.5px] font-black uppercase transition-all ${
                  period === p.id
                    ? 'bg-white text-[#0f1f46] shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loadingFinance ? (
          <div className="flex items-center gap-2 py-4 text-white/60">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-xs font-bold">Calculating running profit...</span>
          </div>
        ) : (
          <div className="relative mt-2 grid grid-cols-2 gap-3 border-t border-white/10 pt-2">
            <div>
              <p className="text-[8.5px] text-white/60 font-black uppercase tracking-wide">Accrual Net Profit</p>
              <h3 className={`text-xl font-black mt-0.5 ${isProfitAccrual ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(totals.accrualProfit)}
              </h3>
              <p className="text-[7.5px] text-white/40 mt-0.5">Sales - Expenses</p>
            </div>
            <div>
              <p className="text-[8.5px] text-white/60 font-black uppercase tracking-wide">Cash Flow Net Profit</p>
              <h3 className={`text-xl font-black mt-0.5 ${isProfitCash ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(totals.cashProfit)}
              </h3>
              <p className="text-[7.5px] text-white/40 mt-0.5">Cash - Expenses</p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Financial Summaries Grid ─── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border border-emerald-100 rounded-xl p-2 shadow-sm">
          <p className="text-gray-400 text-[8px] font-black uppercase tracking-wider">Total Sales</p>
          <p className="text-xs font-black text-emerald-700 mt-0.5">
            {formatCurrency(totals.totalRevenue)}
          </p>
        </div>
        <div className="bg-white border border-blue-100 rounded-xl p-2 shadow-sm">
          <p className="text-gray-400 text-[8px] font-black uppercase tracking-wider">Cash Recd</p>
          <p className="text-xs font-black text-blue-700 mt-0.5">
            {formatCurrency(totals.totalCashCollected)}
          </p>
        </div>
        <div className="bg-white border border-red-100 rounded-xl p-2 shadow-sm">
          <p className="text-gray-400 text-[8px] font-black uppercase tracking-wider">Total Exp</p>
          <p className="text-xs font-black text-red-700 mt-0.5">
            {formatCurrency(totals.totalExpenses)}
          </p>
        </div>
      </div>

      {/* ─── Record Expense Section ─── */}
      <div className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm space-y-2">
        <div className="flex items-center justify-between border-b border-gray-50 pb-1.5">
          <h3 className="text-xs font-black uppercase tracking-wide text-gray-800 flex items-center gap-1">
            <Receipt size={14} className="text-orange-500" />
            Record Daily Expense
          </h3>
          <button
            type="button"
            onClick={() => setShowCatPanel(!showCatPanel)}
            className="text-[10px] text-[#ff9900] font-black flex items-center gap-1 hover:underline"
          >
            <Tag size={10} />
            {showCatPanel ? 'Close Editor' : 'Manage Categories'}
          </button>
        </div>

        {/* ── Category Editor Panel ── */}
        {showCatPanel && (
          <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100 space-y-2">
            <h4 className="text-[10px] font-black text-orange-800 uppercase tracking-wider">
              Expense Categories Manager
            </h4>
            
            {loadingCategories ? (
              <Loader2 className="animate-spin text-orange-500" size={16} />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 text-[11px] bg-white border border-orange-200 text-orange-850 px-2 py-0.5 rounded-full font-bold shadow-xs"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title={`Delete "${cat}"`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form onSubmit={handleAddCategory} className="flex gap-2 pt-1.5">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New Category Name..."
                aria-label="New category name"
                className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-orange-500 font-bold"
              />
              <button
                type="submit"
                className="bg-[#ff9900] text-white px-3 py-1.5 rounded-xl font-bold text-xs uppercase hover:bg-orange-600 active:scale-95 transition-all flex items-center gap-1"
              >
                <Plus size={13} />
                Add
              </button>
            </form>
          </div>
        )}

        {/* ── Expense Input Form ── */}
        <form onSubmit={handleRecordExpense} className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <label htmlFor="expense-amount" className="text-[8.5px] font-black text-gray-500 uppercase tracking-wider block">
              Amount (₹)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-gray-400 font-bold text-xs">₹</span>
              <input
                id="expense-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full pl-6 pr-2 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-orange-400/20 transition-all"
              />
            </div>
          </div>

          <div className="space-y-0.5">
            <label htmlFor="expense-category" className="text-[8.5px] font-black text-gray-500 uppercase tracking-wider block">
              Category
            </label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-400/20 transition-all cursor-pointer"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            {!showDatePicker ? (
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5">
                <span className="text-[8.5px] font-black text-gray-500 uppercase tracking-wider">
                  Date: Today (Now)
                </span>
                <button
                  type="button"
                  onClick={() => setShowDatePicker(true)}
                  className="text-[8.5px] text-[#ff9900] font-black uppercase hover:underline"
                >
                  Change Date
                </button>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="expense-date" className="text-[8.5px] font-black text-gray-500 uppercase tracking-wider block">
                    Date & Time
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="text-[8.5px] text-gray-400 font-bold hover:underline"
                  >
                    Use Current Time
                  </button>
                </div>
                <input
                  id="expense-date"
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  required
                  className="w-full px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-400/20 transition-all"
                />
              </div>
            )}
          </div>

          <div className="col-span-2 space-y-0.5">
            <label htmlFor="expense-note" className="text-[8.5px] font-black text-gray-500 uppercase tracking-wider block">
              Narration / Notes
            </label>
            <input
              id="expense-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Fuel for delivery van"
              className="w-full px-2 py-1.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-orange-400/20 transition-all"
            />
          </div>

          <div className="col-span-2 pt-0.5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-orange-500 to-[#ff9900] text-white py-2 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-md hover:from-orange-600 hover:to-orange-500 active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={12} />
                  Saving...
                </>
              ) : (
                <>
                  <Plus size={12} strokeWidth={2.5} />
                  Record Expense
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Recent Expenses Feed ─── */}
      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-gray-800 flex items-center gap-1.5">
          <FileText size={16} className="text-blue-500" />
          Recent Expenses
        </h3>

        {loadingExpenses ? (
          <div className="flex items-center justify-center py-12 text-gray-400 font-bold italic">
            <Loader2 className="animate-spin text-blue-500 mr-2" size={20} />
            Loading entries...
          </div>
        ) : filteredExpensesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-center space-y-2 border border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
            <AlertCircle size={32} className="text-gray-300" />
            <p className="text-xs font-bold italic">No expenses recorded for this period</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto pr-1">
            {filteredExpensesList.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between py-3 gap-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-gray-800">{exp.category}</span>
                    <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                      {formatDate(exp.date)}
                    </span>
                  </div>
                  {exp.note && <p className="text-xs text-gray-400 mt-0.5 truncate">{exp.note}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-red-500 tracking-tight whitespace-nowrap">
                    -{formatCurrency(exp.amount)}
                  </span>
                  <button
                    onClick={() => handleCopyExpense(exp)}
                    className="text-orange-400 p-2 hover:bg-orange-50 rounded-xl transition-colors active:scale-90"
                    title="Copy Entry"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={() => handleDeleteExpense(exp.id, exp.category, exp.amount)}
                    className="text-red-400 p-2 hover:bg-red-50 rounded-xl transition-colors active:scale-90"
                    title="Delete Entry"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
