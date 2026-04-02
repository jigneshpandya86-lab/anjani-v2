import { create } from 'zustand';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase-config';

const generateShortId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

export const useClientStore = create((set) => ({
  clients: [],
  loading: true,

  // Real-time sync with your existing 'customers' collection
  fetchClients: () => {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const clientList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ clients: clientList, loading: false });
    });
  },

  addClient: async (data) => {
    await addDoc(collection(db, 'customers'), {
      ...data,
      shortId: generateShortId(),
      mobile: data.phone,
      active: true,
      outstanding: 0,
      createdAt: serverTimestamp()
    });
  },

  updateClient: async (docId, updatedData) => {
    const docRef = doc(db, 'customers', docId);
    await updateDoc(docRef, updatedData);
  }
}));