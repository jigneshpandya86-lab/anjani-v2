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

  fetchClients: () => {
    // UPDATED: Pointing back to your original 'customers' collection
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          // DATA MAPPING: If the old data used 'clientName', use it as 'name'
          name: data.name || data.clientName || 'Unnamed Customer',
          outstanding: data.outstanding || 0
        };
      });
      set({ clients });
    });
  },

  addClient: async (clientData) => {
    try {
      const shortId = 'C-' + Date.now().toString().slice(-6);
      await addDoc(collection(db, 'customers'), {
        ...clientData,
        shortId,
        active: true,
        outstanding: 0,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error adding customer:", error);
    }
  },

  updateClient: async (id, data) => {
    const clientRef = doc(db, 'customers', id);
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
      
      await updateDoc(doc(db, 'customers', clientId), { outstanding: newBalance });
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  }
}));
