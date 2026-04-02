import { useState } from "react";
import { useClientStore } from "../store/clientStore";
import { UserPlus, CheckCircle } from "lucide-react";

export default function AddClient({ onDone }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("idle");

  const addClient = useClientStore((state) => state.addClient);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("saving");

    // Send data to the store
    await addClient({ name, phone, address });

    // Show success and close modal
    setStatus("success");
    setTimeout(() => {
      setName("");
      setPhone("");
      setAddress("");
      setStatus("idle");
      if (onDone) onDone(); // This tells App.jsx to close the popup!
    }, 1500);
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
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Client Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="e.g. Rahul Sharma" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Mobile Number</label>
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="10-digit mobile number" />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Delivery Address</label>
              <textarea required rows="3" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amz-orange focus:border-amz-orange outline-none" placeholder="Full delivery address..." />
            </div>

            <button type="submit" disabled={status === "saving"} className="w-full bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50 transition-all flex justify-center items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {status === "saving" ? "Saving..." : "Save Client"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}