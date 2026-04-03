import { useState, useEffect } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { useClientStore } from './store/clientStore'
import {
  ShoppingCart,
  Menu,
  Plus,
  X,
  ClipboardPlus,
  UserPlus,
  HandCoins,
  Printer,
  BookText,
  Search,
  Package,
  CreditCard,
  Users,
  TrendingUp
} from 'lucide-react'
import { collection, getDocs, query } from 'firebase/firestore'
import { db } from './firebase-config'
import ClientList from './components/ClientList'
import AddClient from './components/AddClient'
import OrdersDashboard from './components/OrdersDashboard'
import OrderModal from './components/OrderModal'
import PaymentDashboard from './components/PaymentDashboard'
import PaymentModal from './components/PaymentModal'
import LeadsDashboard from './components/LeadsDashboard'
import StockDashboard from './components/StockDashboard'

const APP_PIN = '9999'

function App() {
  const [activeTab, setActiveTab] = useState('orders')
  const [editOrder, setEditOrder] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [payClient, setPayClient] = useState(null)
  const [paymentPrefill, setPaymentPrefill] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false)
  const [ledgerClientId, setLedgerClientId] = useState('all')
  const [ledgerDateRange, setLedgerDateRange] = useState('current-month')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(() => sessionStorage.getItem('anjani-app-unlocked') === 'true')
  const { fetchClients, fetchOrders, fetchStock, fetchStockTotal, orders, clients } = useClientStore()

  useEffect(() => {
    if (!isUnlocked) return undefined

    const unsubClients = fetchClients()
    const unsubOrders = fetchOrders()
    const unsubStock = fetchStock()
    const unsubStockTotal = fetchStockTotal()
    return () => {
      if (unsubClients) unsubClients()
      if (unsubOrders) unsubOrders()
      if (unsubStock) unsubStock()
      if (unsubStockTotal) unsubStockTotal()
    }
  }, [fetchClients, fetchOrders, fetchStock, fetchStockTotal, isUnlocked])

  const verifyPin = (value) => {
    if (value !== APP_PIN) {
      setPinInput('')
      setPinError('Wrong PIN. Please try again.')
      return
    }

    setPinError('')
    setIsUnlocked(true)
    sessionStorage.setItem('anjani-app-unlocked', 'true')
  }

  const handlePinChange = (event) => {
    const nextValue = event.target.value.replace(/\D/g, '').slice(0, 4)
    setPinInput(nextValue)
    setPinError('')

    if (nextValue.length === 4) {
      verifyPin(nextValue)
    }
  }

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={20} /> },
    { id: 'payments', label: 'Transactions', icon: <CreditCard size={20} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
  ]

  const drawerNavItems = navItems

  const drawerQuickActions = [
    {
      id: 'quick-new-order',
      label: 'New Order',
      icon: <ClipboardPlus size={18} />,
      onClick: () => {
        setActiveTab('orders')
        setEditOrder({})
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-open-stock',
      label: 'Open Stock',
      icon: <Package size={18} />,
      onClick: () => {
        setActiveTab('stock')
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-open-transactions',
      label: 'Open Transactions',
      icon: <CreditCard size={18} />,
      onClick: () => {
        setActiveTab('payments')
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-open-clients',
      label: 'Open Clients',
      icon: <Users size={18} />,
      onClick: () => {
        setActiveTab('clients')
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-open-leads',
      label: 'Open Leads',
      icon: <TrendingUp size={18} />,
      onClick: () => {
        setActiveTab('leads')
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-add-client',
      label: 'Add Client',
      icon: <UserPlus size={18} />,
      onClick: () => {
        setActiveTab('clients')
        setAddClientOpen(true)
        setDrawerOpen(false)
      }
    },
    {
      id: 'quick-record-payment',
      label: 'Record Payment',
      icon: <HandCoins size={18} />,
      onClick: () => {
        setActiveTab('payments')
        setPayClient({})
        setPaymentPrefill(null)
        setDrawerOpen(false)
      }
    }
  ]

  const openReportWindow = ({ title, columns, rows, metadata = [], reportWindow: providedReportWindow = null }) => {
    const reportWindow = providedReportWindow || window.open('', '_blank', 'width=900,height=700')
    if (!reportWindow) {
      toast.error('Popup blocked. Please allow popups to generate PDF report.')
      return false
    }

    const generatedAt = new Date().toLocaleString('en-IN')
    const headerRow = columns.map((col) => `<th>${col}</th>`).join('')
    const bodyRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell || '-'}</td>`).join('')}</tr>`).join('')
    const metadataRows = metadata
      .filter(Boolean)
      .map((entry) => `<p class="meta">${entry}</p>`)
      .join('')

    reportWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .meta { margin-bottom: 16px; color: #6b7280; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 700; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p class="meta">Generated: ${generatedAt}</p>
          ${metadataRows}
          <table>
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
          <script>
            window.onload = () => {
              window.print();
            }
          </script>
        </body>
      </html>
    `)
    reportWindow.document.close()
    return true
  }

  const openInvoiceWindow = ({ title, order, clientName, mobile }) => {
    const reportWindow = window.open('', '_blank', 'width=900,height=700')
    if (!reportWindow) {
      toast.error('Popup blocked. Please allow popups to generate PDF report.')
      return
    }

    const generatedAt = new Date().toLocaleString('en-IN')
    const qty = Number(order.qty) || 0
    const rate = Number(order.rate) || 0
    const total = qty * rate
    const invoiceNumber = order.orderId || order.id || '-'
    const invoiceDate = order.date || '-'
    const invoiceTime = order.time || '-'
    const invoiceStatus = order.status || '-'

    reportWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            .invoice { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
            .head { padding: 16px 20px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
            h1 { margin: 0; font-size: 24px; letter-spacing: .4px; }
            .muted { color: #6b7280; font-size: 12px; margin-top: 4px; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
            .label { color: #6b7280; font-size: 11px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .4px; }
            .value { color: #111827; font-weight: 600; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: left; font-size: 13px; }
            th { font-size: 11px; text-transform: uppercase; color: #6b7280; background: #fafafa; letter-spacing: .3px; }
            .total-wrap { padding: 16px 20px; display: flex; justify-content: flex-end; }
            .total-box { width: 260px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
            .total-line { display: flex; justify-content: space-between; padding: 10px 12px; font-size: 13px; }
            .total-line + .total-line { border-top: 1px solid #f3f4f6; }
            .grand { background: #111827; color: white; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="invoice">
            <div class="head">
              <h1>Invoice</h1>
              <div class="muted">Generated: ${generatedAt}</div>
            </div>
            <div class="grid">
              <div><div class="label">Invoice Number</div><div class="value">${invoiceNumber}</div></div>
              <div><div class="label">Status</div><div class="value">${invoiceStatus}</div></div>
              <div><div class="label">Invoice Date</div><div class="value">${invoiceDate}</div></div>
              <div><div class="label">Invoice Time</div><div class="value">${invoiceTime}</div></div>
              <div><div class="label">Bill To</div><div class="value">${clientName}</div></div>
              <div><div class="label">Mobile</div><div class="value">${mobile || '-'}</div></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Water Box Supply</td>
                  <td>${qty} Boxes</td>
                  <td>₹${rate.toLocaleString('en-IN')}</td>
                  <td>₹${total.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>
            <div class="total-wrap">
              <div class="total-box">
                <div class="total-line"><span>Subtotal</span><span>₹${total.toLocaleString('en-IN')}</span></div>
                <div class="total-line grand"><span>Total</span><span>₹${total.toLocaleString('en-IN')}</span></div>
              </div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
            }
          </script>
        </body>
      </html>
    `)
    reportWindow.document.close()
  }

  const escapePdfText = (text) => String(text || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

  const buildSimpleInvoicePdfFile = ({ order, clientName, mobile }) => {
    const qty = Number(order.qty) || 0
    const rate = Number(order.rate) || 0
    const total = qty * rate
    const orderId = order.orderId || order.id || 'NA'
    const lines = [
      'ANJANI WATER - Invoice',
      `Invoice: ${orderId}`,
      `Client: ${clientName || 'Unknown Client'}`,
      `Mobile: ${mobile || '-'}`,
      `Date: ${order.date || '-'} ${order.time || ''}`.trim(),
      `Qty: ${qty} Boxes`,
      `Rate: INR ${rate.toLocaleString('en-IN')}`,
      `Total: INR ${total.toLocaleString('en-IN')}`,
      '',
      `Generated: ${new Date().toLocaleString('en-IN')}`
    ]
    const lineHeight = 18
    const startY = 780
    const content = lines
      .map((line, index) => `BT /F1 12 Tf 50 ${startY - (index * lineHeight)} Td (${escapePdfText(line)}) Tj ET`)
      .join('\n')
    const stream = `q\n${content}\nQ`

    const objects = []
    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj')
    objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj')
    objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj')
    objects.push(`4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`)
    objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj')

    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((obj) => {
      offsets.push(pdf.length)
      pdf += `${obj}\n`
    })
    const xrefStart = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n`
    pdf += '0000000000 65535 f \n'
    for (let i = 1; i <= objects.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    return new File([pdf], `invoice-${orderId}.pdf`, { type: 'application/pdf' })
  }

  const handleRecordPaymentFromOrder = (order) => {
    const client = clients.find((c) => c.id === order.clientId)
    const amount = (Number(order.qty) || 0) * (Number(order.rate) || 0)
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

    setPayClient(client || {})
    setPaymentPrefill({
      amount,
      date,
      time,
      note: `Payment received for order ${order.orderId || order.id}`
    })
  }

  const handleOrderInvoiceWhatsApp = async (order) => {
    const client = clients.find((c) => c.id === order.clientId)
    const clientName = client?.name || order.clientName || order.customerName || 'Unknown Client'
    const mobile = client?.mobile || order.mobile || order.phone || ''
    const amount = ((Number(order.qty) || 0) * (Number(order.rate) || 0)).toLocaleString('en-IN')
    const pdfFile = buildSimpleInvoicePdfFile({ order, clientName, mobile })
    const msg = `Invoice ${order.orderId || order.id || ''}\nClient: ${clientName}\nAmount: ₹${amount}`

    try {
      if (navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({
          title: `Invoice ${order.orderId || order.id || ''}`,
          text: msg,
          files: [pdfFile]
        })
        toast.success('Invoice PDF attached. Select WhatsApp and hit send.')
        return
      }
    } catch (error) {
      if (error?.name === 'AbortError') return
      console.error(error)
    }

    const invoiceBlobUrl = URL.createObjectURL(pdfFile)
    window.open(invoiceBlobUrl, '_blank')
    window.open(`https://wa.me/?text=${encodeURIComponent(`${msg}\n\nInvoice PDF opened in another tab. Please attach and send.`)}`, '_blank')
    toast('WhatsApp Web cannot auto-attach files by URL. PDF opened for quick attach.', { icon: 'ℹ️' })
    setTimeout(() => URL.revokeObjectURL(invoiceBlobUrl), 60 * 1000)
  }

  const handleOrderPrintPdf = () => {
    if (orders.length === 0) {
      toast.error('No orders available for report.')
      return
    }

    const rows = orders.map((order) => {
      const clientName = clients.find((c) => c.id === order.clientId)?.name
        || order.clientName
        || order.customerName
        || 'Unknown Client'
      const total = (Number(order.qty) || 0) * (Number(order.rate) || 0)
      return [
        order.orderId || order.id,
        clientName,
        order.date || '-',
        order.time || '-',
        order.status || '-',
        `${order.qty || 0} Boxes`,
        `₹${total.toLocaleString('en-IN')}`
      ]
    })

    openReportWindow({
      title: 'Order Print Report (PDF)',
      columns: ['Order ID', 'Client', 'Date', 'Time', 'Status', 'Qty', 'Amount'],
      rows
    })
  }

  const getLedgerDateRange = (rangeKey) => {
    const now = new Date()
    const endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999)

    const startDate = new Date(now)
    startDate.setHours(0, 0, 0, 0)

    if (rangeKey === 'current-month') {
      startDate.setDate(1)
      return { startDate, endDate, label: 'Current Month' }
    }

    if (rangeKey === 'past-6-months') {
      startDate.setMonth(startDate.getMonth() - 6)
      return { startDate, endDate, label: 'Past 6 Months' }
    }

    startDate.setFullYear(startDate.getFullYear() - 1)
    return { startDate, endDate, label: 'Past 1 Year' }
  }

  const handleLedgerStatementPdf = async () => {
    const reportWindow = window.open('', '_blank', 'width=900,height=700')
    if (!reportWindow) {
      toast.error('Popup blocked. Please allow popups to generate PDF report.')
      return
    }

    reportWindow.document.write('<p style="font-family:Arial,sans-serif;padding:16px;">Preparing ledger statement...</p>')
    reportWindow.document.close()

    try {
      const selectedClient = ledgerClientId === 'all'
        ? { id: 'all', name: 'All Clients' }
        : clients.find((client) => client.id === ledgerClientId)

      if (!selectedClient) {
        toast.error('Please select a valid client.')
        reportWindow.close()
        return
      }

      const { startDate, endDate, label: dateRangeLabel } = getLedgerDateRange(ledgerDateRange)

      const paymentsSnap = await getDocs(query(collection(db, 'payments')))
      const payments = paymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      if (payments.length === 0) {
        toast.error('No ledger entries available for report.')
        reportWindow.close()
        return
      }

      const rows = payments
        .filter((tx) => {
          if (selectedClient.id !== 'all' && tx.clientId !== selectedClient.id) return false

          const txDateRaw = tx.date?.toDate?.() || tx.createdAt?.toDate?.() || null
          if (!txDateRaw) return false
          if (txDateRaw < startDate) return false
          if (txDateRaw > endDate) return false
          return true
        })
        .sort((a, b) => {
          const aTime = a.date?.toMillis?.() || a.createdAt?.toMillis?.() || 0
          const bTime = b.date?.toMillis?.() || b.createdAt?.toMillis?.() || 0
          return bTime - aTime
        })
        .map((tx) => {
          const clientName = clients.find((c) => c.id === tx.clientId)?.name || 'Unknown Client'
          const txDate = tx.date?.toDate?.()?.toLocaleDateString('en-IN')
            || tx.createdAt?.toDate?.()?.toLocaleDateString('en-IN')
            || '-'
          return [
            clientName,
            txDate,
            tx.type || '-',
            tx.method || 'SYSTEM',
            `₹${Number(tx.amount || 0).toLocaleString('en-IN')}`,
            tx.narration || '-'
          ]
        })

      if (rows.length === 0) {
        toast.error('No ledger entries found for the selected client/date range.')
        reportWindow.close()
        return
      }

      openReportWindow({
        reportWindow,
        title: 'Ledger Statement Report (PDF)',
        columns: ['Client', 'Date', 'Type', 'Method', 'Amount', 'Narration'],
        rows,
        metadata: [
          `Client: ${selectedClient.name}`,
          `Date Range: ${dateRangeLabel}`
        ]
      })

      setLedgerModalOpen(false)
    } catch (error) {
      toast.error('Unable to generate ledger statement report.')
      reportWindow.close()
      console.error(error)
    }
  }

  const handleOrderSpecificPrintPdf = () => {
    if (orders.length === 0) {
      toast.error('No orders available for report.')
      return
    }

    const searchValue = window.prompt('Enter Order ID, client name, or mobile number')
    if (searchValue === null) return

    const searchTerm = searchValue.trim().toLowerCase()
    if (!searchTerm) {
      toast.error('Please enter a value to search orders.')
      return
    }

    const matchedOrders = orders.filter((order) => {
      const client = clients.find((c) => c.id === order.clientId)
      const clientName = (client?.name || order.clientName || order.customerName || '').toLowerCase()
      const mobile = String(client?.mobile || order.mobile || order.phone || '').toLowerCase()
      const orderId = String(order.orderId || order.id || '').toLowerCase()
      return orderId.includes(searchTerm) || clientName.includes(searchTerm) || mobile.includes(searchTerm)
    })

    if (matchedOrders.length === 0) {
      toast.error('No matching orders found.')
      return
    }

    if (matchedOrders.length > 1) {
      toast.error('Multiple matching orders found. Please search by exact Order ID for single invoice.')
      return
    }

    const order = matchedOrders[0]
    const client = clients.find((c) => c.id === order.clientId)
    const clientName = client?.name || order.clientName || order.customerName || 'Unknown Client'
    const mobile = client?.mobile || order.mobile || order.phone || '-'

    openInvoiceWindow({
      title: `Order Invoice (PDF) - ${order.orderId || order.id || searchValue.trim()}`,
      order,
      clientName,
      mobile
    })
  }

  const drawerReports = [
    {
      id: 'report-order-print',
      label: 'Order Print (PDF)',
      icon: <Printer size={18} />,
      onClick: () => {
        handleOrderPrintPdf()
        setDrawerOpen(false)
      }
    },
    {
      id: 'report-order-specific',
      label: 'Order Specific Print (PDF)',
      icon: <Search size={18} />,
      onClick: () => {
        handleOrderSpecificPrintPdf()
        setDrawerOpen(false)
      }
    },
    {
      id: 'report-ledger-statement',
      label: 'Ledger Statement (PDF)',
      icon: <BookText size={18} />,
      onClick: () => {
        setDrawerOpen(false)
        setLedgerModalOpen(true)
      }
    }
  ]

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] font-sans flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h1>
          <p className="mt-4 text-sm font-semibold text-gray-600">Enter 4-digit PIN to unlock app</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pinInput}
            onChange={handlePinChange}
            maxLength={4}
            className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl font-black tracking-[0.35em] text-[#131921] focus:outline-none focus:ring-2 focus:ring-orange-300"
            placeholder="••••"
            aria-label="App PIN"
          />
          {pinError && <p className="mt-3 text-sm font-bold text-red-500">{pinError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <Toaster position="top-center" toastOptions={{ style: { background: '#ffffff', color: '#131921', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', borderRadius: '12px', fontWeight: '900', fontSize: '14px', padding: '16px 24px' }, success: { iconTheme: { primary: '#25D366', secondary: '#fff' } }, error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } } }} />

      {/* Unified Top Header (all screen sizes) */}
      <header className="sticky top-0 bg-white shadow-sm z-40 flex items-center px-4 py-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <div className="ml-2">
          <h1 className="text-xl font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h1>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-col min-h-screen">
        <div className="max-w-5xl mx-auto w-full pb-28">
          {activeTab === 'orders' && (
            <OrdersDashboard
              onEdit={setEditOrder}
              onCopy={(o) => setEditOrder({ ...o, id: null })}
              onRecordPayment={handleRecordPaymentFromOrder}
              onShareInvoice={handleOrderInvoiceWhatsApp}
            />
          )}
          {activeTab === 'stock' && <StockDashboard />}
          {activeTab === 'payments' && <PaymentDashboard />}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <ClientList
                onEdit={setEditClient}
                onPay={(client) => {
                  setPaymentPrefill(null)
                  setPayClient(client)
                }}
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
            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-black tracking-[0.14em] text-gray-400 uppercase">Quick Actions</p>
                {drawerQuickActions.map(action => (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    <span className="text-[#ff9900]">
                      {action.icon}
                    </span>
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {drawerNavItems.map(item => (
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
              </div>
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-black tracking-[0.14em] text-gray-400 uppercase">Reports (PDF)</p>
                {drawerReports.map(report => (
                  <button
                    key={report.id}
                    onClick={report.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    <span className="text-[#ff9900]">
                      {report.icon}
                    </span>
                    {report.label}
                  </button>
                ))}
              </div>
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
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => {
          setPayClient(null)
          setPaymentPrefill(null)
        }}>
          <div className="relative bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 pt-10 md:p-5 md:pt-10" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setPayClient(null)
                setPaymentPrefill(null)
              }}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close payment form"
            >
              <X size={18} />
            </button>
            <PaymentModal
              client={payClient}
              initialValues={paymentPrefill || {}}
              onClose={() => {
                setPayClient(null)
                setPaymentPrefill(null)
              }}
            />
          </div>
        </div>
      )}


      {/* Ledger Statement Modal */}
      {ledgerModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4" onClick={() => setLedgerModalOpen(false)}>
          <div className="relative bg-white rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLedgerModalOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close ledger statement options"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-black text-[#131921]">Ledger Statement Options</h3>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-gray-700">Client</span>
                <select
                  value={ledgerClientId}
                  onChange={(e) => setLedgerClientId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="all">All Clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name || 'Unnamed Client'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-gray-700">Date Range</span>
                <select
                  value={ledgerDateRange}
                  onChange={(e) => setLedgerDateRange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="current-month">Current Month</option>
                  <option value="past-6-months">Past 6 Months</option>
                  <option value="past-1-year">Past 1 Year</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLedgerModalOpen(false)}
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLedgerStatementPdf}
                className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white hover:bg-[#1d4ed8]"
              >
                Generate PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation (all screen sizes) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-2 pt-1 pb-3 flex justify-around items-center z-[999] shadow-[0_-10px_20px_rgba(0,0,0,0.08)]">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center w-[19%] py-1 rounded-xl transition-all ${
              activeTab === item.id
                ? 'text-[#ff9900] bg-[#fff4e5] shadow-[0_4px_10px_rgba(255,153,0,0.15)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label={`Open ${item.label}`}
          >
            {item.icon}
            <span className={`text-[9px] mt-0 uppercase tracking-tight ${activeTab === item.id ? 'font-black' : 'font-bold'}`}>
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
          onClick={() => {
            setPaymentPrefill(null)
            setPayClient({})
          }}
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
