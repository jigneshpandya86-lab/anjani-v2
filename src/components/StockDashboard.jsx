import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import toast from 'react-hot-toast';
import { Plus, History, Tag, ArrowUpRight, ArrowDownLeft, X, Trash2 } from 'lucide-react';

export default function StockDashboard() {
  const { stockEntries, stockTotal, addStockManual, deleteStockEntry, fetchStock } = useClientStore();
  const [showAdd, setShowAdd] = useState(false);
  const [qty, setQty] = useState('');
  const [narration, setNarration] = useState('');

  const getDefaultDateRange = () => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    const toInputDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    return {
      start: toInputDate(start),
      end: toInputDate(end),
    };
  };

  const [startDate, setStartDate] = useState(() => getDefaultDateRange().start);
  const [endDate, setEndDate] = useState(() => getDefaultDateRange().end);
  const MIN_VISIBLE_ITEMS = 50;

  useEffect(() => {
    const unsub = fetchStock();
    return () => {
      if (unsub) unsub();
    };
  }, [fetchStock]);

  const toDateKey = (value) => {
    if (!value) return '';

    let dateObj = null;

    if (value?.toDate) {
      dateObj = value.toDate();
    } else if (value?.seconds) {
      dateObj = new Date(value.seconds * 1000);
    } else if (typeof value === 'string') {
      // Supports legacy dd-mm-yyyy strings and ISO-like strings.
      const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (ddmmyyyy) {
        const [, dd, mm, yyyy] = ddmmyyyy;
        return `${yyyy}-${mm}-${dd}`;
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    } else if (value instanceof Date) {
      dateObj = value;
    }

    if (!dateObj || Number.isNaN(dateObj.getTime())) return '';

    // Use local calendar date to avoid timezone drift from toISOString().
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Total stock now comes from aggregate summary doc, so list queries can stay limited.
  const totalStock = Number(stockTotal) || 0;

  // Filters ONLY the visual transaction log
  const filtered = stockEntries.filter(entry => {
    if (!startDate && !endDate) return true;
    const entryDate = toDateKey(entry.date || entry.createdAt);
    if (!entryDate) return false;
    
    if (startDate && entryDate < startDate) return false;
    if (endDate && entryDate > endDate) return false;
    return true;
  });

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!qty) return;
    await addStockManual(qty, narration);
    setQty('');
    setNarration('');
    setShowAdd(false);
  };

  const closeAddModal = () => {
    setShowAdd(false);
    setQty('');
    setNarration('');
  };

  const handleDelete = async (entry) => {
    const label = entry.narration || entry.note || 'this entry';
    const confirmed = window.confirm(`Delete "${label}"? This will update live stock total.`);
    if (!confirmed) return;

    try {
      await deleteStockEntry(entry.id);
      toast.success('Stock entry deleted');
    } catch (error) {
      toast.error(`Failed to delete entry: ${error.message}`);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Stock Summary + Date Range Filter (single line, light theme) */}
      <div className="bg-white/90 backdrop-blur-sm p-3.5 rounded-[26px] border border-slate-200/80 shadow-[0_8px_24px_rgba(148,163,184,0.12)] flex items-end gap-2.5">
        <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100/80 border border-amber-200/70 rounded-[20px] px-3.5 py-2.5 min-w-[124px] shadow-inner">
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-700 mb-0.5">Live Total</p>
          <h2 className="text-[1.35rem] leading-none font-black whitespace-nowrap text-gray-900">
            {totalStock.toLocaleString()} <span className="text-[10px] font-medium text-slate-500">Boxes</span>
          </h2>
        </div>
        <div className="flex-1 flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <label className="text-[8px] font-semibold text-slate-500 uppercase ml-1 tracking-[0.18em]">Start</label>
            <input type="date" className="w-full bg-slate-50/90 px-2.5 py-2 rounded-xl text-[12px] font-semibold text-slate-700 outline-none border border-slate-200 focus:ring-2 focus:ring-amber-100 focus:border-amber-200 transition" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-[8px] font-semibold text-slate-500 uppercase ml-1 tracking-[0.18em]">End</label>
            <input type="date" className="w-full bg-slate-50/90 px-2.5 py-2 rounded-xl text-[12px] font-semibold text-slate-700 outline-none border border-slate-200 focus:ring-2 focus:ring-amber-100 focus:border-amber-200 transition" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                const { start, end } = getDefaultDateRange();
                setStartDate(start);
                setEndDate(end);
              }}
              className="text-[10px] font-semibold text-rose-400 uppercase px-1.5 pb-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Ledger Entries */}
      <div className="space-y-2 pb-6">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center justify-between gap-2 mt-3">
          <span className="flex items-center gap-2">
          <History size={12}/> Movement Log
          </span>
          <span className="text-[9px] text-slate-400 font-medium normal-case tracking-normal">
            Showing up to {Math.min(filtered.length, MIN_VISIBLE_ITEMS)} of {filtered.length}
          </span>
        </h3>
        {filtered.slice(0, MIN_VISIBLE_ITEMS).map((entry, index) => (
          <div
            key={entry.id}
            className={`px-3.5 py-3.5 rounded-[22px] border flex justify-between items-center shadow-sm hover:shadow-md transition-all ${
              index % 2 === 0
                ? 'bg-slate-50/85 border-slate-200/90'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex gap-3 items-center min-w-0">
              <div className={`p-2 rounded-2xl flex-shrink-0 ${entry.qty > 0 ? 'bg-emerald-50 text-emerald-500 border border-emerald-100' : 'bg-rose-50 text-rose-400 border border-rose-100'}`}>
                {entry.qty > 0 ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 leading-tight text-[14px] truncate">
                  {entry.narration || entry.note || 'Adjustment'}
                </p>
                <p className="text-[10px] text-slate-500 font-medium uppercase mt-1 flex items-center gap-1 tracking-wide">
                  <Tag size={8}/> {entry.type || 'entry'} • {(entry.date?.toDate ? entry.date : entry.createdAt)?.toDate ? (entry.date?.toDate ? entry.date : entry.createdAt).toDate().toLocaleDateString('en-IN') : 'Recent'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 pl-2">
              <p className={`font-bold text-[1.85rem] leading-none flex-shrink-0 tracking-tight ${entry.qty > 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                {entry.qty > 0 ? '+' : ''}{entry.qty}
              </p>
              <button
                type="button"
                onClick={() => handleDelete(entry)}
                className="h-9 w-9 rounded-2xl border border-rose-100 bg-rose-50 text-rose-400 hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center"
                aria-label={`Delete ${entry.narration || entry.note || 'stock entry'}`}
                title="Delete stock entry"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-slate-400 text-xs font-medium py-6">No movements found.</p>
        )}
      </div>

      {/* Add Stock Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={closeAddModal}>
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-5 pt-12" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeAddModal}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close stock form"
            >
              <X size={18} />
            </button>
            <h3 className="font-black text-[#131921] text-lg mb-1">Add Stock</h3>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Manual Inventory Entry</p>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Quantity (Boxes)</label>
                <input type="number" placeholder="Quantity (+ for in, - for out)" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-300 outline-none font-bold focus:ring-2 focus:ring-amz-orange focus:border-amz-orange" value={qty} onChange={e => setQty(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Narration / Note</label>
                <input type="text" placeholder="e.g. Received from factory" className="w-full p-3 bg-gray-50 rounded-xl border border-gray-300 outline-none text-sm focus:ring-2 focus:ring-amz-orange focus:border-amz-orange" value={narration} onChange={e => setNarration(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="w-full bg-gray-100 border border-gray-300 text-gray-700 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-200 active:shadow-inner transition-all"
                >
                  Cancel
                </button>
                <button className="w-full bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-bold py-3 px-4 rounded-lg shadow-sm hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner transition-all">
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-4 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
        aria-label="Add stock entry"
        title="Add stock entry"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
