import { useState, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import toast from 'react-hot-toast'
import { app } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { WATER_SKUS } from '../constants/skus'
import { getAccountMeta } from '../constants/accounts'
import { processAiBillImage } from '../utils/aiImageHelper'
import { tryLocalIntentRoute } from '../utils/aiIntentRouter'
import { consolidateRetailSales } from '../utils/salesBatchUtils'
import { ensureEnglishText, sanitizeClientForEnglish } from '../utils/textUtils'

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenPaymentModal,
  onOpenOrderModal,
  onOpenAddClient,
}) {
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)
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
  const addClient = useClientStore((state) => state.addClient)
  const addPayment = useClientStore((state) => state.addPayment)
  const addOrder = useClientStore((state) => state.addOrder)
  const aiSettings = useClientStore((state) => state.aiSettings)
  const aiPrefillPrompt = useClientStore((state) => state.aiPrefillPrompt)

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

  const [messages, setMessages] = useState([])

  const [isListening, setIsListening] = useState(false)
  const [speechLang, setSpeechLang] = useState('gu-IN')
  const recognitionRef = useRef(null)

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

  const toggleMic = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      toast.error('Voice input is not supported in this browser. Please use Chrome/Edge.')
      return
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
      setIsListening(false)
      return
    }

    try {
      const recognition = new SpeechRec()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = speechLang

      recognition.onstart = () => {
        setIsListening(true)
        toast('Listening... Speak now', { icon: '🎙️', id: 'voice-rec', duration: 2500 })
      }

      recognition.onresult = (event) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        if (transcript) {
          setInputMessage((prev) => {
            const clean = prev.trim()
            return clean ? `${clean} ${transcript}` : transcript
          })
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

  useEffect(() => {
    if (aiPrefillPrompt) {
      setInputMessage(aiPrefillPrompt)
    }
  }, [aiPrefillPrompt])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (!isOpen) return null

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

  const matchingSkus = slashMatch
    ? WATER_SKUS.filter((s) => {
        const q = slashMatch[1].trim().toLowerCase()
        if (!q) return true
        return (
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
        )
      }).slice(0, 5)
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
    if (slashMatch) {
      setInputMessage(inputMessage.replace(/\/([a-zA-Z0-9\s]*)$/, sku.name + ' '))
    } else {
      setInputMessage((prev) => (prev ? `${prev.trim()} ${sku.name} ` : `${sku.name} `))
    }
    inputRef.current?.focus()
  }

  const handleSend = async (customPrompt = null) => {
    const query = (customPrompt || inputMessage).trim()
    const filePayload = selectedFile
    const isSales = isSalesMode
    const isPayment = isPaymentMode
    const isClient = isClientMode
    const isAccounts = isAccountsMode

    if (!query && !filePayload) return

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
              : isSales
                ? 'Uploaded retail sales notepad slip 📝'
                : isPayment
                  ? 'Uploaded payment slip / UPI screenshot 💰'
                  : isClient
                    ? 'Uploaded client visiting card / bill book 👤'
                    : isAccounts
                      ? 'Uploaded staff cash / accounts note 💼'
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

    // 1. Zero-Token Local Intent Check (Only if no file is uploaded and not in explicit multi-line sales mode)
    if (!filePayload && query && !isSales && !isAccounts) {
      const localRoute = tryLocalIntentRoute(query, {
        stockSummary,
        stockTotal,
        stockEntries,
        orders,
        clients,
        isClientMode: isClient,
        isPaymentMode: isPayment,
        isSalesMode: isSales,
      })

      if (localRoute && localRoute.handled) {
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: localRoute.text,
            type: localRoute.type,
            data: localRoute.data,
            isLocal: true,
            timestamp: new Date(),
          },
        ])
        return
      }
    }

    // 2. Call Cloud AI Function (Multimodal OCR or free-form NLP)
    setLoading(true)
    try {
      const functions = getFunctions(app, 'asia-south1')
      const askAnjaniAi = httpsCallable(functions, 'askAnjaniAi')

      const response = await askAnjaniAi({
        text:
          query ||
          (filePayload
            ? filePayload.isAudio
              ? 'Transcribe and extract orders, payments, or client details from this voice note'
              : isSales
                ? 'Parse these daily retail customer sales orders'
                : isPayment
                  ? 'Extract payment details from this UPI screenshot or receipt'
                  : isClient
                    ? 'Extract new client name, mobile, and address from this customer bill book, estimate book, or visiting card'
                    : isAccounts
                      ? 'Parse these staff cash custody, handover, or route expense entries'
                      : 'Scan this document and extract all water SKUs'
            : ''),
        imageBase64: filePayload?.base64 || null,
        mimeType: filePayload?.mimeType || 'image/jpeg',
        mode: isClient
          ? 'create_client'
          : isPayment
            ? 'receive_payment'
            : isAccounts
              ? 'accounts_cash'
              : isSales
                ? 'retail_sales'
                : 'auto',
        conversationHistory: messages.slice(-3).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      })

      const resData = response.data || {}

      if (resData.type === 'create_client') {
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
        const matched = clients.find(
          (c) =>
            c.name?.toLowerCase().includes((payData.payerName || '').toLowerCase().trim()) ||
            (payData.payerName || '').toLowerCase().includes(c.name?.toLowerCase().trim()),
        )
        setMessages((prev) => [
          ...prev,
          {
            id: 'asst-' + Date.now(),
            sender: 'assistant',
            text: `💰 **Payment Receipt Detected: ₹${Number(payData.amount || 0).toLocaleString('en-IN')}**\nReview transaction and tap **Confirm & Record Payment**:`,
            type: 'receive_payment',
            paymentId: 'pay-' + Date.now(),
            data: {
              payerName: payData.payerName || '',
              clientId: matched?.id || '',
              clientName: matched?.name || payData.payerName || 'Select Client',
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

        const enrichedSales = consolidateRetailSales(rawSales, clients)
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

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#131921] text-white px-3.5 py-2 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#ff9900]/20 flex items-center justify-center text-[#ff9900]">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-bold text-sm text-white">Anjani AI Assistant</h2>
          </div>
          <div className="flex items-center gap-1">
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

        {/* Quick Action Icon Buttons (Compact, Icon-Only, Strict Sequence: Order -> Payment -> Client -> Remaining) */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-1 shrink-0">
          {/* 1. Order Creation & Sales */}
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
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              isSalesMode
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-600 hover:text-emerald-600 hover:bg-emerald-50/50'
            }`}
            title="1. Order Creation & Daily Sales (Camera / Text)"
            aria-label="Order Creation"
          >
            <ClipboardList className={`w-4 h-4 ${isSalesMode ? 'text-white' : 'text-emerald-600'}`} />
          </button>

          {/* 2. Receive Payment */}
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
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              isPaymentMode
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-700 hover:text-emerald-700 hover:bg-emerald-50/50'
            }`}
            title="2. Receive Payment / Scan UPI Slip (Camera / Text)"
            aria-label="Receive Payment"
          >
            <IndianRupee className={`w-4 h-4 ${isPaymentMode ? 'text-white' : 'text-emerald-700'}`} />
          </button>

          {/* 3. Add Client */}
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
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              isClientMode
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-amz-orange hover:text-amz-orange hover:bg-orange-50/50'
            }`}
            title="3. Add New Client / Visiting Card Scan (Camera / Text)"
            aria-label="Add Client"
          >
            <UserPlus className={`w-4 h-4 ${isClientMode ? 'text-white' : 'text-amz-orange'}`} />
          </button>

          {/* 4. Camera OCR: Scan Photo / Slip */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 bg-white border border-gray-200 hover:border-amz-orange hover:bg-orange-50/50 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="Scan Photo (Vendor Bill / UPI Screenshot / Visiting Card / Sales Slip)"
            aria-label="Scan Photo"
          >
            <Camera className="w-4 h-4 text-gray-700" />
          </button>

          {/* 5. Accounts & Staff Cash */}
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
            className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              isAccountsMode
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:border-blue-600 hover:text-blue-600 hover:bg-blue-50/50'
            }`}
            title="Accounts & Staff Cash (Handovers, Collections, Expenses)"
            aria-label="Accounts & Staff Cash"
          >
            <ArrowRightLeft className={`w-4 h-4 ${isAccountsMode ? 'text-white' : 'text-blue-600'}`} />
          </button>

          {/* 6. Current Stock */}
          <button
            type="button"
            onClick={() => handleSend('Current stock')}
            className="w-9 h-9 bg-white border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50/50 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="Check Warehouse Stock"
            aria-label="Current Stock"
          >
            <Package className="w-4 h-4 text-indigo-600" />
          </button>

          {/* 7. Today Deliveries */}
          <button
            type="button"
            onClick={() => handleSend('Pending orders today')}
            className="w-9 h-9 bg-white border border-gray-200 hover:border-cyan-600 hover:bg-cyan-50/50 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="Today's Pending Deliveries"
            aria-label="Today Deliveries"
          >
            <Truck className="w-4 h-4 text-cyan-600" />
          </button>

          {/* 8. Outstanding Dues */}
          <button
            type="button"
            onClick={() => handleSend('Outstanding balances')}
            className="w-9 h-9 bg-white border border-gray-200 hover:border-purple-500 hover:bg-purple-50/50 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            title="Customer Outstanding Dues"
            aria-label="Outstanding Balances"
          >
            <CreditCard className="w-4 h-4 text-purple-600" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-400 select-none space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-orange-200 text-amz-orange flex items-center justify-center shadow-2xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">Anjani AI Operations Assistant</p>
                <p className="text-[11px] text-gray-500 max-w-xs mt-0.5">
                  Natural language & camera OCR for orders, payments, clients & stock.
                </p>
              </div>

              {/* Suggestions in sequence: Order creation -> Payments -> Clients -> Remaining */}
              <div className="w-full max-w-sm flex flex-col gap-1.5 pt-1 text-left">
                <button
                  type="button"
                  onClick={() => {
                    setIsSalesMode(true)
                    setIsPaymentMode(false)
                    setIsClientMode(false)
                    setIsAccountsMode(false)
                    setTimeout(() => inputRef.current?.focus(), 50)
                  }}
                  className="p-2.5 bg-white border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/40 rounded-xl text-xs text-gray-700 flex items-center gap-2.5 transition-all shadow-2xs cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-[10px]">1</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-tight">Order Creation / Daily Sales</p>
                    <p className="text-[11px] text-gray-500 truncate">Paste WhatsApp notes or snap order diary</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsPaymentMode(true)
                    setIsSalesMode(false)
                    setIsClientMode(false)
                    setIsAccountsMode(false)
                    setTimeout(() => inputRef.current?.focus(), 50)
                  }}
                  className="p-2.5 bg-white border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/40 rounded-xl text-xs text-gray-700 flex items-center gap-2.5 transition-all shadow-2xs cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 font-bold text-[10px]">2</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-tight">Receive Payment</p>
                    <p className="text-[11px] text-gray-500 truncate">Type "Received 1500 from ..." or snap UPI screenshot</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsClientMode(true)
                    setIsSalesMode(false)
                    setIsPaymentMode(false)
                    setIsAccountsMode(false)
                    setTimeout(() => inputRef.current?.focus(), 50)
                  }}
                  className="p-2.5 bg-white border border-gray-200 hover:border-orange-500 hover:bg-orange-50/40 rounded-xl text-xs text-gray-700 flex items-center gap-2.5 transition-all shadow-2xs cursor-pointer"
                >
                  <span className="w-5 h-5 rounded-md bg-orange-100 text-amz-orange flex items-center justify-center shrink-0 font-bold text-[10px]">3</span>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-tight">Add New Client</p>
                    <p className="text-[11px] text-gray-500 truncate">Type client name, mobile & address or snap visiting card</p>
                  </div>
                </button>

                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleSend('Current stock')}
                    className="p-2 bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-xl text-xs text-gray-700 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Package className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="font-semibold truncate">Current Stock</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSend('Pending orders today')}
                    className="p-2 bg-white border border-gray-200 hover:border-cyan-500 hover:bg-cyan-50/40 rounded-xl text-xs text-gray-700 flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span className="font-semibold truncate">Today's Orders</span>
                  </button>
                </div>
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
                <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                  {msg.text}
                </div>

                {/* Local vs Cloud tag */}
                {msg.isLocal && (
                  <span className="inline-block mt-1 text-[10px] text-emerald-600 font-semibold">
                    ⚡ Instant Local Cache (0 Tokens)
                  </span>
                )}

                {/* 1. Interactive Order Draft Card */}
                {msg.type === 'order_draft' && msg.data && (
                  <div className="mt-3 bg-white border border-gray-300 rounded-xl p-3.5 space-y-3 text-xs text-gray-800 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">Order Draft</p>
                          <p className="text-[11px] text-gray-500">For {msg.data.clientName || 'Customer'}</p>
                        </div>
                      </div>
                      {placedOrders[msg.id] ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
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

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={placedOrders[msg.id]}
                        onClick={async () => {
                          try {
                            await addOrder({
                              clientId: msg.data.clientId,
                              clientName: msg.data.clientName,
                              mobile: msg.data.mobile,
                              location: msg.data.location,
                              items: msg.data.items,
                              totalQty: msg.data.totalQty,
                              totalAmount: msg.data.totalAmount,
                              status: 'Pending',
                              date: msg.data.date,
                            })
                            setPlacedOrders((prev) => ({ ...prev, [msg.id]: true }))
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
                          onClick={() => onOpenOrderModal(msg.data)}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer"
                        >
                          Open Form
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. Interactive Payment Receipt Card */}
                {msg.type === 'receive_payment' && msg.data && (
                  <div className="mt-3 bg-white border border-gray-300 rounded-xl p-3.5 space-y-3 text-xs text-gray-800 shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          <IndianRupee className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">Payment Receipt</p>
                          <p className="text-[11px] text-gray-500">{msg.data.onlineProvider || 'UPI / Cash Payment'}</p>
                        </div>
                      </div>
                      {recordedPayments[msg.paymentId || msg.id] ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Recorded
                        </span>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={
                          recordedPayments[msg.paymentId || msg.id] ||
                          !msg.data.clientId ||
                          Number(msg.data.amount) <= 0
                        }
                        onClick={async () => {
                          try {
                            await addPayment({
                              clientId: msg.data.clientId,
                              amount: Number(msg.data.amount),
                              type: 'payment',
                              method: msg.data.method || 'online',
                              accountId:
                                msg.data.accountId ||
                                (msg.data.method === 'cash' ? 'counter' : 'bank'),
                              note: msg.data.utr ? `UPI Ref: ${msg.data.utr}` : 'AI recorded payment',
                              date: new Date(),
                            })
                            setRecordedPayments((prev) => ({
                              ...prev,
                              [msg.paymentId || msg.id]: true,
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
                          onClick={() => onOpenPaymentModal(msg.data)}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer"
                        >
                          Open Form
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

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={createdClients[msg.clientId || msg.id] || !msg.data.name}
                        onClick={async () => {
                          try {
                            const sanitized = sanitizeClientForEnglish(msg.data)
                            await addClient({
                              name: sanitized.name,
                              mobile: sanitized.mobile,
                              address: sanitized.address,
                              location: sanitized.location || sanitized.address,
                              rate: Number(sanitized.rate) || 0,
                            })
                            setCreatedClients((prev) => ({
                              ...prev,
                              [msg.clientId || msg.id]: true,
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

                      {onOpenAddClient && (
                        <button
                          type="button"
                          onClick={() => onOpenAddClient(sanitizeClientForEnglish(msg.data))}
                          className="py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors text-xs cursor-pointer"
                        >
                          Open Form
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
                                className="bg-white p-2 rounded-xl border border-gray-100 shadow-2xs space-y-1.5"
                              >
                                {/* Customer Header */}
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0">
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
                                  {!isBatchDone && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRetailSale(msg.id, sIdx)}
                                      className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                                      title="Remove"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

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
                                          <span className="text-[10px] text-gray-500 font-semibold">
                                            {it.qty} {it.unit || 'cs'} {it.rate > 0 ? `@ ₹${it.rate}` : ''}
                                            {lineTotal > 0 ? ` = ₹${lineTotal.toLocaleString('en-IN')}` : ''}
                                          </span>
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
                    </div>
                  )
                })()}

                {/* 1.5 Interactive Staff Cash & Accounts Entries Card */}
                {msg.type === 'accounts_cash' && msg.data && (() => {
                  const entries = msg.data.entries || []
                  const totalAmt = entries.reduce((s, e) => s + Number(e.amount || 0), 0)
                  const isBatchDone = processedSalesBatches[msg.id]

                  return (
                    <div className="mt-2.5 bg-white border border-blue-200 rounded-2xl p-2.5 space-y-2 text-xs shadow-xs">
                      {/* Top Header with 1-Tap Confirm */}
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="p-1 rounded-lg bg-blue-50 text-blue-600 font-black">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <span className="text-[11px] font-black uppercase text-gray-800 tracking-tight">
                              Accounts & Staff Cash
                            </span>
                            <span className="text-[10px] text-gray-500 font-bold ml-1.5">
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

                {/* 3. Interactive Pending Orders Card */}
                {msg.type === 'orders_list' && msg.data?.orders?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {msg.data.orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">
                            {ord.clientName || ord.name || 'Customer'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 uppercase">
                            {ord.status || 'Pending'}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600">
                          📦 {ord.qty}x {ord.sku || ord.product || 'Anjani 200ml'} • ⏰{' '}
                          {ord.time || 'Today'}
                        </p>
                        {ord.address && (
                          <p className="text-[10px] text-gray-500 truncate">📍 {ord.address}</p>
                        )}
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() => handleDeliverOrder(ord)}
                            className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold py-1 px-2 rounded text-[11px] transition-colors"
                          >
                            Mark Delivered
                          </button>
                          {onOpenOrderModal && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenOrderModal(ord)
                                onClose()
                              }}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-bold text-[11px] transition-colors"
                              title="View or edit order"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleShareOrderWhatsApp(ord)}
                            className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-[11px] flex items-center gap-1 transition-colors"
                            title="Send WhatsApp update"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </button>
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
                        className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{cli.name}</p>
                          <p className="text-[10px] text-red-600 font-bold">
                            ₹{Number(cli.outstanding ?? cli.balance ?? 0).toLocaleString()} Pending
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
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
                  }}
                  className="p-1 text-gray-400 hover:text-red-600 cursor-pointer"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick mode selector for photo */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-orange-200/70">
                <span className="text-[10px] font-semibold text-gray-500 shrink-0">Scan photo as:</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsClientMode(true)
                    setIsSalesMode(false)
                    setIsPaymentMode(false)
                    setIsAccountsMode(false)
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    isClientMode
                      ? 'bg-orange-600 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-amz-orange'
                  }`}
                >
                  👤 Add Client
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSalesMode(true)
                    setIsClientMode(false)
                    setIsPaymentMode(false)
                    setIsAccountsMode(false)
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    isSalesMode
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-emerald-600'
                  }`}
                >
                  🛒 Order
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPaymentMode(true)
                    setIsClientMode(false)
                    setIsSalesMode(false)
                    setIsAccountsMode(false)
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                    isPaymentMode
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-gray-300 text-gray-700 hover:border-emerald-700'
                  }`}
                >
                  💰 Payment
                </button>
              </div>
            </div>
          )}

          {/* Payment Mode Active Banner */}
          {isPaymentMode && (
            <div className="mb-2 flex items-center justify-between px-3 py-1.5 bg-emerald-50 border border-emerald-400 rounded-xl text-xs text-emerald-900 font-semibold animate-in fade-in shadow-2xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <IndianRupee className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="truncate">Payment Mode: Type payment or upload UPI screenshot / receipt</span>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentMode(false)}
                className="text-emerald-800 hover:text-red-600 p-0.5 rounded cursor-pointer shrink-0 ml-1"
                title="Exit payment mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Client Creation Mode Active Banner */}
          {isClientMode && (
            <div className="mb-2 flex items-center justify-between px-3 py-1.5 bg-orange-50 border border-orange-400 rounded-xl text-xs text-orange-950 font-semibold animate-in fade-in shadow-2xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <UserPlus className="w-4 h-4 text-orange-600 shrink-0" />
                <span className="truncate">Add Client Mode: Type client details or upload visiting card / signboard</span>
              </div>
              <button
                type="button"
                onClick={() => setIsClientMode(false)}
                className="text-orange-800 hover:text-red-600 p-0.5 rounded cursor-pointer shrink-0 ml-1"
                title="Exit client mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Sales Mode Active Banner */}
          {isSalesMode && (
            <div className="mb-2 flex items-center justify-between px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-semibold animate-in fade-in shadow-2xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <ClipboardList className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">WhatsApp Sales Mode: Paste sales notes below and tap Send</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSalesMode(false)}
                className="text-emerald-700 hover:text-red-600 p-0.5 rounded cursor-pointer shrink-0 ml-1"
                title="Exit sales mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Accounts & Staff Cash Mode Active Banner */}
          {isAccountsMode && (
            <div className="mb-2 flex items-center justify-between px-3 py-1.5 bg-blue-50 border border-blue-300 rounded-xl text-xs text-blue-900 font-semibold animate-in fade-in shadow-2xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <ArrowRightLeft className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">Staff Cash & Accounts Mode: Type handovers, collections, or expenses</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountsMode(false)}
                className="text-blue-700 hover:text-red-600 p-0.5 rounded cursor-pointer shrink-0 ml-1"
                title="Exit accounts mode"
              >
                <X className="w-3.5 h-3.5" />
              </button>
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
              <div className="px-2.5 py-1 bg-gray-50 text-[10px] font-bold text-gray-400 flex items-center gap-1 uppercase tracking-wider">
                <Package className="w-3 h-3 text-emerald-600" /> Products
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
                      <p className="text-xs font-bold text-gray-900 truncate">{sku.name}</p>
                      <p className="text-[10px] text-gray-400">{sku.category || 'Water'}</p>
                    </div>
                  </div>
                  {sku.price > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                      ₹{sku.price}
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
            className="flex items-center gap-2"
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
              className="p-2.5 text-gray-500 hover:text-amz-orange hover:bg-orange-50 rounded-xl border border-gray-300 transition-colors shrink-0 cursor-pointer"
              title="Upload Bill, Receipt or WhatsApp Voice Note"
            >
              <Camera className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={toggleMic}
              className={`p-2.5 rounded-xl border transition-colors shrink-0 cursor-pointer ${
                isListening
                  ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-md'
                  : 'text-gray-500 hover:text-amz-orange hover:bg-orange-50 border-gray-300'
              }`}
              title={isListening ? 'Listening (Gujarati / Hindi)... Tap to stop' : 'Voice Dictation'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              type="text"
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening... Speak in Gujarati or Hindi'
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
                            : 'Type @client, /sku, voice mic, or query...'
              }
              className={`flex-1 py-2.5 px-3 border rounded-xl text-xs sm:text-sm outline-none transition-all ${
                isPaymentMode
                  ? 'border-emerald-600 ring-2 ring-emerald-200/70 bg-emerald-50/20'
                  : isClientMode
                    ? 'border-orange-500 ring-2 ring-orange-200/70 bg-orange-50/20'
                    : isSalesMode
                      ? 'border-emerald-500 ring-2 ring-emerald-200/60 bg-emerald-50/20'
                      : isAccountsMode
                        ? 'border-blue-500 ring-2 ring-blue-200/60 bg-blue-50/20'
                        : 'border-gray-300 focus:ring-2 focus:ring-amz-orange focus:border-amz-orange'
              }`}
            />

            <button
              type="submit"
              disabled={loading || (!inputMessage.trim() && !selectedFile)}
              className="p-2.5 bg-[#131921] hover:bg-black text-[#ff9900] disabled:opacity-40 rounded-xl transition-all font-bold cursor-pointer shrink-0"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
