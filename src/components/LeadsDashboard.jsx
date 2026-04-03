import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase-config';
import { MessageSquare, Send, User, Phone, Sparkles, Trash2 } from 'lucide-react';

export default function LeadsDashboard() {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'leads'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const sorted = docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || a.date || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || b.date || 0);
        return dateB - dateA;
      });
      
      setLeads(sorted);
    });
    return unsub;
  }, []);

  const sendWhatsApp = (lead) => {
    const displayName = lead.name || 'Sir/Madam';
    const msg = `Hello ${displayName}, Greetings from *Annapurna Foods, Vadodara*! ✨ \n\nPlanning an event? Make it premium with our 200ml Packaged Water Bottles. Perfect size and crystal clear quality. 💧\n\nShall we discuss your requirement?`;
    window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const sendSMS = (lead) => {
    const displayName = lead.name || 'there';
    const msg = `Hi ${displayName}, refresh your guests with Annapurna Foods 200ml water bottles. Premium quality for events in Vadodara. Call us now!`;
    window.open(`sms:+91${lead.mobile}?body=${encodeURIComponent(msg)}`, '_blank');
  };


  const deleteLead = async (leadId) => {
    try {
      await deleteDoc(doc(db, 'leads', leadId));
    } catch (error) {
      console.error('Failed to delete lead:', error);
    }
  };

  // Advanced Date Formatter to catch old and new formats
  const formatDate = (lead) => {
    const rawDate = lead.createdAt || lead.date;
    if (!rawDate) return "No Date Recorded";
    if (rawDate.toDate) return rawDate.toDate().toLocaleDateString('en-IN');
    if (typeof rawDate === 'string') return rawDate;
    return new Date(rawDate).toLocaleDateString('en-IN');
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
          <Sparkles className="text-[#ff9900]" size={20} /> Inquiries
        </h2>
        <span className="bg-orange-100 text-[#ff9900] px-2 py-0.5 rounded-lg text-[10px] font-black italic">
          {leads.length} LEADS
        </span>
      </div>

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
                  <h3 className="font-bold text-gray-900 text-sm uppercase truncate">{lead.name || lead.mobile || 'No Details'}</h3>
                  <p className="text-[10px] font-bold text-[#c4a484] uppercase tracking-widest mt-0.5 whitespace-nowrap">
                    {formatDate(lead)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => sendWhatsApp(lead)} className="flex items-center justify-center gap-1 bg-[#25D366] text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-[0.98] transition-transform whitespace-nowrap">
                  <MessageSquare size={14} /> WA
                </button>
                <button onClick={() => sendSMS(lead)} className="flex items-center justify-center gap-1 bg-gray-900 text-white px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-[0.98] transition-transform whitespace-nowrap">
                  <Send size={14} /> SMS
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
    </div>
  );
}
