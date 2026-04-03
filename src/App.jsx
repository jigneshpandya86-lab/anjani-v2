import { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { useClientStore } from './store/clientStore'
import {
  Users,
  ShoppingCart,
  CreditCard,
  TrendingUp,
  Package,
  Menu,
  Plus,
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
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [payClient, setPayClient] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={20} /> },
    { id: 'payments', label: 'Transactions', icon: <CreditCard size={20} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
    { id: 'leads', label: 'Leads', icon: <TrendingUp size={20} /> },
  ]

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <Toaster position="top-center" toastOptions={{ style: { background: '#ffffff', color: '#131921', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', borderRadius: '12px', fontWeight: '900', fontSize: '14px', padding: '16px 24px' }, success: { iconTheme: { primary: '#25D366', secondary: '#fff' } }, error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } } }} />

      {/* Unified Top Header (all screen sizes) */}
      <header className="sticky top-0 bg-white shadow-sm z-40 flex items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h1>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen">
        <div className="max-w-5xl mx-auto w-full pb-28">
          {activeTab === 'orders' && <OrdersDashboard onEdit={setEditOrder} onCopy={(o) => setEditOrder({ ...o, id: null })} />}
          {activeTab === 'stock' && <StockDashboard />}
          {activeTab === 'payments' && <PaymentDashboard />}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <ClientList
                onEdit={setEditClient}
                onPay={setPayClient}
                onOrder={(client) => setEditOrder({ clientId: client.id })}
              />
            </div>
          )}
          {activeTab === 'leads' && <LeadsDashboard />}
        </div>
      </div>

      {/* Slide-in Drawer (all screen sizes) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[1001]">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h2>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map(item => (
                <button key={`drawer-${item.id}`}
                  onClick={() => { setActiveTab(item.id); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === item.id
                      ? 'bg-orange-50 text-[#131921] border border-orange-100'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  <span className={activeTab === item.id ? 'text-[#ff9900]' : 'text-gray-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Order Modal */}
      {editOrder !== null && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setEditOrder(null)}>
          <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 pt-12" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setEditOrder(null)}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close order form"
            >
              <X size={18} />
            </button>
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

      {/* Add Client Modal */}
      {addClientOpen && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setAddClientOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <AddClient onDone={() => setAddClientOpen(false)} />
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payClient !== null && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setPayClient(null)}>
          <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 pt-12 md:p-6 md:pt-12" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPayClient(null)}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close payment form"
            >
              <X size={18} />
            </button>
            <PaymentModal client={payClient} onClose={() => setPayClient(null)} />
          </div>
        </div>
      )}

      {/* Bottom Navigation (all screen sizes) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 pt-1.5 pb-4 flex justify-around items-center z-[999] shadow-[0_-10px_20px_rgba(0,0,0,0.08)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-[19%] py-1.5 rounded-xl transition-all ${
              activeTab === item.id
                ? 'text-[#ff9900] bg-[#fff4e5] shadow-[0_4px_10px_rgba(255,153,0,0.15)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label={`Open ${item.label}`}
          >
            {item.icon}
            <span className={`text-[9px] mt-0.5 uppercase tracking-tight ${activeTab === item.id ? 'font-black' : 'font-bold'}`}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* FAB: New Order (Orders tab) */}
      {activeTab === 'orders' && (
        <button
          onClick={() => setEditOrder({})}
          className="fixed bottom-24 right-4 z-[998] bg-[#ff9900] text-white w-14 h-14 rounded-full shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="New Order"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* FAB: Add Client (Clients tab) */}
      {activeTab === 'clients' && (
        <button
          onClick={() => setAddClientOpen(true)}
          className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="Add new client"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* FAB: Record Payment (Transactions tab) */}
      {activeTab === 'payments' && (
        <button
          onClick={() => setPayClient({})}
          className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="Record payment"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

    </div>
  )
}

export default App
