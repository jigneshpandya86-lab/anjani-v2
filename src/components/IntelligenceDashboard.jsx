import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase-config';
import {
  Brain,
  TrendingUp,
  Phone,
  Clock,
  RefreshCw,
  ChevronRight,
  ShoppingCart,
  CreditCard,
  Target,
  BarChart3,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';

const IntelligenceDashboard = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState('month'); // today, week, month
  const [selectedDetail, setSelectedDetail] = useState(null); // 'revenue', 'orders', 'outstanding', null

  const runAnalysis = async (silent = false) => {
    if (refreshing) return;
    setRefreshing(true);
    let toastId;
    if (!silent) toastId = toast.loading('Python engine is crunching numbers...');

    try {
      const functions = getFunctions(app, 'asia-south1');
      const analyze = httpsCallable(functions, 'run_intelligence_analysis');
      const result = await analyze();

      if (result.data?.status === 'success') {
        if (!silent) toast.success('Mission Control updated!', { id: toastId });
      } else {
        if (!silent) toast.error(result.data?.message || 'Analysis failed', { id: toastId });
      }
    } catch (error) {
      console.error('Error running analysis:', error);
      if (!silent) toast.error('Intelligence engine offline: ' + error.message, { id: toastId });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'intelligence_reports'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setReport(snapshot.docs[0].data());
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching intelligence report:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Auto-run if no report exists
  useEffect(() => {
    if (!loading && !report && !refreshing) {
      runAnalysis(true);
    }
  }, [loading, report]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const sales = useMemo(() => report?.sales?.[dateRange] || { revenue: 0, count: 0 }, [report, dateRange]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="text-gray-500 font-medium">Powering up Python Intelligence...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pb-20">
      {/* Header Card - matches PaymentDashboard / StockDashboard style */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1f46] via-[#143366] to-[#1e4a88] p-3.5 text-white shadow-[0_16px_30px_rgba(15,31,70,0.25)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10 blur-[2px]" />
        <div className="pointer-events-none absolute -left-16 bottom-2 h-28 w-28 rounded-full bg-white/10" />

        <div className="relative flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 truncate text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">
            <Brain size={13} /> Mission Control
          </h2>
          <button
            onClick={() => runAnalysis()}
            disabled={refreshing}
            className="shrink-0 flex items-center gap-1 text-[10px] bg-white/20 text-white px-2 py-1 rounded-full font-black uppercase shadow-sm backdrop-blur-sm disabled:opacity-50"
            title="Refresh Analysis"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            Python
          </button>
        </div>

        <div className="relative mt-2 flex items-end justify-between gap-2">
          <div>
            <p className="truncate text-3xl font-black leading-none">{formatCurrency(sales.revenue)}</p>
            <p className="text-white/70 text-[10px] font-bold mt-1 uppercase tracking-wide">
              {sales.count} Delivered · {report?.sales?.pending || 0} Pending
            </p>
          </div>
          <div className="flex items-center gap-0.5 bg-white/10 rounded-xl p-0.5">
            {['today', 'week', 'month'].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all whitespace-nowrap ${
                  dateRange === range
                    ? 'bg-white text-[#131921] shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Revenue Tile */}
        <button
          onClick={() => setSelectedDetail('revenue')}
          className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100 rounded-xl p-2.5 shadow-sm relative overflow-hidden group text-left active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="p-1 bg-emerald-100 rounded-lg text-emerald-600">
              <TrendingUp size={13} />
            </div>
            <span className="text-[7px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Live</span>
          </div>
          <p className="text-gray-400 text-[7px] font-black uppercase tracking-widest">Revenue</p>
          <h2 className="text-sm font-black text-emerald-700 mt-0.5">{formatCurrency(sales.revenue)}</h2>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[7px] text-gray-500 font-bold">{sales.count} Delivered</p>
            <ChevronRight size={11} className="text-emerald-400" />
          </div>
        </button>

        {/* Orders Tile */}
        <button
          onClick={() => setSelectedDetail('orders')}
          className="bg-white border border-blue-100 rounded-xl p-2.5 shadow-sm relative overflow-hidden group text-left active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="p-1 bg-blue-50 rounded-lg text-blue-600">
              <ShoppingCart size={13} />
            </div>
          </div>
          <p className="text-gray-400 text-[7px] font-black uppercase tracking-widest">Total Orders</p>
          <h2 className="text-sm font-black text-gray-800 mt-0.5">{sales.count}</h2>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[7px] text-blue-600 font-bold">{report?.sales?.pending || 0} Pending</p>
            <ChevronRight size={11} className="text-gray-300" />
          </div>
        </button>

        {/* Outstanding Tile */}
        <button
          onClick={() => setSelectedDetail('outstanding')}
          className="bg-white border border-red-100 rounded-xl p-2.5 shadow-sm relative overflow-hidden group text-left active:scale-95 transition-all"
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="p-1 bg-red-50 rounded-lg text-red-500">
              <CreditCard size={13} />
            </div>
          </div>
          <p className="text-gray-400 text-[7px] font-black uppercase tracking-widest">Outstanding</p>
          <h2 className="text-sm font-black text-gray-800 mt-0.5">{formatCurrency(report?.totalOutstanding || 0)}</h2>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[7px] text-red-500 font-bold tracking-tight uppercase">Collections</p>
            <ChevronRight size={11} className="text-gray-300" />
          </div>
        </button>

        {/* Forecast Tile */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-2.5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-1.5">
            <div className="p-1 bg-blue-100 rounded-lg text-blue-600">
              <Target size={13} />
            </div>
            <span className="text-[7px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full uppercase tracking-tighter italic">Prediction</span>
          </div>
          <p className="text-gray-400 text-[7px] font-black uppercase tracking-widest">7-Day Forecast</p>
          <h2 className="text-sm font-black text-blue-700 mt-0.5">{formatCurrency(report?.forecast?.next7DaysEstimate || (sales.revenue * 1.1))}</h2>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* Left Column: Top Customers + Pulse Check */}
        <div className="lg:col-span-1 space-y-2">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-[10px] font-black text-gray-900 flex items-center mb-4 uppercase tracking-wider">
              <BarChart3 size={16} className="text-blue-600 mr-2" />
              Top Customers
            </h3>
            <div className="space-y-4">
              {report?.topCustomers?.map((customer, idx) => {
                const max = report.topCustomers[0].revenue;
                const width = (customer.revenue / max) * 100;
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className="text-gray-700 truncate w-32">{customer.name}</span>
                      <span className="text-blue-600">{formatCurrency(customer.revenue)}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!report?.topCustomers || report.topCustomers.length === 0) && (
                <p className="text-center text-gray-400 text-xs italic py-6">No customer data</p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 rounded-3xl p-4 border border-blue-100">
            <h4 className="text-[8px] font-black text-blue-600 uppercase tracking-[0.2em] mb-3">Pulse Check</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xl font-black text-gray-900">{report?.summary?.champions || 0}</p>
                <p className="text-[8px] font-bold text-gray-500 uppercase">Champions</p>
              </div>
              <div>
                <p className="text-xl font-black text-red-600">{report?.summary?.atRisk || 0}</p>
                <p className="text-[8px] font-bold text-gray-500 uppercase">At Risk</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Refill Alerts + Strategic Insight */}
        <div className="lg:col-span-2 space-y-2">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-orange-50/30">
              <h3 className="font-black text-gray-900 flex items-center text-[10px] uppercase tracking-wider">
                <Clock size={16} className="text-orange-500 mr-2" />
                Refill Alerts
              </h3>
              <span className="bg-orange-100 text-orange-700 text-[8px] font-black px-2 py-1 rounded-full uppercase italic">
                Predicted by Python
              </span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
              {report?.refillAlerts && report.refillAlerts.length > 0 ? (
                report.refillAlerts.map((alert, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <p className="font-black text-gray-900 text-xs">{alert.name}</p>
                        {alert.urgency === 'High' && (
                          <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center text-[8px] text-gray-500 font-bold space-x-2 uppercase">
                        <span>Cycle: {alert.avgInterval} days</span>
                        <span className="text-blue-600">Next: {alert.predictedDate}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => window.open(`tel:${alert.mobile || ''}`)}
                        className={`p-2 rounded-xl transition-all shadow-sm ${
                          alert.urgency === 'High'
                            ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-100'
                            : 'bg-white border border-gray-200 text-blue-600 hover:bg-gray-50'
                        }`}
                      >
                        <Phone size={14} fill={alert.urgency === 'High' ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-gray-400 text-[10px] italic">
                  No immediate refills predicted.
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-4 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-base font-black mb-1 flex items-center uppercase tracking-tighter">
                <Brain className="mr-2" size={18} />
                Strategic Insight
              </h3>
              <p className="text-blue-100 text-[10px] font-medium leading-relaxed max-w-lg">
                {report?.summary?.atRisk > 0
                  ? `Your "At Risk" segment has ${report.summary.atRisk} clients. Re-engaging them today could protect approximately ${formatCurrency(report.summary.atRisk * 1500)} in monthly revenue.`
                  : "Excellent! Your customer retention is at 100% for the current cycle. Keep maintaining service quality to grow your 'Champion' segment."}
              </p>
            </div>
            <ChevronRight className="absolute -right-4 -bottom-4 text-white opacity-10" size={80} />
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-t-[32px] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center">
                {selectedDetail === 'revenue' && <TrendingUp className="mr-2 text-green-500" />}
                {selectedDetail === 'orders' && <ShoppingCart className="mr-2 text-blue-500" />}
                {selectedDetail === 'outstanding' && <CreditCard className="mr-2 text-red-500" />}
                {selectedDetail === 'revenue' ? `Today's Revenue` :
                 selectedDetail === 'orders' ? `Pending Orders` : `Top Outstanding Dues`}
              </h3>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-3 rounded-l-xl">Details</th>
                    <th className="px-4 py-3 text-right rounded-r-xl">Amount/Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {selectedDetail === 'revenue' && report?.drillDown?.todayDelivered?.map((order, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-sm font-black text-gray-900">{order.clientName}</p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase">{order.qty} Boxes @ ₹{order.rate}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="text-sm font-black text-green-600">{formatCurrency(order.amount)}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{order.date}</p>
                      </td>
                    </tr>
                  ))}

                  {selectedDetail === 'orders' && report?.drillDown?.pending?.map((order, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-sm font-black text-gray-900">{order.clientName || 'Unknown'}</p>
                        <p className="text-[10px] text-gray-500 font-bold uppercase">{order.qty} Boxes | {order.date}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-tighter">
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {selectedDetail === 'outstanding' && report?.drillDown?.outstanding?.map((client, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <p className="text-sm font-black text-gray-900">{client.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{client.mobile || 'No mobile'}</p>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <p className="text-sm font-black text-red-600">{formatCurrency(client.outstanding)}</p>
                        <button className="mt-1 text-[9px] font-black text-blue-600 uppercase">Call Client</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {((selectedDetail === 'revenue' && !report?.drillDown?.todayDelivered?.length) ||
                (selectedDetail === 'orders' && !report?.drillDown?.pending?.length) ||
                (selectedDetail === 'outstanding' && !report?.drillDown?.outstanding?.length)) && (
                <div className="py-20 text-center space-y-3">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
                    <ShoppingCart className="text-gray-300" size={24} />
                  </div>
                  <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">No data for this view</p>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-center sm:hidden">
              <button
                onClick={() => setSelectedDetail(null)}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest pb-4">
        Report Generated: {report?.timestamp?.toDate ? report.timestamp.toDate().toLocaleString('en-IN') : 'Just now'}
      </div>
    </div>
  );
};

export default IntelligenceDashboard;
