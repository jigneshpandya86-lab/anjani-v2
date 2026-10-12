import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Phone, Clipboard, AlertTriangle, Info, CheckCircle2, X, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { extractPhoneNumber, checkNumberCollisions } from '../utils/shareTargetUtils'
import { useClientStore } from '../store/clientStore'

export default function ImportCallLogModal({
  isOpen,
  onClose,
  initialData = null,
  onLeadAdded = null,
}) {
  const [phoneInput, setPhoneInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const clients = useClientStore((state) => state.clients) || []
  const leads = useClientStore((state) => state.leads) || []
  const addLead = useClientStore((state) => state.addLead)

  // Populate from initialData when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setPhoneInput(initialData.phone || initialData.rawText || '')
        setNameInput(initialData.name || '')
      } else {
        setPhoneInput('')
        setNameInput('')
      }
    }
  }, [isOpen, initialData])

  // Extract clean 10-digit phone
  const cleanPhone = useMemo(() => {
    return extractPhoneNumber(phoneInput)
  }, [phoneInput])

  // Real-time collision detection
  const collisions = useMemo(() => {
    if (!cleanPhone || cleanPhone.length !== 10) {
      return { isClient: false, client: null, isLead: false, lead: null }
    }
    return checkNumberCollisions(cleanPhone, { clients, leads })
  }, [cleanPhone, clients, leads])

  const handlePasteClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error('Clipboard access not supported in this browser. Please paste manually.')
        return
      }
      const text = await navigator.clipboard.readText()
      if (!text) {
        toast.error('Clipboard is empty')
        return
      }
      setPhoneInput(text)
      const extracted = extractPhoneNumber(text)
      if (extracted) {
        toast.success(`Found number: ${extracted}`)
      } else {
        toast('Pasted text; please enter 10-digit number', { icon: 'ℹ️' })
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err)
      toast.error('Could not read clipboard. Please paste manually.')
    }
  }, [])

  const isContactsSupported =
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof navigator.contacts?.select === 'function'

  const handlePickFromContacts = useCallback(async () => {
    try {
      if (!isContactsSupported) {
        toast.error('Contact picker is only supported on mobile Android devices.')
        return
      }
      const selected = await navigator.contacts.select(['name', 'tel'], { multiple: false })
      if (selected && selected.length > 0) {
        const c = selected[0]
        const rawPhone = c.tel?.[0] || ''
        const rawName = c.name?.[0] || ''
        if (rawPhone) setPhoneInput(rawPhone)
        if (rawName) setNameInput(rawName)
        toast.success(`Selected: ${rawName || rawPhone}`)
      }
    } catch (err) {
      console.warn('Contact picker error or cancelled:', err)
    }
  }, [isContactsSupported])

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault()

      if (!cleanPhone || cleanPhone.length !== 10) {
        toast.error('Please enter a valid 10-digit mobile number')
        return
      }

      setIsSaving(true)
      try {
        const leadPayload = {
          name: nameInput.trim() || (initialData?.isShareTarget ? 'Shared Lead' : 'Call Lead'),
          mobile: cleanPhone,
          source: initialData?.isShareTarget ? 'share_target' : 'call_log',
          Tag: null, // Untagged, ready for SMS/connect workflow
          createdAt: new Date().toISOString(),
        }

        await addLead(leadPayload)
        toast.success(`Lead added: ${cleanPhone}`)
        if (onLeadAdded) onLeadAdded(leadPayload)
        onClose()
      } catch (err) {
        console.error('Failed to add lead from call log / share:', err)
        toast.error('Failed to save lead. Please try again.')
      } finally {
        setIsSaving(false)
      }
    },
    [cleanPhone, nameInput, initialData, addLead, onLeadAdded, onClose],
  )

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1050] flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Phone size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight">
                {initialData?.isShareTarget ? 'Add Shared Lead' : 'Import from Call Log'}
              </h3>
              <p className="text-xs text-orange-100 font-medium">
                {initialData?.isShareTarget
                  ? 'Received via Android Share Sheet'
                  : 'Fast import & duplicate check'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Phone Input with Paste helper */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="callLeadPhone" className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Mobile Number *
              </label>
              <div className="flex items-center gap-1.5">
                {isContactsSupported && (
                  <button
                    type="button"
                    onClick={handlePickFromContacts}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                    title="Select contact from phone"
                  >
                    <Users size={12} />
                    <span>Contacts</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 px-2 py-0.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                >
                  <Clipboard size={12} />
                  <span>Paste</span>
                </button>
              </div>
            </div>
            <input
              id="callLeadPhone"
              type="text"
              required
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="Paste or enter number (e.g. 98250 12345)"
              className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-500 transition-all"
            />
            {cleanPhone ? (
              <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                <CheckCircle2 size={13} />
                <span>Detected 10-digit: {cleanPhone}</span>
              </p>
            ) : phoneInput ? (
              <p className="text-xs text-rose-500 font-medium mt-1">
                Please enter a valid 10-digit Indian mobile number
              </p>
            ) : null}
          </div>

          {/* Lead Name Input */}
          <div>
            <label htmlFor="callLeadName" className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5 block">
              Lead / Contact Name (Optional)
            </label>
            <input
              id="callLeadName"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Ramesh Patel / Dairy Shop"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-500 transition-all"
            />
          </div>

          {/* Collisions Warnings */}
          {collisions.isClient && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-bold">Existing Customer Match!</p>
                <p className="mt-0.5">
                  This number is already registered to{' '}
                  <span className="font-bold underline">{collisions.client.name}</span>
                  {collisions.client.businessName ? ` (${collisions.client.businessName})` : ''}.
                </p>
                <p className="text-[11px] text-amber-700 mt-1 italic">
                  Note: Adding them as a lead might send an intro message.
                </p>
              </div>
            </div>
          )}

          {collisions.isLead && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-start gap-2.5">
              <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <p className="font-bold">Duplicate Lead Warning</p>
                <p className="mt-0.5">
                  This number already exists in your Leads list as{' '}
                  <span className="font-bold">{collisions.lead.name || 'Untitled'}</span> (Tag:{' '}
                  {collisions.lead.Tag || 'New'}).
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !cleanPhone || cleanPhone.length !== 10}
              className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-orange-300/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSaving ? (
                <span>Saving…</span>
              ) : (
                <span>{collisions.isLead ? 'Add Anyway' : 'Save as Lead'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
