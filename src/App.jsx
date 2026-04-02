import { useState, useEffect } from 'react'
import { useClientStore } from './store/clientStore'
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  Plus, 
  TrendingUp, 
  Package, 
  Menu,
  X
} from 'lucide-react'
import ClientList from './components/ClientList'
import AddClient from './components/AddClient'
import OrdersDashboard from './components/OrdersDashboard'
import PaymentDashboard from './components/PaymentDashboard'
import LeadsDashboard from './components/LeadsDashboard'
import StockDashboard from './components/StockDashboard'

function App() {
  const [activeTab, setActiveTab] = useState('orders')
  const [isSidebarOpen, setSidebarOpen] = useState(false)
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
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
    { id: 'stock', label: 'Inventory', icon: <Package size={20} /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard size={20} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
    { id: 'leads', label: 'Leads', icon: <TrendingUp size={20} /> },
  ]

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#131921] text-white flex-col p-6 fixed h-full">
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

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24 md:pb-8">
        <header className="flex justify-between items-center mb-6 md:hidden">
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI<span className="text-[#ff9900]">WATER</span></h1>
          <button className="p-2 bg-white rounded-lg shadow-sm"><Menu size={20}/></button>
        </header>

        <div className="max-w-5xl mx-auto">
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
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              activeTab === item.id ? 'text-[#ff9900]' : 'text-gray-400'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-black uppercase tracking-tight">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
