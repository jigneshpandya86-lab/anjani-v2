import { create } from 'zustand';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase-config';

export const useClientStore = create(() => ({
  addClient: (clientData) => {
    try {
      addDoc(collection(db, 'customers'), {
        ...clientData,
        createdAt: serverTimestamp(),
        source: 'v2_app'
      });
      return { success: true };
    } catch (error) {
      console.error("Cache Error:", error);
      return { success: false, error };
    }
  }
}));