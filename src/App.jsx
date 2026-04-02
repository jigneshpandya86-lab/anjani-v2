import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import PaymentModal from './components/PaymentModal';
import PaymentDashboard from './components/PaymentDashboard';
import LeadsDashboard from './components/LeadsDashboard';
import { Menu, Plus, X, Users, ShoppingBag, BarChart3, Package, CreditCard, Target } from 'lucide-react';

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

  const menuItems = [
    { id: 'clients', label: 'Clients', icon: <Users size={20}/> },
    { id: 'leads', label: 'Inquiries/Leads', icon: <Target size={20}/> },
    { id: 'payments', label: 'Payments', icon: <CreditCard size={20}/> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag size={20}/> },
  ];

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      <header className="bg-[#131921] text-white sticky top-0 z-40 p-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="p-1 hover:bg-white/10 rounded outline-none">
            <Menu size={24} className="text-[#ff9900]" />
          </button>
          <h1 className="font-black tracking-tighter text-lg uppercase italic">Anjani <span className="text-[#ff9900] text-xs">V2</span></h1>
        </div>
        {activeTab === 'leads' && <div className="animate-pulse bg-red-500 w-2 h-2 rounded-full mr-2"></div>}
      </header>

      {/* SIDEBAR */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="bg-white w-72 h-full shadow-2xl flex flex-col animate-slide-right">
            <div className="p-6 bg-[#131921] text-white flex justify-between items-center">
              <span className="font-black uppercase tracking-widest text-sm">ERP MENU</span>
              <X onClick={() => setIsMenuOpen(false)} className="cursor-pointer text-[#ff9900]" />
            </div>
            <nav className="flex-1 p-3 space-y-2">
              {menuItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl font-black text-xs transition-all ${activeTab === item.id ? 'bg-orange-50 text-[#ff9900] shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`}
                >
                  {item.icon} {item.label.toUpperCase()}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}

      <main className="p-3 max-w-2xl mx-auto">
        {activeTab === 'clients' && (
          <ClientList 
            onEdit={(client) => { setSelectedClient(client); setModalType('edit'); }} 
            onPay={(client) => { setSelectedClient(client); setModalType('payment'); }}
          />
        )}
        {activeTab === 'leads' && <LeadsDashboard />}
        {activeTab === 'payments' && <PaymentDashboard />}
        
        {['orders', 'stock'].includes(activeTab) && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-300">
             <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 text-center">
              <p className="font-black text-gray-800 uppercase tracking-tighter mb-1">{activeTab} system</p>
              <p className="text-[10px] uppercase font-black text-orange-400">Phase 3 Deployment</p>
            </div>
          </div>
        )}
      </main>

      {/* FLOATING MODALS */}
      {modalType && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-end sm:items-center justify-center backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl relative animate-slide-up">
            <button onClick={closeModals} className="absolute right-8 top-8 text-gray-300 hover:text-gray-900"><X /></button>
            {modalType === 'add' && <AddClient onDone={closeModals} />}
            {modalType === 'edit' && <AddClient client={selectedClient} onDone={closeModals} />}
            {modalType === 'payment' && <PaymentModal client={selectedClient} onClose={closeModals} />}
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-6 right-6 bg-[#131921] rounded-[30px] px-8 py-4 flex justify-between items-center shadow-2xl z-40 border border-white/10">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center transition-all ${activeTab === 'clients' ? 'text-[#ff9900] scale-110' : 'text-gray-500'}`}>
          <Users size={22} />
          <span className="text-[8px] mt-1 font-black uppercase">Clients</span>
        </button>

        <button 
          onClick={() => { setModalType('add'); }}
          className="bg-[#ff9900] text-[#131921] p-3 rounded-2xl shadow-lg active:scale-90 transition-all"
        >
          <Plus size={24} strokeWidth={3} />
        </button>

        <button onClick={() => setActiveTab('leads')} className={`flex flex-col items-center transition-all ${activeTab === 'leads' ? 'text-[#ff9900] scale-110' : 'text-gray-500'}`}>
          <Target size={22} />
          <span className="text-[8px] mt-1 font-black uppercase">Leads</span>
        </button>
      </nav>
    </div>
  );
}
