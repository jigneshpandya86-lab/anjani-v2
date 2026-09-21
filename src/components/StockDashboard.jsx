import { useState, useEffect } from 'react'
import { useClientStore } from '../store/clientStore'
import toast from 'react-hot-toast'
import {
  Plus,
  History,
  Tag,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  RefreshCw,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Droplets,
} from 'lucide-react'
import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'
import AddStockModal from './AddStockModal'

export default function StockDashboard({ onOpenReport, onOpenBaileyOrder }) {
  const {
    stockEntries,
    stockTotal,
    stockSummary,
    deleteStockEntry,
    fetchStock,
    fetchStockTotal,
    recalculateStockTotal,
    loading,
  } = useClientStore()
  const [showAdd, setShowAdd] = useState(false)
  const [skuFilter, setSkuFilter] = useState('All')
  const [isSyncing, setIsSyncing] = useState(false)

  const handleRecalculate = async () => {
    setIsSyncing(true)
    try {
      await recalculateStockTotal()
      toast.success('Stock total synchronized')
    } catch (_error) {
      toast.error('Failed to sync stock')
    } finally {
      setIsSyncing(false)
    }
  }

  const getDefaultDateRange = () => {
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - 7)

    const toInputDate = (date) => {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }

    return {
      start: toInputDate(start),
      end: toInputDate(end),
    }
  }

  const [startDate, setStartDate] = useState(() => getDefaultDateRange().start)
  const [endDate, setEndDate] = useState(() => getDefaultDateRange().end)
  const [showSkuBreakup, setShowSkuBreakup] = useState(() => {
    try {
      const saved = localStorage.getItem('anjani_show_sku_breakup')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const MIN_VISIBLE_ITEMS = 50

  const toggleSkuBreakup = () => {
    setShowSkuBreakup((prev) => {
      const next = !prev
      try {
        localStorage.setItem('anjani_show_sku_breakup', String(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  useEffect(() => {
    const unsubStock = fetchStock()
    const unsubTotal = fetchStockTotal ? fetchStockTotal() : null
    return () => {
      if (unsubStock) unsubStock()
      if (unsubTotal) unsubTotal()
    }
  }, [fetchStock, fetchStockTotal])

  const toDateKey = (value) => {
    if (!value) return ''

    let dateObj = null

    if (value?.toDate) {
      dateObj = value.toDate()
    } else if (value?.seconds) {
      dateObj = new Date(value.seconds * 1000)
    } else if (typeof value === 'string') {
      // Supports legacy dd-mm-yyyy strings and ISO-like strings.
      const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (ddmmyyyy) {
        const [, dd, mm, yyyy] = ddmmyyyy
        return `${yyyy}-${mm}-${dd}`
      }
      const parsed = new Date(value)
      if (!Number.isNaN(parsed.getTime())) {
        dateObj = parsed
      }
    } else if (value instanceof Date) {
      dateObj = value
    }

    if (!dateObj || Number.isNaN(dateObj.getTime())) return ''

    // Use local calendar date to avoid timezone drift from toISOString().
    const y = dateObj.getFullYear()
    const m = String(dateObj.getMonth() + 1).padStart(2, '0')
    const d = String(dateObj.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Get live stock count for an individual SKU with fallback
  const getSkuStock = (skuLabel) => {
    const meta = getSkuMeta(skuLabel)
    const val = stockSummary?.[meta.label] ?? stockSummary?.[skuLabel]
    if (val !== undefined && val !== null && !isNaN(Number(val))) {
      return Number(val)
    }
    // Fallback: sum from stockEntries if summary doc didn't have this key yet
    return stockEntries.reduce((sum, entry) => {
      const entryMeta = getSkuMeta(entry.sku || DEFAULT_SKU)
      if (entryMeta.label === meta.label) {
        return sum + (Number(entry.qty) || 0)
      }
      return sum
    }, 0)
  }

  // Total stock from aggregate summary doc or sum of all individual SKUs
  const totalStock =
    Number(stockTotal) ||
    Object.values(stockSummary || {}).reduce((s, v) => s + (Number(v) || 0), 0)

  // Filters ONLY the visual transaction log
  const filtered = stockEntries.filter((entry) => {
    const entrySku = entry.sku || DEFAULT_SKU
    if (skuFilter !== 'All' && entrySku !== skuFilter) return false

    if (!startDate && !endDate) return true
    const entryDate = toDateKey(entry.date || entry.createdAt)
    if (!entryDate) return false

    if (startDate && entryDate < startDate) return false
    if (endDate && entryDate > endDate) return false
    return true
  })


  const handleDelete = async (entry) => {
    const label = entry.narration || entry.note || 'this entry'
    const confirmed = window.confirm(`Delete "${label}"? This will update live stock total.`)
    if (!confirmed) return

    try {
      await deleteStockEntry(entry.id)
      toast.success('Stock entry deleted')
    } catch (error) {
      toast.error(`Failed to delete entry: ${error.message}`)
    }
  }

  return (
    <div className="space-y-2 pb-20">
      {/* Stock Summary + Date Range Filter */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3.5 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />
        
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">
              Total Current Stock
            </h2>
            <button
              type="button"
              onClick={toggleSkuBreakup}
              className="flex items-center gap-1 text-[9px] bg-white/15 hover:bg-white/25 text-[#ff9900] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider transition-all backdrop-blur-sm cursor-pointer shadow-2xs shrink-0"
              title="Toggle SKU wise stock breakup"
            >
              <Layers size={10} />
              <span>{showSkuBreakup ? 'Hide Breakup' : 'SKU Breakup'}</span>
              {showSkuBreakup ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          </div>
          <div className="shrink-0 flex items-center gap-1.5 text-[10px] bg-white/20 text-white px-2 py-1 rounded-full font-black uppercase shadow-sm backdrop-blur-sm">
            <input
              type="date"
              className="w-[96px] bg-transparent text-white text-[10px] font-bold outline-none"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-white/70">—</span>
            <input
              type="date"
              className="w-[96px] bg-transparent text-white text-[10px] font-bold outline-none"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        
        <div className="relative mt-2 flex items-center justify-between gap-2">
          <div>
            <p className="truncate text-3xl font-black leading-none">
              {totalStock.toLocaleString()}{' '}
              <span className="text-[10px] font-extrabold text-white/75 uppercase tracking-wide">
                BXS
              </span>
            </p>
            <p className="text-[10px] text-white/60 font-medium mt-0.5">
              Live warehouse inventory across all products
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenBaileyOrder && (
              <button
                type="button"
                onClick={onOpenBaileyOrder}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Smart Bailey Water Replenishment Order based on consumption"
              >
                <Droplets size={12} className="text-cyan-300" />
                <span>Order Bailey</span>
              </button>
            )}
            <button
              onClick={handleRecalculate}
              disabled={isSyncing || loading}
              className={`p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all ${isSyncing ? 'animate-spin' : ''}`}
              title="Recalculate Total from Ledger"
            >
              <RefreshCw size={12} className="text-white" />
            </button>
            <button
              onClick={onOpenReport}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
              title="Generate Stock Statement Report"
            >
              <FileText size={12} className="text-white" />
            </button>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  const { start, end } = getDefaultDateRange()
                  setStartDate(start)
                  setEndDate(end)
                }}
                className="text-[9px] font-black uppercase bg-white/20 px-2 py-1 rounded-lg hover:bg-white/30 transition-all"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* SKU-Wise Breakup Section */}
        {showSkuBreakup && (
          <div className="relative mt-3 pt-3 border-t border-white/15 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/75 flex items-center gap-1.5">
                <LayoutGrid size={11} className="text-[#ff9900]" />
                SKU-Wise Live Breakdown
              </span>
              <div className="flex items-center gap-2">
                {onOpenBaileyOrder && (
                  <button
                    type="button"
                    onClick={onOpenBaileyOrder}
                    className="text-[9px] font-black uppercase tracking-wide bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full flex items-center gap-1 transition-all cursor-pointer"
                    title="Calculate consumption pattern and create Bailey replenishment order"
                  >
                    <Droplets size={9} className="text-cyan-300" />
                    <span>Order Bailey</span>
                  </button>
                )}
                <span className="text-[9px] text-white/60">Tap card to filter</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {WATER_SKUS.map((sku) => {
                const qty = getSkuStock(sku.label)
                const isSelected = skuFilter === sku.label
                const percent =
                  totalStock > 0 ? Math.round((Math.max(0, qty) / totalStock) * 100) : 0

                return (
                  <button
                    key={sku.id}
                    type="button"
                    onClick={() => setSkuFilter(isSelected ? 'All' : sku.label)}
                    className={`relative p-2.5 rounded-2xl text-left transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-white text-gray-900 border-white shadow-lg ring-2 ring-[#ff9900]'
                        : 'bg-white/10 hover:bg-white/20 text-white border-white/10 backdrop-blur-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span
                        className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          isSelected
                            ? sku.brand === 'Bailey'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                            : 'bg-white/20 text-white'
                        }`}
                      >
                        {sku.brand}
                      </span>
                      <span
                        className={`text-[9px] font-bold ${
                          isSelected ? 'text-gray-500' : 'text-white/60'
                        }`}
                      >
                        {percent}%
                      </span>
                    </div>

                    <p
                      className={`font-extrabold text-xs truncate ${
                        isSelected ? 'text-gray-900' : 'text-white'
                      }`}
                      title={sku.label}
                    >
                      {sku.label}
                    </p>

                    <div className="mt-1 flex items-baseline justify-between">
                      <span
                        className={`text-lg font-black leading-none ${
                          isSelected ? 'text-gray-950' : 'text-white'
                        }`}
                      >
                        {qty.toLocaleString()}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase ${
                          isSelected ? 'text-gray-400' : 'text-white/70'
                        }`}
                      >
                        {sku.unit === 'Box' ? 'Bxs' : 'Cs'}
                      </span>
                    </div>

                    {/* Visual proportion bar */}
                    <div
                      className={`mt-1.5 h-1 w-full rounded-full overflow-hidden ${
                        isSelected ? 'bg-gray-200' : 'bg-white/20'
                      }`}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, percent))}%`,
                          backgroundColor: isSelected
                            ? '#ff9900'
                            : sku.brand === 'Bailey'
                              ? '#34d399'
                              : '#60a5fa',
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* SKU Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide px-0.5">
        <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider shrink-0">
          SKU:
        </span>
        <button
          type="button"
          onClick={() => setSkuFilter('All')}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide shrink-0 border transition-all ${
            skuFilter === 'All'
              ? 'bg-[#131921] text-[#ff9900] border-[#131921]'
              : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
          }`}
        >
          All SKUs
        </button>
        {WATER_SKUS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSkuFilter(s.label)}
            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide shrink-0 border transition-all ${
              skuFilter === s.label
                ? s.brand === 'Bailey'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                  : 'bg-blue-700 text-white border-blue-700 shadow-xs'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Ledger Entries */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between pt-2">
          <h3 className="text-xs font-black uppercase tracking-wide text-gray-800 flex items-center gap-1.5">
            <History size={14} className="text-blue-500" />
            Movement Log
          </h3>
          <div className="text-[10px] text-gray-400 font-extrabold uppercase">
            {filtered.length} Entries
          </div>
        </div>
        {filtered.slice(0, MIN_VISIBLE_ITEMS).map((entry, index) => {
          const isIncrease = entry.qty > 0
          return (
            <div
              key={entry.id}
              className={`relative overflow-hidden ${index % 2 === 0 ? 'bg-slate-50/95' : 'bg-white'} px-2.5 py-2 rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-white/80 border-l-[3px] ${isIncrease ? 'border-l-emerald-500' : 'border-l-rose-500'} transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)]`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.5),transparent_35%,rgba(148,163,184,0.04))]" />
              <div className="relative space-y-1">
                <div className="flex items-start gap-2">
                  <div
                    className={`p-1.5 rounded-lg shadow-inner ${isIncrease ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-400'} shrink-0`}
                  >
                    {isIncrease ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="truncate font-extrabold text-sm text-gray-900 leading-tight">
                        {entry.narration || entry.note || 'Adjustment'}
                      </p>
                      <span
                        className={`shrink-0 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${getSkuMeta(entry.sku || DEFAULT_SKU).badgeClass}`}
                      >
                        {entry.sku || DEFAULT_SKU}
                      </span>
                      <span className="shrink-0 text-[9px] font-semibold text-gray-500 tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full uppercase">
                        {entry.type || 'entry'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className="shrink-0 flex items-center justify-center rounded-md bg-rose-50 p-1 text-rose-500 transition-colors hover:bg-rose-100"
                    aria-label={`Delete ${entry.narration || entry.note || 'stock entry'}`}
                    title="Delete stock entry"
                  >
                    <Trash2 size={12} />
                  </button>
                  <p
                    className={`shrink-0 font-black text-lg leading-none ${isIncrease ? 'text-emerald-500' : 'text-rose-400'}`}
                  >
                    {isIncrease ? '+' : ''}
                    {entry.qty}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pl-8">
                  <p className="truncate text-[10px] text-gray-500 flex items-center gap-1 uppercase tracking-wide font-bold">
                    <Tag size={8} />{' '}
                    {(entry.date?.toDate ? entry.date : entry.createdAt)?.toDate
                      ? (entry.date?.toDate ? entry.date : entry.createdAt)
                          .toDate()
                          .toLocaleDateString('en-IN')
                      : 'Recent'}
                  </p>
                  <p className="shrink-0 inline-flex text-[8px] text-gray-600 font-extrabold uppercase tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {isIncrease ? 'STOCK IN' : 'STOCK OUT'}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 text-xs font-medium py-6">No movements found.</p>
        )}
      </div>

      {/* Add Stock Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="relative bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <AddStockModal onClose={() => setShowAdd(false)} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-4 z-[998] bg-[#ff9900] text-white w-14 h-14 rounded-full shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
        aria-label="Add stock entry"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  )
}
