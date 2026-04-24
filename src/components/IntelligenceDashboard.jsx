import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase-config';
import { 
  Brain, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  Phone, 
  Clock,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

const IntelligenceDashboard = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={48} />
        <p className="text-gray-500 font-medium">Anjani Intelligence is warming up...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-12 max-w-2xl mx-auto">
          <Brain size={64} className="mx-auto text-blue-400 mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Intelligence Engine Ready</h2>
          <p className="text-gray-600 mb-8">
            The Python-powered intelligence module is installed. 
            Run the analysis script to generate your first predictive business report.
          </p>
          <button 
            onClick={() => toast.success('Python script is ready to run in the backend!')}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center mx-auto"
          >
            <RefreshCw size={20} className="mr-2" />
            Refresh Intelligence
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Brain className="text-blue-600 mr-2" />
            Anjani Intelligence Hub
          </h1>
          <p className="text-gray-500 text-sm">Predictive insights powered by Python</p>
        </div>
        <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full w-fit">
          Last updated: {report.timestamp?.toDate ? report.timestamp.toDate().toLocaleString() : 'Just now'}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={20} className="text-green-500" />
            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase">Predicted</span>
          </div>
          <p className="text-gray-500 text-xs mb-1">7-Day Forecast</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(report.forecast?.next7DaysEstimate || 0)}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Users size={20} className="text-blue-500" />
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">Active</span>
          </div>
          <p className="text-gray-500 text-xs mb-1">Total Customers</p>
          <p className="text-xl font-bold text-gray-900">{report.summary?.activeCustomers || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Brain size={20} className="text-purple-500" />
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded uppercase">Loyal</span>
          </div>
          <p className="text-gray-500 text-xs mb-1">Champions</p>
          <p className="text-xl font-bold text-gray-900">{report.summary?.champions || 0}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle size={20} className="text-orange-500" />
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase">Action</span>
          </div>
          <p className="text-gray-500 text-xs mb-1">At Risk Clients</p>
          <p className="text-xl font-bold text-gray-900">{report.summary?.atRisk || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Refill Alerts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center">
              <Clock size={18} className="text-orange-500 mr-2" />
              Refill Alerts
            </h3>
            <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-1 rounded-full">
              {report.refillAlerts?.length || 0} Predicted
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {report.refillAlerts && report.refillAlerts.length > 0 ? (
              report.refillAlerts.map((alert, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="space-y-1">
                    <p className="font-bold text-gray-900">{alert.name}</p>
                    <div className="flex items-center text-xs text-gray-500 space-x-3">
                      <span>Avg: {alert.avgInterval} days</span>
                      <span>Next: {alert.predictedDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      alert.urgency === 'High' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                    }`}>
                      {alert.urgency}
                    </span>
                    <button 
                      onClick={() => toast('Call client logic placeholder')}
                      className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all"
                    >
                      <Phone size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-400 text-sm italic">
                No refill alerts for the current period.
              </div>
            )}
          </div>
        </div>

        {/* Customer Segments Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center">
              <Users size={18} className="text-blue-500 mr-2" />
              Customer Segments
            </h3>
            <button className="text-blue-600 text-xs font-bold hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Recency</th>
                  <th className="px-4 py-3">Freq</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.customerSegments?.slice(0, 6).map((segment, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{segment.clientName}</td>
                    <td className="px-4 py-3 text-gray-500">{segment.recency}d ago</td>
                    <td className="px-4 py-3 text-gray-500">{segment.frequency}x</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        segment.segment === 'Champion' ? 'bg-green-50 text-green-600' :
                        segment.segment === 'At Risk' ? 'bg-red-50 text-red-600' :
                        segment.segment === 'New' ? 'bg-blue-50 text-blue-600' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {segment.segment}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2 flex items-center">
            <Brain className="mr-2" size={24} />
            Business Tip
          </h3>
          <p className="text-blue-100 max-w-2xl text-sm leading-relaxed">
            Your "At Risk" segment has {report.summary?.atRisk} clients. 
            Re-engaging these clients today could recover approximately {formatCurrency(report.summary?.atRisk * (report.summary?.totalRevenue / report.summary?.activeCustomers))} in annual revenue.
          </p>
        </div>
        <ChevronRight className="absolute -right-4 -bottom-4 text-blue-500 opacity-20" size={120} />
      </div>
    </div>
  );
};

export default IntelligenceDashboard;
