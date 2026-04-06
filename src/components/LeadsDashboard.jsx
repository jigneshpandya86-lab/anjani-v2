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
import { MessageSquare, User, Phone, Sparkles, Trash2, Plus } from 'lucide-react';
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
    // Manual in-app flow: operator presses Connect to trigger SMS for top 5 untagged leads.
    // This does not depend on any external Apps Script (.gs) runner.
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
        toast('No valid phone numbers found in selected leads');
        return;
      }

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
          message: buildFollowUpSmsMessage({
            name: lead.name,
            reminderDay: context.reminderDay,
          }),
        });

        await updateDoc(
          doc(db, 'leads', leadDoc.id),
          buildFollowUpUpdate({
            lead,
            reminderDay: context.reminderDay,
            nextStep: context.nextStep,
            now,
          }),
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
  };

  // Advanced Date Formatter to catch old and new formats
  const formatDate = (lead) => {
    const rawDate = lead.createdAt || lead.createdDate || lead.date;
    if (!rawDate) return "No Date Recorded";
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN');
    if (typeof rawDate === 'string') return rawDate;
    return new Date(rawDate).toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
          <Sparkles className="text-[#ff9900]" size={20} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isConnecting || isRemessaging}
              onClick={connectTopFiveUntaggedLeads}
              className="inline-flex items-center rounded-full border border-[#ff9900]/25 bg-[#ff9900]/10 px-3 py-1.5 text-[10px] font-bold leading-none text-[#ff9900] shadow-sm shadow-orange-100/60 disabled:opacity-60"
              title="Send SMS to top 5 untagged leads"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={isConnecting || isRemessaging}
              onClick={sendDueFollowUpSms}
              className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-50 px-3 py-1.5 text-[10px] font-bold leading-none text-blue-700 shadow-sm disabled:opacity-60"
              title="Send due follow-up SMS for SMS_SENT leads"
            >
              {isRemessaging ? 'Sending...' : 'Re-message due'}
            </button>
          </div>
        </h2>
        <span className="bg-orange-100 text-[#ff9900] px-2 py-0.5 rounded-lg text-[10px] font-black italic">
          {leads.length} LEADS
        </span>
      </div>

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
            <h3 className="text-sm font-black uppercase text-gray-800 tracking-wide">Add Lead Manually</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                placeholder="Lead name (optional)"
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200"
              />
              <input
                required
                type="tel"
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                value={newLeadMobile}
                onChange={(e) => setNewLeadMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile number"
                className="w-full p-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewLeadName('');
                  setNewLeadMobile('');
                }}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs uppercase"
                disabled={isSavingLead}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingLead}
                className="px-4 py-2 rounded-xl bg-[#ff9900] text-white font-bold text-xs uppercase disabled:opacity-60"
              >
                {isSavingLead ? 'Saving...' : 'Save Lead'}
              </button>
            </div>
          </form>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-100 text-gray-400 font-bold italic">
          No leads found in database...
        </div>
      ) : (
        leads.map(lead => (
          <div key={lead.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-3 items-center min-w-0">
                <div className="bg-gray-50 p-3 rounded-xl text-gray-400 shrink-0"><User size={18} /></div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm uppercase truncate whitespace-nowrap">
                    {lead.name || lead.mobile || 'No Details'}
                    <span className="text-[10px] font-bold text-[#c4a484] tracking-widest ml-2 align-middle">
                      {formatDate(lead)}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => sendWhatsApp(lead)} className="flex items-center justify-center gap-1 bg-[#25D366] text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-[0.98] transition-transform whitespace-nowrap">
                  <MessageSquare size={14} /> WA
                </button>
                <a href={`tel:${lead.mobile}`} className="text-blue-500 p-2 bg-blue-50 rounded-xl active:scale-90 transition-transform"><Phone size={18} /></a>
                <button
                  onClick={() => deleteLead(lead.id)}
                  className="text-red-500 p-2 bg-red-50 rounded-xl active:scale-90 transition-transform"
                  aria-label="Delete lead"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))
      )}


      <button
        type="button"
        onClick={() => setShowAddForm((prev) => !prev)}
        className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white flex items-center justify-center shadow-lg shadow-orange-300/50 active:scale-95 transition-all"
        aria-label="Manually add lead"
        title="Manually add lead"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

    </div>
  );
}
