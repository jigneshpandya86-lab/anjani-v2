import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase-config';
import { Bell, Clock, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const CONFIG_DOC = doc(db, 'config', 'defaulterReminder');

export default function DefaulterReminderSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDoc(CONFIG_DOC).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setEnabled(data.enabled ?? false);
        setHour(data.hour ?? 10);
        setMinute(data.minute ?? 0);
      }
    }).catch((e) => {
      console.error('Failed to load defaulter reminder config:', e);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(CONFIG_DOC, { enabled, hour: Number(hour), minute: Number(minute) }, { merge: true });
      toast.success('Reminder schedule saved!');
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const formattedTime = () => {
    const h = Number(hour);
    const m = Number(minute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
      <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <h3 className="font-bold text-sm text-red-800">Defaulter Payment Reminder</h3>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-gray-500">
          Automatically sends a payment reminder SMS (via webhook) to all clients tagged as <span className="font-semibold text-red-600">Defaulter</span> at the configured time every day.
        </p>

        {/* Enable toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className={`w-4 h-4 ${enabled ? 'text-red-500' : 'text-gray-400'}`} />
            <span className="text-sm font-semibold text-gray-700">Auto-send enabled</span>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(prev => !prev)}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${enabled ? 'bg-red-500' : 'bg-gray-300'}`}
            aria-label="Toggle auto reminder"
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Time picker */}
        <div className={`transition-opacity ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <label className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Send Time (IST)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white"
            >
              {Array.from({ length: 24 }, (_, i) => {
                const period = i >= 12 ? 'PM' : 'AM';
                const display = `${i % 12 || 12}:00 ${period}`;
                return <option key={i} value={i}>{display}</option>;
              })}
            </select>
            <span className="text-gray-400 font-bold">:</span>
            <select
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white"
            >
              {[0, 15, 30, 45].map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
          {enabled && (
            <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              Reminders will fire daily at <span className="font-semibold text-gray-700 ml-0.5">{formattedTime()}</span> IST
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] border border-[#a88734] text-gray-900 font-bold rounded-lg text-sm shadow-sm hover:from-[#f5d78e] hover:to-[#eeb933] disabled:opacity-50 transition-all"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>
    </div>
  );
}
