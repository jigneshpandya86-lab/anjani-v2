import { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, RefreshCw } from 'lucide-react';
import { useClientStore } from '../store/clientStore';
import { useAnalyticsStore } from '../store/analyticsStore';
import { computeAnalyticsKpis, formatCurrency } from '../services/analyticsService';
import toast from 'react-hot-toast';

export default function SalesAnalyticsDashboard({ onClose }) {
  const [dateRange, setDateRange] = useState('month');
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
              <div className="bg-gradient-to-br from-[#131921] to-[#1f2937] rounded-[16px] p-4 text-white">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                  Revenue {getRangeLabel()}
                </p>
                <p className="text-2xl font-black mt-2">{formatCurrency(kpis.revenue)}</p>
                <p className="text-[10px] mt-1 opacity-60">{kpis.orderCount} orders</p>
              </div>

              {/* Orders */}
              <div className="bg-gradient-to-br from-[#ff9900] to-[#ffb84d] rounded-[16px] p-4 text-white">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                  Orders {getRangeLabel()}
                </p>
                <p className="text-2xl font-black mt-2">{kpis.orderCount}</p>
                <p className="text-[10px] mt-1 opacity-60">
                  {formatCurrency(kpis.aov)} avg
                </p>
              </div>

              {/* AOV */}
              <div className="bg-white border border-gray-200 rounded-[16px] p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                  Avg Order Value
                </p>
                <p className="text-2xl font-black text-[#131921] mt-2">
                  {formatCurrency(kpis.aov)}
                </p>
              </div>

              {/* Pending */}
              <div className="bg-white border border-yellow-200 rounded-[16px] p-4 bg-yellow-50">
                <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-wide">
                  Pending Orders
                </p>
                <p className="text-2xl font-black text-yellow-700 mt-2">
                  {kpis.pendingOrderCount}
                </p>
              </div>

              {/* New Customers */}
              <div className="bg-white border border-green-200 rounded-[16px] p-4 bg-green-50">
                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wide">
                  New Customers {getRangeLabel()}
                </p>
                <p className="text-2xl font-black text-green-700 mt-2">
                  {kpis.newCustomerCount}
                </p>
              </div>

              {/* Collection Rate */}
              <div className="bg-white border border-gray-200 rounded-[16px] p-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                  Collection Rate {getRangeLabel()}
                </p>
                <p className="text-2xl font-black text-[#131921] mt-2">
                  {kpis.collectionRate}%
                </p>
              </div>
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
    </div>
  );
}
