import { useState, useEffect } from 'react'
import { useClientStore } from './store/clientStore'
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  TrendingUp, 
  Package, 
  Menu
} from 'lucide-react'
import ClientList from './components/ClientList'
import AddClient from './components/AddClient'
import OrdersDashboard from './components/OrdersDashboard'
import PaymentDashboard from './components/PaymentDashboard'
import LeadsDashboard from './components/LeadsDashboard'
import StockDashboard from './components/StockDashboard'

function App() {
  const [activeTab, setActiveTab] = useState('orders')
  const { fetchClients, fetchOrders, fetchStock } = useClientStore()

  useEffect(() => {
    const unsubClients = fetchClients()
    const unsubOrders = fetchOrders()
    const unsubStock = fetchStock()
    return () => {
      unsubClients()
      unsubOrders()
      unsubStock()
    }
  }, [])

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={22} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={22} /> },
    { id: 'payments', label: 'Pay', icon: <CreditCard size={22} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={22} /> },
    { id: 'leads', label: 'Leads', icon: <TrendingUp size={22} /> },
  ]

  return (
    <div className="h-screen w-full bg-[#f8f9fa] flex flex-col md:flex-row font-sans overflow-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#131921] text-white flex-col p-6 h-full flex-none z-40">
        <div className="mb-8 px-2">
          <h1 className="text-2xl font-black tracking-tighter text-[#ff9900]">ANJANI<span className="text-white">WATER</span></h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Management System</p>
        </div>
        <nav className="space-y-2 flex-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                activeTab === item.id 
                ? 'bg-[#ff9900] text-white shadow-lg shadow-orange-900/20' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main App Column */}
      <div className="flex-1 flex flex-col h-full relative w-full max-w-5xl mx-auto">
        
        {/* Mobile Header (Fixed Top) */}
        <header className="md:hidden flex-none bg-white p-4 shadow-sm z-20 flex justify-between items-center relative">
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI<span className="text-[#ff9900]">WATER</span></h1>
          <button className="p-2 bg-gray-50 rounded-lg text-gray-600"><Menu size={20}/></button>
        </header>

        {/* Scrollable Center Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          {activeTab === 'orders' && <OrdersDashboard />}
          {activeTab === 'stock' && <StockDashboard />}
          {activeTab === 'payments' && <PaymentDashboard />}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <AddClient />
              <ClientList />
            </div>
          )}
          {activeTab === 'leads' && <LeadsDashboard />}
        </main>

        {/* Mobile Bottom Nav (Fixed Bottom) */}
        <nav className="md:hidden flex-none bg-white border-t border-gray-200 z-[999] flex justify-around items-center h-[70px] pb-safe">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center w-[20%] h-full transition-all ${
                activeTab === item.id 
                ? 'text-[#ff9900]' 
                : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {item.icon}
              <span className={`text-[9px] mt-1 uppercase tracking-tight ${activeTab === item.id ? 'font-black' : 'font-bold'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>
        
      </div>
    </div>
  )
}

export default App
