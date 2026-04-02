import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import PaymentModal from './components/PaymentModal';
import PaymentDashboard from './components/PaymentDashboard';
import LeadsDashboard from './components/LeadsDashboard';
import OrdersDashboard from './components/OrdersDashboard';
import OrderModal from './components/OrderModal';
import { Menu, Plus, X, Users, ShoppingBag, CreditCard, Target, FilePlus, UserPlus } from 'lucide-react';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('orders'); // Defaulting to orders to see the new feature!
  const [modalType, setModalType] = useState(null); 
  const [selectedData, setSelectedData] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  const fetchClients = useClientStore(state => state.fetchClients);
  const fetchOrders = useClientStore(state => state.fetchOrders);

  useEffect(() => {
    fetchClients();
    fetchOrders();
  }, []);

  const closeModals = () => {
    setModalType(null);
    setSelectedData(null);
    setShowAddMenu(false);
  };

  const openOrderModal = (data = null, isCopy = false) => {
    if (isCopy && data) {
      // Remove ID and status to make it a fresh order
      const { id, orderId, status, createdAt, proofUrl, ...copyData } = data;
      setSelectedData(copyData);
    } else {
      setSelectedData(data);
    }
    setModalType('order');
    setShowAddMenu(false);
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
                { id: 'orders', label: 'Dispatch', icon: <ShoppingBag size={18}/> },
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
        {activeTab === 'clients' && <ClientList onEdit={(c) => { setSelectedData(c); setModalType('editClient'); }} onPay={(c) => { setSelectedData(c); setModalType('payment'); }} />}
        {activeTab === 'leads' && <LeadsDashboard />}
        {activeTab === 'payments' && <PaymentDashboard />}
        {activeTab === 'orders' && <OrdersDashboard onEdit={(o) => openOrderModal(o)} onCopy={(o) => openOrderModal(o, true)} />}
      </main>

      {/* ADD MENU POPUP */}
      {showAddMenu && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-white rounded-3xl shadow-2xl border border-gray-100 p-2 flex flex-col gap-2 z-50 w-48 animate-slide-up">
          <button onClick={() => openOrderModal()} className="flex items-center gap-3 p-3 text-sm font-black text-gray-800 hover:bg-gray-50 rounded-xl">
            <FilePlus size={18} className="text-blue-500"/> New Order
          </button>
          <button onClick={() => {setModalType('addClient'); setShowAddMenu(false);}} className="flex items-center gap-3 p-3 text-sm font-black text-gray-800 hover:bg-gray-50 rounded-xl">
            <UserPlus size={18} className="text-green-500"/> New Client
          </button>
        </div>
      )}

      {/* SLIM GLASS BOTTOM BAR */}
      <nav className="fixed bottom-4 left-4 right-4 bg-white/90 backdrop-blur-lg border border-gray-200 h-16 rounded-3xl flex justify-around items-center shadow-lg z-40 px-4">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'clients' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <Users size={20} />
        </button>

        <button onClick={() => setShowAddMenu(!showAddMenu)} className={`p-4 rounded-2xl shadow-orange-200 shadow-xl -mt-8 border-4 border-gray-50 active:scale-95 transition-all ${showAddMenu ? 'bg-[#131921] text-white rotate-45' : 'bg-[#ff9900] text-white'}`}>
          <Plus size={24} strokeWidth={4} />
        </button>

        <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center gap-0.5 ${activeTab === 'orders' ? 'text-[#ff9900]' : 'text-gray-400'}`}>
          <ShoppingBag size={20} />
        </button>
      </nav>

      {/* MODAL ENGINE */}
      {modalType && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-[32px] p-6 sm:p-8 shadow-2xl relative animate-slide-up max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto -mt-2 mb-6" onClick={closeModals} />
            {modalType === 'addClient' && <AddClient onDone={closeModals} />}
            {modalType === 'editClient' && <AddClient client={selectedData} onDone={closeModals} />}
            {modalType === 'payment' && <PaymentModal client={selectedData} onClose={closeModals} />}
            {modalType === 'order' && <OrderModal orderToEdit={selectedData} onClose={closeModals} />}
          </div>
        </div>
      )}
    </div>
  );
}
