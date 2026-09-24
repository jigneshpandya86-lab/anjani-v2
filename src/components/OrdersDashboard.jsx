import { memo, useRef, useState, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import {
  Clock,
  Copy,
  Edit2,
  Trash2,
  Smartphone,
  Search,
  HandCoins,
  FileText,
  Paperclip,
  Loader2,
  CalendarRange,
  Sun,
  CalendarDays,
  Phone,
  MapPin,
  Navigation,
  Droplets,
  Calendar,
  History,
  ArrowDownCircle,
  CheckCircle2,
  ChevronDown,
  X,
} from 'lucide-react'
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage'
import { app } from '../firebase-config'
import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'

function OrdersDashboard({ onEdit, onCopy, onRecordPayment, onShareInvoice, onOpenBaileyOrder }) {
  const orders = useClientStore((state) => state.orders)
  const hasMoreOrders = useClientStore((state) => state.hasMoreOrders)
  const loadingOlderOrders = useClientStore((state) => state.loadingOlderOrders)
  const loadOlderOrders = useClientStore((state) => state.loadOlderOrders)
  const loadAllPastOrders = useClientStore((state) => state.loadAllPastOrders)
  const clients = useClientStore((state) => state.clients)
  const updateOrder = useClientStore((state) => state.updateOrder)
  const deleteOrder = useClientStore((state) => state.deleteOrder)
  const userRole = useClientStore((state) => state.userRole)
  const [filter, setFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('All')
  const [skuFilter, setSkuFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [showPeriodPicker, setShowPeriodPicker] = useState(false)
  const [uploadingProofOrderId, setUploadingProofOrderId] = useState('')
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState('')
  const proofInputRefs = useRef({})
  const storage = getStorage(app)

  const handleLoadOlder = useCallback(async () => {
    try {
      await loadOlderOrders(50)
      toast.success('Loaded 50 older orders')
    } catch {
      toast.error('Failed to load older orders')
    }
  }, [loadOlderOrders])

  const handleLoadAllHistory = useCallback(async () => {
    try {
      await loadAllPastOrders()
      toast.success('All historical orders loaded')
    } catch {
      toast.error('Failed to load history')
    }
  }, [loadAllPastOrders])

  const getOrderDate = useCallback((order) => {
    const rawDate = order?.date || order?.orderDate || order?.deliveryDate
    if (rawDate) {
      const parsedDate = new Date(rawDate)
      if (!Number.isNaN(parsedDate.getTime())) {
        return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate())
      }
    }
    if (order?.createdAt) {
      const ts = order.createdAt
      if (ts?.toDate) {
        const d = ts.toDate()
        return new Date(d.getFullYear(), d.getMonth(), d.getDate())
      }
      if (ts?.seconds) {
        const d = new Date(ts.seconds * 1000)
        return new Date(d.getFullYear(), d.getMonth(), d.getDate())
      }
      if (typeof ts === 'string') {
        const d = new Date(ts)
        if (!Number.isNaN(d.getTime())) {
          return new Date(d.getFullYear(), d.getMonth(), d.getDate())
        }
      }
    }
    return null
  }, [])

  const getDisplayName = useCallback(
    (order) => {
      if (order.clientId) {
        const c = clients.find((c) => c.id === order.clientId)
        if (c) return c.name
      }
      return (
        order.clientName || order.customerName || order.customer || order.name || 'Legacy Client'
      )
    },
    [clients],
  )

  const getDisplayMobile = useCallback(
    (order) => {
      // 1. Strictly prioritize order-level mobile first
      const orderMobile = String(order.mobile || order.phone || '').trim()
      if (orderMobile) return orderMobile

      // 2. Fall back to client master
      if (order.clientId) {
        const c = clients.find((c) => c.id === order.clientId)
        if (c?.mobile) return c.mobile
      }
      return ''
    },
    [clients],
  )

  const getDisplayAddress = useCallback(
    (order) => {
      // 1. Strictly prioritize order-specific address and location fields first
      const orderAddr = String(
        order.address ||
        order.deliveryAddress ||
        order.location ||
        order.locationName ||
        order.googleLocation ||
        order.area ||
        ''
      ).trim()
      if (orderAddr) return orderAddr

      // 2. Fall back to client master ONLY if the order itself has no address or location
      if (order.clientId) {
        const c = clients.find((client) => client.id === order.clientId)
        const clientAddr = String(
          c?.address ||
          c?.deliveryAddress ||
          c?.location ||
          c?.locationName ||
          c?.googleLocation ||
          ''
        ).trim()
        if (clientAddr) return clientAddr
      }

      return ''
    },
    [clients],
  )

  const getMapsUrl = useCallback(
    (order) => {
      // 1. Direct order map link if present
      const directMapLink = String(order.mapLink || order.googleMap || '').trim()
      if (directMapLink && (directMapLink.startsWith('http://') || directMapLink.startsWith('https://'))) {
        return directMapLink
      }
      // 2. Direct order coordinates
      if (Number.isFinite(Number(order.locationLat)) && Number.isFinite(Number(order.locationLng))) {
        return `https://www.google.com/maps/search/?api=1&query=${order.locationLat},${order.locationLng}`
      }
      // 3. Direct order address/location string
      const directAddr = String(
        order.address || order.deliveryAddress || order.location || order.locationName || ''
      ).trim()
      if (directAddr) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directAddr)}`
      }
      // 4. Fall back to client master location
      if (order.clientId) {
        const c = clients.find((c) => c.id === order.clientId)
        if (c?.mapLink) return c.mapLink
        if (Number.isFinite(Number(c?.locationLat)) && Number.isFinite(Number(c?.locationLng))) {
          return `https://www.google.com/maps/search/?api=1&query=${c.locationLat},${c.locationLng}`
        }
      }
      const addr = getDisplayAddress(order)
      if (addr) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
      }
      return null
    },
    [clients, getDisplayAddress],
  )

  const statusPriority = useMemo(() => ({ Pending: 0, Confirmed: 1, Delivered: 2 }), [])

  const getOrderSortKey = useCallback(
    (order) => {
      const statusPrio = statusPriority[order.status] ?? 999
      const dateObj = getOrderDate(order)
      const dateTime = dateObj?.getTime() ?? Number.MAX_VALUE
      const timeStr = order.time || '23:59'
      const [hours, minutes] = timeStr.split(':').map(Number)
      const timeInMinutes = (hours || 0) * 60 + (minutes || 0)
      return [statusPrio, dateTime, timeInMinutes]
    },
    [statusPriority, getOrderDate],
  )

  const doesMatchDateFilter = useCallback(
    (order) => {
      if (dateFilter === 'All') return true
      const orderDate = getOrderDate(order)
      if (!orderDate) return false
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (dateFilter === 'Today') {
        return orderDate.getTime() === today.getTime()
      }
      if (dateFilter === 'Tomorrow') {
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return orderDate.getTime() === tomorrow.getTime()
      }
      if (dateFilter === 'ThisWeek') {
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 6)
        return orderDate >= today && orderDate <= weekEnd
      }
      if (dateFilter === 'ThisMonth') {
        return (
          orderDate.getFullYear() === now.getFullYear() &&
          orderDate.getMonth() === now.getMonth()
        )
      }
      if (dateFilter === 'LastMonth') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return (
          orderDate.getFullYear() === lastMonth.getFullYear() &&
          orderDate.getMonth() === lastMonth.getMonth()
        )
      }
      if (dateFilter === 'Last3Months') {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        return orderDate >= threeMonthsAgo && orderDate <= now
      }
      if (dateFilter === 'Month' && selectedMonth) {
        const [yearStr, monthStr] = selectedMonth.split('-')
        const y = parseInt(yearStr, 10)
        const m = parseInt(monthStr, 10) - 1
        return orderDate.getFullYear() === y && orderDate.getMonth() === m
      }
      return true
    },
    [dateFilter, getOrderDate, selectedMonth],
  )

  const filteredOrders = useMemo(
    () =>
      orders
        .filter((o) => {
          const name = getDisplayName(o)
          const mobile = getDisplayMobile(o)
          const matchesStatus = filter === 'All' || o.status === filter
          const matchesDate = doesMatchDateFilter(o)
          const orderItems = o.items || []
          const matchesSku =
            skuFilter === 'All' ||
            (o.sku || DEFAULT_SKU) === skuFilter ||
            orderItems.some((it) => (it.sku || DEFAULT_SKU) === skuFilter)
          const searchLower = searchQuery.toLowerCase()
          const qtyText = String(o.totalQty ?? o.qty ?? o.boxes ?? o.quantity ?? '')
          const skuText = String(o.sku || '').toLowerCase()
          const itemsText = orderItems.map((it) => `${it.sku} ${it.qty}`).join(' ').toLowerCase()
          const matchesSearch =
            name.toLowerCase().includes(searchLower) ||
            (o.orderId || '').toLowerCase().includes(searchLower) ||
            mobile.includes(searchLower) ||
            qtyText.includes(searchLower) ||
            skuText.includes(searchLower) ||
            itemsText.includes(searchLower)
          return matchesStatus && matchesDate && matchesSku && matchesSearch
        })
        .sort((a, b) => {
          const [aPrio, aDate, aTime] = getOrderSortKey(a)
          const [bPrio, bDate, bTime] = getOrderSortKey(b)

          // When showing All or Delivered, use "Recent to Past" (Descending)
          if (filter === 'All' || filter === 'Delivered') {
            const valA = aDate === Number.MAX_VALUE ? 0 : aDate
            const valB = bDate === Number.MAX_VALUE ? 0 : bDate
            if (valA !== valB) return valB - valA
            if (aTime !== bTime) return bTime - aTime
            return aPrio - bPrio
          }

          // For Pending/Confirmed, keep Status Priority + Ascending Date (Earliest First)
          if (aPrio !== bPrio) return aPrio - bPrio
          if (aDate !== bDate) return aDate - bDate
          return aTime - bTime
        }),
    [
      orders,
      filter,
      skuFilter,
      searchQuery,
      getDisplayName,
      getDisplayMobile,
      doesMatchDateFilter,
      getOrderSortKey,
    ],
  )

  const shareOrder = useCallback(
    (order) => {
      const address = getDisplayAddress(order)
      const mapsUrl = getMapsUrl(order)
      const directOrderLocation = String(
        order.location || order.deliveryAddress || order.address || order.area || order.locationName || '',
      ).trim()
      const clientObj = order.clientId ? clients.find((c) => c.id === order.clientId) : null
      const location = directOrderLocation || String(clientObj?.location || '').trim()

      const items =
        order.items && order.items.length > 0
          ? order.items
          : [
              {
                sku: order.sku || DEFAULT_SKU,
                qty: order.qty || 0,
                rate: order.rate || 0,
              },
            ]

      let itemsListText = ''
      items.forEach((it) => {
        const itMeta = getSkuMeta(it.sku)
        itemsListText += `• ${it.qty} ${itMeta.unit} — *${it.sku}*\n`
      })

      const totalQty =
        order.totalQty || items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
      const totalAmount =
        order.totalAmount !== undefined
          ? order.totalAmount
          : items.reduce(
              (s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0),
              0,
            )

      let addressSection = `*Address:*\n${address || 'Address not available'}`
      if (location && location !== address) {
        addressSection += `\n*Location / Area:* ${location}`
      }
      if (mapsUrl) {
        addressSection += `\n*Map Link:* ${mapsUrl}`
      }

      const msg = `🚚 *NEW DELIVERY ASSIGNMENT*\n\n*ID:* ${order.orderId || 'N/A'}\n*Client:* ${getDisplayName(order)}\n*Mobile:* ${getDisplayMobile(order)}\n*Date:* ${order.date || 'TBD'} at ${order.time || 'TBD'}\n\n*Items to Deliver:*\n${itemsListText}*Total Qty:* ${totalQty} Boxes/Cases\n*Total Value:* ₹${totalAmount.toLocaleString('en-IN')}\n\n${addressSection}`
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
    },
    [getDisplayName, getDisplayMobile, getDisplayAddress, getMapsUrl, clients],
  )

  const shareDispatchPlan = useCallback(() => {
    const pending = orders.filter((o) => o.status !== 'Delivered')
    let msg = `📋 *UPCOMING DISPATCH PLAN*\n\n`
    pending.forEach((o, i) => {
      const addr = getDisplayAddress(o)
      const addrStr = addr ? ` | ${addr}` : ''
      const items =
        o.items && o.items.length > 0
          ? o.items
          : [{ sku: o.sku || '200ml', qty: o.qty }]
      const itemsSummary = items.map((it) => `${it.qty}× ${it.sku}`).join(', ')
      msg += `${i + 1}. ${getDisplayName(o)} - ${itemsSummary} - ${o.date} ${o.time}${addrStr}\n`
    })
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }, [orders, getDisplayName, getDisplayAddress])

  const callClient = useCallback(
    (order) => {
      const mobile = getDisplayMobile(order)
      const cleanMobile = String(mobile || '').replace(/\D/g, '')
      if (!cleanMobile) {
        toast.error('Client mobile number not found')
        return
      }
      window.open(`tel:${cleanMobile}`, '_self')
    },
    [getDisplayMobile],
  )

  const handleDelete = useCallback(
    async (order) => {
      const label = order.orderId || order.id
      const isDelivered = order.status === 'Delivered'
      const msg = isDelivered
        ? `Delete delivered order ${label}? Stock and payment will be reversed.`
        : `Delete order ${label}? This cannot be undone.`
      if (!window.confirm(msg)) return
      try {
        await deleteOrder(order.id)
        toast.success('Order deleted')
      } catch {
        toast.error('Failed to delete order')
      }
    },
    [deleteOrder],
  )

  const getStatusColor = (status) => {
    if (status === 'Pending') return 'bg-yellow-100 text-yellow-700'
    if (status === 'Confirmed') return 'bg-blue-100 text-blue-700'
    if (status === 'Delivered') return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-700'
  }

  const attachDeliveryProof = (orderId) => {
    proofInputRefs.current[orderId]?.click()
  }

  const uploadDeliveryProof = async (order, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('Internet connection required to upload photo proof')
      event.target.value = ''
      return
    }

    setUploadingProofOrderId(order.id)
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const proofPath = `delivery-proofs/${order.id}/${Date.now()}-${sanitizedName}`
      const proofRef = ref(storage, proofPath)

      await uploadBytes(proofRef, file)
      const proofUrl = await getDownloadURL(proofRef)
      await updateOrder(order.id, {
        proofUrl,
        proofFileName: file.name,
        proofUploadedAt: new Date().toISOString(),
      })
      toast.success('Delivery proof attached')
    } catch (error) {
      console.error('Proof upload failed', error)
      toast.error('Failed to upload delivery proof')
    } finally {
      setUploadingProofOrderId('')
      event.target.value = ''
    }
  }

  const handleStatusUpdate = async (order, status) => {
    if (!order?.id || !status) return
    setStatusUpdatingOrderId(order.id)
    try {
      await updateOrder(order.id, { status })
      toast.success(`Order marked ${status}`)
    } catch (error) {
      console.error('Order status update failed', error)
      toast.error(`Failed to mark ${status.toLowerCase()}`)
    } finally {
      setStatusUpdatingOrderId('')
    }
  }

  return (
    <div className="space-y-3 pb-20">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search Name, Mobile, or Order ID..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#ff9900] outline-none font-bold text-gray-700"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide px-1 items-center">
        {['All', 'Pending', 'Confirmed', 'Delivered'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em] whitespace-nowrap transition-all ${
              filter === f
                ? 'bg-[#131921] text-[#ff9900]'
                : 'bg-white text-gray-400 border border-gray-200'
            }`}
          >
            {f === 'Delivered' ? 'DEL' : f}
          </button>
        ))}

        <span className="h-5 w-px bg-gray-200 shrink-0" />

        {[
          { key: 'All', label: 'Dates', icon: CalendarRange },
          { key: 'Today', label: 'Today', icon: Sun },
          { key: 'Tomorrow', label: 'Tmrw', icon: Clock },
          { key: 'ThisWeek', label: 'Week', icon: CalendarDays },
        ].map(
          (
            { key, label, icon: Icon }, // eslint-disable-line no-unused-vars
          ) => (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`px-2 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wide whitespace-nowrap border transition-all inline-flex items-center gap-1 ${
                dateFilter === key
                  ? 'bg-[#ff9900]/15 text-[#cc7a00] border-[#ff9900]/30'
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ),
        )}

        <button
          key="Month"
          type="button"
          onClick={() => {
            if (dateFilter === 'Month' || dateFilter === 'ThisMonth' || dateFilter === 'LastMonth' || dateFilter === 'Last3Months') {
              setShowPeriodPicker(!showPeriodPicker)
            } else {
              setDateFilter('Month')
              setShowPeriodPicker(true)
            }
          }}
          className={`px-2 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wide whitespace-nowrap border transition-all inline-flex items-center gap-1 ${
            dateFilter === 'Month' || dateFilter === 'ThisMonth' || dateFilter === 'LastMonth' || dateFilter === 'Last3Months'
              ? 'bg-[#ff9900]/15 text-[#cc7a00] border-[#ff9900]/30'
              : 'bg-white text-gray-400 border-gray-200'
          }`}
        >
          <Calendar size={12} />
          <span>
            {dateFilter === 'Month' && selectedMonth
              ? new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
              : dateFilter === 'ThisMonth'
                ? 'This M'
                : dateFilter === 'LastMonth'
                  ? 'Last M'
                  : dateFilter === 'Last3Months'
                    ? '3M'
                    : 'Month'}
          </span>
          <ChevronDown size={10} className={`transition-transform duration-200 ${showPeriodPicker ? 'rotate-180' : ''}`} />
        </button>

        <button
          onClick={shareDispatchPlan}
          className="bg-[#25D366] text-white px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shadow-sm active:scale-95"
        >
          <Smartphone size={12} /> Roster
        </button>

        {onOpenBaileyOrder && (
          <button
            type="button"
            onClick={onOpenBaileyOrder}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
            title="Create Bailey replenishment order based on consumption & stock"
          >
            <Droplets size={12} /> Bailey Order
          </button>
        )}
      </div>

      {/* ─── Expandable Month / Custom Range Selector ─── */}
      {showPeriodPicker && (
        <div className="bg-[#131921] border border-gray-800 rounded-2xl p-2.5 text-white space-y-2 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-1">
              <Calendar size={12} className="text-[#ff9900]" /> Filter By Month or Range
            </span>
            <button
              type="button"
              onClick={() => setShowPeriodPicker(false)}
              className="text-gray-400 hover:text-white p-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* Quick Month Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {[
              {
                label: 'This Month',
                active: dateFilter === 'ThisMonth',
                action: () => {
                  setDateFilter('ThisMonth')
                  setSelectedMonth('')
                },
              },
              {
                label: 'Last Month',
                active: dateFilter === 'LastMonth',
                action: () => {
                  setDateFilter('LastMonth')
                  setSelectedMonth('')
                },
              },
              {
                label: 'Last 3M',
                active: dateFilter === 'Last3Months',
                action: () => {
                  setDateFilter('Last3Months')
                  setSelectedMonth('')
                },
              },
              {
                label: 'All History',
                active: dateFilter === 'All',
                action: () => {
                  setDateFilter('All')
                  setSelectedMonth('')
                  if (hasMoreOrders) {
                    handleLoadAllHistory()
                  }
                },
              },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={preset.action}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap active:scale-95 transition-all ${
                  preset.active
                    ? 'bg-[#ff9900] text-gray-900 font-black'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Native Month Picker and DB Load Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-800 text-xs">
            <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-xl border border-gray-700/60">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value)
                  if (e.target.value) {
                    setDateFilter('Month')
                  }
                }}
                className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
              />
            </div>

            {hasMoreOrders && (
              <button
                type="button"
                onClick={handleLoadAllHistory}
                disabled={loadingOlderOrders}
                className="px-2.5 py-1 bg-[#ff9900] hover:bg-[#e68a00] text-gray-900 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {loadingOlderOrders ? <Loader2 size={11} className="animate-spin" /> : <History size={11} />}
                Load DB History
              </button>
            )}
          </div>
        </div>
      )}

      {/* SKU Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide px-1">
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

      {filteredOrders.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic space-y-3">
          <p>No orders found for current filter.</p>
          {hasMoreOrders && (
            <button
              type="button"
              onClick={handleLoadAllHistory}
              disabled={loadingOlderOrders}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#131921] hover:bg-[#1f2833] text-[#ff9900] text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-xs not-italic"
            >
              {loadingOlderOrders ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
              Search Full Past History in DB
            </button>
          )}
        </div>
      ) : (
        filteredOrders.map((order) => (
          <div
            key={order.id}
            className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100"
          >
            <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}
                  >
                    {order.status || 'LEGACY'}
                  </span>
                  {order.items && order.items.length > 1 ? (
                    <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border border-purple-200 bg-purple-50 text-purple-800">
                      {order.items.length} SKUs
                    </span>
                  ) : (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${getSkuMeta(order.sku || DEFAULT_SKU).badgeClass}`}
                    >
                      {order.sku || DEFAULT_SKU}
                    </span>
                  )}
                </div>
                <h3 className="font-black text-gray-900 text-lg mt-2 leading-none">
                  {getDisplayName(order)}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-[#ff9900]">
                  {order.totalQty || order.qty || 0}{' '}
                  <span className="text-[10px] text-gray-400 font-bold">
                    Units
                  </span>
                </p>
                <p className="text-[10px] text-gray-500 font-bold mt-1 tracking-tighter">
                  ₹{(order.totalAmount !== undefined ? order.totalAmount : (order.qty || 0) * (order.rate || 0)).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Line Items Breakdown Pills */}
            {order.items && order.items.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {order.items.map((it, i) => {
                  const meta = getSkuMeta(it.sku)
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.badgeClass}`}
                    >
                      <span>{it.qty} {meta.unit.includes('Box') ? 'bxs' : 'cs'}</span>
                      <span className="font-medium opacity-80">• {it.sku}</span>
                      {Number(it.rate) > 0 && (
                        <span className="font-black text-gray-900 opacity-90">@ ₹{it.rate}</span>
                      )}
                    </span>
                  )
                })}
              </div>
            )}

            <div className="mb-4 flex items-center justify-between gap-2 bg-gray-50 p-2 rounded-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                <Clock size={14} className="text-blue-400" /> {order.date || 'No Date'} @{' '}
                {order.time || '--:--'}
              </div>
              {userRole === 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRecordPayment?.(order)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-black tracking-wide uppercase"
                    title="Record payment"
                  >
                    <HandCoins size={12} />
                    Pay
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareInvoice?.(order)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black tracking-wide uppercase"
                    title="Invoice PDF / WhatsApp"
                  >
                    <FileText size={14} />
                    PDF
                  </button>
                </div>
              )}
            </div>

            {/* Delivery Address & Maps block */}
            {(() => {
              const address = getDisplayAddress(order)
              const mapsUrl = getMapsUrl(order)
              if (!address && !mapsUrl) return null
              return (
                <div className="mb-4 bg-orange-50/40 border border-orange-100/50 px-3 py-2 rounded-2xl flex items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <MapPin size={14} className="text-[#ff9900] shrink-0" />
                    <span className="text-xs font-bold text-gray-700 truncate" title={address}>
                      {address || 'Location Coordinates'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-orange-50 border border-orange-200 text-[#ff9900] text-[9px] font-black uppercase rounded-lg shadow-2xs active:scale-95 transition-all"
                        title="Get Directions"
                      >
                        <Navigation size={10} />
                        Go
                      </a>
                    )}
                    {address && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(address)
                          toast.success('Address copied!')
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 text-[9px] font-black uppercase rounded-lg shadow-2xs active:scale-95 transition-all"
                        title="Copy Address"
                      >
                        <Copy size={10} />
                        Copy
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Action Bar */}
            <div className="flex justify-between items-center gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => shareOrder(order)}
                  className="bg-[#25D366]/10 text-[#25D366] p-2 rounded-xl"
                  title="Share details"
                >
                  <Smartphone size={16} />
                </button>
                {order.status !== 'Delivered' && (
                  <button
                    onClick={() => callClient(order)}
                    className="bg-green-50 text-green-600 p-2 rounded-xl"
                    title="Call client"
                  >
                    <Phone size={16} />
                  </button>
                )}
                {userRole === 'admin' && (
                  <>
                    <button
                      onClick={() => attachDeliveryProof(order.id)}
                      disabled={uploadingProofOrderId === order.id}
                      className={`${order.proofUrl ? 'bg-blue-100 text-blue-600' : 'bg-amber-50 text-amber-600'} p-2 rounded-xl`}
                      title={
                        order.proofUrl
                          ? 'Replace delivery proof photo'
                          : 'Attach delivery proof photo'
                      }
                    >
                      {uploadingProofOrderId === order.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Paperclip size={16} />
                      )}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => {
                        proofInputRefs.current[order.id] = el
                      }}
                      onChange={(event) => uploadDeliveryProof(order, event)}
                    />
                    <button
                      onClick={() => onEdit(order)}
                      className="bg-blue-50 text-blue-500 p-2 rounded-xl"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => onCopy(order)}
                      className="bg-gray-100 text-gray-500 p-2 rounded-xl"
                    >
                      <Copy size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(order)}
                      className="bg-red-50 text-red-500 p-2 rounded-xl"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>

              {userRole === 'admin' && order.status === 'Pending' && (
                <button
                  onClick={() => handleStatusUpdate(order, 'Confirmed')}
                  disabled={statusUpdatingOrderId === order.id}
                  className="bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm disabled:opacity-60"
                >
                  {statusUpdatingOrderId === order.id ? 'Updating...' : 'Confirm'}
                </button>
              )}
              {userRole === 'admin' && order.status === 'Confirmed' && (
                <button
                  onClick={() => handleStatusUpdate(order, 'Delivered')}
                  disabled={statusUpdatingOrderId === order.id}
                  className="bg-green-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm disabled:opacity-60"
                >
                  {statusUpdatingOrderId === order.id ? 'Updating...' : 'Mark Delivered'}
                </button>
              )}
              {order.proofUrl && (
                <a
                  href={order.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-black text-blue-500 underline"
                >
                  View Proof
                </a>
              )}
            </div>
          </div>
        ))
      )}

      {/* ─── Bottom History & Pagination Strip ─── */}
      <div className="mt-4 p-3 bg-white rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <History size={15} className="text-[#ff9900]" />
          <span>
            Loaded <strong className="text-gray-800">{orders.length}</strong> orders
            {filteredOrders.length !== orders.length && (
              <span className="text-gray-400 font-normal"> ({filteredOrders.length} shown)</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasMoreOrders ? (
            <>
              <button
                type="button"
                onClick={handleLoadOlder}
                disabled={loadingOlderOrders}
                className="px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Load 50 older historical orders"
              >
                {loadingOlderOrders ? (
                  <Loader2 size={13} className="animate-spin text-[#ff9900]" />
                ) : (
                  <ArrowDownCircle size={13} className="text-[#ff9900]" />
                )}
                <span>+50 Older</span>
              </button>

              <button
                type="button"
                onClick={handleLoadAllHistory}
                disabled={loadingOlderOrders}
                className="px-3 py-1.5 rounded-xl bg-[#131921] hover:bg-[#1f2833] text-[#ff9900] text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                title="Load all historical orders from database"
              >
                {loadingOlderOrders ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <History size={13} />
                )}
                <span>Load All History</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
              <CheckCircle2 size={13} /> All DB Orders Loaded
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(OrdersDashboard)
