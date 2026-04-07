import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  where,
  limit,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase-config';
import { MessageSquare, Phone, Trash2, Plus, Zap, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import React from 'react';
import {
  buildFollowUpSmsMessage,
  buildFollowUpUpdate,
  buildInitialSmsMessage,
  buildInitialSmsUpdate,
  getDueReminderContext,
  getLeadPhone,
  sendBackgroundSms,
} from '../services/leadSmsService';

// ─── Module-level constants ──────────────────────────────────────────────────

const MACRO_URL =
  import.meta.env.VITE_MACRO_URL ||
  'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms';

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
};

const getLeadDate = (lead) => {
  const raw = lead.createdAt || lead.createdDate || lead.date;
  if (!raw) return new Date(0);
  if (raw?.toDate) return raw.toDate();
  return new Date(raw);
};

const formatDate = (lead) => {
  const raw = lead.createdAt || lead.createdDate || lead.date;
  if (!raw) return 'No date';
  if (raw.toDate) return raw.toDate().toLocaleDateString('en-IN');
  if (typeof raw === 'string') return raw;
  return new Date(raw).toLocaleDateString('en-IN');
};

const formatNextFollowUp = (lead) => {
  const raw = lead.nextFollowUpAt;
  if (!raw) return null;
  try {
    const d = raw?.toDate ? raw.toDate() : new Date(raw);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
};

// ─── Sub-components (memoized) ───────────────────────────────────────────────

const ButtonSpinner = React.memo(function ButtonSpinner() {
  return (
    <svg className="animate-spin w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
});

const StatusBadge = React.memo(function StatusBadge({ tag }) {
  const config = TAG_CONFIG[tag] ?? TAG_CONFIG._default;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${config.badge}`}>
      {config.label}
    </span>
  );
});

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
  );
});

const LeadCard = React.memo(function LeadCard({ lead, onWhatsApp, onDelete }) {
  const config = TAG_CONFIG[lead.Tag] ?? TAG_CONFIG._default;
  const initials = lead.name ? lead.name.trim().charAt(0).toUpperCase() : null;
  const nextFollowUp = formatNextFollowUp(lead);
  const smsCount = lead.smsCount || 0;

  return (
    <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3">

        {/* Avatar */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${config.avatar}`}>
          {initials ? <span>{initials}</span> : <Phone size={16} />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">
              {lead.name || 'Unknown'}
            </span>
            <StatusBadge tag={lead.Tag} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {lead.mobile ? `+91 ${lead.mobile}` : 'No number'}
            <span className="text-gray-300 mx-1">·</span>
            {formatDate(lead)}
          </p>
          {lead.Tag === 'SMS_SENT' && (
            <p className="text-xs text-orange-500 mt-1 font-medium">
              SMS {smsCount} sent{nextFollowUp ? ` · Next: ${nextFollowUp}` : ''}
            </p>
          )}
          {lead.Tag === 'FOLLOWUP_DONE' && (
            <p className="text-xs text-green-600 mt-1 font-medium">
              ✓ All follow-ups complete
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onWhatsApp(lead)}
            className="flex items-center justify-center gap-1 bg-[#25D366] text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform"
            aria-label={`WhatsApp ${lead.name || lead.mobile}`}
          >
            <MessageSquare size={13} />
            WA
          </button>
          <a
            href={`tel:${lead.mobile}`}
            className="text-blue-500 p-2 bg-blue-50 rounded-xl active:scale-90 transition-transform"
            aria-label={`Call ${lead.name || lead.mobile}`}
          >
            <Phone size={16} />
          </a>
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
  );
});

// ─── Main component ──────────────────────────────────────────────────────────

export default function LeadsDashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadMobile, setNewLeadMobile] = useState('');
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRemessaging, setIsRemessaging] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'leads'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setLeads(docs.sort((a, b) => getLeadDate(b) - getLeadDate(a)));
      setLoading(false);
    });
    return unsub;
  }, []);

  // Derived counts — memoized, only recalculate when leads change
  const untaggedCount = useMemo(() => leads.filter(l => !l.Tag).length, [leads]);
  const smsSentCount  = useMemo(() => leads.filter(l => l.Tag === 'SMS_SENT').length, [leads]);

  // ── Handlers (stable references via useCallback) ────────────────────────

  const sendWhatsApp = useCallback((lead) => {
    const displayName = lead.name || 'Sir/Madam';
    const msg = `Hello ${displayName}, Greetings from *Annapurna Foods, Vadodara*! ✨ \n\nPlanning an event? Make it premium with our 200ml Packaged Water Bottles. Perfect size and crystal clear quality. 💧\n\nShall we discuss your requirement?`;
    window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
  }, []);

  const deleteLead = useCallback((leadId, leadLabel) => {
    // Optimistic: remove from UI immediately
    setLeads(prev => prev.filter(l => l.id !== leadId));

    const undoTimeout = setTimeout(async () => {
      try {
        await deleteDoc(doc(db, 'leads', leadId));
      } catch (error) {
        console.error('Failed to delete lead:', error);
        toast.error('Delete failed — please try again');
        // Rollback: re-fetch will restore via onSnapshot
      }
    }, 3000);

    toast(
      (t) => (
        <span className="flex items-center gap-3 text-sm">
          <span>
            <strong>{leadLabel}</strong> deleted
          </span>
          <button
            className="text-orange-600 font-bold text-xs uppercase"
            onClick={() => {
              clearTimeout(undoTimeout);
              toast.dismiss(t.id);
              // Rollback: onSnapshot will restore the lead automatically
              // because we haven't actually deleted from Firestore yet
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 3000 },
    );
  }, []);

  const saveManualLead = useCallback(async (e) => {
    e.preventDefault();
    const mobile = newLeadMobile.trim();
    const name = newLeadName.trim();

    if (!/^\d{10}$/.test(mobile)) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsSavingLead(true);
    try {
      await addDoc(collection(db, 'leads'), {
        name,
        mobile,
        source: 'manual',
        Tag: null,
        createdAt: serverTimestamp(),
      });
      toast.success('Lead added');
      setNewLeadName('');
      setNewLeadMobile('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add lead:', error);
      toast.error('Failed to add lead');
    } finally {
      setIsSavingLead(false);
    }
  }, [newLeadName, newLeadMobile]);

  const closeAddForm = useCallback(() => {
    if (isSavingLead) return;
    setShowAddForm(false);
    setNewLeadName('');
    setNewLeadMobile('');
  }, [isSavingLead]);

  const connectTopFiveUntaggedLeads = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const q = query(collection(db, 'leads'), where('Tag', '==', null), limit(5));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast('No untagged leads found');
        return;
      }

      let sentCount = 0;
      for (const leadDoc of snapshot.docs) {
        const lead = leadDoc.data();
        const mobile = getLeadPhone(lead);
        if (!mobile) continue;
        await sendBackgroundSms({
          macroUrl: MACRO_URL,
          phone: mobile,
          message: buildInitialSmsMessage(lead.name),
        });
        await updateDoc(doc(db, 'leads', leadDoc.id), buildInitialSmsUpdate(new Date()));
        sentCount += 1;
      }

      if (sentCount === 0) {
        toast('No valid phone numbers found');
        return;
      }
      toast.success(`Connected ${sentCount} lead${sentCount > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Failed to connect leads:', error);
      toast.error('Failed to send SMS for leads');
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting]);

  const sendDueFollowUpSms = useCallback(async () => {
    if (isRemessaging) return;
    setIsRemessaging(true);
    try {
      const q = query(collection(db, 'leads'), where('Tag', '==', 'SMS_SENT'), limit(100));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast('No SMS sent leads found');
        return;
      }

      const now = new Date();
      let sentCount = 0;

      for (const leadDoc of snapshot.docs) {
        const lead = leadDoc.data();
        const mobile = getLeadPhone(lead);
        if (!mobile) continue;

        const context = getDueReminderContext(lead, now);
        if (!context) continue;

        if (context.shouldMarkComplete) {
          await updateDoc(doc(db, 'leads', leadDoc.id), { Tag: 'FOLLOWUP_DONE' });
          continue;
        }

        await sendBackgroundSms({
          macroUrl: MACRO_URL,
          phone: mobile,
          message: buildFollowUpSmsMessage({ name: lead.name, reminderDay: context.reminderDay }),
        });
        await updateDoc(
          doc(db, 'leads', leadDoc.id),
          buildFollowUpUpdate({ lead, reminderDay: context.reminderDay, nextStep: context.nextStep, now }),
        );
        sentCount += 1;
      }

      if (sentCount === 0) {
        toast('No follow-ups are due right now');
        return;
      }
      toast.success(`Sent ${sentCount} follow-up SMS`);
    } catch (error) {
      console.error('Failed to send follow-up SMS:', error);
      toast.error('Failed to send due follow-up SMS');
    } finally {
      setIsRemessaging(false);
    }
  }, [isRemessaging]);

  const connectAndSendDueFollowUps = useCallback(async () => {
    if (isConnecting || isRemessaging) return;
    await connectTopFiveUntaggedLeads();
    await sendDueFollowUpSms();
  }, [isConnecting, isRemessaging, connectTopFiveUntaggedLeads, sendDueFollowUpSms]);

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
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="e.g. Ravi Patel"
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Mobile *
                </label>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="\d{10}"
                  maxLength={10}
                  value={newLeadMobile}
                  onChange={(e) => setNewLeadMobile(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit number"
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
                ) : 'Save Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lead List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 flex flex-col items-center gap-3">
          <Users size={40} className="text-gray-200" />
          <p className="text-sm font-bold text-gray-500">No leads yet</p>
          <p className="text-xs text-gray-400">Add your first lead using the + button</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onWhatsApp={sendWhatsApp}
              onDelete={deleteLead}
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

    </div>
  );
}
