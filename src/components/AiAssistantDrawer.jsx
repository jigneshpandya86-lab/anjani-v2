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
} from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import toast from 'react-hot-toast'
import { app } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { WATER_SKUS } from '../constants/skus'
import { processAiBillImage } from '../utils/aiImageHelper'
import { tryLocalIntentRoute } from '../utils/aiIntentRouter'

export default function AiAssistantDrawer({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenPaymentModal,
  onOpenOrderModal,
}) {
  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  const clients = useClientStore((state) => state.clients)
  const orders = useClientStore((state) => state.orders)
  const stockSummary = useClientStore((state) => state.stockSummary)
  const stockTotal = useClientStore((state) => state.stockTotal)
  const stockEntries = useClientStore((state) => state.stockEntries)
  const addStockBatch = useClientStore((state) => state.addStockBatch)
  const updateOrder = useClientStore((state) => state.updateOrder)
  const aiSettings = useClientStore((state) => state.aiSettings)
  const aiPrefillPrompt = useClientStore((state) => state.aiPrefillPrompt)

  const [inputMessage, setInputMessage] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [filePreview, setFilePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [inwardedBills, setInwardedBills] = useState({})

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "👋 Hello Jigneshbhai! I am your **Anjani AI Assistant**.\n\nYou can **upload a photo of your vendor delivery bill/challan** to automatically add received SKUs to stock, or tap any quick action below:",
      timestamp: new Date(),
    },
  ])

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
      toast.success(`Bill image ready (~${processed.sizeKb} KB)`)
    } catch (err) {
      toast.dismiss('compress-img')
      toast.error('Could not process image: ' + err.message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSend = async (customPrompt = null) => {
    const query = (customPrompt || inputMessage).trim()
    const filePayload = selectedFile

    if (!query && !filePayload) return

    const userMessageId = 'msg-' + Date.now()
    const newMessages = [
      ...messages,
      {
        id: userMessageId,
        sender: 'user',
        text: query || (filePayload ? 'Uploaded vendor bill for scanning 📄' : ''),
        imagePreview: filePayload?.dataUrl || null,
        timestamp: new Date(),
      },
    ]

    setMessages(newMessages)
    setInputMessage('')
    setSelectedFile(null)
    setFilePreview(null)

    // 1. Zero-Token Local Intent Check (Only if no file is uploaded)
    if (!filePayload && query) {
      const localRoute = tryLocalIntentRoute(query, {
        stockSummary,
        stockTotal,
        stockEntries,
        orders,
        clients,
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
        text: query || (filePayload ? 'Scan this vendor bill and extract all water SKUs' : ''),
        imageBase64: filePayload?.base64 || null,
        mimeType: filePayload?.mimeType || 'image/jpeg',
        conversationHistory: messages.slice(-3).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      })

      const resData = response.data || {}

      if (resData.type === 'vendor_bill') {
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
        <div className="bg-[#131921] text-white px-4 py-3.5 flex items-center justify-between border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ff9900]/20 flex items-center justify-center text-[#ff9900]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-white">Anjani AI Assistant</h2>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono font-medium">
                  {aiSettings?.activeModel || 'gemini-2.5-flash-lite'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Vendor Bill OCR & Inventory Control</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: 'welcome',
                    sender: 'assistant',
                    text: '👋 Chat cleared! How can I help you with your orders or stock today?',
                    timestamp: new Date(),
                  },
                ])
              }
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Reset chat"
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

        {/* Quick Action Chips */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full font-semibold text-gray-700 hover:border-amz-orange hover:text-amz-orange transition-colors shrink-0 shadow-2xs"
          >
            <Camera className="w-3.5 h-3.5 text-amz-orange" />
            <span>Scan Vendor Bill</span>
          </button>
          <button
            type="button"
            onClick={() => handleSend('Current stock')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full font-semibold text-gray-700 hover:border-amz-orange hover:text-amz-orange transition-colors shrink-0 shadow-2xs"
          >
            <Package className="w-3.5 h-3.5 text-blue-600" />
            <span>Current Stock</span>
          </button>
          <button
            type="button"
            onClick={() => handleSend('Pending orders today')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full font-semibold text-gray-700 hover:border-amz-orange hover:text-amz-orange transition-colors shrink-0 shadow-2xs"
          >
            <Truck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Today Deliveries</span>
          </button>
          <button
            type="button"
            onClick={() => handleSend('Outstanding balances')}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-300 rounded-full font-semibold text-gray-700 hover:border-amz-orange hover:text-amz-orange transition-colors shrink-0 shadow-2xs"
          >
            <IndianRupee className="w-3.5 h-3.5 text-purple-600" />
            <span>Outstanding</span>
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-gray-50/50">
          {messages.map((msg) => (
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

                {/* 1. Interactive Vendor Bill Card */}
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
              </div>

              {msg.sender === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 items-center text-gray-500 text-xs italic pl-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#ff9900]" />
              <span>Analyzing bill with {aiSettings?.activeModel || 'Gemini Flash Lite'}...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-gray-200 shrink-0">
          {/* File Preview Pill if selected */}
          {filePreview && (
            <div className="mb-2 flex items-center justify-between p-2 bg-orange-50 border border-orange-200 rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <img
                  src={filePreview}
                  alt="Selected bill"
                  className="w-8 h-8 rounded object-cover border border-orange-300"
                />
                <div>
                  <p className="font-semibold text-gray-800 truncate max-w-[200px]">
                    {selectedFile?.fileName}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Compressed: {selectedFile?.sizeKb} KB (~258 tokens)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null)
                  setFilePreview(null)
                }}
                className="p-1 text-gray-400 hover:text-red-600"
              >
                <X className="w-4 h-4" />
              </button>
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
              accept="image/*"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-gray-500 hover:text-amz-orange hover:bg-orange-50 rounded-xl border border-gray-300 transition-colors"
              title="Upload Vendor Bill"
            >
              <Camera className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={filePreview ? 'Add notes or tap send...' : 'Ask stock, orders, or upload bill...'}
              className="flex-1 py-2.5 px-3 border border-gray-300 rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-amz-orange focus:border-amz-orange"
            />

            <button
              type="submit"
              disabled={loading || (!inputMessage.trim() && !selectedFile)}
              className="p-2.5 bg-[#131921] hover:bg-black text-[#ff9900] disabled:opacity-40 rounded-xl transition-all font-bold cursor-pointer"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>

          <p className="mt-1.5 text-center text-[10px] text-gray-400 font-mono">
            ⚡ Powered by Gemini 2.5 Flash Lite • Zero-Token Local Caching
          </p>
        </div>
      </div>
    </div>
  )
}
