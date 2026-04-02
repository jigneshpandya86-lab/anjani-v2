import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, Info } from 'lucide-react';

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients } = useClientStore();

  useEffect(() => {
    // We point to your existing 'payments' collection as discussed
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  const getClientName = (id) => clients.find(c => c.id === id)?.name || 'Unknown Client';

  // Helper function to safely format dates
  const formatDate = (dateValue) => {
    if (!dateValue) return "Pending...";
    // If it's a Firestore Timestamp, convert it
    if (dateValue.toDate) return dateValue.toDate().toLocaleDateString('en-IN');
    // If it's already a JS Date
    if (dateValue instanceof Date) return dateValue.toLocaleDateString('en-IN');
    return "No Date";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Payment Ledger</h2>
        <div className="text-[10px] bg-green-50 text-green-600 px-2 py-1 rounded-full font-bold">LIVE SYNC</div>
      </div>
      
      {history.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl text-center text-gray-400 border border-dashed italic">
          No records found in 'payments'...
        </div>
      ) : (
        history.map(tx => (
          <div key={tx.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center active:scale-[0.98] transition-transform">
            <div className="flex gap-3 items-center">
              <div className="bg-green-100 p-2 rounded-full text-green-600">
                <IndianRupee size={18} />
              </div>
              <div>
                <p className="font-bold text-gray-900 leading-tight">{getClientName(tx.clientId)}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 uppercase tracking-widest font-black mt-1">
                  <Calendar size={10} /> {formatDate(tx.date)} • {tx.method || 'CASH'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-black text-green-600 text-lg italic">₹{tx.amount}</p>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Received</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
