import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { UserPlus, CheckCircle } from 'lucide-react';

export default function AddClient() {
  const addClient = useClientStore((state) => state.addClient);
  const [formData, setFormData] = useState({ name: '', phone: '', address: '' });
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    addClient(formData);
    setShowSuccess(true);
    setFormData({ name: '', phone: '', address: '' });
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen sm:min-h-0 sm:mt-10 sm:border sm:border-amz-border sm:rounded-lg shadow-sm overflow-hidden">
      <div className="bg-amz-navy p-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-amz-orange rounded-full flex items-center justify-center text-sm">💧</div>
        <h1 className="text-white font-black text-lg tracking-wide">ANJANI<span className="text-amz-orange">WATER</span></h1>
      </div>

      <div className="p-6">
        <div className="flex items-center gap-2 mb-6 border-b border-amz-border pb-2">
          <UserPlus className="text-amz-orange w-5 h-5" />
          <h2 className="text-lg font-bold text-gray-900">Add New Client</h2>
        </div>

        {showSuccess && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md flex items-center gap-2 text-sm font-bold animate-pulse">
            <CheckCircle className="w-4 h-4 text-green-600" />
            Client saved securely! Syncing in background.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Client Name</label>
            <input type="text" required className="w-full border border-amz-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amz-orange focus:ring-2 focus:ring-amz-orange/20" placeholder="e.g. Rahul Sharma" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Phone Number</label>
            <input type="tel" required className="w-full border border-amz-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amz-orange focus:ring-2 focus:ring-amz-orange/20" placeholder="10-digit mobile number" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Delivery Address</label>
            <textarea required rows="3" className="w-full border border-amz-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-amz-orange focus:ring-2 focus:ring-amz-orange/20 resize-none" placeholder="Full delivery address..." value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          </div>
          <button type="submit" className="w-full mt-2 bg-gradient-to-b from-[#f7dfa5] to-[#ffd814] hover:from-[#f5d78e] hover:to-[#f7ca00] active:translate-y-[1px] border border-[#a88734] text-[#111] font-bold py-2.5 px-4 rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-all flex justify-center items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Save Client to Database
          </button>
        </form>
      </div>
    </div>
  );
}