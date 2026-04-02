import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp, orderBy 
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  orders: [],
  loading: false,

  fetchClients: () => {
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ 
        id: doc.id, ...doc.data(),
        name: doc.data().name || doc.data().clientName || 'Unnamed',
        outstanding: doc.data().outstanding || 0
      }));
      set({ clients });
    });
  },

  fetchOrders: () => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      set({ orders: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    });
  },

  addPayment: async (paymentData) => {
    const { clientId, amount, method, note } = paymentData;
    await addDoc(collection(db, 'payments'), {
      clientId, amount: Number(amount), method: method || 'cash',
      note: note || '', type: 'payment', date: serverTimestamp()
    });
    const client = get().clients.find(c => c.id === clientId);
    await updateDoc(doc(db, 'customers', clientId), { outstanding: (Number(client?.outstanding || 0) - Number(amount)) });
  },

  // --- NEW ORDER LOGIC ---
  addOrder: async (orderData) => {
    // Generate 4 digit ID based on current count
    const count = get().orders.length + 1;
    const orderId = 'ORD-' + String(count).padStart(4, '0');
    
    await addDoc(collection(db, 'orders'), {
      ...orderData,
      orderId,
      status: 'Pending',
      createdAt: serverTimestamp()
    });
  },

  updateOrder: async (id, data) => {
    const existing = get().orders.find(o => o.id === id);
    
    // AUTOMATION: If marking as Delivered
    if (data.status === 'Delivered' && existing.status !== 'Delivered') {
      const amount = Number(existing.qty) * Number(existing.rate);
      const client = get().clients.find(c => c.id === existing.clientId);
      
      // 1. Charge Client Ledger (Increase Outstanding)
      await updateDoc(doc(db, 'customers', existing.clientId), { 
        outstanding: (Number(client?.outstanding || 0) + amount) 
      });

      // 2. Record Invoice in Payments collection
      await addDoc(collection(db, 'payments'), {
        clientId: existing.clientId, amount, type: 'invoice', 
        note: `Billed for ${existing.orderId}`, date: serverTimestamp()
      });

      // 3. Debit Stock (Phase 3 Stock prep)
      await addDoc(collection(db, 'stock_ledger'), {
        orderId: existing.orderId, qty: -Number(existing.qty), 
        type: 'dispatch', date: serverTimestamp()
      });
    }

    await updateDoc(doc(db, 'orders', id), data);
  },

  deleteOrder: async (id) => {
    await deleteDoc(doc(db, 'orders', id));
  }
}));
