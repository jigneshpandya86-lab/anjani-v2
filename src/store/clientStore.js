import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc, limit, increment, setDoc, getDocs
} from 'firebase/firestore';
import { db } from '../firebase-config';

let stockUnsubscribe = null;
let stockSubscriberCount = 0;
const STOCK_SUMMARY_DOC = doc(db, 'meta', 'stockSummary');

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

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  stockEntries: [], 
  stockTotal: 0,
  loading: false,

  fetchStock: () => {
    stockSubscriberCount += 1;

    if (!stockUnsubscribe) {
      const q = query(collection(db, 'stock'));
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
          });
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
      date: serverTimestamp()
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
    const orderId = `ORD-${Date.now()}`;
    const selectedClient = get().clients.find((client) => client.id === data.clientId);

    await addDoc(collection(db, 'orders'), {
      ...data,
      orderId,
      clientName: selectedClient?.name || data.clientName || '',
      qty: Number(data.qty),
      rate: Number(data.rate),
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

  fetchClients: () => {
    const q = query(collection(db, 'customers'));
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
        mapLink:  raw.mapLink || raw.googleMap || '',
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
    const existing = get().orders.find(o => o.id === id);
    if (existing && data.status === 'Delivered' && existing.status !== 'Delivered') {
      const qty = Number(existing.qty);
      const rate = Number(existing.rate);
      const orderRef = existing.orderId || id;
      const clientName = await getOrderClientName(existing, get().clients);
      const deliveredNarration = formatOrderNarration('Order Delivered', orderRef, clientName);

      // 1. Debit stock
      await addDoc(collection(db, 'stock'), {
        qty: -qty,
        narration: deliveredNarration,
        type: 'dispatch',
        date: new Date(),
        createdAt: serverTimestamp()
      });
      await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(-qty) }, { merge: true });

      // 2. Create invoice transaction in payments
      const amount = qty * rate;
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
    await updateDoc(doc(db, 'orders', id), data);
  },

  deleteOrder: async (id) => {
    try {
      const orderRef = doc(db, 'orders', id);
      const orderSnap = await getDoc(orderRef);
      if (orderSnap.exists()) {
        const existing = orderSnap.data();
        if (existing.status === 'Delivered') {
          const reversalQty = Math.abs(Number(existing.qty || 0));
          const orderRef = existing.orderId || id;
          const clientName = await getOrderClientName(existing, get().clients);
          const reversalNarration = formatOrderNarration('Order Deleted (Reversal)', orderRef, clientName);
          await addDoc(collection(db, 'stock'), {
            qty: reversalQty,
            narration: reversalNarration,
            type: 'reversal',
            date: serverTimestamp()
          });
          await setDoc(STOCK_SUMMARY_DOC, { totalQty: increment(reversalQty) }, { merge: true });
        }
      }
      await deleteDoc(orderRef);
    } catch (err) {
      console.error('Delete failed:', err);
      throw err;
    }
  }
}));
