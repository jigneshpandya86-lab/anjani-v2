import { useEffect, useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { IndianRupee, Calendar, User } from 'lucide-react';

export default function PaymentDashboard() {
  const [history, setHistory] = useState([]);
  const { clients } = useClientStore();

  useEffect(() => {
    const q = query(collection(db, 'payments'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  const getClientName = (id) => clients.find(c => c.id === id)?.name || 'Unknown Client';

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 px-1">Payment History</h2>
      
      {history.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl text-center text-gray-400 border border-dashed">
          No payments recorded yet.
        </div>
      ) : (
        history.map(tx => (
          <div key={tx.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
            <div className="flex gap-3 items-center">
              <div className="bg-green-100 p-2 rounded-full text-green-600">
                <IndianRupee size={18} />
              </div>
              <div>
                <p className="font-bold text-gray-900">{getClientName(tx.clientId)}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 uppercase tracking-wider font-bold">
                  <Calendar size={10} /> {tx.date?.toDate().toLocaleDateString('en-IN')} • {tx.method}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-black text-green-600 text-lg">₹{tx.amount}</p>
              <p className="text-[10px] text-gray-400 font-bold uppercase">{tx.type}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
