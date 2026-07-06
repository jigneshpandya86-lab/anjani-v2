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
  X,
  Clock,
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

export default function ExpensesDashboard({ showAddForm, onOpenAddForm, onCloseAddForm }) {
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
    onOpenAddForm()
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
    <div className="space-y-2 pb-20">
      {/* ─── Header Card: Running Profit (Zoho Books Style) ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3.5 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-2">
          <h2 className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">
            Profit & Loss Dashboard
          </h2>
          <div className="shrink-0 flex items-center gap-1 text-[10px] bg-white/20 text-white px-2 py-1 rounded-full font-black uppercase shadow-sm backdrop-blur-sm">
            <PiggyBank size={11} /> Realtime
          </div>
        </div>

        {/* Period Selector Tabs */}
        <div className="relative mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
          <span className="text-[10px] text-white/70 font-extrabold uppercase tracking-wide">Period</span>
          <div className="flex items-center gap-0.5 bg-white/10 rounded-xl p-0.5 border border-white/5">
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
                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase transition-all ${
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
              <p className="text-[11px] text-white/70 font-extrabold uppercase tracking-wide">Accrual Profit</p>
              <h3 className={`text-2xl font-black mt-1 leading-none ${isProfitAccrual ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(totals.accrualProfit)}
              </h3>
              <p className="text-[9px] text-white/45 font-bold mt-0.5">Sales - Expenses</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70 font-extrabold uppercase tracking-wide">Cash Flow Profit</p>
              <h3 className={`text-2xl font-black mt-1 leading-none ${isProfitCash ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatCurrency(totals.cashProfit)}
              </h3>
              <p className="text-[9px] text-white/45 font-bold mt-0.5">Cash - Expenses</p>
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

      {/* ─── Recent Expenses Feed ─── */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between pt-2">
          <h3 className="text-xs font-black uppercase tracking-wide text-gray-800 flex items-center gap-1.5">
            <FileText size={14} className="text-blue-500" />
            Recent Expenses
          </h3>
          <div className="text-[10px] text-gray-400 font-extrabold uppercase">
            {filteredExpensesList.length} Entries
          </div>
        </div>

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
          <div className="max-h-[500px] overflow-y-auto pr-1">
            {filteredExpensesList.map((exp) => (
              <div
                key={exp.id}
                className="relative overflow-hidden bg-white px-2.5 py-2.5 rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-gray-100 border-l-[3px] border-l-red-500 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)] mb-2"
              >
                <div className="relative space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 rounded-lg shadow-inner bg-red-50 text-red-500 shrink-0">
                      <Receipt size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-extrabold text-sm text-gray-900 leading-tight">
                          {exp.category}
                        </p>
                        {exp.note && (
                          <span className="shrink-0 text-[9px] font-semibold text-gray-500 tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full max-w-[120px] truncate" title={exp.note}>
                            {exp.note}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyExpense(exp)}
                      className="shrink-0 flex items-center justify-center rounded-md bg-orange-50 p-1 text-orange-500 transition-colors hover:bg-orange-100 active:scale-90"
                      title="Copy Entry"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpense(exp.id, exp.category, exp.amount)}
                      className="shrink-0 flex items-center justify-center rounded-md bg-red-50 p-1 text-red-500 transition-colors hover:bg-red-100 active:scale-90"
                      title="Delete Entry"
                    >
                      <Trash2 size={12} />
                    </button>
                    <p className="shrink-0 font-black text-base leading-none text-red-500">
                      -{formatCurrency(exp.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-8">
                    <p className="truncate text-[10px] text-gray-500 flex items-center gap-1 uppercase tracking-wide font-bold">
                      <Clock size={10} /> {formatDate(exp.date)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Record Expense Modal overlay */}
      {showAddForm && (
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Receipt className="text-orange-500" size={20} />
                  Record Expense
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Log a new business expense</p>
              </div>
              <button
                type="button"
                onClick={onCloseAddForm}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Category Editor Toggle inside Modal */}
              <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                <span className="text-xs font-extrabold text-gray-600">
                  Manage Categories
                </span>
                <button
                  type="button"
                  onClick={() => setShowCatPanel(!showCatPanel)}
                  className="text-xs text-[#ff9900] font-black uppercase hover:underline"
                >
                  {showCatPanel ? 'Hide Manager' : 'Show Manager'}
                </button>
              </div>

              {showCatPanel && (
                <div className="bg-orange-50/50 rounded-2xl p-4 border border-orange-100 space-y-3">
                  <h4 className="text-xs font-black text-orange-850 uppercase tracking-wider">
                    Categories List
                  </h4>
                  {loadingCategories ? (
                    <Loader2 className="animate-spin text-orange-500" size={16} />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat) => (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-1.5 text-xs bg-white border border-orange-200 text-orange-850 px-3 py-1 rounded-full font-bold shadow-2xs"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(cat)}
                            className="text-red-400 hover:text-red-600 transition-colors font-bold text-sm"
                            title={`Delete "${cat}"`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleAddCategory} className="flex gap-2 pt-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New Category Name..."
                      required
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#ff9900] font-bold"
                    />
                    <button
                      type="submit"
                      className="bg-[#ff9900] text-white px-4 py-2 rounded-xl font-black text-xs uppercase hover:bg-orange-600 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </form>
                </div>
              )}

              {/* Main Expense Form */}
              <form onSubmit={async (e) => {
                e.preventDefault()
                await handleRecordExpense(e)
                onCloseAddForm()
              }} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="modal-expense-amount" className="block text-xs font-black text-gray-500 uppercase tracking-wider">
                    Amount (₹)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-gray-400 font-bold text-sm">₹</span>
                    <input
                      id="modal-expense-amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full pl-8 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-base font-black outline-none focus:ring-2 focus:ring-[#ff9900] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="modal-expense-category" className="block text-xs font-black text-gray-500 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    id="modal-expense-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="w-full px-3 py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#ff9900] cursor-pointer"
                  >
                    <option value="" disabled>Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="modal-expense-date" className="block text-xs font-black text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </label>
                    {showDatePicker && (
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(false)}
                        className="text-xs text-[#ff9900] font-black uppercase hover:underline"
                      >
                        Use Current Time
                      </button>
                    )}
                  </div>
                  {!showDatePicker ? (
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
                      <span className="text-xs font-bold text-gray-600">
                        Today (Current Time)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(true)}
                        className="text-xs text-[#ff9900] font-black uppercase hover:underline"
                      >
                        Set Custom Date
                      </button>
                    </div>
                  ) : (
                    <input
                      id="modal-expense-date"
                      type="datetime-local"
                      value={dateTime}
                      onChange={(e) => setDateTime(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#ff9900]"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="modal-expense-note" className="block text-xs font-black text-gray-500 uppercase tracking-wider">
                    Narration / Notes
                  </label>
                  <input
                    id="modal-expense-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Fuel for delivery van"
                    className="w-full px-3 py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#ff9900]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#131921] hover:bg-black text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? (
                    'Recording...'
                  ) : (
                    <>
                      <Plus size={20} strokeWidth={2.5} /> Record Expense
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
