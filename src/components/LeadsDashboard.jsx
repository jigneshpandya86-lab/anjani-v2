import { useEffect, useState } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { MessageSquare, Send, Calendar, User, Phone, Sparkles } from 'lucide-react';

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
          <div key={lead.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-3 items-center">
                <div className="bg-gray-50 p-3 rounded-xl text-gray-400"><User size={18} /></div>
                <div>
                  {/* Shows Name OR Mobile OR 'No Details' */}
                  <h3 className="font-bold text-gray-900 text-sm uppercase">{lead.name || lead.mobile || 'No Details'}</h3>
                  <p className="text-[10px] font-bold text-[#c4a484] uppercase tracking-widest mt-0.5 whitespace-nowrap">
                    {formatDate(lead)}
                  </p>
                </div>
              </div>
              <a href={`tel:${lead.mobile}`} className="text-blue-500 p-2 bg-blue-50 rounded-xl active:scale-90 transition-transform"><Phone size={18} /></a>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => sendWhatsApp(lead)} className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-[0.98] transition-transform">
                <MessageSquare size={14} /> WhatsApp
              </button>
              <button onClick={() => sendSMS(lead)} className="flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider active:scale-[0.98] transition-transform">
                <Send size={14} /> SMS
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
