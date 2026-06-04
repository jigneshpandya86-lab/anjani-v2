import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase-config'
import { Calendar, Clock, BellRing, Save, Sliders, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i)

function SchedulerCard({
  enabled,
  hour,
  hourLabel,
  id,
  inactiveText,
  iconColor,
  onHourChange,
  onToggle,
  onToggleDay,
  selectedDays,
  title,
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(210px,1fr)_180px_minmax(260px,1.25fr)_auto] md:items-center">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-2 md:border-b-0 md:pb-0">
          <BellRing className={`${iconColor} h-4 w-4 shrink-0`} />
          <div>
            <h3 className="text-sm font-bold leading-tight text-gray-800">{title}</h3>
            {!enabled && <p className="mt-0.5 text-xs italic text-gray-400">{inactiveText}</p>}
          </div>
        </div>

        <div className={`${enabled ? '' : 'opacity-50'} min-w-0`}>
          <label
            htmlFor={id}
            className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-600"
          >
            <Clock className="h-3.5 w-3.5" />
            {hourLabel}
          </label>
          <select
            id={id}
            value={hour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            disabled={!enabled}
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 disabled:cursor-not-allowed"
          >
            {HOUR_OPTIONS.map((optionHour) => (
              <option key={optionHour} value={optionHour}>
                {String(optionHour).padStart(2, '0')}:00 {optionHour >= 12 ? 'PM' : 'AM'}
              </option>
            ))}
          </select>
        </div>

        <div className={`${enabled ? '' : 'opacity-50'}`}>
          <span className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-600">
            <Calendar className="h-3.5 w-3.5" />
            Trigger Weekdays
          </span>
          <div className="flex flex-wrap gap-1">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => onToggleDay(day.value)}
                  disabled={!enabled}
                  className={`min-w-10 rounded-md border px-2.5 py-1 text-xs font-bold transition-all ${
                    isSelected
                      ? 'border-orange-600 bg-orange-500 text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="justify-self-end text-gray-600 focus:outline-none"
        >
          {enabled ? (
            <ToggleRight className="h-10 w-10 text-green-500" />
          ) : (
            <ToggleLeft className="h-10 w-10 text-gray-400" />
          )}
        </button>
      </div>
    </section>
  )
}

export default function SettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Defaulter Reminder Schedule State
  const [defaulterEnabled, setDefaulterEnabled] = useState(false)
  const [defaulterHour, setDefaulterHour] = useState(12)
  const [defaulterDays, setDefaulterDays] = useState([1, 3, 5])

  // Regular Reminder Schedule State
  const [regularEnabled, setRegularEnabled] = useState(false)
  const [regularHour, setRegularHour] = useState(10)
  const [regularDays, setRegularDays] = useState([3])

  // Stock Summary Report Schedule State
  const [stockEnabled, setStockEnabled] = useState(false)
  const [stockHour, setStockHour] = useState(21)
  const [stockDays, setStockDays] = useState([0, 1, 2, 3, 4, 5, 6])

  // Defaulter Call List to Staff State
  const [staffAlertEnabled, setStaffAlertEnabled] = useState(true);
  const [staffAlertHour, setStaffAlertHour] = useState(11);
  const [staffAlertDays, setStaffAlertDays] = useState([6]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const defaulterSnap = await getDoc(doc(db, 'config', 'defaulterReminder'))
        if (defaulterSnap.exists()) {
          const data = defaulterSnap.data()
          setDefaulterEnabled(!!data.enabled)
          setDefaulterHour(data.hour !== undefined ? Number(data.hour) : 12)
          setDefaulterDays(Array.isArray(data.days) ? data.days : [1, 3, 5])
        }

        const regularSnap = await getDoc(doc(db, 'config', 'regularReminder'))
        if (regularSnap.exists()) {
          const data = regularSnap.data()
          setRegularEnabled(!!data.enabled)
          setRegularHour(data.hour !== undefined ? Number(data.hour) : 10)
          setRegularDays(Array.isArray(data.days) ? data.days : [3])
        }

        const stockSnap = await getDoc(doc(db, 'config', 'stockReminder'))
        if (stockSnap.exists()) {
          const data = stockSnap.data()
          setStockEnabled(!!data.enabled)
          setStockHour(data.hour !== undefined ? Number(data.hour) : 21)
          setStockDays(Array.isArray(data.days) ? data.days : [0, 1, 2, 3, 4, 5, 6])
        } else {
          // Default configs if document not yet created
          setStockEnabled(true)
          setStockHour(21)
          setStockDays([0, 1, 2, 3, 4, 5, 6])
        }

        const staffAlertSnap = await getDoc(doc(db, 'config', 'defaulterStaffAlert'));
        if (staffAlertSnap.exists()) {
          const data = staffAlertSnap.data();
          setStaffAlertEnabled(!!data.enabled);
          setStaffAlertHour(data.hour !== undefined ? Number(data.hour) : 11);
          setStaffAlertDays(Array.isArray(data.days) ? data.days : [6]);
        } else {
          setStaffAlertEnabled(true);
          setStaffAlertHour(11);
          setStaffAlertDays([6]);
        }
      } catch (err) {
        console.error('Failed to load scheduler configs:', err)
        toast.error('Failed to load schedule configurations')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const toggleDefaulterDay = (dayVal) => {
    setDefaulterDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

  const toggleRegularDay = (dayVal) => {
    setRegularDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

  const toggleStockDay = (dayVal) => {
    setStockDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

  const toggleStaffAlertDay = (dayVal) => {
    setStaffAlertDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort()
    );
  };

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      // 1. Save Defaulter settings
      await setDoc(
        doc(db, 'config', 'defaulterReminder'),
        {
          enabled: defaulterEnabled,
          hour: Number(defaulterHour),
          days: defaulterDays,
          minute: 0, // default execution at start of hour
        },
        { merge: true },
      )

      // 2. Save Regular settings
      await setDoc(
        doc(db, 'config', 'regularReminder'),
        {
          enabled: regularEnabled,
          hour: Number(regularHour),
          days: regularDays,
          minute: 0,
        },
        { merge: true },
      )

      // 3. Save Stock Report settings
      await setDoc(
        doc(db, 'config', 'stockReminder'),
        {
          enabled: stockEnabled,
          hour: Number(stockHour),
          days: stockDays,
          minute: 0,
        },
        { merge: true },
      )

      // 4. Save Defaulter Staff Alert settings
      await setDoc(
        doc(db, 'config', 'defaulterStaffAlert'),
        {
          enabled: staffAlertEnabled,
          hour: Number(staffAlertHour),
          days: staffAlertDays,
          minute: 0,
        },
        { merge: true },
      )

      toast.success('Scheduler configurations saved successfully!')
    } catch (err) {
      console.error('Failed to save configs:', err)
      toast.error('Failed to save configurations: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-orange-500"></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl p-2 md:p-3">
      <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
        <div className="flex items-center gap-2 bg-[#131921] px-4 py-3 text-white">
          <Sliders className="h-5 w-5 text-orange-400" />
          <h2 className="text-base font-bold md:text-lg">System Scheduler Settings</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-3 p-3 md:p-4">
          <SchedulerCard
            enabled={regularEnabled}
            hour={regularHour}
            hourLabel="Delivery Hour"
            id="regularHourSelect"
            inactiveText="Regular client reminders are disabled."
            iconColor="text-orange-500"
            onHourChange={setRegularHour}
            onToggle={() => setRegularEnabled((prev) => !prev)}
            onToggleDay={toggleRegularDay}
            selectedDays={regularDays}
            title="Regular Client Order Reminders"
          />

          <SchedulerCard
            enabled={defaulterEnabled}
            hour={defaulterHour}
            hourLabel="Reminder Hour"
            id="defaulterHourSelect"
            inactiveText="Defaulter payment reminders are disabled."
            iconColor="text-red-500"
            onHourChange={setDefaulterHour}
            onToggle={() => setDefaulterEnabled((prev) => !prev)}
            onToggleDay={toggleDefaulterDay}
            selectedDays={defaulterDays}
            title="Payment Defaulter Reminders"
          />

          <SchedulerCard
            enabled={stockEnabled}
            hour={stockHour}
            hourLabel="Report Hour"
            id="stockHourSelect"
            inactiveText="Daily stock summary notifications are disabled."
            iconColor="text-blue-500"
            onHourChange={setStockHour}
            onToggle={() => setStockEnabled((prev) => !prev)}
            onToggleDay={toggleStockDay}
            selectedDays={stockDays}
            title="Daily Stock Summary to Staff"
          />

          <SchedulerCard
            enabled={staffAlertEnabled}
            hour={staffAlertHour}
            hourLabel="Alert Hour"
            id="staffAlertHourSelect"
            inactiveText="Defaulter call alerts to staff are disabled."
            iconColor="text-indigo-500"
            onHourChange={setStaffAlertHour}
            onToggle={() => setStaffAlertEnabled((prev) => !prev)}
            onToggleDay={toggleStaffAlertDay}
            selectedDays={staffAlertDays}
            title="Defaulter Call List to Staff"
          />

          <div className="flex justify-end border-t pt-3">
            <button
              type="submit"
              disabled={saving}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#a88734] bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] px-5 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Scheduler Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
