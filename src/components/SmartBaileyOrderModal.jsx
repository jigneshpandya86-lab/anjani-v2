import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  Droplets,
  PackageCheck,
  TrendingDown,
  AlertTriangle,
  Send,
  Printer,
  Copy,
  Plus,
  Minus,
  RotateCcw,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  Truck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import {
  calculateBaileyConsumptionStats,
  calculateBaileyReplenishment,
  generateBaileyPurchaseOrderWhatsApp,
  generateBaileyPurchaseOrderHtml,
} from '../utils/baileyOrderUtils'

export default function SmartBaileyOrderModal({ isOpen, onClose }) {
  const {
    orders = [],
    stockEntries = [],
    stockSummary = {},
    addStockBatch,
  } = useClientStore()

  // Configuration state
  const [daysWindow, setDaysWindow] = useState(14)
  const [targetBufferDays, setTargetBufferDays] = useState(14)
  const [userOverrides, setUserOverrides] = useState({})
  const [supplierName, setSupplierName] = useState(() => {
    try {
      return localStorage.getItem('bailey_supplier_name') || 'Bailey Bottling Depot'
    } catch {
      return 'Bailey Bottling Depot'
    }
  })
  const [supplierPhone, setSupplierPhone] = useState(() => {
    try {
      return localStorage.getItem('bailey_supplier_phone') || ''
    } catch {
      return ''
    }
  })
  const [notes, setNotes] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [isInwarding, setIsInwarding] = useState(false)
  const [copied, setCopied] = useState(false)

  // Save supplier settings
  const handleSaveSupplier = (name, phone) => {
    try {
      localStorage.setItem('bailey_supplier_name', name)
      localStorage.setItem('bailey_supplier_phone', phone)
    } catch {
      // ignore storage errors
    }
  }

  // Calculate consumption stats based on active window
  const consumptionStats = useMemo(() => {
    return calculateBaileyConsumptionStats({
      orders,
      stockEntries,
      stockSummary,
      daysWindow,
      nowMillis: Date.now(),
    })
  }, [orders, stockEntries, stockSummary, daysWindow])

  // Calculate replenishment plan based on target buffer and overrides
  const replenishmentPlan = useMemo(() => {
    return calculateBaileyReplenishment({
      consumptionStats,
      targetBufferDays,
      userOverrides,
    })
  }, [consumptionStats, targetBufferDays, userOverrides])

  // Summary aggregates
  const totalCurrentStock = consumptionStats.reduce((sum, s) => sum + s.currentStock, 0)
  const totalDailyRunRate = Math.round(consumptionStats.reduce((sum, s) => sum + s.dailyRunRate, 0) * 10) / 10
  const totalOrderCases = replenishmentPlan.reduce((sum, s) => sum + s.finalOrderQty, 0)
  const criticalItems = consumptionStats.filter((s) => s.status.level === 'danger')
  const lowItems = consumptionStats.filter((s) => s.status.level === 'warning')

  const poNumber = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `PO-BLY-${y}${m}${day}-${Math.floor(1000 + Math.random() * 9000)}`
  }, [])

  // Reset overrides when window or buffer changes
  useEffect(() => {
    setUserOverrides({})
  }, [daysWindow, targetBufferDays])

  if (!isOpen) return null

  // Adjust final quantity
  const handleQtyChange = (skuLabel, newQty) => {
    const val = Math.max(0, parseInt(newQty, 10) || 0)
    setUserOverrides((prev) => ({
      ...prev,
      [skuLabel]: val,
    }))
  }

  const handleQtyDelta = (skuLabel, currentVal, delta) => {
    const nextVal = Math.max(0, currentVal + delta)
    handleQtyChange(skuLabel, nextVal)
  }

  const handleResetOverride = (skuLabel) => {
    setUserOverrides((prev) => {
      const next = { ...prev }
      delete next[skuLabel]
      return next
    })
  }

  // Action: WhatsApp Order Dispatch
  const handleSendWhatsApp = () => {
    if (totalOrderCases <= 0) {
      toast.error('Please specify order quantity for at least one SKU')
      return
    }

    const message = generateBaileyPurchaseOrderWhatsApp({
      poNumber,
      orderDate: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      items: replenishmentPlan,
      supplierName,
      distributorName: 'Annapurna Foods',
      distributorLocation: 'Ajwa Road, Vadodara',
      contactPerson: 'Jignesh Pandya',
      contactMobile: '9825126388',
      notes,
    })

    const cleanPhone = supplierPhone.replace(/\D/g, '')
    const targetUrl = cleanPhone
      ? `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`

    window.open(targetUrl, '_blank')
    toast.success('Opening WhatsApp with Purchase Order message!')
  }

  // Action: Copy WhatsApp message
  const handleCopyMessage = async () => {
    const message = generateBaileyPurchaseOrderWhatsApp({
      poNumber,
      orderDate: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      items: replenishmentPlan,
      supplierName,
      notes,
    })

    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success('Purchase Order copied to clipboard!')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Action: Inward Stock to Ledger
  const handleRecordInward = async () => {
    const activeItems = replenishmentPlan.filter((it) => it.finalOrderQty > 0)
    if (activeItems.length === 0) {
      toast.error('No items with quantity > 0 to record')
      return
    }

    const confirmMsg = `Record inward stock of ${totalOrderCases} Cases across ${activeItems.length} Bailey SKUs?`
    if (!window.confirm(confirmMsg)) return

    setIsInwarding(true)
    try {
      const defaultNote = `Bailey PO Inward (${poNumber})`
      const entries = activeItems.map((it) => ({
        sku: it.label,
        qty: it.finalOrderQty,
        narration: `${defaultNote} - ${it.finalOrderQty} ${it.unit || 'Cases'}`,
      }))

      await addStockBatch(entries, defaultNote)
      toast.success(`Added ${totalOrderCases} Cases to warehouse stock!`)
      onClose()
    } catch (err) {
      toast.error('Failed to record inward stock: ' + err.message)
    } finally {
      setIsInwarding(false)
    }
  }

  // Action: Print / PDF
  const handlePrintPo = () => {
    const htmlContent = generateBaileyPurchaseOrderHtml({
      poNumber,
      orderDate: new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      items: replenishmentPlan,
      supplierName,
      distributorName: 'Annapurna Foods (Authorized Bailey Distributorship)',
      distributorAddress: 'Ajwa Road, Vadodara, Gujarat',
      distributorPhone: '9825126388',
      notes,
    })

    const printWin = window.open('', '_blank', 'width=900,height=750')
    if (!printWin) {
      toast.error('Popup blocked. Allow popups to preview printable PO.')
      return
    }
    printWin.document.write(htmlContent)
    printWin.document.close()
    setTimeout(() => {
      printWin.focus()
      printWin.print()
    }, 300)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-3 sm:p-4">
      {/* Accessible Backdrop */}
      <button
        type="button"
        aria-label="Close modal overlay"
        onClick={onClose}
        className="fixed inset-0 bg-transparent cursor-default"
      />

      {/* Modal Dialog Box */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bailey-order-title"
        className="relative bg-white rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl z-10"
      >
        {/* Header - Aligned with App Theme */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ff9900] flex items-center justify-center font-bold">
              <Droplets size={22} />
            </div>
            <div>
              <h2 id="bailey-order-title" className="text-lg font-black text-gray-900 leading-tight">
                Order Bailey Water
              </h2>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Smart PO based on consumption & stock
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Clean 3-Metric Summary Banner */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">On Hand</p>
              <p className="text-lg sm:text-xl font-black text-gray-900 mt-0.5">
                {totalCurrentStock}{' '}
                <span className="text-xs font-semibold text-gray-400">Cs</span>
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Run-Rate</p>
              <p className="text-lg sm:text-xl font-black text-gray-900 mt-0.5">
                {totalDailyRunRate}{' '}
                <span className="text-xs font-semibold text-gray-400">Cs/d</span>
              </p>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
              <p className="text-[11px] font-extrabold text-[#ff9900] uppercase tracking-wide">Suggested</p>
              <p className="text-lg sm:text-xl font-black text-[#ff9900] mt-0.5">
                {totalOrderCases}{' '}
                <span className="text-xs font-bold text-orange-400">Cs</span>
              </p>
            </div>
          </div>

          {/* Simple, Uncluttered Period & Buffer Controls */}
          <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-bold flex items-center gap-1">
                <Calendar size={13} className="text-gray-400" />
                Period:
              </span>
              <div className="inline-flex rounded-lg bg-gray-200/70 p-0.5">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-label={`Consumption window ${days} days`}
                    onClick={() => setDaysWindow(days)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      daysWindow === days
                        ? 'bg-white text-gray-900 shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-gray-500 font-bold flex items-center gap-1">
                <ShieldCheck size={13} className="text-[#ff9900]" />
                Buffer:
              </span>
              <div className="inline-flex rounded-lg bg-gray-200/70 p-0.5">
                {[7, 10, 14, 21].map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-label={`Safety buffer ${days} days`}
                    onClick={() => setTargetBufferDays(days)}
                    className={`px-2 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      targetBufferDays === days
                        ? 'bg-[#131921] text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Simple Alert Notice if any items need urgent attention */}
          {criticalItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
              <AlertTriangle size={14} className="shrink-0 text-red-500" />
              <span>
                <strong>Attention:</strong> {criticalItems.map((c) => c.label).join(', ')}{' '}
                {criticalItems.length === 1 ? 'is' : 'are'} critically low on stock.
              </span>
            </div>
          )}

          {criticalItems.length === 0 && lowItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <TrendingDown size={14} className="shrink-0 text-amber-600" />
              <span>
                <strong>Low Stock:</strong> {lowItems.map((c) => c.label).join(', ')}{' '}
                inventory runway is under 7 days.
              </span>
            </div>
          )}

          {/* SKU List - Clean, Spacious and Legible */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-gray-500 font-bold">
              <span>PRODUCT / SKU</span>
              <span>ORDER QUANTITY (CASES)</span>
            </div>

            {replenishmentPlan.map((item) => {
              const isOverridden = item.hasOverride

              return (
                <div
                  key={item.sku.id}
                  className="p-3.5 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-all shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-gray-900">
                        {item.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({item.size})
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        item.status.level === 'danger'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : item.status.level === 'warning'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {item.status.label}
                    </span>
                  </div>

                  {/* Clean readable stats line */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>
                      Stock: <strong className="text-gray-800 font-bold">{item.currentStock} Cs</strong>
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>
                      Daily Sales: <strong className="text-gray-800 font-bold">{item.dailyRunRate}/d</strong>
                    </span>
                    <span className="text-gray-300">•</span>
                    <span>
                      Runway: <strong className="text-gray-800 font-bold">{item.dailyRunRate > 0 ? `${item.runwayDays}d` : '∞'}</strong>
                    </span>
                  </div>

                  {/* Quantity Stepper Row */}
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        Suggested: <strong className="text-gray-800">{item.recommendedQty} Cs</strong>
                      </span>
                      {isOverridden && (
                        <button
                          type="button"
                          onClick={() => handleResetOverride(item.label)}
                          className="text-[11px] text-[#ff9900] hover:text-orange-600 font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                          title="Reset to recommended quantity"
                        >
                          <RotateCcw size={10} />
                          <span>Reset</span>
                        </button>
                      )}
                    </div>

                    {/* Clean Stepper Control */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleQtyDelta(item.label, item.finalOrderQty, -1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Decrease quantity by 1"
                      >
                        <Minus size={14} />
                      </button>

                      <label htmlFor={`order-qty-${item.sku.id}`} className="sr-only">
                        {item.label} order quantity
                      </label>
                      <input
                        id={`order-qty-${item.sku.id}`}
                        type="number"
                        min="0"
                        value={item.finalOrderQty}
                        onChange={(e) => handleQtyChange(item.label, e.target.value)}
                        className={`w-16 text-center text-sm font-black py-1 px-1 rounded-lg border focus:ring-2 focus:ring-[#ff9900] focus:outline-hidden ${
                          item.finalOrderQty > 0
                            ? 'border-orange-300 bg-orange-50/40 text-gray-900'
                            : 'border-gray-200 text-gray-400'
                        }`}
                      />

                      <button
                        type="button"
                        onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Increase quantity by 1"
                      >
                        <Plus size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 10)}
                        className="px-2 py-1 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                        title="+10 cases"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Supplier Details Accordion */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-800 font-bold py-2 border-t border-gray-100 transition-colors cursor-pointer"
            >
              <span>Supplier & Delivery Notes</span>
              {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showSettings && (
              <div className="p-3 bg-gray-50 rounded-xl space-y-2.5 mt-1 border border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="supplier-name" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Supplier / Depot
                    </label>
                    <input
                      id="supplier-name"
                      type="text"
                      value={supplierName}
                      onChange={(e) => {
                        setSupplierName(e.target.value)
                        handleSaveSupplier(e.target.value, supplierPhone)
                      }}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#ff9900] outline-none"
                      placeholder="Bailey Bottling Plant"
                    />
                  </div>
                  <div>
                    <label htmlFor="supplier-phone" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Supplier WhatsApp Number
                    </label>
                    <input
                      id="supplier-phone"
                      type="tel"
                      value={supplierPhone}
                      onChange={(e) => {
                        setSupplierPhone(e.target.value)
                        handleSaveSupplier(supplierName, e.target.value)
                      }}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#ff9900] outline-none"
                      placeholder="e.g. 98251XXXXX"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="order-notes" className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Delivery Instructions / Notes
                  </label>
                  <input
                    id="order-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#ff9900] outline-none"
                    placeholder="e.g. Morning dispatch; deliver to Vadodara warehouse"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Consistent App Theme Buttons */}
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrintPo}
              className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              title="Print PO"
            >
              <Printer size={15} />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              title="Copy WhatsApp Message"
            >
              {copied ? (
                <CheckCircle2 size={15} className="text-emerald-600" />
              ) : (
                <Copy size={15} />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isInwarding || totalOrderCases <= 0}
              onClick={handleRecordInward}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#131921] hover:bg-gray-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
              title="Record replenishment as inward stock"
            >
              <Truck size={15} />
              <span>{isInwarding ? 'Recording...' : 'Inward Stock'}</span>
            </button>

            <button
              type="button"
              disabled={totalOrderCases <= 0}
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#25D366] hover:bg-[#20ba59] transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
              title="Send formatted Purchase Order on WhatsApp"
            >
              <Send size={15} />
              <span>WhatsApp PO ({totalOrderCases} Cs)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
