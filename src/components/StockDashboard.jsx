import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import { Package, Plus, History, Calendar, Tag, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function StockDashboard() {
  const { stockEntries, addStockManual, fetchStock } = useClientStore();
  const [showAdd, setShowAdd] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => { fetchStock(); }, []);

  const totalStock = stockEntries.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);

  const filtered = stockEntries.filter(entry => {
    if (!filterDate) return true;
    const entryDate = entry.date?.toDate ? entry.date.toDate().toISOString().split('T')[0] : '';
    return entryDate === filterDate;
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!qty) return;
    await addStockManual(qty, note);
    setQty(''); setNote(''); setShowAdd(false);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Stock Summary Card */}
      <div className="bg-[#131921] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">Live Inventory</p>
          <h2 className="text-4xl font-black">{totalStock.toLocaleString()} <span className="text-sm font-medium text-gray-400">Boxes</span></h2>
          <button onClick={() => setShowAdd(!showAdd)} className="mt-4 bg-[#ff9900] text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
            <Plus size={16} strokeWidth={3}/> Add Stock
          </button>
        </div>
        <Package className="absolute -right-4 -bottom-4 text-white/5 w-32 h-32 rotate-12" />
      </div>

      {/* Manual Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border-2 border-orange-100 animate-slide-up space-y-3">
          <input type="number" placeholder="Quantity to add..." className="w-full p-3 bg-gray-50 rounded-xl border outline-none font-bold" value={qty} onChange={e => setQty(e.target.value)} required />
          <input type="text" placeholder="Note (e.g. New Shipment)..." className="w-full p-3 bg-gray-50 rounded-xl border outline-none text-sm" value={note} onChange={e => setNote(e.target.value)} />
          <button className="w-full bg-[#131921] text-[#ff9900] py-3 rounded-xl font-black uppercase">Confirm Addition</button>
        </form>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100">
        <Calendar size={18} className="text-gray-400 ml-2" />
        <input type="date" className="flex-1 bg-transparent p-2 text-sm font-bold outline-none" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button onClick={() => setFilterDate('')} className="text-[10px] font-black text-gray-400 uppercase pr-2">Clear</button>}
      </div>

      {/* Ledger Entries */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 flex items-center gap-2">
          <History size={12}/> Transaction Log
        </h3>
        {filtered.map(entry => (
          <div key={entry.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div className="flex gap-3 items-center">
              <div className={`p-2 rounded-full ${entry.qty > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {entry.qty > 0 ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
              </div>
              <div>
                <p className="font-bold text-gray-900 leading-tight">{entry.note || 'Inventory Adjustment'}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 flex items-center gap-1">
                  <Tag size={8}/> {entry.type} • {entry.date?.toDate ? entry.date.toDate().toLocaleDateString('en-IN') : 'Recent'}
                </p>
              </div>
            </div>
            <p className={`font-black text-lg ${entry.qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {entry.qty > 0 ? '+' : ''}{entry.qty}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
