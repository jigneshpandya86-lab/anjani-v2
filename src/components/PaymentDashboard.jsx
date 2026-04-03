import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, Clock, ShoppingBag, RotateCcw } from 'lucide-react';

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients } = useClientStore();

  useEffect(() => {
    const q = query(collection(db, 'payments'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
    const rawDate = tx.date || tx.paymentDate || tx.createdAt;
    if (!rawDate) return "No Date Found";
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN');
    if (typeof rawDate === 'string') return rawDate;
    return new Date(rawDate).toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Payment Ledger</h2>
        <div className="flex items-center gap-1 text-[10px] bg-[#ff9900]/10 text-[#ff9900] px-2 py-1 rounded-full font-black uppercase">
          <Clock size={12} /> Sorted: Recent
        </div>
      </div>

      {history.length === 0 && (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">
          No transactions found.
        </div>
      )}

      {history.map(tx => {
        const isCharge = tx.type === 'invoice';
        const isAdjustment = tx.type === 'adjustment';
        
        let borderColor = 'border-l-green-500';
        let iconBg = 'bg-green-50 text-green-600';
        let amountColor = 'text-green-600';
        let sign = '+';
        let label = 'RECEIVED';
        let Icon = IndianRupee;

        if (isCharge) {
          borderColor = 'border-l-red-500';
          iconBg = 'bg-red-50 text-red-500';
          amountColor = 'text-red-500';
          sign = '+';
          label = 'BILLED (CHARGE)';
          Icon = ShoppingBag;
        } else if (isAdjustment) {
          borderColor = 'border-l-blue-500';
          iconBg = 'bg-blue-50 text-blue-500';
          amountColor = 'text-blue-500';
          sign = '-'; // Reversals decrease the client's balance
          label = 'SYSTEM REVERSAL';
          Icon = RotateCcw;
        }

        return (
          <div key={tx.id} className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center border-l-4 ${borderColor}`}>
            <div className="flex gap-3 items-center">
              <div className={`p-2 rounded-full ${iconBg}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="font-bold text-gray-900 leading-tight">{getClientName(tx.clientId)}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 uppercase tracking-widest font-black mt-1">
                  <Calendar size={10} /> {formatDate(tx)} • {tx.method || 'SYSTEM'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-black text-lg italic ${amountColor}`}>
                {sign}₹{tx.amount}
              </p>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
