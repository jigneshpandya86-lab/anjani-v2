import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { Search, Phone, MessageSquare, ShoppingCart, IndianRupee, Edit3, UserX, UserCheck } from 'lucide-react';

export default function ClientList() {
  const { clients, updateClient } = useClientStore();
  const [search, setSearch] = useState('');

  const filtered = clients.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.mobile?.includes(search)
  );

  const toggleStatus = (client) => {
    updateClient(client.id, { active: !client.active });
  };

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
        <input 
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-amz-border bg-white text-sm focus:ring-2 focus:ring-amz-orange/20 outline-none"
          placeholder="Search Name or Mobile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Client Cards */}
      {filtered.map(client => (
        <div key={client.id} className={`bg-white p-4 rounded-lg border border-amz-border shadow-sm ${!client.active && 'opacity-60 bg-gray-50'}`}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-gray-900 leading-tight">{client.name}</h3>
              <p className="text-xs text-gray-500 font-mono">ID: {client.shortId || client.id || 'N/A'}</p>
            </div>
            <button onClick={() => toggleStatus(client)} className="text-gray-400 hover:text-red-500 transition-colors">
              {client.active ? <UserX className="w-5 h-5" /> : <UserCheck className="w-5 h-5 text-green-500" />}
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-3 line-clamp-1">{client.address}</p>

          {/* Action Bar */}
          <div className="grid grid-cols-5 border-t border-gray-100 pt-3 gap-2">
            <a href={`tel:${client.mobile}`} className="flex justify-center p-2 bg-blue-50 text-blue-600 rounded-md"><Phone className="w-4 h-4" /></a>
            <a href={`https://wa.me/91${client.mobile}`} className="flex justify-center p-2 bg-green-50 text-green-600 rounded-md"><MessageSquare className="w-4 h-4" /></a>
            <button className="flex justify-center p-2 bg-orange-50 text-orange-600 rounded-md"><ShoppingCart className="w-4 h-4" /></button>
            <button className="flex justify-center p-2 bg-purple-50 text-purple-600 rounded-md"><IndianRupee className="w-4 h-4" /></button>
            <button className="flex justify-center p-2 bg-gray-50 text-gray-600 rounded-md"><Edit3 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}