import { useEffect, useState } from 'react';
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
import {
  buildFollowUpSmsMessage,
  buildFollowUpUpdate,
  buildInitialSmsMessage,
  buildInitialSmsUpdate,
  getDueReminderContext,
  getLeadPhone,
  sendBackgroundSms,
} from '../services/leadSmsService';

// Inline spinner used inside action buttons
function ButtonSpinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// Returns avatar background colour keyed on Tag value
function avatarColor(tag) {
  if (tag === 'SMS_SENT') return 'bg-orange-100 text-orange-600';
  if (tag === 'FOLLOWUP_DONE') return 'bg-green-100 text-green-600';
  return 'bg-gray-100 text-gray-500';
}

// Small inline status badge
function StatusBadge({ tag }) {
  if (!tag) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
        New
      </span>
    );
  }
  if (tag === 'SMS_SENT') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-600 uppercase tracking-wide">
        SMS Sent
      </span>
    );
  }
  if (tag === 'FOLLOWUP_DONE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 uppercase tracking-wide">
        Followup Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
      {tag}
    </span>
  );
}

export default function LeadsDashboard() {
  const MACRO_URL =
    import.meta.env.VITE_MACRO_URL ||
    'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms';

  const [leads, setLeads] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadMobile, setNewLeadMobile] = useState('');
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRemessaging, setIsRemessaging] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'leads'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const getLeadDate = (lead) => {
        const rawDate = lead.createdAt || lead.createdDate || lead.date;
        if (!rawDate) return new Date(0);
        if (rawDate?.toDate) return rawDate.toDate();
        return new Date(rawDate);
      };

      const sorted = docs.sort((a, b) => getLeadDate(b) - getLeadDate(a));
      setLeads(sorted);
    });
    return unsub;
  }, []);

  // Derived counts
  const untaggedCount = leads.filter(l => !l.Tag).length;
  const smsSentCount = leads.filter(l => l.Tag === 'SMS_SENT').length;

  const sendWhatsApp = (lead) => {
    const displayName = lead.name || 'Sir/Madam';
    const msg = `Hello ${displayName}, Greetings from *Annapurna Foods, Vadodara*! ✨ \n\nPlanning an event? Make it premium with our 200ml Packaged Water Bottles. Perfect size and crystal clear quality. 💧\n\nShall we discuss your requirement?`;
    window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const deleteLead = async (leadId) => {
    try {
      await deleteDoc(doc(db, 'leads', leadId));
    } catch (error) {
      console.error('Failed to delete lead:', error);
    }
  };

  const saveManualLead = async (e) => {
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
      toast.success('Lead added successfully');
      setNewLeadName('');
      setNewLeadMobile('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add lead:', error);
      toast.error('Failed to add lead');
    } finally {
      setIsSavingLead(false);
    }
  };

  const connectTopFiveUntaggedLeads = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      const q = query(collection(db, 'leads'), where('Tag', '==', null), limit(5));
      const snapshot = await getDocs(q);
      if (snapshot.empty) { toast('No untagged leads found'); return; }
      let sentCount = 0;
      for (const leadDoc of snapshot.docs) {
        const lead = leadDoc.data();
        const mobile = getLeadPhone(lead);
        if (!mobile) continue;
        await sendBackgroundSms({ macroUrl: MACRO_URL, phone: mobile, message: buildInitialSmsMessage(lead.name) });
        await updateDoc(doc(db, 'leads', leadDoc.id), buildInitialSmsUpdate(new Date()));
        sentCount += 1;
      }
      if (sentCount === 0) { toast('No valid phone numbers found in selected leads'); return; }
      toast.success(`Connected ${sentCount} lead${sentCount > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Failed to connect leads:', error);
      toast.error('Failed to send SMS for leads');
    } finally {
      setIsConnecting(false);
    }
  };

  const sendDueFollowUpSms = async () => {
    if (isRemessaging) return;
    setIsRemessaging(true);
    try {
      const q = query(collection(db, 'leads'), where('Tag', '==', 'SMS_SENT'), limit(100));
      const snapshot = await getDocs(q);
      if (snapshot.empty) { toast('No SMS sent leads found'); return; }
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
        await sendBackgroundSms({ macroUrl: MACRO_URL, phone: mobile, message: buildFollowUpSmsMessage({ name: lead.name, reminderDay: context.reminderDay }) });
        await updateDoc(doc(db, 'leads', leadDoc.id), buildFollowUpUpdate({ lead, reminderDay: context.reminderDay, nextStep: context.nextStep, now }));
        sentCount += 1;
      }
      if (sentCount === 0) { toast('No follow-ups are due right now'); return; }
      toast.success(`Sent ${sentCount} follow-up SMS`);
    } catch (error) {
      console.error('Failed to send follow-up SMS:', error);
      toast.error('Failed to send due follow-up SMS');
    } finally {
      setIsRemessaging(false);
    }
  };

  // Advanced Date Formatter to catch old and new formats
  const formatDate = (lead) => {
    const rawDate = lead.createdAt || lead.createdDate || lead.date;
    if (!rawDate) return 'No Date Recorded';
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN');
    if (typeof rawDate === 'string') return rawDate;
    return new Date(rawDate).toLocaleDateString('en-IN');
  };

  // Format nextFollowUpAt for display
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

  return (
    <div className="space-y-4 pb-24">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 tracking-tight">Leads</h2>
        <span className="bg-orange-100 text-orange-600 px-2.5 py-1 rounded-lg text-xs font-bold">
          {leads.length}
        </span>
      </div>

      {/* ── Action Panel ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Row 1 — Connect */}
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
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
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

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-4" />

        {/* Row 2 — Re-message */}
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
            className="flex-shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all"
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
      </div>

      {/* ── Add Lead Modal ───────────────────────────────────────── */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => {
            if (isSavingLead) return;
            setShowAddForm(false);
            setNewLeadName('');
            setNewLeadMobile('');
          }}
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
                onClick={() => { setShowAddForm(false); setNewLeadName(''); setNewLeadMobile(''); }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition-colors"
                disabled={isSavingLead}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Name (optional)</label>
                <input
                  type="text"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  placeholder="e.g. Ravi Patel"
                  className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Mobile *</label>
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
                onClick={() => { setShowAddForm(false); setNewLeadName(''); setNewLeadMobile(''); }}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs uppercase transition-colors"
                disabled={isSavingLead}
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

      {/* ── Lead List ────────────────────────────────────────────── */}
      {leads.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 flex flex-col items-center gap-3">
          <Users size={40} className="text-gray-200" />
          <p className="text-sm font-bold text-gray-500">No leads yet</p>
          <p className="text-xs text-gray-400">Add your first lead using the + button</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => {
            const initials = lead.name
              ? lead.name.trim().charAt(0).toUpperCase()
              : null;
            const nextFollowUp = formatNextFollowUp(lead);
            const smsCount = lead.smsCount || 0;

            return (
              <div key={lead.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">

                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${avatarColor(lead.Tag)}`}>
                    {initials ? (
                      <span>{initials}</span>
                    ) : (
                      <Phone size={16} />
                    )}
                  </div>

                  {/* Middle info */}
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

                    {/* SMS_SENT extra line */}
                    {lead.Tag === 'SMS_SENT' && (
                      <p className="text-xs text-orange-500 mt-1 font-medium">
                        SMS {smsCount} sent{nextFollowUp ? ` · Next: ${nextFollowUp}` : ''}
                      </p>
                    )}

                    {/* FOLLOWUP_DONE extra line */}
                    {lead.Tag === 'FOLLOWUP_DONE' && (
                      <p className="text-xs text-green-600 mt-1 font-medium">
                        ✓ All follow-ups complete
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => sendWhatsApp(lead)}
                      className="flex items-center justify-center gap-1 bg-[#25D366] text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-95 transition-transform"
                    >
                      <MessageSquare size={13} />
                      WA
                    </button>
                    <a
                      href={`tel:${lead.mobile}`}
                      className="text-blue-500 p-2 bg-blue-50 rounded-xl active:scale-90 transition-transform"
                      aria-label="Call lead"
                    >
                      <Phone size={16} />
                    </a>
                    <button
                      onClick={() => deleteLead(lead.id)}
                      className="text-red-400 p-2 bg-red-50 rounded-xl active:scale-90 transition-transform"
                      aria-label="Delete lead"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FAB ─────────────────────────────────────────────────── */}
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
