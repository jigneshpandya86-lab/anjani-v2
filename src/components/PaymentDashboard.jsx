import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import toast from 'react-hot-toast';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, Clock, ShoppingBag, RotateCcw, Trash2 } from 'lucide-react';

const TRANSACTION_FEED_LIMIT = 15;

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients, deletePayment } = useClientStore();

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


  const handleDeletePayment = async (tx) => {
    const transactionRef = tx.orderId || tx.id;
    const firstConfirm = window.confirm(
      `Delete transaction ${transactionRef}? This will update the client balance.`
    );
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      `Final confirmation: permanently delete ${transactionRef}?`
    );
    if (!secondConfirm) return;

    try {
      await deletePayment(tx.id);
      toast.success(`Transaction ${transactionRef} deleted`);
    } catch (error) {
      console.error('Payment delete failed', error);
      toast.error('Failed to delete transaction');
    }
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
            className={`bg-white/95 p-4 rounded-2xl shadow-[0_6px_20px_rgba(15,23,42,0.05)] border border-gray-100 flex justify-between items-start border-l-4 ${borderColor} transition-all`}
          >
            <div className="flex gap-3 items-start min-w-0">
              <div className={`p-2.5 rounded-2xl ${iconBg} shrink-0`}>
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-gray-900 leading-tight flex items-center gap-2 flex-wrap">
                  <span className="truncate">{getClientName(tx.clientId)}</span>
                  {orderId && (
                    <span className="text-[10px] font-semibold text-gray-500 tracking-wide bg-gray-100 px-2 py-0.5 rounded-full">
                      {orderId}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1 uppercase tracking-wide font-bold mt-1">
                  <Calendar size={11} /> {formatDate(tx)} • {tx.method || 'SYSTEM'}
                </p>
              </div>
            </div>
            <div className="text-right pl-3 shrink-0">
              <button
                type="button"
                onClick={() => handleDeletePayment(tx)}
                className="ml-auto mb-2 flex items-center justify-center rounded-lg bg-red-50 p-1.5 text-red-500 transition-colors hover:bg-red-100"
                title="Delete transaction"
                aria-label={`Delete transaction ${orderId || tx.id}`}
              >
                <Trash2 size={14} />
              </button>
              <p className={`font-black text-2xl leading-none ${amountColor}`}>
                {sign}₹{tx.amount}
              </p>
              <p className="mt-2 inline-flex text-[10px] text-gray-600 font-extrabold uppercase tracking-wide bg-gray-100 px-2 py-0.5 rounded-full">
                {label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
