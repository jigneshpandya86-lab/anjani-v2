import { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, RefreshCw, ChevronRight } from 'lucide-react';
import { useClientStore } from '../store/clientStore';
import { useAnalyticsStore } from '../store/analyticsStore';
import { computeAnalyticsKpis, formatCurrency } from '../services/analyticsService';
import toast from 'react-hot-toast';

export default function SalesAnalyticsDashboard({ onClose }) {
  const [dateRange, setDateRange] = useState('month');
  const [selectedTile, setSelectedTile] = useState(null);
  const { orders, clients } = useClientStore();
  const { payments, loading, subscribeToPayments, unsubscribeFromPayments } =
    useAnalyticsStore();

  // Subscribe to payments on mount
  useEffect(() => {
    subscribeToPayments();
    return () => unsubscribeFromPayments();
  }, [subscribeToPayments, unsubscribeFromPayments]);

  // Compute KPIs - 100% client-side, zero Firestore operations
  const kpis = useMemo(() => {
    return computeAnalyticsKpis(orders, payments, clients, dateRange);
  }, [orders, payments, clients, dateRange]);

  const handleRefresh = () => {
    toast.success('Data refreshed');
  };

  const getTimeString = () => {
    if (!kpis.lastUpdated) return 'Just now';
    const now = new Date();
    const diff = Math.floor((now - kpis.lastUpdated) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const getRangeLabel = () => {
    switch (dateRange) {
      case 'today':
        return 'Today';
      case 'week':
        return 'This Week';
      case 'month':
        return 'This Month';
      default:
        return 'This Month';
    }
  };

  // Get detail data for each tile
  const getDetailData = useMemo(() => {
    const getDateRangeStart = () => {
      const now = new Date();
      const startDate = new Date();
      switch (dateRange) {
        case 'today': {
          startDate.setHours(0, 0, 0, 0);
          break;
        }
        case 'week': {
          const dayOfWeek = now.getDay();
          const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
          startDate.setDate(diff);
          startDate.setHours(0, 0, 0, 0);
          break;
        }
        case 'month':
        default: {
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
          break;
        }
      }
      return startDate;
    };

    const isInRange = (dateStr) => {
      if (!dateStr) return false;
      const startDate = getDateRangeStart();
      let d;
      if (typeof dateStr === 'string' && dateStr.length === 10) {
        d = new Date(dateStr + 'T00:00:00');
      } else if (dateStr.toDate) {
        d = dateStr.toDate();
      } else {
        d = new Date(dateStr);
      }
      return d >= startDate;
    };

    const isDelivered = (status) => {
      const normalized = (status || '').trim().toLowerCase();
      return normalized === 'delivered' || normalized === 'completed';
    };

    return {
      revenue: orders
        .filter((o) => isInRange(o.date || o.createdAt) && isDelivered(o.status))
        .map((o) => ({
          customer: o.clientName || `Client ${o.clientId?.slice(0, 8)}`,
          qty: o.qty,
          rate: o.rate,
          amount: Number(o.qty || 0) * Number(o.rate || 0),
          date: o.date || o.createdAt,
          status: o.status,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      orders: orders
        .filter((o) => isInRange(o.date || o.createdAt) && isDelivered(o.status))
        .map((o) => ({
          orderId: o.orderId,
          customer: o.clientName || `Client ${o.clientId?.slice(0, 8)}`,
          qty: o.qty,
          rate: o.rate,
          date: o.date || o.createdAt,
          status: o.status,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10),
      pending: orders
        .filter((o) => isInRange(o.date || o.createdAt) && !isDelivered(o.status))
        .map((o) => ({
          orderId: o.orderId,
          customer: o.clientName || `Client ${o.clientId?.slice(0, 8)}`,
          qty: o.qty,
          status: o.status,
          date: o.date || o.createdAt,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10),
      outstanding: clients
        .filter((client) => Number(client.outstanding || 0) > 0)
        .map((client) => ({
          clientId: client.id,
          customer: client.name || `Client ${client.id?.slice(0, 8)}`,
          outstanding: Number(client.outstanding || 0),
          mobile: client.mobile || '',
        }))
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 10),
    };
  }, [orders, clients, dateRange]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="bg-white w-full sm:w-full sm:max-w-2xl sm:rounded-[24px] rounded-t-[24px] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={24} className="text-[#ff9900]" />
            <h2 className="text-2xl font-black text-[#131921]">Sales Analytics</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Date Range Filter */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setDateRange('today')}
            className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-colors ${
              dateRange === 'today'
                ? 'bg-[#ff9900] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateRange('week')}
            className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-colors ${
              dateRange === 'week'
                ? 'bg-[#ff9900] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setDateRange('month')}
            className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-colors ${
              dateRange === 'month'
                ? 'bg-[#ff9900] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            This Month
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-[16px] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {/* Revenue */}
              <button
                onClick={() => setSelectedTile('revenue')}
                className="bg-gradient-to-br from-[#131921] to-[#1f2937] rounded-[16px] p-3 text-white hover:shadow-lg transition-all cursor-pointer text-left min-h-[128px]"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                  Revenue {getRangeLabel()}
                </p>
                <p className="text-xl font-black mt-1.5">{formatCurrency(kpis.revenue)}</p>
                <p className="text-[10px] mt-1 opacity-60">{kpis.orderCount} orders</p>
                <div className="flex justify-end mt-1.5">
                  <ChevronRight size={14} className="opacity-50" />
                </div>
              </button>

              {/* Orders */}
              <button
                onClick={() => setSelectedTile('orders')}
                className="bg-gradient-to-br from-[#ff9900] to-[#ffb84d] rounded-[16px] p-3 text-white hover:shadow-lg transition-all cursor-pointer text-left min-h-[128px]"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                  Orders {getRangeLabel()}
                </p>
                <p className="text-xl font-black mt-1.5">{kpis.orderCount}</p>
                <div className="flex justify-end mt-8">
                  <ChevronRight size={14} className="opacity-50" />
                </div>
              </button>

              {/* Pending */}
              <button
                onClick={() => setSelectedTile('pending')}
                className="bg-white border border-yellow-200 rounded-[16px] p-3 bg-yellow-50 hover:shadow-lg transition-all cursor-pointer text-left min-h-[128px]"
              >
                <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-wide">
                  Pending Orders
                </p>
                <p className="text-xl font-black text-yellow-700 mt-1.5">
                  {kpis.pendingOrderCount}
                </p>
                <div className="flex justify-end mt-8">
                  <ChevronRight size={14} className="opacity-50" />
                </div>
              </button>

              {/* Outstanding Amount */}
              <button
                onClick={() => setSelectedTile('outstanding')}
                className="bg-white border border-red-200 rounded-[16px] p-3 bg-red-50 hover:shadow-lg transition-all cursor-pointer text-left min-h-[128px]"
              >
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-wide">
                  Total Outstanding
                </p>
                <p className="text-xl font-black text-red-700 mt-1.5">
                  {formatCurrency(kpis.totalOutstanding || 0)}
                </p>
                <p className="text-[10px] mt-1 text-red-600 opacity-80">
                  {getDetailData.outstanding.length} clients due
                </p>
                <div className="flex justify-end mt-1.5">
                  <ChevronRight size={14} className="opacity-50" />
                </div>
              </button>
            </div>

            {/* Top Customers Chart */}
            {kpis.topCustomers.length > 0 && (
              <div className="bg-gray-50 rounded-[16px] p-4 mb-6">
                <h3 className="text-sm font-bold text-[#131921] mb-4">
                  Top Customers {getRangeLabel()}
                </h3>
                <div className="space-y-3">
                  {kpis.topCustomers.map((customer, idx) => {
                    const maxRevenue = kpis.topCustomers[0].revenue;
                    const width = (customer.revenue / maxRevenue) * 100;
                    return (
                      <div key={customer.id} className="flex items-center gap-3">
                        <div className="w-1 h-1 rounded-full bg-[#ff9900]" />
                        <span className="text-[11px] font-bold text-gray-600 w-24 truncate">
                          {idx + 1}. {customer.name}
                        </span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-[#ff9900] to-[#ffb84d] h-2 rounded-full transition-all"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-gray-700 w-16 text-right">
                          {formatCurrency(customer.revenue)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer with Refresh */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-4 border-t border-gray-200">
              <span>Last updated: {getTimeString()}</span>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <RefreshCw size={14} />
                <span>Refresh</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedTile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-end sm:items-center sm:justify-center">
          <div className="bg-white w-full sm:w-full sm:max-w-3xl sm:rounded-[24px] rounded-t-[24px] p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-[#131921]">
                {selectedTile === 'revenue' && `Top Orders by Revenue`}
                {selectedTile === 'orders' && `Delivered Orders`}
                {selectedTile === 'pending' && `Pending Orders`}
                {selectedTile === 'outstanding' && `Client Outstanding Dues`}
              </h3>
              <button
                onClick={() => setSelectedTile(null)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Detail Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {selectedTile === 'revenue' && (
                      <>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Customer</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Qty</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Rate</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Amount</th>
                        <th className="px-3 py-2 text-center font-bold text-gray-700">Date</th>
                      </>
                    )}
                    {selectedTile === 'orders' && (
                      <>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Order ID</th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Customer</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Qty</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Rate</th>
                        <th className="px-3 py-2 text-center font-bold text-gray-700">Date</th>
                      </>
                    )}
                    {selectedTile === 'pending' && (
                      <>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Order ID</th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Customer</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">Qty</th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Status</th>
                        <th className="px-3 py-2 text-center font-bold text-gray-700">Date</th>
                      </>
                    )}
                    {selectedTile === 'outstanding' && (
                      <>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Client</th>
                        <th className="px-3 py-2 text-left font-bold text-gray-700">Mobile</th>
                        <th className="px-3 py-2 text-right font-bold text-gray-700">
                          Outstanding
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedTile === 'revenue' &&
                    getDetailData.revenue.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-700">{item.customer}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{item.qty}</td>
                        <td className="px-3 py-3 text-right text-gray-700">₹{item.rate}</td>
                        <td className="px-3 py-3 text-right font-bold text-[#ff9900]">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600 text-[11px]">
                          {typeof item.date === 'string' && item.date.length === 10 ? item.date : new Date(item.date).toISOString().split('T')[0]}
                        </td>
                      </tr>
                    ))}
                  {selectedTile === 'orders' &&
                    getDetailData.orders.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-700 font-bold text-[11px]">{item.orderId}</td>
                        <td className="px-3 py-3 text-gray-700">{item.customer}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{item.qty}</td>
                        <td className="px-3 py-3 text-right text-gray-700">₹{item.rate}</td>
                        <td className="px-3 py-3 text-center text-gray-600 text-[11px]">
                          {typeof item.date === 'string' && item.date.length === 10 ? item.date : new Date(item.date).toISOString().split('T')[0]}
                        </td>
                      </tr>
                    ))}
                  {selectedTile === 'pending' &&
                    getDetailData.pending.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-700 font-bold text-[11px]">{item.orderId}</td>
                        <td className="px-3 py-3 text-gray-700">{item.customer}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{item.qty}</td>
                        <td className="px-3 py-3 text-left">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded">
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600 text-[11px]">
                          {typeof item.date === 'string' && item.date.length === 10 ? item.date : new Date(item.date).toISOString().split('T')[0]}
                        </td>
                      </tr>
                    ))}
                  {selectedTile === 'outstanding' &&
                    getDetailData.outstanding.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-700">{item.customer}</td>
                        <td className="px-3 py-3 text-gray-700">{item.mobile || '--'}</td>
                        <td className="px-3 py-3 text-right font-bold text-red-600">
                          {formatCurrency(item.outstanding)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Empty State */}
            {((selectedTile === 'revenue' && getDetailData.revenue.length === 0) ||
              (selectedTile === 'orders' && getDetailData.orders.length === 0) ||
              (selectedTile === 'pending' && getDetailData.pending.length === 0) ||
              (selectedTile === 'outstanding' && getDetailData.outstanding.length === 0)) && (
              <div className="text-center py-8 text-gray-500">
                No data available for this period
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
