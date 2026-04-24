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
  Users, 
  AlertTriangle, 
  Phone, 
  Clock,
  RefreshCw,
  ChevronRight,
  ShoppingCart,
  CreditCard,
  Target,
  BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';

const IntelligenceDashboard = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState('month'); // today, week, month

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
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center tracking-tight">
            <Brain className="text-blue-600 mr-2" size={28} />
            MISSION <span className="text-blue-600 ml-1.5">CONTROL</span>
          </h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">100% Python-Powered Analytics</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
          {['today', 'week', 'month'].map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                dateRange === range 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {range}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button 
            onClick={() => runAnalysis()}
            disabled={refreshing}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors disabled:opacity-50"
            title="Refresh Analysis"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI GRID: THE "MISSION" STATUS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Tile */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/10 rounded-xl">
                <TrendingUp size={20} className="text-green-400" />
              </div>
              <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">Live</span>
            </div>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Revenue</p>
            <h2 className="text-2xl font-black mt-1">{formatCurrency(sales.revenue)}</h2>
            <p className="text-[10px] text-gray-500 font-bold mt-1">{sales.count} Delivered</p>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform">
            <TrendingUp size={100} />
          </div>
        </div>

        {/* Orders Tile */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 rounded-xl">
                <ShoppingCart size={20} className="text-blue-600" />
              </div>
            </div>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Total Orders</p>
            <h2 className="text-2xl font-black text-gray-900 mt-1">{sales.count}</h2>
            <p className="text-[10px] text-blue-600 font-bold mt-1">{report?.sales?.pending || 0} Pending</p>
          </div>
        </div>

        {/* Outstanding Tile */}
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-red-50 rounded-xl">
                <CreditCard size={20} className="text-red-600" />
              </div>
            </div>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Outstanding</p>
            <h2 className="text-2xl font-black text-gray-900 mt-1">{formatCurrency(report?.totalOutstanding || 0)}</h2>
            <p className="text-[10px] text-red-600 font-bold mt-1 tracking-tight">Requires Collection</p>
          </div>
        </div>

        {/* Forecast Tile */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-5 text-white shadow-lg shadow-blue-200 relative overflow-hidden group">
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/20 rounded-xl">
                <Target size={20} />
              </div>
              <span className="text-[10px] font-black text-blue-100 bg-white/10 px-2 py-0.5 rounded-full uppercase tracking-tighter italic">Prediction</span>
            </div>
            <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest">7-Day Forecast</p>
            <h2 className="text-2xl font-black mt-1">{formatCurrency(report?.forecast?.next7DaysEstimate || 0)}</h2>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Top Customers */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-black text-gray-900 flex items-center mb-6 uppercase tracking-wider">
              <BarChart3 size={18} className="text-blue-600 mr-2" />
              Top Customers
            </h3>
            <div className="space-y-5">
              {report?.topCustomers?.map((customer, idx) => {
                const max = report.topCustomers[0].revenue;
                const width = (customer.revenue / max) * 100;
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-gray-700 truncate w-32">{customer.name}</span>
                      <span className="text-blue-600">{formatCurrency(customer.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!report?.topCustomers || report.topCustomers.length === 0) && (
                <p className="text-center text-gray-400 text-xs italic py-10">No customer data for this period</p>
              )}
            </div>
          </div>

          {/* Business Summary Card */}
          <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4">Pulse Check</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-black text-gray-900">{report?.summary?.champions || 0}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Champions</p>
              </div>
              <div>
                <p className="text-2xl font-black text-red-600">{report?.summary?.atRisk || 0}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase">At Risk</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Predictive Alerts & Segments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Refill Alerts */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-orange-50/30">
              <h3 className="font-black text-gray-900 flex items-center text-sm uppercase tracking-wider">
                <Clock size={18} className="text-orange-500 mr-2" />
                Refill Alerts
              </h3>
              <span className="bg-orange-100 text-orange-700 text-[10px] font-black px-3 py-1 rounded-full uppercase italic">
                Predicted by Python
              </span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
              {report?.refillAlerts && report.refillAlerts.length > 0 ? (
                report.refillAlerts.map((alert, idx) => (
                  <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-black text-gray-900 text-sm">{alert.name}</p>
                        {alert.urgency === 'High' && (
                          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        )}
                      </div>
                      <div className="flex items-center text-[10px] text-gray-500 font-bold space-x-3 uppercase">
                        <span>Cycle: {alert.avgInterval} days</span>
                        <span className="text-blue-600">Expected: {alert.predictedDate}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => toast('Call feature integrated in Clients tab')}
                        className={`p-2.5 rounded-2xl transition-all shadow-sm ${
                          alert.urgency === 'High' 
                          ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-100' 
                          : 'bg-white border border-gray-200 text-blue-600 hover:bg-gray-50'
                        }`}
                      >
                        <Phone size={16} fill={alert.urgency === 'High' ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-gray-400 text-xs italic">
                  No immediate refills predicted today.
                </div>
              )}
            </div>
          </div>

          {/* Business Insights Banner */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-black mb-1 flex items-center uppercase tracking-tighter">
                <Brain className="mr-2" size={20} />
                Strategic Insight
              </h3>
              <p className="text-blue-100 text-xs font-medium leading-relaxed max-w-lg">
                {report?.summary?.atRisk > 0 
                  ? `Your "At Risk" segment has ${report.summary.atRisk} clients. Re-engaging them today could protect approximately ${formatCurrency(report.summary.atRisk * 1500)} in monthly revenue.`
                  : "Excellent! Your customer retention is at 100% for the current cycle. Keep maintaining service quality to grow your 'Champion' segment."}
              </p>
            </div>
            <ChevronRight className="absolute -right-4 -bottom-4 text-white opacity-10" size={100} />
          </div>
        </div>
      </div>
      
      {/* Bottom Footer Info */}
      <div className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest pb-4">
        Report Generated: {report?.timestamp?.toDate ? report.timestamp.toDate().toLocaleString('en-IN') : 'Just now'}
      </div>
    </div>
  );
};

export default IntelligenceDashboard;
