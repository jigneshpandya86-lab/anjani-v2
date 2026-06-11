import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  query,
  doc,
  where,
  limit,
  getDocs,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { useClientStore } from '../store/clientStore'
import { MessageSquare, Trash2, Plus, Zap, RefreshCw, Users, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import React from 'react'
import {
  buildFollowUpSmsMessage,
  buildFollowUpUpdate,
  buildInitialSmsMessage,
  buildInitialSmsUpdate,
  getDueReminderContext,
  getLeadPhone,
  sendBackgroundSms,
} from '../services/leadSmsService'

// ─── Module-level constants ──────────────────────────────────────────────────

const MACRO_URL = import.meta.env.VITE_MACRO_URL || ''

const TAG_CONFIG = {
  SMS_SENT: {
    label: 'SMS Sent',
    badge: 'bg-orange-100 text-orange-600',
    avatar: 'bg-orange-100 text-orange-600',
  },
  FOLLOWUP_DONE: {
    label: 'Done',
    badge: 'bg-green-100 text-green-700',
    avatar: 'bg-green-100 text-green-600',
  },
  _default: {
    label: 'New',
    badge: 'bg-gray-100 text-gray-500',
    avatar: 'bg-gray-100 text-gray-500',
  },
}

const formatDate = (lead) => {
  const raw = lead.createdAt || lead.createdDate || lead.date
  if (!raw) return 'No date'
  if (raw.toDate) return raw.toDate().toLocaleDateString('en-IN')
  if (typeof raw === 'string') return raw
  return new Date(raw).toLocaleDateString('en-IN')
}

const isLeadUntagged = (lead = {}) => {
  if (!Object.prototype.hasOwnProperty.call(lead, 'Tag')) return true
  return lead.Tag === null || lead.Tag === ''
}

// ─── Sub-components (memoized) ───────────────────────────────────────────────

const ButtonSpinner = React.memo(function ButtonSpinner() {
  return (
    <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  )
})

const StatusBadge = React.memo(function StatusBadge({ tag }) {
  const config = TAG_CONFIG[tag] ?? TAG_CONFIG._default
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}
    >
      {config.label}
    </span>
  )
})

const SkeletonCard = React.memo(function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-100 rounded-full w-2/5" />
          <div className="h-2.5 bg-gray-100 rounded-full w-3/5" />
        </div>
        <div className="flex gap-2">
          <div className="w-14 h-8 bg-gray-100 rounded-xl" />
          <div className="w-8 h-8 bg-gray-100 rounded-xl" />
          <div className="w-8 h-8 bg-gray-100 rounded-xl" />
        </div>
      </div>
    </div>
  )
})

const LeadCard = React.memo(function LeadCard({ lead, onWhatsApp, onDelete, onGemma }) {
  const smsCount = lead.smsCount || 0
  const showSmsCounter = lead.Tag === 'SMS_SENT'

  return (
    <div className="relative bg-white rounded-2xl px-3 py-2.5 shadow-sm border border-gray-100">
      {showSmsCounter && (
        <span className="absolute top-1.5 right-1.5 text-[10px] leading-none font-semibold text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-md">
          {smsCount}
        </span>
      )}
      <div className="flex items-center gap-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          {lead.Tag !== 'SMS_SENT' && (
            <div className="flex items-center gap-2">
              <StatusBadge tag={lead.Tag} />
            </div>
          )}
          <p className="text-xs text-gray-500 mt-1 truncate">
            {lead.mobile ? `+91 ${lead.mobile}` : 'No number'}
            <span className="text-gray-300 mx-1">·</span>
            {formatDate(lead)}
          </p>
          {lead.Tag === 'FOLLOWUP_DONE' && (
            <p className="text-xs text-green-600 mt-1 font-medium">✓ All follow-ups complete</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onGemma(lead)}
            className="flex items-center justify-center gap-1 bg-[#8A2BE2] hover:bg-[#7B1FA2] text-white p-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform"
            title="Draft Pitch with Gemma AI"
          >
            <Sparkles size={13} />
          </button>
          <button
            onClick={() => onWhatsApp(lead)}
            className="flex items-center justify-center gap-1 bg-[#25D366] text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform"
            aria-label={`WhatsApp ${lead.name || lead.mobile}`}
          >
            <MessageSquare size={13} />
            WA
          </button>
          <button
            onClick={() => onDelete(lead.id, lead.name || lead.mobile)}
            className="text-red-400 p-2 bg-red-50 rounded-xl active:scale-90 transition-transform"
            aria-label={`Delete ${lead.name || lead.mobile}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── Main component ──────────────────────────────────────────────────────────

export default function LeadsDashboard({ pendingAction = null, onPendingActionHandled }) {
  const leads = useClientStore((state) => state.leads)
  const fetchLeads = useClientStore((state) => state.fetchLeads)
  const updateLead = useClientStore((state) => state.updateLead)
  const addLead = useClientStore((state) => state.addLead)
  const deleteLead = useClientStore((state) => state.deleteLead)

  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLeadName, setNewLeadName] = useState('')
  const [newLeadMobile, setNewLeadMobile] = useState('')
  const [isSavingLead, setIsSavingLead] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRemessaging, setIsRemessaging] = useState(false)
  const [gemmaLead, setGemmaLead] = useState(null)
  const [gemmaPitch, setGemmaPitch] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [gemmaTone, setGemmaTone] = useState('Professional')

  useEffect(() => {
    const unsub = fetchLeads()
    setLoading(false)
    return unsub
  }, [fetchLeads])

  // Derived counts — memoized, only recalculate when leads change
  const untaggedCount = useMemo(() => leads.filter((l) => !l.Tag).length, [leads])
  const smsSentCount = useMemo(() => leads.filter((l) => l.Tag === 'SMS_SENT').length, [leads])

  // ── Handlers (stable references via useCallback) ────────────────────────

  const sendWhatsApp = useCallback((lead) => {
    const msg = `Hello! 🌟 I'm *Jignesh Pandya*, owner of *Anjani Water*, Vadodara. 💧\n\nWe provide **200ml premium packaged water** across all areas of Vadodara, Gujarat. ✨\n\n*Why choose Anjani Water?*\n✅ **Zero Waste**: Perfect 200ml size for events & offices.\n✅ **Premium Quality**: 100% pure, hygienic & crystal clear.\n✅ **Best Rates & Free Delivery**: Direct from plant to your doorstep.\n\nWould you like to try a free sample? Please *reply with 1* if you want to try the sample! 👍`
    window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank')
  }, [])

  const deleteLeadHandler = useCallback(
    (leadId, leadLabel) => {
      const undoTimeout = setTimeout(async () => {
        try {
          await deleteLead(leadId)
        } catch (error) {
          console.error('Failed to delete lead:', error)
          toast.error('Delete failed — please try again')
        }
      }, 3000)

      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            <span>
              <strong>{leadLabel}</strong> deleted
            </span>
            <button
              className="text-orange-600 font-bold text-xs uppercase"
              onClick={() => {
                clearTimeout(undoTimeout)
                toast.dismiss(t.id)
                // Rollback: onSnapshot will restore the lead automatically
                // because we haven't actually deleted from Firestore yet
              }}
            >
              Undo
            </button>
          </span>
        ),
        { duration: 3000 },
      )
    },
    [deleteLead],
  )

  const saveManualLead = useCallback(
    async (e) => {
      e.preventDefault()
      const name = newLeadName.trim()

      // Normalize mobile number: strip non-digits (spaces, +, -, etc.)
      let mobile = newLeadMobile.replace(/\D/g, '')

      // Remove leading 0 if 11 digits
      if (mobile.length === 11 && mobile.startsWith('0')) {
        mobile = mobile.substring(1)
      }
      // Remove leading 91 country code if 12 digits
      else if (mobile.length === 12 && mobile.startsWith('91')) {
        mobile = mobile.substring(2)
      }

      if (!/^\d{10}$/.test(mobile)) {
        toast.error('Please enter a valid 10-digit mobile number')
        return
      }

      setIsSavingLead(true)
      try {
        await addLead({
          name,
          mobile,
          source: 'manual',
          Tag: null,
        })
        toast.success('Lead added')
        setNewLeadName('')
        setNewLeadMobile('')
        setShowAddForm(false)
      } catch (error) {
        console.error('Failed to add lead:', error)
        toast.error('Failed to add lead')
      } finally {
        setIsSavingLead(false)
      }
    },
    [newLeadName, newLeadMobile, addLead],
  )

  const closeAddForm = useCallback(() => {
    if (isSavingLead) return
    setShowAddForm(false)
    setNewLeadName('')
    setNewLeadMobile('')
  }, [isSavingLead])

  const handleOpenGemma = useCallback((lead) => {
    setGemmaLead(lead)
    setGemmaPitch('')
    setGemmaTone('Professional')
  }, [])

  const generatePitchWithGemma = useCallback(async (lead, tone) => {
    setIsGenerating(true)
    setGemmaPitch('')
    try {
      const prompt = `Write a short, engaging 2-sentence B2B WhatsApp sales pitch for Anjani Water, Vadodara, offering 200ml premium packaged water bottles. Keep it under 200 characters and use 1-2 emojis. Direct it to a client named ${lead.name || 'Sir/Madam'}. Use a ${tone.toLowerCase()} yet warm tone. Respond with ONLY the message text.`
      
      const headers = {
        "Content-Type": "application/json"
      };
      const hfToken = import.meta.env.VITE_HF_API_KEY;
      if (hfToken) {
        headers["Authorization"] = `Bearer ${hfToken}`;
      }

      const response = await fetch(
        "https://api-inference.huggingface.co/models/google/gemma-2-2b-it",
        {
          headers,
          method: "POST",
          body: JSON.stringify({ inputs: prompt }),
        }
      )

      if (!response.ok) {
        throw new Error(`HF API failed: ${response.status}`)
      }

      const res = await response.json()
      
      if (res.error) {
        if (res.estimated_time) {
          toast(`Gemma model is loading. Retrying in ${Math.round(res.estimated_time)} seconds...`)
          setTimeout(() => generatePitchWithGemma(lead, tone), res.estimated_time * 1000)
          return
        }
        throw new Error(res.error)
      }

      let generatedText = ""
      if (Array.isArray(res) && res[0]?.generated_text) {
        generatedText = res[0].generated_text
      } else if (res.generated_text) {
        generatedText = res.generated_text
      }

      if (generatedText.includes(prompt)) {
        generatedText = generatedText.replace(prompt, '').trim()
      }
      
      generatedText = generatedText.replace(/^"|"$/g, '').trim()

      setGemmaPitch(generatedText || `Hello! 🌟 Jignesh Pandya here, owner of Anjani Water. We supply premium 200ml water bottles in Vadodara—perfect size, zero waste! Reply 1 for a free sample! 👍`)
      toast.success('Pitch generated by Gemma!')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate pitch. Using default template.')
      setGemmaPitch(`Hello! 🌟 Jignesh Pandya here, owner of Anjani Water. We supply premium 200ml water bottles in Vadodara—perfect size, zero waste! Reply 1 for a free sample! 👍`)
    } finally {
      setIsGenerating(false)
    }
  }, [])

  useEffect(() => {
    if (gemmaLead) {
      generatePitchWithGemma(gemmaLead, gemmaTone)
    }
  }, [gemmaLead, gemmaTone, generatePitchWithGemma])

  const sendGemmaWhatsApp = useCallback(() => {
    if (!gemmaLead || !gemmaPitch) return
    window.open(`https://wa.me/91${gemmaLead.mobile}?text=${encodeURIComponent(gemmaPitch)}`, '_blank')
    setGemmaLead(null)
  }, [gemmaLead, gemmaPitch])

  const copyGemmaPitch = useCallback(() => {
    if (!gemmaPitch) return
    navigator.clipboard.writeText(gemmaPitch)
    toast.success('Pitch copied to clipboard!')
  }, [gemmaPitch])

  const connectTopFiveUntaggedLeads = useCallback(async () => {
    if (isConnecting) return
    setIsConnecting(true)
    try {
      // Fetch recent leads and include records where Tag is null, empty, or missing
      const q = query(collection(db, 'leads'), limit(100))
      const snapshot = await getDocs(q)
      const untaggedLeads = snapshot.docs
        .filter((leadDoc) => isLeadUntagged(leadDoc.data()))
        .slice(0, 5)

      if (untaggedLeads.length === 0) {
        toast('No untagged leads found')
        return
      }

      let sentCount = 0
      for (const leadDoc of untaggedLeads) {
        const lead = leadDoc.data()
        const mobile = getLeadPhone(lead)
        if (!mobile) continue
        await sendBackgroundSms({
          macroUrl: MACRO_URL,
          phone: mobile,
          message: buildInitialSmsMessage(),
        })
        await updateDoc(
          doc(db, 'leads', leadDoc.id),
          buildInitialSmsUpdate({ lead, leadId: leadDoc.id, now: new Date() }),
        )
        sentCount += 1
      }

      if (sentCount === 0) {
        toast('No valid phone numbers found')
        return
      }
      toast.success(`Connected ${sentCount} lead${sentCount > 1 ? 's' : ''}`)
    } catch (error) {
      console.error('Failed to connect leads:', error)
      toast.error('Failed to send SMS for leads')
    } finally {
      setIsConnecting(false)
    }
  }, [isConnecting])

  const sendDueFollowUpSms = useCallback(async () => {
    if (isRemessaging) return
    setIsRemessaging(true)
    try {
      const q = query(collection(db, 'leads'), where('Tag', '==', 'SMS_SENT'), limit(100))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        toast('No SMS sent leads found')
        return
      }

      const now = new Date()
      let sentCount = 0

      for (const leadDoc of snapshot.docs) {
        const lead = leadDoc.data()
        const mobile = getLeadPhone(lead)
        if (!mobile) continue

        const context = getDueReminderContext(lead, now)
        if (!context) continue

        if (context.shouldMarkComplete) {
          await updateLead(leadDoc.id, { Tag: 'FOLLOWUP_DONE' })
          continue
        }

        await sendBackgroundSms({
          macroUrl: MACRO_URL,
          phone: mobile,
          message: buildFollowUpSmsMessage({ reminderDay: context.reminderDay }),
        })
        await updateLead(
          leadDoc.id,
          buildFollowUpUpdate({
            lead,
            reminderDay: context.reminderDay,
            nextStep: context.nextStep,
            now,
          }),
        )
        sentCount += 1
      }

      if (sentCount === 0) {
        toast('No follow-ups are due right now')
        return
      }
      toast.success(`Sent ${sentCount} follow-up SMS`)
    } catch (error) {
      console.error('Failed to send follow-up SMS:', error)
      toast.error('Failed to send due follow-up SMS')
    } finally {
      setIsRemessaging(false)
    }
  }, [isRemessaging])

  const connectAndSendDueFollowUps = useCallback(async () => {
    if (isConnecting || isRemessaging) return
    await connectTopFiveUntaggedLeads()
    await sendDueFollowUpSms()
  }, [isConnecting, isRemessaging, connectTopFiveUntaggedLeads, sendDueFollowUpSms])

  useEffect(() => {
    if (!pendingAction) return

    const runPendingAction = async () => {
      if (pendingAction === 'connect') {
        await connectTopFiveUntaggedLeads()
      } else if (pendingAction === 'both') {
        await connectAndSendDueFollowUps()
      }
      if (onPendingActionHandled) onPendingActionHandled()
    }

    runPendingAction()
  }, [
    pendingAction,
    connectTopFiveUntaggedLeads,
    connectAndSendDueFollowUps,
    onPendingActionHandled,
  ])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 tracking-tight">Leads</h2>
        <span className="bg-orange-100 text-orange-600 px-2.5 py-1 rounded-lg text-xs font-bold">
          {leads.length}
        </span>
      </div>

      {/* Action Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Connect row */}
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Zap size={18} className="text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Connect New Leads</p>
            <p className="text-xs text-gray-400 mt-0.5">Send SMS to top 5 untagged leads</p>
          </div>
          {untaggedCount > 0 && (
            <span className="flex-shrink-0 bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {untaggedCount}
            </span>
          )}
          <button
            type="button"
            disabled={isConnecting || isRemessaging}
            onClick={connectTopFiveUntaggedLeads}
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
          >
            {isConnecting ? (
              <>
                <ButtonSpinner />
                <span>Connecting…</span>
              </>
            ) : (
              <span>{untaggedCount > 0 ? `Connect ${Math.min(untaggedCount, 5)}` : 'Connect'}</span>
            )}
          </button>
        </div>

        <div className="h-px bg-gray-100 mx-4" />

        {/* Re-message row */}
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <RefreshCw size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Send Follow-ups</p>
            <p className="text-xs text-gray-400 mt-0.5">Deliver due follow-up messages</p>
          </div>
          {smsSentCount > 0 && (
            <span className="flex-shrink-0 bg-blue-100 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {smsSentCount}
            </span>
          )}
          <button
            type="button"
            disabled={isConnecting || isRemessaging}
            onClick={sendDueFollowUpSms}
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
          >
            {isRemessaging ? (
              <>
                <ButtonSpinner />
                <span>Sending…</span>
              </>
            ) : (
              <span>Re-message</span>
            )}
          </button>
        </div>

        <div className="h-px bg-gray-100 mx-4" />

        <div className="flex items-center gap-4 px-4 py-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <RefreshCw size={18} className="text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Quick Action</p>
            <p className="text-xs text-gray-400 mt-0.5">Connect + send due follow-ups</p>
          </div>
          <button
            type="button"
            disabled={isConnecting || isRemessaging}
            onClick={connectAndSendDueFollowUps}
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
          >
            <span>Run Both</span>
          </button>
        </div>
      </div>

      {/* Add Lead Modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={closeAddForm}
        >
          <form
            onSubmit={saveManualLead}
            className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-gray-800 tracking-wide">Add Lead</h3>
              <button
                type="button"
                onClick={closeAddForm}
                disabled={isSavingLead}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="newLeadName"
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block"
                >
                  Name (optional)
                </label>
                <input
                  id="newLeadName"
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="e.g. Ravi Patel"
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="newLeadMobile"
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block"
                >
                  Mobile *
                </label>
                <input
                  id="newLeadMobile"
                  required
                  type="tel"
                  value={newLeadMobile}
                  onChange={(e) => setNewLeadMobile(e.target.value)}
                  placeholder="e.g. +91 99259 97750 or 09925997750"
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeAddForm}
                disabled={isSavingLead}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs uppercase transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingLead}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs uppercase disabled:opacity-60 transition-colors"
              >
                {isSavingLead ? (
                  <>
                    <ButtonSpinner />
                    <span>Saving…</span>
                  </>
                ) : (
                  'Save Lead'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lead List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 flex flex-col items-center gap-3">
          <Users size={40} className="text-gray-200" />
          <p className="text-sm font-bold text-gray-500">No leads yet</p>
          <p className="text-xs text-gray-400">Add your first lead using the + button</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onWhatsApp={sendWhatsApp}
              onDelete={deleteLeadHandler}
              onGemma={handleOpenGemma}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => setShowAddForm((prev) => !prev)}
        className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-300/50 active:scale-95 transition-all"
        aria-label="Manually add lead"
        title="Manually add lead"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* Gemma Pitch Modal */}
      {gemmaLead && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => setGemmaLead(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-[#8A2BE2]" />
                <h3 className="text-sm font-black uppercase text-gray-800 tracking-wide">
                  Gemma AI Copywriter
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGemmaLead(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                <p className="text-xs font-bold text-gray-700">Lead Context:</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {gemmaLead.name || 'Unnamed Lead'} · +91 {gemmaLead.mobile}
                </p>
              </div>

              {/* Tone Selection */}
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Select Tone
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {['Professional', 'Casual', 'Urgent'].map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => setGemmaTone(tone)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                        gemmaTone === tone
                          ? 'bg-[#8A2BE2] text-white border-[#8A2BE2]'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pitch Output */}
              <div>
                <label
                  htmlFor="gemmaPitchTextarea"
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block"
                >
                  Generated WhatsApp Pitch
                </label>
                <div className="relative">
                  <textarea
                    id="gemmaPitchTextarea"
                    rows={4}
                    value={gemmaPitch}
                    onChange={(e) => setGemmaPitch(e.target.value)}
                    placeholder="Gemma is thinking..."
                    className="w-full p-3 bg-gray-50/50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#8A2BE2]/20 text-sm resize-none"
                    disabled={isGenerating}
                  />
                  {isGenerating && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-5 h-5 border-2 border-[#8A2BE2] border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-bold text-gray-500">Gemma is drafting...</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGemmaLead(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs uppercase transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={copyGemmaPitch}
                disabled={isGenerating || !gemmaPitch}
                className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs uppercase transition-colors disabled:opacity-50"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={sendGemmaWhatsApp}
                disabled={isGenerating || !gemmaPitch}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-xs uppercase disabled:opacity-60 transition-colors"
              >
                <MessageSquare size={13} />
                <span>Send WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
