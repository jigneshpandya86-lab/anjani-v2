import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import PaymentModal from './components/PaymentModal';
import PaymentDashboard from './components/PaymentDashboard';
import LeadsDashboard from './components/LeadsDashboard';
import { Menu, Plus, X, Users, ShoppingBag, CreditCard, Target } from 'lucide-react';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('clients');
  const [modalType, setModalType] = useState(null); 
  const [selectedClient, setSelectedClient] = useState(null);
  const fetchClients = useClientStore(state => state.fetchClients);

  useEffect(() => {
    const unsubscribe = fetchClients();
    return () => unsubscribe();
  }, []);

  const closeModals = () => {
    setModalType(null);
    setSelectedClient(null);
  };

  return (
    <div className="bg-gray-50 min-h-screen pb-24 font-sans">
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-40 p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="text-gray-900"><Menu size={22} /></button>
          <h1 className="font-black tracking-tighter text-base uppercase">Anjani <span className="text-[#ff9900]">V2</span></h1>
        </div>
      </header>

      {/* SIDEBAR */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="bg-white w-64 h-full shadow-2xl animate-slide-right p-6">
            <div className="flex justify-between items-center mb-8">
              <span className="font-black text-xs uppercase tracking-widest text-gray-400">Main Menu</span>
              <X onClick={() => setIsMenuOpen(false)} className="text-gray-300" />
            </div>
            <nav className="space-y-1">
              {[
                { id: 'clients', label: 'Clients', icon: <Users size={18}/> },
                { id: 'leads', label: 'Leads', icon: <Target size={18}/> },
                { id: 'payments', label: 'Ledger', icon: <CreditCard size={18}/> },
              ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl font-bold text-xs transition-all ${activeTab === item.id ? 'bg-orange-50 text-[#ff9900]' : 'text-gray-400 hover:bg-gray-50'}`}
                >
                  {item.icon} {item.label.toUpperCase()}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}

      <main className="p-4 max-w-xl mx-auto">
        {activeTab === 'clients' && <ClientList onEdit={(c) => { setSelectedClient(c); setModalType('edit'); }} onPay={(c) => { setSelectedClient(c); setModalType('payment'); }} />}
        {activeTab === 'leads' && <LeadsDashboard />}
        {activeTab === 'payments' && <PaymentDashboard />}
      </main>

      {/* SLIM GLASS BOTTOM BAR */}
      <nav className="fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-lg border border-gray-200 h-16 rounded-2xl flex justify-around items-center shadow-lg z-40 px-4">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'clients' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <Users size={20} />
          <span className="text-[8px] font-black uppercase">Clients</span>
        </button>

        <button onClick={() => setModalType('add')} className="bg-[#ff9900] text-white p-3 rounded-xl shadow-orange-200 shadow-lg -mt-8 border-4 border-gray-50 active:scale-95 transition-all">
          <Plus size={20} strokeWidth={4} />
        </button>

        <button onClick={() => setActiveTab('leads')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'leads' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <Target size={20} />
          <span className="text-[8px] font-black uppercase">Leads</span>
        </button>
      </nav>

      {/* MODAL ENGINE */}
      {modalType && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-[32px] p-8 shadow-2xl relative animate-slide-up">
            <div className="w-12 h-1.5 bg-gray-100 rounded-full mx-auto -mt-4 mb-6" onClick={closeModals} />
            {modalType === 'add' && <AddClient onDone={closeModals} />}
            {modalType === 'edit' && <AddClient client={selectedClient} onDone={closeModals} />}
            {modalType === 'payment' && <PaymentModal client={selectedClient} onClose={closeModals} />}
          </div>
        </div>
      )}
    </div>
  );
}
