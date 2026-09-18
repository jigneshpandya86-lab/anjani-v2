import { create } from 'zustand'
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
  getDoc,
  limit,
  increment,
  setDoc,
  getDocs,
  deleteField,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { DEFAULT_SKU, getSkuMeta } from '../constants/skus'

let stockUnsubscribe = null
let stockSubscriberCount = 0
let leadsUnsubscribe = null
let leadsSubscriberCount = 0
const STOCK_SUMMARY_DOC = doc(db, 'meta', 'stockSummary')
const RECENT_STOCK_ENTRIES_LIMIT = 50

const getOrderClientName = async (order, clients = []) => {
  const normalizeName = (value) => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  const fromOrder = [
    order?.clientName,
    order?.customerName,
    order?.client?.name,
    order?.customer?.name,
    typeof order?.customer === 'string' ? order.customer : '',
    typeof order?.client === 'string' ? order.client : '',
    order?.name,
  ]
    .map(normalizeName)
    .find(Boolean)

  if (fromOrder) return fromOrder

  const rawClientId =
    order?.clientId ||
    order?.customerId ||
    order?.client?.id ||
    order?.customer?.id ||
    order?.client_id ||
    order?.customer_id

  const clientId = rawClientId ? String(rawClientId).trim() : ''
  if (!clientId) return ''

  const fromStore = clients.find((client) => String(client.id).trim() === clientId)?.name
  if (fromStore) return normalizeName(fromStore)

  const customerSnap = await getDoc(doc(db, 'customers', clientId))
  return customerSnap.exists() ? normalizeName(customerSnap.data()?.name) : ''
}

const formatOrderNarration = (prefix, orderRef, clientName) => {
  return clientName ? `${prefix}: ${orderRef} • ${clientName}` : `${prefix}: ${orderRef}`
}

const buildClientShortId = (clientDocId) => {
  const safeId = String(clientDocId || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
  return `CLT-${safeId.slice(0, 6).padEnd(6, '0')}`
}

const normalizeOrderWriteData = (data = {}) => {
  const result = {
    ...data,
    address: data.address === undefined ? '' : String(data.address).trim(),
    location: data.location === undefined ? '' : String(data.location).trim(),
    mapLink: data.mapLink === undefined ? '' : String(data.mapLink).trim(),
    locationLat: Number.isFinite(Number(data.locationLat)) ? Number(data.locationLat) : null,
    locationLng: Number.isFinite(Number(data.locationLng)) ? Number(data.locationLng) : null,
  }

  if (Array.isArray(data.items) && data.items.length > 0) {
    result.items = data.items.map((it) => {
      const itQty = Number(it.qty) || 0
      const itRate = Number(it.rate) || 0
      const itSku = it.sku || DEFAULT_SKU
      const itMeta = getSkuMeta(itSku)
      return {
        sku: itSku,
        qty: itQty,
        rate: itRate,
        amount: itQty * itRate,
        unit: it.unit || itMeta.unit,
      }
    })
    result.totalQty = result.items.reduce((sum, it) => sum + it.qty, 0)
    result.totalAmount = result.items.reduce((sum, it) => sum + it.amount, 0)
    result.qty = result.totalQty
    result.rate =
      Number(data.rate) ||
      (result.totalQty > 0 ? Math.round((result.totalAmount / result.totalQty) * 100) / 100 : 0)
    result.sku =
      result.items.length === 1 ? result.items[0].sku : result.items.map((it) => it.sku).join(', ')
  }

  return result
}

const getLegacyLocationCleanupPatch = () => ({
  mapLink: deleteField(),
  googleMap: deleteField(),
  googleLocation: deleteField(),
  locationName: deleteField(),
})

export const useClientStore = create((set, get) => ({
  userRole: null,
  clients: [],
  orders: [],
  stockEntries: [],
  stockTotal: 0,
  stockSummary: {},
  leads: [],
  loading: false,
  paymentSettings: {
    qrImageDataUrl: null,
    upiId: '',
    payeeName: 'Annapurna Foods',
  },
  aiDrawerOpen: false,
  aiPrefillPrompt: '',
  aiSettings: {
    activeModel: 'gemini-2.5-flash-lite',
    fallbackModel: 'gemini-2.5-flash',
    maxOutputTokens: 600,
  },

  fetchUserRole: async (uid) => {
    if (!uid) {
      set({ userRole: null })
      return
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', uid))
      if (userDoc.exists()) {
        set({ userRole: userDoc.data().role || 'staff' })
      } else {
        // If no user document exists, default to 'staff' for safety
        set({ userRole: 'staff' })
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err)
      set({ userRole: 'staff' })
    }
  },

  fetchStock: () => {
    stockSubscriberCount += 1

    if (!stockUnsubscribe) {
      const q = query(collection(db, 'stock'), orderBy('createdAt', 'desc'), limit(100))
      stockUnsubscribe = onSnapshot(q, (snapshot) => {
        const getTime = (value) => {
          if (!value) return 0
          if (value?.toMillis) return value.toMillis()
          if (value?.seconds) return value.seconds * 1000
          if (value instanceof Date) return value.getTime()
          if (typeof value === 'string') {
            const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/)
            if (ddmmyyyy) {
              const [, dd, mm, yyyy] = ddmmyyyy
              return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
            }
            return new Date(value).getTime()
          }
          return 0
        }

        const normalize = (raw) => {
          const hasLegacyProducedDelivered =
            raw.produced !== undefined || raw.delivered !== undefined
          const hasDirectQty =
            raw.qty !== undefined || raw.boxes !== undefined || raw.quantity !== undefined

          // Legacy rows from previous system may only store produced/delivered.
          if (hasLegacyProducedDelivered && !hasDirectQty) {
            const producedCount = Number(raw.produced) || 0
            const deliveredCount = Number(raw.delivered) || 0
            const title = raw.customer || raw.clientName || 'Legacy Entry'
            const netQty = producedCount - deliveredCount
            return {
              ...raw,
              narration:
                raw.narration || `${title} - Produced ${producedCount} Delivered ${deliveredCount}`,
              produced: producedCount,
              delivered: deliveredCount,
              qty: netQty,
              type: 'old_job',
              date: raw.date, // Keep as-is (string)
            }
          }
          // New inventory entry - normalize fields
          return {
            ...raw,
            narration: raw.narration || raw.note || '',
            qty: Number(raw.qty || raw.boxes || raw.quantity) || 0,
            sku: raw.sku || 'Anjani 200ml',
            rate: Number(raw.rate) || 0,
            date: raw.date || raw.createdAt,
            type: raw.type || 'entry',
          }
        }
        const stockEntries = snapshot.docs
          .map((doc) => normalize({ id: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const primaryDiff = getTime(b.date) - getTime(a.date)
            if (primaryDiff !== 0) return primaryDiff

            return getTime(b.createdAt) - getTime(a.createdAt)
          })
          .slice(0, RECENT_STOCK_ENTRIES_LIMIT)
        set({ stockEntries })
      })
    }

    return () => {
      stockSubscriberCount = Math.max(0, stockSubscriberCount - 1)
      if (stockSubscriberCount === 0 && stockUnsubscribe) {
        stockUnsubscribe()
        stockUnsubscribe = null
      }
    }
  },

  fetchStockTotal: () => {
    return onSnapshot(STOCK_SUMMARY_DOC, async (summarySnap) => {
      if (summarySnap.exists()) {
        const data = summarySnap.data() || {}
        let storedTotal = Number(data.totalQty) || 0
        const bySku = data.bySku || data.skus || {}
        const sumBySku = Object.values(bySku).reduce((s, v) => s + (Number(v) || 0), 0)
        if (storedTotal === 0 && sumBySku > 0) {
          storedTotal = sumBySku
        }
        console.log('[Stock] Current summary doc:', {
          totalQty: storedTotal,
          bySku,
        })
        set({ stockTotal: storedTotal, stockSummary: bySku })
        return
      }
      get().recalculateStockTotal()
    })
  },

  recalculateStockTotal: async () => {
    set({ loading: true })
    try {
      const fullSnap = await getDocs(query(collection(db, 'stock')))
      const bySku = {
        'Anjani 200ml': 0,
        'Bailey 250ml': 0,
        'Bailey 500ml': 0,
        'Bailey 1 Liter': 0,
        'Bailey 2 Liter': 0,
      }
      let computedTotal = 0

      fullSnap.docs.forEach((d) => {
        const raw = d.data()
        const hasLegacyProducedDelivered = raw.produced !== undefined || raw.delivered !== undefined
        let qty = 0
        if (hasLegacyProducedDelivered && raw.qty === undefined) {
          qty = (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
        } else {
          qty = Number(raw.qty || raw.boxes || raw.quantity) || 0
        }
        computedTotal += qty
        const meta = getSkuMeta(raw.sku || raw.product || 'Anjani 200ml')
        const skuLabel = meta?.label || 'Anjani 200ml'
        bySku[skuLabel] = (bySku[skuLabel] || 0) + qty
      })

      console.log(
        '[Stock] Backfilled summary from',
        fullSnap.docs.length,
        'entries:',
        computedTotal,
        bySku,
      )
      await setDoc(STOCK_SUMMARY_DOC, { totalQty: computedTotal, bySku }, { merge: true })
      set({ stockTotal: computedTotal, stockSummary: bySku, loading: false })
      return { computedTotal, bySku }
    } catch (error) {
      console.error('Failed to recalculate stock:', error)
      set({ loading: false })
      throw error
    }
  },

  addStockManual: async (qty, narration, sku = 'Anjani 200ml') => {
    const parsedQty = Number(qty) || 0
    const meta = getSkuMeta(sku || 'Anjani 200ml')
    const skuLabel = meta?.label || 'Anjani 200ml'
    await addDoc(collection(db, 'stock'), {
      qty: parsedQty,
      sku: skuLabel,
      narration: narration || `Manual Addition (${skuLabel})`,
      type: 'addition',
      date: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
    await setDoc(
      STOCK_SUMMARY_DOC,
      {
        totalQty: increment(parsedQty),
        [`bySku.${skuLabel}`]: increment(parsedQty),
      },
      { merge: true },
    )
    set((state) => ({
      stockTotal: (Number(state.stockTotal) || 0) + parsedQty,
      stockSummary: {
        ...state.stockSummary,
        [skuLabel]: (Number(state.stockSummary?.[skuLabel]) || 0) + parsedQty,
      },
    }))
  },

  addStockBatch: async (entries, defaultNarration = 'Stock Inward') => {
    let netTotal = 0
    const skuDeltas = {}
    for (const entry of entries) {
      const parsedQty = Number(entry.qty) || 0
      if (parsedQty === 0) continue
      const meta = getSkuMeta(entry.sku || DEFAULT_SKU)
      const skuLabel = meta?.label || DEFAULT_SKU
      await addDoc(collection(db, 'stock'), {
        qty: parsedQty,
        sku: skuLabel,
        narration: entry.narration || defaultNarration || `Stock Inward (${skuLabel})`,
        type: parsedQty > 0 ? 'addition' : 'dispatch',
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      netTotal += parsedQty
      skuDeltas[skuLabel] = (skuDeltas[skuLabel] || 0) + parsedQty
    }
    if (netTotal !== 0) {
      const updatePayload = { totalQty: increment(netTotal) }
      Object.entries(skuDeltas).forEach(([label, delta]) => {
        updatePayload[`bySku.${label}`] = increment(delta)
      })
      await setDoc(STOCK_SUMMARY_DOC, updatePayload, { merge: true })
      set((state) => {
        const nextSummary = { ...state.stockSummary }
        Object.entries(skuDeltas).forEach(([label, delta]) => {
          nextSummary[label] = (Number(nextSummary[label]) || 0) + delta
        })
        return {
          stockTotal: (Number(state.stockTotal) || 0) + netTotal,
          stockSummary: nextSummary,
        }
      })
    }
  },

  deleteStockEntry: async (id) => {
    const stockRef = doc(db, 'stock', id)
    const stockSnap = await getDoc(stockRef)
    if (!stockSnap.exists()) return

    const raw = stockSnap.data()
    const hasLegacyProducedDelivered = raw.produced !== undefined || raw.delivered !== undefined
    const qtyDelta =
      hasLegacyProducedDelivered && raw.qty === undefined
        ? (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
        : Number(raw.qty || raw.boxes || raw.quantity) || 0
    const meta = getSkuMeta(raw.sku || raw.product || 'Anjani 200ml')
    const skuLabel = meta?.label || 'Anjani 200ml'

    await deleteDoc(stockRef)
    await setDoc(
      STOCK_SUMMARY_DOC,
      {
        totalQty: increment(-qtyDelta),
        [`bySku.${skuLabel}`]: increment(-qtyDelta),
      },
      { merge: true },
    )
    set((state) => ({
      stockTotal: (Number(state.stockTotal) || 0) - qtyDelta,
      stockSummary: {
        ...state.stockSummary,
        [skuLabel]: (Number(state.stockSummary?.[skuLabel]) || 0) - qtyDelta,
      },
    }))
  },

  fetchPaymentSettings: async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'paymentSettings'))
      if (snap.exists()) {
        const data = snap.data()
        set({
          paymentSettings: {
            qrImageDataUrl: data.qrImageDataUrl || null,
            upiId: data.upiId || '',
            payeeName: data.payeeName || 'Annapurna Foods',
          },
        })
      }
    } catch (err) {
      console.error('Failed to fetch payment settings:', err)
    }
  },

  savePaymentSettings: async (settings) => {
    try {
      await setDoc(
        doc(db, 'config', 'paymentSettings'),
        {
          ...settings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      set((state) => ({
        paymentSettings: {
          ...state.paymentSettings,
          ...settings,
        },
      }))
    } catch (err) {
      console.error('Failed to save payment settings:', err)
      throw err
    }
  },

  setAiDrawerOpen: (open, initialPrompt = '') => {
    set({ aiDrawerOpen: open, aiPrefillPrompt: initialPrompt })
  },

  fetchAiSettings: async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'aiSettings'))
      if (snap.exists()) {
        const data = snap.data()
        set({
          aiSettings: {
            activeModel: data.activeModel || 'gemini-2.5-flash-lite',
            fallbackModel: data.fallbackModel || 'gemini-2.5-flash',
            maxOutputTokens: data.maxOutputTokens || 600,
          },
        })
      }
    } catch (err) {
      console.error('Failed to fetch AI settings:', err)
    }
  },

  saveAiSettings: async (settings) => {
    try {
      await setDoc(
        doc(db, 'config', 'aiSettings'),
        {
          ...settings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      set((state) => ({
        aiSettings: {
          ...state.aiSettings,
          ...settings,
        },
      }))
    } catch (err) {
      console.error('Failed to save AI settings:', err)
      throw err
    }
  },

  fetchLeads: () => {
    leadsSubscriberCount++
    if (leadsUnsubscribe) return leadsUnsubscribe

    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'), limit(100))

    leadsUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedLeads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        set({ leads: fetchedLeads })
      },
      (error) => {
        console.error('Failed to fetch leads:', error)
      },
    )

    return () => {
      leadsSubscriberCount--
      if (leadsSubscriberCount <= 0) {
        if (leadsUnsubscribe) {
          leadsUnsubscribe()
          leadsUnsubscribe = null
        }
        leadsSubscriberCount = 0
      }
    }
  },

  addLead: async (leadData) => {
    await addDoc(collection(db, 'leads'), {
      ...leadData,
      createdAt: new Date().toISOString(),
    })
  },

  deleteLead: async (id) => {
    await deleteDoc(doc(db, 'leads', id))
  },

  updateLead: async (id, data) => {
    await updateDoc(doc(db, 'leads', id), data)
  },

  addClient: async (data) => {
    const docRef = await addDoc(collection(db, 'customers'), {
      name: data.name,
      mobile: data.phone,
      address: data.address,
      rate: Number(data.rate) || 0,
      skuRates: data.skuRates || {},
      location: String(data.location || data.mapLink || '').trim(),
      mapLink: String(data.mapLink || '').trim(),
      locationLat: Number.isFinite(Number(data.locationLat)) ? Number(data.locationLat) : null,
      locationLng: Number.isFinite(Number(data.locationLng)) ? Number(data.locationLng) : null,
      active: true,
      outstanding: 0,
      isRegular: data.isRegular || false,
      isDefaulter: data.isDefaulter || false,
      createdAt: serverTimestamp()
    });
    await updateDoc(docRef, {
      shortId: buildClientShortId(docRef.id),
    })
  },

  updateClient: async (id, data) => {
    await updateDoc(doc(db, 'customers', id), data)
  },

  addOrder: async (data) => {
    const normalizedData = normalizeOrderWriteData(data)
    const orderId = `ORD-${Date.now()}`
    const selectedClient = get().clients.find((client) => client.id === normalizedData.clientId)

    let items = normalizedData.items
    if (!Array.isArray(items) || items.length === 0) {
      const itQty = Number(data.qty) || 0
      const itRate = Number(data.rate) || 0
      const itSku = data.sku || DEFAULT_SKU
      const itMeta = getSkuMeta(itSku)
      items = [
        {
          sku: itSku,
          qty: itQty,
          rate: itRate,
          amount: itQty * itRate,
          unit: itMeta.unit,
        },
      ]
    }
    const totalQty = items.reduce((sum, it) => sum + it.qty, 0)
    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0)
    const primarySku =
      items.length === 1 ? items[0].sku : items.map((it) => it.sku).join(', ')

    await addDoc(collection(db, 'orders'), {
      ...normalizedData,
      orderId,
      clientName: selectedClient?.name || data.clientName || '',
      mobile: selectedClient?.mobile || data.mobile || '',
      address: normalizedData.address || selectedClient?.address || '',
      location: normalizedData.location || selectedClient?.location || selectedClient?.mapLink || '',
      mapLink: normalizedData.mapLink || selectedClient?.mapLink || '',
      locationLat: normalizedData.locationLat ?? selectedClient?.locationLat ?? null,
      locationLng: normalizedData.locationLng ?? selectedClient?.locationLng ?? null,
      items,
      totalQty,
      totalAmount,
      qty: totalQty,
      rate:
        Number(data.rate) ||
        (totalQty > 0 ? Math.round((totalAmount / totalQty) * 100) / 100 : 0),
      sku: primarySku,
      status: 'Pending',
      createdAt: serverTimestamp(),
    })
  },

  createBatchSales: async (salesList) => {
    if (!Array.isArray(salesList) || salesList.length === 0) {
      throw new Error('No sales provided')
    }

    const currentClients = [...(get().clients || [])]
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    const timeStr = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const createdOrders = []
    let totalStockDeducted = 0
    const skuDeltas = {}

    for (let i = 0; i < salesList.length; i++) {
      const sale = salesList[i]
      const rawName = String(sale.clientName || 'Walk-in Customer').trim()

      // 1. Find or create client
      let client = currentClients.find(
        (c) =>
          (c.name && c.name.toLowerCase() === rawName.toLowerCase()) ||
          (c.name && c.name.toLowerCase().includes(rawName.toLowerCase())) ||
          (c.name && rawName.toLowerCase().includes(c.name.toLowerCase())),
      )

      let clientDocId = client?.id
      let clientName = client?.name || rawName

      if (!clientDocId && sale.createClient !== false) {
        const newDoc = await addDoc(collection(db, 'customers'), {
          name: rawName,
          mobile: sale.mobile || '',
          address: sale.address || '',
          outstanding: 0,
          active: true,
          createdAt: serverTimestamp(),
        })
        clientDocId = newDoc.id
        clientName = rawName
        const newClientObj = {
          id: clientDocId,
          name: rawName,
          mobile: sale.mobile || '',
          address: sale.address || '',
          outstanding: 0,
          active: true,
        }
        currentClients.push(newClientObj)
        client = newClientObj
      }

      // 2. Normalize items
      const rawItems =
        Array.isArray(sale.items) && sale.items.length > 0
          ? sale.items
          : [{ sku: DEFAULT_SKU, qty: Number(sale.qty) || 1, rate: Number(sale.rate) || 0 }]

      const items = rawItems.map((it) => {
        const meta = getSkuMeta(it.sku || DEFAULT_SKU)
        const qty = Number(it.qty) || 0
        let rate = Number(it.rate) || 0
        if (rate <= 0 && client) {
          rate = Number(client.skuRates?.[meta.label] ?? client.rate ?? 0)
        }
        return {
          sku: meta.label,
          qty,
          rate,
          amount: qty * rate,
          unit: meta.unit,
        }
      })

      const saleTotalQty = items.reduce((s, it) => s + it.qty, 0)
      const saleTotalAmount =
        Number(sale.totalAmount) > 0
          ? Number(sale.totalAmount)
          : items.reduce((s, it) => s + it.amount, 0)

      const orderId = `ORD-${Date.now()}-${i + 1}`

      // 3. Create order document (Delivered)
      await addDoc(collection(db, 'orders'), {
        orderId,
        clientId: clientDocId || '',
        clientName,
        mobile: client?.mobile || sale.mobile || '',
        address: client?.address || sale.address || '',
        location: client?.location || '',
        items,
        totalQty: saleTotalQty,
        totalAmount: saleTotalAmount,
        qty: saleTotalQty,
        rate: saleTotalQty > 0 ? Math.round((saleTotalAmount / saleTotalQty) * 100) / 100 : 0,
        sku: items.length === 1 ? items[0].sku : items.map((it) => it.sku).join(', '),
        status: 'Delivered',
        paymentMode: sale.paymentMode || 'credit',
        source: 'whatsapp_sales',
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp(),
        stockPostedAt: serverTimestamp(),
      })
      createdOrders.push({ orderId, clientName, totalAmount: saleTotalAmount })

      // 4. Create stock entries for each item
      for (const it of items) {
        if (it.qty > 0) {
          totalStockDeducted += it.qty
          skuDeltas[it.sku] = (skuDeltas[it.sku] || 0) + it.qty
          await addDoc(collection(db, 'stock'), {
            qty: -it.qty,
            sku: it.sku,
            narration: `Retail Sale: ${clientName} (${it.sku}) [${orderId}]`,
            type: 'dispatch',
            date: serverTimestamp(),
            createdAt: serverTimestamp(),
          })
        }
      }

      // 5. Create invoice record in payments
      await addDoc(collection(db, 'payments'), {
        amount: saleTotalAmount,
        clientId: clientDocId || '',
        clientName,
        orderId,
        type: 'invoice',
        createdAt: serverTimestamp(),
      })

      // 6. Handle Payment Mode & Outstanding
      const isPaid = sale.paymentMode === 'cash' || sale.paymentMode === 'online'
      if (isPaid) {
        await addDoc(collection(db, 'payments'), {
          amount: saleTotalAmount,
          clientId: clientDocId || '',
          clientName,
          orderId,
          type: 'payment',
          paymentMode: sale.paymentMode,
          narration: `Payment received (${String(sale.paymentMode).toUpperCase()}) for ${orderId}`,
          createdAt: serverTimestamp(),
        })
      } else {
        if (clientDocId && saleTotalAmount > 0) {
          await updateDoc(doc(db, 'customers', clientDocId), {
            outstanding: increment(saleTotalAmount),
          })
          if (client) {
            client.outstanding = (Number(client.outstanding) || 0) + saleTotalAmount
          }
        }
      }
    }

    // 7. Update STOCK_SUMMARY_DOC
    if (totalStockDeducted > 0) {
      const summaryPayload = { totalQty: increment(-totalStockDeducted) }
      Object.entries(skuDeltas).forEach(([skuLabel, delta]) => {
        summaryPayload[`bySku.${skuLabel}`] = increment(-delta)
      })
      await setDoc(STOCK_SUMMARY_DOC, summaryPayload, { merge: true })

      set((state) => {
        const nextSummary = { ...state.stockSummary }
        Object.entries(skuDeltas).forEach(([skuLabel, delta]) => {
          nextSummary[skuLabel] = (Number(nextSummary[skuLabel]) || 0) - delta
        })
        return {
          stockTotal: (Number(state.stockTotal) || 0) - totalStockDeducted,
          stockSummary: nextSummary,
          clients: currentClients,
        }
      })
    }

    return {
      orderCount: createdOrders.length,
      totalStockDeducted,
      orders: createdOrders,
    }
  },

  addPayment: async (data) => {
    await addDoc(collection(db, 'payments'), {
      ...data,
      createdAt: serverTimestamp(),
    })

    if (data.clientId) {
      const amount = Number(data.amount) || 0
      if (amount > 0) {
        await updateDoc(doc(db, 'customers', data.clientId), {
          outstanding: increment(-amount),
        })
      }
    }
  },

  deletePayment: async (paymentId) => {
    const paymentRef = doc(db, 'payments', paymentId)
    const paymentSnap = await getDoc(paymentRef)
    if (!paymentSnap.exists()) return

    const payment = paymentSnap.data()
    const amount = Number(payment.amount) || 0

    let outstandingDelta = -amount
    if (payment.type === 'invoice') {
      outstandingDelta = amount
    } else if (payment.type === 'reversal') {
      outstandingDelta = amount
    }

    if (payment.clientId && outstandingDelta !== 0) {
      await updateDoc(doc(db, 'customers', payment.clientId), {
        outstanding: increment(-outstandingDelta),
      })
    }

    await deleteDoc(paymentRef)
  },

  fetchClients: () => {
    const q = query(collection(db, 'customers'), orderBy('name'), limit(200))
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map((doc) => {
        const raw = doc.data()
        return {
          id: doc.id,
          ...raw,
          name: raw.name || 'Unnamed',
          outstanding: raw.outstanding || 0,
          rate: Number(raw.rate) || 0,
          location: String(
            raw.location ||
              raw.googleLocation ||
              raw.locationName ||
              raw.mapLink ||
              raw.googleMap ||
              '',
          ).trim(),
          mapLink: String(raw.mapLink || raw.googleMap || '').trim(),
          locationLat: Number.isFinite(Number(raw.locationLat ?? raw.lat))
            ? Number(raw.locationLat ?? raw.lat)
            : null,
          locationLng: Number.isFinite(Number(raw.locationLng ?? raw.lng))
            ? Number(raw.locationLng ?? raw.lng)
            : null,
        }
      })
      set({ clients })
    })
  },

  generateLegacyClientIds: async () => {
    const customersSnapshot = await getDocs(query(collection(db, 'customers')))
    const updates = customersSnapshot.docs
      .filter((customerDoc) => {
        const shortId = customerDoc.data()?.shortId
        return !shortId || String(shortId).trim() === ''
      })
      .map((customerDoc) =>
        updateDoc(doc(db, 'customers', customerDoc.id), {
          shortId: buildClientShortId(customerDoc.id),
        }),
      )

    await Promise.all(updates)
    return updates.length
  },

  fetchOrders: () => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(q, (snapshot) => {
      const normalize = (raw) => {
        const hasLegacyProducedDelivered = raw.produced !== undefined || raw.delivered !== undefined
        const hasDirectQty =
          raw.qty !== undefined || raw.boxes !== undefined || raw.quantity !== undefined
        let baseQty = Number(raw.qty || raw.boxes || raw.quantity) || 0

        if (hasLegacyProducedDelivered && !hasDirectQty) {
          baseQty = (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
        }

        const rawItems = Array.isArray(raw.items) && raw.items.length > 0 ? raw.items : null
        let items = []
        if (rawItems) {
          items = rawItems.map((it) => {
            const itQty = Number(it.qty) || 0
            const itRate = Number(it.rate) || 0
            const itSku = it.sku || DEFAULT_SKU
            const itMeta = getSkuMeta(itSku)
            return {
              sku: itSku,
              qty: itQty,
              rate: itRate,
              amount: itQty * itRate,
              unit: it.unit || itMeta.unit,
            }
          })
        } else {
          const primarySku = raw.sku || raw.product || DEFAULT_SKU
          const itMeta = getSkuMeta(primarySku)
          const itRate = Number(raw.rate) || 0
          items = [
            {
              sku: primarySku,
              qty: baseQty,
              rate: itRate,
              amount: baseQty * itRate,
              unit: itMeta.unit,
            },
          ]
        }

        const totalQty = items.reduce((sum, it) => sum + it.qty, 0)
        const totalAmount =
          raw.totalAmount !== undefined
            ? Number(raw.totalAmount)
            : items.reduce((sum, it) => sum + it.amount, 0)

        const skuSummary =
          items.length === 1
            ? items[0].sku
            : items.map((it) => `${it.qty}× ${it.sku}`).join(', ')

        return {
          ...raw,
          items,
          totalQty,
          totalAmount,
          qty: totalQty,
          sku: raw.sku || skuSummary,
          rate:
            Number(raw.rate) ||
            (totalQty > 0 ? Math.round((totalAmount / totalQty) * 100) / 100 : 0),
          date: raw.date || raw.deliveryDate || raw.orderDate || '',
          time: raw.time || raw.deliveryTime || '',
          clientId: raw.clientId || raw.customerId || '',
          address: raw.address || raw.deliveryAddress || raw.location || '',
          location:
            raw.location ||
            raw.googleLocation ||
            raw.locationName ||
            raw.mapLink ||
            raw.googleMap ||
            '',
          mapLink: raw.mapLink || raw.googleMap || '',
          locationLat: Number.isFinite(Number(raw.locationLat ?? raw.lat))
            ? Number(raw.locationLat ?? raw.lat)
            : null,
          locationLng: Number.isFinite(Number(raw.locationLng ?? raw.lng))
            ? Number(raw.locationLng ?? raw.lng)
            : null,
        }
      }

      const getTime = (o) => {
        const ts = o.createdAt
        if (ts?.toMillis) return ts.toMillis()
        if (ts?.seconds) return ts.seconds * 1000
        const d = o.date || o.orderDate || o.deliveryDate || ''
        return d ? new Date(d).getTime() : 0
      }

      const docs = snapshot.docs
        .map((doc) => normalize({ id: doc.id, ...doc.data() }))
        .sort((a, b) => getTime(b) - getTime(a))

      set({ orders: docs })
    })
  },

  updateOrder: async (id, data) => {
    const normalizedData = normalizeOrderWriteData(data)
    const orderRef = doc(db, 'orders', id)
    const localExisting = get().orders.find((o) => o.id === id)
    const orderSnap = await getDoc(orderRef)
    const remoteExisting = orderSnap.exists() ? { id, ...orderSnap.data() } : null
    const existing = localExisting || remoteExisting
    const previousStatus = remoteExisting?.status || localExisting?.status || ''
    const shouldMarkDelivered = normalizedData.status === 'Delivered'
    const alreadyPostedToStock = Boolean(
      remoteExisting?.stockPostedAt || remoteExisting?.stockEntryId,
    )
    let extraOrderPatch = {}

    if (
      existing &&
      shouldMarkDelivered &&
      (!alreadyPostedToStock || previousStatus !== 'Delivered')
    ) {
      const items = normalizedData.items || existing.items || [
        {
          sku: existing.sku || DEFAULT_SKU,
          qty:
            Number(
              normalizedData.qty ?? existing.qty ?? existing.boxes ?? existing.quantity,
            ) || 0,
          rate: Number(normalizedData.rate ?? existing.rate) || 0,
        },
      ]

      const clientName = await getOrderClientName(existing, get().clients)
      const deliveredNarration = formatOrderNarration(
        'Order Delivered',
        existing.orderId || id,
        clientName,
      )

      let totalStockDelta = 0
      let totalAmount = 0
      const stockEntryIds = []

      for (const item of items) {
        const itemQty = Number(item.qty) || 0
        const itemRate = Number(item.rate) || 0
        if (itemQty <= 0) continue

        const itemDelta = -Math.abs(itemQty)
        totalStockDelta += itemDelta
        totalAmount += itemQty * itemRate
        const itemSku = item.sku || DEFAULT_SKU

        const stockDocRef = await addDoc(collection(db, 'stock'), {
          qty: itemDelta,
          sku: itemSku,
          narration:
            items.length > 1
              ? `${deliveredNarration} (${itemSku})`
              : deliveredNarration,
          type: 'dispatch',
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
        })
        stockEntryIds.push(stockDocRef.id)
      }

      extraOrderPatch = {
        stockEntryIds,
        stockEntryId: stockEntryIds[0] || null,
        stockPostedAt: serverTimestamp(),
      }

      if (totalStockDelta !== 0) {
        const updatePayload = { totalQty: increment(totalStockDelta) }
        items.forEach((it) => {
          const itQty = Number(it.qty) || 0
          if (itQty > 0) {
            const meta = getSkuMeta(it.sku || DEFAULT_SKU)
            const skuLabel = meta?.label || DEFAULT_SKU
            updatePayload[`bySku.${skuLabel}`] = increment(-itQty)
          }
        })
        await setDoc(STOCK_SUMMARY_DOC, updatePayload, { merge: true })
        set((state) => {
          const nextSummary = { ...state.stockSummary }
          items.forEach((it) => {
            const itQty = Number(it.qty) || 0
            if (itQty > 0) {
              const meta = getSkuMeta(it.sku || DEFAULT_SKU)
              const skuLabel = meta?.label || DEFAULT_SKU
              nextSummary[skuLabel] = (Number(nextSummary[skuLabel]) || 0) - itQty
            }
          })
          return {
            stockTotal: (Number(state.stockTotal) || 0) + totalStockDelta,
            stockSummary: nextSummary,
          }
        })
      }

      // 2. Create invoice transaction in payments
      if (existing.clientId && totalAmount > 0) {
        await addDoc(collection(db, 'payments'), {
          clientId: existing.clientId,
          amount: totalAmount,
          type: 'invoice',
          method: 'SYSTEM',
          narration: deliveredNarration,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          orderId: existing.orderId || id,
        })
        // 3. Increase customer outstanding atomically
        await updateDoc(doc(db, 'customers', existing.clientId), {
          outstanding: increment(totalAmount),
        })
      }
    }
    await updateDoc(orderRef, {
      ...normalizedData,
      ...getLegacyLocationCleanupPatch(),
      ...extraOrderPatch,
    })
  },

  deleteOrder: async (id) => {
    try {
      const orderDocRef = doc(db, 'orders', id)
      const orderSnap = await getDoc(orderDocRef)
      if (orderSnap.exists()) {
        const existing = orderSnap.data()
        if (existing.status === 'Delivered') {
          const items = existing.items || [
            {
              sku: existing.sku || DEFAULT_SKU,
              qty: Math.abs(Number(existing.qty || 0)),
              rate: Number(existing.rate || 0),
            },
          ]
          const clientName = await getOrderClientName(existing, get().clients)
          const reversalNarration = formatOrderNarration(
            'Order Deleted (Reversal)',
            existing.orderId || id,
            clientName,
          )

          let totalReversalQty = 0
          let totalReversalAmount = 0

          for (const it of items) {
            const itQty = Math.abs(Number(it.qty || 0))
            const itRate = Number(it.rate) || 0
            if (itQty <= 0) continue

            totalReversalQty += itQty
            totalReversalAmount += itQty * itRate
            const itSku = it.sku || DEFAULT_SKU

            await addDoc(collection(db, 'stock'), {
              qty: itQty,
              sku: itSku,
              narration:
                items.length > 1
                  ? `${reversalNarration} (${itSku})`
                  : reversalNarration,
              type: 'reversal',
              date: serverTimestamp(),
              createdAt: serverTimestamp(),
            })
          }

          if (totalReversalQty > 0) {
            const updatePayload = { totalQty: increment(totalReversalQty) }
            items.forEach((it) => {
              const itQty = Math.abs(Number(it.qty || 0))
              if (itQty > 0) {
                const meta = getSkuMeta(it.sku || DEFAULT_SKU)
                const skuLabel = meta?.label || DEFAULT_SKU
                updatePayload[`bySku.${skuLabel}`] = increment(itQty)
              }
            })
            await setDoc(STOCK_SUMMARY_DOC, updatePayload, { merge: true })
            set((state) => {
              const nextSummary = { ...state.stockSummary }
              items.forEach((it) => {
                const itQty = Math.abs(Number(it.qty || 0))
                if (itQty > 0) {
                  const meta = getSkuMeta(it.sku || DEFAULT_SKU)
                  const skuLabel = meta?.label || DEFAULT_SKU
                  nextSummary[skuLabel] = (Number(nextSummary[skuLabel]) || 0) + itQty
                }
              })
              return {
                stockTotal: (Number(state.stockTotal) || 0) + totalReversalQty,
                stockSummary: nextSummary,
              }
            })
          }

          const reversalClientId = existing.clientId || existing.customerId || ''
          if (reversalClientId && totalReversalAmount > 0) {
            await addDoc(collection(db, 'payments'), {
              clientId: reversalClientId,
              amount: -totalReversalAmount,
              type: 'reversal',
              method: 'SYSTEM',
              narration: reversalNarration,
              date: new Date(),
              createdAt: serverTimestamp(),
            })
            await updateDoc(doc(db, 'customers', reversalClientId), {
              outstanding: increment(-totalReversalAmount),
            })
          }
        }
      }
      await deleteDoc(orderDocRef)
    } catch (err) {
      console.error('Delete failed:', err)
      throw err
    }
  },
}))
