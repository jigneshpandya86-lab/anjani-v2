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
  BookText,
  Search,
  Package,
  CreditCard,
  Users,
  TrendingUp,
  LogOut,
  MessageSquare
} from 'lucide-react'
import { collection, getDocs, query, orderBy, where, limit, startAfter } from 'firebase/firestore'
import { db, auth } from './firebase-config'
import { signOut, onAuthStateChanged } from 'firebase/auth'
import ClientList from './components/ClientList'
import AddClient from './components/AddClient'
import OrdersDashboard from './components/OrdersDashboard'
import OrderModal from './components/OrderModal'
import PaymentDashboard from './components/PaymentDashboard'
import PaymentModal from './components/PaymentModal'
import LeadsDashboard from './components/LeadsDashboard'
import StockDashboard from './components/StockDashboard'
import SmsAutomationSettings from './components/SmsAutomationSettings'
import Login from './components/Login'

const LEDGER_EXPORT_PAGE_SIZE = 500

function App() {
  const [activeTab, setActiveTab] = useState('orders')
  const [editOrder, setEditOrder] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [payClient, setPayClient] = useState(null)
  const [paymentPrefill, setPaymentPrefill] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false)
  const [ledgerClientId, setLedgerClientId] = useState('')
  const [ledgerDateRange, setLedgerDateRange] = useState('current-month')
  // ─────────────────────────────────────────
  // AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
  // ─────────────────────────────────────────
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { fetchClients, fetchOrders, fetchStock, fetchStockTotal, orders, clients } = useClientStore()

  // AUTH: monitors login/logout state — removing this breaks the entire auth flow
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })
    return unsubAuth
  }, [])

  // AUTH: data is only fetched when user is signed in — do not remove the guard
  useEffect(() => {
    if (!user) return undefined // AUTH: do not remove — prevents data fetch for unauthenticated users

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
  }, [fetchClients, fetchOrders, fetchStock, fetchStockTotal, user])

  // AUTH: signs out the current user and clears session
  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast.success('Signed out successfully')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
    { id: 'payments', label: 'Transactions', icon: <CreditCard size={20} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={20} /> },
  ]

  const drawerNavItems = [
    ...navItems,
    { id: 'sms-settings', label: 'SMS Settings', icon: <MessageSquare size={20} /> }
  ]

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


  const escapePdfText = (text) => String(text || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

  // Builds a raw single-page PDF from tabular data — works inside Capacitor WebView
  const createPdfFile = (pdfText, filename) => {
    const bytes = new TextEncoder().encode(pdfText)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    try {
      return new File([blob], filename, { type: 'application/pdf' })
    } catch {
      // Older WebViews may not support File constructor.
      blob.name = filename
      return blob
    }
  }

  const buildTabularReportPdf = ({ title, columns, rows, metadata = [], filename = 'report.pdf' }) => {
    const san = (t) => String(t ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').slice(0, 60)
    const txt = (x, y, size, t) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t)}) Tj ET`
    const pW = 595, pH = 842, mg = 36, usableW = pW - mg * 2
    const colW = usableW / Math.max(columns.length, 1)
    const rH = 18
    const lines = []
    let y = pH - mg - 20

    lines.push(txt(mg, y, 14, title))
    y -= 20
    lines.push('0.5 0.5 0.5 rg')
    lines.push(txt(mg, y, 8, `Generated: ${new Date().toLocaleString('en-IN').replace(/[^\x20-\x7E]/g, '')}`))
    lines.push('0 0 0 rg')
    y -= 14
    for (const m of metadata.filter(Boolean)) {
      lines.push('0.5 0.5 0.5 rg')
      lines.push(txt(mg, y, 8, m))
      lines.push('0 0 0 rg')
      y -= 12
    }
    y -= 6
    lines.push('0.2 0.2 0.2 rg')
    lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
    lines.push('1 1 1 rg')
    columns.forEach((col, i) => lines.push(txt(mg + i * colW + 4, y + 4, 7, col)))
    lines.push('0 0 0 rg')
    y -= rH
    for (let ri = 0; ri < rows.length; ri++) {
      if (y < mg + rH) break
      if (ri % 2 === 0) {
        lines.push('0.95 0.95 0.95 rg')
        lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
        lines.push('0 0 0 rg')
      }
      rows[ri].forEach((cell, i) => lines.push(txt(mg + i * colW + 4, y + 4, 7, cell)))
      y -= rH
    }
    const stream = lines.join('\n')
    const objs = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
      `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`,
      `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objs.forEach((obj) => { offsets.push(pdf.length); pdf += `${obj}\n` })
    const xrefStart = pdf.length
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    return createPdfFile(pdf, filename)
  }

  // Share PDF via native share sheet (WhatsApp, Drive, etc.) or fall back to download
  const shareOrDownloadPdf = async (file, shareTitle = '', shareText = '') => {
    try {
      const canShareWithFile = Boolean(
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      )
      if (canShareWithFile) {
        await navigator.share({ title: shareTitle, text: shareText, files: [file] })
        toast.success('PDF ready — select WhatsApp or any app to share.')
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file?.name || 'invoice.pdf'
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Android WebView/Chrome can ignore downloads from blob URLs; open in a new tab as fallback.
    setTimeout(() => {
      if (!document.hidden) {
        window.open(url, '_blank', 'noopener')
      }
    }, 150)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success('PDF generated.')
  }

  const isMobileOrNative = Boolean(window?.Capacitor?.isNativePlatform?.()) || /Android|iPhone|iPad/i.test(navigator.userAgent)

  const buildSimpleInvoicePdfFile = ({ order, clientName, mobile }) => {
    const qty = Number(order.qty) || 0
    const rate = Number(order.rate) || 0
    const total = qty * rate
    const orderId = order.orderId || order.id || 'NA'
    const issuedAt = new Date().toLocaleString('en-IN')
    const invoiceDateTime = `${order.date || '-'} ${order.time || ''}`.trim()
    const textAt = (x, y, size, text) =>
      `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`

    const stream = [
      'q',
      '0.95 0.97 1 rg',
      '40 760 515 60 re f',
      '0 0 0 rg',
      textAt(52, 795, 22, 'INVOICE'),
      textAt(52, 774, 11, 'ANJANI WATER'),
      textAt(410, 795, 10, `Invoice #: ${orderId}`),
      textAt(410, 778, 10, `Issued: ${issuedAt}`),
      '0.85 0.85 0.85 RG',
      '40 695 515 58 re S',
      textAt(52, 736, 10, `Bill To: ${clientName || 'Unknown Client'}`),
      textAt(52, 719, 10, `Mobile: ${mobile || '-'}`),
      textAt(320, 736, 10, `Delivery Date: ${invoiceDateTime || '-'}`),
      textAt(320, 719, 10, `Status: ${order.status || '-'}`),
      '0.88 0.88 0.88 rg',
      '40 665 515 22 re f',
      '0 0 0 rg',
      textAt(52, 671, 10, 'Description'),
      textAt(300, 671, 10, 'Qty'),
      textAt(380, 671, 10, 'Rate'),
      textAt(470, 671, 10, 'Amount'),
      '0.9 0.9 0.9 RG',
      '40 625 515 40 re S',
      textAt(52, 641, 10, 'Water Box Supply'),
      textAt(300, 641, 10, `${qty} Boxes`),
      textAt(380, 641, 10, `INR ${rate.toLocaleString('en-IN')}`),
      textAt(470, 641, 10, `INR ${total.toLocaleString('en-IN')}`),
      '0.95 0.95 0.95 rg',
      '355 575 200 40 re f',
      '0.82 0.82 0.82 RG',
      '355 575 200 40 re S',
      '0 0 0 rg',
      textAt(367, 598, 10, 'Total'),
      textAt(470, 598, 12, `INR ${total.toLocaleString('en-IN')}`),
      textAt(40, 540, 9, 'Thank you for your business.'),
      'Q'
    ].join('\n')

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
    return createPdfFile(pdf, `invoice-${orderId}.pdf`)
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
    const invoiceTitle = `Invoice ${order.orderId || order.id || ''}`
    const msg = `${invoiceTitle}\nClient: ${clientName}\nAmount: Rs.${amount}`

    // Try native share sheet (opens WhatsApp, Drive, etc. on Android)
    try {
      if (navigator.share) {
        await navigator.share({ title: invoiceTitle, text: msg, files: [pdfFile] })
        toast.success('Invoice PDF ready — select WhatsApp to send.')
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }

    // Desktop fallback: download PDF + open WhatsApp with text
    await shareOrDownloadPdf(pdfFile, invoiceTitle, msg)
    if (mobile) {
      window.open(`https://wa.me/91${mobile}?text=${encodeURIComponent(msg)}`, '_blank')
    }
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
    try {
      const selectedClient = clients.find((client) => client.id === ledgerClientId)

      if (!selectedClient) {
        toast.error('Please select a valid client.')
        return
      }

      const { startDate, endDate, label: dateRangeLabel } = getLedgerDateRange(ledgerDateRange)

      const payments = []
      let lastVisibleDoc = null

      while (true) {
        const constraints = [
          where('createdAt', '>=', startDate),
          where('createdAt', '<=', endDate),
          orderBy('createdAt', 'desc'),
          limit(LEDGER_EXPORT_PAGE_SIZE)
        ]

        if (selectedClient.id !== 'all') {
          constraints.splice(2, 0, where('clientId', '==', selectedClient.id))
        }

        if (lastVisibleDoc) {
          constraints.push(startAfter(lastVisibleDoc))
        }

        const paymentsSnap = await getDocs(query(collection(db, 'payments'), ...constraints))
        if (paymentsSnap.empty) break

        payments.push(...paymentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        if (paymentsSnap.docs.length < LEDGER_EXPORT_PAGE_SIZE) break

        lastVisibleDoc = paymentsSnap.docs[paymentsSnap.docs.length - 1]
      }

      if (payments.length === 0) {
        toast.error('No ledger entries available for report.')
        return
      }

      const rows = payments
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
            `Rs.${Number(tx.amount || 0).toLocaleString('en-IN')}`,
            tx.narration || '-'
          ]
        })

      if (rows.length === 0) {
        toast.error('No ledger entries found for the selected client/date range.')
        return
      }

      const columns = ['Client', 'Date', 'Type', 'Method', 'Amount', 'Narration']
      const metadata = [`Client: ${selectedClient.name}`, `Date Range: ${dateRangeLabel}`]

      if (isMobileOrNative) {
        const file = buildTabularReportPdf({ title: 'Ledger Statement', columns, rows, metadata, filename: 'ledger.pdf' })
        await shareOrDownloadPdf(file, 'Ledger Statement')
      } else {
        openReportWindow({ title: 'Ledger Statement Report (PDF)', columns, rows, metadata })
      }

      setLedgerModalOpen(false)
    } catch (error) {
      toast.error('Unable to generate ledger statement report.')
      console.error(error)
    }
  }

  const handleOrderSpecificPrintPdf = async () => {
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

    const pdfFile = buildSimpleInvoicePdfFile({ order, clientName, mobile })
    await shareOrDownloadPdf(pdfFile, `Invoice ${order.orderId || order.id || ''}`)
  }

  const drawerReports = [
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
        if (clients.length === 0) {
          toast.error('No clients available for ledger statement.')
          setDrawerOpen(false)
          return
        }
        setLedgerClientId((prev) => prev || clients[0]?.id || '')
        setDrawerOpen(false)
        setLedgerModalOpen(true)
      }
    }
  ]

  // AUTH: show loading screen while Firebase resolves the auth state on startup
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] font-sans flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tighter text-[#131921]">ANJANI <span className="text-[#ff9900]">WATER</span></h1>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // AUTH: gate — unauthenticated users see login screen only, do not remove
  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <Toaster position="top-center" toastOptions={{ style: { background: '#ffffff', color: '#131921', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', borderRadius: '12px', fontWeight: '900', fontSize: '14px', padding: '16px 24px' }, success: { iconTheme: { primary: '#25D366', secondary: '#fff' } }, error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } } }} />

      {/* Unified Top Header (all screen sizes) */}
      <header className="sticky top-0 bg-white shadow-sm z-40 flex items-center justify-between px-4 py-3">
        <div className="flex items-center">
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
        </div>
        {/* AUTH: user email + logout button — do not remove */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 hidden sm:inline">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={20} />
          </button>
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
          {activeTab === 'sms-settings' && <SmsAutomationSettings />}
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
