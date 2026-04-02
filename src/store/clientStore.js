import { create } from 'zustand';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  updateDoc, 
  serverTimestamp,
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create((set, get) => ({
  clients: [],
  transactions: [],
  loading: false,

  // 1. Fetch Clients (Real-time)
  fetchClients: () => {
    const q = query(collection(db, 'clients'), orderBy('name'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ clients });
    });
  },

  // 2. Add New Client
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

  // 3. Update Client Info
  updateClient: async (id, data) => {
    const clientRef = doc(db, 'clients', id);
    await updateDoc(clientRef, data);
  },

  // 4. THE POWER FEATURE: Record a Payment or Adjustment
  // type: 'payment', 'advance', or 'adjustment'
  addTransaction: async (transactionData) => {
    const { clientId, amount, type, method, note, linkedOrders } = transactionData;
    
    try {
      // Create the transaction record (The Paper Trail)
      await addDoc(collection(db, 'transactions'), {
        clientId,
        amount: Number(amount),
        type,
        method: method || 'cash',
        note: note || '',
        linkedOrders: linkedOrders || [],
        date: serverTimestamp()
      });

      // Update the Client's Master Balance
      const client = get().clients.find(c => c.id === clientId);
      const newBalance = (client.outstanding || 0) - Number(amount);
      
      const clientRef = doc(db, 'clients', clientId);
      await updateDoc(clientRef, { outstanding: newBalance });
      
    } catch (error) {
      console.error("Transaction failed:", error);
    }
  }
}));
