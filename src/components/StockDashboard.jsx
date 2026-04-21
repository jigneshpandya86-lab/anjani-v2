import { useState, useEffect } from 'react';
import { useClientStore } from '../store/clientStore';
import toast from 'react-hot-toast';
import { Plus, History, Tag, ArrowUpRight, ArrowDownLeft, X, Trash2, RefreshCw } from 'lucide-react';

export default function StockDashboard() {
  const { stockEntries, stockTotal, addStockManual, deleteStockEntry, fetchStock, recalculateStockTotal, loading } = useClientStore();
  const [showAdd, setShowAdd] = useState(false);
  const [qty, setQty] = useState('');
  const [narration, setNarration] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleRecalculate = async () => {
    setIsSyncing(true);
    try {
      await recalculateStockTotal();
      toast.success('Stock total synchronized');
    } catch (error) {
      toast.error('Failed to sync stock');
    } finally {
      setIsSyncing(false);
    }
  };

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
    <div className="space-y-2 pb-20">
      {/* Stock Summary + Date Range Filter */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3.5 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">Stock Ledger</p>
          <div className="flex items-center gap-1.5 text-[10px] bg-white/20 text-white px-2 py-1 rounded-full font-black uppercase shadow-sm backdrop-blur-sm">
            <input
              type="date"
              className="w-[96px] bg-transparent text-white text-[10px] font-bold outline-none"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span className="text-white/70">—</span>
            <input
              type="date"
              className="w-[96px] bg-transparent text-white text-[10px] font-bold outline-none"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="relative mt-2 flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl leading-none font-black whitespace-nowrap text-white">
              {totalStock.toLocaleString()} <span className="text-[10px] font-bold text-white/80 uppercase tracking-[0.08em]">Boxes</span>
            </h2>
            <button
              onClick={handleRecalculate}
              disabled={isSyncing || loading}
              className={`p-1 rounded-full bg-white/10 hover:bg-white/20 transition-all ${isSyncing ? 'animate-spin' : ''}`}
              title="Recalculate Total from Ledger"
            >
              <RefreshCw size={12} className="text-white/70" />
            </button>
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                const { start, end } = getDefaultDateRange();
                setStartDate(start);
                setEndDate(end);
              }}
              className="text-[10px] font-semibold text-white/80 uppercase px-1.5"
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
        {filtered.slice(0, MIN_VISIBLE_ITEMS).map((entry, index) => {
          const isIncrease = entry.qty > 0
          return (
            <div
              key={entry.id}
              className={`relative overflow-hidden ${index % 2 === 0 ? 'bg-slate-50/95' : 'bg-white'} px-2.5 py-2 rounded-xl shadow-[0_4px_12px_rgba(15,23,42,0.05)] border border-white/80 border-l-[3px] ${isIncrease ? 'border-l-emerald-500' : 'border-l-rose-500'} transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_16px_rgba(15,23,42,0.08)]`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.5),transparent_35%,rgba(148,163,184,0.04))]" />
              <div className="relative space-y-1">
                <div className="flex items-start gap-2">
                  <div className={`p-1.5 rounded-lg shadow-inner ${isIncrease ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-400'} shrink-0`}>
                    {isIncrease ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-extrabold text-sm text-gray-900 leading-tight">
                        {entry.narration || entry.note || 'Adjustment'}
                      </p>
                      <span className="shrink-0 text-[9px] font-semibold text-gray-500 tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full uppercase">
                        {entry.type || 'entry'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry)}
                    className="shrink-0 flex items-center justify-center rounded-md bg-rose-50 p-1 text-rose-500 transition-colors hover:bg-rose-100"
                    aria-label={`Delete ${entry.narration || entry.note || 'stock entry'}`}
                    title="Delete stock entry"
                  >
                    <Trash2 size={12} />
                  </button>
                  <p className={`shrink-0 font-black text-lg leading-none ${isIncrease ? 'text-emerald-500' : 'text-rose-400'}`}>
                    {isIncrease ? '+' : ''}{entry.qty}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 pl-8">
                  <p className="truncate text-[10px] text-gray-500 flex items-center gap-1 uppercase tracking-wide font-bold">
                    <Tag size={8}/> {(entry.date?.toDate ? entry.date : entry.createdAt)?.toDate ? (entry.date?.toDate ? entry.date : entry.createdAt).toDate().toLocaleDateString('en-IN') : 'Recent'}
                  </p>
                  <p className="shrink-0 inline-flex text-[8px] text-gray-600 font-extrabold uppercase tracking-wide bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {isIncrease ? 'STOCK IN' : 'STOCK OUT'}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
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
        className="fixed bottom-24 right-4 z-[998] bg-[#ff9900] text-white w-14 h-14 rounded-full shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
        aria-label="Add stock entry"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
