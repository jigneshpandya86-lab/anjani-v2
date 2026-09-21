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
  Building2,
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

  // State
  const [daysWindow, setDaysWindow] = useState(14)
  const [targetBufferDays, setTargetBufferDays] = useState(14)
  const [userOverrides, setUserOverrides] = useState({})
  const [supplierName, setSupplierName] = useState(() => {
    try {
      return localStorage.getItem('bailey_supplier_name') || 'Bailey Plant / Bottling Depot'
    } catch {
      return 'Bailey Plant / Bottling Depot'
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
  const [showConfig, setShowConfig] = useState(false)
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
      toast.success(`Successfully added ${totalOrderCases} Cases to warehouse stock!`)
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
    <div className="fixed inset-0 z-[1050] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Accessible Backdrop */}
      <button
        type="button"
        aria-label="Close modal overlay"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs cursor-default"
      />

      {/* Dialog Window */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bailey-modal-title"
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden my-auto border border-gray-100 flex flex-col max-h-[92vh] z-10"
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#0b332b] via-[#064e3b] to-[#047857] text-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-white/15 border border-white/20 shadow-inner">
                <Droplets size={22} className="text-cyan-300 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-cyan-400 text-cyan-950 px-2 py-0.5 rounded-full">
                    Parle Agro
                  </span>
                  <span className="text-[10px] font-bold text-cyan-200">
                    PO #{poNumber.slice(-8)}
                  </span>
                </div>
                <h2 id="bailey-modal-title" className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                  Bailey Water Replenishment Order
                </h2>
                <p className="text-[11px] text-emerald-100/90 font-medium">
                  Smart replenishment calculated from real consumption velocity & live warehouse stock
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Aggregate Stats Banner */}
          <div className="mt-4 grid grid-cols-3 gap-2 pt-3 border-t border-emerald-500/30">
            <div className="bg-white/10 rounded-xl p-2 text-center backdrop-blur-xs">
              <p className="text-[9px] font-extrabold uppercase text-emerald-200">Current Stock</p>
              <p className="text-sm sm:text-base font-black text-white mt-0.5">
                {totalCurrentStock}{' '}
                <span className="text-[9px] font-normal text-emerald-200">Cs</span>
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-2 text-center backdrop-blur-xs">
              <p className="text-[9px] font-extrabold uppercase text-emerald-200">Avg Run-Rate</p>
              <p className="text-sm sm:text-base font-black text-white mt-0.5">
                {totalDailyRunRate}{' '}
                <span className="text-[9px] font-normal text-emerald-200">Cs/day</span>
              </p>
            </div>
            <div className="bg-emerald-400/20 border border-emerald-300/40 rounded-xl p-2 text-center backdrop-blur-xs">
              <p className="text-[9px] font-extrabold uppercase text-emerald-100">Recommended PO</p>
              <p className="text-sm sm:text-base font-black text-emerald-300 mt-0.5">
                {totalOrderCases}{' '}
                <span className="text-[9px] font-normal text-emerald-200">Cs</span>
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Controls Bar: History Window & Target Buffer Days */}
          <div className="bg-gray-50 border border-gray-200/80 rounded-2xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-700">Consumption Window:</span>
              </div>
              <div className="flex items-center gap-1 bg-white border border-gray-200 p-0.5 rounded-xl shadow-2xs">
                {[7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-label={`Consumption window ${days} days`}
                    onClick={() => setDaysWindow(days)}
                    className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      daysWindow === days
                        ? 'bg-[#064e3b] text-white shadow-2xs'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-700" />
                <span className="text-xs font-bold text-gray-700">Target Safety Buffer:</span>
              </div>
              <div className="flex items-center gap-1 bg-white border border-gray-200 p-0.5 rounded-xl shadow-2xs">
                {[7, 10, 14, 21].map((days) => (
                  <button
                    key={days}
                    type="button"
                    aria-label={`Safety buffer ${days} days`}
                    onClick={() => setTargetBufferDays(days)}
                    className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      targetBufferDays === days
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Alert Callouts */}
          {criticalItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
              <AlertTriangle size={15} className="shrink-0 text-red-600" />
              <span>
                <strong>Stockout Alert:</strong> {criticalItems.map((c) => c.label).join(', ')}{' '}
                {criticalItems.length === 1 ? 'is' : 'are'} critically low on stock!
              </span>
            </div>
          )}

          {criticalItems.length === 0 && lowItems.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <TrendingDown size={15} className="shrink-0 text-amber-600" />
              <span>
                <strong>Reorder Notice:</strong> {lowItems.map((c) => c.label).join(', ')}{' '}
                inventory runway is under 7 days.
              </span>
            </div>
          )}

          {/* SKU Replenishment List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <PackageCheck size={14} className="text-emerald-700" />
                Bailey SKU Replenishment Plan
              </h3>
              <span className="text-[10px] text-gray-500 font-medium">
                Adjust order quantities as needed
              </span>
            </div>

            <div className="space-y-2.5">
              {replenishmentPlan.map((item) => {
                const isOverridden = item.hasOverride

                return (
                  <div
                    key={item.sku.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      item.status.level === 'danger'
                        ? 'border-red-200 bg-red-50/30'
                        : item.status.level === 'warning'
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-gray-200 bg-white shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-black text-gray-900">
                          {item.label}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium">
                          ({item.size})
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${item.status.badgeClass}`}
                      >
                        {item.status.label}
                      </span>
                    </div>

                    {/* Stats Metrics Line */}
                    <div className="grid grid-cols-4 gap-1.5 my-2.5 p-2 bg-gray-50 rounded-xl text-center border border-gray-100">
                      <div>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">On Hand</p>
                        <p className="text-xs font-black text-gray-800 mt-0.5">{item.currentStock}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">Run-Rate</p>
                        <p className="text-xs font-black text-gray-800 mt-0.5">{item.dailyRunRate}/d</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">Runway</p>
                        <p className="text-xs font-black text-gray-800 mt-0.5">
                          {item.dailyRunRate > 0 ? `${item.runwayDays}d` : '∞'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-emerald-700 uppercase">Buffer Goal</p>
                        <p className="text-xs font-black text-emerald-800 mt-0.5">
                          {item.targetRequiredStock}
                        </p>
                      </div>
                    </div>

                    {/* Order Quantity Stepper Control */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-700">Order Quantity:</span>
                        {isOverridden && (
                          <button
                            type="button"
                            onClick={() => handleResetOverride(item.label)}
                            className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-emerald-700 transition-colors cursor-pointer"
                            title="Reset to recommended quantity"
                          >
                            <RotateCcw size={10} />
                            <span>Auto ({item.recommendedQty})</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQtyDelta(item.label, item.finalOrderQty, -10)}
                          className="px-1.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors cursor-pointer"
                          title="-10 cases"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQtyDelta(item.label, item.finalOrderQty, -1)}
                          className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors cursor-pointer"
                          aria-label="Decrease quantity by 1"
                        >
                          <Minus size={12} />
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
                          className={`w-16 text-center text-sm font-black py-1 px-1 rounded-lg border focus:ring-2 focus:outline-hidden ${
                            item.finalOrderQty > 0
                              ? 'border-emerald-500 bg-emerald-50/40 text-emerald-950 focus:ring-emerald-400'
                              : 'border-gray-200 text-gray-500 focus:ring-gray-400'
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 1)}
                          className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors cursor-pointer"
                          aria-label="Increase quantity by 1"
                        >
                          <Plus size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 10)}
                          className="px-1.5 py-1 text-[10px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors cursor-pointer"
                          title="+10 cases"
                        >
                          +10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQtyDelta(item.label, item.finalOrderQty, 50)}
                          className="px-1.5 py-1 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-md transition-colors cursor-pointer"
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

          {/* Supplier / Consignment Configuration Accordion */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setShowConfig((prev) => !prev)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-800">
                  Supplier & Delivery Settings
                </span>
              </div>
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase">
                {showConfig ? 'Hide' : 'Edit Details'}
              </span>
            </button>

            {showConfig && (
              <div className="p-3.5 pt-0 border-t border-gray-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="supplier-name"
                      className="block text-[11px] font-bold text-gray-600 mb-1"
                    >
                      Supplier / Depot Name:
                    </label>
                    <input
                      id="supplier-name"
                      type="text"
                      value={supplierName}
                      onChange={(e) => {
                        setSupplierName(e.target.value)
                        handleSaveSupplier(e.target.value, supplierPhone)
                      }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      placeholder="e.g. Parle Agro Bailey Bottling Plant"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="supplier-phone"
                      className="block text-[11px] font-bold text-gray-600 mb-1"
                    >
                      Supplier WhatsApp Mobile:
                    </label>
                    <input
                      id="supplier-phone"
                      type="tel"
                      value={supplierPhone}
                      onChange={(e) => {
                        setSupplierPhone(e.target.value)
                        handleSaveSupplier(supplierName, e.target.value)
                      }}
                      className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      placeholder="e.g. 98251XXXXX (Direct WhatsApp)"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="order-notes"
                    className="block text-[11px] font-bold text-gray-600 mb-1"
                  >
                    Order / Delivery Notes:
                  </label>
                  <input
                    id="order-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="e.g. Dispatch morning 9 AM truck; send recent batch manufacturing"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-3.5 sm:p-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePrintPo}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all shadow-2xs cursor-pointer"
              title="Print / Save PDF Purchase Order"
            >
              <Printer size={14} />
              <span>Print PO</span>
            </button>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-100 transition-all shadow-2xs cursor-pointer"
              title="Copy WhatsApp Message"
            >
              {copied ? (
                <CheckCircle2 size={14} className="text-emerald-600" />
              ) : (
                <Copy size={14} />
              )}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isInwarding || totalOrderCases <= 0}
              onClick={handleRecordInward}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-all shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Record replenishment consignment as inward stock"
            >
              <Truck size={14} className="text-emerald-800" />
              <span>{isInwarding ? 'Recording...' : 'Record Inward'}</span>
            </button>

            <button
              type="button"
              disabled={totalOrderCases <= 0}
              onClick={handleSendWhatsApp}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-gradient-to-r from-emerald-600 to-[#047857] hover:from-emerald-700 hover:to-[#065f46] transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Send formatted Purchase Order to Bailey Supplier on WhatsApp"
            >
              <Send size={14} />
              <span>Send PO ({totalOrderCases} Cs)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
