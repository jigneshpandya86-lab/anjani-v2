import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase-config';
import { PackagePlus, Save } from 'lucide-react';

export default function AddStockModal({ onClose }) {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) return;

    setLoading(true);
    await addDoc(collection(db, 'stock_ledger'), {
      qty: Number(qty),
      type: 'manual_add',
      note: note || 'Manual Addition',
      date: serverTimestamp()
    });
    setLoading(false);
    onClose();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Add Stock</h2>
          <p className="text-sm text-gray-500">Manual Inventory Addition</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Quantity (Boxes)</label>
          <div className="relative">
            <PackagePlus className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
            <input 
              type="number"
              required
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
              placeholder="e.g. 100"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Tag / Notes</label>
          <input 
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#ff9900] outline-none"
            placeholder="e.g. Received from factory"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button 
          disabled={loading}
          className="w-full bg-[#131921] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50"
        >
          {loading ? "Saving..." : <><Save size={20} /> Add to Ledger</>}
        </button>
      </form>
    </div>
  );
}
