import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, Clock, ShoppingBag, RotateCcw } from 'lucide-react';

const TRANSACTION_FEED_LIMIT = 15;

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients } = useClientStore();

  useEffect(() => {
    const q = query(
      collection(db, 'payments'),
      orderBy('createdAt', 'desc'),
      limit(TRANSACTION_FEED_LIMIT)
    );
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

  const getOrderId = (tx) => {
    if (tx.orderId) return tx.orderId;

    const narration = tx.narration || tx.note || '';
    const match = narration.match(/\bORD-\d+\b/i);
    return match ? match[0].toUpperCase() : '';
  };

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
        <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Payment Ledger</h2>
        <div className="flex items-center gap-1 text-[10px] bg-[#ff9900]/10 text-[#ff9900] px-2 py-1 rounded-full font-black uppercase shadow-sm">
          <Clock size={12} /> Recent: {TRANSACTION_FEED_LIMIT}
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

        const orderId = getOrderId(tx);

        return (
          <div
            key={tx.id}
            className={`bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.05)] border border-slate-100 flex justify-between items-center border-l-[5px] ${borderColor} transition-all duration-200 hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)] hover:-translate-y-0.5`}
          >
            <div className="flex gap-3 items-center min-w-0">
              <div className={`p-2.5 rounded-xl ring-1 ring-black/5 ${iconBg}`}>
                <Icon size={17} />
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 leading-tight flex items-center gap-2 min-w-0">
                  <span className="truncate">{getClientName(tx.clientId)}</span>
                  {orderId && (
                    <span className="text-[10px] font-semibold text-slate-400 tracking-wide bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                      {orderId}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-slate-500 flex items-center gap-1 uppercase tracking-wider font-bold mt-1">
                  <Calendar size={10} /> {formatDate(tx)} • {tx.method || 'SYSTEM'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-black text-2xl leading-none tabular-nums ${amountColor}`}>
                {sign}₹{tx.amount}
              </p>
              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide mt-1">
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
