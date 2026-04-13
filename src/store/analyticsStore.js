import { create } from 'zustand';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';

export const useAnalyticsStore = create((set) => {
  let unsubscribe = null;

  return {
    payments: [],
    loading: true,

    subscribeToPayments: () => {
      if (unsubscribe) return; // Already subscribed

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const q = query(
        collection(db, 'payments'),
        where('createdAt', '>=', monthStart),
        orderBy('createdAt', 'desc'),
        limit(300)
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const paymentsList = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          set({ payments: paymentsList, loading: false });
        },
        (error) => {
          console.error('Error fetching payments for analytics:', error);
          set({ loading: false });
        }
      );
    },

    unsubscribeFromPayments: () => {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      set({ payments: [], loading: false });
    },
  };
});
