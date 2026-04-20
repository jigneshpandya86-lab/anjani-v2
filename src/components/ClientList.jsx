import { useState, useMemo, useCallback } from 'react';
import { useClientStore } from '../store/clientStore';
import { Search, Phone, MessageSquare, ShoppingCart, IndianRupee, Edit3, UserX, UserCheck, Flag } from 'lucide-react';

export default function ClientList({ onEdit, onPay, onOrder }) {
  const clients = useClientStore(state => state.clients);
  const updateClient = useClientStore(state => state.updateClient);
  const [search, setSearch] = useState('');
  const [sortByDue, setSortByDue] = useState(false);

  const filtered = useMemo(() => (clients || [])
    .filter(c =>
      (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.mobile || '').includes(search)
    )
    .sort((a, b) => {
      if (!sortByDue) return 0;
      return Number(b.outstanding || 0) - Number(a.outstanding || 0);
    }), [clients, search, sortByDue]);

  const toggleStatus = useCallback((client) => {
    updateClient(client.id, { active: !client.active });
  }, [updateClient]);

  const getOutstandingMessage = (client) => {
    const pendingAmount = Number(client.outstanding || 0).toLocaleString();
    const clientName = client.name || 'there';

    return encodeURIComponent(
      `Hi ${clientName}, this is a gentle reminder for your pending payment of ₹${pendingAmount}. Kindly share the payment at your convenience. Thank you.`
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input 
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-[#ff9900] outline-none"
            placeholder="Search Name or Mobile..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={() => setSortByDue(prev => !prev)}
          className={`h-10 w-10 rounded-lg border flex-shrink-0 bg-white cursor-pointer transition-colors flex items-center justify-center ${
            sortByDue ? 'border-[#ff9900] text-[#ff9900]' : 'border-gray-300 text-gray-500'
          }`}
          aria-label={sortByDue ? 'Disable due amount sorting' : 'Sort by highest due amount'}
          title="Sort by highest due"
        >
          <Flag className="w-4 h-4" />
        </button>
      </div>

      {filtered.length === 0 && search === '' && (
        <div className="text-center p-10 text-gray-400 italic">No clients found in database...</div>
      )}

      {filtered.map(client => (
        <div key={client.id} className={`bg-white p-4 rounded-lg border shadow-sm ${!client.active && 'opacity-60 bg-gray-50'}`}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-gray-900 leading-tight">{client.name || 'Unnamed Client'}</h3>
              <p className="text-[10px] text-gray-500 font-mono">ID: {client.shortId || 'LEGACY'}</p>
              <p className="text-[11px] text-gray-500 font-semibold">Rate: ₹{Number(client.rate || 0).toLocaleString()}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => toggleStatus(client)} className="p-1 text-gray-400 hover:text-green-500">
                {client.active ? <UserCheck className="w-5 h-5 text-green-500" /> : <UserX className="w-5 h-5 text-red-400" />}
              </button>
              <button onClick={() => onEdit(client)} className="p-1 text-gray-400 hover:text-[#ff9900]">
                <Edit3 className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center gap-3">
             <div className="grid grid-cols-5 gap-2 flex-1">
               <a href={`tel:${client.mobile}`} className="flex justify-center p-2 bg-blue-50 text-blue-600 rounded-md"><Phone className="w-4 h-4" /></a>
               <a
                 href={`https://wa.me/91${client.mobile}?text=${getOutstandingMessage(client)}`}
                 className="flex justify-center p-2 bg-green-50 text-green-600 rounded-md"
               >
                 <MessageSquare className="w-4 h-4" />
               </a>
               <button
                 onClick={() => onOrder(client)}
                 className="flex justify-center p-2 bg-orange-50 text-orange-600 rounded-md"
               >
                 <ShoppingCart className="w-4 h-4" />
               </button>
               <button onClick={() => onPay(client)} className="flex justify-center p-2 bg-purple-50 text-purple-600 rounded-md"><IndianRupee className="w-4 h-4" /></button>
             </div>
             <div className="text-right min-w-[80px]">
                <p className="text-[9px] uppercase font-bold text-gray-400 leading-none">Balance</p>
                <p className={`font-black text-sm ${client.outstanding > 0 ? 'text-red-500' : 'text-green-600'}`}>
                  ₹{Number(client.outstanding || 0).toLocaleString()}
                </p>
             </div>
          </div>
        </div>
      ))}
    </div>
  );
}
