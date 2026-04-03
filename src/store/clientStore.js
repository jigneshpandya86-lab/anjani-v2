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
    const q = query(collection(db, 'orders'));
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
        if (o.createdAt?.toDate) return o.createdAt.toDate().getTime();
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
    const existing = get().orders.find(o => o.id === id);
    if (existing && existing.status === 'Delivered') {
      // Reverse stock with Narration
      await addDoc(collection(db, 'stock'), {
        qty: Math.abs(Number(existing.qty)),
        narration: `Order Deleted (Reversal): ${existing.orderId || id}`,
        type: 'reversal',
        date: serverTimestamp()
      });
    }
    await deleteDoc(doc(db, 'orders', id));
  }
}));
