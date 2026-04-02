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
    const q = query(collection(db, 'customers'));
    return onSnapshot(q, (snapshot) => {
      const clients = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          name: data.name || data.clientName || 'Unnamed Customer',
          outstanding: data.outstanding || 0
        };
      });
      set({ clients });
    });
  },

  // This function now saves directly to your existing 'payments' collection
  addPayment: async (paymentData) => {
    const { clientId, amount, method, note } = paymentData;
    try {
      await addDoc(collection(db, 'payments'), {
        clientId,
        amount: Number(amount),
        method: method || 'cash',
        note: note || '',
        type: 'payment', // We add this field to identify it as a payment
        date: serverTimestamp()
      });

      // Update the customer's balance
      const client = get().clients.find(c => c.id === clientId);
      const currentBalance = Number(client?.outstanding || 0);
      const newBalance = currentBalance - Number(amount);
      
      await updateDoc(doc(db, 'customers', clientId), { outstanding: newBalance });
    } catch (error) {
      console.error("Payment failed:", error);
    }
  }
}));
