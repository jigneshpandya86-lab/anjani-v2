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
  getDocFromCache,
  limit,
  increment,
  setDoc,
  getDocs,
  deleteField,
  Timestamp,
  startAfter,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { DEFAULT_SKU, getSkuMeta } from '../constants/skus'
import { consolidateRetailSales } from '../utils/salesBatchUtils'
import { DEFAULT_ACCOUNTS, getAccountMeta } from '../constants/accounts'
import {
  normalizeOrderWriteData,
  normalizeOrderDoc,
  getOrderSortTime,
  formatPaymentNarration,
} from '../utils/orderUtils'

export { normalizeOrderWriteData, normalizeOrderDoc, getOrderSortTime }
import { ensureEnglishText, normalizeDigits } from '../utils/textUtils'

let stockUnsubscribe = null
let stockSubscriberCount = 0
let leadsUnsubscribe = null
let leadsSubscriberCount = 0
let accountsUnsubscribe = null
let accountsSubscriberCount = 0
const STOCK_SUMMARY_DOC = doc(db, 'meta', 'stockSummary')
const ACCOUNTS_SUMMARY_DOC = doc(db, 'meta', 'accountsSummary')
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

const getLegacyLocationCleanupPatch = () => ({
  googleMap: deleteField(),
  googleLocation: deleteField(),
  locationName: deleteField(),
})

export const useClientStore = create((set, get) => ({
  userRole: null,
  clients: [],
  orders: [],
  hasMoreOrders: true,
  loadingOlderOrders: false,
  _lastOrderDoc: null,
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
  accountsList: DEFAULT_ACCOUNTS,
  accountsSummary: {
    nilesh: 0,
    hiteshbhai: 0,
    counter: 0,
    bank: 0,
  },
  accountsLoading: false,

  fetchUserRole: async (uid) => {
    if (!uid) {
      set({ userRole: null })
      return
    }

    // 1. Fast path: check localStorage cache
    try {
      const cached = window.localStorage.getItem(`anjani_user_role_${uid}`)
      if (cached) {
        set({ userRole: cached })
      }
    } catch (_e) {
      // Ignore localStorage read errors
    }

    const userRef = doc(db, 'users', uid)

    // 2. Fast path: check local Firestore IndexedDB cache
    try {
      const cachedDoc = await getDocFromCache(userRef)
      if (cachedDoc.exists()) {
        const role = cachedDoc.data().role || 'staff'
        set({ userRole: role })
        try {
          window.localStorage.setItem(`anjani_user_role_${uid}`, role)
        } catch (_storageErr) {
          // Ignore localStorage write errors
        }
      }
    } catch (_cacheErr) {
      // Document not yet in IndexedDB cache, will fetch from server
    }

    // 3. Server sync with a fast 2.5s timeout (never block for 1-2 minutes)
    try {
      const fetchPromise = getDoc(userRef)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('fetchUserRole timeout')), 2500),
      )
      const userDoc = await Promise.race([fetchPromise, timeoutPromise])
      if (userDoc.exists()) {
        const role = userDoc.data().role || 'staff'
        set({ userRole: role })
        try {
          window.localStorage.setItem(`anjani_user_role_${uid}`, role)
        } catch (_storageErr) {
          // Ignore localStorage write errors
        }
      } else {
        const currentRole = get().userRole
        if (!currentRole) set({ userRole: 'staff' })
      }
    } catch (_err) {
      const currentRole = get().userRole
      if (!currentRole) {
        set({ userRole: 'staff' })
      }
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

  fetchAccountsSummary: () => {
    accountsSubscriberCount += 1
    if (!accountsUnsubscribe) {
      set({ accountsLoading: true })
      accountsUnsubscribe = onSnapshot(
        ACCOUNTS_SUMMARY_DOC,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() || {}
            const rawBalances = data.balances || data || {}
            const balances = {
              nilesh: Number(rawBalances.nilesh) || 0,
              hiteshbhai: Number(rawBalances.hiteshbhai) || 0,
              counter: Number(rawBalances.counter) || 0,
              bank: Number(rawBalances.bank) || 0,
            }
            set({ accountsSummary: balances, accountsLoading: false })
          } else {
            const initialBalances = { nilesh: 0, hiteshbhai: 0, counter: 0, bank: 0 }
            setDoc(
              ACCOUNTS_SUMMARY_DOC,
              { balances: initialBalances, updatedAt: serverTimestamp() },
              { merge: true },
            ).catch((err) => {
              console.error('Failed to init accounts summary doc:', err)
            })
            set({ accountsSummary: initialBalances, accountsLoading: false })
          }
        },
        (error) => {
          console.error('Error fetching accounts summary:', error)
          set({ accountsLoading: false })
        },
      )
    }

    return () => {
      accountsSubscriberCount = Math.max(0, accountsSubscriberCount - 1)
      if (accountsSubscriberCount === 0 && accountsUnsubscribe) {
        accountsUnsubscribe()
        accountsUnsubscribe = null
      }
    }
  },

  recordAccountTransfer: async ({ fromAccountId, toAccountId, amount, notes, date }) => {
    const numAmount = Number(amount)
    if (!fromAccountId || !toAccountId) {
      throw new Error('Both Source and Destination accounts are required')
    }
    if (fromAccountId === toAccountId) {
      throw new Error('Source and destination accounts must be different')
    }
    if (!numAmount || numAmount <= 0) {
      throw new Error('Please enter a valid transfer amount')
    }

    const transferDate = date ? new Date(date) : new Date()

    const transferPayload = {
      fromAccountId,
      toAccountId,
      amount: numAmount,
      notes: notes ? notes.trim() : '',
      date: Timestamp.fromDate(transferDate),
      createdAt: serverTimestamp(),
    }
    await addDoc(collection(db, 'account_transfers'), transferPayload)

    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [fromAccountId]: increment(-numAmount),
          [toAccountId]: increment(numAmount),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    return transferPayload
  },

  recordExpenseAccountDebit: async (accountId, amount) => {
    const numAmount = Number(amount)
    if (!accountId || !numAmount || numAmount <= 0) return
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [accountId]: increment(-numAmount),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  },

  recordExpenseAccountCredit: async (accountId, amount) => {
    const numAmount = Number(amount)
    if (!accountId || !numAmount || numAmount <= 0) return
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [accountId]: increment(numAmount),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  },

  updateAccountBalanceDirect: async (accountId, newBalance) => {
    const num = Number(newBalance) || 0
    await setDoc(
      ACCOUNTS_SUMMARY_DOC,
      {
        balances: {
          [accountId]: num,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  },

  deleteAccountTransfer: async (transferId) => {
    const ref = doc(db, 'account_transfers', transferId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return

    const data = snap.data()
    const amount = Number(data.amount) || 0
    const fromAcc = data.fromAccountId
    const toAcc = data.toAccountId

    if (amount > 0 && fromAcc && toAcc) {
      await setDoc(
        ACCOUNTS_SUMMARY_DOC,
        {
          balances: {
            [fromAcc]: increment(amount),
            [toAcc]: increment(-amount),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    await deleteDoc(ref)
  },

  updateAccountTransfer: async (
    transferId,
    { fromAccountId, toAccountId, amount, notes, date },
  ) => {
    const ref = doc(db, 'account_transfers', transferId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Transfer record not found')

    const oldData = snap.data()
    const oldAmount = Number(oldData.amount) || 0
    const oldFrom = oldData.fromAccountId
    const oldTo = oldData.toAccountId

    const newAmount = Number(amount)
    const newFrom = fromAccountId || oldFrom
    const newTo = toAccountId || oldTo

    if (!newAmount || newAmount <= 0) throw new Error('Invalid transfer amount')
    if (newFrom === newTo) throw new Error('Source and destination accounts must be different')

    const deltas = {}
    if (oldFrom) deltas[oldFrom] = (deltas[oldFrom] || 0) + oldAmount
    if (oldTo) deltas[oldTo] = (deltas[oldTo] || 0) - oldAmount
    deltas[newFrom] = (deltas[newFrom] || 0) - newAmount
    deltas[newTo] = (deltas[newTo] || 0) + newAmount

    const firestoreIncrements = {}
    for (const [acc, delta] of Object.entries(deltas)) {
      if (delta !== 0) {
        firestoreIncrements[acc] = increment(delta)
      }
    }

    if (Object.keys(firestoreIncrements).length > 0) {
      await setDoc(
        ACCOUNTS_SUMMARY_DOC,
        {
          balances: firestoreIncrements,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    const payload = {
      fromAccountId: newFrom,
      toAccountId: newTo,
      amount: newAmount,
      notes: notes ? notes.trim() : '',
      updatedAt: serverTimestamp(),
    }
    if (date) {
      payload.date = Timestamp.fromDate(new Date(date))
    }

    await updateDoc(ref, payload)
  },

  deleteAccountExpense: async (expenseId) => {
    const ref = doc(db, 'expenses', expenseId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return

    const data = snap.data()
    const amount = Number(data.amount) || 0
    const accId = data.accountId || 'counter'

    if (amount > 0 && accId) {
      await get().recordExpenseAccountCredit(accId, amount)
    }

    await deleteDoc(ref)
  },

  updateAccountExpense: async (
    expenseId,
    { accountId, amount, category, note, date },
  ) => {
    const ref = doc(db, 'expenses', expenseId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Expense record not found')

    const oldData = snap.data()
    const oldAmount = Number(oldData.amount) || 0
    const oldAcc = oldData.accountId || 'counter'

    const newAmount = Number(amount)
    const newAcc = accountId || oldAcc

    if (!newAmount || newAmount <= 0) throw new Error('Invalid expense amount')

    const deltas = {}
    deltas[oldAcc] = (deltas[oldAcc] || 0) + oldAmount
    deltas[newAcc] = (deltas[newAcc] || 0) - newAmount

    const firestoreIncrements = {}
    for (const [acc, delta] of Object.entries(deltas)) {
      if (delta !== 0) {
        firestoreIncrements[acc] = increment(delta)
      }
    }

    if (Object.keys(firestoreIncrements).length > 0) {
      await setDoc(
        ACCOUNTS_SUMMARY_DOC,
        {
          balances: firestoreIncrements,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    const payload = {
      accountId: newAcc,
      amount: newAmount,
      category: category || oldData.category || 'General',
      note: note ? note.trim() : '',
      updatedAt: serverTimestamp(),
    }
    if (date) {
      payload.date = Timestamp.fromDate(new Date(date))
    }

    await updateDoc(ref, payload)
  },

  updatePaymentAccountEntry: async (
    paymentId,
    { amount, note, date, accountId },
  ) => {
    const ref = doc(db, 'payments', paymentId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Payment record not found')

    const oldData = snap.data()
    const oldAmount = Number(oldData.amount) || 0
    const oldAcc =
      oldData.accountId ||
      (oldData.method === 'upi' || oldData.method === 'online' ? 'bank' : 'counter')

    const newAmount = Number(amount)
    const newAcc = accountId || oldAcc

    if (!newAmount || newAmount <= 0) throw new Error('Invalid payment amount')

    if (oldData.clientId && oldData.type === 'payment') {
      const diff = newAmount - oldAmount
      if (diff !== 0) {
        await updateDoc(doc(db, 'customers', oldData.clientId), {
          outstanding: increment(-diff),
        })
      }
    }

    const deltas = {}
    deltas[oldAcc] = (deltas[oldAcc] || 0) - oldAmount
    deltas[newAcc] = (deltas[newAcc] || 0) + newAmount

    const firestoreIncrements = {}
    for (const [acc, delta] of Object.entries(deltas)) {
      if (delta !== 0) firestoreIncrements[acc] = increment(delta)
    }

    if (Object.keys(firestoreIncrements).length > 0) {
      await setDoc(
        ACCOUNTS_SUMMARY_DOC,
        {
          balances: firestoreIncrements,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    const resolvedClientName =
      oldData.clientName ||
      (get().clients || []).find((c) => c.id === oldData.clientId)?.name ||
      ''
    const effectiveDate = date
      ? new Date(date)
      : oldData.date?.toDate
      ? oldData.date.toDate()
      : oldData.date
      ? new Date(oldData.date)
      : new Date()
    const autoNarration = formatPaymentNarration(resolvedClientName, effectiveDate)
    const nextNarration =
      note && note.trim() && note.trim() !== oldData.note
        ? note.trim()
        : oldData.narration || autoNarration

    const payload = {
      amount: newAmount,
      accountId: newAcc,
      clientName: resolvedClientName,
      narration: nextNarration,
      note: note ? note.trim() : oldData.note || autoNarration,
      updatedAt: serverTimestamp(),
    }
    if (date) {
      payload.date = Timestamp.fromDate(new Date(date))
    }

    await updateDoc(ref, payload)
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
    const cleanPayload = {
      name: ensureEnglishText(data.name || '').trim(),
      mobile: normalizeDigits(data.mobile || data.phone || '').replace(/\D/g, '').trim(),
      address: ensureEnglishText(data.address || '').trim(),
      rate: Number(data.rate) || 0,
      skuRates: data.skuRates || {},
      location: ensureEnglishText(data.location || data.mapLink || '').trim(),
      mapLink: String(data.mapLink || '').trim(),
      locationLat: Number.isFinite(Number(data.locationLat)) ? Number(data.locationLat) : null,
      locationLng: Number.isFinite(Number(data.locationLng)) ? Number(data.locationLng) : null,
      active: true,
      outstanding: Number(data.outstanding) || 0,
      isRegular: Boolean(data.isRegular),
      isDefaulter: Boolean(data.isDefaulter),
      createdAt: serverTimestamp(),
    }
    // Remove any undefined or invalid keys
    const sanitized = JSON.parse(JSON.stringify(cleanPayload))
    sanitized.createdAt = serverTimestamp()

    const docRef = await addDoc(collection(db, 'customers'), sanitized)
    await updateDoc(docRef, {
      shortId: buildClientShortId(docRef.id),
    })
    return docRef.id
  },

  updateClient: async (id, data) => {
    // Sanitize data to strip undefined values and keys named 'undefined'
    const sanitized = {}
    Object.entries(data || {}).forEach(([k, v]) => {
      if (v !== undefined && k !== 'undefined') {
        if (k === 'name' || k === 'address' || k === 'location' || k === 'contactPerson' || k === 'notes') {
          sanitized[k] = ensureEnglishText(v)
        } else if (k === 'mobile' || k === 'phone') {
          sanitized[k] = normalizeDigits(v).replace(/\D/g, '')
        } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toMillis !== 'function') {
          const sub = {}
          Object.entries(v).forEach(([subK, subV]) => {
            if (subV !== undefined && subK !== 'undefined') {
              sub[subK] = subV
            }
          })
          sanitized[k] = sub
        } else {
          sanitized[k] = v
        }
      }
    })
    await updateDoc(doc(db, 'customers', id), sanitized)
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
    const normalizedSalesList = consolidateRetailSales(salesList, currentClients)
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

    for (let i = 0; i < normalizedSalesList.length; i++) {
      const sale = normalizedSalesList[i]
      let rawName = String(sale.clientName || '').trim()

      // Normalize unknown / walk-in clients to "Retail" (never Customer 1, 2, 3...)
      if (!rawName || /^customer\s*\d*$/i.test(rawName) || /^walk[\s-]*in/i.test(rawName) || /^unknown/i.test(rawName)) {
        rawName = 'Retail'
      }

      // 1. Find or create client
      let client = currentClients.find(
        (c) =>
          c.name &&
          (c.name.toLowerCase() === rawName.toLowerCase() ||
            (c.mobile &&
              sale.mobile &&
              String(c.mobile).replace(/\D/g, '') === String(sale.mobile).replace(/\D/g, ''))),
      )

      let clientDocId = client?.id
      let clientName = client?.name || rawName

      // For "Retail", if not found, create a single master "Retail" client; avoid unlimited customer docs
      if (!clientDocId) {
        const isRetail = rawName.toLowerCase() === 'retail'
        if (isRetail || sale.createClient !== false) {
          const englishClientName = isRetail ? 'Retail' : ensureEnglishText(rawName)
          const englishAddress = ensureEnglishText(sale.address || '')
          const cleanMobile = normalizeDigits(sale.mobile || '').replace(/\D/g, '')

          const newDoc = await addDoc(collection(db, 'customers'), {
            name: englishClientName,
            mobile: cleanMobile,
            address: englishAddress,
            outstanding: 0,
            active: true,
            createdAt: serverTimestamp(),
          })
          clientDocId = newDoc.id
          clientName = englishClientName
          const newClientObj = {
            id: clientDocId,
            name: englishClientName,
            mobile: cleanMobile,
            address: englishAddress,
            outstanding: 0,
            active: true,
          }
          currentClients.push(newClientObj)
          client = newClientObj
        }
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

      // 3. Create order document in Confirmed state so edits can be made
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
        status: 'Confirmed',
        paymentMode: sale.paymentMode || 'credit',
        source: 'whatsapp_sales',
        date: dateStr,
        time: timeStr,
        createdAt: serverTimestamp(),
      })
      createdOrders.push({
        orderId,
        clientName,
        totalAmount: saleTotalAmount,
        totalQty: saleTotalQty,
      })
    }

    set({ clients: currentClients })

    return {
      createdOrdersCount: createdOrders.length,
      orderCount: createdOrders.length,
      totalStockDeducted: 0,
      orders: createdOrders,
    }
  },

  createBatchAccountEntries: async (entries = []) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new Error('No entries provided')
    }

    const currentClients = [...(get().clients || [])]
    let successCount = 0

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const amount = Number(entry.amount) || 0
      if (amount <= 0) continue

      const entryDate = entry.date ? new Date(entry.date) : new Date()

      if (entry.type === 'transfer') {
        const fromAccountId = entry.fromAccount || 'nilesh'
        const toAccountId = entry.toAccount || 'counter'
        if (fromAccountId !== toAccountId) {
          await get().recordAccountTransfer({
            fromAccountId,
            toAccountId,
            amount,
            notes: entry.notes || '',
            date: entryDate,
          })
          successCount++
        }
      } else if (entry.type === 'collection') {
        let client = null
        if (entry.clientName) {
          const raw = String(entry.clientName).toLowerCase().trim()
          client =
            currentClients.find((c) => c.name && c.name.toLowerCase().trim() === raw) ||
            currentClients.find((c) => c.name && c.name.toLowerCase().includes(raw))
        }

        const clientName = client?.name || entry.clientName || 'Cash Collection'
        const narration = formatPaymentNarration(clientName, entryDate)

        await get().addPayment({
          clientId: client?.id || null,
          clientName,
          amount,
          type: 'payment',
          method: entry.accountId === 'bank' ? 'upi' : 'cash',
          accountId: entry.accountId || 'counter',
          narration,
          note: entry.notes || narration,
          date: entryDate,
        })
        successCount++
      } else if (entry.type === 'expense') {
        const targetAccountId = entry.accountId || 'counter'
        const payload = {
          amount,
          category: entry.category || 'General',
          accountId: targetAccountId,
          date: Timestamp.fromDate(entryDate),
          note: entry.notes || entry.note || '',
          createdAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'expenses'), payload)
        await get().recordExpenseAccountDebit(targetAccountId, amount)
        successCount++
      }
    }

    return { successCount }
  },

  addPayment: async (data) => {
    let clientName = data.clientName
    if (!clientName && data.clientId) {
      const client = (get().clients || []).find((c) => c.id === data.clientId)
      if (client?.name) clientName = client.name
    }
    const paymentDate = data.date || new Date()
    const autoNarration = formatPaymentNarration(clientName, paymentDate)
    const narration = data.narration || autoNarration
    const note =
      data.note && String(data.note).trim() ? String(data.note).trim() : autoNarration

    const accountId =
      data.accountId ||
      (data.method === 'upi' || data.method === 'online' ? 'bank' : 'counter')

    await addDoc(collection(db, 'payments'), {
      ...data,
      clientName: clientName || '',
      narration,
      note,
      accountId,
      createdAt: serverTimestamp(),
    })

    const amount = Number(data.amount) || 0
    if (data.clientId && amount > 0) {
      await updateDoc(doc(db, 'customers', data.clientId), {
        outstanding: increment(-amount),
      })
    }

    if (amount > 0 && accountId && data.type !== 'reversal') {
      try {
        await setDoc(
          ACCOUNTS_SUMMARY_DOC,
          {
            balances: {
              [accountId]: increment(amount),
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch (err) {
        console.error('Failed to update accounts summary on payment:', err)
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

    const accountId =
      payment.accountId ||
      (payment.method === 'upi' || payment.method === 'online' ? 'bank' : 'counter')
    if (amount > 0 && accountId && payment.type === 'payment') {
      try {
        await setDoc(
          ACCOUNTS_SUMMARY_DOC,
          {
            balances: {
              [accountId]: increment(-amount),
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      } catch (err) {
        console.error('Failed to reverse account balance on delete payment:', err)
      }
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

  fetchOrders: (initialLimit = 100) => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(initialLimit))
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map((doc) => normalizeOrderDoc({ id: doc.id, ...doc.data() }))
        .sort((a, b) => getOrderSortTime(b) - getOrderSortTime(a))

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null

      set((state) => {
        const liveIds = new Set(docs.map((d) => d.id))
        const retainedOlder = (state.orders || []).filter((o) => !liveIds.has(o.id))
        const merged = [...docs, ...retainedOlder].sort((a, b) => getOrderSortTime(b) - getOrderSortTime(a))

        return {
          orders: merged,
          hasMoreOrders: snapshot.docs.length === initialLimit,
          _lastOrderDoc: lastDoc,
        }
      })
    })
  },

  loadOlderOrders: async (batchSize = 50) => {
    const { _lastOrderDoc, orders, loadingOlderOrders, hasMoreOrders } = get()
    if (loadingOlderOrders || !hasMoreOrders) return

    set({ loadingOlderOrders: true })
    try {
      let q
      if (_lastOrderDoc) {
        q = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc'),
          startAfter(_lastOrderDoc),
          limit(batchSize),
        )
      } else {
        const oldest = orders[orders.length - 1]
        if (!oldest?.createdAt) {
          set({ loadingOlderOrders: false, hasMoreOrders: false })
          return
        }
        q = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc'),
          startAfter(oldest.createdAt),
          limit(batchSize),
        )
      }

      const snapshot = await getDocs(q)
      if (snapshot.empty) {
        set({ hasMoreOrders: false, loadingOlderOrders: false })
        return
      }

      const newDocs = snapshot.docs.map((d) => normalizeOrderDoc({ id: d.id, ...d.data() }))
      const lastDoc = snapshot.docs[snapshot.docs.length - 1]

      set((state) => {
        const existingIds = new Set(state.orders.map((o) => o.id))
        const freshOlder = newDocs.filter((o) => !existingIds.has(o.id))
        const combined = [...state.orders, ...freshOlder].sort(
          (a, b) => getOrderSortTime(b) - getOrderSortTime(a),
        )

        return {
          orders: combined,
          hasMoreOrders: snapshot.docs.length === batchSize,
          _lastOrderDoc: lastDoc,
          loadingOlderOrders: false,
        }
      })
    } catch (err) {
      console.error('Failed to load older orders:', err)
      set({ loadingOlderOrders: false })
      throw err
    }
  },

  loadAllPastOrders: async () => {
    const { loadingOlderOrders, hasMoreOrders } = get()
    if (loadingOlderOrders || !hasMoreOrders) return

    set({ loadingOlderOrders: true })
    try {
      let keepGoing = true
      let rounds = 0
      while (keepGoing && rounds < 25) {
        rounds++
        const { _lastOrderDoc } = get()
        if (!_lastOrderDoc) break

        const q = query(
          collection(db, 'orders'),
          orderBy('createdAt', 'desc'),
          startAfter(_lastOrderDoc),
          limit(100),
        )
        const snapshot = await getDocs(q)
        if (snapshot.empty) {
          set({ hasMoreOrders: false })
          break
        }

        const newDocs = snapshot.docs.map((d) => normalizeOrderDoc({ id: d.id, ...d.data() }))
        const lastDoc = snapshot.docs[snapshot.docs.length - 1]

        set((state) => {
          const existingIds = new Set(state.orders.map((o) => o.id))
          const freshOlder = newDocs.filter((o) => !existingIds.has(o.id))
          return {
            orders: [...state.orders, ...freshOlder].sort(
              (a, b) => getOrderSortTime(b) - getOrderSortTime(a),
            ),
            hasMoreOrders: snapshot.docs.length === 100,
            _lastOrderDoc: lastDoc,
          }
        })

        if (snapshot.docs.length < 100) {
          keepGoing = false
          set({ hasMoreOrders: false })
        }
      }
    } catch (err) {
      console.error('Failed to load all past orders:', err)
      throw err
    } finally {
      set({ loadingOlderOrders: false })
    }
  },

  updateOrder: async (id, data) => {
    const normalizedData = normalizeOrderWriteData(data, true)
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
