import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase-config'

const TASK_ROWS = [
  {
    key: 'leads',
    label: 'Leads',
    description: 'Ask to buy',
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Ask for payment',
  },
  {
    key: 'orderDelivered',
    label: 'Order Delivered',
    description: 'Order delivery',
  },
]

const SCHEDULE_COLUMNS = [
  { key: 'atEvent', label: 'At event occurred' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'day15', label: '15 days' },
  { key: 'day30', label: '30 days' },
  { key: 'every30After', label: 'Every 30 days afterwards' },
]

const createDefaultSettings = () => ({
  enabled: true,
  leads: {
    active: true,
    atEvent: true,
    weekly: false,
    day15: false,
    day30: false,
    every30After: false,
  },
  payments: {
    active: true,
    atEvent: true,
    weekly: false,
    day15: false,
    day30: false,
    every30After: false,
  },
  orderDelivered: {
    active: true,
    atEvent: true,
    weekly: false,
    day15: false,
    day30: false,
    every30After: false,
  },
})

const SETTINGS_DOC = doc(db, 'settings', 'smsAutomation')

export default function SmsAutomationSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState(createDefaultSettings)

  useEffect(() => {
    const unsub = onSnapshot(SETTINGS_DOC, (snapshot) => {
      const defaults = createDefaultSettings()
      if (!snapshot.exists()) {
        setSettings(defaults)
        setLoading(false)
        return
      }

      const data = snapshot.data() || {}
      const merged = { ...defaults, enabled: data.enabled !== false }

      TASK_ROWS.forEach((task) => {
        const docRow = data[task.key] || {}
        merged[task.key] = {
          ...defaults[task.key],
          ...docRow,
        }
      })

      setSettings(merged)
      setLoading(false)
    })

    return unsub
  }, [])

  const hasAnyEnabledSchedule = useMemo(() => {
    return TASK_ROWS.some((task) => {
      const row = settings[task.key]
      if (!row?.active) return false
      return SCHEDULE_COLUMNS.some((column) => row[column.key])
    })
  }, [settings])

  const toggleRowActive = (taskKey) => {
    setSettings((prev) => ({
      ...prev,
      [taskKey]: {
        ...prev[taskKey],
        active: !prev[taskKey].active,
      },
    }))
  }

  const toggleSchedule = (taskKey, columnKey) => {
    setSettings((prev) => ({
      ...prev,
      [taskKey]: {
        ...prev[taskKey],
        [columnKey]: !prev[taskKey][columnKey],
      },
    }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await setDoc(
        SETTINGS_DOC,
        {
          enabled: settings.enabled !== false,
          ...settings,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
      toast.success('SMS automation settings saved')
    } catch (error) {
      console.error(error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
        <h2 className="text-lg font-black text-[#131921]">SMS Automation Settings</h2>
        <p className="text-xs text-gray-500 mt-1 font-semibold">
          Tick schedule columns for each task type. SMS jobs will be created for checked timings only.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(settings.enabled)}
            onChange={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className="h-4 w-4 rounded border-gray-300 text-[#ff9900] focus:ring-[#ff9900]"
          />
          <span className="text-xs font-bold text-gray-700">
            {settings.enabled ? 'Automation Enabled' : 'Automation Disabled'}
          </span>
        </label>
      </div>

      {loading ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">
          Loading SMS settings...
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-gray-500 font-black">Task Type</th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-gray-500 font-black">Active</th>
                  {SCHEDULE_COLUMNS.map((column) => (
                    <th key={column.key} className="px-4 py-3 text-[11px] uppercase tracking-widest text-gray-500 font-black whitespace-nowrap">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TASK_ROWS.map((task) => {
                  const row = settings[task.key]
                  const rowInactive = !row?.active

                  return (
                    <tr key={task.key} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-extrabold text-sm text-gray-900">{task.label}</p>
                        <p className="text-[11px] text-gray-500 font-semibold">{task.description}</p>
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(row?.active)}
                            onChange={() => toggleRowActive(task.key)}
                            className="h-4 w-4 rounded border-gray-300 text-[#ff9900] focus:ring-[#ff9900]"
                          />
                          <span className="text-xs font-bold text-gray-600">{rowInactive ? 'Inactive' : 'Active'}</span>
                        </label>
                      </td>
                      {SCHEDULE_COLUMNS.map((column) => (
                        <td key={column.key} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(row?.[column.key])}
                            disabled={rowInactive}
                            onChange={() => toggleSchedule(task.key, column.key)}
                            className="h-4 w-4 rounded border-gray-300 text-[#ff9900] focus:ring-[#ff9900] disabled:opacity-50"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-gray-500 font-semibold">
          {hasAnyEnabledSchedule
            ? 'Automation enabled for at least one task schedule.'
            : 'No schedule selected yet. Tick options to start background SMS.'}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-xl bg-[#ff9900] px-4 py-2 text-sm font-black text-white hover:bg-[#f08804] disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
