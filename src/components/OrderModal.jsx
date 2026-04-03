import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import { Save, MapPin, Package, Clock, IndianRupee, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrderModal({ orderToEdit, onClose }) {
  const { clients, addOrder, updateOrder } = useClientStore();
  const [formData, setFormData] = useState({
    clientId: '', qty: '', rate: '', date: '', time: '', 
    address: '', mapLink: '', proofUrl: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (orderToEdit) {
      // Map old legacy fields directly into the new inputs
      setFormData({
        clientId: orderToEdit.clientId || orderToEdit.customerId || '',
        qty: orderToEdit.qty || orderToEdit.quantity || orderToEdit.boxes || '',
        rate: orderToEdit.rate || orderToEdit.price || orderToEdit.amount || '',
        date: orderToEdit.date || orderToEdit.deliveryDate || orderToEdit.orderDate || '',
        time: orderToEdit.time || orderToEdit.deliveryTime || '',
        address: orderToEdit.address || orderToEdit.deliveryAddress || orderToEdit.location || '',
        mapLink: orderToEdit.mapLink || orderToEdit.googleMap || '',
        proofUrl: orderToEdit.proofUrl || '',
      });
    } else {
      setFormData({ clientId: '', qty: '', rate: '', date: '', time: '', address: '', mapLink: '', proofUrl: '' });
    }
  }, [orderToEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (orderToEdit && orderToEdit.id) {
        await updateOrder(orderToEdit.id, formData);
        toast.success('Order updated successfully');
      } else {
        await addOrder(formData);
        toast.success('Order created successfully');
      }
      onClose();
    } catch (err) {
      console.error('Order save failed:', err);
      toast.error('Failed to save order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const total = (Number(formData.qty) || 0) * (Number(formData.rate) || 0);

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black uppercase text-gray-800 tracking-tight">
          {orderToEdit?.id ? 'Edit Order' : 'New Order'}
        </h2>
        <p className="text-xs text-gray-400 font-bold">200ML BOTTLE SKU</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Client</label>
          <select required className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-bold text-sm"
            value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
            <option value="">-- Choose Client --</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity (Boxes)</label>
            <div className="relative">
              <Package className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input type="number" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-black"
                value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Rate / Box (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input type="number" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-black"
                value={formData.rate} onChange={e => setFormData({...formData, rate: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delivery Date</label>
            <input type="date" required className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
              value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Time</label>
            <div className="relative">
              <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input type="time" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
                value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Address</label>
          <textarea required rows="2" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-medium"
            value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Google Maps Link</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input type="url" placeholder="https://maps.google.com/..." className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm"
              value={formData.mapLink} onChange={e => setFormData({...formData, mapLink: e.target.value})} />
          </div>
        </div>

        {orderToEdit?.status === 'Delivered' && (
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delivery Proof (Photo URL/Drive)</label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input type="url" placeholder="Paste image link here" className="w-full pl-9 pr-3 py-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 outline-none text-sm"
                value={formData.proofUrl} onChange={e => setFormData({...formData, proofUrl: e.target.value})} />
            </div>
          </div>
        )}

        <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex justify-between items-center mt-2">
          <span className="text-xs font-black text-orange-800 uppercase tracking-widest">Total Value</span>
          <span className="text-xl font-black text-[#ff9900]">₹{total.toLocaleString()}</span>
        </div>

        <button disabled={loading} className="w-full bg-[#131921] text-[#ff9900] py-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-transform">
          {loading ? 'Saving...' : 'Save Order'}
        </button>
      </form>
    </div>
  );
}
