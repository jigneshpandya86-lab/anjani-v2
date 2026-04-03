import { useState, useEffect, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { useClientStore } from './store/clientStore'
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  TrendingUp, 
  Package, 
  MoreVertical,
  X
} from 'lucide-react'
import ClientList from './components/ClientList'
import AddClient from './components/AddClient'
import OrdersDashboard from './components/OrdersDashboard'
import OrderModal from './components/OrderModal'
import PaymentDashboard from './components/PaymentDashboard'
import PaymentModal from './components/PaymentModal'
import LeadsDashboard from './components/LeadsDashboard'
import StockDashboard from './components/StockDashboard'

function App() {
  const [activeTab, setActiveTab] = useState('orders')
  const [editOrder, setEditOrder] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [payClient, setPayClient] = useState(null)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileActionsRef = useRef(null)
  const { fetchClients, fetchOrders, fetchStock } = useClientStore()

  useEffect(() => {
    const unsubClients = fetchClients()
    const unsubOrders = fetchOrders()
    const unsubStock = fetchStock()
    return () => {
      if (unsubClients) unsubClients()
      if (unsubOrders) unsubOrders()
      if (unsubStock) unsubStock()
    }
  }, [])

  useEffect(() => {
    if (!mobileActionsOpen) return

    const handleOutsideClick = (event) => {
      if (!mobileActionsRef.current) return
      if (!mobileActionsRef.current.contains(event.target)) {
        setMobileActionsOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileActionsOpen(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileActionsOpen])

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={22} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={22} /> },
    { id: 'payments', label: 'Pay', icon: <CreditCard size={22} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={22} /> },
    { id: 'leads', label: 'Leads', icon: <TrendingUp size={22} /> },
  ]

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <Toaster position="top-center" toastOptions={{ style: { background: '#ffffff', color: '#131921', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', borderRadius: '12px', fontWeight: '900', fontSize: '14px', padding: '16px 24px' }, success: { iconTheme: { primary: '#25D366', secondary: '#fff' } }, error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } } }} />
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-[#131921] text-white flex-col p-6 fixed top-0 left-0 h-full z-50 shadow-xl">
        <div className="mb-8 px-2">
          <h1 className="text-2xl font-black tracking-tighter text-[#ff9900]">ANJANI<span className="text-white">WATER</span></h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Management</p>
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

      {/* Main Content Area */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        
        {/* Mobile Header (Sticky Top) */}
        <header className="md:hidden sticky top-0 bg-white p-4 shadow-sm z-40 flex justify-between items-center">
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI<span className="text-[#ff9900]">WATER</span></h1>
          <div className="relative" ref={mobileActionsRef}>
            <button
              onClick={() => setMobileActionsOpen((prev) => !prev)}
              className="p-2 bg-gray-50 rounded-lg text-gray-600 border border-gray-100"
              aria-haspopup="menu"
              aria-expanded={mobileActionsOpen}
              aria-label="Open quick actions"
            >
              {mobileActionsOpen ? <X size={18} /> : <MoreVertical size={18} />}
            </button>

            {mobileActionsOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
                {navItems.map((item) => (
                  <button
                    key={`mobile-action-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id)
                      setMobileActionsOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-bold text-left ${
                      activeTab === item.id ? 'bg-[#fff4e5] text-[#131921]' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                    role="menuitem"
                  >
                    <span className={`${activeTab === item.id ? 'text-[#ff9900]' : 'text-gray-400'}`}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="max-w-5xl mx-auto pb-28 md:pb-0">
          {/* Explicitly rendering active tabs */}
          {activeTab === 'orders' && <OrdersDashboard onEdit={setEditOrder} onCopy={(o) => setEditOrder({ ...o, id: null })} onAdd={() => setEditOrder({})} />}
          {activeTab === 'stock' && <StockDashboard />}
          {activeTab === 'payments' && <PaymentDashboard />}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <AddClient />
              <ClientList onEdit={setEditClient} onPay={setPayClient} />
            </div>
          )}
          {activeTab === 'leads' && <LeadsDashboard />}
        </div>
      </div>

      {/* Order Modal */}
      {editOrder !== null && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setEditOrder(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <OrderModal orderToEdit={editOrder} onClose={() => setEditOrder(null)} />
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editClient !== null && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setEditClient(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <AddClient client={editClient} onDone={() => setEditClient(null)} />
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payClient !== null && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setPayClient(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <PaymentModal client={payClient} onClose={() => setPayClient(null)} />
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation - FIXED: High Z-Index, explicit styling */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 pt-2 pb-6 flex justify-around items-center z-[999] shadow-[0_-10px_20px_rgba(0,0,0,0.08)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-[19%] py-2 rounded-xl transition-all ${
              activeTab === item.id
                ? 'text-[#ff9900] bg-[#fff4e5] shadow-[0_4px_10px_rgba(255,153,0,0.15)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label={`Open ${item.label}`}
          >
            {item.icon}
            <span className={`text-[10px] mt-1 uppercase tracking-tight ${activeTab === item.id ? 'font-black' : 'font-bold'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Mobile Side Navigation Drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-[1001]">
          <button
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black tracking-tight text-[#131921]">Menu</h2>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-lg border border-gray-200 text-gray-600"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={`drawer-${item.id}`}
                  onClick={() => {
                    setActiveTab(item.id)
                    setMobileNavOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold ${
                    activeTab === item.id ? 'bg-[#fff4e5] text-[#131921]' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className={`${activeTab === item.id ? 'text-[#ff9900]' : 'text-gray-400'}`}>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

    </div>
  )
}

export default App
