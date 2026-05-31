import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase-config';
import { Calendar, Clock, BellRing, Save, Sliders, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export default function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Defaulter Reminder Schedule State
  const [defaulterEnabled, setDefaulterEnabled] = useState(false);
  const [defaulterHour, setDefaulterHour] = useState(12);
  const [defaulterDays, setDefaulterDays] = useState([1, 3, 5]);

  // Regular Reminder Schedule State
  const [regularEnabled, setRegularEnabled] = useState(false);
  const [regularHour, setRegularHour] = useState(10);
  const [regularDays, setRegularDays] = useState([3]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const defaulterSnap = await getDoc(doc(db, 'config', 'defaulterReminder'));
        if (defaulterSnap.exists()) {
          const data = defaulterSnap.data();
          setDefaulterEnabled(!!data.enabled);
          setDefaulterHour(data.hour !== undefined ? Number(data.hour) : 12);
          setDefaulterDays(Array.isArray(data.days) ? data.days : [1, 3, 5]);
        }

        const regularSnap = await getDoc(doc(db, 'config', 'regularReminder'));
        if (regularSnap.exists()) {
          const data = regularSnap.data();
          setRegularEnabled(!!data.enabled);
          setRegularHour(data.hour !== undefined ? Number(data.hour) : 10);
          setRegularDays(Array.isArray(data.days) ? data.days : [3]);
        }
      } catch (err) {
        console.error('Failed to load scheduler configs:', err);
        toast.error('Failed to load schedule configurations');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const toggleDefaulterDay = (dayVal) => {
    setDefaulterDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort()
    );
  };

  const toggleRegularDay = (dayVal) => {
    setRegularDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort()
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Save Defaulter settings
      await setDoc(doc(db, 'config', 'defaulterReminder'), {
        enabled: defaulterEnabled,
        hour: Number(defaulterHour),
        days: defaulterDays,
        minute: 0, // default execution at start of hour
      }, { merge: true });

      // 2. Save Regular settings
      await setDoc(doc(db, 'config', 'regularReminder'), {
        enabled: regularEnabled,
        hour: Number(regularHour),
        days: regularDays,
        minute: 0,
      }, { merge: true });

      toast.success('Scheduler configurations saved successfully!');
    } catch (err) {
      console.error('Failed to save configs:', err);
      toast.error('Failed to save configurations: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-[#131921] text-white p-4 flex items-center gap-2">
          <Sliders className="text-orange-400" />
          <h2 className="font-bold text-lg">System Scheduler Settings</h2>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-8">
          
          {/* Section A: Regular Client Reminders */}
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div className="flex items-center gap-2">
                <BellRing className="text-orange-500 w-5 h-5" />
                <h3 className="font-bold text-gray-800 text-sm md:text-base">Regular Client Order Reminders</h3>
              </div>
              <button
                type="button"
                onClick={() => setRegularEnabled((prev) => !prev)}
                className="text-gray-600 focus:outline-none"
              >
                {regularEnabled ? (
                  <ToggleRight className="w-12 h-12 text-green-500" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-gray-400" />
                )}
              </button>
            </div>

            {regularEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                <div>
                  <label htmlFor="regularHourSelect" className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Delivery Query Hour (24-hr format)
                  </label>
                  <select
                    id="regularHourSelect"
                    value={regularHour}
                    onChange={(e) => setRegularHour(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00 {i >= 12 ? 'PM' : 'AM'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Trigger Weekdays
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((d) => {
                      const isSelected = regularDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleRegularDay(d.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-orange-500 border-orange-600 text-white'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {!regularEnabled && (
              <p className="text-xs text-gray-400 italic">Scheduled reminders for regular clients are currently disabled.</p>
            )}
          </div>

          {/* Section B: Defaulter Reminders */}
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <div className="flex items-center gap-2">
                <BellRing className="text-red-500 w-5 h-5" />
                <h3 className="font-bold text-gray-800 text-sm md:text-base">Payment Defaulter Reminders</h3>
              </div>
              <button
                type="button"
                onClick={() => setDefaulterEnabled((prev) => !prev)}
                className="text-gray-600 focus:outline-none"
              >
                {defaulterEnabled ? (
                  <ToggleRight className="w-12 h-12 text-green-500" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-gray-400" />
                )}
              </button>
            </div>

            {defaulterEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                <div>
                  <label htmlFor="defaulterHourSelect" className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Reminder Trigger Hour (24-hr format)
                  </label>
                  <select
                    id="defaulterHourSelect"
                    value={defaulterHour}
                    onChange={(e) => setDefaulterHour(Number(e.target.value))}
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, '0')}:00 {i >= 12 ? 'PM' : 'AM'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-bold text-gray-600 mb-2 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Trigger Weekdays
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS_OF_WEEK.map((d) => {
                      const isSelected = defaulterDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDefaulterDay(d.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-orange-500 border-orange-600 text-white'
                              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            {!defaulterEnabled && (
              <p className="text-xs text-gray-400 italic">Defaulter payment reminders are currently disabled.</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4 border-t flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 rounded-lg shadow-sm border border-[#a88734] bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] text-gray-900 font-bold hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer text-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Scheduler Settings'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
