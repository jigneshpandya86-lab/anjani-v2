import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { Search, Phone, MessageSquare, ShoppingCart, IndianRupee, Edit3, FileText, UserX, UserCheck, Flag, Fingerprint } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ClientList({ onEdit, onPay, onOrder }) {
  const { clients, updateClient, generateLegacyClientIds } = useClientStore();
  const [search, setSearch] = useState('');
  const [sortByDue, setSortByDue] = useState(false);
  const [isGeneratingIds, setIsGeneratingIds] = useState(false);

  const legacyCount = (clients || []).filter((client) => !client.shortId || String(client.shortId).trim() === '').length;

  const filtered = (clients || [])
    .filter(c => 
      (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
      (c.mobile || '').includes(search)
    )
    .sort((a, b) => {
      if (!sortByDue) return 0;
      return Number(b.outstanding || 0) - Number(a.outstanding || 0);
    });

  const toggleStatus = (client) => {
    updateClient(client.id, { active: !client.active });
  };

  const handleGenerateLegacyIds = async () => {
    if (legacyCount === 0 || isGeneratingIds) return;

    try {
      setIsGeneratingIds(true);
      const updatedCount = await generateLegacyClientIds();
      toast.success(`Generated IDs for ${updatedCount} legacy client${updatedCount === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error(`Unable to generate IDs: ${error.message}`);
    } finally {
      setIsGeneratingIds(false);
    }
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
        <button
          onClick={handleGenerateLegacyIds}
          disabled={legacyCount === 0 || isGeneratingIds}
          className={`h-10 px-3 rounded-lg border flex-shrink-0 transition-colors flex items-center gap-1.5 text-xs font-semibold ${
            legacyCount > 0 && !isGeneratingIds
              ? 'bg-white border-gray-300 text-gray-600 hover:border-[#ff9900] hover:text-[#ff9900]'
              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          aria-label="Generate IDs for legacy clients"
          title={legacyCount > 0 ? `Generate IDs for ${legacyCount} legacy clients` : 'All clients already have IDs'}
        >
          <Fingerprint className="w-4 h-4" />
          <span>{isGeneratingIds ? 'Generating...' : `Fix IDs (${legacyCount})`}</span>
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
               <a href={`https://wa.me/91${client.mobile}`} className="flex justify-center p-2 bg-green-50 text-green-600 rounded-md"><MessageSquare className="w-4 h-4" /></a>
               <button
                 onClick={() => onOrder(client)}
                 className="flex justify-center p-2 bg-orange-50 text-orange-600 rounded-md"
               >
                 <ShoppingCart className="w-4 h-4" />
               </button>
               <button onClick={() => onPay(client)} className="flex justify-center p-2 bg-purple-50 text-purple-600 rounded-md"><IndianRupee className="w-4 h-4" /></button>
               <button className="flex justify-center p-2 bg-gray-50 text-gray-600 rounded-md"><FileText className="w-4 h-4" /></button>
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
