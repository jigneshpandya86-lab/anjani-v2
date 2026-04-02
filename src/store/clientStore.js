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
    const q = query(collection(db, 'orders'));
    return onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          // DATA MAPPER: Catch old legacy fields
          qty: d.qty || d.quantity || d.boxes || 0,
          rate: d.rate || d.price || d.amount || 0,
          date: d.date || d.deliveryDate || d.orderDate || '',
          time: d.time || d.deliveryTime || '',
          address: d.address || d.deliveryAddress || d.location || '',
          clientId: d.clientId || d.customerId || ''
        };
      });
      
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

    if (data.status === 'Delivered' && existing.status !== 'Delivered') {
      const qty = Number(data.qty) || Number(existing.qty) || 0;
      const rate = Number(data.rate) || Number(existing.rate) || 0;
      const amount = qty * rate;

      const targetClientId = data.clientId || existing.clientId;

      if (targetClientId && amount > 0) {
        const client = get().clients.find(c => c.id === targetClientId);
        const newBalance = (Number(client?.outstanding) || 0) + amount;

        // Charge Client Ledger
        await updateDoc(doc(db, 'customers', targetClientId), { outstanding: newBalance });

        // Record Invoice
        await addDoc(collection(db, 'payments'), {
          clientId: targetClientId,
          amount: amount,
          type: 'invoice',
          method: 'system',
          note: `Auto-billed for ${existing.orderId || 'Legacy Order'}`,
          date: serverTimestamp()
        });

        // Debit Stock
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
