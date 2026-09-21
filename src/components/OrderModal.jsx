import { useState, useEffect } from 'react'
import { useClientStore } from '../store/clientStore'
import { Package, Clock, IndianRupee, Image as ImageIcon, MapPinned, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import GoogleMapPicker from './GoogleMapPicker'
import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'

export default function OrderModal({ orderToEdit, onClose }) {
  const clients = useClientStore((state) => state.clients)
  const addOrder = useClientStore((state) => state.addOrder)
  const updateOrder = useClientStore((state) => state.updateOrder)

  const [formData, setFormData] = useState(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const localDate = `${yyyy}-${mm}-${dd}`
    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const localTime = `${hh}:${min}`
    return {
      clientId: '',
      date: localDate,
      time: localTime,
      address: '',
      location: '',
      mapLink: '',
      locationLat: null,
      locationLng: null,
      proofUrl: '',
    }
  })

  const [items, setItems] = useState(() => {
    if (orderToEdit?.items && Array.isArray(orderToEdit.items) && orderToEdit.items.length > 0) {
      return orderToEdit.items.map((it) => ({
        sku: it.sku || DEFAULT_SKU,
        qty: String(it.qty ?? ''),
        rate: String(it.rate ?? ''),
      }))
    }
    if (orderToEdit?.qty) {
      return [
        {
          sku: orderToEdit.sku || orderToEdit.product || DEFAULT_SKU,
          qty: String(orderToEdit.qty),
          rate: String(orderToEdit.rate ?? ''),
        },
      ]
    }
    return [{ sku: DEFAULT_SKU, qty: '', rate: '' }]
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const localDate = `${yyyy}-${mm}-${dd}`
    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const localTime = `${hh}:${min}`

    if (orderToEdit) {
      setFormData({
        clientId: orderToEdit.clientId || orderToEdit.customerId || '',
        date: orderToEdit.date || orderToEdit.deliveryDate || orderToEdit.orderDate || localDate,
        time: orderToEdit.time || orderToEdit.deliveryTime || localTime,
        address: orderToEdit.address || orderToEdit.deliveryAddress || '',
        location:
          orderToEdit.location || orderToEdit.googleLocation || orderToEdit.locationName || '',
        mapLink: orderToEdit.mapLink || orderToEdit.googleMap || '',
        locationLat: Number.isFinite(Number(orderToEdit.locationLat ?? orderToEdit.lat))
          ? Number(orderToEdit.locationLat ?? orderToEdit.lat)
          : null,
        locationLng: Number.isFinite(Number(orderToEdit.locationLng ?? orderToEdit.lng))
          ? Number(orderToEdit.locationLng ?? orderToEdit.lng)
          : null,
        proofUrl: orderToEdit.proofUrl || '',
      })

      if (orderToEdit.items && Array.isArray(orderToEdit.items) && orderToEdit.items.length > 0) {
        setItems(
          orderToEdit.items.map((it) => ({
            sku: it.sku || DEFAULT_SKU,
            qty: String(it.qty ?? ''),
            rate: String(it.rate ?? ''),
          })),
        )
      } else if (orderToEdit.qty) {
        setItems([
          {
            sku: orderToEdit.sku || orderToEdit.product || DEFAULT_SKU,
            qty: String(orderToEdit.qty),
            rate: String(orderToEdit.rate ?? ''),
          },
        ])
      }
    }
  }, [orderToEdit])

  useEffect(() => {
    if (!formData.clientId) return
    const selectedClient = clients.find((client) => client.id === formData.clientId)
    if (!selectedClient) return

    setFormData((prev) => {
      const next = { ...prev }
      let changed = false

      if (!String(prev.address || '').trim() && selectedClient.address) {
        next.address = selectedClient.address
        changed = true
      }

      if (
        !String(prev.location || '').trim() &&
        (selectedClient.location || selectedClient.mapLink)
      ) {
        next.location = selectedClient.location || selectedClient.mapLink || ''
        changed = true
      }

      if (!String(prev.mapLink || '').trim() && selectedClient.mapLink) {
        next.mapLink = selectedClient.mapLink
        changed = true
      }

      if (
        !Number.isFinite(Number(prev.locationLat)) &&
        Number.isFinite(Number(selectedClient.locationLat))
      ) {
        next.locationLat = Number(selectedClient.locationLat)
        changed = true
      }

      if (
        !Number.isFinite(Number(prev.locationLng)) &&
        Number.isFinite(Number(selectedClient.locationLng))
      ) {
        next.locationLng = Number(selectedClient.locationLng)
        changed = true
      }

      return changed ? next : prev
    })

    // Autofill rate for items without an explicit rate
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (!item.rate || Number(item.rate) <= 0) {
          const customSkuRate = selectedClient.skuRates?.[item.sku]
          const nextRate = Number(customSkuRate ?? selectedClient.rate) || 0
          return nextRate > 0 ? { ...item, rate: String(nextRate) } : item
        }
        return item
      }),
    )
  }, [clients, formData.clientId])

  const handleItemSkuChange = (index, newSku) => {
    setItems((prev) => {
      const updated = [...prev]
      const selectedClient = clients.find((client) => client.id === formData.clientId)
      const customSkuRate = selectedClient?.skuRates?.[newSku]
      const nextRate =
        customSkuRate !== undefined && customSkuRate !== null && customSkuRate !== ''
          ? String(customSkuRate)
          : selectedClient?.rate
            ? String(selectedClient.rate)
            : updated[index].rate

      updated[index] = {
        ...updated[index],
        sku: newSku,
        rate: nextRate,
      }
      return updated
    })
  }

  const handleItemQtyChange = (index, newQty) => {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], qty: newQty }
      return updated
    })
  }

  const handleItemRateChange = (index, newRate) => {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], rate: newRate }
      return updated
    })
  }

  const addItemRow = () => {
    const existingSkus = new Set(items.map((i) => i.sku))
    const nextAvailable = WATER_SKUS.find((s) => !existingSkus.has(s.label))
    const newSku = nextAvailable ? nextAvailable.label : DEFAULT_SKU
    const selectedClient = clients.find((client) => client.id === formData.clientId)
    const customSkuRate = selectedClient?.skuRates?.[newSku]
    const initialRate =
      customSkuRate !== undefined && customSkuRate !== null && customSkuRate !== ''
        ? String(customSkuRate)
        : selectedClient?.rate
          ? String(selectedClient.rate)
          : ''

    setItems((prev) => [...prev, { sku: newSku, qty: '', rate: initialRate }])
  }

  const removeItemRow = (index) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleLocationChange = ({ lat, lng, address, mapLink }) => {
    setFormData((prev) => ({
      ...prev,
      locationLat: Number.isFinite(Number(lat)) ? Number(lat) : prev.locationLat,
      locationLng: Number.isFinite(Number(lng)) ? Number(lng) : prev.locationLng,
      location: address || prev.location,
      mapLink: mapLink || prev.mapLink,
    }))
  }

  const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0)
  const totalAmount = items.reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.rate) || 0),
    0,
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (totalQty <= 0) {
      toast.error('Please enter quantity for at least one item')
      return
    }

    setLoading(true)
    try {
      const validItems = items
        .filter((it) => Number(it.qty) > 0)
        .map((it) => ({
          sku: it.sku || DEFAULT_SKU,
          qty: Number(it.qty),
          rate: Number(it.rate) || 0,
          amount: Number(it.qty) * (Number(it.rate) || 0),
          unit: getSkuMeta(it.sku).unit,
        }))

      const primarySku =
        validItems.length === 1 ? validItems[0].sku : validItems.map((it) => it.sku).join(', ')

      const payload = {
        ...formData,
        items: validItems,
        totalQty,
        totalAmount,
        qty: totalQty,
        rate: totalQty > 0 ? Math.round((totalAmount / totalQty) * 100) / 100 : 0,
        sku: primarySku,
        address: String(formData.address || '').trim(),
        location: String(formData.location || '').trim(),
        mapLink: String(formData.mapLink || '').trim(),
        locationLat: Number.isFinite(Number(formData.locationLat))
          ? Number(formData.locationLat)
          : null,
        locationLng: Number.isFinite(Number(formData.locationLng))
          ? Number(formData.locationLng)
          : null,
        proofUrl: String(formData.proofUrl || '').trim(),
      }

      if (orderToEdit && orderToEdit.id) {
        await updateOrder(orderToEdit.id, payload)
        toast.success('Order updated successfully')
      } else {
        await addOrder(payload)
        toast.success('Order created successfully')
      }
      onClose()
    } catch (err) {
      console.error('Order save failed:', err)
      toast.error('Failed to save order: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-black uppercase text-gray-800 tracking-tight">
          {orderToEdit?.id ? 'Edit Order' : 'New Order'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client Selector */}
        <div>
          <label
            htmlFor="client-select"
            className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
          >
            Select Client
          </label>
          <select
            id="client-select"
            required
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-bold text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange"
            value={formData.clientId}
            onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
          >
            <option value="">-- Choose Client --</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Zoho-Style Line Items Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Items
            </span>
            <button
              type="button"
              onClick={addItemRow}
              className="inline-flex items-center gap-1 text-xs font-bold text-gray-800 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <Plus size={13} className="text-amber-600" />
              <span>Add Item</span>
            </button>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => {
              const meta = getSkuMeta(item.sku)
              const lineTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0)
              return (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-gray-600">
                      Item #{idx + 1}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="text-rose-500 hover:text-rose-700 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove Item"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    {/* SKU Selection */}
                    <div className="sm:col-span-6">
                      <label
                        htmlFor={`sku-select-${idx}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                      >
                        Product / SKU
                      </label>
                      <select
                        id={`sku-select-${idx}`}
                        value={item.sku}
                        onChange={(e) => handleItemSkuChange(idx, e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-bold focus:ring-1 focus:ring-amz-orange outline-none"
                      >
                        {WATER_SKUS.map((s) => (
                          <option key={s.id} value={s.label}>
                            {s.label} ({s.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`qty-input-${idx}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                      >
                        Qty ({meta.unit})
                      </label>
                      <div className="relative">
                        <Package className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                        <input
                          id={`qty-input-${idx}`}
                          type="number"
                          min="1"
                          required
                          placeholder="Qty"
                          value={item.qty}
                          onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                          className="w-full pl-7 pr-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold focus:ring-1 focus:ring-amz-orange outline-none"
                        />
                      </div>
                    </div>

                    {/* Rate */}
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`rate-input-${idx}`}
                        className="block text-[10px] font-bold text-gray-500 uppercase mb-1"
                      >
                        Rate (₹)
                      </label>
                      <div className="relative">
                        <IndianRupee className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                        <input
                          id={`rate-input-${idx}`}
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          placeholder="Rate"
                          value={item.rate}
                          onChange={(e) => handleItemRateChange(idx, e.target.value)}
                          className="w-full pl-7 pr-2 py-2 bg-white border border-gray-300 rounded-lg text-xs font-bold focus:ring-1 focus:ring-amz-orange outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] text-gray-500 pt-0.5 border-t border-gray-200/60">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${meta.brand === 'Bailey' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}`}>
                      {meta.brand} • {meta.size}
                    </span>
                    <div>
                      <span>Subtotal: </span>
                      <span className="font-extrabold text-gray-900 ml-1">₹{lineTotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Line Items Summary Box */}
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-gray-600 font-medium">Total Quantity: </span>
              <span className="font-black text-gray-900">{totalQty} Units</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-gray-600 font-medium">{items.length} SKU Line{items.length > 1 ? 's' : ''}</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-orange-800 uppercase tracking-wide mr-1.5">
                Total Value
              </span>
              <span className="text-base font-black text-[#ff9900]">
                ₹{totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="date-input"
              className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
            >
              Delivery Date
            </label>
            <input
              id="date-input"
              type="date"
              required
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor="time-input"
              className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
            >
              Time
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                id="time-input"
                type="time"
                required
                className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <label
            htmlFor="address-input"
            className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
          >
            Full Address
          </label>
          <textarea
            id="address-input"
            required
            rows="2"
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-medium"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>

        {/* Location Picker */}
        <div>
          <label
            htmlFor="location-input"
            className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
          >
            Location
          </label>
          <div className="mt-1 mb-2">
            <GoogleMapPicker initialAddress={formData.location} onChange={handleLocationChange} />
          </div>
          <input
            id="location-input"
            type="text"
            placeholder="Delivery location / landmark"
            maxLength={150}
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <MapPinned className="h-4 w-4 text-amz-orange shrink-0" />
            {formData.mapLink ? (
              <a
                className="text-xs text-blue-600 underline truncate"
                href={formData.mapLink}
                target="_blank"
                rel="noreferrer"
              >
                Open selected map link
              </a>
            ) : (
              <span className="text-xs text-gray-500">Pick a point to generate map link</span>
            )}
          </div>
        </div>

        {orderToEdit?.status === 'Delivered' && (
          <div>
            <label
              htmlFor="proof-input"
              className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1"
            >
              Delivery Proof (Photo URL/Drive)
            </label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                id="proof-input"
                type="url"
                placeholder="Paste image link here"
                className="w-full pl-9 pr-3 py-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 outline-none text-sm"
                value={formData.proofUrl}
                onChange={(e) => setFormData({ ...formData, proofUrl: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="sticky bottom-0 bg-white pt-3 pb-1 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full border border-gray-300 text-gray-700 py-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            className="w-full bg-[#131921] text-[#ff9900] py-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </form>
    </div>
  )
}
