import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { X, IndianRupee, Save, CreditCard, Banknote } from 'lucide-react';

export default function PaymentModal({ client, onClose }) {
  const { addTransaction } = useClientStore();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) return;

    setLoading(true);
    await addTransaction({
      clientId: client.id,
      amount: parseFloat(amount),
      type: 'payment',
      method,
      note
    });
    setLoading(false);
    onClose();
  };

  const newBalance = (client.outstanding || 0) - (parseFloat(amount) || 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Record Payment</h2>
          <p className="text-sm text-gray-500">{client.name}</p>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center border border-gray-100">
        <span className="text-gray-600 font-medium">Current Balance:</span>
        <span className={`font-bold text-lg ${client.outstanding > 0 ? 'text-red-500' : 'text-green-600'}`}>
          ₹{client.outstanding?.toLocaleString() || 0}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Amount Input */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Amount Received (₹)</label>
          <div className="relative">
            <IndianRupee className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
            <input 
              type="number"
              required
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-lg font-bold focus:ring-2 focus:ring-[#ff9900] outline-none"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Payment Method Toggle */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Payment Method</label>
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => setMethod('cash')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${method === 'cash' ? 'border-[#ff9900] bg-orange-50 text-[#ff9900]' : 'border-gray-100 bg-white text-gray-500'}`}
            >
              <Banknote size={18} /> Cash
            </button>
            <button 
              type="button"
              onClick={() => setMethod('upi')}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${method === 'upi' ? 'border-[#ff9900] bg-orange-50 text-[#ff9900]' : 'border-gray-100 bg-white text-gray-500'}`}
            >
              <CreditCard size={18} /> UPI / Online
            </button>
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Notes (Optional)</label>
          <input 
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#ff9900] outline-none"
            placeholder="e.g. Paid for March deliveries"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Preview Balance */}
        {amount > 0 && (
          <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100 animate-pulse">
            <p className="text-xs text-blue-600 font-medium uppercase">New Balance after saving</p>
            <p className="text-lg font-bold text-blue-800">₹{newBalance.toLocaleString()}</p>
          </div>
        )}

        <button 
          disabled={loading}
          className="w-full bg-[#131921] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg disabled:opacity-50"
        >
          {loading ? "Saving..." : <><Save size={20} /> Save Transaction</>}
        </button>
      </form>
    </div>
  );
}
