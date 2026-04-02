import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase-config';
import { MessageSquare, Send, Calendar, User, Phone, Sparkles } from 'lucide-react';

export default function LeadsDashboard() {
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return unsub;
  }, []);

  const sendWhatsApp = (lead) => {
    const msg = `Hello ${lead.name || 'Sir/Madam'}, Greetings from *Annapurna Foods, Vadodara*! ✨ 

Planning an event? Make it premium with our 200ml Packaged Water Bottles. Perfect size, zero wastage, and crystal clear quality for your guests. 💧

Special bulk pricing available for today! Tap here to discuss your requirement.`;
    window.open(`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const sendSMS = (lead) => {
    const msg = `Hi ${lead.name || 'there'}, refresh your guests with Annapurna Foods 200ml water bottles. Premium quality & perfect for events in Vadodara. Call us now!`;
    window.open(`sms:+91${lead.mobile}?body=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
          <Sparkles className="text-[#ff9900]" size={20} /> New Leads
        </h2>
        <span className="bg-orange-100 text-[#ff9900] px-3 py-1 rounded-full text-[10px] font-black italic">
          {leads.length} POTENTIAL CUSTOMERS
        </span>
      </div>

      {leads.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
          <p className="text-gray-400 font-bold italic">Waiting for new inquiries...</p>
        </div>
      ) : (
        leads.map(lead => (
          <div key={lead.id} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 relative overflow-hidden group active:scale-[0.98] transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-3 items-center">
                <div className="bg-gray-100 p-3 rounded-2xl text-gray-600">
                  <User size={20} />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-lg uppercase leading-none">{lead.name || 'New Inquiry'}</h3>
                  <p className="text-xs font-bold text-gray-400 mt-1 flex items-center gap-1">
                    <Calendar size={10} /> {lead.createdAt?.toDate().toLocaleDateString('en-IN') || 'Just now'}
                  </p>
                </div>
              </div>
              <a href={`tel:${lead.mobile}`} className="bg-blue-50 p-3 rounded-2xl text-blue-600 hover:bg-blue-600 hover:text-white transition-colors">
                <Phone size={20} />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <button 
                onClick={() => sendWhatsApp(lead)}
                className="flex items-center justify-center gap-2 bg-[#25D366] text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-green-100"
              >
                <MessageSquare size={16} /> WhatsApp
              </button>
              <button 
                onClick={() => sendSMS(lead)}
                className="flex items-center justify-center gap-2 bg-[#131921] text-white py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-gray-200"
              >
                <Send size={16} /> Send SMS
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
