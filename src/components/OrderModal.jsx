import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import { Package, Clock, IndianRupee, Image as ImageIcon, MapPinned } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleMapPicker from './GoogleMapPicker';

export default function OrderModal({ orderToEdit, onClose }) {
  const { clients, addOrder, updateOrder } = useClientStore();
  const [formData, setFormData] = useState({
    clientId: '', qty: '', rate: '', date: '', time: '', 
    address: '', location: '', mapLink: '', locationLat: null, locationLng: null, proofUrl: ''
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
        address: orderToEdit.address || orderToEdit.deliveryAddress || '',
        location: orderToEdit.location || orderToEdit.googleLocation || orderToEdit.locationName || '',
        mapLink: orderToEdit.mapLink || orderToEdit.googleMap || '',
        locationLat: Number.isFinite(Number(orderToEdit.locationLat ?? orderToEdit.lat))
          ? Number(orderToEdit.locationLat ?? orderToEdit.lat)
          : null,
        locationLng: Number.isFinite(Number(orderToEdit.locationLng ?? orderToEdit.lng))
          ? Number(orderToEdit.locationLng ?? orderToEdit.lng)
          : null,
        proofUrl: orderToEdit.proofUrl || '',
      });
    } else {
      setFormData({
        clientId: '',
        qty: '',
        rate: '',
        date: '',
        time: '',
        address: '',
        location: '',
        mapLink: '',
        locationLat: null,
        locationLng: null,
        proofUrl: '',
      });
    }
  }, [orderToEdit]);


  useEffect(() => {
    if (!formData.clientId) return;
    const selectedClient = clients.find((client) => client.id === formData.clientId);
    if (!selectedClient) return;

    setFormData((prev) => {
      const next = { ...prev };
      let changed = false;

      const nextRate = Number(selectedClient.rate) || 0;
      if ((prev.rate === '' || Number(prev.rate) <= 0) && nextRate) {
        next.rate = String(nextRate);
        changed = true;
      }

      if (!String(prev.address || '').trim() && selectedClient.address) {
        next.address = selectedClient.address;
        changed = true;
      }

      if (!String(prev.location || '').trim() && (selectedClient.location || selectedClient.mapLink)) {
        next.location = selectedClient.location || selectedClient.mapLink || '';
        changed = true;
      }

      if (!String(prev.mapLink || '').trim() && selectedClient.mapLink) {
        next.mapLink = selectedClient.mapLink;
        changed = true;
      }

      if (!Number.isFinite(Number(prev.locationLat)) && Number.isFinite(Number(selectedClient.locationLat))) {
        next.locationLat = Number(selectedClient.locationLat);
        changed = true;
      }

      if (!Number.isFinite(Number(prev.locationLng)) && Number.isFinite(Number(selectedClient.locationLng))) {
        next.locationLng = Number(selectedClient.locationLng);
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [clients, formData.clientId]);

  const handleLocationChange = ({ lat, lng, address, mapLink }) => {
    setFormData((prev) => ({
      ...prev,
      locationLat: Number.isFinite(Number(lat)) ? Number(lat) : prev.locationLat,
      locationLng: Number.isFinite(Number(lng)) ? Number(lng) : prev.locationLng,
      location: address || prev.location,
      mapLink: mapLink || prev.mapLink,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        address: String(formData.address || '').trim(),
        location: String(formData.location || '').trim(),
        mapLink: String(formData.mapLink || '').trim(),
        locationLat: Number.isFinite(Number(formData.locationLat)) ? Number(formData.locationLat) : null,
        locationLng: Number.isFinite(Number(formData.locationLng)) ? Number(formData.locationLng) : null,
        proofUrl: String(formData.proofUrl || '').trim(),
      };

      if (orderToEdit && orderToEdit.id) {
        await updateOrder(orderToEdit.id, payload);
        toast.success('Order updated successfully');
      } else {
        await addOrder(payload);
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
    <div className="space-y-5">
      <div className="rounded-[28px] bg-gradient-to-br from-[#131921] via-slate-900 to-[#222f3e] p-5 text-white shadow-lg">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-200">Current Order</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            {orderToEdit?.id ? 'Edit Order' : 'Create New Order'}
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-200">Beautifully organized order card • 200ML Bottle SKU</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-[26px] border border-orange-100 bg-white/95 p-4 shadow-sm">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Select Client</label>
          <select
            required
            className="mt-1 w-full rounded-2xl border border-orange-100 bg-gradient-to-b from-orange-50 to-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-orange-200"
            value={formData.clientId}
            onChange={e => setFormData({ ...formData, clientId: e.target.value })}
          >
            <option value="">-- Choose Client --</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[26px] border border-blue-100 bg-white p-4 shadow-sm">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Quantity (Boxes)</label>
            <div className="relative mt-1">
              <Package className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
              <input
                type="number"
                required
                className="w-full rounded-2xl border border-blue-100 bg-blue-50/60 py-3 pl-9 pr-3 font-black outline-none focus:ring-2 focus:ring-blue-200"
                value={formData.qty}
                onChange={e => setFormData({ ...formData, qty: e.target.value })}
              />
            </div>
          </div>
          <div className="rounded-[26px] border border-emerald-100 bg-white p-4 shadow-sm">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Rate / Box (₹)</label>
            <div className="relative mt-1">
              <IndianRupee className="absolute left-3 top-3 h-4 w-4 text-emerald-400" />
              <input
                type="number"
                required
                className="w-full rounded-2xl border border-emerald-100 bg-emerald-50/60 py-3 pl-9 pr-3 font-black outline-none focus:ring-2 focus:ring-emerald-200"
                value={formData.rate}
                onChange={e => setFormData({ ...formData, rate: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[26px] border border-violet-100 bg-white p-4 shadow-sm">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Delivery Date</label>
            <input
              type="date"
              required
              className="mt-1 w-full rounded-2xl border border-violet-100 bg-violet-50/60 p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-200"
              value={formData.date}
              onChange={e => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div className="rounded-[26px] border border-cyan-100 bg-white p-4 shadow-sm">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Time</label>
            <div className="relative mt-1">
              <Clock className="absolute left-3 top-3 h-4 w-4 text-cyan-400" />
              <input
                type="time"
                required
                className="w-full rounded-2xl border border-cyan-100 bg-cyan-50/60 py-3 pl-9 pr-3 text-sm font-bold outline-none focus:ring-2 focus:ring-cyan-200"
                value={formData.time}
                onChange={e => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-[26px] border border-pink-100 bg-white p-4 shadow-sm">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Full Address</label>
          <textarea
            required
            rows="2"
            className="mt-1 w-full rounded-2xl border border-pink-100 bg-pink-50/60 p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-pink-200"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
        </div>

        <div className="rounded-[26px] border border-amber-100 bg-white p-4 shadow-sm">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Actual Location (Type & Select)</label>
          <div className="mb-2 mt-1 overflow-hidden rounded-2xl border border-amber-100">
            <GoogleMapPicker
              initialAddress={formData.location}
              onChange={handleLocationChange}
            />
          </div>
          <input
            type="text"
            placeholder="Resolved location / place"
            maxLength={150}
            className="w-full rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
            value={formData.location}
            onChange={e => setFormData({ ...formData, location: e.target.value })}
          />
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2">
            <MapPinned className="h-4 w-4 text-orange-500" />
            {formData.mapLink ? (
              <a className="truncate text-xs font-semibold text-blue-600 underline" href={formData.mapLink} target="_blank" rel="noreferrer">
                Open selected map link
              </a>
            ) : (
              <span className="text-xs text-gray-500">Pick a point to generate map link</span>
            )}
          </div>
        </div>

        {orderToEdit?.status === 'Delivered' && (
          <div className="rounded-[26px] border border-blue-100 bg-white p-4 shadow-sm">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-500">Delivery Proof (Photo URL/Drive)</label>
            <div className="relative mt-1">
              <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
              <input
                type="url"
                placeholder="Paste image link here"
                className="w-full rounded-2xl border border-blue-200 bg-blue-50 py-3 pl-9 pr-3 text-sm text-blue-800 outline-none focus:ring-2 focus:ring-blue-200"
                value={formData.proofUrl}
                onChange={e => setFormData({ ...formData, proofUrl: e.target.value })}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-[26px] border border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-100 p-4 shadow-sm">
          <span className="text-xs font-black uppercase tracking-widest text-orange-800">Total Value</span>
          <span className="text-2xl font-black text-[#ff9900]">₹{total.toLocaleString()}</span>
        </div>

        <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-gray-100 bg-white/95 pb-1 pt-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full rounded-2xl border border-gray-300 py-4 font-black uppercase tracking-widest text-gray-700 transition-transform active:scale-95 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            className="w-full rounded-2xl bg-[#131921] py-4 font-black uppercase tracking-widest text-[#ff9900] transition-transform active:scale-95 disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
