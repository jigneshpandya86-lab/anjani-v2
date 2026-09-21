import React, { useState, useMemo, useEffect } from 'react'
import {
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
  ArrowLeft,
  Building2,
  Phone,
  FileText,
  Clock,
  Sparkles,
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

export default function BaileyOrderPage({ onBack }) {
  const {
    orders = [],
    stockEntries = [],
    stockSummary = {},
    addStockBatch,
  } = useClientStore()

  // State
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
  const [showSupplierSettings, setShowSupplierSettings] = useState(false)
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

  // Aggregates
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

  // Quantity control
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
      toast.success(`Successfully added ${totalOrderCases} Cases to warehouse stock!`)
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
    <div className="space-y-4 pb-28 animate-in fade-in duration-200">
      {/* ─── Breadcrumb & Top Bar ─── */}
      <div className="flex items-center justify-between gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-2xs"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] font-black uppercase tracking-wider bg-orange-100 text-[#ff9900] px-2.5 py-1 rounded-full border border-orange-200">
            PO #{poNumber.slice(-8)}
          </span>
        </div>
      </div>

      {/* ─── Signature Top Hero Banner (Deep Navy Gradient) ─── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-4 sm:p-6 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-[#ff9900] shadow-inner backdrop-blur-sm">
              <Droplets size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-widest text-[#ff9900] uppercase">
                  Parle Agro
                </span>
                <span className="text-[10px] font-bold text-white/60">•</span>
                <span className="text-[10px] font-bold text-white/70">Annapurna Foods</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                Bailey Replenishment Engine
              </h1>
              <p className="text-xs text-white/70 font-medium">
                Autonomous purchase order planner based on real customer demand velocity
              </p>
            </div>
          </div>

          {/* Quick Actions in Banner */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handlePrintPo}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-2xs cursor-pointer"
              title="Print Purchase Order"
            >
              <Printer size={16} />
            </button>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all shadow-2xs cursor-pointer"
              title="Copy WhatsApp PO"
            >
              {copied ? <CheckCircle2 size={16} className="text-emerald-300" /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Hero KPIs Bar */}
        <div className="relative mt-5 grid grid-cols-3 gap-2.5 pt-4 border-t border-white/15">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">
              Total Stock
            </p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-0.5">
              {totalCurrentStock}{' '}
              <span className="text-[10px] font-bold text-white/60 uppercase">Cases</span>
            </p>
            <p className="text-[10px] text-white/60 mt-0.5">Across all 4 Bailey SKUs</p>
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">
              Run-Rate / Day
            </p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-0.5">
              {totalDailyRunRate}{' '}
              <span className="text-[10px] font-bold text-white/60 uppercase">Cs/day</span>
            </p>
            <p className="text-[10px] text-white/60 mt-0.5">Past {daysWindow}-day average</p>
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#ff9900]">
              Recommended PO
            </p>
            <p className="text-2xl sm:text-3xl font-black text-[#ff9900] mt-0.5">
              {totalOrderCases}{' '}
              <span className="text-[10px] font-bold text-orange-200 uppercase">Cases</span>
            </p>
            <p className="text-[10px] text-white/60 mt-0.5">Target {targetBufferDays}d stock buffer</p>
          </div>
        </div>
      </div>

      {/* ─── Controls Card: Window & Buffer Target ─── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Consumption Window Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <Calendar size={14} className="text-[#ff9900]" />
            <span>Consumption Velocity Window:</span>
          </div>
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/80">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                aria-label={`Consumption window ${days} days`}
                onClick={() => setDaysWindow(days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  daysWindow === days
                    ? 'bg-[#131921] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Last {days} Days
              </button>
            ))}
          </div>
        </div>

        {/* Safety Buffer Target Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>Safety Stock Buffer Target:</span>
          </div>
          <div className="inline-flex rounded-xl bg-gray-100 p-1 border border-gray-200/80">
            {[7, 10, 14, 21].map((days) => (
              <button
                key={days}
                type="button"
                aria-label={`Safety buffer ${days} days`}
                onClick={() => setTargetBufferDays(days)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  targetBufferDays === days
                    ? 'bg-[#ff9900] text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {days}d Buffer
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Shortage Notices ─── */}
      {criticalItems.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold shadow-2xs">
          <div className="p-2 rounded-xl bg-rose-100 text-rose-600 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="font-black text-rose-800 text-sm">Critical Stock Shortage Alert</p>
            <p className="text-rose-700 mt-0.5">
              {criticalItems.map((c) => c.label).join(', ')} {criticalItems.length === 1 ? 'is' : 'are'} critically low or depleted. Place replenishment order immediately to avoid stockout.
            </p>
          </div>
        </div>
      )}

      {criticalItems.length === 0 && lowItems.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-600 shrink-0">
            <TrendingDown size={18} />
          </div>
          <div>
            <p className="font-black text-amber-800 text-sm">Reorder Advisory Notice</p>
            <p className="text-amber-700 mt-0.5">
              {lowItems.map((c) => c.label).join(', ')} runway is below 7 days. Plan your replenishment truck consignment.
            </p>
          </div>
        </div>
      )}

      {/* ─── Individual SKU Replenishment Cards ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
            <PackageCheck size={15} className="text-[#ff9900]" />
            Bailey SKUs Breakdown & Quantities
          </h2>
          <span className="text-[11px] text-gray-500 font-bold">
            Based on {daysWindow}d run-rate & {targetBufferDays}d buffer
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {replenishmentPlan.map((item) => {
            const isOverridden = item.hasOverride
            const runwayPercent = Math.min(
              100,
              item.targetRequiredStock > 0
                ? Math.round((item.currentStock / item.targetRequiredStock) * 100)
                : 100,
            )

            return (
              <div
                key={item.sku.id}
                className="bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-4 sm:p-5 shadow-xs transition-all space-y-3"
              >
                {/* Header of SKU */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-gray-900">
                        {item.label}
                      </span>
                      <span className="text-xs font-bold text-gray-500">
                        ({item.size})
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                      Pack: {item.unit || 'Case / Box'}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
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

                {/* Stock Runway Visual Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-gray-500">Inventory Runway</span>
                    <span
                      className={
                        item.runwayDays < 3 && item.dailyRunRate > 0
                          ? 'text-rose-600 font-black'
                          : item.runwayDays < 7 && item.dailyRunRate > 0
                            ? 'text-amber-600 font-black'
                            : 'text-emerald-700 font-black'
                      }
                    >
                      {item.dailyRunRate > 0 ? `${item.runwayDays} Days remaining` : 'Stock stable'}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.status.level === 'danger'
                          ? 'bg-rose-500'
                          : item.status.level === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.max(4, runwayPercent)}%` }}
                    />
                  </div>
                </div>

                {/* 4-Pillar Metrics Strip */}
                <div className="grid grid-cols-4 gap-1 p-2.5 bg-gray-50 rounded-xl text-center border border-gray-100 text-xs">
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase">On Hand</p>
                    <p className="text-xs sm:text-sm font-black text-gray-900 mt-0.5">
                      {item.currentStock}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase">Run-Rate</p>
                    <p className="text-xs sm:text-sm font-black text-gray-900 mt-0.5">
                      {item.dailyRunRate}/d
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-gray-500 uppercase">Buffer Goal</p>
                    <p className="text-xs sm:text-sm font-black text-emerald-800 mt-0.5">
                      {item.targetRequiredStock}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-[#ff9900] uppercase">Suggested</p>
                    <p className="text-xs sm:text-sm font-black text-[#ff9900] mt-0.5">
                      {item.recommendedQty}
                    </p>
                  </div>
                </div>

                {/* Stepper Order Row */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-700">Order Cases:</span>
                    {isOverridden && (
                      <button
                        type="button"
                        onClick={() => handleResetOverride(item.label)}
                        className="text-[11px] text-[#ff9900] hover:text-orange-600 font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                        title="Reset to recommended quantity"
                      >
                        <RotateCcw size={10} />
                        <span>Auto</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQtyDelta(item.label, item.finalOrderQty, -10)}
                      className="px-2 py-1.5 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                      title="-10 cases"
                    >
                      -10
                    </button>
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
                      className={`w-16 text-center text-base font-black py-1 px-1 rounded-xl border focus:ring-2 focus:ring-[#ff9900] focus:outline-hidden ${
                        item.finalOrderQty > 0
                          ? 'border-orange-300 bg-orange-50/50 text-gray-900'
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
                      className="px-2 py-1.5 text-xs font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                      title="+10 cases"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 50)}
                      className="px-2 py-1.5 text-xs font-bold rounded-lg bg-orange-100 hover:bg-orange-200 text-[#ff9900] transition-colors cursor-pointer"
                      title="+50 cases"
                    >
                      +50
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Supplier & Delivery Details Accordion ─── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowSupplierSettings((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600">
              <Building2 size={16} />
            </div>
            <div>
              <p className="text-xs font-black text-gray-900">
                Supplier & Delivery Consignment Settings
              </p>
              <p className="text-[11px] text-gray-500 font-medium">
                {supplierName} • {supplierPhone ? `WhatsApp: ${supplierPhone}` : 'No phone specified'}
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#ff9900] flex items-center gap-1">
            {showSupplierSettings ? 'Close' : 'Edit'}
            {showSupplierSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {showSupplierSettings && (
          <div className="p-4 pt-0 border-t border-gray-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="supplier-name"
                  className="block text-xs font-bold text-gray-600 uppercase mb-1"
                >
                  Supplier / Bottling Depot:
                </label>
                <input
                  id="supplier-name"
                  type="text"
                  value={supplierName}
                  onChange={(e) => {
                    setSupplierName(e.target.value)
                    handleSaveSupplier(e.target.value, supplierPhone)
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
                  placeholder="e.g. Parle Agro Bailey Bottling Depot"
                />
              </div>

              <div>
                <label
                  htmlFor="supplier-phone"
                  className="block text-xs font-bold text-gray-600 uppercase mb-1"
                >
                  Supplier WhatsApp Number:
                </label>
                <input
                  id="supplier-phone"
                  type="tel"
                  value={supplierPhone}
                  onChange={(e) => {
                    setSupplierPhone(e.target.value)
                    handleSaveSupplier(supplierName, e.target.value)
                  }}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
                  placeholder="e.g. 98251XXXXX (Direct WhatsApp)"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="order-notes"
                className="block text-xs font-bold text-gray-600 uppercase mb-1"
              >
                Special Delivery Notes / Instructions:
              </label>
              <input
                id="order-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
                placeholder="e.g. Morning 9 AM dispatch truck; confirm manufacturing batch date"
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── Sticky / Floating Bottom Action Tray ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 p-3 sm:p-4 shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Total Cases Summary */}
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-xs font-bold text-gray-500 uppercase">
              Total Order Consignment:
            </span>
            <span className="text-xl sm:text-2xl font-black text-gray-900">
              {totalOrderCases}{' '}
              <span className="text-xs font-bold text-[#ff9900] uppercase">Cases</span>
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handlePrintPo}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              title="Print PO"
            >
              <Printer size={15} />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              title="Copy WhatsApp PO Message"
            >
              {copied ? (
                <CheckCircle2 size={15} className="text-emerald-600" />
              ) : (
                <Copy size={15} />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              type="button"
              disabled={isInwarding || totalOrderCases <= 0}
              onClick={handleRecordInward}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#131921] hover:bg-gray-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
              title="Inward consignment to warehouse stock"
            >
              <Truck size={15} />
              <span>{isInwarding ? 'Recording...' : 'Inward Stock'}</span>
            </button>

            <button
              type="button"
              disabled={totalOrderCases <= 0}
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-black text-white bg-[#25D366] hover:bg-[#20ba59] transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              title="Send PO on WhatsApp"
            >
              <Send size={15} />
              <span>Send PO ({totalOrderCases} Cs)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
