import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc, limit, increment
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  stockEntries: [], 
  loading: false,

  fetchStock: () => {
    const q = query(collection(db, 'stock'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
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
          const getTime = (ts) => {
            if (ts?.toMillis) return ts.toMillis();
            if (ts?.seconds) return ts.seconds * 1000;
            if (typeof ts === 'string') {
              return new Date(ts).getTime();
            }
            return 0;
          };
          return getTime(b.date) - getTime(a.date);
        });
      set({ stockEntries });
    });
  },

  addStockManual: async (qty, narration) => {
    await addDoc(collection(db, 'stock'), {
      qty: Number(qty),
      narration: narration || 'Manual Addition',
      type: 'addition',
      date: serverTimestamp()
    });
  },

  addClient: async (data) => {
    await addDoc(collection(db, 'customers'), {
      name: data.name,
      mobile: data.phone,
      address: data.address,
      rate: Number(data.rate) || 0,
      active: true,
      outstanding: 0,
      createdAt: serverTimestamp()
    });
  },

  updateClient: async (id, data) => {
    await updateDoc(doc(db, 'customers', id), data);
  },

  addOrder: async (data) => {
    const orderId = `ORD-${Date.now()}`;
    await addDoc(collection(db, 'orders'), {
      ...data,
      orderId,
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

      // 1. Debit stock
      await addDoc(collection(db, 'stock'), {
        qty: -qty,
        narration: `Order Delivered: ${existing.orderId || id}`,
        type: 'dispatch',
        date: serverTimestamp()
      });

      // 2. Create invoice transaction in payments
      const amount = qty * rate;
      if (existing.clientId && amount > 0) {
        await addDoc(collection(db, 'payments'), {
          clientId: existing.clientId,
          amount,
          type: 'invoice',
          method: 'SYSTEM',
          narration: `Order Delivered: ${existing.orderId || id}`,
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
          await addDoc(collection(db, 'stock'), {
            qty: Math.abs(Number(existing.qty || 0)),
            narration: `Order Deleted (Reversal): ${existing.orderId || id}`,
            type: 'reversal',
            date: serverTimestamp()
          });
        }
      }
      await deleteDoc(orderRef);
    } catch (err) {
      console.error('Delete failed:', err);
      throw err;
    }
  }
}));
