import { create } from 'zustand';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  loading: false,

  // 1. Simplified Fetch (No ordering to prevent hidden crashes)
  fetchClients: () => {
    const q = query(collection(db, 'clients'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      console.log("Clients loaded:", clients.length);
      set({ clients });
    });
  },

  addClient: async (clientData) => {
    try {
      const shortId = 'C-' + Date.now().toString().slice(-6);
      await addDoc(collection(db, 'clients'), {
        ...clientData,
        shortId,
        active: true,
        outstanding: 0,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error adding client:", error);
    }
  },

  updateClient: async (id, data) => {
    const clientRef = doc(db, 'clients', id);
    await updateDoc(clientRef, data);
  },

  addTransaction: async (transactionData) => {
    const { clientId, amount, type, method, note } = transactionData;
    try {
      await addDoc(collection(db, 'transactions'), {
        clientId,
        amount: Number(amount),
        type,
        method: method || 'cash',
        note: note || '',
        date: serverTimestamp()
      });

      const client = get().clients.find(c => c.id === clientId);
      const currentBalance = Number(client?.outstanding || 0);
      const newBalance = currentBalance - Number(amount);
      
      await updateDoc(doc(db, 'clients', clientId), { outstanding: newBalance });
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  }
}));
