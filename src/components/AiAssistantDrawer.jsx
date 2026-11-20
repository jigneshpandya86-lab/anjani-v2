import React, { useState, useRef, useEffect, useMemo } from 'react'
import {
  Sparkles,
  X,
  Send,
  Camera,
  Bot,
  User,
  Package,
  CheckCircle2,
  Truck,
  IndianRupee,
  Plus,
  Minus,
  MessageSquare,
  RotateCcw,
  Loader2,
  ClipboardList,
  Trash2,
  Zap,
  Check,
  ArrowRightLeft,
  UserPlus,
  CreditCard,
  Mic,
  MicOff,
  Volume2,
  MapPin,
  AtSign,
  ArrowLeft,
  ChevronDown,
  Sun,
  Moon,
  Edit2,
  MessageCircle,
  ExternalLink,
  FileText,
  MessageSquarePlus,
  RefreshCw,
  Copy,
  ThumbsDown,
} from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { collection, addDoc, serverTimestamp, getDocs, query as firestoreQuery, where, orderBy, limit } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { app, db } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { WATER_SKUS } from '../constants/skus'
import { getAccountMeta } from '../constants/accounts'
import { processAiBillImage } from '../utils/aiImageHelper'
import { consolidateRetailSales } from '../utils/salesBatchUtils'
import { findBestExistingClientMatch, findMatchingClient } from '../utils/clientMatchingUtils'
import { ensureEnglishText, sanitizeClientForEnglish, isMerchantOrSelfName } from '../utils/textUtils'
import { extractGoogleMapsUrl } from '../utils/locationUtils'
import { getRecentSkuPrice, formatPaymentNarration } from '../utils/orderUtils'
import {
  getMainMenuMessage,
  startChatbotFlow,
  advanceChatbotFlow,
  executeFlowSave,
  FLOW_TYPES,
  MAIN_MENU_CHIPS,
  MAIN_MENU_GROUPS,
} from '../utils/chatbotFlowEngine'
import {
  checkIsDayTime,
  buildHumanLikeFollowUpMessage,
  buildNewTaskAssignmentMessage,
  sendTaskFollowUpSms,
  buildTaskWhatsAppUrl,
  recordTaskFollowUpHistory,
} from '../services/taskService'
import { sendBackgroundSms, normalizeIndianPhone } from '../services/leadSmsService'
import CardActionSheet from './CardActionSheet'
import {
  getOrderCardActions,
  getClientCardActions,
  getPaymentCardActions,
  getTaskCardActions,
  getHandoverCardActions,
} from '../utils/cardActionRegistry'

export const SPEECH_LANGUAGES = [
  { code: 'en-IN', label: 'English', short: 'EN', hint: 'English (India)' },
  { code: 'gu-IN', label: 'ગુજરાતી', short: 'GU', hint: 'Gujarati (ગુજરાત)' },
  { code: 'hi-IN', label: 'हिंदी', short: 'HI', hint: 'Hindi (भारत)' },
]

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenPaymentModal,
  onOpenOrderModal,
  onOpenAddClient,
  onOpenEditClient,
  onShareInvoice,
  initialMode,
  isPage = false,
}) {
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)

  const clients = useClientStore((state) => state.clients)
  const orders = useClientStore((state) => state.orders)
  const stockSummary = useClientStore((state) => state.stockSummary)
  const stockTotal = useClientStore((state) => state.stockTotal)
  const stockEntries = useClientStore((state) => state.stockEntries)
  const addStockBatch = useClientStore((state) => state.addStockBatch)
  const createBatchSales = useClientStore((state) => state.createBatchSales)
  const createBatchAccountEntries = useClientStore((state) => state.createBatchAccountEntries)
  const updateOrder = useClientStore((state) => state.updateOrder)
  const updateClient = useClientStore((state) => state.updateClient)
  const addClient = useClientStore((state) => state.addClient)
  const addPayment = useClientStore((state) => state.addPayment)
  const deletePayment = useClientStore((state) => state.deletePayment)
  const addOrder = useClientStore((state) => state.addOrder)
  const addExpense = useClientStore((state) => state.addExpense)
  const recordAccountTransfer = useClientStore((state) => state.recordAccountTransfer)
  const recordStaffAdvance = useClientStore((state) => state.recordStaffAdvance)
  const staffList = useClientStore((state) => state.staffList)
  const accountsSummary = useClientStore((state) => state.accountsSummary)
  const jobs = useClientStore((state) => state.jobs || [])
  const fetchJobs = useClientStore((state) => state.fetchJobs)
  const addStaffJob = useClientStore((state) => state.addStaffJob)
  const updateStaffJobStage = useClientStore((state) => state.updateStaffJobStage)
  const sendStaffJobFollowUp = useClientStore((state) => state.sendStaffJobFollowUp)
  const aiSettings = useClientStore((state) => state.aiSettings)
  const aiPrefillPrompt = useClientStore((state) => state.aiPrefillPrompt)
  const aiPrefillFile = useClientStore((state) => state.aiPrefillFile)
  const aiMemories = useClientStore((state) => state.aiMemories)
  const addAiFeedback = useClientStore((state) => state.addAiFeedback)
  const fetchAiFeedbacks = useClientStore((state) => state.fetchAiFeedbacks)
  const aiFeedbacks = useClientStore((state) => state.aiFeedbacks)

  const [activeChatbotFlow, setActiveChatbotFlow] = useState(null)

  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackType, setFeedbackType] = useState('catering_sales')
  const [feedbackRating, setFeedbackRating] = useState('positive')
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSnippet, setFeedbackSnippet] = useState('')
  const [feedbackImage, setFeedbackImage] = useState(null)
  const feedbackFileInputRef = useRef(null)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [isCheckingFeedback, setIsCheckingFeedback] = useState(false)
  const [reportedBadOutputs, setReportedBadOutputs] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return JSON.parse(window.sessionStorage.getItem('anjani_bad_outputs') || '{}')
      }
    } catch {
      // ignore
    }
    return {}
  })
  const [isReportingBadOutput, setIsReportingBadOutput] = useState(false)

  const [inputMessage, setInputMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isSalesMode, setIsSalesMode] = useState(false)
  const [isPaymentMode, setIsPaymentMode] = useState(false)
  const [isClientMode, setIsClientMode] = useState(false)
  const [isAccountsMode, setIsAccountsMode] = useState(false)
  const [inwardedBills, setInwardedBills] = useState({})
  const [processedSalesBatches, setProcessedSalesBatches] = useState({})
  const [createdClients, setCreatedClients] = useState({})
  const [recordedPayments, setRecordedPayments] = useState({})
  const [placedOrders, setPlacedOrders] = useState({})
  const [executedCompounds, setExecutedCompounds] = useState({})
  const [executingCompoundId, setExecutingCompoundId] = useState(null)
  const [createdTasks, setCreatedTasks] = useState({})
  const [sentFollowUps, setSentFollowUps] = useState({})
  const [sendingFollowUpId, setSendingFollowUpId] = useState(null)
  const [editingDraftTexts, setEditingDraftTexts] = useState({})
  const [editingDraftIds, setEditingDraftIds] = useState({})
  const [sentOrderReminders, setSentOrderReminders] = useState({})
  const [sendingReminderId, setSendingReminderId] = useState(null)
  const [editingReminderTexts, setEditingReminderTexts] = useState({})
  const [editingReminderIds, setEditingReminderIds] = useState({})
  const [sentClientMessages, setSentClientMessages] = useState({})
  const [activeCardSheet, setActiveCardSheet] = useState(null)
  const lastActiveCardActionsRef = useRef([])

  const [messages, setMessages] = useState([])

  const [isListening, setIsListening] = useState(false)
  const [speechLang, setSpeechLang] = useState(() => {
    try {
      const saved = localStorage.getItem('anjani_ai_speech_lang')
      if (saved && SPEECH_LANGUAGES.some((l) => l.code === saved)) {
        return saved
      }
      return 'en-IN'
    } catch {
      return 'en-IN'
    }
  })
  const [showLangMenu, setShowLangMenu] = useState(false)
  const speechLangMenuRef = useRef(null)
  const recognitionRef = useRef(null)
  const speechBaseTextRef = useRef('')

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!showLangMenu) return
    const handleClickOutside = (e) => {
      if (speechLangMenuRef.current && !speechLangMenuRef.current.contains(e.target)) {
        setShowLangMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showLangMenu])

  useEffect(() => {
    const unsub = fetchJobs?.()
    return () => unsub?.()
  }, [fetchJobs])

  const handleOpenFeedbackForMessage = (msg) => {
    let snippet = ''
    let type = 'general'
    if (msg) {
      if (msg.type === 'retail_sales') {
        type = 'catering_sales'
        const count = msg.data?.sales?.length || 0
        const names = (msg.data?.sales || [])
          .map((s) => s.clientName)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')
        snippet = `Retail/Catering: ${count} orders (${names})`
      } else if (msg.type === 'order_draft') {
        type = 'order_draft'
        snippet = `Order: ${msg.data?.clientName || 'Customer'} - ${msg.data?.qty || 0} ${msg.data?.sku || ''}`
      } else if (msg.type === 'receive_payment') {
        type = 'receive_payment'
        snippet = `Payment: ₹${msg.data?.amount || 0} from ${msg.data?.payerName || 'Client'}`
      } else {
        snippet = String(msg.text || '').slice(0, 120)
      }
    }
    setFeedbackSnippet(snippet)
    setFeedbackType(type)
    setShowFeedbackModal(true)
  }

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === 'assistant') {
        return messages[i]
      }
    }
    return null
  }, [messages])

  const handleReportBadOutput = async (targetMsg) => {
    if (!targetMsg || targetMsg.sender !== 'assistant') return
    const msgKey = targetMsg.id || String(targetMsg.timestamp || targetMsg.text || 'msg')
    if (reportedBadOutputs[msgKey]) {
      toast('Output already marked as bad output.', { icon: 'ℹ️' })
      return
    }

    setIsReportingBadOutput(true)
    try {
      // Find the user query that triggered this assistant message
      const msgIndex = messages.findIndex((m) => m.id === targetMsg.id)
      let userPromptText = ''
      let userPromptImage = null
      if (msgIndex > 0) {
        for (let i = msgIndex - 1; i >= 0; i--) {
          if (messages[i].sender === 'user') {
            userPromptText = String(messages[i].text || '')
            userPromptImage = messages[i].imagePreview || null
            break
          }
        }
      }

      // Capture recent conversation context (last 6 messages)
      const recentChat = (messages || [])
        .slice(Math.max(0, msgIndex - 5), msgIndex + 1)
        .map((m) => ({
          sender: m.sender,
          text: String(m.text || '').slice(0, 500),
          type: m.type || null,
          dataSummary: m.data ? JSON.stringify(m.data).slice(0, 300) : null,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : (m.timestamp || null),
        }))

      const now = new Date()
      const istNow = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium',
      }).format(now)
      const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
      const istTomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
        new Date(now.getTime() + 24 * 60 * 60 * 1000)
      )

      let safeData = null
      if (targetMsg.data) {
        try {
          safeData = JSON.parse(JSON.stringify(targetMsg.data, (k, v) => (typeof v === 'function' ? undefined : v)))
        } catch {
          safeData = { summary: String(targetMsg.data) }
        }
      }

      const snippet = String(targetMsg.text || targetMsg.type || 'AI Output').slice(0, 200)

      const feedbackPayload = {
        rating: 'negative',
        tag: 'bad_output',
        category: 'bad_output',
        type: targetMsg.type || 'general_response',
        message: `Thumbs Down (Bad Output): User rejected AI output for query: "${userPromptText || 'unknown'}".`,
        userQuery: userPromptText,
        hasUserImage: Boolean(userPromptImage),
        rawSnippet: snippet,
        badOutput: {
          id: targetMsg.id || null,
          type: targetMsg.type || 'chat_reply',
          text: String(targetMsg.text || '').slice(0, 1000),
          data: safeData,
          modelUsed: targetMsg.modelUsed || aiSettings?.activeModel || 'gemini-2.5-flash-lite',
          timestamp: targetMsg.timestamp instanceof Date ? targetMsg.timestamp.toISOString() : (targetMsg.timestamp || null),
        },
        recentChat,
        runtimeContext: {
          istNow,
          istToday,
          istTomorrow,
          url: typeof window !== 'undefined' ? window.location.href : '',
          activeTab: 'ai',
          totalOrders: orders?.length || 0,
          totalClients: clients?.length || 0,
        },
        status: 'pending_review',
        submittedAt: now.toISOString(),
        sessionRef: 'conversation://2fe98da8-c236-4285-8f51-3bc6624c743b',
      }

      await addAiFeedback?.(feedbackPayload)

      setReportedBadOutputs((prev) => {
        const next = { ...prev, [msgKey]: true }
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('anjani_bad_outputs', JSON.stringify(next))
          }
        } catch {
          // ignore storage error
        }
        return next
      })

      toast.success(
        (t) => (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>👎 Marked as bad output & sent to Firebase!</span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id)
                handleOpenFeedbackForMessage(targetMsg)
              }}
              className="font-black text-[#ff9900] underline hover:text-amber-600 shrink-0"
            >
              Add Note
            </button>
          </div>
        ),
        { id: `bad-out-${msgKey}`, duration: 5000, icon: '👎' }
      )
    } catch (err) {
      console.error('Failed to report bad output:', err)
      toast.error('Failed to save feedback to Firebase: ' + (err.message || 'Error'))
    } finally {
      setIsReportingBadOutput(false)
    }
  }

  const handleReportLatestBadOutput = () => {
    if (lastAssistantMessage) {
      handleReportBadOutput(lastAssistantMessage)
    } else {
      toast('No AI output to report yet.', { icon: 'ℹ️' })
    }
  }

  const handleClearFeedbackImage = () => {
    setFeedbackImage(null)
    if (feedbackFileInputRef.current) {
      feedbackFileInputRef.current.value = ''
    }
  }

  const handleFeedbackFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)
    if (!isImage) {
      toast.error('Please select an image file (PNG, JPG, WebP, etc.)')
      return
    }
    try {
      toast.loading('Processing screenshot...', { id: 'fb-img-proc' })
      const processed = await processAiBillImage(file, 800, 0.7)
      toast.dismiss('fb-img-proc')
      setFeedbackImage(processed)
      toast.success('Screenshot attached!', { icon: '📸' })
    } catch (err) {
      toast.dismiss('fb-img-proc')
      toast.error('Failed to process image: ' + err.message)
    }
  }

  const handleFeedbackPaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          try {
            toast.loading('Processing screenshot...', { id: 'fb-img-proc' })
            const processed = await processAiBillImage(file, 800, 0.7)
            toast.dismiss('fb-img-proc')
            setFeedbackImage(processed)
            toast.success('Screenshot pasted from clipboard!', { icon: '📸' })
          } catch (err) {
            toast.dismiss('fb-img-proc')
            toast.error('Failed to process pasted screenshot: ' + err.message)
          }
          break
        }
      }
    }
  }

  const handleSubmitFeedback = async (e) => {
    e?.preventDefault()
    if (!feedbackText.trim() && !feedbackImage) {
      toast.error('Please enter your feedback comments or attach a screenshot')
      return
    }
    setIsSubmittingFeedback(true)
    try {
      // Map recent chat messages so the feedback carries full conversation context to improve AI responses
      const recentChat = (messages || [])
        .slice(-6)
        .map((m) => ({
          sender: m.sender,
          text: String(m.text || '').slice(0, 500),
          type: m.type || null,
          dataSummary: m.data ? JSON.stringify(m.data).slice(0, 300) : null,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp || null,
        }))

      const effectiveMessage =
        feedbackText.trim() || (feedbackImage ? 'Screenshot attached for visual review and enhancement' : '')

      await addAiFeedback?.({
        type: feedbackType,
        rating: feedbackRating,
        message: effectiveMessage,
        attachmentUrl: feedbackImage?.dataUrl || null,
        attachmentName: feedbackImage?.fileName || null,
        screenshotDataUrl: feedbackImage?.dataUrl || null,
        screenshotBase64: feedbackImage?.base64 || null,
        rawSnippet: feedbackSnippet || (recentChat.length > 0 ? recentChat[recentChat.length - 1].text : ''),
        recentChat,
        sessionRef: 'conversation://2aca385b-885b-44b6-a062-4ffe8fbd20fb',
        url: typeof window !== 'undefined' ? window.location.href : '',
        status: 'pending_review',
        submittedAt: new Date().toISOString(),
      })

      toast.success(
        feedbackImage
          ? 'Feedback & screenshot saved to Firebase! Stored for review.'
          : 'Feedback saved to Firebase! Stored for review.',
        { icon: '📝' }
      )
      setFeedbackText('')
      setFeedbackSnippet('')
      handleClearFeedbackImage()
      setInputMessage('')
      setShowFeedbackModal(false)
    } catch (err) {
      toast.error('Failed to submit feedback: ' + err.message)
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const handleTriggerFeedbackCheck = async () => {
    setIsCheckingFeedback(true)
    try {
      toast.loading('Checking feedback queue in Firebase...', { id: 'manual-fb-check' })
      const list = (await fetchAiFeedbacks?.()) || []
      const pending = list.filter(
        (f) => f.status === 'pending_review' || f.status === 'pending_weekly_review' || f.status === 'pending'
      )

      if (pending.length === 0) {
        toast.success('Feedback queue up to date! 0 pending items.', {
          id: 'manual-fb-check',
          icon: '✅',
        })
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `✅ **Feedback Queue Status**:\n\nAll caught up! There are **0 pending feedback requests** in Firestore.\n\nAny feedback or screenshot you submit is saved safely to Firebase for developer review and implementation.`,
            type: 'feedback_status',
            chips: [{ label: 'Submit Feedback', action: 'open_feedback_modal' }],
            isLocal: true,
            timestamp: new Date(),
          },
        ])
      } else {
        toast.success(`Found ${pending.length} pending feedback item(s) in queue.`, {
          id: 'manual-fb-check',
          icon: '📋',
        })
        setShowFeedbackModal(false)

        const summaryLines = pending
          .map(
            (f, i) =>
              `${i + 1}. **"${f.message}"**${f.attachmentUrl ? ' 📸 [Screenshot Attached]' : ''}`
          )
          .join('\n')

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `📋 **Found ${pending.length} Pending Feedback Request(s) in Queue**:\n\n${summaryLines}\n\n*These feedback items are safely stored in Firebase and will be addressed by your developer in chat.*`,
            type: 'feedback_status',
            chips: [
              { label: 'Submit Feedback', action: 'open_feedback_modal' },
              { label: 'Check Again', action: 'manual_feedback_check' },
            ],
            isLocal: true,
            timestamp: new Date(),
          },
        ])
      }
    } catch (err) {
      toast.error('Failed to check feedback: ' + (err.message || 'Network error'), {
        id: 'manual-fb-check',
      })
    } finally {
      setIsCheckingFeedback(false)
    }
  }

  useEffect(() => {
    if (isOpen && initialMode) {
      setIsSalesMode(initialMode === 'retail_sales')
      setIsPaymentMode(initialMode === 'receive_payment')
      setIsClientMode(initialMode === 'create_client')
      setIsAccountsMode(initialMode === 'accounts_cash')
    }
  }, [isOpen, initialMode])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 140)}px`
    }
  }, [inputMessage])

  const stopListening = () => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setIsListening(false)
  }

  const startListening = (langCode = speechLang) => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      toast.error('Voice input is not supported in this browser. Please use Chrome/Edge.')
      return
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRec()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = langCode

      const baseText = inputMessage.trim()
      speechBaseTextRef.current = baseText

      const targetLang = SPEECH_LANGUAGES.find((l) => l.code === langCode) || { label: 'English' }

      recognition.onstart = () => {
        setIsListening(true)
        toast(`Listening in ${targetLang.label}... Speak now`, {
          icon: '🎙️',
          id: 'voice-rec',
          duration: 2500,
        })
      }

      recognition.onresult = (event) => {
        let fullTranscript = ''
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript
        }
        const spoken = fullTranscript.trim()
        if (spoken) {
          const base = speechBaseTextRef.current
          setInputMessage(base ? `${base} ${spoken}` : spoken)
        }
      }

      recognition.onerror = (e) => {
        toast.dismiss('voice-rec')
        if (e.error !== 'no-speech') {
          console.warn('Speech error:', e.error)
        }
        setIsListening(false)
      }

      recognition.onend = () => {
        toast.dismiss('voice-rec')
        setIsListening(false)
        inputRef.current?.focus()
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      toast.dismiss('voice-rec')
      toast.error('Could not start microphone: ' + err.message)
      setIsListening(false)
    }
  }

  const toggleMic = () => {
    if (isListening) {
      stopListening()
    } else {
      startListening(speechLang)
    }
  }

  const handleSelectSpeechLang = (code) => {
    setSpeechLang(code)
    try {
      localStorage.setItem('anjani_ai_speech_lang', code)
    } catch {
      // ignore
    }
    setShowLangMenu(false)
    const targetLang = SPEECH_LANGUAGES.find((l) => l.code === code) || { label: 'English' }
    toast.success(`Voice set to ${targetLang.label}`, { id: 'voice-lang-toast', duration: 1500 })

    if (isListening) {
      stopListening()
      setTimeout(() => {
        startListening(code)
      }, 150)
    }
  }

  useEffect(() => {
    if (aiPrefillPrompt) {
      setInputMessage(aiPrefillPrompt)
    }
  }, [aiPrefillPrompt])

  useEffect(() => {
    if (aiPrefillFile) {
      setSelectedFile(aiPrefillFile)
      setFilePreview(aiPrefillFile.dataUrl)
      // For shared GPay receipts, pre-select Client + Order + Payment
      setIsClientMode(true)
      setIsSalesMode(true)
      setIsPaymentMode(true)
    }
  }, [aiPrefillFile])

  useEffect(() => {
    if (messagesContainerRef.current) {
      if (typeof messagesContainerRef.current.scrollTo === 'function') {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      } else {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }
  }, [messages, loading])

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      toast.loading('Optimizing image tokens...', { id: 'compress-img' })
      const processed = await processAiBillImage(file, 1280, 0.85)
      toast.dismiss('compress-img')
      setSelectedFile(processed)
      setFilePreview(processed.dataUrl)
      const label = processed.isAudio
        ? 'Voice note'
        : isClientMode
          ? 'Bill book / Visiting card'
          : isPaymentMode
            ? 'Payment slip'
            : isSalesMode
              ? 'Sales notepad'
              : 'Document'
      toast.success(`${label} ready (~${processed.sizeKb} KB)`)
    } catch (err) {
      toast.dismiss('compress-img')
      toast.error('Could not process media: ' + err.message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Autocomplete queries for @ (Clients) and / (SKUs)
  const atMatch = inputMessage.match(/@([a-zA-Z0-9\s]*)$/)
  const slashMatch = inputMessage.match(/\/([a-zA-Z0-9\s]*)$/)

  const matchingClients = atMatch
    ? clients
        .filter((c) => {
          const q = atMatch[1].trim().toLowerCase()
          if (!q) return true
          return (
            c.name?.toLowerCase().includes(q) ||
            c.mobile?.includes(q) ||
            c.location?.toLowerCase().includes(q) ||
            c.address?.toLowerCase().includes(q)
          )
        })
        .slice(0, 5)
    : []

  // Context client for SKU price lookup
  const contextClient = useMemo(() => {
    try {
      if (!Array.isArray(clients) || clients.length === 0) return null
      if (atMatch && atMatch[1]) {
        const q = atMatch[1].trim().toLowerCase()
        if (!q) return null
        return clients.find((c) => typeof c?.name === 'string' && c.name.toLowerCase().includes(q)) || null
      }
      const clean = inputMessage.trim().toLowerCase()
      if (!clean || clean.length < 2) return null
      return clients.find((c) => typeof c?.name === 'string' && c.name.trim().length > 1 && clean.includes(c.name.toLowerCase().trim())) || null
    } catch {
      return null
    }
  }, [inputMessage, atMatch, clients])

  // SKU list enriched with label, category, and recent order price
  const enrichedWaterSkus = useMemo(() => {
    return WATER_SKUS.map((s) => {
      let price = 0
      try {
        price = getRecentSkuPrice(s.id, orders, contextClient?.id)
      } catch {
        price = 0
      }
      return {
        ...s,
        name: s.label,
        category: `${s.brand} • ${s.unit}`,
        price,
      }
    })
  }, [orders, contextClient])

  const matchingSkus = slashMatch
    ? enrichedWaterSkus
        .filter((s) => {
          const q = slashMatch[1].trim().toLowerCase()
          if (!q) return true
          return (
            s.label.toLowerCase().includes(q) ||
            s.shortLabel.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            s.brand.toLowerCase().includes(q)
          )
        })
        .slice(0, 5)
    : []

  const quickClientSuggestions =
    !atMatch &&
    !slashMatch &&
    (isSalesMode || isPaymentMode) &&
    inputMessage.trim().length >= 2 &&
    !inputMessage.includes('\n')
      ? clients
          .filter((c) =>
            c.name?.toLowerCase().includes(inputMessage.trim().toLowerCase())
          )
          .slice(0, 4)
      : []

  const handleSelectClient = (client) => {
    if (atMatch) {
      setInputMessage(inputMessage.replace(/@[a-zA-Z0-9\s]*$/, client.name + ' '))
    } else if (isSalesMode) {
      setInputMessage(client.name + ' ')
    } else if (isPaymentMode) {
      setInputMessage(`Received from ${client.name} `)
    } else {
      setInputMessage(client.name + ' ')
    }
    inputRef.current?.focus()
  }

  const handleSelectSku = (sku) => {
    const textToInsert = sku.label || sku.name
    if (slashMatch) {
      setInputMessage(inputMessage.replace(/\/([a-zA-Z0-9\s]*)$/, textToInsert + ' '))
    } else {
      setInputMessage((prev) => (prev ? `${prev.trim()} ${textToInsert} ` : `${textToInsert} `))
    }
    inputRef.current?.focus()
  }

  const handleChipClick = async (chip) => {
    // 1. If starting a flow from Main Menu
    if (chip.flow) {
      const initialStep = startChatbotFlow(chip.flow, {
        clients,
        orders,
        staffList,
        accountsSummary,
      })
      if (!initialStep) return

      setActiveChatbotFlow(initialStep)
      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: chip.label,
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: initialStep.text,
          chips: initialStep.chips,
          flowState: initialStep,
          timestamp: new Date(),
        },
      ])
      return
    }

    // 2. If quick action query (Stock / Dues / Menu / Price Rate / Qty)
    if (chip.action === 'apply_rate' || chip.rate) {
      handleSend(`update price to ${chip.rate || String(chip.label).replace(/\D/g, '')}`)
      return
    }
    if (chip.action === 'apply_qty' || chip.qty) {
      handleSend(`update qty to ${chip.qty || String(chip.label).replace(/\D/g, '')}`)
      return
    }
    if (chip.action === 'open_order_menu' && chip.order) {
      openOrderSecondaryMenu(chip.order)
      return
    }
    if (chip.action === 'remind_staff' && chip.order) {
      handleSend('remind nilesh for this order')
      return
    }
    if (chip.action === 'mark_delivered' && chip.order) {
      handleDeliverOrder(chip.order)
      return
    }
    if (chip.action === 'save_order_location' || chip.action === 'save_client_location') {
      const { mapLink, lat, lng, client, order } = chip.data || {}
      if (order?.id) {
        try {
          await updateOrder(order.id, {
            mapLink: mapLink || '',
            location: mapLink || order.location || '',
            locationLat: lat ?? null,
            locationLng: lng ?? null,
          })
          toast.success(`Location saved to Order #${order.id.slice(-6)}!`)
        } catch (err) {
          toast.error('Failed to save location to order: ' + err.message)
        }
      }
      if (client?.id) {
        try {
          await updateClient(client.id, {
            mapLink: mapLink || '',
            location: mapLink || client.location || '',
            locationLat: lat ?? null,
            locationLng: lng ?? null,
          })
          toast.success(`Location saved to ${client.displayName || client.name}!`)
        } catch (err) {
          toast.error('Failed to save location to client: ' + err.message)
        }
      }
      return
    }
    if (chip.action === 'apply_order_date') {
      const targetDate = chip.date || chip.data?.targetDate
      const targetOrder = chip.order || chip.data?.order
      const clientName = chip.data?.clientName || targetOrder?.clientName || targetOrder?.name
      if (targetOrder?.id && targetDate) {
        try {
          await updateOrder(targetOrder.id, {
            date: targetDate,
            deliveryDate: targetDate,
          })
          toast.success(`Order rescheduled to ${targetDate}`)
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `📅 **Order Rescheduled**: Moved **${clientName || 'Order'}** to **${targetDate}**.`,
              type: 'update_date_confirm',
              isLocal: true,
              timestamp: new Date(),
            },
          ])
        } catch (err) {
          toast.error('Failed to reschedule order: ' + err.message)
        }
      }
      return
    }
    if (chip.action === 'apply_order_time') {
      const targetTime = chip.time || chip.data?.time
      const targetOrder = chip.order || chip.data?.order
      const clientName = chip.data?.clientName || targetOrder?.clientName || targetOrder?.name
      if (targetOrder?.id && targetTime) {
        try {
          await updateOrder(targetOrder.id, {
            time: targetTime,
            deliveryTime: targetTime,
          })
          toast.success(`Delivery time set to ${targetTime}`)
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `⏰ **Delivery Time Updated**: Set to **${targetTime}** for **${clientName || 'Order'}**.`,
              type: 'update_time_confirm',
              isLocal: true,
              timestamp: new Date(),
            },
          ])
        } catch (err) {
          toast.error('Failed to update delivery time: ' + err.message)
        }
      }
      return
    }
    if (chip.action === 'view_orders') {
      if (onNavigateTab) {
        onNavigateTab('orders')
        onClose?.()
      } else {
        handleSend('orders')
      }
      return
    }
    if (chip.action === 'manual_feedback_check') {
      handleTriggerFeedbackCheck()
      return
    }
    if (chip.action === 'open_feedback_modal') {
      setShowFeedbackModal(true)
      return
    }
    if (chip.action === 'query_orders') {
      const allOrders = orders || []
      const openOrders = allOrders.filter((o) => {
        const st = (o.status || '').toLowerCase()
        return st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
      })
      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: chip.label || '📦 Orders & Deliveries',
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: '',
          type: 'orders_list',
          data: { orders: openOrders, dateFilter: 'all' },
          timestamp: new Date(),
        },
      ])
      return
    }
    if (chip.action === 'query_stock') {
      const summary = stockSummary || {}
      const lines = WATER_SKUS.map((sku) => {
        const qty = summary[sku]?.currentStock ?? 0
        return `• **${sku}**: **${qty}** ${qty === 1 ? 'unit' : 'units'}`
      }).join('\n')

      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: chip.label || '📊 Check Stock',
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: `📊 **Live Warehouse Stock Summary**:\n${lines}\n\n• **Total Units**: **${stockTotal ?? 0}**`,
          type: 'stock_summary',
          data: { summary, total: stockTotal },
          timestamp: new Date(),
        },
      ])
      return
    }
    if (chip.action === 'query_dues') {
      const clientList = clients || []
      const outstandingClients = clientList
        .filter((c) => Number(c.balance || c.outstanding || 0) > 0)
        .sort((a, b) => Number(b.balance || b.outstanding || 0) - Number(a.balance || a.outstanding || 0))

      const totalDues = outstandingClients.reduce((s, c) => s + Number(c.balance || c.outstanding || 0), 0)
      const top5 = outstandingClients.slice(0, 5)
      const listLines = top5.map((c) => `• **${c.displayName || c.name}**: ₹${Number(c.balance || c.outstanding || 0).toLocaleString('en-IN')}`).join('\n')
      const duesText = `💳 **Total Outstanding Dues**: **₹${totalDues.toLocaleString('en-IN')}** across ${outstandingClients.length} clients.\n${listLines ? `\nTop Balances:\n${listLines}` : ''}`

      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: chip.label || '💳 Outstanding Dues',
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: duesText,
          type: 'dues_summary',
          timestamp: new Date(),
        },
      ])
      return
    }
    if (chip.action === 'query_tasks') {
      const activeJobs = (jobs || []).filter((j) => j.stage !== 'complete' && j.status !== 'completed')
      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: chip.label || '⏰ Staff Tasks & Follow-up',
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: activeJobs.length > 0
            ? `📋 Found **${activeJobs.length} active task${activeJobs.length > 1 ? 's' : ''}**:`
            : '📋 No pending staff tasks in the system right now.',
          type: 'staff_tasks_list',
          data: { tasks: activeJobs },
          timestamp: new Date(),
        },
      ])
      return
    }
    if (chip.action === 'main_menu') {
      setActiveChatbotFlow(null)
      const menu = getMainMenuMessage()
      setMessages((prev) => [
        ...prev,
        {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: menu.text,
          chips: menu.chips,
          isMainMenu: true,
          timestamp: new Date(),
        },
      ])
      return
    }

    // 3. If cancelling active flow
    if (chip.action === 'cancel') {
      setActiveChatbotFlow(null)
      const menu = getMainMenuMessage()
      setMessages((prev) => [
        ...prev,
        {
          id: 'usr-' + Date.now(),
          sender: 'user',
          text: '❌ Cancelled',
          timestamp: new Date(),
        },
        {
          id: 'asst-' + (Date.now() + 1),
          sender: 'assistant',
          text: `❌ Action cancelled.\n\n${menu.text}`,
          chips: menu.chips,
          isMainMenu: true,
          timestamp: new Date(),
        },
      ])
      return
    }

    // 4. If confirming save
    if ((chip.action === 'save' || chip.action === 'save_and_whatsapp') && activeChatbotFlow) {
      setLoading(true)
      try {
        const flowDataWithAction = {
          ...activeChatbotFlow.data,
          ...(chip.sendSms !== undefined ? { sendSms: chip.sendSms } : {}),
        }
        const storeMethods = {
          addExpense,
          addOrder,
          addPayment,
          recordAccountTransfer,
          recordStaffAdvance,
          addStaffJob,
          sendStaffJobFollowUp,
          jobs,
        }
        const saveRes = await executeFlowSave(
          activeChatbotFlow.flow,
          flowDataWithAction,
          storeMethods
        )

        // If WhatsApp requested for staff task
        if (chip.action === 'save_and_whatsapp' && activeChatbotFlow.flow === FLOW_TYPES.STAFF_TASK) {
          const staffName = activeChatbotFlow.data.assignedStaffName || 'Staff'
          const staffPhone = activeChatbotFlow.data.staffPhone
          const taskMsg = buildNewTaskAssignmentMessage({
            staffName,
            taskText: activeChatbotFlow.data.text,
            dueDateStr: activeChatbotFlow.data.targetLabel || 'Today',
          })
          const waUrl = buildTaskWhatsAppUrl({
            staffPhone,
            message: taskMsg,
          })
          if (waUrl) {
            window.open(waUrl, '_blank')
          }
          if (saveRes.result?.id) {
            await recordTaskFollowUpHistory({
              taskId: saveRes.result.id,
              staffName,
              message: taskMsg,
              channel: 'whatsapp',
              followUpCount: 0,
            })
          }
        }

        setActiveChatbotFlow(null)
        const menu = getMainMenuMessage()
        setMessages((prev) => [
          ...prev,
          {
            id: 'usr-' + Date.now(),
            sender: 'user',
            text: chip.action === 'save_and_whatsapp' ? '💬 WhatsApp & Save' : '✅ Confirmed',
            timestamp: new Date(),
          },
          {
            id: 'asst-' + (Date.now() + 1),
            sender: 'assistant',
            text: `${saveRes.text}\n\n---\n${menu.text}`,
            chips: menu.chips,
            isMainMenu: true,
            timestamp: new Date(),
          },
        ])
        toast.success(
          chip.action === 'save_and_whatsapp'
            ? 'Task saved & WhatsApp opened!'
            : 'Saved to business records!',
          { icon: '✅' }
        )
      } catch (err) {
        console.error('Flow save error:', err)
        toast.error('Failed to save: ' + err.message)
      } finally {
        setLoading(false)
      }
      return
    }

    // 5. Advancing active flow with selected chip
    if (activeChatbotFlow) {
      const nextStep = advanceChatbotFlow(activeChatbotFlow, chip, {
        clients,
        orders,
        staffList,
        accountsSummary,
        jobs,
      })

      if (nextStep?.cancelled) {
        setActiveChatbotFlow(null)
        const menu = getMainMenuMessage()
        setMessages((prev) => [
          ...prev,
          {
            id: 'usr-' + Date.now(),
            sender: 'user',
            text: chip.label || 'Cancel',
            timestamp: new Date(),
          },
          {
            id: 'asst-' + (Date.now() + 1),
            sender: 'assistant',
            text: `${nextStep.text}\n\n${menu.text}`,
            chips: menu.chips,
            isMainMenu: true,
            timestamp: new Date(),
          },
        ])
        return
      }

      if (nextStep) {
        setActiveChatbotFlow(nextStep)
        setMessages((prev) => [
          ...prev,
          {
            id: 'usr-' + Date.now(),
            sender: 'user',
            text: chip.label || String(chip.value || ''),
            timestamp: new Date(),
          },
          {
            id: 'asst-' + (Date.now() + 1),
            sender: 'assistant',
            text: nextStep.text,
            chips: nextStep.chips,
            flowState: nextStep,
            timestamp: new Date(),
          },
        ])
      }
      return
    }

    if (chip.action === 'open_order_modal') {
      const ord = chip.order || chip.data
      if (ord && onOpenOrderModal) {
        onOpenOrderModal(ord)
        return
      }
    }

    // 6. Universal fallback: send chip value, text, or label directly to AI agent
    const promptToSend = chip.value || chip.text || chip.label
    if (promptToSend) {
      handleSend(promptToSend)
    }
  }

  const handleSend = async (customPrompt = null) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('AI Assistant requires an active internet connection. Manual entry is available offline.')
      return
    }

    const query = (customPrompt || inputMessage).trim()
    const filePayload = selectedFile
    const isSales = isSalesMode
    const isPayment = isPaymentMode
    const isClient = isClientMode
    const isAccounts = isAccountsMode
    const isOnlyPayment = isPayment && !isClient && !isSales && !isAccounts

    if (!query && !filePayload) return

    // 1. If an active guided flow is running and user typed text
    if (activeChatbotFlow && !filePayload && query) {
      const lowerQ = query.toLowerCase().trim()
      const isBreakout =
        /^(hi|hello|hey|namaste|kem cho|help|menu|main menu|cancel|stop|exit|quit|what|who|how|why|check|show|orders?|stock|dues?|tasks?|report)/i.test(lowerQ) ||
        /\?$/.test(query.trim())

      if (isBreakout) {
        // User is speaking to AI / changing context: break out of flow and route directly to Gemini!
        setActiveChatbotFlow(null)
      } else {
        const nextStep = advanceChatbotFlow(activeChatbotFlow, query, {
          clients,
          orders,
          staffList,
          accountsSummary,
        })

        if (nextStep?.cancelled || nextStep?.invalidInput) {
          setActiveChatbotFlow(null)
          if (nextStep?.cancelled && /^(cancel|stop|exit|quit)$/i.test(lowerQ)) {
            const menu = getMainMenuMessage()
            setMessages((prev) => [
              ...prev,
              { id: 'usr-' + Date.now(), sender: 'user', text: query, timestamp: new Date() },
              { id: 'asst-' + (Date.now() + 1), sender: 'assistant', text: `${nextStep.text}\n\n${menu.text}`, chips: menu.chips, isMainMenu: true, timestamp: new Date() },
            ])
            setInputMessage('')
            return
          }
          // If not an explicit cancel, fall through directly to Gemini!
        } else if (nextStep) {
          setActiveChatbotFlow(nextStep)
          setMessages((prev) => [
            ...prev,
            { id: 'usr-' + Date.now(), sender: 'user', text: query, timestamp: new Date() },
            { id: 'asst-' + (Date.now() + 1), sender: 'assistant', text: nextStep.text, chips: nextStep.chips, flowState: nextStep, timestamp: new Date() },
          ])
          setInputMessage('')
          return
        }
      }
    }

    // 2. Menu command
    if (!filePayload && query) {
      const lowerQ = query.toLowerCase().trim()
      if (/^(menu|bot|main menu)$/i.test(lowerQ)) {
        setActiveChatbotFlow(null)
        const menu = getMainMenuMessage()
        setMessages((prev) => [
          ...prev,
          { id: 'usr-' + Date.now(), sender: 'user', text: query, timestamp: new Date() },
          { id: 'asst-' + (Date.now() + 1), sender: 'assistant', text: menu.text, chips: menu.chips, isMainMenu: true, timestamp: new Date() },
        ])
        setInputMessage('')
        return
      }
    }

    // WhatsApp Banking Numeric Quick Shortcut (e.g. typing "1", "2", "3")
    const trimmedInput = (query || '').trim()
    const numChoice = parseInt(trimmedInput, 10)
    const availableActions = activeCardSheet?.actions || lastActiveCardActionsRef.current || []
    if (
      !filePayload &&
      !isNaN(numChoice) &&
      numChoice >= 1 &&
      numChoice <= availableActions.length &&
      String(numChoice) === trimmedInput
    ) {
      const selected = availableActions[numChoice - 1]
      if (selected && !selected.disabled) {
        setInputMessage('')
        setActiveCardSheet(null)
        selected.onSelect?.()
        return
      }
    }

    const activeTargets = [
      isClient && 'Client',
      isSales && 'Order',
      isPayment && 'Payment',
    ].filter(Boolean)

    const userMessageId = 'msg-' + Date.now()
    const newMessages = [
      ...messages,
      {
        id: userMessageId,
        sender: 'user',
        text:
          query ||
          (filePayload
            ? filePayload.isAudio
              ? 'Uploaded voice note 🎙️'
              : activeTargets.length > 0
                ? `Uploaded photo (${activeTargets.join(' + ')}) 📄`
                : 'Uploaded document for scanning 📄'
            : ''),
        imagePreview: filePayload?.dataUrl || null,
        timestamp: new Date(),
      },
    ]

    setMessages(newMessages)
    setInputMessage('')
    setSelectedFile(null)
    setFilePreview(null)
    setIsSalesMode(false)
    setIsPaymentMode(false)
    setIsClientMode(false)
    setIsAccountsMode(false)

    // 1. Deterministic Card Action Select (Only when an active card sheet is open and user types a single digit 1, 2, 3)
    if (!filePayload && query && activeCardSheet?.actions?.length > 0 && /^[1-9]$/.test(query.trim())) {
      const idx = parseInt(query.trim(), 10) - 1
      const act = activeCardSheet.actions[idx]
      if (act && typeof act.onSelect === "function") {
        setActiveCardSheet(null)
        act.onSelect()
        return
      }
    }

    // 2. Call Cloud AI Function (Multimodal OCR or free-form NLP)
    setLoading(true)
    try {
      const functions = getFunctions(app, 'asia-south1')
      const askAnjaniAi = httpsCallable(functions, 'askAnjaniAi')

      const activeModes = [
        isClient && 'client',
        isSales && 'order',
        isPayment && 'payment',
      ].filter(Boolean)

      let apiMode = 'auto'
      if (activeModes.length >= 2) {
        apiMode = 'compound_action'
      } else if (isClient) {
        apiMode = 'create_client'
      } else if (isPayment) {
        apiMode = 'receive_payment'
      } else if (isSales) {
        apiMode = 'retail_sales'
      } else if (isAccounts) {
        apiMode = 'accounts_cash'
      }

      let promptText = query
      if (isOnlyPayment) {
        if (promptText.toLowerCase().includes('client plus order plus payment')) {
          promptText = promptText.replace(/client\s*plus\s*order\s*plus\s*payment:?/gi, '').trim()
        }
        if (!promptText) {
          promptText = 'Extract payment details from this UPI screenshot or receipt for existing client only'
        }
      } else if (!promptText && filePayload) {
        if (filePayload.isAudio) {
          promptText = 'Transcribe and extract orders, payments, or client details from this voice note'
        } else if (activeModes.length >= 2) {
          promptText = `Extract and process: ${activeModes.join(' plus ')}. Default product SKU is Anjani 200ml and default unit rate is 130 Rs per box if not explicitly specified.`
        } else if (isSales) {
          promptText = 'Parse these daily retail customer sales orders'
        } else if (isPayment) {
          promptText = 'Extract payment details from this UPI screenshot or receipt'
        } else if (isClient) {
          promptText = 'Extract new client name, mobile, and address from this customer bill book, estimate book, or visiting card'
        } else if (isAccounts) {
          promptText = 'Parse these staff cash custody, handover, or route expense entries'
        } else {
          promptText = 'Scan this document and extract details (default SKU Anjani 200ml @ 130 Rs)'
        }
      }

      const response = await askAnjaniAi({
        memories: aiMemories.filter((m) => m && m.active !== false),
        knownClients: (clients || [])
          .flatMap((c) => {
            const list = [c?.name, c?.displayName]
            if (c?.displayName) {
              const stripped = c.displayName.replace(/\s*\([^)]*\)/g, '').trim()
              if (stripped) list.push(stripped)
              const paren = (c.displayName.match(/\(([^)]+)\)/)?.[1] || '').trim()
              if (paren) list.push(paren)
            }
            return list
          })
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 250),
        text: promptText,
        imageBase64: filePayload?.base64 || null,
        mimeType: filePayload?.mimeType || 'image/jpeg',
        mode: apiMode,
        conversationHistory: messages.slice(-5).map((m) => {
          let content = m.text || ''
          if (!content && m.type === 'orders_list' && Array.isArray(m.data?.orders)) {
            content = `[Orders displayed: ${m.data.orders.map((o) => `${o.clientName || o.name || 'Order'} (${o.qty || 1} boxes ${o.sku || '200ml'}, date: ${o.date || o.deliveryDate || 'today'}, location: ${o.location || o.address || 'none'})`).join('; ')}]`
          } else if (!content && m.type === 'order_draft' && m.data) {
            content = `[Order draft displayed: ${m.data.clientName || 'Customer'} - ${m.data.qty || 1} boxes ${m.data.sku || '200ml'}, date: ${m.data.deliveryDate || m.data.date}]`
          } else if (!content && m.type === 'retail_sales' && Array.isArray(m.data?.sales)) {
            content = `[Sales batch displayed: ${m.data.sales.map((s) => `${s.clientName}: ${s.totalQty || 1} boxes`).join(', ')}]`
          }
          return {
            sender: m.sender,
            text: content || (m.sender === 'user' ? 'User message' : 'Assistant response'),
          }
        }),
      })

      const resData = response.data || {}

      if (isOnlyPayment && resData.type !== 'accounts_cash') {
        let payData = {}
        if (resData.type === 'compound_action') {
          const compData = resData.data || {}
          const payRaw = compData.payment || {}
          const clientRaw = compData.client || {}
          payData = {
            ...payRaw,
            payerName: isMerchantOrSelfName(payRaw.payerName)
              ? ''
              : (payRaw.payerName || (!isMerchantOrSelfName(clientRaw.name) ? clientRaw.name : '') || ''),
            mobile: clientRaw.mobile || payRaw.mobile || '',
            amount: Number(payRaw.amount) || Number(compData.order?.totalAmount) || 0,
            paymentMode: payRaw.paymentMode || 'online',
            onlineProvider: payRaw.onlineProvider || 'UPI',
            utr: payRaw.utr || '',
            date: payRaw.date || new Date().toISOString().slice(0, 10),
            notes: payRaw.notes || '',
          }
        } else if (resData.type === 'receive_payment') {
          payData = resData.data || {}
        } else {
          const raw = resData.data || {}
          payData = {
            payerName: raw.payerName || raw.clientName || '',
            mobile: raw.mobile || '',
            amount: Number(raw.amount) || 0,
            paymentMode: raw.paymentMode || 'online',
            onlineProvider: raw.onlineProvider || 'UPI',
            utr: raw.utr || '',
            date: raw.date || new Date().toISOString().slice(0, 10),
            notes: raw.notes || '',
          }
        }

        if (isMerchantOrSelfName(payData.payerName)) {
          payData.payerName = ''
        }

        const rawPayerName = (payData.payerName || '').trim()
        const targetMobile = (payData.mobile || '').replace(/\D/g, '')

        const matched = findBestExistingClientMatch(rawPayerName, clients, { mobile: targetMobile })
        const clientId = matched?.id || ''
        const clientName = matched?.name || rawPayerName || (targetMobile ? `Customer (${targetMobile.slice(-4)})` : 'Select Client')
        const amount = Number(payData.amount) || 0

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `💰 **Payment Receipt Detected: ₹${amount.toLocaleString('en-IN')}**\nReview transaction and tap **Confirm & Record Payment**:`,
            type: 'receive_payment',
            paymentId: 'pay-' + Date.now(),
            data: {
              payerName: rawPayerName,
              clientId,
              clientName,
              amount,
              method: payData.paymentMode === 'cash' ? 'cash' : 'online',
              accountId: payData.paymentMode === 'cash' ? 'counter' : 'bank',
              onlineProvider: payData.onlineProvider || 'UPI',
              utr: payData.utr || '',
              date: payData.date || new Date().toISOString().slice(0, 10),
              notes: payData.notes || '',
              modelUsed: resData.modelUsed,
            },
            timestamp: new Date(),
          },
        ])
        return
      }

      if (resData.type === 'compound_action') {
        const compData = resData.data || {}
        const clientRaw = compData.client || {}
        const orderRaw = compData.order || {}
        const payRaw = compData.payment || {}

        // Strictly filter out any merchant/self names (Annapurna Foods, Jignesh Pandya, Anjani Water)
        const rawClientName = isMerchantOrSelfName(clientRaw.name) ? '' : (clientRaw.name || '').trim()
        const rawPayerName = isMerchantOrSelfName(payRaw.payerName) ? '' : (payRaw.payerName || '').trim()
        const rawContact = isMerchantOrSelfName(clientRaw.contactPerson) ? '' : (clientRaw.contactPerson || '').trim()

        const targetMobile = (clientRaw.mobile || '').replace(/\D/g, '')
        const targetName = rawClientName || rawPayerName || rawContact || ''

        let matched = null
        if (targetMobile && targetMobile.length >= 10) {
          const tenDigit = targetMobile.slice(-10)
          matched = (clients || []).find((c) => {
            const m = (c.mobile || c.phone || '').replace(/\D/g, '')
            return m.endsWith(tenDigit)
          })
        }
        if (!matched && targetName) {
          const mRes = findMatchingClient(targetName, clients, { mobile: targetMobile })
          matched = mRes?.client
          if (!matched) {
            matched = (clients || []).find((c) => {
              const cn = (c.name || '').toLowerCase().trim()
              const tn = targetName.toLowerCase()
              return cn === tn || cn.includes(tn) || tn.includes(cn)
            })
          }
        }

        const clientId = matched ? matched.id : ''
        const clientName = matched
          ? matched.name
          : (targetName || (targetMobile ? `Customer (${targetMobile.slice(-4)})` : 'New Customer'))
        const isNewClient = !matched

        const paymentAmount = Number(payRaw.amount) || Number(orderRaw.totalAmount) || 0
        const orderRate = Number(orderRaw.rate) || (matched?.rate ? Number(matched.rate) : 130) || 130
        const orderSku = orderRaw.sku && orderRaw.sku.trim() ? orderRaw.sku : 'Anjani 200ml'
        let orderQty = Number(orderRaw.qty) || (paymentAmount > 0 && orderRate > 0 ? Math.round(paymentAmount / orderRate) : 10) || 10
        let originalPieces = orderRaw.originalPieces || null
        if (!originalPieces && (orderRaw.unit === 'Piece' || orderRaw.unit === 'Bottle') && (orderSku.includes('200') || orderSku.includes('Anjani'))) {
          originalPieces = orderQty
          orderQty = orderQty % 48 === 0 ? orderQty / 48 : Number((orderQty / 48).toFixed(2))
        }
        const orderAmount = Number(orderRaw.totalAmount) || (orderQty * orderRate) || paymentAmount

        const compoundId = 'compound-' + Date.now()

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: '', // Neat and clean: no marketing copy or redundant headers!
            type: 'compound_action',
            compoundId,
            data: {
              clientId,
              clientName,
              clientMobile: targetMobile || clientRaw.mobile || '',
              clientAddress: clientRaw.address || clientRaw.location || matched?.address || '',
              isNewClient,
              order: (orderRaw && (orderRaw.sku || orderRaw.qty || orderRaw.rate || orderAmount > 0)) ? {
                sku: orderSku,
                qty: orderQty,
                rate: orderRate,
                totalAmount: orderAmount,
              } : null,
              payment: (payRaw && (payRaw.amount || paymentAmount > 0 || payRaw.utr)) ? {
                payerName: (!isMerchantOrSelfName(payRaw.payerName) ? payRaw.payerName : '') || clientName,
                amount: paymentAmount || orderAmount,
                paymentMode: payRaw.paymentMode || 'online',
                onlineProvider: payRaw.onlineProvider || 'GPay',
                utr: payRaw.utr || '',
                date: payRaw.date || new Date().toISOString().slice(0, 10),
              } : null,
              modelUsed: resData.modelUsed,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'create_client') {
        const clientData = sanitizeClientForEnglish(resData.data || {})
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `👤 **New Client Detected: ${clientData.name || 'New Client'}**\nReview details below and tap **Create Client Now** to save to client master:`,
            type: 'create_client',
            clientId: 'client-' + Date.now(),
            data: {
              name: clientData.name || '',
              mobile: clientData.mobile || '',
              address: clientData.address || '',
              location: clientData.location || clientData.address || '',
              rate: Number(clientData.rate) || 0,
              notes: clientData.notes || '',
              modelUsed: resData.modelUsed,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'receive_payment') {
        const payData = resData.data || {}
        if (isMerchantOrSelfName(payData.payerName)) {
          payData.payerName = ''
        }

        const targetMobile = (payData.mobile || '').replace(/\D/g, '')
        const rawPayerName = (payData.payerName || '').trim()
        const matched = findBestExistingClientMatch(rawPayerName, clients, { mobile: targetMobile })
        const clientId = matched?.id || ''
        const clientName = matched?.name || rawPayerName || (targetMobile ? `Customer (${targetMobile.slice(-4)})` : 'Select Client')
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `💰 **Payment Receipt Detected: ₹${Number(payData.amount || 0).toLocaleString('en-IN')}**\nReview transaction and tap **Confirm & Record Payment**:`,
            type: 'receive_payment',
            paymentId: 'pay-' + Date.now(),
            data: {
              payerName: rawPayerName,
              clientId,
              clientName,
              amount: Number(payData.amount) || 0,
              method: payData.paymentMode === 'cash' ? 'cash' : 'online',
              accountId: payData.paymentMode === 'cash' ? 'counter' : 'bank',
              onlineProvider: payData.onlineProvider || 'UPI',
              utr: payData.utr || '',
              date: payData.date || new Date().toISOString().slice(0, 10),
              notes: payData.notes || '',
              modelUsed: resData.modelUsed,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'vendor_bill') {
        const billData = resData.data || {}
        // Ensure every SKU item is valid and editable
        const initialItems = (billData.items || []).map((it) => ({
          sku: it.sku || 'Anjani 200ml',
          qty: Number(it.qty) || 0,
          unit: it.unit || 'Box',
        }))

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `📄 **Vendor Bill Detected from ${billData.vendorName || 'Supplier'}**:\nI have extracted the line items below. Review the quantities and tap **Confirm & Inward** to update stock:`,
            type: 'vendor_bill',
            billId: 'bill-' + Date.now(),
            data: {
              vendorName: billData.vendorName || 'Factory Supplier',
              billNumber: billData.billNumber || 'N/A',
              billDate: billData.billDate || new Date().toISOString().split('T')[0],
              items: initialItems,
              notes: billData.notes || '',
              totalAmount: billData.totalAmount || 0,
              modelUsed: resData.modelUsed,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'retail_sales') {
        const salesData = resData.data || {}
        const rawSales = Array.isArray(salesData.sales) ? salesData.sales : []

        const enrichedSales = consolidateRetailSales(rawSales, clients, orders, aiMemories)
        const totalQty = enrichedSales.reduce(
          (sum, s) => sum + (s.items || []).reduce((isum, it) => isum + Number(it.qty || 0), 0),
          0
        )
        const totalAmt = enrichedSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)

        const batchId = 'batch-' + Date.now()
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `⚡ **${enrichedSales.length} Order${enrichedSales.length > 1 ? 's' : ''} Ready** (${totalQty} qty · ₹${totalAmt.toLocaleString('en-IN')})`,
            type: 'retail_sales',
            batchId,
            data: {
              batchId,
              sales: enrichedSales,
              modelUsed: resData.modelUsed,
              rawSummary: salesData.summary,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'accounts_cash') {
        const accountsData = resData.data || {}
        const rawEntries = Array.isArray(accountsData.entries) ? accountsData.entries : []
        const totalAmt = rawEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0)

        const batchId = 'acct-' + Date.now()
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `💼 **${rawEntries.length} Account Entr${rawEntries.length > 1 ? 'ies' : 'y'} Ready** (₹${totalAmt.toLocaleString('en-IN')})`,
            type: 'accounts_cash',
            batchId,
            data: {
              batchId,
              entries: rawEntries,
              modelUsed: resData.modelUsed,
              rawSummary: accountsData.summary,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'orders_query' || resData.type === 'orders_list') {
        const { dateFilter, targetDate, clientName, status } = resData.data || {}
        const allOrders = orders || []

        // Resolve effective target date if dateFilter is today/tomorrow
        let effectiveTargetDate = targetDate
        if (!effectiveTargetDate) {
          const now = new Date()
          if (dateFilter === 'tomorrow') {
            const tm = new Date(now.getTime() + 24 * 60 * 60 * 1000)
            effectiveTargetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tm)
          } else if (dateFilter === 'today') {
            effectiveTargetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
          }
        }

        const filtered = allOrders.filter((o) => {
          const st = (o.status || '').toLowerCase()
          const isCancelled = st === 'cancelled' || o.isCancelled === true
          const isDelivered = st === 'delivered'
          if (status === 'open' && (isCancelled || isDelivered)) return false
          if (clientName) {
            const cn = (o.clientName || o.name || '').toLowerCase()
            if (!cn.includes(clientName.toLowerCase())) return false
          }
          if (effectiveTargetDate) {
            const od = String(o.deliveryDate || o.date || o.orderDate || '')
            return od.startsWith(effectiveTargetDate)
          }
          if (dateFilter === 'tomorrow' || dateFilter === 'today') {
            return false // Strict date match required: never leak all open orders!
          }
          return !isCancelled && !isDelivered
        })

        if (filtered.length > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: resData.text || '',
              type: 'orders_list',
              data: { orders: filtered, dateFilter, targetDate: effectiveTargetDate },
              timestamp: new Date(),
            },
          ])
        } else {
          const label = dateFilter === 'tomorrow' ? "Tomorrow's" : dateFilter === 'today' ? "Today's" : ''
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `📦 **${label} Orders**: No delivery orders scheduled for ${label ? label.toLowerCase() : 'this date'}.`,
              type: 'orders_list',
              data: { orders: [], dateFilter, targetDate: effectiveTargetDate },
              chips: [
                { label: "📦 Today's Orders", value: 'today orders' },
                { label: "📦 Tomorrow's Orders", value: 'tomorrow orders' },
                { label: '📦 All Open Orders', value: 'all open orders' },
              ],
              timestamp: new Date(),
            },
          ])
        }
      } else if (resData.type === 'location_update') {
        const { clientName, targetDate, mapLink, locationText } = resData.data || {}
        const effectiveMapLink = mapLink || extractGoogleMapsUrl(locationText || '') || ''
        
        let targetClient = clientName ? findMatchingClient(clientName, clients)?.client : null
        let targetOrder = null

        const activeOrders = (orders || []).filter((o) => {
          const st = (o.status || '').toLowerCase()
          return st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
        })

        if (targetClient || clientName) {
          const normName = (targetClient?.displayName || targetClient?.name || clientName || '').toLowerCase()
          const clientOrders = activeOrders.filter((o) => {
            const idMatch = targetClient?.id && o.clientId === targetClient.id
            const nameMatch = (o.clientName || o.name || '').toLowerCase().includes(normName)
            return idMatch || nameMatch
          })

          if (clientOrders.length > 0) {
            if (targetDate) {
              targetOrder = clientOrders.find((o) => {
                const od = o.deliveryDate || o.date || o.orderDate || ''
                return od.startsWith(targetDate)
              })
            }
            if (!targetOrder) {
              clientOrders.sort((a, b) => (a.deliveryDate || a.date || '').localeCompare(b.deliveryDate || b.date || ''))
              targetOrder = clientOrders[0]
            }
          }
        }

        let savedTarget = ''
        if (targetOrder?.id && effectiveMapLink) {
          try {
            await updateOrder(targetOrder.id, {
              mapLink: effectiveMapLink,
              location: effectiveMapLink,
            })
            savedTarget = `Order #${targetOrder.id.slice(-6)}`
          } catch (e) {
            console.error('Failed to update order location:', e)
          }
        }

        if (targetClient?.id && effectiveMapLink) {
          try {
            await updateClient(targetClient.id, {
              mapLink: effectiveMapLink,
              location: effectiveMapLink,
            })
            if (!savedTarget) savedTarget = targetClient.displayName || targetClient.name
          } catch (e) {
            console.error('Failed to update client location:', e)
          }
        }

        toast.success(savedTarget ? `Location saved to ${savedTarget}!` : 'Location saved!')
        const displayName = targetClient?.displayName || targetClient?.name || clientName || 'Order'

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `📍 **Location Saved for ${displayName}**${targetOrder ? ` (Order #${targetOrder.id?.slice(-6)})` : ''}:\n• [Open Map Location](${effectiveMapLink})`,
            type: 'location_update',
            data: { mapLink: effectiveMapLink, client: targetClient, order: targetOrder },
            chips: [
              { label: `Saved to ${displayName} ✓`, action: 'view_orders' },
              { label: 'View Orders', action: 'view_orders' },
            ],
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'update_price') {
        const { clientName, rate, sku } = resData.data || {}
        let targetClient = null
        if (clientName) {
          targetClient = findBestExistingClientMatch(clientName, clients)
        }
        if (!targetClient && Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.data?.clientName || m.data?.client?.name) {
              const prevName = m.data?.clientName || m.data?.client?.name
              targetClient = findBestExistingClientMatch(prevName, clients)
              if (targetClient) break
            }
          }
        }

        const newRate = Number(rate) || 0
        if (targetClient && newRate > 0) {
          try {
            await updateClient(targetClient.id, { rate: newRate })
            const clientTitle = targetClient.displayName || targetClient.name
            toast.success(`Rate for ${clientTitle} updated to ₹${newRate}!`)
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `💰 **Rate Updated for ${clientTitle}**\n• Agreed Rate: **₹${newRate}** per box (${sku || 'Anjani 200ml'})\n• Client master profile has been updated.`,
                type: 'update_price',
                data: { clientId: targetClient.id, clientName: clientTitle, rate: newRate },
                chips: [
                  { label: `Rate ₹${newRate} Saved ✓`, action: 'view_client' },
                  { label: 'View Orders', action: 'view_orders' },
                ],
                timestamp: new Date(),
              },
            ])
          } catch (err) {
            console.error('Failed to update client price:', err)
            toast.error('Failed to update client price')
          }
        } else if (newRate > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `💰 **Price Update: ₹${newRate}**\nPlease specify which customer's rate to update (e.g. *"Update Maruti Caterers rate to ₹${newRate}"*).`,
              type: 'update_price',
              data: { rate: newRate },
              timestamp: new Date(),
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `💰 **Update Price**: Please specify the new rate and customer (e.g., *"Update price to 140 for Maruti Caterers"*).`,
              type: 'update_price',
              data: {},
              timestamp: new Date(),
            },
          ])
        }
      } else if (resData.type === 'edit_client') {
        const { clientName, fieldToUpdate, newValue, active } = resData.data || {}
        let targetClient = null
        if (clientName) {
          targetClient = findBestExistingClientMatch(clientName, clients)
        }
        if (!targetClient && Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.data?.clientName || m.data?.client?.name) {
              const prevName = m.data?.clientName || m.data?.client?.name
              targetClient = findBestExistingClientMatch(prevName, clients)
              if (targetClient) break
            }
          }
        }

        if (targetClient) {
          const clientTitle = targetClient.displayName || targetClient.name
          try {
            if (fieldToUpdate === 'inactive' || active === false) {
              await updateClient(targetClient.id, { active: false })
              toast.success(`${clientTitle} marked as Inactive!`)
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `👤 Client **${clientTitle}** has been marked as **Inactive** ✓`,
                  type: 'edit_client',
                  data: { clientId: targetClient.id, active: false },
                  chips: [{ label: 'View Clients', action: 'view_client' }],
                  timestamp: new Date(),
                },
              ])
            } else if (fieldToUpdate === 'active' || active === true) {
              await updateClient(targetClient.id, { active: true })
              toast.success(`${clientTitle} marked as Active!`)
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `👤 Client **${clientTitle}** has been marked as **Active** ✓`,
                  type: 'edit_client',
                  data: { clientId: targetClient.id, active: true },
                  chips: [{ label: 'View Clients', action: 'view_client' }],
                  timestamp: new Date(),
                },
              ])
            } else if (fieldToUpdate === 'mobile') {
              const cleanMobile = String(newValue || '').replace(/\D/g, '')
              await updateClient(targetClient.id, { mobile: cleanMobile })
              toast.success(`Mobile for ${clientTitle} updated to ${cleanMobile}!`)
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `📱 Updated mobile for **${clientTitle}** to **${cleanMobile}** ✓`,
                  type: 'edit_client',
                  data: { clientId: targetClient.id, mobile: cleanMobile },
                  chips: [{ label: 'View Clients', action: 'view_client' }],
                  timestamp: new Date(),
                },
              ])
            } else if (fieldToUpdate === 'address' || fieldToUpdate === 'location') {
              await updateClient(targetClient.id, { [fieldToUpdate]: newValue })
              toast.success(`Address for ${clientTitle} updated!`)
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `📍 Updated address for **${clientTitle}** to **${newValue}** ✓`,
                  type: 'edit_client',
                  data: { clientId: targetClient.id, [fieldToUpdate]: newValue },
                  chips: [{ label: 'View Clients', action: 'view_client' }],
                  timestamp: new Date(),
                },
              ])
            } else if (fieldToUpdate === 'contactPerson') {
              await updateClient(targetClient.id, { contactPerson: newValue })
              toast.success(`Contact person for ${clientTitle} updated!`)
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `👤 Updated contact person for **${clientTitle}** to **${newValue}** ✓`,
                  type: 'edit_client',
                  data: { clientId: targetClient.id, contactPerson: newValue },
                  chips: [{ label: 'View Clients', action: 'view_client' }],
                  timestamp: new Date(),
                },
              ])
            } else if (fieldToUpdate === 'rate') {
              const numRate = Number(newValue) || 0
              if (numRate > 0) {
                await updateClient(targetClient.id, { rate: numRate })
                toast.success(`Rate for ${clientTitle} updated to ₹${numRate}!`)
                setMessages((prev) => [
                  ...prev,
                  {
                    id: 'asst-' + Date.now(),
                    sender: 'assistant',
                    text: `💰 Updated rate for **${clientTitle}** to **₹${numRate}/box** ✓`,
                    type: 'edit_client',
                    data: { clientId: targetClient.id, rate: numRate },
                    chips: [{ label: 'View Clients', action: 'view_client' }],
                    timestamp: new Date(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `Client **${clientTitle}** found. What detail would you like to edit? (e.g. phone, address, rate, or mark inactive)`,
                  type: 'edit_client',
                  chips: [
                    { label: 'Mark Inactive', value: `mark ${clientTitle} inactive` },
                    { label: 'Update Phone', value: `update phone of ${clientTitle}` },
                  ],
                  timestamp: new Date(),
                },
              ])
            }
          } catch (err) {
            console.error('Failed to update client profile:', err)
            toast.error('Failed to update client')
          }
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `Could not find client **${clientName || 'specified'}**. Please check the client name or tap below:`,
              type: 'edit_client',
              chips: [{ label: '👥 View Clients', action: 'view_client' }],
              timestamp: new Date(),
            },
          ])
        }
      } else if (resData.type === 'cancel_payment') {
        const { clientName, amount, paymentId } = resData.data || {}
        let targetClient = clientName ? findBestExistingClientMatch(clientName, clients) : null
        const targetAmount = Number(amount) || 0

        try {
          let foundPayment = null
          if (paymentId) {
            foundPayment = { id: paymentId, amount: targetAmount }
          } else if (targetClient) {
            const q = firestoreQuery(
              collection(db, 'payments'),
              where('clientId', '==', targetClient.id),
              orderBy('createdAt', 'desc'),
              limit(10)
            )
            const snap = await getDocs(q)
            if (!snap.empty) {
              if (targetAmount > 0) {
                const matchDoc = snap.docs.find((d) => Number(d.data().amount) === targetAmount)
                if (matchDoc) foundPayment = { id: matchDoc.id, ...matchDoc.data() }
              }
              if (!foundPayment) {
                foundPayment = { id: snap.docs[0].id, ...snap.docs[0].data() }
              }
            }
          }

          if (foundPayment) {
            await deletePayment(foundPayment.id)
            const clientTitle = targetClient?.displayName || targetClient?.name || clientName || 'Customer'
            const cancelledAmt = foundPayment.amount || targetAmount
            toast.success(`Payment of ₹${cancelledAmt} cancelled!`)
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `🗑️ **Payment Cancelled**:\n• Customer: **${clientTitle}**\n• Amount: **₹${Number(cancelledAmt).toLocaleString('en-IN')}**\n• Ledger & outstanding balance have been reversed ✓`,
                type: 'cancel_payment',
                data: { paymentId: foundPayment.id, clientName: clientTitle, amount: cancelledAmt },
                chips: [{ label: 'View Ledger', action: 'view_ledger' }],
                timestamp: new Date(),
              },
            ])
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `No matching payment record found for **${clientName || 'customer'}**${targetAmount > 0 ? ` of ₹${targetAmount}` : ''} to cancel.`,
                type: 'cancel_payment',
                chips: [{ label: 'View Payments', action: 'view_ledger' }],
                timestamp: new Date(),
              },
            ])
          }
        } catch (err) {
          console.error('Failed to cancel payment:', err)
          toast.error('Failed to cancel payment')
        }
      } else if (resData.type === 'edit_payment') {
        const { clientName, oldAmount, newAmount, paymentMode, paymentId } = resData.data || {}
        let targetClient = clientName ? findBestExistingClientMatch(clientName, clients) : null
        const targetOld = Number(oldAmount) || 0
        const targetNew = Number(newAmount) || 0

        try {
          let foundPayment = null
          if (paymentId) {
            foundPayment = { id: paymentId, amount: targetOld }
          } else if (targetClient) {
            const q = firestoreQuery(
              collection(db, 'payments'),
              where('clientId', '==', targetClient.id),
              orderBy('createdAt', 'desc'),
              limit(10)
            )
            const snap = await getDocs(q)
            if (!snap.empty) {
              if (targetOld > 0) {
                const matchDoc = snap.docs.find((d) => Number(d.data().amount) === targetOld)
                if (matchDoc) foundPayment = { id: matchDoc.id, ...matchDoc.data() }
              }
              if (!foundPayment) {
                foundPayment = { id: snap.docs[0].id, ...snap.docs[0].data() }
              }
            }
          }

          if (foundPayment && targetNew > 0) {
            await deletePayment(foundPayment.id)
            const clientTitle = targetClient?.displayName || targetClient?.name || clientName || 'Customer'
            await addPayment({
              clientId: targetClient?.id || foundPayment.clientId,
              clientName: clientTitle,
              amount: targetNew,
              method: paymentMode || foundPayment.method || 'online',
              accountId: (paymentMode === 'cash' || foundPayment.method === 'cash') ? 'counter' : 'bank',
              date: new Date().toISOString().slice(0, 10),
              notes: `Edited from ₹${foundPayment.amount || targetOld} to ₹${targetNew}`,
            })

            toast.success(`Payment updated to ₹${targetNew}!`)
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `✏️ **Payment Updated**:\n• Customer: **${clientTitle}**\n• Previous Amount: **₹${Number(foundPayment.amount || targetOld).toLocaleString('en-IN')}**\n• New Amount: **₹${Number(targetNew).toLocaleString('en-IN')}**\n• Ledger & customer balance updated ✓`,
                type: 'edit_payment',
                data: { clientId: targetClient?.id, newAmount: targetNew },
                chips: [{ label: 'View Ledger', action: 'view_ledger' }],
                timestamp: new Date(),
              },
            ])
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `Please specify the corrected payment amount and customer (e.g. *"Change Maruti payment from 1500 to 2000"*).`,
                type: 'edit_payment',
                timestamp: new Date(),
              },
            ])
          }
        } catch (err) {
          console.error('Failed to edit payment:', err)
          toast.error('Failed to edit payment')
        }
      } else if (resData.type === 'update_date') {
        const { clientName, targetDate, targetDateLabel } = resData.data || {}
        let targetOrder = null

        const activeOrders = (orders || []).filter((o) => {
          const st = (o.status || '').toLowerCase()
          return st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
        })

        if (clientName) {
          const normName = clientName.toLowerCase()
          targetOrder = activeOrders.find((o) => (o.clientName || o.name || '').toLowerCase().includes(normName))
        }

        if (!targetOrder && Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.type === 'orders_list' && Array.isArray(m.data?.orders) && m.data.orders.length > 0) {
              targetOrder = m.data.orders[0]
              break
            }
            if (m.data?.order) {
              targetOrder = m.data.order
              break
            }
          }
        }

        if (!targetOrder && resData.data?.order) {
          targetOrder = resData.data.order
        }

        if (targetOrder?.id && targetDate) {
          try {
            await updateOrder(targetOrder.id, {
              date: targetDate,
              deliveryDate: targetDate,
            })
            toast.success(`Rescheduled to ${targetDateLabel || targetDate}!`)
          } catch (e) {
            console.error('Failed to update order date:', e)
          }
        }

        const name = targetOrder?.clientName || targetOrder?.name || clientName || 'Customer'
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `📅 Rescheduled delivery for **${name}** to **${targetDateLabel || targetDate}** ✓`,
            type: 'update_date',
            data: { order: targetOrder, targetDate, targetDateLabel },
            chips: [
              { label: `Rescheduled to ${targetDateLabel || targetDate} ✓`, action: 'view_orders' },
              { label: 'View Orders', action: 'view_orders' },
            ],
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'update_time') {
        const { clientName, time } = resData.data || {}
        let targetOrder = null

        const activeOrders = (orders || []).filter((o) => {
          const st = (o.status || '').toLowerCase()
          return st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
        })

        if (clientName) {
          const normName = clientName.toLowerCase()
          targetOrder = activeOrders.find((o) => (o.clientName || o.name || '').toLowerCase().includes(normName))
        }

        if (!targetOrder && Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.type === 'orders_list' && Array.isArray(m.data?.orders) && m.data.orders.length > 0) {
              targetOrder = m.data.orders[0]
              break
            }
            if (m.data?.order) {
              targetOrder = m.data.order
              break
            }
          }
        }

        if (!targetOrder && resData.data?.order) {
          targetOrder = resData.data.order
        }

        if (targetOrder?.id && time) {
          try {
            await updateOrder(targetOrder.id, {
              time,
              deliveryTime: time,
            })
            toast.success(`Delivery time updated to ${time}!`)
          } catch (e) {
            console.error('Failed to update order time:', e)
          }
        }

        const name = targetOrder?.clientName || targetOrder?.name || clientName || 'Customer'
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `⏰ Updated delivery time for **${name}** to **${time}** ✓`,
            type: 'update_time',
            data: { order: targetOrder, time },
            chips: [
              { label: `Time ${time} ✓`, action: 'view_orders' },
              { label: 'View Orders', action: 'view_orders' },
            ],
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'edit_order' || resData.type === 'order_edit') {
        const { clientName, changes, fieldToUpdate, newValue } = resData.data || {}
        let targetOrder = null

        const activeOrders = (orders || []).filter((o) => {
          const st = (o.status || '').toLowerCase()
          return st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
        })

        if (clientName) {
          const normName = clientName.toLowerCase().trim()
          targetOrder = activeOrders.find((o) => (o.clientName || o.name || '').toLowerCase().includes(normName))
        }

        if (!targetOrder && Array.isArray(messages)) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.type === 'orders_list' && Array.isArray(m.data?.orders) && m.data.orders.length > 0) {
              targetOrder = m.data.orders[0]
              break
            }
            if (m.data?.order) {
              targetOrder = m.data.order
              break
            }
          }
        }

        if (!targetOrder && resData.data?.order) {
          targetOrder = resData.data.order
        }

        if (targetOrder) {
          const name = targetOrder.clientName || targetOrder.name || clientName || 'Customer'
          const currentQty = targetOrder.qty || targetOrder.totalQty || 0
          const currentDate = targetOrder.deliveryDate || targetOrder.date || 'Today'
          const currentTime = targetOrder.deliveryTime || targetOrder.time || '11 AM'
          const currentLoc = targetOrder.address || targetOrder.location || 'Vadodara'

          // If specific inline changes were requested
          if (fieldToUpdate === 'date' && newValue) {
            try {
              await updateOrder(targetOrder.id, { date: newValue, deliveryDate: newValue })
              toast.success(`Rescheduled to ${newValue}!`)
            } catch (e) {
              console.error('Failed to update date:', e)
            }
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `📅 Rescheduled order for **${name}** to **${newValue}** ✓`,
                type: 'order_edit',
                chips: [{ label: 'View Orders', action: 'view_orders' }],
                timestamp: new Date(),
              },
            ])
            return
          }

          if (fieldToUpdate === 'time' && newValue) {
            try {
              await updateOrder(targetOrder.id, { time: newValue, deliveryTime: newValue })
              toast.success(`Delivery time updated to ${newValue}!`)
            } catch (e) {
              console.error('Failed to update time:', e)
            }
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `⏰ Updated delivery time for **${name}** to **${newValue}** ✓`,
                type: 'order_edit',
                chips: [{ label: 'View Orders', action: 'view_orders' }],
                timestamp: new Date(),
              },
            ])
            return
          }

          if (fieldToUpdate === 'quantity' && newValue) {
            const numQty = parseInt(newValue, 10)
            if (numQty > 0) {
              try {
                const rate = targetOrder.rate || 130
                await updateOrder(targetOrder.id, {
                  qty: numQty,
                  totalQty: numQty,
                  totalAmount: numQty * rate,
                })
                toast.success(`Quantity updated to ${numQty} boxes!`)
              } catch (e) {
                console.error('Failed to update qty:', e)
              }
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `📦 Updated quantity for **${name}** to **${numQty} boxes** ✓`,
                  type: 'order_edit',
                  chips: [{ label: 'View Orders', action: 'view_orders' }],
                  timestamp: new Date(),
                },
              ])
              return
            }
          }

          if ((fieldToUpdate === 'price' || fieldToUpdate === 'rate') && newValue) {
            const numRate = parseFloat(newValue)
            if (numRate > 0) {
              try {
                const qty = targetOrder.qty || targetOrder.totalQty || 1
                await updateOrder(targetOrder.id, {
                  rate: numRate,
                  totalAmount: qty * numRate,
                })
                toast.success(`Price updated to ₹${numRate} per box!`)
              } catch (e) {
                console.error('Failed to update rate on order:', e)
              }
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: `💰 Updated price for **${name}**'s order to **₹${numRate}/box** (Total: ₹${(targetOrder.qty || 1) * numRate}) ✓`,
                  type: 'order_edit',
                  chips: [{ label: 'View Orders', action: 'view_orders' }],
                  timestamp: new Date(),
                },
              ])
              return
            }
          }

          if (
            fieldToUpdate === 'confirm' ||
            (fieldToUpdate === 'status' && String(newValue).toLowerCase() === 'confirmed') ||
            (changes && /(?:confirm|confirmed|pakku|manjoor)/i.test(changes))
          ) {
            try {
              await updateOrder(targetOrder.id, { status: 'Confirmed' })
              toast.success(`Order for ${name} confirmed!`)
            } catch (e) {
              console.error('Failed to confirm order:', e)
            }
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `✅ Order for **${name}** has been **Confirmed** ✓`,
                type: 'order_edit',
                chips: [{ label: 'View Orders', action: 'view_orders' }],
                timestamp: new Date(),
              },
            ])
            return
          }

          if (fieldToUpdate === 'cancel' || (changes && changes.toLowerCase().includes('cancel'))) {
            try {
              await updateOrder(targetOrder.id, { status: 'cancelled', isCancelled: true })
              toast.success(`Order for ${name} cancelled!`)
            } catch (e) {
              console.error('Failed to cancel order:', e)
            }
            setMessages((prev) => [
              ...prev,
              {
                id: 'asst-' + Date.now(),
                sender: 'assistant',
                text: `❌ Order for **${name}** has been cancelled ✓`,
                type: 'order_edit',
                chips: [{ label: 'View Orders', action: 'view_orders' }],
                timestamp: new Date(),
              },
            ])
            return
          }

          // General order edit card with 1-tap quick actions
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `I found **${name}**'s active order:\n• **${currentQty} boxes** (${targetOrder.sku || 'Anjani 200ml'})\n• Date: **${currentDate}** at **${currentTime}**\n• Location: ${currentLoc}\n\nWhat would you like to update?`,
              type: 'order_edit',
              data: { order: targetOrder },
              chips: [
                { label: '✏️ Full Edit', action: 'open_order_modal', data: targetOrder },
                { label: '📅 Reschedule to Tomorrow', value: `update date of ${name} to tomorrow` },
                { label: '⏰ Change to 4 PM', value: `update time of ${name} to 4 PM` },
                { label: '❌ Cancel Order', value: `cancel order for ${name}` },
              ],
              timestamp: new Date(),
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `No open active order found for **${clientName || 'this customer'}**. Would you like to view all orders or book a new one?`,
              type: 'order_edit',
              chips: [
                { label: '📦 Orders & Deliveries', action: 'query_orders' },
                { label: `📦 Book Order for ${clientName || 'Customer'}`, value: `${clientName || 'Customer'} 30 box tomorrow 11 AM` },
              ],
              timestamp: new Date(),
            },
          ])
        }
      } else if (resData.type === 'mark_orders_delivered') {
        const { clientNames = [], targetDate } = resData.data || {}
        const namesToProcess = Array.isArray(clientNames) ? clientNames : (clientNames ? [clientNames] : [])
        const markedClients = []
        const skippedDetails = []

        const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
        const effectiveDate = targetDate || istToday

        for (const cName of namesToProcess) {
          const norm = (cName || '').toLowerCase().trim()
          // Strictly match open orders for this client on the effective target date
          const clientMatches = (orders || []).filter((o) => {
            const st = (o.status || '').toLowerCase()
            const isOpen = st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
            const oName = (o.clientName || o.name || '').toLowerCase()
            if (!isOpen || !oName.includes(norm)) return false
            const od = o.deliveryDate || o.date || o.orderDate || ''
            return od.startsWith(effectiveDate)
          })

          if (clientMatches.length > 0) {
            for (const match of clientMatches) {
              try {
                await updateOrder(match.id, {
                  status: 'Delivered',
                  deliveredAt: new Date().toISOString(),
                })
                markedClients.push(match.clientName || cName)
              } catch (err) {
                console.error('Failed to mark order as delivered:', err)
              }
            }
          } else {
            // Check if open orders exist on other dates (e.g. tomorrow) to avoid silent wrong deliveries
            const otherOpenOrders = (orders || []).filter((o) => {
              const st = (o.status || '').toLowerCase()
              const isOpen = st !== 'cancelled' && st !== 'delivered' && o.isCancelled !== true
              const oName = (o.clientName || o.name || '').toLowerCase()
              return isOpen && oName.includes(norm)
            })
            if (otherOpenOrders.length > 0) {
              const dates = [...new Set(otherOpenOrders.map((o) => o.deliveryDate || o.date || 'other date'))].join(', ')
              skippedDetails.push(`**${cName}** has open order for **${dates}**, but none for **${effectiveDate}**`)
            } else {
              skippedDetails.push(`No open pending orders found for **${cName}**`)
            }
          }
        }

        const distinctMarked = [...new Set(markedClients)]
        if (distinctMarked.length > 0) {
          toast.success(`Marked ${distinctMarked.join(' & ')} as Delivered!`)
          let replyText = `✅ Marked today's (${effectiveDate}) order${distinctMarked.length > 1 ? 's' : ''} for **${distinctMarked.join('** and **')}** as **Delivered**! 🚚💨`
          if (skippedDetails.length > 0) {
            replyText += `\n\n⚠️ ${skippedDetails.join('\n⚠️ ')}`
          }
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: replyText,
              type: 'mark_orders_delivered',
              chips: [
                { label: '📦 View Remaining Orders', action: 'query_orders' },
                { label: '📊 Check Stock', action: 'query_stock' },
              ],
              timestamp: new Date(),
            },
          ])
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text: `Could not find open pending orders for **${namesToProcess.join(', ')}** for today (${effectiveDate}).\n\n${skippedDetails.map((d) => `ℹ️ ${d}`).join('\n')}`,
              type: 'mark_orders_delivered',
              chips: [
                { label: '📦 View All Orders', action: 'query_orders' },
              ],
              timestamp: new Date(),
            },
          ])
        }
      } else if (resData.type === 'order_create' || resData.type === 'order_draft') {
        const draftData = resData.data || {}
        const clientMatch = draftData.clientName ? findMatchingClient(draftData.clientName, clients)?.client : null
        const rawClient = (draftData.clientName || '').toLowerCase().trim()
        const isPlaceholderClient = !rawClient || rawClient === 'customer' || rawClient === 'client'

        const hasExplicitItems =
          (Array.isArray(draftData.items) && draftData.items.some((it) => Number(it.qty) > 0)) ||
          Number(draftData.qty) > 0

        // If no explicit customer or zero items, do not generate a dummy placeholder card
        if ((isPlaceholderClient && !clientMatch) || !hasExplicitItems) {
          setMessages((prev) => [
            ...prev,
            {
              id: 'asst-' + Date.now(),
              sender: 'assistant',
              text:
                resData.text ||
                'Sure! Please specify the customer name and quantity (e.g. "Kamleshbhai 30 box tomorrow 11 AM").',
              chips: [
                { label: '📦 Orders & Deliveries', action: 'query_orders' },
                { label: '📊 Check Stock', action: 'query_stock' },
              ],
              timestamp: new Date(),
            },
          ])
          return
        }

        const draftOrder = {
          clientId: clientMatch?.id || '',
          clientName: clientMatch?.displayName || clientMatch?.name || draftData.clientName || 'Customer',
          mobile: clientMatch?.mobile || draftData.mobile || '',
          date: draftData.deliveryDate || draftData.date || new Date().toISOString().split('T')[0],
          deliveryDate: draftData.deliveryDate || draftData.date || new Date().toISOString().split('T')[0],
          time: draftData.time || '11 AM',
          deliveryTime: draftData.time || '11 AM',
          location: draftData.location || draftData.address || clientMatch?.address || '',
          address: draftData.address || draftData.location || clientMatch?.address || '',
          items: Array.isArray(draftData.items) && draftData.items.length > 0
            ? draftData.items
            : [{ sku: 'Anjani 200ml', qty: Number(draftData.qty) || 10, rate: Number(draftData.rate) || 130 }],
          rate: Number(draftData.rate) || 130,
          totalQty: Array.isArray(draftData.items)
            ? draftData.items.reduce((s, it) => s + Number(it.qty || 0), 0)
            : Number(draftData.qty) || 10,
          totalAmount: Array.isArray(draftData.items)
            ? draftData.items.reduce((s, it) => s + (Number(it.qty || 0) * Number(it.rate || 130)), 0)
            : (Number(draftData.qty) || 10) * (Number(draftData.rate) || 130),
        }

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: resData.text || `📦 **Drafted Order for ${draftOrder.clientName}**`,
            type: 'order_draft',
            data: draftOrder,
            chips: [
              { label: 'Confirm & Book Order', action: 'book_order', data: draftOrder },
              { label: 'Edit Draft', action: 'edit_draft', data: draftOrder },
            ],
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'client_message') {
        const clientMsgData = resData.data || {}
        const rawClientName = clientMsgData.clientName || 'Customer'
        const matchedClient = (clients || []).find((c) => {
          const cName = (c.name || '').toLowerCase()
          const qName = rawClientName.toLowerCase()
          return cName.includes(qName) || qName.includes(cName)
        })
        const matchedStaff = !matchedClient
          ? (staffList || []).find((s) => {
              const sName = (s.name || '').toLowerCase()
              const qName = rawClientName.toLowerCase()
              return sName.includes(qName) || qName.includes(sName)
            })
          : null

        const finalClientName = matchedClient?.name || matchedStaff?.name || rawClientName
        const clientPhone =
          matchedClient?.mobile ||
          matchedClient?.phone ||
          matchedStaff?.mobile ||
          (rawClientName.toLowerCase().includes('nilesh') ? '7990943652' : '') ||
          (rawClientName.toLowerCase().includes('hitesh') ? '7778077617' : '')
        const draftMsg = clientMsgData.message || resData.text || `Hi ${finalClientName}, regarding your Anjani Water order: please confirm your delivery status.`

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: '',
            type: 'client_message_draft',
            data: {
              clientName: finalClientName,
              clientId: matchedClient?.id || null,
              clientPhone,
              message: draftMsg,
              channel: clientMsgData.channel || 'auto',
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'staff_reminder' || resData.type === 'staff_task') {
        const reminderData = resData.data || {}
        const staffName = reminderData.staffName || 'Nilesh'
        const isHitesh = /hitesh/i.test(staffName)
        const assignedStaff = (staffList || []).find((s) => (s.name || '').toLowerCase().includes(staffName.toLowerCase())) || {
          id: isHitesh ? 'hiteshbhai' : 'nilesh',
          name: isHitesh ? 'Hiteshbhai' : 'Nilesh',
          mobile: isHitesh ? '7778077617' : '7990943652',
        }
        const taskText = reminderData.message || reminderData.taskText || resData.text || 'Staff follow-up task'
        const todayStr = new Date().toISOString().slice(0, 10)

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: '',
            type: 'staff_task_draft',
            data: {
              text: taskText,
              assignedTo: assignedStaff.id,
              assignedStaffName: assignedStaff.name,
              staffPhone: assignedStaff.mobile || '7990943652',
              dueDate: reminderData.dueDate || todayStr,
              targetLabel: reminderData.targetLabel || 'Today',
              isFollowUp: false,
              daytimeCheck: true,
            },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'accounts_query') {
        const { staffName } = resData.data || {}
        const summary = accountsSummary || {}
        const nileshBal = Number(summary.nilesh || 0)
        const hiteshBal = Number(summary.hiteshbhai || 0)
        const counterBal = Number(summary.counter || 0)
        const bankBal = Number(summary.bank || 0)
        const totalStaffCash = nileshBal + hiteshBal

        let acctText = ''
        if (staffName && /nilesh/i.test(staffName)) {
          acctText = `💼 **Cash with Nilesh**: **₹${nileshBal.toLocaleString('en-IN')}**\nNilesh currently has ₹${nileshBal.toLocaleString('en-IN')} in delivery cash custody.`
        } else if (staffName && /hitesh/i.test(staffName)) {
          acctText = `💼 **Cash with Hiteshbhai**: **₹${hiteshBal.toLocaleString('en-IN')}**\nHiteshbhai currently has ₹${hiteshBal.toLocaleString('en-IN')} in delivery cash custody.`
        } else {
          acctText = `💼 **Staff Cash Custody & Account Balances**:\n• **Nilesh**: ₹${nileshBal.toLocaleString('en-IN')}\n• **Hiteshbhai**: ₹${hiteshBal.toLocaleString('en-IN')}\n• **Total with Delivery Staff**: ₹${totalStaffCash.toLocaleString('en-IN')}\n• **Counter Cash**: ₹${counterBal.toLocaleString('en-IN')}\n• **Bank / UPI**: ₹${bankBal.toLocaleString('en-IN')}`
        }

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: acctText,
            type: 'accounts_summary',
            data: { balances: summary, totalStaffCash },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'stock_query') {
        const summary = stockSummary || {}
        const lines = WATER_SKUS.map((sku) => {
          const qty = summary[sku]?.currentStock ?? 0
          return `• **${sku}**: **${qty}** ${qty === 1 ? 'unit' : 'units'}`
        }).join('\n')

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `📊 **Live Warehouse Stock Summary**:\n${lines}\n\n• **Total Units**: **${stockTotal ?? 0}**`,
            type: 'stock_summary',
            data: { summary, total: stockTotal },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'dues_query') {
        const { clientName } = resData.data || {}
        const clientList = clients || []
        const outstandingClients = clientList
          .filter((c) => Number(c.balance || c.outstanding || 0) > 0)
          .sort((a, b) => Number(b.balance || b.outstanding || 0) - Number(a.balance || a.outstanding || 0))

        const totalDues = outstandingClients.reduce((s, c) => s + Number(c.balance || c.outstanding || 0), 0)
        let duesText = ''
        if (clientName) {
          const matched = clientList.find((c) => (c.displayName || c.name || '').toLowerCase().includes(clientName.toLowerCase()))
          const bal = Number(matched?.balance || matched?.outstanding || 0)
          duesText = matched
            ? `💳 **Outstanding Balance for ${matched.displayName || matched.name}**: **₹${bal.toLocaleString('en-IN')}**`
            : `💳 No customer found matching "${clientName}".`
        } else {
          const top5 = outstandingClients.slice(0, 5)
          const listLines = top5.map((c) => `• **${c.displayName || c.name}**: ₹${Number(c.balance || c.outstanding || 0).toLocaleString('en-IN')}`).join('\n')
          duesText = `💳 **Total Outstanding Dues**: **₹${totalDues.toLocaleString('en-IN')}** across ${outstandingClients.length} clients.\n${listLines ? `\nTop Balances:\n${listLines}` : ''}`
        }

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: duesText,
            type: 'dues_summary',
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'tasks_query') {
        const { staffName } = resData.data || {}
        const activeJobs = (jobs || []).filter((j) => j.stage !== 'complete' && j.status !== 'completed')
        const filtered = staffName && staffName !== 'all'
          ? activeJobs.filter((j) => (j.assignedTo || '').toLowerCase().includes(staffName.toLowerCase()))
          : activeJobs

        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: filtered.length > 0
              ? `📋 Found **${filtered.length} active task${filtered.length > 1 ? 's' : ''}**:`
              : '📋 No pending staff tasks in the system right now.',
            type: 'staff_tasks_list',
            data: { tasks: filtered },
            timestamp: new Date(),
          },
        ])
      } else if (resData.type === 'chat_reply') {
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: resData.text || "Hello! I am Anjani AI, your operations assistant. How can I assist you today?",
            chips: [
              { label: '📦 Book Order', value: 'book order' },
              { label: "📦 Today's Orders", value: "today's orders" },
              { label: '📊 Check Stock', value: 'check stock' },
              { label: '💳 Outstanding Dues', value: 'outstanding dues' },
              { label: '📋 Staff Tasks', value: 'show staff tasks' },
            ],
            modelUsed: resData.modelUsed,
            timestamp: new Date(),
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: resData.text || "I've processed your request.",
            modelUsed: resData.modelUsed,
            timestamp: new Date(),
          },
        ])
      }
    } catch (err) {
      console.error('AI error:', err)
      setMessages((prev) => [
        ...prev,
        {
          id: 'asst-' + Date.now(),
          sender: 'assistant',
          text: `⚠️ **AI request failed**: ${err.message || 'Please check your connection and try again.'}`,
          isError: true,
          timestamp: new Date(),
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  // Adjust quantity in a bill card
  const handleUpdateBillQty = (msgId, skuLabel, delta) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'vendor_bill') return msg
        const updatedItems = msg.data.items.map((it) => {
          if (it.sku === skuLabel) {
            const nextQty = Math.max(0, it.qty + delta)
            return { ...it, qty: nextQty }
          }
          return it
        })
        return { ...msg, data: { ...msg.data, items: updatedItems } }
      })
    )
  }

  // Confirm stock inward from bill card
  const handleConfirmBillInward = async (msgId, billData) => {
    const validItems = (billData.items || []).filter((it) => Number(it.qty) > 0)
    if (validItems.length === 0) {
      toast.error('No items with quantity > 0 to inward.')
      return
    }

    try {
      const defaultNote = `Vendor Bill ${billData.billNumber !== 'N/A' ? billData.billNumber : ''} (${billData.vendorName})`.trim()
      const entries = validItems.map((it) => ({
        sku: it.sku,
        qty: Number(it.qty),
        narration: `${defaultNote} - ${it.sku}`,
      }))

      await addStockBatch(entries, defaultNote)
      setInwardedBills((prev) => ({ ...prev, [msgId]: true }))
      toast.success(
        `Added ${entries.reduce((s, e) => s + e.qty, 0)} units across ${entries.length} SKUs to stock!`
      )
    } catch (e) {
      toast.error('Failed to add stock: ' + e.message)
    }
  }

  // Mark order delivered directly from chat card
  const handleDeliverOrder = async (order) => {
    try {
      await updateOrder(order.id, { status: 'Delivered' })
      toast.success(`Order #${order.orderId || order.id} marked Delivered!`)
    } catch (e) {
      toast.error('Failed to update order: ' + e.message)
    }
  }

  // ==========================================
  // WHATSAPP BANKING-STYLE SECONDARY ACTION TRAY OPENERS
  // ==========================================
  const openOrderSecondaryMenu = (ord) => {
    if (!ord) return
    const clientName = ord.clientName || ord.name || 'Customer'
    const qty = ord.qty || ord.totalQty || 1
    const sku = ord.sku || ord.product || '200ml'
    const addr = ord.address ? `📍 ${ord.address}` : ''
    const time = ord.time || ord.deliveryTime ? `⏰ ${ord.time || ord.deliveryTime}` : ''

    const actions = getOrderCardActions({
      order: ord,
      handlers: {
        onRemindStaff: async (targetOrder) => {
          const daytime = checkIsDayTime()
          let force = false
          if (!daytime.isDayTime) {
            const confirmSend = window.confirm(
              `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nDaytime is 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send SMS to Nilesh anyway?`
            )
            if (!confirmSend) return
            force = true
          }

          const reminderMsg = `Nileshbhai, ${targetOrder.clientName || 'Customer'} nu ${targetOrder.qty || 1} box ${targetOrder.sku || 'Anjani 200ml'} delivery baki chhe.${targetOrder.address ? ' 📍 ' + targetOrder.address : ''}${targetOrder.time ? ' ⏰ ' + targetOrder.time : ''}. Dispatch kari dejo. - Anjani Water`

          try {
            await sendBackgroundSms({
              phone: '7990943652',
              message: reminderMsg,
            })
            toast.success('Delivery reminder SMS sent to Nilesh via MacroDroid! 📲', { icon: '📲' })
          } catch (err) {
            toast.error('Failed to send SMS: ' + err.message)
          }
        },
        onWhatsAppStaff: (targetOrder) => {
          const reminderMsg = `Nileshbhai, ${targetOrder.clientName || 'Customer'} nu ${targetOrder.qty || 1} box ${targetOrder.sku || 'Anjani 200ml'} delivery baki chhe.${targetOrder.address ? ' 📍 ' + targetOrder.address : ''}${targetOrder.time ? ' ⏰ ' + targetOrder.time : ''}. Dispatch kari dejo. - Anjani Water`
          window.open(
            `https://api.whatsapp.com/send?phone=917990943652&text=${encodeURIComponent(reminderMsg)}`,
            '_blank'
          )
          toast.success('WhatsApp opened for Nilesh! 💬', { icon: '💬' })
        },
        onMarkDelivered: (targetOrder) => handleDeliverOrder(targetOrder),
        onEditOrder: (targetOrder) => {
          if (onOpenOrderModal) {
            onOpenOrderModal(targetOrder)
            onClose()
          } else {
            setInputMessage(`update qty for ${targetOrder.clientName || 'order'} to `)
            inputRef.current?.focus()
          }
        },
        onShareInvoice: (targetOrder) => {
          if (onShareInvoice) onShareInvoice(targetOrder)
        },
      },
    })

    const sheetData = {
      type: 'order',
      title: 'Order Card',
      subtitle: `${clientName} • ${qty}x ${sku}`,
      itemSummary: {
        title: clientName,
        detail: [addr, time].filter(Boolean).join(' • ') || 'Today Delivery',
        badge: `${qty}x ${sku}`,
      },
      actions,
    }

    lastActiveCardActionsRef.current = actions
    setActiveCardSheet(sheetData)
  }

  const openClientSecondaryMenu = (cli) => {
    if (!cli) return
    const clientName = cli.displayName || cli.name || 'Customer'
    const actions = getClientCardActions({
      client: cli,
      handlers: {
        onBookOrder: (targetClient) => {
          setInputMessage(`Order 20 boxes Anjani 200ml for ${targetClient.displayName || targetClient.name}`)
          inputRef.current?.focus()
        },
        onRecordPayment: (targetClient) => {
          onOpenPaymentModal?.(targetClient)
          onClose()
        },
        onViewLedger: () => {
          onNavigateTab?.('accounts')
          onClose()
        },
      },
    })

    const sheetData = {
      type: 'client',
      title: 'Client Actions',
      subtitle: clientName,
      itemSummary: {
        title: clientName,
        detail: cli.address || cli.mobile || 'Customer Profile',
        badge: cli.balance ? `Due: ₹${Number(cli.balance).toLocaleString('en-IN')}` : 'Active',
      },
      actions,
    }

    lastActiveCardActionsRef.current = actions
    setActiveCardSheet(sheetData)
  }

  const openPaymentSecondaryMenu = (pay) => {
    if (!pay) return
    const clientName = pay.clientName || 'Customer'
    const amt = Number(pay.amount || 0)

    const actions = getPaymentCardActions({
      payment: pay,
      handlers: {
        onSendReceipt: (targetPayment) => {
          const cleanPhone = normalizeIndianPhone(targetPayment.clientMobile || targetPayment.phone)
          const msg = `Namaste ${clientName} ji, Anjani Water e aapna tarafthi ₹${amt.toLocaleString('en-IN')} payment svikaryu chhe. Dhanyavaad! 🙏 - Anjani Water`
          if (cleanPhone) {
            window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank')
            toast.success('WhatsApp receipt opened! 💬')
          } else {
            navigator.clipboard.writeText(msg)
            toast.success('Receipt copied to clipboard! 📋')
          }
        },
        onNextOrder: () => {
          setInputMessage(`Order 15 boxes Anjani 200ml for ${clientName}`)
          inputRef.current?.focus()
        },
        onStaffHandover: () => {
          onNavigateTab?.('accounts')
          onClose()
        },
        onClientBalance: () => {
          setInputMessage(`Who has outstanding bill?`)
        },
      },
    })

    const sheetData = {
      type: 'payment',
      title: 'Payment Card',
      subtitle: `${clientName} • ₹${amt.toLocaleString('en-IN')}`,
      itemSummary: {
        title: clientName,
        detail: `Mode: ${pay.method || pay.accountId || 'Cash'}`,
        badge: `₹${amt.toLocaleString('en-IN')}`,
      },
      actions,
    }

    lastActiveCardActionsRef.current = actions
    setActiveCardSheet(sheetData)
  }

  const openTaskSecondaryMenu = (task) => {
    if (!task) return
    const staffName = task.assignedStaffName || 'Staff'
    const taskDesc = task.text || 'Staff Task'

    const actions = getTaskCardActions({
      task,
      handlers: {
        onSmsStaff: async (targetTask) => {
          const daytime = checkIsDayTime()
          let force = false
          if (!daytime.isDayTime) {
            const confirmSend = window.confirm(
              `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nSend SMS to ${staffName} anyway?`
            )
            if (!confirmSend) return
            force = true
          }

          const msg = `Anjani Task (${staffName}): ${targetTask.text || 'Daily task'}. Target: Today. Dispatch kari dejo.`
          try {
            await sendBackgroundSms({
              phone: targetTask.staffPhone || '7990943652',
              message: msg,
            })
            toast.success(`SMS sent to ${staffName}! 📲`)
          } catch (err) {
            toast.error('Failed to send SMS: ' + err.message)
          }
        },
        onWhatsAppStaff: (targetTask) => {
          const msg = `Anjani Task (${staffName}): ${targetTask.text || 'Daily task'}. Target: Today. Dispatch kari dejo.`
          window.open(
            `https://api.whatsapp.com/send?phone=91${targetTask.staffPhone || '7990943652'}&text=${encodeURIComponent(msg)}`,
            '_blank'
          )
          toast.success(`WhatsApp opened for ${staffName}! 💬`)
        },
        onRescheduleTask: () => {
          toast.success(`Task rescheduled for Tomorrow 9 AM! ☀️`)
        },
        onEditTask: () => {
          setInputMessage(`Assign task to ${staffName}: `)
          inputRef.current?.focus()
        },
        onCompleteTask: () => {
          toast.success('Task marked as complete! ✅')
        },
      },
    })

    const sheetData = {
      type: 'task',
      title: 'Staff Task Card',
      subtitle: `${staffName} • ${taskDesc.slice(0, 30)}`,
      itemSummary: {
        title: staffName,
        detail: taskDesc,
        badge: task.targetLabel || 'Today',
      },
      actions,
    }

    lastActiveCardActionsRef.current = actions
    setActiveCardSheet(sheetData)
  }

  const openHandoverSecondaryMenu = (entry) => {
    if (!entry) return
    const actions = getHandoverCardActions({
      handover: entry,
      handlers: {
        onStaffSms: async (ent) => {
          try {
            await sendBackgroundSms({
              phone: '7990943652',
              message: `Anjani Cash Handover: Received ₹${Number(ent.amount || 0).toLocaleString('en-IN')}. Narration: ${ent.narration || 'Handover'}. - Anjani Water`,
            })
            toast.success('Handover SMS sent! 📲')
          } catch (err) {
            toast.error('Failed to send SMS: ' + err.message)
          }
        },
        onWhatsAppSlip: (ent) => {
          const url = `https://api.whatsapp.com/send?phone=917990943652&text=${encodeURIComponent(
            `Anjani Cash Handover: Received ₹${Number(ent.amount || 0).toLocaleString('en-IN')}. Narration: ${ent.narration || 'Handover'}. - Anjani Water`
          )}`
          window.open(url, '_blank')
        },
        onOpenCalculator: () => {
          onNavigateTab?.('accounts')
          onClose()
        },
        onViewPassbook: () => {
          onNavigateTab?.('accounts')
          onClose()
        },
      },
    })
    lastActiveCardActionsRef.current = actions
    setActiveCardSheet({
      type: 'handover',
      title: 'Handover Card',
      subtitle: `${entry.fromAccount || 'Cash'} ➔ ${entry.toAccount || 'Staff'}`,
      itemSummary: {
        title: `₹${Number(entry.amount || 0).toLocaleString('en-IN')}`,
        detail: entry.narration || 'Cash Transfer',
        badge: 'Handover',
      },
      actions,
    })
  }

  // Adjust quantity for a sale item in a retail sales batch by item index
  const handleUpdateRetailSaleQty = (msgId, saleIdx, itemIdx, delta) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'retail_sales') return msg
        const updatedSales = msg.data.sales.map((sale, sIdx) => {
          if (sIdx !== saleIdx) return sale
          const updatedItems = sale.items.map((it, iIdx) => {
            if (iIdx === itemIdx) {
              const nextQty = Math.max(0, (Number(it.qty) || 0) + delta)
              return { ...it, qty: nextQty, amount: nextQty * (it.rate || 0) }
            }
            return it
          })
          const nextTotal = updatedItems.reduce((s, it) => s + it.qty * (it.rate || 0), 0)
          return { ...sale, items: updatedItems, totalAmount: nextTotal }
        })
        return { ...msg, data: { ...msg.data, sales: updatedSales } }
      })
    )
  }

  // Adjust unit rate for a sale item in a retail sales batch by item index
  const handleUpdateRetailSaleRate = (msgId, saleIdx, itemIdx, newRate) => {
    const rateVal = Math.max(0, Number(newRate) || 0)
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'retail_sales') return msg
        const updatedSales = msg.data.sales.map((sale, sIdx) => {
          if (saleIdx !== null && sIdx !== saleIdx) return sale
          const updatedItems = sale.items.map((it, iIdx) => {
            if (itemIdx !== null && iIdx !== itemIdx) return it
            const nextAmount = (Number(it.qty) || 0) * rateVal
            return { ...it, rate: rateVal, amount: nextAmount }
          })
          const nextTotal = updatedItems.reduce((s, it) => s + (Number(it.qty) || 0) * (it.rate || 0), 0)
          return { ...sale, items: updatedItems, totalAmount: nextTotal }
        })
        return { ...msg, data: { ...msg.data, sales: updatedSales } }
      })
    )
  }

  // Toggle payment mode (cash, online, credit) for a sale
  const handleTogglePaymentMode = (msgId, saleIdx, mode) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'retail_sales') return msg
        const updatedSales = msg.data.sales.map((sale, sIdx) => {
          if (sIdx !== saleIdx) return sale
          return { ...sale, paymentMode: mode }
        })
        return { ...msg, data: { ...msg.data, sales: updatedSales } }
      })
    )
  }

  // Remove a sale entry from a retail sales batch
  const handleDeleteRetailSale = (msgId, saleIdx) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'retail_sales') return msg
        const updatedSales = msg.data.sales.filter((_, sIdx) => sIdx !== saleIdx)
        return { ...msg, data: { ...msg.data, sales: updatedSales } }
      })
    )
  }

  // Confirm and create all delivered sales from a retail sales batch
  const handleConfirmRetailSales = async (msgId, salesBatch) => {
    const validSales = (salesBatch.sales || []).filter(
      (s) => (s.items || []).some((it) => Number(it.qty) > 0)
    )
    if (validSales.length === 0) {
      toast.error('No sales with quantity > 0 to create.')
      return
    }

    try {
      setLoading(true)
      const res = await createBatchSales(validSales)
      setProcessedSalesBatches((prev) => ({ ...prev, [msgId]: true }))
      toast.success(
        `Created ${res.createdOrdersCount} confirmed orders (editable in Orders tab)!`
      )
    } catch (e) {
      console.error('Failed to create batch sales:', e)
      toast.error('Failed to create sales: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Confirm and log staff cash & accounts entries batch
  const handleConfirmAccountEntries = async (msgId, accountsData) => {
    const entries = (accountsData.entries || []).filter((e) => Number(e.amount) > 0)
    if (entries.length === 0) {
      toast.error('No valid account entries to record.')
      return
    }

    try {
      setLoading(true)
      const res = await createBatchAccountEntries(entries)
      setProcessedSalesBatches((prev) => ({ ...prev, [msgId]: true }))
      toast.success(`Recorded ${res.successCount} account & cash entries!`)
    } catch (e) {
      console.error('Failed to log accounts entries:', e)
      toast.error('Failed to record entries: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // Delete a specific account entry from batch
  const handleDeleteAccountEntry = (msgId, entryIdx) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== msgId || msg.type !== 'accounts_cash') return msg
        const updatedEntries = msg.data.entries.filter((_, eIdx) => eIdx !== entryIdx)
        return { ...msg, data: { ...msg.data, entries: updatedEntries } }
      })
    )
  }

  // Quick WhatsApp share for order
  const handleShareOrderWhatsApp = (order) => {
    const phone = order.mobile || order.phone || ''
    const clean = phone.replace(/\D/g, '')
    const targetPhone = clean.length === 10 ? '91' + clean : clean
    const msg = `Anjani Water Delivery Update for Order #${order.orderId || order.id}: Scheduled for ${order.time || 'today'}. Address: ${order.address || order.location || ''}`
    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (!isOpen) return null

  return (
    <div
      className={
        isPage
          ? 'w-full h-full flex flex-col bg-white overflow-hidden relative'
          : 'fixed inset-0 z-[1200] flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in'
      }
    >
      <div
        className={
          isPage
            ? 'w-full h-full flex flex-col bg-white overflow-hidden'
            : 'w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right'
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#131921] text-white px-3 py-2 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-1.5">
            {!isPage && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Back to parent page"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5 text-gray-300 hover:text-white" />
              </button>
            )}
            <div className="w-6 h-6 rounded-md bg-[#ff9900]/20 flex items-center justify-center text-[#ff9900]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-bold text-sm text-white">Anjani</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setShowFeedbackModal((prev) => {
                  if (prev) handleClearFeedbackImage()
                  return !prev
                })
              }}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                showFeedbackModal
                  ? 'bg-[#ff9900] text-gray-950 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/10'
              }`}
              title="Submit Feedback"
              aria-label="AI Feedback"
            >
              <MessageSquarePlus className="w-4 h-4 text-[#ff9900]" />
              <span className="hidden sm:inline font-black text-[11px]">Feedback</span>
            </button>

            {/* Small button beside feedback button to trigger on-demand */}
            <button
              type="button"
              onClick={handleTriggerFeedbackCheck}
              disabled={isCheckingFeedback}
              className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                isCheckingFeedback
                  ? 'bg-amber-500 text-gray-950 border-amber-600 animate-pulse'
                  : 'bg-white/10 hover:bg-[#ff9900] text-[#ff9900] hover:text-gray-950 border-[#ff9900]/40 hover:border-[#ff9900]'
              }`}
              title="Trigger Feedback Corrections On-Demand (Run AI Now)"
              aria-label="Trigger Feedback Review Manually"
            >
              <Zap className={`w-3.5 h-3.5 ${isCheckingFeedback ? 'animate-spin' : 'fill-current'}`} />
              <span className="font-extrabold text-[10px] tracking-tight">Run AI</span>
            </button>

            {/* Tiny Thumbs Down Button in Header for Latest AI Output */}
            <button
              type="button"
              onClick={handleReportLatestBadOutput}
              disabled={!lastAssistantMessage || isReportingBadOutput}
              className={`px-1.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border shadow-2xs ${
                lastAssistantMessage && reportedBadOutputs[lastAssistantMessage?.id || lastAssistantMessage?.timestamp]
                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                  : 'bg-white/5 hover:bg-red-500/20 text-gray-300 hover:text-red-400 border-transparent hover:border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={
                lastAssistantMessage
                  ? 'Quick Thumbs Down: Record latest AI output as Bad Output to Firebase'
                  : 'Thumbs Down: No AI output to report yet'
              }
              aria-label="Report Latest Bad Output"
            >
              <ThumbsDown className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline font-extrabold text-[10px]">
                {lastAssistantMessage && reportedBadOutputs[lastAssistantMessage?.id || lastAssistantMessage?.timestamp]
                  ? 'Reported'
                  : 'Bad Output'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMessages([])}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Clear chat"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close AI chat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Single Streamlined AI Feedback Card */}
        {showFeedbackModal && (
          <div className="border-b border-blue-200 bg-blue-50/70 p-3 text-xs space-y-3 shrink-0 animate-in fade-in">
            {/* Header with Title and Close */}
            <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
              <div className="flex items-center gap-1.5">
                <MessageSquarePlus className="w-4 h-4 text-blue-700 shrink-0" />
                <span className="font-black text-gray-900 text-xs">Submit AI Feedback</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  handleClearFeedbackImage()
                  setShowFeedbackModal(false)
                }}
                className="p-1 text-gray-400 hover:text-gray-700 rounded cursor-pointer"
                title="Close Feedback"
              >
                <X size={14} />
              </button>
            </div>

            {/* Submit Feedback Form */}
            <form onSubmit={handleSubmitFeedback} className="space-y-2.5">
              {feedbackSnippet && (
                <div className="p-2 bg-white rounded-lg border border-blue-100 text-[11px] text-gray-600">
                  <span className="font-bold text-gray-700 block text-[10px] uppercase tracking-wide">Referenced Context:</span>
                  <span className="line-clamp-2 italic">{feedbackSnippet}</span>
                </div>
              )}

              {/* Feedback Comment Textarea */}
              <div>
                <textarea
                  rows={3}
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  onPaste={handleFeedbackPaste}
                  placeholder="Enter your feedback or improvement request (or paste screenshot directly)..."
                  className="w-full p-2 bg-white border border-blue-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Screenshot / Image Attachment Preview or File Picker */}
              {feedbackImage ? (
                <div className="flex items-center gap-2.5 p-2 bg-white rounded-lg border border-blue-200 shadow-2xs">
                  <img
                    src={feedbackImage.dataUrl}
                    alt="Feedback attachment"
                    className="w-12 h-12 object-cover rounded-md border border-gray-200 shrink-0"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {feedbackImage.fileName || 'Attached Screenshot'}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {feedbackImage.sizeKb ? `${feedbackImage.sizeKb} KB` : 'Image attached'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                      <Check size={11} /> Screenshot attached
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearFeedbackImage}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    title="Remove screenshot"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <input
                    ref={feedbackFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFeedbackFileSelect}
                  />
                  <button
                    type="button"
                    onClick={() => feedbackFileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="Attach screenshot or photo from gallery or camera"
                  >
                    <Camera size={13} className="text-blue-600" />
                    <span>Attach Screenshot</span>
                  </button>
                  <span className="text-[10px] text-gray-500 italic">
                    or paste screenshot (Ctrl+V)
                  </span>
                </div>
              )}

              {/* Submit & Manual Trigger buttons */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleTriggerFeedbackCheck}
                  disabled={isCheckingFeedback}
                  className="px-2.5 py-1 bg-[#ff9900] hover:bg-orange-500 text-gray-950 rounded-lg text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  title="Trigger AI to process feedback queue immediately"
                >
                  <Zap size={12} className={isCheckingFeedback ? 'animate-spin' : 'fill-current'} />
                  <span>Run AI Now</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleClearFeedbackImage()
                      setShowFeedbackModal(false)
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    aria-label="Send Feedback"
                    disabled={isSubmittingFeedback || (!feedbackText.trim() && !feedbackImage)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {isSubmittingFeedback ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    <span>Send Feedback</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Clutter-Free Quick Action Navigation Strip (Single line, strictly icon-only, no scrolling needed) */}
        <div className="px-2 py-1.5 bg-gray-50/90 border-b border-gray-200 flex items-center justify-between gap-1 overflow-x-hidden shrink-0 text-xs select-none">
          {/* 0. WhatsApp Bot Menu */}
          <button
            type="button"
            onClick={() => {
              setActiveChatbotFlow(null)
              const menu = getMainMenuMessage()
              setMessages((prev) => [
                ...prev,
                {
                  id: 'asst-' + Date.now(),
                  sender: 'assistant',
                  text: menu.text,
                  chips: menu.chips,
                  isMainMenu: true,
                  timestamp: new Date(),
                },
              ])
            }}
            className="h-7 w-7 rounded-lg border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-950 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs"
            title="WhatsApp Bot Menu"
            aria-label="Bot Menu"
          >
            <Bot className="w-4 h-4 text-[#ff9900]" />
          </button>

          {/* 1. Staff Tasks (AI Powered & SMS Follow-up) */}
          <button
            type="button"
            onClick={() => handleSend('show staff tasks')}
            className="h-7 w-7 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-900 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs relative"
            title="Staff Tasks Assignment & SMS Follow-ups"
            aria-label="Staff Tasks"
          >
            <span className="text-xs">📋</span>
            {jobs.filter((j) => j && j.stage !== 'complete' && j.stage !== 'archived').length > 0 && (
              <span className="absolute -top-1 -right-1 px-1 h-3.5 min-w-[14px] rounded-full bg-teal-600 text-white font-black text-[9px] flex items-center justify-center">
                {jobs.filter((j) => j && j.stage !== 'complete' && j.stage !== 'archived').length}
              </span>
            )}
          </button>

          {/* 2. Order Creation & Sales */}
          <button
            type="button"
            onClick={() => {
              setIsSalesMode((prev) => {
                const next = !prev
                if (next) {
                  setIsPaymentMode(false)
                  setIsClientMode(false)
                  setIsAccountsMode(false)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }
                return next
              })
            }}
            className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
              isSalesMode
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50'
            }`}
            title="1. Order Creation & Daily Sales"
            aria-label="Order Creation"
          >
            <ClipboardList className={`w-4 h-4 ${isSalesMode ? 'text-white' : 'text-emerald-600'}`} />
          </button>

          {/* 3. Receive Payment */}
          <button
            type="button"
            onClick={() => {
              setIsPaymentMode((prev) => {
                const next = !prev
                if (next) {
                  setIsSalesMode(false)
                  setIsClientMode(false)
                  setIsAccountsMode(false)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }
                return next
              })
            }}
            className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
              isPaymentMode
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-700 hover:text-emerald-800 hover:bg-emerald-50/50'
            }`}
            title="2. Receive Payment / Scan UPI"
            aria-label="Receive Payment"
          >
            <IndianRupee className={`w-4 h-4 ${isPaymentMode ? 'text-white' : 'text-emerald-700'}`} />
          </button>

          {/* 4. Add Client */}
          <button
            type="button"
            onClick={() => {
              setIsClientMode((prev) => {
                const next = !prev
                if (next) {
                  setIsSalesMode(false)
                  setIsPaymentMode(false)
                  setIsAccountsMode(false)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }
                return next
              })
            }}
            className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
              isClientMode
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-amz-orange hover:text-amz-orange hover:bg-orange-50/50'
            }`}
            title="3. Add New Client"
            aria-label="Add Client"
          >
            <UserPlus className={`w-4 h-4 ${isClientMode ? 'text-white' : 'text-amz-orange'}`} />
          </button>

          {/* 5. Camera OCR: Scan Photo */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 w-7 bg-white border border-gray-200 hover:border-amz-orange hover:bg-orange-50/50 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs text-gray-700"
            title="Scan Photo (Vendor Bill / UPI Screenshot / Visiting Card)"
            aria-label="Scan Photo"
          >
            <Camera className="w-4 h-4 text-gray-700" />
          </button>

          {/* 6. Accounts & Staff Cash */}
          <button
            type="button"
            onClick={() => {
              setIsAccountsMode((prev) => {
                const next = !prev
                if (next) {
                  setIsSalesMode(false)
                  setIsPaymentMode(false)
                  setIsClientMode(false)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }
                return next
              })
            }}
            className={`h-7 w-7 rounded-lg border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
              isAccountsMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50/50'
            }`}
            title="Accounts & Staff Cash (Nilesh, Hiteshbhai, Counter, Bank)"
            aria-label="Accounts & Staff Cash"
          >
            <ArrowRightLeft className={`w-4 h-4 ${isAccountsMode ? 'text-white' : 'text-blue-600'}`} />
          </button>

          {/* 7. Current Stock */}
          <button
            type="button"
            onClick={() => handleSend('Current stock')}
            className="h-7 w-7 bg-white border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs text-gray-700"
            title="Check Warehouse Stock"
            aria-label="Current Stock"
          >
            <Package className="w-4 h-4 text-indigo-600" />
          </button>

          {/* 8. Today Deliveries */}
          <button
            type="button"
            onClick={() => handleSend('Pending orders today')}
            className="h-7 w-7 bg-white border border-gray-200 hover:border-cyan-600 hover:bg-cyan-50/50 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs text-gray-700"
            title="Today's Pending Deliveries"
            aria-label="Today Deliveries"
          >
            <Truck className="w-4 h-4 text-cyan-600" />
          </button>

          {/* 9. Outstanding Dues */}
          <button
            type="button"
            onClick={() => handleSend('Outstanding balances')}
            className="h-7 w-7 bg-white border border-gray-200 hover:border-purple-500 hover:bg-purple-50/50 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs text-gray-700"
            title="Customer Outstanding Dues"
            aria-label="Outstanding Balances"
          >
            <CreditCard className="w-4 h-4 text-purple-600" />
          </button>
        </div>

        {/* Message Thread */}
        <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-start text-center pt-0 pb-1 px-1 text-gray-700 select-none">
              {/* Single-Card Compact Menu (Fits 100% on one page without scrolling) */}
              <div className="w-full max-w-sm bg-white rounded-xl p-2 border border-gray-200/90 shadow-2xs space-y-1.5 text-left">
                {MAIN_MENU_GROUPS.map((group) => {
                  const groupChips = MAIN_MENU_CHIPS.filter((c) => group.chipIds.includes(c.id))
                  return (
                    <div key={group.title} className="space-y-0.5">
                      <div className="text-[9px] font-black tracking-wider text-gray-400 uppercase px-0.5">
                        {group.title}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {groupChips.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => handleChipClick(chip)}
                            className={`h-7 px-2 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs hover:scale-[1.01] active:scale-95 ${
                              chip.color || 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <span className="truncate">{chip.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-[#131921] text-[#ff9900] flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-[#ff9900] text-gray-950 rounded-tr-xs font-medium'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-xs'
                }`}
              >
                {/* Image preview in user bubble */}
                {msg.imagePreview && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-black/10">
                    <img
                      src={msg.imagePreview}
                      alt="Uploaded bill"
                      className="max-h-48 w-full object-cover"
                    />
                  </div>
                )}

                {/* Plain Text Message */}
                {Boolean(msg.text) && (
                  <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                    {msg.text}
                  </div>
                )}

                {/* WhatsApp-Style Interactive Selection Chips */}
                {msg.chips && msg.chips.length > 0 && (
                  <div className={`${msg.text ? 'mt-2.5 pt-2 border-t border-gray-100' : ''} flex flex-wrap gap-1.5 items-center`}>
                    {msg.chips.map((chip, cIdx) => (
                      <button
                        key={chip.id || cIdx}
                        type="button"
                        disabled={loading}
                        onClick={() => handleChipClick(chip)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs active:scale-95 text-left flex items-center gap-1 ${
                          chip.isPrimary
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 font-black shadow-xs'
                            : chip.isDestructive
                              ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
                              : chip.color
                                ? chip.color
                                : 'bg-gray-50 hover:bg-orange-50 text-gray-800 hover:text-black border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 1. Interactive Order Draft Card */}
                {msg.type === 'order_draft' && msg.data && (
                  <div
                    onClick={() => openOrderSecondaryMenu(placedOrders[msg.id] || msg.data)}
                    className="mt-3 bg-white border border-gray-300 hover:border-amber-400 rounded-xl p-3.5 space-y-3 text-xs text-gray-800 shadow-sm cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm">Order Card</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openOrderSecondaryMenu(placedOrders[msg.id] || msg.data)
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Open WhatsApp Banking Quick Actions"
                            >
                              <Zap size={10} className="text-amber-700" /> Actions (1-6)
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">For {msg.data.clientName || 'Customer'}</p>
                          {(msg.data.deliveryDate || msg.data.date) && (
                            <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5 font-medium truncate">
                              <span>📅</span> {msg.data.deliveryDate || msg.data.date} {msg.data.deliveryTime || msg.data.time ? `• ⏰ ${msg.data.deliveryTime || msg.data.time}` : ''}
                            </p>
                          )}
                          {(msg.data.address || msg.data.location) && (
                            <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5 font-medium truncate">
                              <span>📍</span> {msg.data.address || msg.data.location}
                            </p>
                          )}
                        </div>
                      </div>
                      {placedOrders[msg.id] ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Placed
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1.5">
                      {msg.data.items?.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <span className="font-semibold text-gray-900">
                            {it.qty} {it.unit || 'Box'} × {it.sku}
                          </span>
                          <span className="font-bold text-gray-900">
                            ₹{(it.qty * it.rate).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between font-bold text-gray-900 px-1 pt-1">
                        <span>Total ({msg.data.totalQty} units):</span>
                        <span className="text-amz-orange font-black">
                          ₹{Number(msg.data.totalAmount || 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={placedOrders[msg.id]}
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            const savedOrder = await addOrder({
                              clientId: msg.data.clientId,
                              clientName: msg.data.clientName,
                              mobile: msg.data.mobile,
                              address: msg.data.address || msg.data.location || '',
                              location: msg.data.location || msg.data.address || '',
                              items: msg.data.items,
                              totalQty: msg.data.totalQty,
                              totalAmount: msg.data.totalAmount,
                              status: 'Pending',
                              date: msg.data.deliveryDate || msg.data.date,
                              deliveryDate: msg.data.deliveryDate || msg.data.date,
                              time: msg.data.deliveryTime || msg.data.time || '11 AM',
                              deliveryTime: msg.data.deliveryTime || msg.data.time || '11 AM',
                            })
                            setPlacedOrders((prev) => ({ ...prev, [msg.id]: savedOrder || msg.data }))
                            toast.success(`Order confirmed for ${msg.data.clientName}!`)
                          } catch (err) {
                            toast.error('Failed to place order: ' + err.message)
                          }
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs text-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {placedOrders[msg.id] ? 'Order Placed ✓' : 'Confirm Order Now'}
                      </button>

                      {onOpenOrderModal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const saved = placedOrders[msg.id]
                            onOpenOrderModal(saved && typeof saved === 'object' ? saved : msg.data)
                          }}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer flex items-center gap-1"
                        >
                          {placedOrders[msg.id] ? (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              <span>Open Record</span>
                            </>
                          ) : (
                            'Open Form'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Interactive Payment Receipt Card */}
                {msg.type === 'receive_payment' && msg.data && (
                  <div
                    onClick={() => openPaymentSecondaryMenu(msg.data)}
                    className="mt-3 bg-white border border-gray-300 hover:border-emerald-400 rounded-xl p-3.5 space-y-3 text-xs text-gray-800 shadow-sm cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                          <IndianRupee className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm">Payment Receipt</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openPaymentSecondaryMenu(msg.data)
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Open Payment Quick Actions"
                            >
                              <Zap size={10} className="text-emerald-700" /> Actions (1-3)
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-500 truncate">{msg.data.onlineProvider || 'UPI / Cash Payment'}</p>
                        </div>
                      </div>
                      {recordedPayments[msg.paymentId || msg.id] ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Recorded
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Customer / Client</label>
                        <select
                          value={msg.data.clientId || ''}
                          disabled={recordedPayments[msg.paymentId || msg.id]}
                          onChange={(e) => {
                            const id = e.target.value
                            const c = clients.find((item) => item.id === id)
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? {
                                      ...m,
                                      data: {
                                        ...m.data,
                                        clientId: id,
                                        clientName: c?.name || m.data.clientName,
                                      },
                                    }
                                  : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                        >
                          <option value="">{msg.data.clientName || '-- Select Client --'}</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} {c.outstanding ? `(Due: ₹${Number(c.outstanding).toLocaleString('en-IN')})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Amount Received (₹)</label>
                        <input
                          type="number"
                          value={msg.data.amount || ''}
                          disabled={recordedPayments[msg.paymentId || msg.id]}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, data: { ...m.data, amount: val } } : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-emerald-700 text-sm focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Payment Mode</label>
                        <select
                          value={msg.data.method || 'online'}
                          disabled={recordedPayments[msg.paymentId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? {
                                      ...m,
                                      data: {
                                        ...m.data,
                                        method: val,
                                        accountId: val === 'cash' ? 'counter' : 'bank',
                                      },
                                    }
                                  : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-800 focus:bg-white outline-none"
                        >
                          <option value="online">Online / UPI (Bank)</option>
                          <option value="cash">Cash (Counter)</option>
                          <option value="cheque">Cheque</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Reference / UTR</label>
                        <input
                          type="text"
                          value={msg.data.utr ? `UTR: ${msg.data.utr}` : msg.data.date || ''}
                          disabled={recordedPayments[msg.paymentId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, data: { ...m.data, utr: val } } : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 focus:bg-white outline-none"
                          placeholder="UTR / Transaction ID"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={
                          recordedPayments[msg.paymentId || msg.id] ||
                          !msg.data.clientId ||
                          Number(msg.data.amount) <= 0
                        }
                        onClick={async () => {
                          try {
                            const matchedCli = clients?.find((c) => c.id === msg.data.clientId)
                            const resolvedName = msg.data.clientName || matchedCli?.name || ''
                            const pDate = new Date()
                            const extraNote = msg.data.utr ? `UPI Ref: ${msg.data.utr}` : ''
                            const narration = formatPaymentNarration(resolvedName, pDate, extraNote)
                            const savedPay = await addPayment({
                              clientId: msg.data.clientId,
                              clientName: resolvedName,
                              amount: Number(msg.data.amount),
                              type: 'payment',
                              method: msg.data.method || 'online',
                              accountId:
                                msg.data.accountId ||
                                (msg.data.method === 'cash' ? 'counter' : 'bank'),
                              narration,
                              note: extraNote || narration,
                              date: pDate,
                            })
                            setRecordedPayments((prev) => ({
                              ...prev,
                              [msg.paymentId || msg.id]: savedPay || msg.data,
                            }))
                            toast.success(
                              `Payment of ₹${Number(msg.data.amount).toLocaleString('en-IN')} recorded successfully!`,
                            )
                          } catch (err) {
                            toast.error('Failed to record payment: ' + err.message)
                          }
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs text-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {recordedPayments[msg.paymentId || msg.id]
                          ? 'Payment Recorded ✓'
                          : 'Confirm & Record Payment'}
                      </button>

                      {onOpenPaymentModal && (
                        <button
                          type="button"
                          onClick={() => {
                            const saved = recordedPayments[msg.paymentId || msg.id]
                            onOpenPaymentModal(saved && typeof saved === 'object' ? saved : msg.data)
                          }}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer flex items-center gap-1"
                        >
                          {recordedPayments[msg.paymentId || msg.id] ? (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Open Record</span>
                            </>
                          ) : (
                            'Open Form'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2.5. Neat & Clean Compound Action Card (Client + Order + Payment) */}
                {msg.type === 'compound_action' && msg.data && (
                  <div className="mt-2.5 bg-white border border-gray-200 rounded-xl p-3 space-y-2 text-xs text-gray-800 shadow-xs">
                    {/* Clean compact summary rows */}
                    <div className="space-y-1.5 divide-y divide-gray-100">
                      {/* Client row */}
                      {msg.data.clientName && (
                        <div
                          onClick={() => openClientSecondaryMenu({ name: msg.data.clientName, mobile: msg.data.clientMobile })}
                          className="flex items-center justify-between gap-2 pt-1 first:pt-0 cursor-pointer hover:bg-blue-50/50 p-1 rounded-lg transition-colors"
                          title="Tap for Client Card actions"
                        >
                          <span className="text-gray-500 flex items-center gap-1.5 font-medium shrink-0">
                            <User className="w-3.5 h-3.5 text-blue-600" /> Client
                          </span>
                          <span className="font-bold text-gray-900 text-right">
                            {msg.data.clientName}
                            {msg.data.clientMobile ? (
                              <span className="text-gray-500 font-normal text-[11px] ml-1">
                                ({msg.data.clientMobile})
                              </span>
                            ) : null}
                            {msg.data.isNewClient ? (
                              <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-semibold">
                                New
                              </span>
                            ) : (
                              <span className="ml-1.5 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-semibold">
                                Existing
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Order row */}
                      {msg.data.order && (
                        <div
                          onClick={() => openOrderSecondaryMenu({ ...msg.data.order, clientName: msg.data.clientName, mobile: msg.data.clientMobile })}
                          className="flex items-center justify-between gap-2 pt-1.5 cursor-pointer hover:bg-amber-50/50 p-1 rounded-lg transition-colors"
                          title="Tap for Order Card actions"
                        >
                          <span className="text-gray-500 flex items-center gap-1.5 font-medium shrink-0">
                            <Package className="w-3.5 h-3.5 text-emerald-600" /> Order
                          </span>
                          <span className="font-bold text-gray-900 text-right">
                            {msg.data.order.qty} × {msg.data.order.sku || 'Anjani 200ml'}
                            <span className="text-gray-500 font-normal text-[11px] ml-1">
                              @ ₹{msg.data.order.rate || 130} = ₹{Number(msg.data.order.totalAmount || (msg.data.order.qty * (msg.data.order.rate || 130))).toLocaleString('en-IN')}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Payment row */}
                      {msg.data.payment && (
                        <div
                          onClick={() => openPaymentSecondaryMenu({ ...msg.data.payment, clientName: msg.data.clientName, clientMobile: msg.data.clientMobile })}
                          className="flex items-center justify-between gap-2 pt-1.5 cursor-pointer hover:bg-emerald-50/50 p-1 rounded-lg transition-colors"
                          title="Tap for Payment Card actions"
                        >
                          <span className="text-gray-500 flex items-center gap-1.5 font-medium shrink-0">
                            <IndianRupee className="w-3.5 h-3.5 text-emerald-600" /> Payment
                          </span>
                          <span className="font-black text-emerald-700 text-right">
                            ₹{Number(msg.data.payment.amount || 0).toLocaleString('en-IN')}
                            <span className="text-gray-500 font-normal text-[11px] ml-1">
                              ({msg.data.payment.onlineProvider || 'UPI'})
                            </span>
                            {msg.data.payment.utr && (
                              <span className="text-[10px] text-gray-400 block font-mono font-normal">
                                Ref: {msg.data.payment.utr}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action buttons (Confirm & Save or Post-Save Open Record) */}
                    <div className="pt-1 border-t border-gray-100">
                      {executedCompounds[msg.compoundId || msg.id] ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-300 cursor-default">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span>Saved Cleanly ✓</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const saved = executedCompounds[msg.compoundId || msg.id]
                                if (saved && typeof saved === 'object' && saved.order && onOpenOrderModal) {
                                  onOpenOrderModal(saved.order)
                                } else if (saved && typeof saved === 'object' && saved.payment && onOpenPaymentModal) {
                                  onOpenPaymentModal(saved.payment)
                                } else if (saved && typeof saved === 'object' && saved.client && onOpenEditClient) {
                                  onOpenEditClient(saved.client)
                                } else if (msg.data?.order && onOpenOrderModal) {
                                  onOpenOrderModal(msg.data.order)
                                } else if (onNavigateTab) {
                                  onNavigateTab('orders')
                                }
                              }}
                              className="py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-black text-white shadow-xs transition-colors cursor-pointer shrink-0 active:scale-95"
                              title="Open saved record"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-[#ff9900]" />
                              <span>Open Record</span>
                            </button>
                          </div>

                          {/* Quick direct links if both Order and Payment exist */}
                          {msg.data?.order && msg.data?.payment && (
                            <div className="flex items-center justify-end gap-2 text-[11px] text-gray-500 pt-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const saved = executedCompounds[msg.compoundId || msg.id]
                                  if (saved?.order && onOpenOrderModal) {
                                    onOpenOrderModal(saved.order)
                                  } else if (onNavigateTab) {
                                    onNavigateTab('orders')
                                  }
                                }}
                                className="text-blue-600 hover:underline font-medium flex items-center gap-0.5 cursor-pointer"
                              >
                                View Order ↗
                              </button>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const saved = executedCompounds[msg.compoundId || msg.id]
                                  if (saved?.payment && onOpenPaymentModal) {
                                    onOpenPaymentModal(saved.payment)
                                  } else if (onNavigateTab) {
                                    onNavigateTab('payments')
                                  }
                                }}
                                className="text-emerald-700 hover:underline font-medium flex items-center gap-0.5 cursor-pointer"
                              >
                                View Payment ↗
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={executingCompoundId === (msg.compoundId || msg.id)}
                          onClick={async () => {
                            const d = msg.data || {}
                            const cId = msg.compoundId || msg.id
                            setExecutingCompoundId(cId)
                            try {
                              let finalClientId = d.clientId
                              let finalClientName = d.clientName
                              let createdClientObj = null

                              // 1. Create client if new
                              if (d.isNewClient && !finalClientId && d.clientName) {
                                finalClientId = await addClient({
                                  name: d.clientName,
                                  mobile: d.clientMobile || '',
                                  address: d.clientAddress || '',
                                  location: d.clientAddress || '',
                                  rate: Number(d.order?.rate) || 130,
                                  notes: `Created via ${d.payment?.onlineProvider || 'UPI'} transaction`,
                                })
                                createdClientObj = {
                                  id: finalClientId,
                                  name: d.clientName,
                                  mobile: d.clientMobile || '',
                                  address: d.clientAddress || '',
                                  location: d.clientAddress || '',
                                  rate: Number(d.order?.rate) || 130,
                                }
                              } else if (finalClientId) {
                                createdClientObj = clients.find((c) => c.id === finalClientId) || {
                                  id: finalClientId,
                                  name: finalClientName,
                                }
                              } else if (d.clientName) {
                                const matchedExisting = findBestExistingClientMatch(d.clientName, clients, { mobile: d.clientMobile })
                                if (matchedExisting) {
                                  finalClientId = matchedExisting.id
                                  finalClientName = matchedExisting.name
                                  createdClientObj = matchedExisting
                                }
                              }

                              // 2. Add Order if order present
                              let createdOrderObj = null
                              if (d.order) {
                                const now = new Date()
                                const yyyy = now.getFullYear()
                                const mm = String(now.getMonth() + 1).padStart(2, '0')
                                const dd = String(now.getDate()).padStart(2, '0')
                                const localDate = `${yyyy}-${mm}-${dd}`
                                const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

                                const qty = Number(d.order.qty) || 1
                                const rate = Number(d.order.rate) || 130
                                const sku = d.order.sku || 'Anjani 200ml'
                                const totalAmount = Number(d.order.totalAmount) || qty * rate

                                const orderPayload = {
                                  clientId: finalClientId || '',
                                  clientName: finalClientName || 'Customer',
                                  mobile: d.clientMobile || '',
                                  items: [
                                    {
                                      sku,
                                      qty,
                                      rate,
                                      amount: totalAmount,
                                      unit: 'Box',
                                    },
                                  ],
                                  totalQty: qty,
                                  totalAmount,
                                  qty,
                                  rate,
                                  sku,
                                  address: d.clientAddress || '',
                                  location: d.clientAddress || '',
                                  status: 'Pending',
                                  date: localDate,
                                  time: localTime,
                                }

                                const res = await addOrder(orderPayload)
                                createdOrderObj = res || { ...orderPayload }
                              }

                              // 3. Add Payment if payment present
                              let createdPaymentObj = null
                              if (d.payment && Number(d.payment.amount) > 0) {
                                const paymentAmount = Number(d.payment.amount)
                                const pDate = new Date()
                                const extraNote = d.payment.utr ? `UPI Ref: ${d.payment.utr}` : ''
                                const narration = formatPaymentNarration(finalClientName, pDate, extraNote)
                                const payPayload = {
                                  clientId: finalClientId || '',
                                  clientName: finalClientName || 'Customer',
                                  amount: paymentAmount,
                                  type: 'payment',
                                  method: d.payment.paymentMode === 'cash' ? 'cash' : 'online',
                                  accountId: d.payment.paymentMode === 'cash' ? 'counter' : 'bank',
                                  narration,
                                  note: extraNote || narration,
                                  date: pDate,
                                }
                                const res = await addPayment(payPayload)
                                createdPaymentObj = res || { ...payPayload }
                              }

                              setExecutedCompounds((prev) => ({
                                ...prev,
                                [cId]: {
                                  order: createdOrderObj,
                                  payment: createdPaymentObj,
                                  client: createdClientObj,
                                },
                              }))
                              toast.success('Saved successfully!')
                            } catch (err) {
                              console.error('Compound execution failed:', err)
                              toast.error('Failed to save: ' + err.message)
                            } finally {
                              setExecutingCompoundId(null)
                            }
                          }}
                          className="w-full py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-[0.99]"
                        >
                          {executingCompoundId === (msg.compoundId || msg.id) ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <span>Confirm & Save</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. Interactive Client Creation Card */}
                {msg.type === 'create_client' && msg.data && (
                  <div className="mt-3 bg-white border border-gray-300 rounded-xl p-3.5 space-y-3 text-xs text-gray-800 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-orange-100 text-amz-orange flex items-center justify-center font-bold">
                          <UserPlus className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">New Client Setup</p>
                          <p className="text-[11px] text-gray-500">From visiting card / text details</p>
                        </div>
                      </div>
                      {createdClients[msg.clientId || msg.id] ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Added
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Client / Store Name</label>
                        <input
                          type="text"
                          value={msg.data.name}
                          disabled={createdClients[msg.clientId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value
                            const clean = ensureEnglishText(val)
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, data: { ...m.data, name: clean } } : m,
                              ),
                            )
                          }}
                          onBlur={() => {
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? { ...m, data: { ...m.data, name: ensureEnglishText(m.data.name) } }
                                  : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:bg-white focus:ring-1 focus:ring-amz-orange outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Mobile Number</label>
                        <input
                          type="tel"
                          maxLength={10}
                          value={msg.data.mobile}
                          disabled={createdClients[msg.clientId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '')
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, data: { ...m.data, mobile: val } } : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:bg-white focus:ring-1 focus:ring-amz-orange outline-none"
                          placeholder="10-digit mobile"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Delivery Address</label>
                        <input
                          type="text"
                          value={msg.data.address}
                          disabled={createdClients[msg.clientId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value
                            const clean = ensureEnglishText(val)
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id ? { ...m, data: { ...m.data, address: clean } } : m,
                              ),
                            )
                          }}
                          onBlur={() => {
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? { ...m, data: { ...m.data, address: ensureEnglishText(m.data.address) } }
                                  : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-800 focus:bg-white focus:ring-1 focus:ring-amz-orange outline-none"
                          placeholder="Street, area, city"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-gray-500">Rate (₹ / 200ml Box)</label>
                        <input
                          type="number"
                          value={msg.data.rate || ''}
                          disabled={createdClients[msg.clientId || msg.id]}
                          onChange={(e) => {
                            const val = e.target.value
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? { ...m, data: { ...m.data, rate: Number(val) || 0 } }
                                  : m,
                              ),
                            )
                          }}
                          className="w-full mt-0.5 p-2 bg-gray-50 border border-gray-200 rounded-lg font-semibold text-gray-900 focus:bg-white focus:ring-1 focus:ring-amz-orange outline-none"
                          placeholder="e.g. 65"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={createdClients[msg.clientId || msg.id] || !msg.data.name}
                        onClick={async () => {
                          try {
                            const sanitized = sanitizeClientForEnglish(msg.data)
                            const createdId = await addClient({
                              name: sanitized.name,
                              mobile: sanitized.mobile,
                              address: sanitized.address,
                              location: sanitized.location || sanitized.address,
                              rate: Number(sanitized.rate) || 0,
                            })
                            const clientRecord = { id: createdId, ...sanitized }
                            setCreatedClients((prev) => ({
                              ...prev,
                              [msg.clientId || msg.id]: clientRecord,
                            }))
                            toast.success(`Client "${sanitized.name}" created successfully!`)
                          } catch (err) {
                            toast.error('Failed to create client: ' + err.message)
                          }
                        }}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs text-xs"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {createdClients[msg.clientId || msg.id] ? 'Client Created ✓' : 'Create Client Now'}
                      </button>

                      {(onOpenAddClient || onOpenEditClient) && (
                        <button
                          type="button"
                          onClick={() => {
                            const saved = createdClients[msg.clientId || msg.id]
                            const sanitized = sanitizeClientForEnglish(msg.data)
                            if (saved && onOpenEditClient) {
                              onOpenEditClient(typeof saved === 'object' ? saved : sanitized)
                            } else if (onOpenAddClient) {
                              onOpenAddClient(sanitized)
                            }
                          }}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer flex items-center gap-1"
                        >
                          {createdClients[msg.clientId || msg.id] ? (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                              <span>Open Record</span>
                            </>
                          ) : (
                            'Open Form'
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Interactive Vendor Bill Card */}
                {msg.type === 'vendor_bill' && msg.data && (
                  <div className="mt-3 bg-gray-50 border border-gray-300 rounded-xl p-3 space-y-2.5 text-xs text-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{msg.data.vendorName}</p>
                        <p className="text-[11px] text-gray-500">
                          Bill #{msg.data.billNumber} • {msg.data.billDate}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
                        OCR Scanned
                      </span>
                    </div>

                    {/* Extracted SKU Rows */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                        Extracted Products:
                      </p>
                      {msg.data.items.length === 0 ? (
                        <p className="text-gray-500 italic">No recognized water products found.</p>
                      ) : (
                        msg.data.items.map((it) => (
                          <div
                            key={it.sku}
                            className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200"
                          >
                            <div>
                              <span className="font-semibold text-gray-900">{it.sku}</span>
                              <span className="text-[10px] text-gray-400 block">{it.unit}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {!inwardedBills[msg.id] && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBillQty(msg.id, it.sku, -5)}
                                  className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                              )}
                              <span className="font-bold text-sm w-8 text-center">{it.qty}</span>
                              {!inwardedBills[msg.id] && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBillQty(msg.id, it.sku, 5)}
                                  className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="pt-2">
                      {inwardedBills[msg.id] ? (
                        <div className="w-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Inwarded to Stock Ledger ✅</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConfirmBillInward(msg.id, msg.data)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <Package className="w-4 h-4" />
                          <span>Confirm & Inward to Stock</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 1.5. Interactive Retail Sales Batch Card */}
                {msg.type === 'retail_sales' && msg.data?.sales && (() => {
                  const isBatchDone = !!processedSalesBatches[msg.id]
                  const totalBatchQty = msg.data.sales.reduce(
                    (sum, s) =>
                      sum + (s.items || []).reduce((isum, it) => isum + Number(it.qty || 0), 0),
                    0
                  )
                  const totalBatchAmt = msg.data.sales.reduce(
                    (sum, s) => sum + Number(s.totalAmount || 0),
                    0
                  )

                  return (
                    <div className="mt-2.5 bg-gray-50 border border-gray-200 rounded-2xl p-2.5 space-y-2 text-xs text-gray-800 shadow-xs">
                      {/* Top Header with Instant 1-Tap Confirm Button */}
                      <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
                        <div className="min-w-0">
                          <p className="font-black text-gray-900 text-xs flex items-center gap-1 truncate">
                            <Zap className="w-3.5 h-3.5 text-[#ff9900] shrink-0" />
                            <span>{msg.data.sales.length} Order{msg.data.sales.length !== 1 ? 's' : ''} Ready</span>
                          </p>
                          <p className="text-[10px] text-gray-500 font-semibold truncate">
                            {totalBatchQty} units • ₹{totalBatchAmt.toLocaleString('en-IN')} total
                          </p>
                        </div>

                        {!isBatchDone ? (
                          <button
                            type="button"
                            disabled={loading || msg.data.sales.length === 0}
                            onClick={() => handleConfirmRetailSales(msg.id, msg.data)}
                            className="px-2.5 py-1 bg-[#131921] hover:bg-black text-[#ff9900] rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            <Check size={12} />
                            Confirm Now
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigateTab?.('orders')
                              onClose()
                            }}
                            className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0"
                          >
                            View in Orders ➔
                          </button>
                        )}
                      </div>

                      {/* Sales List */}
                      <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5">
                        {msg.data.sales.length === 0 ? (
                          <p className="text-gray-400 italic text-center py-2 text-xs">No sales entries.</p>
                        ) : (
                          msg.data.sales.map((sale, sIdx) => {
                            const saleQtyTotal = (sale.items || []).reduce(
                              (sum, it) => sum + (Number(it.qty) || 0),
                              0
                            )

                            return (
                              <div
                                key={sale.id || sIdx}
                                onClick={() => openOrderSecondaryMenu(sale)}
                                className="bg-white hover:bg-amber-50/20 p-2 rounded-xl border border-gray-100 hover:border-amber-300 shadow-2xs space-y-1.5 cursor-pointer transition-all"
                              >
                                {/* Customer Header */}
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="font-extrabold text-gray-900 text-xs truncate">
                                      {sale.clientName}
                                    </span>
                                    {sale.isConsolidatedRetail ? (
                                      <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 text-[8px] font-black uppercase">
                                        Retail
                                      </span>
                                    ) : sale.isMatched ? (
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase">
                                        Matched
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 text-[8px] font-black uppercase">
                                        New
                                      </span>
                                    )}
                                    {sale.mobile && (
                                      <span className="text-[10px] text-gray-400 font-semibold truncate">
                                        ({sale.mobile})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openOrderSecondaryMenu(sale)
                                      }}
                                      className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 cursor-pointer flex items-center gap-0.5"
                                      title="Open Order Card Quick Actions"
                                    >
                                      ⚡ Actions
                                    </button>
                                    {!isBatchDone && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteRetailSale(msg.id, sIdx)
                                        }}
                                        className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                                        title="Remove"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Delivery Date / Time / Address Badges */}
                                {(sale.date || sale.deliveryDate || sale.deliveryTime || sale.address) && (
                                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-gray-700 bg-amber-50/70 p-1.5 rounded-lg border border-amber-200/60 font-semibold">
                                    {(sale.date || sale.deliveryDate) && (
                                      <span className="inline-flex items-center gap-1 font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                                        📅 {sale.date || sale.deliveryDate}
                                      </span>
                                    )}
                                    {sale.deliveryTime && (
                                      <span className="inline-flex items-center gap-1 font-black text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded">
                                        ⏰ {sale.deliveryTime}
                                      </span>
                                    )}
                                    {sale.address && (
                                      <span className="inline-flex items-center gap-1 text-gray-800 truncate max-w-[240px]" title={sale.address}>
                                        📍 {sale.address}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Items in this sale (Distinct lines for different rates) */}
                                <div className="space-y-1 bg-gray-50/80 p-1.5 rounded-lg border border-gray-100">
                                  {sale.items.map((it, itIdx) => {
                                    const lineTotal = (Number(it.qty) || 0) * (Number(it.rate) || 0)
                                    return (
                                      <div
                                        key={`${it.sku}-${it.rate}-${itIdx}`}
                                        className="flex items-center justify-between text-xs py-0.5"
                                      >
                                        <div className="min-w-0 pr-1">
                                          <span className="font-bold text-gray-800 truncate block">
                                            {it.sku}
                                          </span>
                                          <div className="text-[10px] text-gray-500 font-semibold flex items-center flex-wrap gap-1">
                                            <span>{it.qty} {it.unit || 'cs'}</span>
                                            {!isBatchDone ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const newRateStr = window.prompt(`Enter new rate for ${it.sku} (₹):`, it.rate || 130)
                                                  if (newRateStr !== null && newRateStr.trim() !== '') {
                                                    const parsed = parseFloat(newRateStr)
                                                    if (!isNaN(parsed) && parsed > 0) {
                                                      handleUpdateRetailSaleRate(msg.id, sIdx, itIdx, parsed)
                                                      toast.success(`Updated rate to ₹${parsed}`)
                                                    }
                                                  }
                                                }}
                                                className="px-1.5 py-0.2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[9px] inline-flex items-center gap-0.5 cursor-pointer border border-blue-200 transition-colors"
                                                title="Tap to edit rate"
                                              >
                                                <span>@ ₹{it.rate}</span>
                                                <Edit2 className="w-2.5 h-2.5 opacity-70" />
                                              </button>
                                            ) : (
                                              <span>{it.rate > 0 ? `@ ₹${it.rate}` : ''}</span>
                                            )}
                                            {lineTotal > 0 && <span>= ₹{lineTotal.toLocaleString('en-IN')}</span>}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {!isBatchDone && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateRetailSaleQty(msg.id, sIdx, itIdx, -1)
                                              }
                                              className="w-4 h-4 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 cursor-pointer"
                                            >
                                              <Minus className="w-2.5 h-2.5" />
                                            </button>
                                          )}
                                          <span className="font-black text-xs w-5 text-center">
                                            {it.qty}
                                          </span>
                                          {!isBatchDone && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleUpdateRetailSaleQty(msg.id, sIdx, itIdx, 1)
                                              }
                                              className="w-4 h-4 rounded bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-700 cursor-pointer"
                                            >
                                              <Plus className="w-2.5 h-2.5" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Payment Mode & Total */}
                                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                  <div className="flex items-center gap-1">
                                    {[
                                      { id: 'cash', label: 'Cash' },
                                      { id: 'online', label: 'UPI' },
                                      { id: 'credit', label: 'Udhar' },
                                    ].map((mode) => {
                                      const isActive = sale.paymentMode === mode.id
                                      return (
                                        <button
                                          key={mode.id}
                                          type="button"
                                          disabled={isBatchDone}
                                          onClick={() => handleTogglePaymentMode(msg.id, sIdx, mode.id)}
                                          className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase transition-all cursor-pointer ${
                                            isActive
                                              ? mode.id === 'cash'
                                                ? 'bg-emerald-600 text-white'
                                                : mode.id === 'online'
                                                  ? 'bg-blue-600 text-white'
                                                  : 'bg-amber-500 text-white'
                                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                          }`}
                                        >
                                          {mode.label}
                                        </button>
                                      )
                                    })}
                                  </div>

                                  <div className="text-right">
                                    <span className="text-xs font-black text-gray-900">
                                      {sale.totalAmount > 0
                                        ? `₹${sale.totalAmount.toLocaleString('en-IN')}`
                                        : `${saleQtyTotal} box`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Bottom Action Button */}
                      <div className="pt-1">
                        {isBatchDone ? (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigateTab?.('orders')
                              onClose()
                            }}
                            className="w-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-black py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs active:scale-98 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Orders Confirmed! View in Orders Tab ➔</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={loading || msg.data.sales.length === 0}
                            onClick={() => handleConfirmRetailSales(msg.id, msg.data)}
                            className="w-full bg-[#131921] hover:bg-black text-[#ff9900] font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Confirm & Log Orders (₹{totalBatchAmt.toLocaleString('en-IN')})</span>
                          </button>
                        )}
                      </div>

                      {/* Small Feedback Button */}
                      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                        <span className="truncate">Catering & Retail Orders</span>
                        <button
                          type="button"
                          onClick={() => handleOpenFeedbackForMessage(msg)}
                          className="hover:text-amber-700 text-gray-500 flex items-center gap-1 font-bold cursor-pointer"
                          title="Submit feedback or correction on this AI result"
                        >
                          <MessageSquarePlus size={12} className="text-[#ff9900]" />
                          <span>Feedback</span>
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* 1.5 Interactive Staff Cash & Accounts Entries Card */}
                {msg.type === 'accounts_cash' && msg.data && (() => {
                  const entries = msg.data.entries || []
                  const totalAmt = entries.reduce((s, e) => s + Number(e.amount || 0), 0)
                  const isBatchDone = processedSalesBatches[msg.id]

                  return (
                    <div
                      onClick={() => openHandoverSecondaryMenu(entries[0])}
                      className="mt-2.5 bg-white border border-blue-200 hover:border-blue-400 rounded-2xl p-2.5 space-y-2 text-xs shadow-xs cursor-pointer transition-all"
                    >
                      {/* Top Header with 1-Tap Confirm */}
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="p-1 rounded-lg bg-blue-50 text-blue-600 font-black shrink-0">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-black uppercase text-gray-800 tracking-tight">
                                Handover Card
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openHandoverSecondaryMenu(entries[0])
                                }}
                                className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 flex items-center gap-0.5 cursor-pointer"
                                title="Open Handover Quick Actions"
                              >
                                ⚡ Actions
                              </button>
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold block truncate">
                              {entries.length} {entries.length === 1 ? 'entry' : 'entries'} • ₹{totalAmt.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        {!isBatchDone ? (
                          <button
                            type="button"
                            disabled={loading || entries.length === 0}
                            onClick={() => handleConfirmAccountEntries(msg.id, msg.data)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] py-1 px-2.5 rounded-lg flex items-center gap-1 uppercase tracking-wide cursor-pointer transition-all shadow-2xs active:scale-95 disabled:opacity-50"
                          >
                            <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                            Confirm Now
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> Logged
                          </span>
                        )}
                      </div>

                      {/* Entries List */}
                      <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                        {entries.length === 0 ? (
                          <p className="text-[11px] text-gray-400 text-center py-2">No entries detected.</p>
                        ) : (
                          entries.map((entry, eIdx) => {
                            const isTransfer = entry.type === 'transfer'
                            const isCollection = entry.type === 'collection'
                            const isExpense = entry.type === 'expense'

                            const fromMeta = getAccountMeta(entry.fromAccount || 'nilesh')
                            const toMeta = getAccountMeta(entry.toAccount || 'counter')
                            const acctMeta = getAccountMeta(entry.accountId || 'counter')

                            return (
                              <div
                                key={eIdx}
                                className="bg-gray-50/80 border border-gray-200/70 rounded-xl p-2 flex items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide shrink-0 ${
                                      isTransfer
                                        ? 'bg-blue-100 text-blue-800'
                                        : isCollection
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {isTransfer ? 'Handover' : isCollection ? 'Collection' : 'Expense'}
                                  </span>

                                  <div className="min-w-0">
                                    <div className="text-[11px] font-black text-gray-800 truncate">
                                      {isTransfer && `${fromMeta.shortLabel} ➔ ${toMeta.shortLabel}`}
                                      {isCollection && `${entry.clientName || 'Customer'} ➔ ${acctMeta.shortLabel}`}
                                      {isExpense && `${acctMeta.shortLabel} • ${entry.category || 'Expense'}`}
                                    </div>
                                    {entry.notes && (
                                      <p className="text-[10px] text-gray-400 truncate">{entry.notes}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-black text-gray-900">
                                    ₹{Number(entry.amount || 0).toLocaleString('en-IN')}
                                  </span>
                                  {!isBatchDone && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAccountEntry(msg.id, eIdx)}
                                      className="text-gray-400 hover:text-rose-600 p-0.5 rounded cursor-pointer transition-colors"
                                      title="Remove entry"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>

                      {/* Bottom Action Button */}
                      <div className="pt-1">
                        {isBatchDone ? (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigateTab?.('accounts')
                              onClose()
                            }}
                            className="w-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-black py-2 rounded-xl flex items-center justify-center gap-1.5 text-xs active:scale-98 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Entries Logged! View in Accounts ➔</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={loading || entries.length === 0}
                            onClick={() => handleConfirmAccountEntries(msg.id, msg.data)}
                            className="w-full bg-[#131921] hover:bg-black text-[#ff9900] font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Confirm & Log Entries (₹{totalAmt.toLocaleString('en-IN')})</span>
                          </button>
                        )}
                      </div>

                      {/* Small Feedback Button */}
                      <div className="flex items-center justify-between text-[10px] text-gray-400 px-1 pt-0.5">
                        <span className="truncate">Catering & Retail Orders</span>
                        <button
                          type="button"
                          onClick={() => handleOpenFeedbackForMessage(msg)}
                          className="hover:text-amber-700 text-gray-500 flex items-center gap-1 font-bold cursor-pointer"
                          title="Submit feedback or correction on this AI result"
                        >
                          <MessageSquarePlus size={12} className="text-[#ff9900]" />
                          <span>Feedback</span>
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* 2. Interactive Stock Summary Card */}
                {msg.type === 'stock_summary' && msg.data && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {msg.data.stockItems.map((item) => (
                        <div
                          key={item.sku}
                          className="bg-white p-2 rounded-lg border border-gray-200 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-gray-900 block">{item.label}</span>
                            <span className="text-[10px] text-gray-400">{item.unit}</span>
                          </div>
                          <span
                            className="font-extrabold text-sm px-2 py-0.5 rounded"
                            style={{ color: item.color }}
                          >
                            {item.qty}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateTab?.('stock')
                          onClose()
                        }}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-1.5 px-2 rounded-lg text-center transition-colors"
                      >
                        Open Stock Ledger
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Interactive Pending Orders Card (Compact 2-line layout, icon-only) */}
                {msg.type === 'orders_list' && msg.data?.orders?.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.data.orders.map((ord) => (
                      <div
                        key={ord.id}
                        onClick={() => openOrderSecondaryMenu(ord)}
                        className="bg-white border border-gray-200 hover:border-amber-400 rounded-lg p-2 text-xs space-y-1 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-1 min-w-0">
                          <span className="font-bold text-gray-900 truncate">
                            {ord.clientName || ord.name || 'Customer'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openOrderSecondaryMenu(ord)
                              }}
                              className="text-[9px] px-1.5 py-0.2 rounded font-black bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-200 uppercase flex items-center gap-0.5 cursor-pointer"
                              title="Open Order Card Quick Actions"
                            >
                              ⚡ Actions
                            </button>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 uppercase">
                              {ord.qty}x {ord.sku || ord.product || '200ml'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-[10px] text-gray-500 truncate flex-1">
                            {ord.address ? `📍 ${ord.address}` : `⏰ ${ord.time || 'Today'}`}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeliverOrder(ord)
                              }}
                              aria-label="Mark Delivered"
                              title="Mark Delivered"
                              className="h-6 w-6 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            {onOpenOrderModal && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onOpenOrderModal(ord)
                                  onClose()
                                }}
                                aria-label="Edit Order"
                                title="View or edit order"
                                className="h-6 w-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onShareInvoice && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onShareInvoice(ord)
                                }}
                                aria-label="Invoice PDF"
                                title="Invoice PDF"
                                className="h-6 w-6 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleShareOrderWhatsApp(ord)
                              }}
                              aria-label="WhatsApp"
                              title="Send WhatsApp update"
                              className="h-6 w-6 rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 4. Interactive Outstanding Balances Card */}
                {msg.type === 'outstanding_list' && msg.data?.clients?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.data.clients.map((cli) => (
                      <div
                        key={cli.id}
                        onClick={() => openClientSecondaryMenu(cli)}
                        className="bg-gray-50 border border-gray-200 hover:border-amber-400 rounded-xl p-2.5 text-xs flex items-center justify-between cursor-pointer transition-all"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{cli.name}</p>
                          <p className="text-[10px] text-red-600 font-bold">
                            ₹{Number(cli.outstanding ?? cli.balance ?? 0).toLocaleString()} Pending
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenPaymentModal?.(cli)
                            onClose()
                          }}
                          className="bg-amz-navy hover:bg-black text-[#ff9900] font-bold py-1 px-2.5 rounded text-[11px] transition-colors"
                        >
                          Record Payment
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 5. Interactive Accounts / Staff Cash Custody Card */}
                {msg.type === 'accounts_summary' && msg.data?.balances && (
                  <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white p-2 rounded-lg border border-blue-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-blue-700">Nilesh</span>
                          <span className="w-2 h-2 rounded-full bg-blue-600" />
                        </div>
                        <span className="text-sm font-black text-blue-800 mt-1">
                          ₹{Number(msg.data.balances.nilesh || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[9px] text-gray-400 font-semibold">Staff Custody</span>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-purple-700">Hiteshbhai</span>
                          <span className="w-2 h-2 rounded-full bg-purple-600" />
                        </div>
                        <span className="text-sm font-black text-purple-800 mt-1">
                          ₹{Number(msg.data.balances.hiteshbhai || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[9px] text-gray-400 font-semibold">Staff Custody</span>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-emerald-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-emerald-700">Counter</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        </div>
                        <span className="text-sm font-black text-emerald-800 mt-1">
                          ₹{Number(msg.data.balances.counter || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[9px] text-gray-400 font-semibold">Drawer Cash</span>
                      </div>

                      <div className="bg-white p-2 rounded-lg border border-orange-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-orange-700">Bank / UPI</span>
                          <span className="w-2 h-2 rounded-full bg-orange-600" />
                        </div>
                        <span className="text-sm font-black text-orange-800 mt-1">
                          ₹{Number(msg.data.balances.bank || 0).toLocaleString('en-IN')}
                        </span>
                        <span className="text-[9px] text-gray-400 font-semibold">Bank Balance</span>
                      </div>
                    </div>

                    <div className="pt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateTab?.('accounts')
                          onClose()
                        }}
                        className="flex-1 bg-[#131921] hover:bg-black text-white font-bold py-1.5 px-2.5 rounded-lg text-center transition-colors text-[11px]"
                      >
                        Manage Accounts & Handovers ➔
                      </button>
                    </div>
                  </div>
                )}

                {/* 5B. Interactive Staff Order Delivery Reminder Card */}
                {msg.type === 'staff_order_reminder' && msg.data && (() => {
                  const currentReminderText =
                    editingReminderTexts[msg.id] !== undefined
                      ? editingReminderTexts[msg.id]
                      : (msg.data.message || '')
                  const isEditing = Boolean(editingReminderIds[msg.id])
                  const sentStatus = sentOrderReminders[msg.id]
                  const isSendingThis = sendingReminderId === msg.id

                  const handleSendMacroDroidSms = async () => {
                    const daytime = checkIsDayTime()
                    let force = false
                    if (!daytime.isDayTime) {
                      const confirmSend = window.confirm(
                        `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nDaytime is 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send SMS to ${msg.data.assignedStaffName} anyway?`
                      )
                      if (!confirmSend) return
                      force = true
                    }

                    try {
                      setSendingReminderId(msg.id)
                      await sendBackgroundSms({
                        phone: msg.data.staffPhone,
                        message: currentReminderText,
                      })
                      setSentOrderReminders((prev) => ({ ...prev, [msg.id]: 'sms' }))
                      toast.success(
                        `Delivery reminder sent to ${msg.data.assignedStaffName} via MacroDroid! 📲`,
                        { icon: '📲' }
                      )
                    } catch (err) {
                      toast.error('Failed to send SMS: ' + err.message)
                    } finally {
                      setSendingReminderId(null)
                    }
                  }

                  const handleOpenWhatsApp = () => {
                    const cleanPhone = normalizeIndianPhone(msg.data.staffPhone)
                    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(currentReminderText)}`
                    window.open(waUrl, '_blank')
                    setSentOrderReminders((prev) => ({ ...prev, [msg.id]: 'whatsapp' }))
                    toast.success(`Opened WhatsApp for ${msg.data.assignedStaffName}! 💬`, { icon: '💬' })
                  }

                  const handleCopyReminder = () => {
                    navigator.clipboard.writeText(currentReminderText)
                    toast.success('Reminder copied to clipboard! 📋', { icon: '📋' })
                  }

                  return (
                    <div className="mt-2 bg-white border border-amber-300 rounded-lg p-2 text-xs space-y-1.5 shadow-2xs">
                      {/* Compact 1-line reminder bar */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shrink-0 px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-200">
                            📲 Remind {msg.data.assignedStaffName || 'Nilesh'}
                          </span>
                          <span className="font-bold text-gray-900 truncate text-[11px]">
                            {Array.isArray(msg.data.orders) && msg.data.orders.length > 0
                              ? `${msg.data.orders[0].clientName || 'Customer'} (${msg.data.orders[0].qty || 1}x ${msg.data.orders[0].sku || '200ml'}${msg.data.orders.length > 1 ? ` +${msg.data.orders.length - 1}` : ''})`
                              : 'Delivery Reminder'}
                          </span>
                          <span
                            className="shrink-0 text-[10px]"
                            title={msg.data.daytimeCheck?.isDayTime ? 'Safe Daytime' : 'Night Held'}
                          >
                            {msg.data.daytimeCheck?.isDayTime ? '☀️' : '🌙'}
                          </span>
                        </div>

                        {/* Direct action buttons (strictly 2-3 words / icons) */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isSendingThis || msg.data.noOrders}
                            onClick={handleSendMacroDroidSms}
                            aria-label="Send SMS"
                            title="Send SMS via MacroDroid"
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all shadow-2xs flex items-center gap-0.5 cursor-pointer ${
                              sentStatus === 'sms'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white'
                            } ${isSendingThis ? 'opacity-70 cursor-wait' : ''} ${msg.data.noOrders ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isSendingThis ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : sentStatus === 'sms' ? (
                              <CheckCircle2 size={11} />
                            ) : (
                              <Send size={11} />
                            )}
                            <span>{sentStatus === 'sms' ? 'Sent' : 'SMS'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={msg.data.noOrders}
                            onClick={handleOpenWhatsApp}
                            aria-label="WhatsApp"
                            title="Open WhatsApp"
                            className="px-2 py-0.5 rounded text-[11px] font-bold bg-green-600 hover:bg-green-700 text-white transition-colors shadow-2xs flex items-center gap-0.5 cursor-pointer"
                          >
                            <MessageCircle size={11} />
                            <span>WhatsApp</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleCopyReminder}
                            aria-label="Copy message"
                            title="Copy reminder text"
                            className="h-6 w-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Copy size={11} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setEditingReminderIds((prev) => ({
                                ...prev,
                                [msg.id]: !prev[msg.id],
                              }))
                            }
                            aria-label="Edit text"
                            title="Edit text"
                            className="h-6 w-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Edit2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Optional inline text edit area (only shown if user clicks edit) */}
                      {isEditing && (
                        <div className="pt-1.5 border-t border-amber-200/60 space-y-1">
                          <textarea
                            value={currentReminderText}
                            onChange={(e) =>
                              setEditingReminderTexts((prev) => ({
                                ...prev,
                                [msg.id]: e.target.value,
                              }))
                            }
                            rows={2}
                            className="w-full text-[11px] font-sans border border-amber-300 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50/30"
                          />
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 6. Interactive Staff Task Assignment Draft Card (Ultra-compact 2-line card) */}
                {msg.type === 'staff_task_draft' && msg.data && (() => {
                  const currentDraftText =
                    editingDraftTexts[msg.id] !== undefined
                      ? editingDraftTexts[msg.id]
                      : (msg.data.text || '')
                  const isEditingDraft = Boolean(editingDraftIds[msg.id])
                  const draftPreviewMsg = buildNewTaskAssignmentMessage({
                    staffName: msg.data.assignedStaffName,
                    taskText: currentDraftText,
                    dueDateStr: msg.data.targetLabel || 'Today',
                  })

                  return (
                    <div
                      onClick={() => openTaskSecondaryMenu({ ...msg.data, text: currentDraftText })}
                      className="mt-2 bg-white border border-teal-200 hover:border-teal-400 rounded-xl p-2 space-y-1 text-xs text-gray-800 shadow-2xs cursor-pointer transition-all"
                    >
                      {/* Line 1: Staff, Target, Day/Night & Icon-Only Action Buttons */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-black uppercase bg-teal-100 text-teal-800">
                            👤 {msg.data.assignedStaffName}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openTaskSecondaryMenu({ ...msg.data, text: currentDraftText })
                            }}
                            className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-teal-100 hover:bg-teal-200 text-teal-900 border border-teal-300 flex items-center gap-0.5 cursor-pointer"
                            title="Open Staff Task Quick Actions"
                          >
                            ⚡ Actions
                          </button>
                          <span className="shrink-0 text-[10px] text-gray-500 font-semibold">
                            👤 {msg.data.assignedStaffName}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-500 font-semibold">
                            🎯 {msg.data.targetLabel || 'Today'}
                          </span>
                          <span
                            className="shrink-0 text-[10px] cursor-help"
                            title={
                              msg.data.daytimeCheck?.isDayTime
                                ? `☀️ Safe to SMS (${msg.data.daytimeCheck?.istTimeStr || 'IST'})`
                                : `🌙 Night - SMS held (${msg.data.daytimeCheck?.istTimeStr || 'IST'})`
                            }
                          >
                            {msg.data.daytimeCheck?.isDayTime ? '☀️' : '🌙'}
                          </span>
                        </div>

                        {!createdTasks[msg.id] ? (
                          <div className="flex items-center gap-1 shrink-0">
                            {/* WhatsApp */}
                            <button
                              type="button"
                              aria-label="WhatsApp"
                              title="Save & WhatsApp"
                              onClick={async () => {
                                try {
                                  const created = await addStaffJob({
                                    text: currentDraftText,
                                    assignedTo: msg.data.assignedTo,
                                    assignedStaffName: msg.data.assignedStaffName,
                                    staffPhone: msg.data.staffPhone,
                                    dueDate: msg.data.dueDate,
                                    isFollowUp: msg.data.isFollowUp,
                                    sendNotificationSms: false,
                                  })
                                  const waUrl = buildTaskWhatsAppUrl({
                                    staffPhone: msg.data.staffPhone,
                                    message: draftPreviewMsg,
                                  })
                                  if (waUrl) {
                                    window.open(waUrl, '_blank')
                                  }
                                  if (created?.id) {
                                    await recordTaskFollowUpHistory({
                                      taskId: created.id,
                                      staffName: msg.data.assignedStaffName,
                                      message: draftPreviewMsg,
                                      channel: 'whatsapp',
                                      followUpCount: 0,
                                    })
                                  }
                                  setCreatedTasks((prev) => ({ ...prev, [msg.id]: true }))
                                  toast.success(`Task saved & WhatsApp opened for ${msg.data.assignedStaffName}!`, { icon: '💬' })
                                } catch (err) {
                                  toast.error('Failed to assign task: ' + err.message)
                                }
                              }}
                              className="h-6 w-6 rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>

                            {/* SMS */}
                            <button
                              type="button"
                              aria-label="SMS"
                              title="Save & Send SMS"
                              onClick={async () => {
                                const daytime = checkIsDayTime()
                                let force = false
                                if (!daytime.isDayTime) {
                                  const confirmSend = window.confirm(
                                    `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nDaytime is 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send SMS to ${msg.data.assignedStaffName} anyway?`
                                  )
                                  if (!confirmSend) return
                                  force = true
                                }
                                try {
                                  await addStaffJob({
                                    text: currentDraftText,
                                    assignedTo: msg.data.assignedTo,
                                    assignedStaffName: msg.data.assignedStaffName,
                                    staffPhone: msg.data.staffPhone,
                                    dueDate: msg.data.dueDate,
                                    isFollowUp: msg.data.isFollowUp,
                                    sendNotificationSms: true,
                                    forceOutsideDaytime: force,
                                  })
                                  setCreatedTasks((prev) => ({ ...prev, [msg.id]: true }))
                                  toast.success(
                                    `Task assigned & SMS sent to ${msg.data.assignedStaffName}!`,
                                    { icon: '📲' }
                                  )
                                } catch (err) {
                                  toast.error('Failed to assign task: ' + err.message)
                                }
                              }}
                              className="h-6 w-6 rounded bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>

                            {/* Save Only */}
                            <button
                              type="button"
                              aria-label="Save"
                              title="Save to Board"
                              onClick={async () => {
                                try {
                                  await addStaffJob({
                                    text: currentDraftText,
                                    assignedTo: msg.data.assignedTo,
                                    assignedStaffName: msg.data.assignedStaffName,
                                    staffPhone: msg.data.staffPhone,
                                    dueDate: msg.data.dueDate,
                                    isFollowUp: msg.data.isFollowUp,
                                    sendNotificationSms: false,
                                  })
                                  setCreatedTasks((prev) => ({ ...prev, [msg.id]: true }))
                                  toast.success(`Task assigned to ${msg.data.assignedStaffName}!`, { icon: '📋' })
                                } catch (err) {
                                  toast.error('Failed to create task: ' + err.message)
                                }
                              }}
                              className="h-6 w-6 rounded bg-gray-900 hover:bg-black text-white flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                            >
                              <Check className="w-3.5 h-3.5 text-teal-400" />
                            </button>
                          </div>
                        ) : (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Saved
                          </span>
                        )}
                      </div>

                      {/* Line 2: Editable Task Text with Inline Edit Toggle */}
                      {isEditingDraft ? (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <input
                            type="text"
                            value={currentDraftText}
                            onChange={(e) =>
                              setEditingDraftTexts((prev) => ({ ...prev, [msg.id]: e.target.value }))
                            }
                            placeholder="Enter task text..."
                            className="flex-1 px-2 py-0.5 bg-gray-50 rounded border border-teal-300 text-gray-900 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditingDraftIds((prev) => ({ ...prev, [msg.id]: false }))
                            }
                            className="px-2 py-0.5 bg-teal-600 text-white text-[10px] font-bold rounded cursor-pointer transition-colors shrink-0"
                          >
                            ✓ Done
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-gray-900 font-semibold text-xs">
                          <span className="truncate flex-1">"{currentDraftText}"</span>
                          {!createdTasks[msg.id] && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingDraftIds((prev) => ({ ...prev, [msg.id]: true }))
                              }
                              className="text-gray-400 hover:text-teal-600 p-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Edit task text"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 6B. Interactive Customer Message Draft Card */}
                {msg.type === 'client_message_draft' && msg.data && (() => {
                  const currentDraftText =
                    editingDraftTexts[msg.id] !== undefined
                      ? editingDraftTexts[msg.id]
                      : (msg.data.message || '')
                  const isEditingDraft = Boolean(editingDraftIds[msg.id])
                  const isSent = Boolean(sentClientMessages[msg.id])
                  const cleanPhone = normalizeIndianPhone(msg.data.clientPhone)
                  const displayPhone =
                    cleanPhone && cleanPhone.length === 12 && cleanPhone.startsWith('91')
                      ? `+91 ${cleanPhone.slice(2)}`
                      : cleanPhone

                  return (
                    <div className="mt-2 bg-white border border-blue-200 hover:border-blue-400 rounded-xl p-2.5 space-y-1.5 text-xs text-gray-800 shadow-2xs transition-all">
                      {/* Line 1: Customer Name, Phone, and Action Buttons */}
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-black uppercase bg-blue-100 text-blue-800 flex items-center gap-1">
                            <User className="w-3 h-3 text-blue-600" />
                            {msg.data.clientName}
                          </span>
                          <span className="shrink-0 text-[11px] text-gray-500 font-medium">
                            {displayPhone ? displayPhone : 'No phone'}
                          </span>
                        </div>

                        {!isSent ? (
                          <div className="flex items-center gap-1 shrink-0">
                            {/* WhatsApp */}
                            <button
                              type="button"
                              aria-label="WhatsApp Customer"
                              title="Send WhatsApp to Customer"
                              onClick={() => {
                                if (!cleanPhone) {
                                  toast.error('No phone number saved for ' + msg.data.clientName)
                                  return
                                }
                                const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(currentDraftText)}`
                                window.open(waUrl, '_blank')
                                setSentClientMessages((prev) => ({ ...prev, [msg.id]: true }))
                                toast.success(`WhatsApp opened for ${msg.data.clientName}!`, { icon: '💬' })
                              }}
                              className="h-7 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </button>

                            {/* Direct SMS */}
                            <button
                              type="button"
                              aria-label="SMS Customer"
                              title="Send Direct SMS to Customer"
                              onClick={async () => {
                                if (!cleanPhone) {
                                  toast.error('No mobile number for ' + msg.data.clientName)
                                  return
                                }
                                try {
                                  await sendBackgroundSms({
                                    phone: cleanPhone,
                                    message: currentDraftText,
                                  })
                                  setSentClientMessages((prev) => ({ ...prev, [msg.id]: true }))
                                  toast.success(`SMS sent to ${msg.data.clientName}!`, { icon: '📲' })
                                } catch (smsErr) {
                                  toast.error('Failed to send SMS: ' + smsErr.message)
                                }
                              }}
                              className="h-7 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 text-[11px] font-bold transition-colors cursor-pointer shadow-2xs"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>SMS</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✓ Message Sent
                          </span>
                        )}
                      </div>

                      {/* Line 2: Message Quote or Inline Edit */}
                      {isEditingDraft ? (
                        <div className="flex items-center gap-1 pt-1">
                          <input
                            type="text"
                            value={currentDraftText}
                            onChange={(e) =>
                              setEditingDraftTexts((prev) => ({ ...prev, [msg.id]: e.target.value }))
                            }
                            className="flex-1 px-2 py-1 bg-gray-50 rounded border border-blue-300 text-gray-900 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEditingDraftIds((prev) => ({ ...prev, [msg.id]: false }))
                            }
                            className="px-2.5 py-1 bg-blue-600 text-white text-[10px] font-bold rounded cursor-pointer transition-colors shrink-0"
                          >
                            ✓ Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1.5 pt-0.5 text-gray-900 font-medium text-xs bg-gray-50/70 p-1.5 rounded-lg border border-gray-100">
                          <span className="truncate flex-1 italic text-gray-700">"{currentDraftText}"</span>
                          {!isSent && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingDraftIds((prev) => ({ ...prev, [msg.id]: true }))
                              }
                              className="text-gray-400 hover:text-blue-600 p-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Edit message draft"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 7. Interactive Staff Tasks List & Follow-ups Card (Ultra-compact 2-line cards, icon-only) */}
                {msg.type === 'staff_tasks_list' && msg.data && (
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-2 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between border-b border-gray-200/80 pb-1 px-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-gray-900 text-xs">
                          📋 Staff Tasks ({msg.data.tasks?.length || 0})
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-cyan-100 text-cyan-800">
                          {msg.data.filterName || 'All'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateTab?.('tasks')
                          onClose()
                        }}
                        className="text-[10px] font-bold text-cyan-700 hover:text-cyan-900 flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>Board</span> ➔
                      </button>
                    </div>

                    {msg.data.tasks?.length === 0 ? (
                      <div className="text-center py-2 text-gray-500 text-xs italic bg-white rounded-lg border border-dashed border-gray-200">
                        No active tasks. Tap below to assign a new task.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {msg.data.tasks.map((task) => {
                          const staffName = task.assignedStaffName || (task.assignedTo === 'hiteshbhai' ? 'Hiteshbhai' : 'Nilesh')
                          const staffPhone = task.staffPhone || (task.assignedTo === 'hiteshbhai' ? '7778077617' : '7990943652')
                          const followCount = Number(task.followUpCount || 0)
                          const isDone = task.stage === 'complete' || task.stage === 'archived'

                          return (
                            <div
                              key={task.id}
                              onClick={() => openTaskSecondaryMenu(task)}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isDone
                                  ? 'bg-gray-100 border-gray-200 opacity-60'
                                  : 'bg-white border-gray-200 shadow-2xs hover:border-amber-400'
                              }`}
                            >
                              {/* Line 1: Staff Badge, Truncated Task Text, Due Date & Follow-up Count */}
                              <div className="flex items-center justify-between gap-1.5 min-w-0">
                                <span className={`shrink-0 px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                                  task.assignedTo === 'hiteshbhai'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  👤 {staffName}
                                </span>
                                <span className="truncate flex-1 font-bold text-xs text-gray-900" title={task.text}>
                                  {task.text}
                                </span>
                                <span className="shrink-0 text-[10px] text-gray-400 font-medium">
                                  🎯 {task.dueDate?.toDate ? task.dueDate.toDate().toLocaleDateString('en-IN') : 'Active'}
                                </span>
                                {followCount > 0 && (
                                  <span className="shrink-0 px-1 py-0.2 rounded text-[9px] font-black bg-teal-100 text-teal-800" title={`Follow-ups: ${followCount}`}>
                                    🔔{followCount}
                                  </span>
                                )}
                              </div>

                              {/* Line 2: Icon-Only Action Buttons in One Horizontal Line */}
                              <div className="flex items-center justify-end gap-1.5 pt-1">
                                {/* 1. WhatsApp Follow-up */}
                                <button
                                  type="button"
                                  disabled={isDone}
                                  aria-label="WhatsApp"
                                  title={`WhatsApp ${staffName}`}
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const waMsg = buildHumanLikeFollowUpMessage({
                                      staffName,
                                      taskText: task.text,
                                      followUpCount: followCount,
                                    })
                                    const waUrl = buildTaskWhatsAppUrl({
                                      staffPhone,
                                      message: waMsg,
                                    })
                                    if (waUrl) {
                                      window.open(waUrl, '_blank')
                                    }
                                    await recordTaskFollowUpHistory({
                                      taskId: task.id,
                                      staffName,
                                      message: waMsg,
                                      channel: 'whatsapp',
                                      followUpCount: followCount,
                                    })
                                    setSentFollowUps((prev) => ({
                                      ...prev,
                                      [task.id]: (prev[task.id] || followCount) + 1,
                                    }))
                                    toast.success(`💬 WhatsApp opened for ${staffName}!`, { icon: '✅' })
                                    setMessages((prev) => [
                                      ...prev,
                                      {
                                        id: 'asst-' + Date.now(),
                                        sender: 'assistant',
                                        text: `💬 **WhatsApp to ${staffName}** (📞 ${staffPhone}):\n_"${waMsg}"_`,
                                        timestamp: new Date(),
                                      },
                                    ])
                                  }}
                                  className="h-6 w-6 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>

                                {/* 2. SMS Follow-up */}
                                <button
                                  type="button"
                                  disabled={isDone || sendingFollowUpId === task.id}
                                  aria-label="SMS Follow-up"
                                  title={
                                    sendingFollowUpId === task.id
                                      ? 'Sending...'
                                      : `SMS Follow-up${followCount > 0 ? ` (#${followCount + 1})` : ''}`
                                  }
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    const daytime = checkIsDayTime()
                                    let force = false
                                    if (!daytime.isDayTime) {
                                      const confirmSend = window.confirm(
                                        `⚠️ Outside Daytime Hours (${daytime.istTimeStr})\n\nDaytime working hours are 9:00 AM – 8:00 PM IST to avoid disturbing staff at night.\n\nDo you want to send follow-up SMS to ${staffName} anyway?`
                                      )
                                      if (!confirmSend) return
                                      force = true
                                    }

                                    setSendingFollowUpId(task.id)
                                    try {
                                      const res = await sendStaffJobFollowUp({
                                        taskId: task.id,
                                        staffName,
                                        staffPhone,
                                        taskText: task.text,
                                        followUpCount: followCount,
                                        forceOutsideDaytime: force,
                                      })
                                      setSentFollowUps((prev) => ({
                                        ...prev,
                                        [task.id]: (prev[task.id] || followCount) + 1,
                                      }))
                                      toast.success(
                                        `📲 Follow-up SMS #${res.followUpCount} sent to ${staffName}!`,
                                        { icon: '✅' }
                                      )
                                      setMessages((prev) => [
                                        ...prev,
                                        {
                                          id: 'asst-' + Date.now(),
                                          sender: 'assistant',
                                          text: `📲 **Follow-up SMS Sent to ${staffName}** (📞 ${staffPhone}):\n_"${res.message}"_\n\n• **Follow-up Count**: #${res.followUpCount}\n• **Time**: ${res.istTime} (${daytime.isDayTime ? '☀️ Daytime' : '🌙 Night (Overridden)'})`,
                                          timestamp: new Date(),
                                        },
                                      ])
                                    } catch (err) {
                                      toast.error('Failed to send follow-up SMS: ' + err.message)
                                    } finally {
                                      setSendingFollowUpId(null)
                                    }
                                  }}
                                  className="h-6 w-6 rounded bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>

                                {/* 3. Mark Complete */}
                                <button
                                  type="button"
                                  disabled={isDone}
                                  aria-label="Mark Done"
                                  title="Mark Completed"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      await updateStaffJobStage(task.id, 'complete')
                                      toast.success('Task marked completed!')
                                    } catch (err) {
                                      toast.error('Failed to update: ' + err.message)
                                    }
                                  }}
                                  className="h-6 w-6 rounded bg-gray-100 hover:bg-green-100 border border-gray-200 hover:border-green-300 text-gray-700 hover:text-green-700 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>

                                {/* 4. Add Follow-up Task */}
                                <button
                                  type="button"
                                  aria-label="Add Follow-up"
                                  title="Add Follow-up Task"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setInputMessage(`Follow up task for ${staffName}: ${task.text}`)
                                    inputRef.current?.focus()
                                  }}
                                  className="h-6 w-6 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tiny Thumbs Down Button on Assistant Output */}
                {msg.sender === 'assistant' && (
                  <div className="mt-2 pt-1 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                    <span className="truncate pr-1 text-[9px] text-gray-400">
                      {msg.modelUsed ? `⚡ ${msg.modelUsed}` : ''}
                    </span>
                    <button
                      type="button"
                      aria-label="Report Bad Output"
                      title="Record this output as bad output (Thumbs Down) to Firebase"
                      disabled={reportedBadOutputs[msg.id || msg.timestamp]}
                      onClick={() => handleReportBadOutput(msg)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        reportedBadOutputs[msg.id || msg.timestamp]
                          ? 'bg-red-50 text-red-600 border border-red-200 cursor-default'
                          : 'text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 active:scale-95'
                      }`}
                    >
                      <ThumbsDown className="w-3 h-3" />
                      <span>{reportedBadOutputs[msg.id || msg.timestamp] ? 'Reported 👎' : 'Bad output'}</span>
                    </button>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          )))}

          {loading && (
            <div className="flex gap-2.5 items-center text-gray-500 text-xs italic pl-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#ff9900]" />
              <span>Analyzing bill with {aiSettings?.activeModel || 'Gemini Flash Lite'}...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-gray-200 shrink-0 relative">
          {/* File Preview Pill if selected */}
          {filePreview && (
            <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedFile?.isAudio ? (
                    <div className="w-9 h-9 rounded-lg bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Volume2 className="w-5 h-5 animate-pulse" />
                    </div>
                  ) : (
                    <img
                      src={filePreview}
                      alt="Selected bill"
                      className="w-9 h-9 rounded object-cover border border-orange-300 shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate max-w-[200px]">
                      {selectedFile?.fileName}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedFile?.isAudio ? 'Audio Note' : 'Photo'} ({selectedFile?.sizeKb} KB)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    setFilePreview(null)
                    setIsClientMode(false)
                    setIsSalesMode(false)
                    setIsPaymentMode(false)
                    setIsAccountsMode(false)
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick multi-selection mode selector for photo */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-orange-200/70">
                <span className="text-[10px] font-semibold text-gray-500 shrink-0">Scan photo as:</span>
                <button
                  type="button"
                  onClick={() => setIsClientMode((prev) => !prev)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    isClientMode
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-500'
                  }`}
                  aria-pressed={isClientMode}
                >
                  {isClientMode && <Check className="w-3 h-3" />}
                  <span>👤 Client</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSalesMode((prev) => !prev)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    isSalesMode
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-emerald-600'
                  }`}
                  aria-pressed={isSalesMode}
                >
                  {isSalesMode && <Check className="w-3 h-3" />}
                  <span>🛒 Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentMode((prev) => !prev)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    isPaymentMode
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-emerald-700'
                  }`}
                  aria-pressed={isPaymentMode}
                >
                  {isPaymentMode && <Check className="w-3 h-3" />}
                  <span>💰 Payment</span>
                </button>
              </div>
            </div>
          )}


          {/* Autocomplete Dropdown for @Client */}
          {matchingClients.length > 0 && (
            <div className="absolute bottom-full mb-1.5 left-3 right-3 z-30 max-h-52 overflow-y-auto bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-xl divide-y divide-gray-100">
              <div className="px-2.5 py-1 bg-gray-50 text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wider">
                <AtSign className="w-3 h-3 text-[#ff9900]" /> Clients
              </div>
              {matchingClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectClient(c)}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50/70 flex items-center justify-between gap-2 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-orange-100 text-amz-orange font-bold text-xs flex items-center justify-center shrink-0 group-hover:bg-[#131921] group-hover:text-[#ff9900] transition-colors">
                      {c.name?.[0]?.toUpperCase() || 'C'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{c.name}</p>
                      {c.area && (
                        <p className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate">
                          <MapPin className="w-2.5 h-2.5 shrink-0 text-gray-400" />
                          {c.area}
                        </p>
                      )}
                    </div>
                  </div>
                  {c.defaultRate > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                      ₹{c.defaultRate}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Autocomplete Dropdown for /SKU */}
          {matchingSkus.length > 0 && (
            <div className="absolute bottom-full mb-1.5 left-3 right-3 z-30 max-h-52 overflow-y-auto bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-xl divide-y divide-gray-100">
              <div className="px-2.5 py-1 bg-gray-50 text-[10px] font-bold text-gray-400 flex items-center justify-between gap-1 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3 text-emerald-600" /> Products & SKUs
                </div>
                <span className="text-[9px] text-gray-400 font-semibold lowercase">tap to insert</span>
              </div>
              {matchingSkus.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => handleSelectSku(sku)}
                  className="w-full text-left px-3 py-2 hover:bg-emerald-50/70 flex items-center justify-between gap-2 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0 group-hover:bg-[#131921] group-hover:text-emerald-400 transition-colors">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{sku.label || sku.name}</p>
                      <p className="text-[10px] text-gray-400">{sku.category || `${sku.brand} • ${sku.unit}`}</p>
                    </div>
                  </div>
                  {sku.price > 0 ? (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                      ₹{sku.price}
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-gray-400 shrink-0">
                      Standard
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Quick Client suggestion chips */}
          {quickClientSuggestions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-1 scrollbar-none">
              {quickClientSuggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectClient(c)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-orange-100 text-gray-700 hover:text-orange-900 rounded-full text-xs font-semibold shrink-0 cursor-pointer border border-gray-200 transition-colors"
                >
                  <User className="w-3 h-3 text-[#ff9900]" />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex items-end gap-1.5"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,audio/*,.ogg,.opus,.mp3,.m4a,.wav"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-gray-500 hover:text-amz-orange hover:bg-orange-50 rounded-lg border border-gray-300 transition-colors shrink-0 cursor-pointer mb-1"
              title="Upload Bill, Receipt or WhatsApp Voice Note"
            >
              <Camera className="w-4 h-4" />
            </button>

            {/* Mic & Speech Language Control */}
            <div className="relative shrink-0 flex items-center mb-1" ref={speechLangMenuRef}>
              <button
                type="button"
                onClick={toggleMic}
                className={`p-1.5 rounded-l-lg border border-r-0 transition-colors shrink-0 cursor-pointer ${
                  isListening
                    ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-md'
                    : 'text-gray-500 hover:text-amz-orange hover:bg-orange-50 border-gray-300'
                }`}
                title={
                  isListening
                    ? `Listening in ${SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.label || 'Voice'}... Tap to stop`
                    : `Voice Dictation (${SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.label || 'English'})`
                }
                aria-label={isListening ? 'Stop voice listening' : 'Start voice dictation'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowLangMenu((prev) => !prev)}
                className={`h-[33px] px-1 rounded-r-lg border text-[9px] font-black tracking-tight transition-colors cursor-pointer flex items-center gap-0.5 shrink-0 ${
                  isListening
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 hover:text-gray-900 border-gray-300'
                }`}
                title={`Active speech language: ${SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.label || 'English'}. Tap to switch language.`}
                aria-label="Switch speech language"
              >
                <span>{SPEECH_LANGUAGES.find((l) => l.code === speechLang)?.short || 'EN'}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>

              {/* Language Dropdown Menu */}
              {showLangMenu && (
                <div className="absolute bottom-full mb-2 left-0 z-40 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-44 text-xs divide-y divide-gray-100 animate-in fade-in slide-in-from-bottom-2">
                  <div className="px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Voice Language
                  </div>
                  {SPEECH_LANGUAGES.map((lang) => {
                    const isSelected = speechLang === lang.code
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleSelectSpeechLang(lang.code)}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-orange-50 text-amz-orange font-bold'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black">{lang.label}</span>
                            <span className="text-[10px] px-1 rounded bg-gray-100 text-gray-500 font-semibold">
                              {lang.short}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400">{lang.hint}</div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amz-orange shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <textarea
              ref={inputRef}
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) {
                  e.preventDefault()
                  if (!loading && (inputMessage.trim() || selectedFile)) {
                    handleSend()
                  }
                }
              }}
              placeholder={
                activeChatbotFlow?.inputPrompt
                  ? activeChatbotFlow.inputPrompt
                  : isListening
                    ? speechLang === 'gu-IN'
                      ? 'સાંભળી રહ્યું છે... ગુજરાતીમાં બોલો'
                      : speechLang === 'hi-IN'
                        ? 'सुन रहे हैं... हिंदी में बोलें'
                        : 'Listening in English... Speak now'
                    : isPaymentMode
                      ? 'Payment (e.g. Received 2000 from @Royal...)'
                      : isClientMode
                        ? 'New client (e.g. Shiv Dhaba, Manjalpur, 98250...)'
                        : isSalesMode
                          ? 'Sales order (e.g. @Client /SKU or voice...)'
                          : isAccountsMode
                            ? 'Cash handover / custody entry...'
                            : filePreview
                              ? 'Add notes or send...'
                              : 'Ask bot above, type @client, /sku, or speech...'
              }
              style={{ minHeight: '42px', height: 'auto' }}
              className={`flex-1 py-2 px-3 border-2 rounded-xl text-xs sm:text-sm outline-none transition-all resize-none max-h-36 overflow-y-auto leading-relaxed ${
                isPaymentMode
                  ? 'border-emerald-600 ring-2 ring-emerald-200/70 bg-emerald-50/20'
                  : isClientMode
                    ? 'border-orange-500 ring-2 ring-orange-200/70 bg-orange-50/20'
                    : isSalesMode
                      ? 'border-emerald-500 ring-2 ring-emerald-200/60 bg-emerald-50/20'
                      : isAccountsMode
                        ? 'border-blue-500 ring-2 ring-blue-200/60 bg-blue-50/20'
                        : 'border-gray-300 focus:ring-2 focus:ring-[#ff9900] focus:border-[#ff9900]'
              }`}
            />

            <button
              type="submit"
              disabled={loading || (!inputMessage.trim() && !selectedFile)}
              className="p-2 bg-[#131921] hover:bg-black text-[#ff9900] disabled:opacity-40 rounded-xl transition-all font-bold cursor-pointer shrink-0 mb-1"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* WhatsApp Banking Secondary Action Sheet */}
      <CardActionSheet
        isOpen={Boolean(activeCardSheet)}
        onClose={() => setActiveCardSheet(null)}
        title={activeCardSheet?.title || 'Card Actions'}
        subtitle={activeCardSheet?.subtitle || ''}
        itemSummary={activeCardSheet?.itemSummary || null}
        actions={activeCardSheet?.actions || []}
      />
    </div>
  )
}
