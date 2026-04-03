import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc 
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  stockEntries: [], 
  loading: false,

  fetchStock: () => {
    // Strictly using your existing 'stock' collection
    const q = query(collection(db, 'stock'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const stockEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
      const client = get().clients.find(c => c.id === data.clientId);
      if (client !== undefined) {
        const newOutstanding = (Number(client.outstanding) || 0) - Number(data.amount);
        await updateDoc(doc(db, 'customers', data.clientId), { outstanding: newOutstanding });
      }
    }
  },

  fetchClients: () => {
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ 
        id: doc.id, ...doc.data(),
        name: doc.data().name || 'Unnamed',
        outstanding: doc.data().outstanding || 0
      }));
      set({ clients });
    });
  },

  fetchOrders: () => {
    // FIX 1: Removed strict orderBy() from Firestore query to prevent dropping legacy records
    const q = query(collection(db, 'orders'));
    return onSnapshot(q, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // FIX 2: Safely sort regardless of whether the timestamp is a Firestore object, string, or missing entirely.
      docs.sort((a, b) => {
        const getTime = (val) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (val.seconds) return val.seconds * 1000;
          if (typeof val === 'string' || typeof val === 'number') {
            const parsed = new Date(val).getTime();
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };
        return getTime(b.createdAt) - getTime(a.createdAt);
      });

      set({ orders: docs });
    });
  },

  updateOrder: async (id, data) => {
    const existing = get().orders.find(o => o.id === id);
    if (existing && data.status === 'Delivered' && existing.status !== 'Delivered') {
      const qty = Number(existing.qty);
      // Debit stock with Narration
      await addDoc(collection(db, 'stock'), {
        qty: -qty,
        narration: `Order Delivered: ${existing.orderId || id}`,
        type: 'dispatch',
        date: serverTimestamp()
      });
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
