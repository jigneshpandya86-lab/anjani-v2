import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc, limit, increment, setDoc, getDocs
} from 'firebase/firestore';
import { db } from '../firebase-config';

let stockUnsubscribe = null;
let stockSubscriberCount = 0;
const STOCK_SUMMARY_DOC = doc(db, 'meta', 'stockSummary');
const RECENT_STOCK_ENTRIES_LIMIT = 50;

const getOrderClientName = async (order, clients = []) => {
  const normalizeName = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim();
  };

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
    .find(Boolean);

  if (fromOrder) return fromOrder;

  const rawClientId =
    order?.clientId ||
    order?.customerId ||
    order?.client?.id ||
    order?.customer?.id ||
    order?.client_id ||
    order?.customer_id;

  const clientId = rawClientId ? String(rawClientId).trim() : '';
  if (!clientId) return '';

  const fromStore = clients.find((client) => String(client.id).trim() === clientId)?.name;
  if (fromStore) return normalizeName(fromStore);

  const customerSnap = await getDoc(doc(db, 'customers', clientId));
  return customerSnap.exists() ? normalizeName(customerSnap.data()?.name) : '';
};

const formatOrderNarration = (prefix, orderRef, clientName) => {
  return clientName
    ? `${prefix}: ${orderRef} • ${clientName}`
    : `${prefix}: ${orderRef}`;
};

const buildClientShortId = (clientDocId) => {
  const safeId = String(clientDocId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `CLT-${safeId.slice(0, 6).padEnd(6, '0')}`;
};

const normalizeOrderWriteData = (data = {}) => ({
  ...data,
  address: data.address === undefined ? '' : String(data.address).trim(),
  location: data.location === undefined ? '' : String(data.location).trim(),
});

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  stockEntries: [], 
  stockTotal: 0,
  loading: false,

  fetchStock: () => {
    stockSubscriberCount += 1;

    if (!stockUnsubscribe) {
      const q = query(collection(db, 'stock'), orderBy('createdAt', 'desc'), limit(100));
      stockUnsubscribe = onSnapshot(q, (snapshot) => {
        const getTime = (value) => {
          if (!value) return 0;
          if (value?.toMillis) return value.toMillis();
          if (value?.seconds) return value.seconds * 1000;
          if (value instanceof Date) return value.getTime();
          if (typeof value === 'string') {
            const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
            if (ddmmyyyy) {
              const [, dd, mm, yyyy] = ddmmyyyy;
              return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
            }
            return new Date(value).getTime();
          }
          return 0;
        };

        const normalize = (raw) => {
          const hasLegacyProducedDelivered =
            raw.produced !== undefined || raw.delivered !== undefined;
          const hasDirectQty =
            raw.qty !== undefined || raw.boxes !== undefined || raw.quantity !== undefined;

          // Legacy rows from previous system may only store produced/delivered.
          if (hasLegacyProducedDelivered && !hasDirectQty) {
            const producedCount = Number(raw.produced) || 0;
            const deliveredCount = Number(raw.delivered) || 0;
            const title = raw.customer || raw.clientName || 'Legacy Entry';
            const netQty = producedCount - deliveredCount;
            return {
              ...raw,
              narration:
                raw.narration ||
                `${title} - Produced ${producedCount} Delivered ${deliveredCount}`,
              produced: producedCount,
              delivered: deliveredCount,
              qty: netQty,
              type: 'old_job',
              date: raw.date, // Keep as-is (string)
            };
          }
          // New inventory entry - normalize fields
          return {
            ...raw,
            narration: raw.narration || raw.note || '',
            qty: Number(raw.qty || raw.boxes || raw.quantity) || 0,
            rate: Number(raw.rate) || 0,
            date: raw.date || raw.createdAt,
            type: raw.type || 'entry',
          };
        };
        const stockEntries = snapshot.docs
          .map(doc => normalize({ id: doc.id, ...doc.data() }))
          .sort((a, b) => {
            const primaryDiff = getTime(b.date) - getTime(a.date);
            if (primaryDiff !== 0) return primaryDiff;

            return getTime(b.createdAt) - getTime(a.createdAt);
          })
          .slice(0, RECENT_STOCK_ENTRIES_LIMIT);
        set({ stockEntries });
      });
    }

    return () => {
      stockSubscriberCount = Math.max(0, stockSubscriberCount - 1);
      if (stockSubscriberCount === 0 && stockUnsubscribe) {
        stockUnsubscribe();
        stockUnsubscribe = null;
      }
    };
  },

  fetchStockTotal: () => {
    return onSnapshot(STOCK_SUMMARY_DOC, async (summarySnap) => {
      if (summarySnap.exists()) {
        set({ stockTotal: Number(summarySnap.data()?.totalQty) || 0 });
        return;
      }

      // One-time backfill for existing deployments where summary doc does not exist yet.
      const fullSnap = await getDocs(query(collection(db, 'stock')));
      const computedTotal = fullSnap.docs.reduce((acc, d) => {
        const raw = d.data();
        const hasLegacyProducedDelivered =
          raw.produced !== undefined || raw.delivered !== undefined;
        if (hasLegacyProducedDelivered && raw.qty === undefined) {
          return acc + ((Number(raw.produced) || 0) - (Number(raw.delivered) || 0));
        }
        return acc + (Number(raw.qty || raw.boxes || raw.quantity) || 0);
      }, 0);

      await setDoc(STOCK_SUMMARY_DOC, { totalQty: computedTotal }, { merge: true });
      set({ stockTotal: computedTotal });
    });
  },

  addStockManual: async (qty, narration) => {
    const parsedQty = Number(qty) || 0;
    await addDoc(collection(db, 'stock'), {
      qty: parsedQty,
      narration: narration || 'Manual Addition',
      type: 'addition',
      date: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(parsedQty) }, { merge: true });
  },

  deleteStockEntry: async (id) => {
    const stockRef = doc(db, 'stock', id);
    const stockSnap = await getDoc(stockRef);
    if (!stockSnap.exists()) return;

    const raw = stockSnap.data();
    const hasLegacyProducedDelivered =
      raw.produced !== undefined || raw.delivered !== undefined;
    const qtyDelta = hasLegacyProducedDelivered && raw.qty === undefined
      ? (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
      : Number(raw.qty || raw.boxes || raw.quantity) || 0;

    await deleteDoc(stockRef);
    await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(-qtyDelta) }, { merge: true });
  },

  addClient: async (data) => {
    const docRef = await addDoc(collection(db, 'customers'), {
      name: data.name,
      mobile: data.phone,
      address: data.address,
      rate: Number(data.rate) || 0,
      active: true,
      outstanding: 0,
      createdAt: serverTimestamp()
    });
    await updateDoc(docRef, {
      shortId: buildClientShortId(docRef.id)
    });
  },

  updateClient: async (id, data) => {
    await updateDoc(doc(db, 'customers', id), data);
  },

  addOrder: async (data) => {
    const normalizedData = normalizeOrderWriteData(data);
    const orderId = `ORD-${Date.now()}`;
    const selectedClient = get().clients.find((client) => client.id === normalizedData.clientId);
    await addDoc(collection(db, 'orders'), {
      ...normalizedData,
      orderId,
      clientName: selectedClient?.name || normalizedData.clientName || '',
      qty: Number(normalizedData.qty),
      rate: Number(normalizedData.rate),
      status: 'Pending',
      createdAt: serverTimestamp()
    });
  },

  addPayment: async (data) => {
    await addDoc(collection(db, 'payments'), {
      ...data,
      createdAt: serverTimestamp()
    });

    if (data.clientId) {
      const amount = Number(data.amount) || 0;
      if (amount > 0) {
        await updateDoc(doc(db, 'customers', data.clientId), {
          outstanding: increment(-amount)
        });
      }
    }
  },

  deletePayment: async (paymentId) => {
    const paymentRef = doc(db, 'payments', paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) return;

    const payment = paymentSnap.data();
    const amount = Number(payment.amount) || 0;

    let outstandingDelta = -amount;
    if (payment.type === 'invoice') {
      outstandingDelta = amount;
    } else if (payment.type === 'reversal') {
      outstandingDelta = amount;
    }

    if (payment.clientId && outstandingDelta !== 0) {
      await updateDoc(doc(db, 'customers', payment.clientId), {
        outstanding: increment(-outstandingDelta)
      });
    }

    await deleteDoc(paymentRef);
  },

  fetchClients: () => {
    const q = query(collection(db, 'customers'), orderBy('name'), limit(200));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ 
        id: doc.id, ...doc.data(),
        name: doc.data().name || 'Unnamed',
        outstanding: doc.data().outstanding || 0,
        rate: Number(doc.data().rate) || 0
      }));
      set({ clients });
    });
  },

  generateLegacyClientIds: async () => {
    const customersSnapshot = await getDocs(query(collection(db, 'customers')));
    const updates = customersSnapshot.docs
      .filter((customerDoc) => {
        const shortId = customerDoc.data()?.shortId;
        return !shortId || String(shortId).trim() === '';
      })
      .map((customerDoc) =>
        updateDoc(doc(db, 'customers', customerDoc.id), {
          shortId: buildClientShortId(customerDoc.id)
        })
      );

    await Promise.all(updates);
    return updates.length;
  },

  fetchOrders: () => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
      const normalize = (raw) => ({
        ...raw,
        qty:      Number(raw.qty || raw.boxes || raw.quantity) || 0,
        rate:     Number(raw.rate) || 0,
        date:     raw.date || raw.deliveryDate || raw.orderDate || '',
        time:     raw.time || raw.deliveryTime || '',
        clientId: raw.clientId || raw.customerId || '',
        address:  raw.address || raw.deliveryAddress || raw.location || '',
        location: raw.location || raw.googleLocation || raw.locationName || raw.mapLink || raw.googleMap || '',
      });

      const getTime = (o) => {
        const ts = o.createdAt;
        if (ts?.toMillis) return ts.toMillis();
        if (ts?.seconds) return ts.seconds * 1000;
        const d = o.date || o.orderDate || o.deliveryDate || '';
        return d ? new Date(d).getTime() : 0;
      };

      const docs = snapshot.docs
        .map(doc => normalize({ id: doc.id, ...doc.data() }))
        .sort((a, b) => getTime(b) - getTime(a));

      set({ orders: docs });
    });
  },

  updateOrder: async (id, data) => {
    const normalizedData = normalizeOrderWriteData(data);
    const orderRef = doc(db, 'orders', id);
    const localExisting = get().orders.find((o) => o.id === id);
    const orderSnap = await getDoc(orderRef);
    const remoteExisting = orderSnap.exists() ? { id, ...orderSnap.data() } : null;
    const existing = localExisting || remoteExisting;
    const previousStatus = remoteExisting?.status || localExisting?.status || '';
    const shouldMarkDelivered = normalizedData.status === 'Delivered';
    const alreadyPostedToStock = Boolean(
      remoteExisting?.stockPostedAt ||
      remoteExisting?.stockEntryId
    );
    let extraOrderPatch = {};

    if (
      existing &&
      shouldMarkDelivered &&
      (!alreadyPostedToStock || previousStatus !== 'Delivered')
    ) {
      const qty = Number(existing.qty || existing.boxes || existing.quantity) || 0;
      const rate = Number(existing.rate) || 0;
      const stockDelta = -Math.abs(qty);
      const clientName = await getOrderClientName(existing, get().clients);
      const deliveredNarration = formatOrderNarration('Order Delivered', existing.orderId || id, clientName);

      // 1. Debit stock
      const stockDocRef = await addDoc(collection(db, 'stock'), {
        qty: stockDelta,
        narration: deliveredNarration,
        type: 'dispatch',
        date: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      extraOrderPatch = {
        stockEntryId: stockDocRef.id,
        stockPostedAt: serverTimestamp(),
      };
      await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(stockDelta) }, { merge: true });

      // Keep stock total responsive; movement list should come from persisted snapshot
      // so we don't show temporary in-memory rows that later disappear on sync failure.
      set((state) => ({
        stockTotal: (Number(state.stockTotal) || 0) + stockDelta,
      }));

      // 2. Create invoice transaction in payments
      const amount = Math.abs(qty) * rate;
      if (existing.clientId && amount > 0) {
        await addDoc(collection(db, 'payments'), {
          clientId: existing.clientId,
          amount,
          type: 'invoice',
          method: 'SYSTEM',
          narration: deliveredNarration,
          date: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        // 3. Increase customer outstanding atomically
        await updateDoc(doc(db, 'customers', existing.clientId), {
          outstanding: increment(amount)
        });
      }
    }
    await updateDoc(orderRef, {
      ...normalizedData,
      ...extraOrderPatch,
    });
  },

  deleteOrder: async (id) => {
    try {
      const orderDocRef = doc(db, 'orders', id);
      const orderSnap = await getDoc(orderDocRef);
      if (orderSnap.exists()) {
        const existing = orderSnap.data();
        if (existing.status === 'Delivered') {
          const qty = Math.abs(Number(existing.qty || 0));
          const rate = Number(existing.rate || 0);
          const amount = qty * rate;
          const reversalClientId = existing.clientId || existing.customerId || '';
          const orderRef = existing.orderId || id;
          const clientName = await getOrderClientName(existing, get().clients);
          const reversalNarration = formatOrderNarration('Order Deleted (Reversal)', orderRef, clientName);

          // 1. Reverse stock debit
          if (qty > 0) {
            await addDoc(collection(db, 'stock'), {
              qty,
              narration: reversalNarration,
              type: 'reversal',
              date: serverTimestamp(),
              createdAt: serverTimestamp()
            });
            await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(qty) }, { merge: true });
          }

          // 2. Reverse payment and customer outstanding
          if (reversalClientId && amount > 0) {
            await addDoc(collection(db, 'payments'), {
              clientId: reversalClientId,
              amount: -amount,
              type: 'reversal',
              method: 'SYSTEM',
              narration: reversalNarration,
              date: new Date(),
              createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'customers', reversalClientId), {
              outstanding: increment(-amount)
            });
          }
        }
      }
      await deleteDoc(orderDocRef);
    } catch (err) {
      console.error('Delete failed:', err);
      throw err;
    }
  }
}));
