import React from 'react';
import { Shield, MapPin, AlertTriangle, Phone, Activity, Home, Info } from 'lucide-react';

const SafetyReport = ({ location }) => {
  if (!location) return null;

  const getRatingColor = (rating) => {
    if (rating >= 4) return 'bg-emerald-500';
    if (rating >= 3) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 px-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <MapPin size={18} />
                <span className="text-sm font-medium tracking-wider uppercase">{location.pincode}</span>
              </div>
              <h2 className="text-3xl font-bold">{location.locationName}</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-slate-400 font-medium uppercase tracking-tighter">Safety Score</div>
                <div className="text-4xl font-black">{location.overallRating}<span className="text-xl text-slate-500">/5</span></div>
              </div>
              <div className={`w-12 h-12 rounded-2xl ${getRatingColor(location.overallRating)} flex items-center justify-center shadow-lg`}>
                <Shield className="text-white" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-10">
          {/* Summary */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-slate-900">
              <Info className="text-indigo-600" size={20} />
              <h3 className="text-xl font-bold">Safety Overview</h3>
            </div>
            <p className="text-slate-600 leading-relaxed text-lg">
              {location.summaryText}
            </p>
          </section>

          {/* Crime Stats */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <div className="flex items-center gap-2 mb-6">
                <Activity className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold">Incident Risk</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(location.crimeStats).map(([key, value]) => {
                  if (key === 'infrastructure') return null;
                  return (
                    <div key={key} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100">
                      <span className="text-slate-500 font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${
                        value === 'Low' ? 'bg-emerald-100 text-emerald-700' : 
                        value === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="text-indigo-600" size={20} />
                <h3 className="text-lg font-bold">Infrastructure</h3>
              </div>
              <div className="flex items-start gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 mb-1">Status</div>
                  <div className="text-slate-600 text-sm leading-snug">{location.crimeStats.infrastructure}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Emergency Hubs */}
          <section>
            <div className="flex items-center gap-2 mb-6 text-slate-900">
              <Phone className="text-indigo-600" size={20} />
              <h3 className="text-xl font-bold">Emergency Contacts</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {location.emergencyHubs.map((hub, index) => (
                <div key={index} className="flex flex-col p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">{hub.type}</span>
                  <span className="text-slate-900 font-bold mb-1 line-clamp-1">{hub.name}</span>
                  <span className="text-slate-400 text-xs flex items-center gap-1">
                    <MapPin size={12} /> {hub.distance} away
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Night Time Condition */}
          <section className="bg-indigo-600 rounded-3xl p-8 text-white relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle size={24} />
                <h3 className="text-xl font-bold">Night Safety Advisory</h3>
              </div>
              <p className="text-indigo-100 leading-relaxed italic">
                "{location.nightTimeCondition}"
              </p>
            </div>
            <Shield className="absolute -right-8 -bottom-8 text-white/5 w-48 h-48 -rotate-12" />
          </section>
        </div>
      </div>
    </div>
  );
};

export default SafetyReport;
