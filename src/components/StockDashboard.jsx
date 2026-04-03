import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import { Package, Plus, History, Tag, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function StockDashboard() {
  const { stockEntries, addStockManual, fetchStock } = useClientStore();
  const [showAdd, setShowAdd] = useState(false);
  const [qty, setQty] = useState('');
  const [narration, setNarration] = useState('');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const MIN_VISIBLE_ITEMS = 15;

  useEffect(() => { fetchStock(); }, []);

  // Total Stock strictly calculates ALL time, unaffected by date filters
  const totalStock = stockEntries.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);

  // Filters ONLY the visual transaction log
  const filtered = stockEntries.filter(entry => {
    if (!startDate && !endDate) return true;
    const entryDate = entry.date?.toDate ? entry.date.toDate().toISOString().split('T')[0] : '';
    if (!entryDate) return true;
    
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!qty) return;
    await addStockManual(qty, narration);
    setQty(''); setNarration(''); setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      {/* Small Stock Summary Card */}
      <div className="bg-[#131921] rounded-2xl px-4 py-3.5 text-white shadow-lg flex justify-between items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">Live Total</p>
          <h2 className="text-[2rem] leading-none font-black">{totalStock.toLocaleString()} <span className="text-xs font-semibold text-gray-400">Boxes</span></h2>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-[#ff9900] text-white p-2.5 rounded-lg flex items-center justify-center">
          <Plus size={18} strokeWidth={3}/>
        </button>
      </div>

      {/* Manual Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm animate-slide-up space-y-3">
          <input type="number" placeholder="Quantity (+ for in, - for out)" className="w-full p-3 bg-gray-50 rounded-xl border outline-none font-bold" value={qty} onChange={e => setQty(e.target.value)} required />
          <input type="text" placeholder="Narration / Note..." className="w-full p-3 bg-gray-50 rounded-xl border outline-none text-sm" value={narration} onChange={e => setNarration(e.target.value)} required />
          <button className="w-full bg-[#131921] text-[#ff9900] py-3 rounded-xl font-black uppercase text-sm">Save Entry</button>
        </form>
      )}

      {/* Date Range Filter */}
      <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex gap-2 items-center">
        <div className="flex-1">
          <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Start</label>
          <input type="date" className="w-full bg-gray-50 p-2 rounded-lg text-sm font-bold outline-none border-none" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="text-[9px] font-black text-gray-400 uppercase ml-1">End</label>
          <input type="date" className="w-full bg-gray-50 p-2 rounded-lg text-sm font-bold outline-none border-none" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        {(startDate || endDate) && (
          <button onClick={() => {setStartDate(''); setEndDate('');}} className="mt-4 text-[10px] font-black text-red-400 uppercase px-2">Clear</button>
        )}
      </div>

      {/* Ledger Entries */}
      <div className="space-y-1.5 pb-6">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1 flex items-center justify-between gap-2 mt-3">
          <span className="flex items-center gap-2">
          <History size={12}/> Movement Log
          </span>
          <span className="text-[9px] text-gray-400 font-bold normal-case tracking-normal">
            Showing up to {Math.min(filtered.length, MIN_VISIBLE_ITEMS)} of {filtered.length}
          </span>
        </h3>
        {filtered.slice(0, MIN_VISIBLE_ITEMS).map(entry => (
          <div key={entry.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div className="flex gap-3 items-center">
              <div className={`p-1.5 rounded-full flex-shrink-0 ${entry.qty > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                {entry.qty > 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
              </div>
              <div>
                <p className="font-bold text-gray-900 leading-tight text-[13px]">
                  {entry.narration || entry.note || 'Adjustment'}
                </p>
                <p className="text-[9px] text-gray-400 font-bold uppercase mt-1 flex items-center gap-1">
                  <Tag size={8}/> {entry.type || 'entry'} • {entry.date?.toDate ? entry.date.toDate().toLocaleDateString('en-IN') : 'Recent'}
                </p>
              </div>
            </div>
            <p className={`font-black text-lg leading-none flex-shrink-0 ${entry.qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
              {entry.qty > 0 ? '+' : ''}{entry.qty}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-xs font-bold py-6">No movements found.</p>
        )}
      </div>
    </div>
  );
}
