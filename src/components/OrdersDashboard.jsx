import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { Clock, Copy, Edit2, Trash2, Smartphone, Search, HandCoins, FileText } from 'lucide-react';

export default function OrdersDashboard({ onEdit, onCopy, onRecordPayment, onShareInvoice }) {
  const { orders, clients, updateOrder, deleteOrder } = useClientStore();
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Robust Client Fetcher
  const getDisplayName = (order) => {
    if (order.clientId) {
      const c = clients.find(c => c.id === order.clientId);
      if (c) return c.name;
    }
    // Fallback for old legacy names saved directly in order
    return order.clientName || order.customerName || order.customer || order.name || 'Legacy Client';
  };

  const getDisplayMobile = (order) => {
    if (order.clientId) {
      const c = clients.find(c => c.id === order.clientId);
      if (c) return c.mobile;
    }
    return order.mobile || order.phone || '';
  };

  const filteredOrders = orders.filter(o => {
    const name = getDisplayName(o);
    const mobile = getDisplayMobile(o);
    const matchesStatus = filter === 'All' || o.status === filter;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = name.toLowerCase().includes(searchLower) ||
                          (o.orderId || '').toLowerCase().includes(searchLower) ||
                          mobile.includes(searchLower);
    return matchesStatus && matchesSearch;
  });

  const shareOrder = (order) => {
    const msg = `🚚 *NEW DELIVERY ASSIGNMENT*\n\n*ID:* ${order.orderId || 'N/A'}\n*Client:* ${getDisplayName(order)}\n*Mobile:* ${getDisplayMobile(order)}\n*Date:* ${order.date || 'TBD'} at ${order.time || 'TBD'}\n*Qty:* ${order.qty || 0} Boxes (200ml)\n\n*Address:*\n${order.address || 'N/A'}\n\n*Map:* ${order.mapLink || 'N/A'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const shareDispatchPlan = () => {
    const pending = orders.filter(o => o.status !== 'Delivered');
    let msg = `📋 *UPCOMING DISPATCH PLAN*\n\n`;
    pending.forEach((o, i) => {
      msg += `${i+1}. ${getDisplayName(o)} - ${o.qty} Bxs - ${o.date} ${o.time}\n`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const getStatusColor = (status) => {
    if(status === 'Pending') return 'bg-yellow-100 text-yellow-700';
    if(status === 'Confirmed') return 'bg-blue-100 text-blue-700';
    if(status === 'Delivered') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700'; 
  };

  return (
    <div className="space-y-3 pb-20">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search Name, Mobile, or Order ID..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-[#ff9900] outline-none font-bold text-gray-700"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1 items-center">
        {['All', 'Pending', 'Confirmed', 'Delivered'].map(f => (
          <button key={f} onClick={() => setFilter(f)} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-[#131921] text-[#ff9900]' : 'bg-white text-gray-400 border border-gray-200'}`}>
            {f}
          </button>
        ))}
        <button onClick={shareDispatchPlan} className="bg-[#25D366] text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 shadow-sm active:scale-95">
          <Smartphone size={12} /> Roster
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">No orders found.</div>
      ) : (
        filteredOrders.map(order => (
          <div key={order.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
              <div>
                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>{order.status || 'LEGACY'}</span>
                <h3 className="font-black text-gray-900 text-lg mt-2 leading-none">{getDisplayName(order)}</h3>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <p className="text-[10px] text-gray-400 font-bold">ID: {order.orderId || 'OLD RECORD'}</p>
                  <button
                    type="button"
                    onClick={() => onRecordPayment?.(order)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black tracking-wide uppercase"
                    title="Record payment"
                  >
                    <HandCoins size={14} />
                    Pay
                  </button>
                  <button
                    type="button"
                    onClick={() => onShareInvoice?.(order)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black tracking-wide uppercase"
                    title="Invoice PDF / WhatsApp"
                  >
                    <FileText size={14} />
                    PDF
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-[#ff9900]">{order.qty || 0} <span className="text-[10px] text-gray-400">BXS</span></p>
                <p className="text-[10px] text-gray-400 font-bold mt-1 tracking-tighter">₹{((order.qty || 0) * (order.rate || 0)).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-4 bg-gray-50 p-2 rounded-lg">
              <Clock size={14} className="text-blue-400" /> {order.date || 'No Date'} @ {order.time || '--:--'}
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center gap-2">
              <div className="flex gap-2">
                <button onClick={() => shareOrder(order)} className="bg-[#25D366]/10 text-[#25D366] p-2 rounded-xl"><Smartphone size={16} /></button>
                {order.status !== 'Delivered' && (
                  <button onClick={() => onEdit(order)} className="bg-blue-50 text-blue-500 p-2 rounded-xl"><Edit2 size={16} /></button>
                )}
                <button onClick={() => onCopy(order)} className="bg-gray-100 text-gray-500 p-2 rounded-xl"><Copy size={16} /></button>
                <button onClick={() => deleteOrder(order.id)} className="bg-red-50 text-red-500 p-2 rounded-xl"><Trash2 size={16} /></button>
              </div>

              {order.status === 'Pending' && (
                <button onClick={() => updateOrder(order.id, {status: 'Confirmed'})} className="bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm">Confirm</button>
              )}
              {order.status === 'Confirmed' && (
                <button onClick={() => updateOrder(order.id, {status: 'Delivered'})} className="bg-green-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm">Mark Delivered</button>
              )}
              {order.status === 'Delivered' && order.proofUrl && (
                <a href={order.proofUrl} target="_blank" className="text-[10px] font-black text-blue-500 underline">View Proof</a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
