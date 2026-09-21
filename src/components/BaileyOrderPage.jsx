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
  Settings2,
  X,
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
  const [showSettingsModal, setShowSettingsModal] = useState(false)
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
      toast.success(`Added ${totalOrderCases} Cases to warehouse stock!`)
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
    <div className="space-y-2.5 pb-24 animate-in fade-in duration-150 max-w-5xl mx-auto">
      {/* ─── Compact Top Banner ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3 sm:p-4 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10" />

        {/* Row 1: Title, Back & Settings */}
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
                title="Back"
                aria-label="Back"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <Droplets size={16} className="text-[#ff9900]" />
              <h1 className="text-sm sm:text-base font-black tracking-tight">
                Bailey Replenishment Engine
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-wider bg-white/15 px-2 py-0.5 rounded-md text-white/80">
              {poNumber.slice(-8)}
            </span>
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
              title="Supplier & Consignment Settings"
              aria-label="Supplier settings"
            >
              <Settings2 size={14} />
            </button>
          </div>
        </div>

        {/* Row 2: Micro KPIs & Selectors */}
        <div className="relative mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/15">
          {/* 3 Metrics */}
          <div className="flex items-center gap-3 text-xs">
            <div>
              <span className="text-[9px] font-bold uppercase text-white/60 block leading-none">Stock</span>
              <span className="font-black text-white text-sm sm:text-base">{totalCurrentStock}</span>
              <span className="text-[9px] text-white/60 ml-0.5">Cs</span>
            </div>
            <div className="h-6 w-px bg-white/15" />
            <div>
              <span className="text-[9px] font-bold uppercase text-white/60 block leading-none">Run/Day</span>
              <span className="font-black text-white text-sm sm:text-base">{totalDailyRunRate}</span>
              <span className="text-[9px] text-white/60 ml-0.5">Cs</span>
            </div>
            <div className="h-6 w-px bg-white/15" />
            <div>
              <span className="text-[9px] font-bold uppercase text-[#ff9900] block leading-none">PO Reorder</span>
              <span className="font-black text-[#ff9900] text-sm sm:text-base">{totalOrderCases}</span>
              <span className="text-[9px] text-orange-200 ml-0.5">Cs</span>
            </div>
          </div>

          {/* Micro Toggle Controls */}
          <div className="flex items-center gap-2">
            {/* History Window */}
            <div className="flex items-center bg-white/10 p-0.5 rounded-lg text-[10px] font-bold">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-label={`Consumption window ${days} days`}
                  onClick={() => setDaysWindow(days)}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    daysWindow === days ? 'bg-white text-[#131921] font-black' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>

            {/* Target Buffer */}
            <div className="flex items-center bg-white/10 p-0.5 rounded-lg text-[10px] font-bold">
              {[7, 10, 14, 21].map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-label={`Safety buffer ${days} days`}
                  onClick={() => setTargetBufferDays(days)}
                  className={`px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    targetBufferDays === days ? 'bg-[#ff9900] text-white font-black' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {days}b
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Compact Alert Notice (Single Line if any) ─── */}
      {criticalItems.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold shadow-2xs">
          <AlertTriangle size={13} className="text-rose-600 shrink-0" />
          <span className="truncate">
            Critical Stock: {criticalItems.map((c) => c.label).join(', ')}
          </span>
        </div>
      )}

      {criticalItems.length === 0 && lowItems.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-2xs">
          <TrendingDown size={13} className="text-amber-600 shrink-0" />
          <span className="truncate">
            Low Stock (&lt;7d): {lowItems.map((c) => c.label).join(', ')}
          </span>
        </div>
      )}

      {/* ─── 4 Small Modern Cards (Fits on 1 Screen) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {replenishmentPlan.map((item) => {
          const isOverridden = item.hasOverride

          return (
            <div
              key={item.sku.id}
              className={`bg-white border rounded-2xl p-2.5 sm:p-3 shadow-2xs transition-all flex flex-col justify-between ${
                item.status.level === 'danger'
                  ? 'border-rose-300 ring-1 ring-rose-200'
                  : item.status.level === 'warning'
                    ? 'border-amber-300 ring-1 ring-amber-100'
                    : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {/* Card Header: Product & Badge */}
              <div className="flex items-start justify-between gap-1">
                <div>
                  <p className="font-black text-xs text-gray-900 leading-tight truncate">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold">
                    {item.size}
                  </p>
                </div>

                <span
                  className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                    item.status.level === 'danger'
                      ? 'bg-rose-100 text-rose-800'
                      : item.status.level === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {item.dailyRunRate > 0 ? `${item.runwayDays}d` : 'OK'}
                </span>
              </div>

              {/* Center: Stepper Controller */}
              <div className="my-2 flex items-center justify-center gap-1">
                <button
                  type="button"
                  onClick={() => handleQtyDelta(item.label, item.finalOrderQty, -1)}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={`Decrease ${item.label} by 1`}
                >
                  <Minus size={13} />
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
                  className={`w-14 text-center text-sm font-black py-1 rounded-lg border focus:ring-1 focus:ring-[#ff9900] focus:outline-hidden ${
                    item.finalOrderQty > 0
                      ? 'border-orange-400 bg-orange-50/60 text-gray-950 font-black'
                      : 'border-gray-200 text-gray-400'
                  }`}
                />

                <button
                  type="button"
                  onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 1)}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label={`Increase ${item.label} by 1`}
                >
                  <Plus size={13} />
                </button>

                <button
                  type="button"
                  onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 10)}
                  className="px-1.5 py-1 text-[10px] font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors cursor-pointer"
                  title="+10 cases"
                >
                  +10
                </button>
              </div>

              {/* Card Footer: Micro Metrics Strip */}
              <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
                <span title="Current stock on hand">
                  📦 <strong>{item.currentStock}</strong>
                </span>
                <span title="Daily sales run-rate">
                  ⚡ <strong>{item.dailyRunRate}/d</strong>
                </span>
                <span title="Target buffer goal">
                  🎯 <strong>{item.targetRequiredStock}</strong>
                </span>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => handleResetOverride(item.label)}
                    className="text-[#ff9900] hover:text-orange-600 p-0.5"
                    title={`Reset to recommended (${item.recommendedQty})`}
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Supplier Settings Drawer / Dialog Modal ─── */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 z-[1050] flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl w-full max-w-sm p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="text-xs font-black uppercase text-gray-900">Supplier &amp; PO Settings</h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label htmlFor="supplier-name" className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                  Supplier / Bottling Depot
                </label>
                <input
                  id="supplier-name"
                  type="text"
                  value={supplierName}
                  onChange={(e) => {
                    setSupplierName(e.target.value)
                    handleSaveSupplier(e.target.value, supplierPhone)
                  }}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-bold outline-none focus:border-[#ff9900]"
                  placeholder="Bailey Bottling Plant"
                />
              </div>

              <div>
                <label htmlFor="supplier-phone" className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
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
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-bold outline-none focus:border-[#ff9900]"
                  placeholder="98251XXXXX"
                />
              </div>

              <div>
                <label htmlFor="order-notes" className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                  Delivery Notes / Remarks
                </label>
                <input
                  id="order-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-bold outline-none focus:border-[#ff9900]"
                  placeholder="e.g. Morning truck delivery"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className="w-full py-2 bg-[#131921] text-white rounded-xl text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ─── Modern Sticky Bottom Action Bar ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-3 py-2 sm:py-2.5 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          {/* Total Cases */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Total:</span>
            <span className="text-base sm:text-lg font-black text-gray-900 leading-none">
              {totalOrderCases}{' '}
              <span className="text-[10px] font-bold text-[#ff9900]">Cs</span>
            </span>
          </div>

          {/* Action Buttons (Icons & Modern CTAs) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrintPo}
              className="p-2 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer shadow-2xs"
              title="Print PO"
              aria-label="Print PO"
            >
              <Printer size={15} />
            </button>

            <button
              type="button"
              onClick={handleCopyMessage}
              className="p-2 rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all cursor-pointer shadow-2xs"
              title="Copy WhatsApp PO"
              aria-label="Copy PO"
            >
              {copied ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Copy size={15} />}
            </button>

            <button
              type="button"
              disabled={isInwarding || totalOrderCases <= 0}
              onClick={handleRecordInward}
              className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#131921] hover:bg-gray-800 transition-all shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              title="Inward to Stock"
            >
              <Truck size={14} />
              <span className="hidden xs:inline sm:inline">Inward Stock</span>
            </button>

            <button
              type="button"
              disabled={totalOrderCases <= 0}
              onClick={handleSendWhatsApp}
              className="px-3.5 py-2 rounded-xl text-xs font-black text-white bg-[#25D366] hover:bg-[#20ba59] transition-all shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              title="Send PO on WhatsApp"
            >
              <Send size={14} />
              <span>Send PO ({totalOrderCases})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
