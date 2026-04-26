import { useCallback, useState } from "react";
import { useClientStore } from "../store/clientStore";
import { UserPlus, CheckCircle, MapPinned, AlertTriangle } from "lucide-react";
import toast from 'react-hot-toast';
import GoogleMapPicker from './GoogleMapPicker';

export default function AddClient({ onDone, client }) {
  // If editing, fill in the blanks. If new, leave empty!
  const [name, setName] = useState(client ? client.name : "");
  const [phone, setPhone] = useState(client ? client.mobile : "");
  const [address, setAddress] = useState(client ? client.address : "");
  const [rate, setRate] = useState(client ? String(client.rate ?? "") : "");
  const [locationAddress, setLocationAddress] = useState(
    client?.location || client?.googleLocation || client?.locationName || ''
  );
  const [mapLink, setMapLink] = useState(client?.mapLink || client?.googleMap || '');
  const [locationLat, setLocationLat] = useState(() => {
    const parsed = Number(client?.locationLat ?? client?.lat);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [locationLng, setLocationLng] = useState(() => {
    const parsed = Number(client?.locationLng ?? client?.lng);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [isDefaulter, setIsDefaulter] = useState(client ? (client.isDefaulter ?? false) : false);
  const [status, setStatus] = useState("idle");

  const addClient = useClientStore((state) => state.addClient);
  const updateClient = useClientStore((state) => state.updateClient);

  const handleLocationChange = useCallback(({ lat, lng, address: resolvedAddress, mapLink: resolvedMapLink }) => {
    setLocationLat(lat);
    setLocationLng(lng);
    if (resolvedAddress) {
      setLocationAddress(resolvedAddress);
      setAddress((prev) => (prev.trim() ? prev : resolvedAddress));
    }
    if (resolvedMapLink) setMapLink(resolvedMapLink);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("saving");

    try {
      const payload = {
        name,
        mobile: phone,
        address,
        rate: rate === "" ? 0 : Number(rate),
        location: locationAddress || mapLink || '',
        mapLink: mapLink || '',
        locationLat: Number.isFinite(Number(locationLat)) ? Number(locationLat) : null,
        locationLng: Number.isFinite(Number(locationLng)) ? Number(locationLng) : null,
        isDefaulter,
      };

      if (client) {
        await updateClient(client.id, payload);
        toast.success("Client updated successfully");
      } else {
        await addClient({
          ...payload,
          phone,
        });
        toast.success("Client created successfully");
      }

      setName("");
      setPhone("");
      setAddress("");
      setRate("");
      setLocationAddress('');
      setMapLink('');
      setLocationLat(null);
      setLocationLng(null);
      setIsDefaulter(false);
      setStatus("idle");
      if (onDone) onDone();
    } catch (error) {
      toast.error("Failed to save client: " + error.message);
      setStatus("idle");
    }
  };

  return (
    <div className="bg-white rounded-xl w-full">
      <div className="bg-amz-navy text-white p-4 rounded-t-xl flex items-center gap-2">
        <UserPlus className="text-amz-orange" />
        <h2 className="font-bold text-lg">Add New Client</h2>
      </div>

      <div className="p-5">
        {status === "success" ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg flex items-center gap-3 border border-green-200 animate-pulse">
            <CheckCircle className="w-6 h-6" />
            <p className="font-bold">Client Saved Successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="client-name" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Client Name</label>
              <input id="client-name" required value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="e.g. Rahul Sharma" />
            </div>

            <div>
              <label htmlFor="mobile-number" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Mobile Number</label>
              <input id="mobile-number" required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="10-digit mobile number" />
            </div>

            <div>
              <label htmlFor="address-input" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Delivery Address</label>
              <textarea id="address-input" required rows="3" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="Full delivery address..." />
            </div>

            <div>
              <label htmlFor="location-input" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Actual Location (Type & Select)</label>
              <GoogleMapPicker
                initialAddress={locationAddress}
                onChange={handleLocationChange}
              />
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  id="location-input"
                  type="text"
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                  placeholder="Location name/address from map"
                />
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <MapPinned className="h-4 w-4 text-amz-orange" />
                  {mapLink ? (
                    <a className="text-xs text-blue-600 underline truncate" href={mapLink} target="_blank" rel="noreferrer">Open selected map link</a>
                  ) : (
                    <span className="text-xs text-gray-500">Pick a point to generate map link</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="rate-input" className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Rate (₹ / Box)</label>
              <input
                id="rate-input"
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none"
                placeholder="e.g. 125"
              />
            </div>

            <div>
              <p className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Defaulter Status</p>
              <button
                type="button"
                onClick={() => setIsDefaulter(prev => !prev)}
                className={`flex items-center gap-2 w-full p-3 rounded-lg border text-sm font-semibold transition-all ${
                  isDefaulter
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-gray-50 border-gray-300 text-gray-500'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${isDefaulter ? 'text-red-500' : 'text-gray-400'}`} />
                <span className="flex-1 text-left">{isDefaulter ? 'Marked as Defaulter' : 'Not a Defaulter'}</span>
                <span className={`w-10 h-5 rounded-full transition-colors relative ${isDefaulter ? 'bg-red-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDefaulter ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </span>
              </button>
              <p className="text-[10px] text-gray-400 mt-1">Defaulters will receive automated payment reminder SMS.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onDone?.()}
                disabled={status === "saving"}
                className="w-full bg-gray-100 border border-gray-300 text-gray-700 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-200 active:shadow-inner disabled:opacity-50 transition-all"
              >
                Cancel
              </button>

              <button type="submit" disabled={status === "saving"} className="w-full bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50 transition-all flex justify-center items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {status === "saving" ? "Saving..." : "Save Client"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
