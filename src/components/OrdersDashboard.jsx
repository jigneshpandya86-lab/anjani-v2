import { useState } from 'react';
import { useClientStore } from '../store/clientStore';
import { Package, CheckCircle, Clock, Truck, Copy, Edit2, Trash2, Smartphone } from 'lucide-react';

export default function OrdersDashboard({ onEdit, onCopy }) {
  const { orders, clients, updateOrder, deleteOrder } = useClientStore();
  const [filter, setFilter] = useState('All');

  const getClient = (id) => clients.find(c => c.id === id) || { name: 'Unknown', mobile: '' };

  const filteredOrders = orders.filter(o => filter === 'All' || o.status === filter);

  // Send Single Order to Staff
  const shareOrder = (order) => {
    const client = getClient(order.clientId);
    const msg = `🚚 *NEW DELIVERY ASSIGNMENT*\n\n*ID:* ${order.orderId}\n*Client:* ${client.name}\n*Mobile:* ${client.mobile}\n*Date:* ${order.date} at ${order.time}\n*Qty:* ${order.qty} Boxes (200ml)\n\n*Address:*\n${order.address}\n\n*Map:* ${order.mapLink || 'N/A'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Bulk Dispatch Summary
  const shareDispatchPlan = () => {
    const pending = orders.filter(o => o.status !== 'Delivered');
    let msg = `📋 *UPCOMING DISPATCH PLAN*\n\n`;
    pending.forEach((o, i) => {
      msg += `${i+1}. ${getClient(o.clientId).name} - ${o.qty} Bxs - ${o.date} ${o.time}\n`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const getStatusColor = (status) => {
    if(status === 'Pending') return 'bg-yellow-100 text-yellow-700';
    if(status === 'Confirmed') return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
          <Truck className="text-[#ff9900]" size={20} /> Dispatch
        </h2>
        <button onClick={shareDispatchPlan} className="bg-[#25D366] text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 shadow-md active:scale-95">
          <Smartphone size={12} /> Share Roster
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
        {['All', 'Pending', 'Confirmed', 'Delivered'].map(f => (
          <button key={f} onClick={() => setFilter(f)} 
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-[#131921] text-[#ff9900]' : 'bg-white text-gray-400 border border-gray-200'}`}>
            {f}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">No orders found.</div>
      ) : (
        filteredOrders.map(order => (
          <div key={order.id} className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
              <div>
                <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${getStatusColor(order.status)}`}>{order.status}</span>
                <h3 className="font-black text-gray-900 text-lg mt-2 leading-none">{getClient(order.clientId).name}</h3>
                <p className="text-[10px] text-gray-400 font-bold mt-1">ID: {order.orderId}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-[#ff9900]">{order.qty} <span className="text-[10px] text-gray-400">BXS</span></p>
                <p className="text-[10px] text-gray-400 font-bold mt-1 tracking-tighter">₹{(order.qty * order.rate).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-4 bg-gray-50 p-2 rounded-lg">
              <Clock size={14} className="text-blue-400" /> {order.date} @ {order.time}
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

              {/* Status Stepper */}
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
