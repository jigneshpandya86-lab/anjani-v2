import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  stockEntries: [], 
  loading: false,

  fetchStock: () => {
    // FIXED: Now using your existing 'stock' collection
    const q = query(collection(db, 'stock'), orderBy('date', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const stockEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ stockEntries });
    });
  },

  addStockManual: async (qty, note) => {
    await addDoc(collection(db, 'stock'), {
      qty: Number(qty),
      note: note || 'Manual Addition',
      type: 'addition',
      date: serverTimestamp()
    });
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
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ orders: docs });
    });
  },

  updateOrder: async (id, data) => {
    const existing = get().orders.find(o => o.id === id);
    if (data.status === 'Delivered' && existing.status !== 'Delivered') {
      const qty = Number(existing.qty);
      // Debit existing stock collection
      await addDoc(collection(db, 'stock'), {
        qty: -qty,
        note: `Order Delivered: ${existing.orderId || id}`,
        type: 'dispatch',
        date: serverTimestamp()
      });
    }
    await updateDoc(doc(db, 'orders', id), data);
  },

  deleteOrder: async (id) => {
    const existing = get().orders.find(o => o.id === id);
    if (existing && existing.status === 'Delivered') {
      // Reverse existing stock collection
      await addDoc(collection(db, 'stock'), {
        qty: Math.abs(Number(existing.qty)),
        note: `Order Deleted: ${existing.orderId || id}`,
        type: 'reversal',
        date: serverTimestamp()
      });
    }
    await deleteDoc(doc(db, 'orders', id));
  }
}));
