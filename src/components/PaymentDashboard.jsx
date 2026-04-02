import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, Clock } from 'lucide-react';

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients } = useClientStore();

  useEffect(() => {
    const q = query(collection(db, 'payments'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // SORTING LOGIC: Recent to Past
      const sorted = docs.sort((a, b) => {
        const dateA = a.date?.toDate?.() || new Date(a.date || a.paymentDate || a.createdAt || 0);
        const dateB = b.date?.toDate?.() || new Date(b.date || b.paymentDate || b.createdAt || 0);
        return dateB - dateA;
      });

      setHistory(sorted);
    });
    return unsub;
  }, []);

  const getClientName = (id) => clients.find(c => c.id === id)?.name || 'Unknown Client';

  const formatDate = (tx) => {
    // Check all possible date fields
    const rawDate = tx.date || tx.paymentDate || tx.createdAt;
    
    if (!rawDate) return "No Date Found";
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN');
    if (typeof rawDate === 'string') return rawDate; // If it's already a string
    return new Date(rawDate).toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Payment Ledger</h2>
        <div className="flex items-center gap-1 text-[10px] bg-[#ff9900]/10 text-[#ff9900] px-2 py-1 rounded-full font-black uppercase">
          <Clock size={12} /> Sorted: Recent
        </div>
      </div>
      
      {history.map(tx => (
        <div key={tx.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center border-l-4 border-l-green-500">
          <div className="flex gap-3 items-center">
            <div className="bg-green-50 p-2 rounded-full text-green-600">
              <IndianRupee size={18} />
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">{getClientName(tx.clientId)}</p>
              <p className="text-[10px] text-gray-400 flex items-center gap-1 uppercase tracking-widest font-black mt-1">
                <Calendar size={10} /> {formatDate(tx)} • {tx.method || 'CASH'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-black text-green-600 text-lg italic">₹{tx.amount}</p>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Amount</p>
          </div>
        </div>
      ))}
    </div>
  );
}
