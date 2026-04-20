import { memo, useRef, useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useClientStore } from '../store/clientStore';
import { Clock, Copy, Edit2, Trash2, Smartphone, Search, HandCoins, FileText, Paperclip, Loader2, CalendarRange, Sun, CalendarDays, Phone } from 'lucide-react';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { app } from '../firebase-config';

function OrdersDashboard({ onEdit, onCopy, onRecordPayment, onShareInvoice }) {
  const orders = useClientStore(state => state.orders);
  const clients = useClientStore(state => state.clients);
  const updateOrder = useClientStore(state => state.updateOrder);
  const deleteOrder = useClientStore(state => state.deleteOrder);
  const userRole = useClientStore(state => state.userRole);
  const [filter, setFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingProofOrderId, setUploadingProofOrderId] = useState('');
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState('');
  const proofInputRefs = useRef({});
  const storage = getStorage(app);

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

  const getOrderDate = (order) => {
    if (!order?.date) return null;
    const parsedDate = new Date(order.date);
    if (Number.isNaN(parsedDate.getTime())) return null;
    return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
  };

  const doesMatchDateFilter = (order) => {
    if (dateFilter === 'All') return true;

    const orderDate = getOrderDate(order);
    if (!orderDate) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (dateFilter === 'Today') {
      return orderDate.getTime() === today.getTime();
    }

    if (dateFilter === 'Tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return orderDate.getTime() === tomorrow.getTime();
    }

    if (dateFilter === 'ThisWeek') {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return orderDate >= today && orderDate <= weekEnd;
    }

    return true;
  };

  const statusPriority = { 'Pending': 0, 'Confirmed': 1, 'Delivered': 2 };

  const getOrderSortKey = (order) => {
    const statusPrio = statusPriority[order.status] ?? 999;
    const dateObj = getOrderDate(order);
    const dateTime = dateObj?.getTime() ?? Number.MAX_VALUE;
    const timeStr = order.time || '23:59';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const timeInMinutes = (hours || 0) * 60 + (minutes || 0);
    return [statusPrio, dateTime, timeInMinutes];
  };

  const filteredOrders = useMemo(() => orders
    .filter(o => {
      const name = getDisplayName(o);
      const mobile = getDisplayMobile(o);
      const matchesStatus = filter === 'All' || o.status === filter;
      const matchesDate = doesMatchDateFilter(o);
      const searchLower = searchQuery.toLowerCase();
      const qtyText = String(o.qty ?? o.boxes ?? o.quantity ?? '');
      const matchesSearch = name.toLowerCase().includes(searchLower) ||
                            (o.orderId || '').toLowerCase().includes(searchLower) ||
                            mobile.includes(searchLower) ||
                            qtyText.includes(searchLower);
      return matchesStatus && matchesDate && matchesSearch;
    })
    .sort((a, b) => {
      const [aPrio, aDate, aTime] = getOrderSortKey(a);
      const [bPrio, bDate, bTime] = getOrderSortKey(b);
      if (aPrio !== bPrio) return aPrio - bPrio;
      if (aDate !== bDate) return aDate - bDate;
      return aTime - bTime;
    }), [orders, filter, searchQuery, dateFilter]);

  const shareOrder = useCallback((order) => {
    const msg = `🚚 *NEW DELIVERY ASSIGNMENT*\n\n*ID:* ${order.orderId || 'N/A'}\n*Client:* ${getDisplayName(order)}\n*Mobile:* ${getDisplayMobile(order)}\n*Date:* ${order.date || 'TBD'} at ${order.time || 'TBD'}\n*Qty:* ${order.qty || 0} Boxes (200ml)\n\n*Address:*\n${order.address || 'N/A'}\n\n*Location:* ${order.location || 'N/A'}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }, []);

  const shareDispatchPlan = useCallback(() => {
    const pending = orders.filter(o => o.status !== 'Delivered');
    let msg = `📋 *UPCOMING DISPATCH PLAN*\n\n`;
    pending.forEach((o, i) => {
      msg += `${i+1}. ${getDisplayName(o)} - ${o.qty} Bxs - ${o.date} ${o.time}\n`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }, [orders]);

  const callClient = useCallback((order) => {
    const mobile = getDisplayMobile(order);
    const cleanMobile = String(mobile || '').replace(/\D/g, '');
    if (!cleanMobile) {
      toast.error('Client mobile number not found');
      return;
    }
    window.open(`tel:${cleanMobile}`, '_self');
  }, []);

  const handleDelete = useCallback(async (order) => {
    const label = order.orderId || order.id;
    const isDelivered = order.status === 'Delivered';
    const msg = isDelivered
      ? `Delete delivered order ${label}? Stock and payment will be reversed.`
      : `Delete order ${label}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await deleteOrder(order.id);
      toast.success('Order deleted');
    } catch {
      toast.error('Failed to delete order');
    }
  }, [deleteOrder]);

  const getStatusColor = (status) => {
    if(status === 'Pending') return 'bg-yellow-100 text-yellow-700';
    if(status === 'Confirmed') return 'bg-blue-100 text-blue-700';
    if(status === 'Delivered') return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-700'; 
  };

  const attachDeliveryProof = (orderId) => {
    proofInputRefs.current[orderId]?.click();
  };

  const uploadDeliveryProof = async (order, event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingProofOrderId(order.id);
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const proofPath = `delivery-proofs/${order.id}/${Date.now()}-${sanitizedName}`;
      const proofRef = ref(storage, proofPath);

      await uploadBytes(proofRef, file);
      const proofUrl = await getDownloadURL(proofRef);
      await updateOrder(order.id, {
        proofUrl,
        proofFileName: file.name,
        proofUploadedAt: new Date().toISOString(),
      });
      toast.success('Delivery proof attached');
    } catch (error) {
      console.error('Proof upload failed', error);
      toast.error('Failed to upload delivery proof');
    } finally {
      setUploadingProofOrderId('');
      event.target.value = '';
    }
  };

  const handleStatusUpdate = async (order, status) => {
    if (!order?.id || !status) return;
    setStatusUpdatingOrderId(order.id);
    try {
      await updateOrder(order.id, { status });
      toast.success(`Order marked ${status}`);
    } catch (error) {
      console.error('Order status update failed', error);
      toast.error(`Failed to mark ${status.toLowerCase()}`);
    } finally {
      setStatusUpdatingOrderId('');
    }
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

      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide px-1 items-center">
        {['All', 'Pending', 'Confirmed', 'Delivered'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.18em] whitespace-nowrap transition-all ${
              filter === f ? 'bg-[#131921] text-[#ff9900]' : 'bg-white text-gray-400 border border-gray-200'
            }`}>
            {f === 'Delivered' ? 'DEL' : f}
          </button>
        ))}

        <span className="h-5 w-px bg-gray-200 shrink-0" />

        {[
          { key: 'All', label: 'Dates', icon: CalendarRange },
          { key: 'Today', label: 'Today', icon: Sun },
          { key: 'Tomorrow', label: 'Tmrw', icon: Clock },
          { key: 'ThisWeek', label: 'Week', icon: CalendarDays },
        ].map(({ key, label, icon: Icon }) => ( // eslint-disable-line no-unused-vars
          <button
            key={key}
            onClick={() => setDateFilter(key)}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wide whitespace-nowrap border transition-all inline-flex items-center gap-1 ${
              dateFilter === key
                ? 'bg-[#ff9900]/15 text-[#cc7a00] border-[#ff9900]/30'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        ))}

        <button onClick={shareDispatchPlan} className="bg-[#25D366] text-white px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1 shadow-sm active:scale-95">
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
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-[#ff9900]">{order.qty || 0} <span className="text-[10px] text-gray-400">BXS</span></p>
                <p className="text-[10px] text-gray-400 font-bold mt-1 tracking-tighter">₹{((order.qty || 0) * (order.rate || 0)).toLocaleString()}</p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-2 bg-gray-50 p-2 rounded-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                <Clock size={14} className="text-blue-400" /> {order.date || 'No Date'} @ {order.time || '--:--'}
              </div>
              {userRole === 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onRecordPayment?.(order)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 text-[9px] font-black tracking-wide uppercase"
                    title="Record payment"
                  >
                    <HandCoins size={12} />
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
              )}
            </div>

            {/* Action Bar */}
            <div className="flex justify-between items-center gap-2">
              <div className="flex gap-2">
                <button onClick={() => shareOrder(order)} className="bg-[#25D366]/10 text-[#25D366] p-2 rounded-xl"><Smartphone size={16} /></button>
                {userRole === 'admin' && (
                  <>
                    <button
                      onClick={() => attachDeliveryProof(order.id)}
                      disabled={uploadingProofOrderId === order.id}
                      className={`${order.proofUrl ? 'bg-blue-100 text-blue-600' : 'bg-amber-50 text-amber-600'} p-2 rounded-xl`}
                      title={order.proofUrl ? 'Replace delivery proof photo' : 'Attach delivery proof photo'}
                    >
                      {uploadingProofOrderId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                    </button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => {
                        proofInputRefs.current[order.id] = el;
                      }}
                      onChange={(event) => uploadDeliveryProof(order, event)}
                    />
                    {order.status !== 'Delivered' && (
                      <>
                        <button onClick={() => callClient(order)} className="bg-green-50 text-green-600 p-2 rounded-xl" title="Call client"><Phone size={16} /></button>
                        <button onClick={() => onEdit(order)} className="bg-blue-50 text-blue-500 p-2 rounded-xl"><Edit2 size={16} /></button>
                      </>
                    )}
                    <button onClick={() => onCopy(order)} className="bg-gray-100 text-gray-500 p-2 rounded-xl"><Copy size={16} /></button>
                    <button onClick={() => handleDelete(order)} className="bg-red-50 text-red-500 p-2 rounded-xl"><Trash2 size={16} /></button>
                  </>
                )}
              </div>

              {userRole === 'admin' && order.status === 'Pending' && (
                <button
                  onClick={() => handleStatusUpdate(order, 'Confirmed')}
                  disabled={statusUpdatingOrderId === order.id}
                  className="bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm disabled:opacity-60"
                >
                  {statusUpdatingOrderId === order.id ? 'Updating...' : 'Confirm'}
                </button>
              )}
              {userRole === 'admin' && order.status === 'Confirmed' && (
                <button
                  onClick={() => handleStatusUpdate(order, 'Delivered')}
                  disabled={statusUpdatingOrderId === order.id}
                  className="bg-green-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm disabled:opacity-60"
                >
                  {statusUpdatingOrderId === order.id ? 'Updating...' : 'Mark Delivered'}
                </button>
              )}
              {order.proofUrl && (
                <a href={order.proofUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black text-blue-500 underline">View Proof</a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default memo(OrdersDashboard);
