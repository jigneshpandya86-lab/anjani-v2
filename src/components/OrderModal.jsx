import { useState, useEffect, useCallback } from 'react';
import { useClientStore } from '../store/clientStore';
import { Package, Clock, IndianRupee, Image as ImageIcon, MapPinned } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleMapPicker from './GoogleMapPicker';

export default function OrderModal({ orderToEdit, onClose }) {
  const clients = useClientStore(state => state.clients);
  const addOrder = useClientStore(state => state.addOrder);
  const updateOrder = useClientStore(state => state.updateOrder);
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
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-xl font-black uppercase text-gray-800 tracking-tight">
          {orderToEdit?.id ? 'Edit Order' : 'New Order'}
        </h2>
        <p className="text-xs text-gray-400 font-bold">200ML BOTTLE SKU</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="client-select" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Client</label>
          <select id="client-select" required className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-bold text-sm"
            value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
            <option value="">-- Choose Client --</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="qty-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity (Boxes)</label>
            <div className="relative">
              <Package className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input id="qty-input" type="number" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-black"
                value={formData.qty} onChange={e => setFormData({...formData, qty: e.target.value})} />
            </div>
          </div>
          <div>
            <label htmlFor="rate-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Rate / Box (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input id="rate-input" type="number" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none font-black"
                value={formData.rate} onChange={e => setFormData({...formData, rate: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="date-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delivery Date</label>
            <input id="date-input" type="date" required className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
              value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
          </div>
          <div>
            <label htmlFor="time-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Time</label>
            <div className="relative">
              <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input id="time-input" type="time" required className="w-full pl-9 pr-3 py-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-bold"
                value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="address-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Address</label>
          <textarea id="address-input" required rows="2" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm font-medium"
            value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
        </div>


        <div>
          <label htmlFor="location-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Actual Location (Type & Select)</label>
          <div className="mt-1 mb-2">
            <GoogleMapPicker
              initialAddress={formData.location}
              onChange={handleLocationChange}
            />
          </div>
          <input
            id="location-input"
            type="text"
            placeholder="Resolved location / place"
            maxLength={150}
            className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-sm"
            value={formData.location}
            onChange={e => setFormData({ ...formData, location: e.target.value })}
          />
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <MapPinned className="h-4 w-4 text-amz-orange" />
            {formData.mapLink ? (
              <a className="text-xs text-blue-600 underline truncate" href={formData.mapLink} target="_blank" rel="noreferrer">
                Open selected map link
              </a>
            ) : (
              <span className="text-xs text-gray-500">Pick a point to generate map link</span>
            )}
          </div>
        </div>

        {orderToEdit?.status === 'Delivered' && (
          <div>
            <label htmlFor="proof-input" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delivery Proof (Photo URL/Drive)</label>
            <div className="relative">
              <ImageIcon className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input id="proof-input" type="url" placeholder="Paste image link here" className="w-full pl-9 pr-3 py-3 bg-blue-50 text-blue-800 rounded-xl border border-blue-200 outline-none text-sm"
                value={formData.proofUrl} onChange={e => setFormData({...formData, proofUrl: e.target.value})} />
            </div>
          </div>
        )}

        <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex justify-between items-center mt-2">
          <span className="text-xs font-black text-orange-800 uppercase tracking-widest">Total Value</span>
          <span className="text-xl font-black text-[#ff9900]">₹{total.toLocaleString()}</span>
        </div>

        <div className="sticky bottom-0 bg-white pt-3 pb-1 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full border border-gray-300 text-gray-700 py-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            disabled={loading}
            className="w-full bg-[#131921] text-[#ff9900] py-4 rounded-xl font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
