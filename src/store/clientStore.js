import { create } from 'zustand';
import { 
  collection, addDoc, onSnapshot, query, doc, 
  updateDoc, deleteDoc, serverTimestamp 
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
    // REMOVED 'orderBy' to stop Firebase from hiding old legacy orders
    const q = query(collection(db, 'orders'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Manual Javascript Sorting
      const sorted = docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || b.date || 0);
        return dateB - dateA;
      });
      set({ orders: sorted });
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

  addOrder: async (orderData) => {
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
    if (!existing) return;

    // BULLETPROOF AUTOMATION
    if (data.status === 'Delivered' && existing.status !== 'Delivered') {
      // Use fallbacks to prevent NaN crashes
      const qty = Number(existing.qty) || 0;
      const rate = Number(existing.rate) || 0;
      const amount = qty * rate;

      if (existing.clientId && amount > 0) {
        const client = get().clients.find(c => c.id === existing.clientId);
        const newBalance = (Number(client?.outstanding) || 0) + amount;

        // 1. Charge Client Ledger
        await updateDoc(doc(db, 'customers', existing.clientId), { 
          outstanding: newBalance 
        });

        // 2. Record Invoice (Charge) in Ledger
        await addDoc(collection(db, 'payments'), {
          clientId: existing.clientId,
          amount: amount,
          type: 'invoice',
          method: 'system',
          note: `Auto-billed for ${existing.orderId || 'Order'}`,
          date: serverTimestamp()
        });

        // 3. Stock Debit logic setup
        await addDoc(collection(db, 'stock_ledger'), {
          orderId: existing.orderId || id, qty: -qty, 
          type: 'dispatch', date: serverTimestamp()
        });
      }
    }

    await updateDoc(doc(db, 'orders', id), data);
  },

  deleteOrder: async (id) => {
    await deleteDoc(doc(db, 'orders', id));
  }
}));
