import { useState, useEffect, useRef } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, db } from '../firebase-config'
import {
  Calendar,
  Clock,
  BellRing,
  Save,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  MapPin,
  Flame,
  QrCode,
  Upload,
  Trash2,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Bot,
  Cpu,
  Zap,
  ShieldCheck,
  Target,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'
import { processUploadedQrFile, DEFAULT_UPI_ID, DEFAULT_PAYEE_NAME } from '../utils/qrHelper'

const ALL_BAILEY_CORRIDORS = [
  'Ajwa Road',
  'Waghodia Road',
  'Kapurai',
  'Parivar Char Rasta',
  'Mahavir Char Rasta',
]

const ALL_BAILEY_CATEGORIES = [
  'Restaurants & Dining',
  'Snacks & Farsan Outlets',
  'Cafes & Fast Food',
  'Dhabas & Food Points',
]

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
  children,
}) {
  const [isOpen, setIsOpen] = useState(false)

  const daysSummary =
    selectedDays.length === 7
      ? 'Daily'
      : selectedDays.length === 0
      ? 'No days'
      : selectedDays
          .map((d) => DAYS_OF_WEEK.find((w) => w.value === d)?.label)
          .filter(Boolean)
          .join(', ')

  const timeSummary = `${String(hour % 12 || 12).padStart(2, '0')}:00 ${hour >= 12 ? 'PM' : 'AM'}`

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs transition-all">
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-3 bg-white hover:bg-gray-50 flex items-center justify-between gap-2 cursor-pointer select-none transition-colors border-b border-gray-100"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <BellRing className={`${iconColor} h-4 w-4 shrink-0`} />
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-gray-800 truncate">{title}</h3>
            <p className="text-[10px] text-gray-500 font-medium truncate">
              {enabled ? `${timeSummary} • ${daysSummary}` : inactiveText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="cursor-pointer"
            title={enabled ? 'Disable' : 'Enable'}
          >
            {enabled ? (
              <ToggleRight className="h-6 w-6 text-green-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-gray-400" />
            )}
          </button>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {enabled ? 'Active' : 'Off'}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </div>

      {isOpen && (
        <div className="p-3 bg-gray-50/50 space-y-3 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div className={`${enabled ? '' : 'opacity-50'}`}>
              <label
                htmlFor={id}
                className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500"
              >
                <Clock className="h-3 w-3" />
                {hourLabel}
              </label>
              <select
                id={id}
                value={hour}
                onChange={(e) => onHourChange(Number(e.target.value))}
                disabled={!enabled}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-2 focus:ring-[#ff9900] disabled:cursor-not-allowed"
              >
                {HOUR_OPTIONS.map((optionHour) => (
                  <option key={optionHour} value={optionHour}>
                    {String(optionHour).padStart(2, '0')}:00 {optionHour >= 12 ? 'PM' : 'AM'}
                  </option>
                ))}
              </select>
            </div>

            <div className={`${enabled ? '' : 'opacity-50'}`}>
              <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                <Calendar className="h-3 w-3" />
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
                      className={`min-w-8 rounded-md border px-2 py-0.5 text-[11px] font-bold transition-all ${
                        isSelected
                          ? 'border-[#131921] bg-[#131921] text-white'
                          : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                      } ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          {children}
        </div>
      )}
    </section>
  )
}

export default function SettingsTab() {
  const [subTab, setSubTab] = useState('payment') // 'payment' | 'schedulers' | 'ai'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Payment QR Code state
  const savePaymentSettings = useClientStore((state) => state.savePaymentSettings)
  const fetchPaymentSettings = useClientStore((state) => state.fetchPaymentSettings)

  // AI Assistant & Model state
  const aiSettings = useClientStore((state) => state.aiSettings)
  const fetchAiSettings = useClientStore((state) => state.fetchAiSettings)
  const saveAiSettings = useClientStore((state) => state.saveAiSettings)
  const setAiDrawerOpen = useClientStore((state) => state.setAiDrawerOpen)

  const [aiActiveModel, setAiActiveModel] = useState('gemini-2.5-flash-lite')
  const [aiCustomModel, setAiCustomModel] = useState('')
  const [aiFallbackModel, setAiFallbackModel] = useState('gemini-2.5-flash')
  const [aiMaxTokens, setAiMaxTokens] = useState(600)
  const [savingAi, setSavingAi] = useState(false)

  const [qrImageDataUrl, setQrImageDataUrl] = useState(null)
  const [upiId, setUpiId] = useState('')
  const [payeeName, setPayeeName] = useState(DEFAULT_PAYEE_NAME)
  const [savingPayment, setSavingPayment] = useState(false)
  const [processingFile, setProcessingFile] = useState(false)
  const [showUpiDetails, setShowUpiDetails] = useState(false)
  const [showAiAdvanced, setShowAiAdvanced] = useState(false)
  const [showAiArchitecture, setShowAiArchitecture] = useState(false)
  const fileInputRef = useRef(null)

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
  const [staffAlertEnabled, setStaffAlertEnabled] = useState(true)
  const [staffAlertHour, setStaffAlertHour] = useState(11)
  const [staffAlertDays, setStaffAlertDays] = useState([6])

  // Greetings Schedule State
  const [greetingsEnabled, setGreetingsEnabled] = useState(true)
  const [greetingsHour, setGreetingsHour] = useState(10)
  const [greetingsDays, setGreetingsDays] = useState([0, 1, 2, 3, 4, 5, 6])
  const [greetingsBirthdayTemplate, setGreetingsBirthdayTemplate] = useState('Happy Birthday {name}! Wishing you a wonderful day filled with joy, health, and success. - Anjani Water')
  const [greetingsAnniversaryTemplate, setGreetingsAnniversaryTemplate] = useState('Happy Wedding Anniversary {name}! Wishing you both a lifetime of love, happiness, and companionship. - Anjani Water')

  // Dynamic AI Lead Discovery State
  const [leadDiscoveryEnabled, setLeadDiscoveryEnabled] = useState(true)
  const [leadDiscoveryHour, setLeadDiscoveryHour] = useState(9)
  const [leadDiscoveryDays, setLeadDiscoveryDays] = useState([1])
  const [leadDiscoveryMode, setLeadDiscoveryMode] = useState('auto') // 'auto', 'aggressive', 'normal'
  const [baileyTargeting, setBaileyTargeting] = useState(true)
  const [selectedCorridors, setSelectedCorridors] = useState(ALL_BAILEY_CORRIDORS)
  const [selectedCategories, setSelectedCategories] = useState(ALL_BAILEY_CATEGORIES)
  const [isSearchingLeads, setIsSearchingLeads] = useState(false)
  const [leadDiscoveryStats, setLeadDiscoveryStats] = useState(null)

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

        const staffAlertSnap = await getDoc(doc(db, 'config', 'defaulterStaffAlert'))
        if (staffAlertSnap.exists()) {
          const data = staffAlertSnap.data()
          setStaffAlertEnabled(!!data.enabled)
          setStaffAlertHour(data.hour !== undefined ? Number(data.hour) : 11)
          setStaffAlertDays(Array.isArray(data.days) ? data.days : [6])
        } else {
          setStaffAlertEnabled(true)
          setStaffAlertHour(11)
          setStaffAlertDays([6])
        }

        const greetingsSnap = await getDoc(doc(db, 'config', 'greetingsConfig'))
        if (greetingsSnap.exists()) {
          const data = greetingsSnap.data()
          setGreetingsEnabled(data.enabled !== undefined ? !!data.enabled : true)
          setGreetingsHour(data.hour !== undefined ? Number(data.hour) : 10)
          setGreetingsDays(Array.isArray(data.days) ? data.days : [0, 1, 2, 3, 4, 5, 6])
          setGreetingsBirthdayTemplate(data.birthdayTemplate || 'Happy Birthday {name}! Wishing you a wonderful day filled with joy, health, and success. - Anjani Water')
          setGreetingsAnniversaryTemplate(data.anniversaryTemplate || 'Happy Wedding Anniversary {name}! Wishing you both a lifetime of love, happiness, and companionship. - Anjani Water')
        } else {
          setGreetingsEnabled(true)
          setGreetingsHour(10)
          setGreetingsDays([0, 1, 2, 3, 4, 5, 6])
          setGreetingsBirthdayTemplate('Happy Birthday {name}! Wishing you a wonderful day filled with joy, health, and success. - Anjani Water')
          setGreetingsAnniversaryTemplate('Happy Wedding Anniversary {name}! Wishing you both a lifetime of love, happiness, and companionship. - Anjani Water')
        }

        const leadSnap = await getDoc(doc(db, 'config', 'leadDiscoveryConfig'))
        if (leadSnap.exists()) {
          const data = leadSnap.data()
          setLeadDiscoveryEnabled(data.enabled !== undefined ? !!data.enabled : true)
          setLeadDiscoveryHour(data.hour !== undefined ? Number(data.hour) : 9)
          setLeadDiscoveryDays(Array.isArray(data.days) ? data.days : [1])
          setLeadDiscoveryMode(data.mode || 'auto')
          setBaileyTargeting(data.baileyTargeting !== undefined ? !!data.baileyTargeting : true)
          if (Array.isArray(data.corridors) && data.corridors.length > 0) {
            setSelectedCorridors(data.corridors)
          }
          if (Array.isArray(data.categories) && data.categories.length > 0) {
            setSelectedCategories(data.categories)
          }
          setLeadDiscoveryStats({
            lastRunDate: data.lastRunDate,
            lastRunCount: data.lastRunCount,
            lastRunSeason: data.lastRunSeason,
          })
        } else {
          setLeadDiscoveryEnabled(true)
          setLeadDiscoveryHour(9)
          setLeadDiscoveryDays([1])
          setLeadDiscoveryMode('auto')
          setBaileyTargeting(true)
          setSelectedCorridors(ALL_BAILEY_CORRIDORS)
          setSelectedCategories(ALL_BAILEY_CATEGORIES)
        }
        await fetchPaymentSettings()
        const currentPay = useClientStore.getState().paymentSettings
        if (currentPay) {
          setQrImageDataUrl(currentPay.qrImageDataUrl || null)
          setUpiId(currentPay.upiId || '')
          setPayeeName(currentPay.payeeName || DEFAULT_PAYEE_NAME)
        }
        await fetchAiSettings()
      } catch (err) {
        console.error('Failed to load scheduler configs:', err)
        toast.error('Failed to load schedule configurations')
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [fetchPaymentSettings, fetchAiSettings])

  useEffect(() => {
    if (aiSettings) {
      const known = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
      if (known.includes(aiSettings.activeModel)) {
        setAiActiveModel(aiSettings.activeModel)
        setAiCustomModel('')
      } else if (aiSettings.activeModel) {
        setAiActiveModel('custom')
        setAiCustomModel(aiSettings.activeModel)
      }
      if (aiSettings.fallbackModel) setAiFallbackModel(aiSettings.fallbackModel)
      if (aiSettings.maxOutputTokens) setAiMaxTokens(aiSettings.maxOutputTokens)
    }
  }, [aiSettings])

  const handleSaveAi = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    setSavingAi(true)
    try {
      const chosenModel =
        aiActiveModel === 'custom'
          ? (aiCustomModel.trim() || 'gemini-2.5-flash-lite')
          : aiActiveModel
      await saveAiSettings({
        activeModel: chosenModel,
        fallbackModel: aiFallbackModel.trim() || 'gemini-2.5-flash',
        maxOutputTokens: Number(aiMaxTokens) || 600,
      })
      toast.success(`AI settings saved! Active Model: ${chosenModel}`)
    } catch (err) {
      console.error('Failed to save AI settings:', err)
      toast.error('Failed to save AI settings: ' + err.message)
    } finally {
      setSavingAi(false)
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessingFile(true)
    try {
      const result = await processUploadedQrFile(file)
      setQrImageDataUrl(result.dataUrl)
      if (result.detectedUpiId) {
        setUpiId(result.detectedUpiId)
        toast.success(`Detected UPI ID: ${result.detectedUpiId}`)
      }
      if (result.detectedPayee) {
        setPayeeName(result.detectedPayee)
      }
      toast.success('QR Code loaded from gallery!')
    } catch (err) {
      toast.error('Failed to process image: ' + err.message)
    } finally {
      setProcessingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSavePayment = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    setSavingPayment(true)
    try {
      await savePaymentSettings({
        qrImageDataUrl,
        upiId: upiId.trim(),
        payeeName: payeeName.trim() || DEFAULT_PAYEE_NAME,
      })
      toast.success('Payment QR settings saved successfully!')
    } catch (err) {
      toast.error('Failed to save payment settings: ' + err.message)
    } finally {
      setSavingPayment(false)
    }
  }

  const handleRemoveQr = async () => {
    const confirmed = window.confirm(
      'Remove uploaded QR code? PDF invoices will use default vector QR instead.'
    )
    if (!confirmed) return
    setSavingPayment(true)
    try {
      setQrImageDataUrl(null)
      await savePaymentSettings({
        qrImageDataUrl: null,
        upiId: upiId.trim(),
        payeeName: payeeName.trim() || DEFAULT_PAYEE_NAME,
      })
      toast.success('QR code removed')
    } catch (err) {
      toast.error('Failed to remove: ' + err.message)
    } finally {
      setSavingPayment(false)
    }
  }

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
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

  const toggleGreetingsDay = (dayVal) => {
    setGreetingsDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

  const toggleLeadDiscoveryDay = (dayVal) => {
    setLeadDiscoveryDays((prev) =>
      prev.includes(dayVal) ? prev.filter((d) => d !== dayVal) : [...prev, dayVal].sort(),
    )
  }

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

      // 5. Save Greetings settings
      await setDoc(
        doc(db, 'config', 'greetingsConfig'),
        {
          enabled: greetingsEnabled,
          hour: Number(greetingsHour),
          days: greetingsDays,
          birthdayTemplate: greetingsBirthdayTemplate,
          anniversaryTemplate: greetingsAnniversaryTemplate,
          minute: 0,
        },
        { merge: true },
      )

      // 6. Save AI Dynamic Lead Discovery settings
      await setDoc(
        doc(db, 'config', 'leadDiscoveryConfig'),
        {
          enabled: leadDiscoveryEnabled,
          hour: Number(leadDiscoveryHour),
          days: leadDiscoveryDays,
          mode: leadDiscoveryMode,
          baileyTargeting,
          corridors: selectedCorridors,
          categories: selectedCategories,
          targetProduct: 'Bailey Packaged Drinking Water',
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

  const toggleCorridor = (corridor) => {
    setSelectedCorridors((prev) =>
      prev.includes(corridor)
        ? prev.length > 1
          ? prev.filter((c) => c !== corridor)
          : prev
        : [...prev, corridor],
    )
  }

  const toggleCategory = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat)
        ? prev.length > 1
          ? prev.filter((c) => c !== cat)
          : prev
        : [...prev, cat],
    )
  }

  const handleSearchBaileyLeadsNow = async () => {
    setIsSearchingLeads(true)
    try {
      const functionsInstance = getFunctions(app, 'asia-south1')
      const triggerFn = httpsCallable(functionsInstance, 'triggerBaileyLeadDiscovery')
      const res = await triggerFn({
        baileyTargeting,
        corridors: selectedCorridors,
        categories: selectedCategories,
        mode: leadDiscoveryMode,
      })
      const count = res.data?.addedCount || 0
      if (count > 0) {
        toast.success(`Success! Added ${count} new Bailey Water leads in ${selectedCorridors.slice(0, 2).join(', ')}!`)
      } else {
        toast('Scanned selected corridors. All found candidates already exist in your system.', { icon: 'ℹ️' })
      }
      setLeadDiscoveryStats({
        lastRunDate: new Date().toISOString().slice(0, 10),
        lastRunCount: count,
        lastRunSeason: 'Bailey Water Key Corridor Radar',
      })
    } catch (err) {
      console.error('Lead search failed:', err)
      toast.error('Search failed: ' + (err.message || 'Check network connection'))
    } finally {
      setIsSearchingLeads(false)
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
    <div className="mx-auto max-w-4xl p-1.5 md:p-2 space-y-3">
      {/* Submenu Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-gray-200/80 rounded-2xl shadow-inner border border-gray-200">
        <button
          type="button"
          onClick={() => setSubTab('payment')}
          className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            subTab === 'payment'
              ? 'bg-[#131921] text-[#ff9900] shadow-md'
              : 'text-gray-700 hover:text-black hover:bg-gray-100/60'
          }`}
        >
          <QrCode size={16} />
          <span className="truncate">Invoice QR</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('schedulers')}
          className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            subTab === 'schedulers'
              ? 'bg-[#131921] text-[#ff9900] shadow-md'
              : 'text-gray-700 hover:text-black hover:bg-gray-100/60'
          }`}
        >
          <Sliders size={16} />
          <span className="truncate">Schedulers</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('ai')}
          className={`flex-1 py-2 px-2 sm:px-3 rounded-xl text-xs md:text-sm font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            subTab === 'ai'
              ? 'bg-[#131921] text-[#ff9900] shadow-md'
              : 'text-gray-700 hover:text-black hover:bg-gray-100/60'
          }`}
        >
          <Sparkles size={16} />
          <span className="truncate">AI & Models</span>
        </button>
      </div>

      {/* SUBTAB 1: INVOICE GPAY / UPI QR CODE */}
      {subTab === 'payment' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-[#131921] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-[#ff9900] flex items-center justify-center font-bold">
                <QrCode className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black">Invoice Payment & GPay QR Scanner</h2>
                <p className="text-[10px] text-gray-400 font-medium">
                  Upload your GPay / UPI QR image from gallery to print on every order invoice
                </p>
              </div>
            </div>
            {qrImageDataUrl && (
              <span className="hidden sm:flex text-[10px] bg-emerald-500/20 text-emerald-300 font-extrabold uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 items-center gap-1">
                <CheckCircle2 size={12} /> Active on Invoices
              </span>
            )}
          </div>

          <form onSubmit={handleSavePayment} className="p-4 md:p-6 space-y-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* QR Upload & Preview Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Left Column: Upload / Preview Card */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-black text-gray-700 uppercase tracking-wider">
                    Payment QR Code Image
                  </span>
                  {qrImageDataUrl && (
                    <span className="sm:hidden text-[9px] bg-emerald-100 text-emerald-800 font-extrabold uppercase px-2 py-0.5 rounded-md">
                      Active
                    </span>
                  )}
                </div>

                {qrImageDataUrl ? (
                  <div className="p-4 border-2 border-orange-200 rounded-2xl bg-orange-50/30 flex flex-col items-center justify-center gap-3.5">
                    <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-200">
                      <img
                        src={qrImageDataUrl}
                        alt="GPay QR Code"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-xl"
                      />
                    </div>
                    <div className="flex items-center gap-2 w-full max-w-xs">
                      <button
                        type="button"
                        disabled={processingFile || savingPayment}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 py-2.5 px-3 rounded-xl border border-gray-300 bg-white text-gray-800 font-bold text-xs hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        <Upload size={14} className="text-[#ff9900]" />
                        <span>Change Image</span>
                      </button>
                      <button
                        type="button"
                        disabled={processingFile || savingPayment}
                        onClick={handleRemoveQr}
                        className="py-2.5 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100 flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        <Trash2 size={14} />
                        <span>Remove</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={processingFile}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-8 border-2 border-dashed border-orange-300 hover:border-[#ff9900] rounded-2xl bg-orange-50/50 hover:bg-orange-50 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-white shadow-md border border-orange-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Upload className="w-7 h-7 text-[#ff9900]" />
                    </div>
                    <div className="text-center">
                      <p className="font-black text-gray-900 text-sm md:text-base">
                        {processingFile ? 'Processing Image...' : 'Click to Upload QR Code from Gallery'}
                      </p>
                      <p className="text-xs text-gray-500 font-medium mt-1">
                        Select a Google Pay, PhonePe, Paytm, or BHIM QR code screenshot from your phone
                      </p>
                      <span className="inline-block mt-3 px-3 py-1 bg-white text-[#ff9900] border border-orange-200 rounded-lg text-[11px] font-extrabold shadow-sm">
                        Supports JPG, PNG, WebP Photos
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Right Column: Details & Information */}
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowUpiDetails((prev) => !prev)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setShowUpiDetails((prev) => !prev)
                    }}
                    className="p-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-gray-100"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-orange-500" />
                      <div>
                        <h4 className="text-xs font-bold text-gray-800">Custom UPI & Payee Details (Optional)</h4>
                        <p className="text-[10px] text-gray-500 font-medium truncate">
                          {upiId ? `${payeeName || DEFAULT_PAYEE_NAME} • ${upiId}` : 'Tap to configure custom UPI handle & payee name'}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 transition-transform duration-200 ${
                        showUpiDetails ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {showUpiDetails && (
                    <div className="p-3.5 bg-white space-y-3.5 animate-in fade-in">
                      <div>
                        <label htmlFor="upi-id-input" className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                          UPI ID / VPA (Optional)
                        </label>
                        <div className="relative">
                          <CreditCard className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400" />
                          <input
                            id="upi-id-input"
                            type="text"
                            placeholder="e.g. 9925997750@okbizaxis"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#ff9900] focus:bg-white"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Printed below the QR code on the invoice so clients can copy or verify your handle.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="payee-name-input" className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                          Business / Payee Name
                        </label>
                        <input
                          id="payee-name-input"
                          type="text"
                          placeholder="Annapurna Foods"
                          value={payeeName}
                          onChange={(e) => setPayeeName(e.target.value)}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#ff9900] focus:bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Alert */}
                <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-1">
                  <p className="font-black flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-600" /> How it works on invoices
                  </p>
                  <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                    When you share or print any invoice from the <strong>Orders tab</strong>, this GPay QR code will be embedded in the bottom right corner next to your Kotak Mahindra Bank transfer details.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button
                type="submit"
                disabled={savingPayment || processingFile}
                className="flex items-center gap-2 rounded-xl border border-[#a88734] bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] px-6 py-3 text-xs md:text-sm font-black text-gray-900 shadow-md hover:from-[#f5d78e] hover:to-[#eeb933] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Save size={16} />
                <span>{savingPayment ? 'Saving...' : 'Save Payment QR Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 2: SYSTEM SCHEDULER SETTINGS */}
      {subTab === 'schedulers' && (
        <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50 shadow-sm">
          <div className="flex items-center gap-1.5 bg-[#131921] px-3.5 py-2 text-white">
            <Sliders className="h-4.5 w-4.5 text-orange-400" />
            <h2 className="text-sm font-bold md:text-base">System Scheduler Settings</h2>
          </div>

          <form onSubmit={handleSave} className="space-y-2 p-2.5 md:p-3">
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
              title="Daily Stock Summary Report"
            />

            <SchedulerCard
              enabled={staffAlertEnabled}
              hour={staffAlertHour}
              hourLabel="Staff Alert Hour"
              id="staffAlertHourSelect"
              inactiveText="Defaulter call list notifications to staff are disabled."
              iconColor="text-purple-500"
              onHourChange={setStaffAlertHour}
              onToggle={() => setStaffAlertEnabled((prev) => !prev)}
              onToggleDay={toggleStaffAlertDay}
              selectedDays={staffAlertDays}
              title="Defaulter Call List to Staff"
            />

            <SchedulerCard
              enabled={greetingsEnabled}
              hour={greetingsHour}
              hourLabel="Greetings Hour"
              id="greetingsHourSelect"
              inactiveText="Daily Birthday and Anniversary greetings are disabled."
              iconColor="text-emerald-500"
              onHourChange={setGreetingsHour}
              onToggle={() => setGreetingsEnabled((prev) => !prev)}
              onToggleDay={toggleGreetingsDay}
              selectedDays={greetingsDays}
              title="Daily Birthday & Anniversary Greetings"
            >
              {greetingsEnabled && (
                <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-xs text-gray-700">
                  <div>
                    <label htmlFor="bdayTemplate" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Birthday SMS Template
                    </label>
                    <textarea
                      id="bdayTemplate"
                      rows={2}
                      value={greetingsBirthdayTemplate}
                      onChange={(e) => setGreetingsBirthdayTemplate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="annivTemplate" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Anniversary SMS Template
                    </label>
                    <textarea
                      id="annivTemplate"
                      rows={2}
                      value={greetingsAnniversaryTemplate}
                      onChange={(e) => setGreetingsAnniversaryTemplate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white p-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              )}
            </SchedulerCard>

            <SchedulerCard
              enabled={leadDiscoveryEnabled}
              hour={leadDiscoveryHour}
              hourLabel="Discovery Hour"
              id="leadDiscoveryHourSelect"
              inactiveText="Bailey Water key customer radar is disabled."
              iconColor="text-blue-600"
              onHourChange={setLeadDiscoveryHour}
              onToggle={() => setLeadDiscoveryEnabled((prev) => !prev)}
              onToggleDay={toggleLeadDiscoveryDay}
              selectedDays={leadDiscoveryDays}
              title="Bailey Water Key Customer Radar (Corridors & Schedule)"
            >
              {leadDiscoveryEnabled && (
                <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-3 text-xs text-gray-700 shadow-xs">
                  {/* Target Corridors for Bailey Water */}
                  <div className="rounded-xl border border-blue-200 bg-white p-3 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <Target className="h-4 w-4 text-blue-600" />
                        <span className="font-black text-xs text-blue-950 uppercase tracking-wide">
                          Target Corridors (Vadodara)
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                        Product: Bailey Packaged Drinking Water
                      </span>
                    </div>

                    <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                      Select the commercial junctions & corridors where the system discovers potential buyers:
                    </p>

                    {/* Corridors Pill Toggles */}
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_BAILEY_CORRIDORS.map((c) => {
                        const isSelected = selectedCorridors.includes(c)
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => toggleCorridor(c)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all flex items-center gap-1 cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                            }`}
                          >
                            <MapPin size={11} className={isSelected ? 'text-white' : 'text-gray-400'} />
                            {c}
                          </button>
                        )
                      })}
                    </div>

                    {/* Target Categories */}
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-[10px] font-black uppercase tracking-wide text-gray-500 block mb-1.5">
                        Target Customer Segments (HoReCa & Snacks):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_BAILEY_CATEGORIES.map((cat) => {
                          const isSelected = selectedCategories.includes(cat)
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => toggleCategory(cat)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {cat}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="leadDiscoveryModeSelect"
                          className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-500"
                        >
                          Radar Aggressiveness
                        </label>
                        <select
                          id="leadDiscoveryModeSelect"
                          value={leadDiscoveryMode}
                          onChange={(e) => setLeadDiscoveryMode(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="auto">Auto (Balanced Scan)</option>
                          <option value="aggressive">High Volume (12+ Outlets)</option>
                          <option value="normal">Normal (5 Outlets)</option>
                        </select>
                      </div>

                      <div className="flex flex-col justify-end">
                        <div className="text-[10px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-200">
                          {leadDiscoveryStats?.lastRunDate ? (
                            <p>
                              Last run: <strong>{leadDiscoveryStats.lastRunDate}</strong> ({leadDiscoveryStats.lastRunCount || 0} leads added)
                            </p>
                          ) : (
                            <p className="italic">Scheduled automated weekly scan or run on-demand below.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Instant Action Bar */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <span className="text-[11px] font-semibold text-gray-600">
                      Need fresh customer contacts right now?
                    </span>
                    <button
                      type="button"
                      onClick={handleSearchBaileyLeadsNow}
                      disabled={isSearchingLeads}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white flex items-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isSearchingLeads ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          Searching Corridors…
                        </>
                      ) : (
                        <>
                          <Zap size={13} className="text-amber-300" />
                          Search Potential Customers Now
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </SchedulerCard>

            <div className="flex justify-end border-t pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#a88734] bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] px-4 py-2 text-xs font-bold text-gray-900 shadow-sm transition-all hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : 'Save Scheduler Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUBTAB 3: AI ASSISTANT & MODEL CONFIGURATION */}
      {subTab === 'ai' && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between bg-[#131921] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-[#ff9900] flex items-center justify-center font-bold">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black">AI Assistant & Vision Model Settings</h2>
                <p className="text-[10px] text-gray-400 font-medium">
                  Dynamic multimodal model selection, token limiter & cost control
                </p>
              </div>
            </div>
            <span className="hidden sm:flex text-[10px] bg-emerald-500/20 text-emerald-300 font-extrabold uppercase px-2.5 py-1 rounded-full border border-emerald-500/30 items-center gap-1">
              <CheckCircle2 size={12} /> Active: {aiActiveModel === 'custom' ? (aiCustomModel || 'Custom') : aiActiveModel}
            </span>
          </div>

          <form onSubmit={handleSaveAi} className="p-4 md:p-6 space-y-6">
            {/* Model Selection */}
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                  Active Vision & Chat Model
                </span>
                <p className="text-[11px] text-gray-500 mb-3">
                  Select which Google Gemini multimodal model powers vendor bill OCR and the AI chat assistant.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Option 1: gemini-2.5-flash-lite */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setAiActiveModel('gemini-2.5-flash-lite')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAiActiveModel('gemini-2.5-flash-lite') }}
                  className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    aiActiveModel === 'gemini-2.5-flash-lite'
                      ? 'border-[#ff9900] bg-orange-50/50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                      <Cpu size={16} className="text-[#ff9900]" />
                      gemini-2.5-flash-lite
                    </span>
                    <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                      Recommended / Lowest Cost
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Fastest latency (~1.1s) and lowest pricing (~$0.10/M tokens or ~₹0.001 per scanned bill). Best for routine bill scanning and operational chat.
                  </p>
                </div>

                {/* Option 2: gemini-2.5-flash */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setAiActiveModel('gemini-2.5-flash')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAiActiveModel('gemini-2.5-flash') }}
                  className={`relative flex flex-col p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    aiActiveModel === 'gemini-2.5-flash'
                      ? 'border-[#ff9900] bg-orange-50/50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                      <Bot size={16} className="text-blue-600" />
                      gemini-2.5-flash
                    </span>
                    <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                      High Reasoning Depth
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Higher multimodal reasoning capability. Ideal if you frequently receive handwritten or crumpled vendor challans with complex layouts.
                  </p>
                </div>
              </div>

              {/* Custom Model Option */}
              <div className="pt-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setAiActiveModel('custom')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAiActiveModel('custom') }}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    aiActiveModel === 'custom'
                      ? 'border-[#ff9900] bg-orange-50/30'
                      : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="activeModelOption"
                    checked={aiActiveModel === 'custom'}
                    onChange={() => setAiActiveModel('custom')}
                    className="mt-1 accent-[#ff9900]"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-bold text-gray-900 block">
                      Custom or Future Model (Dynamic Upgrade)
                    </span>
                    <span className="text-[11px] text-gray-500">
                      Specify an updated Vertex AI model name without redeploying code (e.g. <code>gemini-3.0-flash</code>).
                    </span>
                    {aiActiveModel === 'custom' && (
                      <input
                        type="text"
                        placeholder="e.g. gemini-2.5-pro or gemini-3.0-flash"
                        value={aiCustomModel}
                        onChange={(e) => setAiCustomModel(e.target.value)}
                        className="mt-2 w-full max-w-md px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-[#ff9900]"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Click to Open: Advanced Token & Quota Settings */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowAiAdvanced((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowAiAdvanced((prev) => !prev)
                }}
                className="p-3 bg-gray-50/70 hover:bg-gray-100/70 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-gray-100"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-orange-500" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-800">Advanced Token & Fallback Settings</h4>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Limit: {aiMaxTokens} tokens • Fallback: {aiFallbackModel}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform duration-200 ${
                    showAiAdvanced ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {showAiAdvanced && (
                <div className="p-3.5 bg-white space-y-3.5 animate-in fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="ai-max-tokens" className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                        Max Output Tokens Limit
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          id="ai-max-tokens"
                          type="range"
                          min="200"
                          max="1500"
                          step="50"
                          value={aiMaxTokens}
                          onChange={(e) => setAiMaxTokens(Number(e.target.value))}
                          className="flex-1 accent-[#ff9900]"
                        />
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-900 rounded-md font-mono text-xs font-black min-w-[65px] text-center border">
                          {aiMaxTokens} tok
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Prevents runaway token generation on verbose queries. Default is 600 tokens.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="ai-fallback-model" className="block text-xs font-black text-gray-700 uppercase tracking-wider mb-1">
                        Automatic Fallback Model
                      </label>
                      <input
                        id="ai-fallback-model"
                        type="text"
                        value={aiFallbackModel}
                        onChange={(e) => setAiFallbackModel(e.target.value)}
                        placeholder="gemini-2.5-flash"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-[#ff9900] focus:bg-white"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        If the active model experiences rate limits or temporary downtime, this model is called automatically.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Click to Open: Token Economics & Architecture Highlights */}
            <div className="rounded-xl border border-amber-200 bg-white overflow-hidden shadow-xs">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setShowAiArchitecture((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowAiArchitecture((prev) => !prev)
                }}
                className="p-3 bg-amber-50/50 hover:bg-amber-100/50 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-amber-100"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <div>
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      Cost & Zero-Token Optimizer Specs
                    </h4>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Zero-token router, canvas downsampler & strict SKU validation
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform duration-200 ${
                    showAiArchitecture ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {showAiArchitecture && (
                <div className="p-4 bg-gradient-to-br from-amber-50/70 to-orange-50/40 space-y-2.5 animate-in fade-in">
                  <ul className="text-[11px] text-gray-700 space-y-1.5 list-disc pl-4">
                    <li>
                      <strong>Zero-Token Local Intent Router:</strong> 80% of routine questions (stock balance, today&apos;s open deliveries, customer outstanding balances) are resolved directly in client memory at <strong>0 tokens (100% free)</strong>.
                    </li>
                    <li>
                      <strong>Client-Side Canvas Downsampler:</strong> High-res 12MP camera photos are automatically downsampled to 1280px (~150KB) in the browser before sending, capping multimodal vision tokens at ~258 tokens per scan.
                    </li>
                    <li>
                      <strong>Strict SKU Schema Validation:</strong> AI only extracts Annapurna&apos;s 5 exact warehouse SKUs (<code>Anjani 200ml</code>, <code>Bailey 250ml</code>, <code>Bailey 500ml</code>, <code>Bailey 1 Liter</code>, <code>Bailey 2 Liter</code>) into an interactive inward card.
                    </li>
                  </ul>
                </div>
              )}
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-4 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAiDrawerOpen(true)}
                className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-gray-800 font-bold text-xs hover:bg-gray-50 flex items-center gap-1.5 transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                <Sparkles size={14} className="text-[#ff9900]" />
                <span>Test AI Assistant Drawer</span>
              </button>

              <button
                type="submit"
                disabled={savingAi}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#a88734] bg-gradient-to-b from-[#f7dfa5] to-[#f0c14b] px-5 py-2.5 text-xs font-bold text-gray-900 shadow-sm transition-all hover:bg-gradient-to-b hover:from-[#f5d78e] hover:to-[#eeb933] active:shadow-inner disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                <span>{savingAi ? 'Saving Model Config...' : 'Save AI Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
