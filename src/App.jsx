import { useState, useEffect } from 'react';
import { useClientStore } from './store/clientStore';
import ClientList from './components/ClientList';
import AddClient from './components/AddClient';
import { Menu, Search, Plus, X, Users, ShoppingBag, BarChart3, Package, CreditCard } from 'lucide-react';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('clients');
  const [showAddModal, setShowAddModal] = useState(false);
  const [clientToEdit, setClientToEdit] = useState(null); // Add this line!
  const fetchClients = useClientStore(state => state.fetchClients);

  useEffect(() => {
    const unsubscribe = fetchClients();
    return () => unsubscribe();
  }, []);

  const menuItems = [
    { id: 'clients', label: 'Clients', icon: <Users size={20}/> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag size={20}/> },
    { id: 'stock', label: 'Stock Management', icon: <Package size={20}/> },
    { id: 'payments', label: 'Payments/Ledger', icon: <CreditCard size={20}/> },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={20}/> },
  ];

  return (
    <div className="bg-gray-100 min-h-screen pb-24">
      {/* --- TOP HEADER & GLOBAL SEARCH --- */}
      <header className="bg-amz-navy text-white sticky top-0 z-40 p-3 shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => setIsMenuOpen(true)} className="p-1 hover:bg-white/10 rounded">
            <Menu size={24} className="text-amz-orange" />
          </button>
          <h1 className="font-bold tracking-tight">ANJANI <span className="text-amz-orange text-xs">V2</span></h1>
        </div>
      </header>

      {/* --- SIDEBAR MENU --- */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="bg-white w-72 h-full shadow-2xl flex flex-col">
            <div className="p-5 bg-amz-navy text-white flex justify-between items-center">
              <span className="font-bold">Main Menu</span>
              <X onClick={() => setIsMenuOpen(false)} className="cursor-pointer" />
            </div>
            <nav className="flex-1 p-2 space-y-1">
              {menuItems.map(item => (
                <button 
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg font-medium transition-colors ${activeTab === item.id ? 'bg-orange-50 text-amz-orange' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </nav>
            <div className="p-4 border-t text-center text-xs text-gray-400">Version 2.0.4 - Anjani Water</div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}

      {/* Update ClientList to pass the client */}
      <main className="p-3">
        {activeTab === 'clients' && <ClientList onEdit={(client) => { setClientToEdit(client); setShowAddModal(true); }} />}
      </main>

      {/* Pass the clientToEdit into the modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl relative animate-slide-up">
            <button onClick={() => setShowAddModal(false)} className="absolute right-4 top-4 text-gray-400"><X /></button>
            <AddClient client={clientToEdit} onDone={() => setShowAddModal(false)} />
          </div>
        </div>
      )}

      {/* Update the Bottom Plus button so it opens a BLANK form */}
      <button 
          onClick={() => { setClientToEdit(null); setShowAddModal(true); }}
          className="bg-amz-navy text-white p-4 rounded-full -mt-10 shadow-xl border-4 border-gray-100 active:scale-95 transition-transform"
        >

      {/* --- BOTTOM NAVIGATION --- */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex justify-between items-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-40">
        <button onClick={() => setActiveTab('clients')} className={`flex flex-col items-center ${activeTab === 'clients' ? 'text-amz-orange' : 'text-gray-400'}`}>
          <Users size={24} />
          <span className="text-[10px] mt-1 font-bold">CLIENTS</span>
        </button>
        
        {/* Floating Action Button */}
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-amz-navy text-white p-4 rounded-full -mt-10 shadow-xl border-4 border-gray-100 active:scale-95 transition-transform"
        >
          <Plus size={28} className="text-amz-orange" />
        </button>

        <button onClick={() => setActiveTab('orders')} className={`flex flex-col items-center ${activeTab === 'orders' ? 'text-amz-orange' : 'text-gray-400'}`}>
          <ShoppingBag size={24} />
          <span className="text-[10px] mt-1 font-bold">ORDERS</span>
        </button>
      </nav>
    </div>
  );
}
