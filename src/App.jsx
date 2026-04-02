import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import PaymentModal from './components/PaymentModal';
import { Menu, Plus, X, Users, ShoppingBag, BarChart3, Package, CreditCard } from 'lucide-react';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('clients');
  const [modalType, setModalType] = useState(null); // 'add', 'edit', 'payment'
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
    <div className="bg-gray-100 min-h-screen pb-24 font-sans">
      <header className="bg-[#131921] text-white sticky top-0 z-40 p-4 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMenuOpen(true)} className="p-1 hover:bg-white/10 rounded">
            <Menu size={24} className="text-[#ff9900]" />
          </button>
          <h1 className="font-bold tracking-tight text-lg">ANJANI <span className="text-[#ff9900] text-xs">V2</span></h1>
        </div>
      </header>

      <main className="p-3">
        {activeTab === 'clients' && (
          <ClientList 
            onEdit={(client) => { setSelectedClient(client); setModalType('edit'); }} 
            onPay={(client) => { setSelectedClient(client); setModalType('payment'); }}
          />
        )}
      </main>

      {/* Slide-Up Modal Engine */}
      {modalType && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
            <button onClick={closeModals} className="absolute right-6 top-6 text-gray-400 p-1 hover:bg-gray-100 rounded-full"><X /></button>
            
            {modalType === 'add' && <AddClient onDone={closeModals} />}
            {modalType === 'edit' && <AddClient client={selectedClient} onDone={closeModals} />}
            {modalType === 'payment' && <PaymentModal client={selectedClient} onClose={closeModals} />}
          </div>
        </div>
      )}

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-8 py-3 flex justify-between items-center shadow-2xl z-40">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center ${activeTab === 'clients' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <Users size={24} />
          <span className="text-[10px] mt-1 font-bold">CLIENTS</span>
        </button>
        
        <button 
          onClick={() => { setModalType('add'); }}
          className="bg-[#131921] text-white p-4 rounded-full -mt-12 shadow-xl border-4 border-gray-100 active:scale-90 transition-transform"
        >
          <Plus size={28} className="text-[#ff9900]" />
        </button>

        <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center ${activeTab === 'orders' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <ShoppingBag size={24} />
          <span className="text-[10px] mt-1 font-bold">ORDERS</span>
        </button>
      </nav>
    </div>
  );
}
