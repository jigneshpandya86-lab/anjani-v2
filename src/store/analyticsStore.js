import { create } from 'zustand';
import { collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';

export const useAnalyticsStore = create((set) => {
  let unsubscribeMonth = null;
  let unsubscribeRecent = null;

  return {
    payments: [],
    recentPayments: [],
    loading: true,
    recentLoading: true,

    subscribeToPayments: () => {
      if (unsubscribeMonth) return;

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const q = query(
        collection(db, 'payments'),
        where('createdAt', '>=', monthStart),
        orderBy('createdAt', 'desc'),
        limit(300)
      );

      unsubscribeMonth = onSnapshot(
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

    subscribeToRecentPayments: () => {
      if (unsubscribeRecent) return;

      const q = query(
        collection(db, 'payments'),
        orderBy('createdAt', 'desc'),
        limit(15)
      );

      unsubscribeRecent = onSnapshot(
        q,
        (snapshot) => {
          const paymentsList = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          set({ recentPayments: paymentsList, recentLoading: false });
        },
        (error) => {
          console.error('Error fetching recent payments:', error);
          set({ recentLoading: false });
        }
      );
    },

    unsubscribeFromPayments: () => {
      if (unsubscribeMonth) {
        unsubscribeMonth();
        unsubscribeMonth = null;
      }
      set({ payments: [], loading: false });
    },

    unsubscribeFromRecentPayments: () => {
      if (unsubscribeRecent) {
        unsubscribeRecent();
        unsubscribeRecent = null;
      }
      set({ recentPayments: [], recentLoading: false });
    },
  };
});
