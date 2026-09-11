import { useState } from 'react'
import { PackagePlus, Layers, Save, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'
import { useClientStore } from '../store/clientStore'

export default function AddStockModal({ onClose }) {
  const addStockBatch = useClientStore((state) => state.addStockBatch)
  const addStockManual = useClientStore((state) => state.addStockManual)

  const [mode, setMode] = useState('batch') // 'batch' | 'single'
  const [loading, setLoading] = useState(false)

  // Batch inward state: map of sku label -> string quantity
  const [quantities, setQuantities] = useState(() => {
    const initial = {}
    WATER_SKUS.forEach((s) => {
      initial[s.label] = ''
    })
    return initial
  })
  const [batchNarration, setBatchNarration] = useState('')

  // Single SKU state
  const [singleSku, setSingleSku] = useState(DEFAULT_SKU)
  const [singleQty, setSingleQty] = useState('')
  const [singleType, setSingleType] = useState('in') // 'in' | 'out'
  const [singleNarration, setSingleNarration] = useState('')

  // Calculations for batch inward
  const totalBatchUnits = WATER_SKUS.reduce((sum, s) => {
    const val = Number(quantities[s.label]) || 0
    return sum + (val > 0 ? val : 0)
  }, 0)

  const activeSkuCount = WATER_SKUS.filter((s) => (Number(quantities[s.label]) || 0) > 0).length

  const handleBatchSubmit = async (e) => {
    e.preventDefault()
    if (totalBatchUnits <= 0) {
      toast.error('Please enter a quantity for at least one SKU')
      return
    }

    setLoading(true)
    try {
      const defaultNote = batchNarration.trim() || 'Factory Stock Inward'
      const entries = WATER_SKUS.map((s) => {
        const val = Number(quantities[s.label]) || 0
        return {
          sku: s.label,
          qty: val,
          narration: defaultNote ? `${defaultNote} (${s.label})` : `Inward (${s.label})`,
        }
      }).filter((e) => e.qty > 0)

      await addStockBatch(entries, defaultNote)
      toast.success(
        `Added ${totalBatchUnits} units across ${entries.length} SKU${entries.length > 1 ? 's' : ''} to ledger!`
      )
      onClose?.()
    } catch (err) {
      toast.error('Failed to add stock: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSingleSubmit = async (e) => {
    e.preventDefault()
    const val = Number(singleQty)
    if (!val || val <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setLoading(true)
    try {
      const signedQty = singleType === 'out' ? -Math.abs(val) : Math.abs(val)
      const note =
        singleNarration.trim() ||
        (singleType === 'out' ? `Manual Outward (${singleSku})` : `Manual Addition (${singleSku})`)

      await addStockManual(signedQty, note, singleSku)
      toast.success(
        `${singleType === 'out' ? 'Deducted' : 'Added'} ${val} units of ${singleSku}`
      )
      onClose?.()
    } catch (err) {
      toast.error('Failed to save stock entry: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleQtyChange = (skuLabel, value) => {
    setQuantities((prev) => ({
      ...prev,
      [skuLabel]: value,
    }))
  }

  const addQuickQty = (skuLabel, amount) => {
    setQuantities((prev) => {
      const current = Number(prev[skuLabel]) || 0
      return {
        ...prev,
        [skuLabel]: String(current + amount),
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ff9900] flex items-center justify-center font-bold">
            <PackagePlus size={22} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-900">Add Stock Entry</h2>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Inventory Ledger Inward & Adjustments
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-xl text-xs font-bold">
        <button
          type="button"
          onClick={() => setMode('batch')}
          className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            mode === 'batch'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <Layers size={15} className="text-[#ff9900]" />
          <span>Batch Inward (All SKUs)</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            mode === 'single'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <PackagePlus size={15} className="text-[#ff9900]" />
          <span>Single SKU / Adjust</span>
        </button>
      </div>

      {/* MODE 1: BATCH INWARD */}
      {mode === 'batch' && (
        <form onSubmit={handleBatchSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="batch-note"
              className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Narration / Batch Note / Truck No.
            </label>
            <input
              id="batch-note"
              type="text"
              placeholder="e.g. Factory Plant Truck #104 / Inward Dispatch"
              value={batchNarration}
              onChange={(e) => setBatchNarration(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#ff9900] focus:bg-white outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Received Quantities by SKU
              </span>
              <span className="text-xs font-bold text-gray-400">
                Enter quantity for received SKUs
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {WATER_SKUS.map((s) => {
                const qtyVal = quantities[s.label] || ''
                const hasQty = Number(qtyVal) > 0

                return (
                  <div
                    key={s.id}
                    className={`p-3 rounded-xl border transition-all ${
                      hasQty
                        ? 'bg-orange-50/40 border-orange-300 ring-1 ring-orange-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${s.badgeClass}`}
                          >
                            {s.brand}
                          </span>
                          <span className="font-bold text-sm text-gray-900 truncate">
                            {s.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 font-medium">
                          Unit: {s.unit} ({s.size})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Quick increment buttons */}
                        <div className="hidden sm:flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => addQuickQty(s.label, 20)}
                            className="px-2 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                          >
                            +20
                          </button>
                          <button
                            type="button"
                            onClick={() => addQuickQty(s.label, 50)}
                            className="px-2 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                          >
                            +50
                          </button>
                          <button
                            type="button"
                            onClick={() => addQuickQty(s.label, 100)}
                            className="px-2 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
                          >
                            +100
                          </button>
                        </div>

                        {/* Numeric input */}
                        <div className="w-24">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={qtyVal}
                            onChange={(e) => handleQtyChange(s.label, e.target.value)}
                            className={`w-full py-2 px-3 text-right font-black text-base rounded-xl border outline-none focus:ring-2 focus:ring-[#ff9900] ${
                              hasQty
                                ? 'border-[#ff9900] bg-white text-gray-900'
                                : 'border-gray-200 bg-gray-50 text-gray-600'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Batch Summary Footer */}
          <div className="p-3 bg-gradient-to-r from-gray-900 to-[#131921] rounded-xl text-white flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                Batch Inward Summary
              </p>
              <p className="text-xs font-semibold text-gray-300">
                {activeSkuCount} {activeSkuCount === 1 ? 'SKU' : 'SKUs'} to receive
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-orange-400 font-bold uppercase tracking-wider">
                Total Units
              </p>
              <p className="text-2xl font-black text-white leading-none">
                {totalBatchUnits}{' '}
                <span className="text-xs font-normal text-gray-400">boxes/cases</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3 px-4 rounded-xl border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || totalBatchUnits <= 0}
              className="py-3 px-4 rounded-xl bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-extrabold text-sm shadow-sm hover:from-[#f5d78e] hover:to-[#eeb933] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                'Saving Batch...'
              ) : (
                <>
                  <Save size={16} /> Save Inward ({totalBatchUnits})
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* MODE 2: SINGLE SKU ADJUSTMENT */}
      {mode === 'single' && (
        <form onSubmit={handleSingleSubmit} className="space-y-4">
          {/* In / Out direction */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSingleType('in')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                singleType === 'in'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ArrowUpRight size={16} className="text-emerald-600" />
              <span>Stock In (+)</span>
            </button>
            <button
              type="button"
              onClick={() => setSingleType('out')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                singleType === 'out'
                  ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-300'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ArrowDownLeft size={16} className="text-rose-600" />
              <span>Stock Out / Wastage (-)</span>
            </button>
          </div>

          <div>
            <label
              htmlFor="single-sku-select"
              className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Product / Water SKU
            </label>
            <select
              id="single-sku-select"
              value={singleSku}
              onChange={(e) => setSingleSku(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
            >
              {WATER_SKUS.map((s) => (
                <option key={s.id} value={s.label}>
                  {s.label} ({s.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="single-qty-input"
              className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Quantity ({getSkuMeta(singleSku).unit})
            </label>
            <input
              id="single-qty-input"
              type="number"
              min="1"
              required
              placeholder="e.g. 50"
              value={singleQty}
              onChange={(e) => setSingleQty(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-lg font-black focus:ring-2 focus:ring-[#ff9900] outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="single-narration-input"
              className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5"
            >
              Narration / Note
            </label>
            <input
              id="single-narration-input"
              type="text"
              placeholder={
                singleType === 'out'
                  ? 'e.g. Damaged / broken bottles written off'
                  : 'e.g. Plant arrival / stock adjustment'
              }
              value={singleNarration}
              onChange={(e) => setSingleNarration(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#ff9900] focus:bg-white outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3 px-4 rounded-xl border border-gray-300 text-gray-700 font-bold text-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !singleQty}
              className="py-3 px-4 rounded-xl bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-extrabold text-sm shadow-sm hover:from-[#f5d78e] hover:to-[#eeb933] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                'Saving...'
              ) : (
                <>
                  <Save size={16} /> Save Entry
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
