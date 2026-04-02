import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import PaymentModal from './components/PaymentModal';
import PaymentDashboard from './components/PaymentDashboard';
import { Menu, Plus, X, Users, ShoppingBag, BarChart3, Package, CreditCard } from 'lucide-react';

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
    { id: 'payments', label: 'Payments', icon: <CreditCard size={20}/> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag size={20}/> },
    { id: 'stock', label: 'Stock', icon: <Package size={20}/> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={20}/> },
  ];

  return (
    <div className="bg-gray-50 min-h-screen pb-24">
      <header className="bg-[#131921] text-white sticky top-0 z-40 p-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="p-1 hover:bg-white/10 rounded outline-none">
            <Menu size={24} className="text-[#ff9900]" />
          </button>
          <h1 className="font-bold tracking-tight text-lg uppercase italic">Anjani <span className="text-[#ff9900] text-xs">V2</span></h1>
        </div>
      </header>

      {isMenuOpen && (
        <div className="fixed inset-0 z-[100] flex">
          <div className="bg-white w-72 h-full shadow-2xl flex flex-col">
            <div className="p-5 bg-[#131921] text-white flex justify-between items-center">
              <span className="font-bold uppercase tracking-widest text-sm">Main Menu</span>
              <X onClick={() => setIsMenuOpen(false)} className="cursor-pointer text-[#ff9900]" />
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {menuItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg font-bold text-sm transition-colors ${activeTab === item.id ? 'bg-orange-50 text-[#ff9900]' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  {item.icon} {item.label.toUpperCase()}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}

      <main className="p-3">
        {activeTab === 'clients' && (
          <ClientList 
            onEdit={(client) => { setSelectedClient(client); setModalType('edit'); }} 
            onPay={(client) => { setSelectedClient(client); setModalType('payment'); }}
          />
        )}
        {activeTab === 'payments' && <PaymentDashboard />}
        {['orders', 'stock', 'reports'].includes(activeTab) && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-center">
             <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <p className="font-black text-gray-800 uppercase tracking-tighter mb-1">{activeTab} Module</p>
              <p className="text-[10px] uppercase font-bold text-orange-400">Under Construction</p>
            </div>
          </div>
        )}
      </main>

      {modalType && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative">
            <button onClick={closeModals} className="absolute right-6 top-6 text-gray-300"><X /></button>
            {modalType === 'add' && <AddClient onDone={closeModals} />}
            {modalType === 'edit' && <AddClient client={selectedClient} onDone={closeModals} />}
            {modalType === 'payment' && <PaymentModal client={selectedClient} onClose={closeModals} />}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-10 py-3 flex justify-between items-center shadow-2xl z-40">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center ${activeTab === 'clients' ? 'text-[#ff9900]' : 'text-gray-300'}`}>
          <Users size={24} />
          <span className="text-[9px] mt-1 font-black uppercase">Clients</span>
        </button>
        <button onClick={() => { setModalType('add'); }} className="bg-[#131921] text-white p-4 rounded-full -mt-12 shadow-2xl border-4 border-gray-50 active:scale-90 transition-all">
          <Plus size={28} className="text-[#ff9900]" />
        </button>
        <button onClick={() => setActiveTab('payments')} className={`flex flex-col items-center ${activeTab === 'payments' ? 'text-[#ff9900]' : 'text-gray-300'}`}>
          <CreditCard size={24} />
          <span className="text-[9px] mt-1 font-black uppercase">Ledger</span>
        </button>
      </nav>
    </div>
  );
}
