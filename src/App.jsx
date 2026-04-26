import { useState, useEffect, useMemo, useRef } from 'react'
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
  CheckSquare,
  LogOut,
  Bell,
  CheckCheck,
  Brain
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
import Login from './components/Login'
import TasksPage from './TasksPage'
import IntelligenceDashboard from './components/IntelligenceDashboard'
import DefaulterReminderSettings from './components/DefaulterReminderSettings'

const LEDGER_EXPORT_PAGE_SIZE = 500

function App() {
  const NOTIFICATION_READ_STORAGE_PREFIX = 'anjani-notification-read-v1'
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
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationReadMap, setNotificationReadMap] = useState({})
  const notificationPanelRef = useRef(null)
  // ─────────────────────────────────────────
  // AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
  // ─────────────────────────────────────────
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const { fetchClients, fetchOrders, fetchStock, fetchStockTotal, orders, clients, userRole, fetchUserRole } = useClientStore()
  const readStorageKey = user?.uid ? `${NOTIFICATION_READ_STORAGE_PREFIX}-${user.uid}` : null

  const unreadNotificationCount = useMemo(() => {
    return notifications.reduce((count, item) => (notificationReadMap[item.id] ? count : count + 1), 0)
  }, [notificationReadMap, notifications])

  // AUTH: monitors login/logout state — removing this breaks the entire auth flow
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)
      
      if (currentUser) {
        await fetchUserRole(currentUser.uid)
      } else {
        await fetchUserRole(null)
      }
      
      setAuthLoading(false)
    })
    return unsubAuth
  }, [fetchUserRole])

  // FCM Auto-initialization for robustness
  useEffect(() => {
    if (user && Notification.permission === 'granted') {
      const initFcmAuto = async () => {
        try {
          const { initializeFcm } = await import('./services/fcm-setup');
          await initializeFcm(user.uid, user.email);
          console.log('FCM auto-initialized for user:', user.uid);
        } catch (err) {
          console.error('FCM auto-init error:', err);
        }
      };
      initFcmAuto();
    }
  }, [user])

  const handleEnableNotifications = async () => {
    if (!user) {
      toast.error('User not logged in.');
      return;
    }
    try {
      console.log('Starting notification setup...');
      const { initializeFcm, sendLocalTestNotification } = await import('./services/fcm-setup');
      console.log('FCM module imported successfully');
      const result = await initializeFcm(user.uid, user.email);
      console.log('FCM initialization result:', result);

      if (result.success) {
        toast.success(`Push notifications enabled (${result.tokenPreview})`);
        sendLocalTestNotification(result.serviceWorkerRegistration).then((testSent) => {
          if (testSent) {
            toast.success('Test notification sent to this device.');
          } else {
            toast.error('Device registered, but test notification could not be displayed.');
          }
        });
        if (!result.tokenStored) {
          toast.error('Notification permission granted, but token record could not be verified.');
        }
      } else {
        console.log('FCM initialization failed with reason:', result.reason);
        if (result.reason === 'permission-denied') {
          toast.error('Notification permission denied. Please allow notifications in browser settings.');
        } else if (result.reason === 'unsupported-browser') {
          toast.error('This browser does not support Firebase web push notifications.');
        } else if (result.reason === 'service-worker-unavailable') {
          toast.error('Service Worker is not available in this browser context.');
        } else if (result.reason === 'token-missing') {
          toast.error('Permission granted, but Firebase could not issue a device token.');
        } else {
          toast.error('Failed to enable notifications. Please check browser permissions.');
        }
      }
    } catch (error) {
      console.error('Error in handleEnableNotifications:', error);
      toast.error('Error enabling notifications: ' + error.message);
    }
  }

  const formatNotificationTime = (value) => {
    if (!value) return ''

    const asDate = value?.toDate?.() || (typeof value === 'object' && typeof value.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : new Date(value))

    if (!(asDate instanceof Date) || Number.isNaN(asDate.getTime())) return ''

    return asDate.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const markNotificationAsRead = (notificationId) => {
    if (!notificationId) return

    setNotificationReadMap((prev) => {
      const next = { ...prev, [notificationId]: true }
      if (readStorageKey) {
        window.localStorage.setItem(readStorageKey, JSON.stringify(next))
      }
      return next
    })
  }

  const markAllNotificationsAsRead = () => {
    const next = notifications.reduce((acc, item) => {
      acc[item.id] = true
      return acc
    }, {})

    setNotificationReadMap(next)
    if (readStorageKey) {
      window.localStorage.setItem(readStorageKey, JSON.stringify(next))
    }
    toast.success('Notifications cleared')
  }

  const handleBellClick = () => {
    setNotificationPanelOpen((prev) => !prev)
  }

  useEffect(() => {
    if (!readStorageKey) {
      setNotificationReadMap({})
      return
    }

    const savedValue = window.localStorage.getItem(readStorageKey)
    if (!savedValue) {
      setNotificationReadMap({})
      return
    }

    try {
      const parsed = JSON.parse(savedValue)
      setNotificationReadMap(parsed && typeof parsed === 'object' ? parsed : {})
    } catch {
      setNotificationReadMap({})
    }
  }, [readStorageKey])

  useEffect(() => {
    if (!user) return undefined

    const notificationQuery = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(20)
    )

    let ignoreUpdates = false

    getDocs(notificationQuery)
      .then((snapshot) => {
        if (ignoreUpdates) return
        const fetchedNotifications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setNotifications(fetchedNotifications)
      })
      .catch((error) => {
        console.error('Failed to load notifications:', error)
      })

    return () => {
      ignoreUpdates = true
    }
  }, [user])

  useEffect(() => {
    if (!notificationPanelOpen) return undefined

    const handleOutsidePanelClick = (event) => {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setNotificationPanelOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsidePanelClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsidePanelClick)
    }
  }, [notificationPanelOpen])


  // AUTH: data is only fetched when user is signed in — do not remove the guard
  useEffect(() => {
    if (!user) return undefined // AUTH: do not remove — prevents data fetch for unauthenticated users

    const unsubOrders = fetchOrders()
    let unsubClients, unsubStock, unsubStockTotal;

    if (userRole === 'admin') {
      unsubClients = fetchClients()
      unsubStock = fetchStock()
      unsubStockTotal = fetchStockTotal()
    }

    return () => {
      if (unsubOrders) unsubOrders()
      if (unsubClients) unsubClients()
      if (unsubStock) unsubStock()
      if (unsubStockTotal) unsubStockTotal()
    }
  }, [fetchClients, fetchOrders, fetchStock, fetchStockTotal, user, userRole])

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
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
    { id: 'payments', label: 'Transactions', icon: <CreditCard size={20} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={20} /> },
  ].filter(item => userRole === 'admin' || item.id === 'orders')

  const drawerNavItems = [
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
    userRole === 'admin' && { id: 'intelligence', label: 'Intelligence Hub', icon: <Brain size={20} /> },
    ...navItems,
  ].filter(Boolean)

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
  ].filter(() => userRole === 'admin')

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
    // Flatten multi-line address into a single line, cap at 80 chars
    const clientAddress = String(order.address || '')
      .replace(/[\r\n]+/g, ', ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    const textAt = (x, y, size, text) =>
      `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
    const boldAt = (x, y, size, text) =>
      `BT /F2 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`

    const stream = [
      'q',

      // ── HEADER BAND (dark navy, y=695 to y=842) ──────────────────────
      '0.06 0.12 0.27 rg',
      '40 695 515 147 re f',

      // INVOICE title + invoice meta (white)
      '1 1 1 rg',
      boldAt(52, 822, 22, 'INVOICE'),
      '0.8 0.85 0.95 rg',
      textAt(380, 822, 9, `Invoice #: ${orderId}`),
      textAt(380, 808, 9, `Issued: ${issuedAt}`),

      // BILL FROM label + company info
      '0.6 0.65 0.75 rg',
      textAt(52, 796, 8, 'BILL FROM'),
      '1 1 1 rg',
      boldAt(52, 782, 11, 'ANNAPURNA FOODS'),
      '0.85 0.88 0.93 rg',
      textAt(52, 768, 9, 'Shop No. 21, VR One Commercial Business Center'),
      textAt(52, 755, 9, 'Between Ajwa & Waghodia Chokadi'),
      textAt(52, 742, 9, 'Opp. L&T Knowledge City'),
      textAt(52, 729, 9, 'Vadodara, Gujarat 390019, India'),
      '0.7 0.75 0.83 rg',
      textAt(52, 716, 9, 'GSTIN: 24ABHFA6857D1ZI'),

      // ── BILL TO ───────────────────────────────────────────────────────
      '0.5 0.5 0.5 rg',
      textAt(52, 683, 8, 'BILL TO'),
      '0 0 0 rg',
      boldAt(52, 669, 11, clientName || 'Unknown Client'),
      textAt(52, 655, 9, `Mobile: ${mobile || '-'}`),
      textAt(315, 669, 9, `Delivery: ${invoiceDateTime || '-'}`),
      textAt(315, 655, 9, `Status: ${order.status || '-'}`),
      // Client address (from order)
      ...(clientAddress ? ['0.35 0.35 0.35 rg', textAt(52, 641, 9, `Address: ${clientAddress}`), '0 0 0 rg'] : []),

      // separator (shifted down by 13pt when address present)
      '0.8 0.8 0.8 RG',
      '0.5 w',
      `40 ${clientAddress ? 628 : 644} m 555 ${clientAddress ? 628 : 644} l S`,

      // ── ITEM TABLE HEADER ─────────────────────────────────────────────
      '0.15 0.15 0.15 rg',
      `40 ${clientAddress ? 606 : 622} 515 20 re f`,
      '1 1 1 rg',
      textAt(52, clientAddress ? 612 : 628, 9, 'Description'),
      textAt(305, clientAddress ? 612 : 628, 9, 'Qty'),
      textAt(385, clientAddress ? 612 : 628, 9, 'Rate'),
      textAt(475, clientAddress ? 612 : 628, 9, 'Amount'),

      // ── ITEM ROW ──────────────────────────────────────────────────────
      '0.96 0.96 0.96 rg',
      `40 ${clientAddress ? 574 : 590} 515 30 re f`,
      '0 0 0 rg',
      textAt(52, clientAddress ? 586 : 602, 10, 'Water Box Supply'),
      textAt(305, clientAddress ? 586 : 602, 10, `${qty} Boxes`),
      textAt(385, clientAddress ? 586 : 602, 10, `INR ${rate.toLocaleString('en-IN')}`),
      textAt(475, clientAddress ? 586 : 602, 10, `INR ${total.toLocaleString('en-IN')}`),

      // ── TOTAL ─────────────────────────────────────────────────────────
      '0.92 0.92 0.92 rg',
      `350 ${clientAddress ? 528 : 544} 205 40 re f`,
      '0.75 0.75 0.75 RG',
      '1 w',
      `350 ${clientAddress ? 528 : 544} 205 40 re S`,
      '0 0 0 rg',
      textAt(362, clientAddress ? 551 : 567, 10, 'Total'),
      boldAt(440, clientAddress ? 551 : 567, 12, `INR ${total.toLocaleString('en-IN')}`),

      // ── FOOTER ────────────────────────────────────────────────────────
      '0.7 0.7 0.7 RG',
      '1 w',
      `40 ${clientAddress ? 508 : 524} m 555 ${clientAddress ? 508 : 524} l S`,

      // Notes
      '0.4 0.4 0.4 rg',
      boldAt(40, clientAddress ? 495 : 511, 9, 'Notes'),
      '0 0 0 rg',
      textAt(40, clientAddress ? 481 : 497, 9, 'Thanks for your business.'),

      // Bank details
      '0.8 0.8 0.8 RG',
      '0.5 w',
      `40 ${clientAddress ? 468 : 484} m 555 ${clientAddress ? 468 : 484} l S`,
      '0.4 0.4 0.4 rg',
      boldAt(40, clientAddress ? 455 : 471, 9, "Company's Bank Details"),
      '0 0 0 rg',
      textAt(40, clientAddress ? 441 : 457, 9, 'Bank Name: Kotak Mahindra Bank'),
      textAt(40, clientAddress ? 427 : 443, 9, 'Account Holder: Annapurna Foods'),
      textAt(40, clientAddress ? 413 : 429, 9, 'IFSC Code: KKBK0002748'),
      textAt(40, clientAddress ? 399 : 415, 9, 'Account Number: 1712426768'),

      // Contact
      '0.8 0.8 0.8 RG',
      '0.5 w',
      `40 ${clientAddress ? 387 : 403} m 555 ${clientAddress ? 387 : 403} l S`,
      '0 0 0 rg',
      textAt(40, clientAddress ? 374 : 390, 9, 'Contact Number: 9925997750'),

      'Q'
    ].join('\n')

    const objects = []
    objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj')
    objects.push('2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj')
    objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj')
    objects.push(`4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`)
    objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj')
    objects.push('6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj')

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

  // Resolve a Firestore Timestamp OR a plain serialised object (from localStorage cache)
  // into a JS Date, or null if unparseable.
  const resolveTimestamp = (ts) => {
    if (!ts) return null
    if (typeof ts.toDate === 'function') return ts.toDate()           // Firestore Timestamp
    if (ts.seconds) return new Date(ts.seconds * 1000)               // cached plain object
    if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts)
    return null
  }

  // Purpose-built ledger PDF: Dr / Cr / Running Balance with per-column widths.
  const buildLedgerPdf = ({ clientName, dateRangeLabel, txns, openingBalance }) => {
    // Safe string: strip non-ASCII, escape PDF string specials, limit length
    const san = (t, maxLen = 60) =>
      String(t ?? '').replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '')
        .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').slice(0, maxLen)
    const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

    // A4 portrait geometry
    const pW = 595, pH = 842, mg = 36
    const usableW = pW - mg * 2   // 523

    // Column widths (must sum to usableW = 523)
    const cW = [22, 58, 52, 68, 68, 72, 183]  // Sr | Date | Type | Dr | Cr | Balance | Narration
    const cHdr = ['Sr', 'Date', 'Type', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Narration']
    const rH = 18

    const txt = (x, y, size, t, maxLen) =>
      `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${san(t, maxLen)}) Tj ET`

    const drawRow = (lines, y, cells, bg, textRgb = '0 0 0') => {
      if (bg) {
        lines.push(`${bg} rg`)
        lines.push(`${mg} ${y - 4} ${usableW} ${rH} re f`)
      }
      lines.push(`${textRgb} rg`)
      let xOff = mg
      const maxLens = [4, 12, 9, 10, 10, 10, 42]
      cells.forEach((cell, i) => {
        lines.push(txt(xOff + 3, y + 4, 7, cell, maxLens[i]))
        xOff += cW[i]
      })
      lines.push('0 0 0 rg')
    }

    // Compute running balance rows
    let balance = openingBalance
    const dataRows = txns.map((tx, idx) => {
      const amount = Number(tx.amount || 0)
      let dr = '', cr = ''
      if (tx.type === 'invoice') {
        balance += Math.abs(amount)
        dr = fmt(Math.abs(amount))
      } else if (tx.type === 'payment') {
        balance -= Math.abs(amount)
        cr = fmt(Math.abs(amount))
      } else {
        // reversal: amount may be negative
        if (amount < 0) { balance += Math.abs(amount); dr = fmt(Math.abs(amount)) }
        else { balance -= amount; cr = fmt(amount) }
      }
      const txDate = resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt)
      const dateStr = txDate ? txDate.toLocaleDateString('en-IN') : '-'
      const typeLabel = tx.type === 'invoice' ? 'Invoice' : tx.type === 'payment' ? 'Payment' : 'Reversal'
      return [String(idx + 1), dateStr, typeLabel, dr, cr, `Rs.${fmt(balance)}`, tx.narration || '-']
    })

    const closingBalance = balance
    const totalDr = txns.reduce((s, tx) => tx.type === 'invoice' ? s + Math.abs(Number(tx.amount || 0)) : s, 0)
    const totalCr = txns.reduce((s, tx) => tx.type === 'payment' ? s + Math.abs(Number(tx.amount || 0)) : s, 0)

    const buildPageStream = (pageRows, isFirstPage) => {
      const lines = []
      let y = pH - mg - 20

      if (isFirstPage) {
        // Title
        lines.push('0.08 0.08 0.08 rg')
        lines.push(txt(mg, y, 13, 'Ledger Statement', 40))
        y -= 18
        lines.push('0.4 0.4 0.4 rg')
        lines.push(txt(mg, y, 8, `Generated: ${new Date().toLocaleString('en-IN').replace(/[^\x20-\x7E]/g, '')}`, 60))
        y -= 13
        lines.push(txt(mg, y, 8, `Client: ${clientName}`, 60))
        y -= 13
        lines.push(txt(mg, y, 8, `Date Range: ${dateRangeLabel}`, 60))
        y -= 13
        lines.push(txt(mg, y, 8, `Opening Balance: Rs.${fmt(openingBalance)}`, 60))
        lines.push('0 0 0 rg')
        y -= 10

        // Divider line
        lines.push('0.7 0.7 0.7 rg')
        lines.push(`${mg} ${y} ${usableW} 0.5 re f`)
        lines.push('0 0 0 rg')
        y -= 8
      }

      // Column header
      drawRow(lines, y, cHdr, '0.13 0.13 0.13', '1 1 1')
      y -= rH

      // Data rows
      pageRows.forEach((row, ri) => {
        drawRow(lines, y, row, ri % 2 === 0 ? '0.96 0.96 0.96' : null)
        y -= rH
      })

      return lines.join('\n')
    }

    // Summary page stream (always last)
    const buildSummaryStream = () => {
      const lines = []
      let y = pH - mg - 20

      // Totals row
      const totalRow = ['', '', 'TOTAL', `Rs.${fmt(totalDr)}`, `Rs.${fmt(totalCr)}`, '', '']
      drawRow(lines, y, totalRow, '0.13 0.13 0.13', '1 1 1')
      y -= rH

      // Closing balance row
      drawRow(lines, y, ['', '', 'Closing Bal.', '', '', `Rs.${fmt(closingBalance)}`, closingBalance < 0 ? 'Advance' : 'Outstanding'], '0.2 0.5 0.2', '1 1 1')

      return lines.join('\n')
    }

    // Pagination
    const firstPageHeaderH = 20 + 18 + 13 + 13 + 13 + 10 + 8 + rH  // title+meta+divider+colhdr
    const rowsOnFirstPage = Math.max(1, Math.floor((pH - mg - firstPageHeaderH - (mg + rH * 2)) / rH))
    const subseqRowStartY = pH - mg - 20 - rH
    const rowsPerSubseqPage = Math.max(1, Math.floor((subseqRowStartY - (mg + rH * 2)) / rH))

    const pages = []
    pages.push(dataRows.slice(0, rowsOnFirstPage))
    let off = rowsOnFirstPage
    while (off < dataRows.length) {
      pages.push(dataRows.slice(off, off + rowsPerSubseqPage))
      off += rowsPerSubseqPage
    }
    // Summary appended to last page if it fits, else as a separate page
    const streams = pages.map((pr, i) => buildPageStream(pr, i === 0))
    streams[streams.length - 1] += '\n' + buildSummaryStream()

    // Build PDF
    const fontObjNum = 3 + pages.length * 2
    const pageKids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')
    const objs = []
    objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`)
    objs.push(`2 0 obj\n<< /Type /Pages /Kids [${pageKids}] /Count ${pages.length} >>\nendobj`)
    streams.forEach((stream, i) => {
      const enc = new TextEncoder().encode(stream)
      objs.push(`${3 + i * 2} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pW} ${pH}] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> >>\nendobj`)
      objs.push(`${4 + i * 2} 0 obj\n<< /Length ${enc.length} >>\nstream\n${stream}\nendstream\nendobj`)
    })
    objs.push(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`)

    let pdf = '%PDF-1.4\n'
    const offsets = []
    objs.forEach((obj) => { offsets.push(pdf.length); pdf += obj + '\n' })
    const xrefOffset = pdf.length
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
    offsets.forEach((o) => { pdf += String(o).padStart(10, '0') + ' 00000 n \n' })
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

    return new File([pdf], 'ledger.pdf', { type: 'application/pdf' })
  }

  const handleLedgerStatementPdf = async () => {
    try {
      const selectedClient = clients.find((client) => client.id === ledgerClientId)
      if (!selectedClient) { toast.error('Please select a valid client.'); return }

      const { startDate, endDate, label: dateRangeLabel } = getLedgerDateRange(ledgerDateRange)

      // Fetch payments — always query Firestore directly (no stale cache for ledger)
      let payments = []
      let lastVisibleDoc = null
      while (true) {
        const constraints = selectedClient.id === 'all'
          ? [where('createdAt', '>=', startDate), where('createdAt', '<=', endDate), orderBy('createdAt', 'asc'), limit(LEDGER_EXPORT_PAGE_SIZE)]
          : [where('clientId', '==', selectedClient.id), orderBy('createdAt', 'asc'), limit(LEDGER_EXPORT_PAGE_SIZE)]
        if (lastVisibleDoc) constraints.push(startAfter(lastVisibleDoc))
        const snap = await getDocs(query(collection(db, 'payments'), ...constraints))
        if (snap.empty) break
        payments.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        if (snap.docs.length < LEDGER_EXPORT_PAGE_SIZE) break
        lastVisibleDoc = snap.docs[snap.docs.length - 1]
      }

      // Date filter for single-client (Firestore can't compound-index clientId+createdAt without composite index)
      const filtered = payments.filter((tx) => {
        const d = resolveTimestamp(tx.createdAt) || resolveTimestamp(tx.date)
        return d && d >= startDate && d <= endDate
      })

      if (filtered.length === 0) {
        toast.error('No ledger entries found for the selected period.')
        return
      }

      // Sort chronologically so running balance flows correctly
      filtered.sort((a, b) => {
        const ta = (resolveTimestamp(a.createdAt) || resolveTimestamp(a.date) || new Date(0)).getTime()
        const tb = (resolveTimestamp(b.createdAt) || resolveTimestamp(b.date) || new Date(0)).getTime()
        return ta - tb
      })

      // Opening balance: current outstanding minus net movement in the period
      const periodNet = filtered.reduce((s, tx) => {
        const amt = Math.abs(Number(tx.amount || 0))
        if (tx.type === 'invoice') return s + amt
        if (tx.type === 'payment') return s - amt
        return s
      }, 0)
      const openingBalance = Math.max(0, Number(selectedClient.outstanding || 0) - periodNet)

      if (isMobileOrNative) {
        const file = buildLedgerPdf({ clientName: selectedClient.name, dateRangeLabel, txns: filtered, openingBalance })
        await shareOrDownloadPdf(file, 'Ledger Statement')
      } else {
        // Desktop: improved HTML table with running balance
        const clientMap = new Map(clients.map((c) => [c.id, c.name || 'Unknown']))
        let bal = openingBalance
        const rows = filtered.map((tx, idx) => {
          const amt = Math.abs(Number(tx.amount || 0))
          let dr = '', cr = ''
          if (tx.type === 'invoice') { bal += amt; dr = `Rs.${amt.toLocaleString('en-IN')}` }
          else if (tx.type === 'payment') { bal -= amt; cr = `Rs.${amt.toLocaleString('en-IN')}` }
          else { if (Number(tx.amount || 0) < 0) { bal += amt; dr = `Rs.${amt.toLocaleString('en-IN')}` } else { bal -= amt; cr = `Rs.${amt.toLocaleString('en-IN')}` } }
          const txDate = (resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt))?.toLocaleDateString('en-IN') || '-'
          const typeLabel = tx.type === 'invoice' ? 'Invoice' : tx.type === 'payment' ? 'Payment' : 'Reversal'
          const client = selectedClient.id === 'all' ? (clientMap.get(tx.clientId) || '-') : ''
          return [String(idx + 1), ...(selectedClient.id === 'all' ? [client] : []), txDate, typeLabel, dr, cr, `Rs.${bal.toLocaleString('en-IN')}`, tx.narration || '-']
        })
        const columns = ['Sr', ...(selectedClient.id === 'all' ? ['Client'] : []), 'Date', 'Type', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Narration']
        const metadata = [
          `Client: ${selectedClient.name}`,
          `Date Range: ${dateRangeLabel}`,
          `Opening Balance: Rs.${openingBalance.toLocaleString('en-IN')}`,
          `Closing Balance: Rs.${bal.toLocaleString('en-IN')}`,
        ]
        openReportWindow({ title: 'Ledger Statement', columns, rows, metadata })
      }

      setLedgerModalOpen(false)
    } catch (error) {
      toast.error('Unable to generate ledger statement.')
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
  ].filter(() => userRole === 'admin')

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
        <div className="flex items-center gap-2 relative" ref={notificationPanelRef}>
          <button
            onClick={handleBellClick}
            className="p-2 rounded-xl text-orange-500 hover:bg-orange-50 transition-colors relative"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={20} />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[11px] font-bold px-1 flex items-center justify-center">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>
          {notificationPanelOpen && (
            <div className="absolute right-0 top-12 w-[320px] max-h-[420px] overflow-hidden bg-white border border-gray-100 rounded-2xl shadow-xl z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-black text-[#131921]">Notifications</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={markAllNotificationsAsRead}
                    disabled={notifications.length === 0}
                    className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-[#131921] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCheck size={14} />
                    Clear all
                  </button>
                  <button
                    onClick={handleEnableNotifications}
                    className="text-xs font-bold text-orange-500 hover:text-orange-600"
                  >
                    Enable
                  </button>
                </div>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-gray-500">No notifications yet.</p>
                ) : (
                  notifications.map((item) => {
                    const isRead = !!notificationReadMap[item.id]
                    return (
                      <button
                        key={item.id}
                        onClick={() => markNotificationAsRead(item.id)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isRead ? 'bg-white' : 'bg-orange-50/40'}`}
                      >
                        <p className="text-sm font-bold text-[#131921]">{item.title || item.message || 'Notification'}</p>
                        {item.message && item.title ? (
                          <p className="mt-1 text-xs text-gray-600">{item.message}</p>
                        ) : null}
                        <p className="mt-2 text-[11px] text-gray-400">{formatNotificationTime(item.timestamp)}</p>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
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
                onOrder={(client) => setEditOrder({
                  clientId: client.id,
                  clientName: client.name || '',
                  address: client.address || '',
                  location: client.location || client.mapLink || '',
                  mapLink: client.mapLink || '',
                  locationLat: Number.isFinite(Number(client.locationLat)) ? Number(client.locationLat) : null,
                  locationLng: Number.isFinite(Number(client.locationLng)) ? Number(client.locationLng) : null,
                  rate: Number(client.rate) || 0
                })}
              />
              {userRole === 'admin' && <DefaulterReminderSettings />}
            </div>
          )}
          {activeTab === 'tasks' && <TasksPage />}
          {activeTab === 'intelligence' && <IntelligenceDashboard />}
          {activeTab === 'leads' && (
            <LeadsDashboard
              pendingAction={null}
            />
          )}
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
      {activeTab === 'orders' && userRole === 'admin' && (
        <button
          onClick={() => setEditOrder({})}
          className="fixed bottom-24 right-4 z-[998] bg-[#ff9900] text-white w-14 h-14 rounded-full shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="New Order"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* FAB: Add Client (Clients tab) */}
      {activeTab === 'clients' && userRole === 'admin' && (
        <button
          onClick={() => setAddClientOpen(true)}
          className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="Add new client"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* FAB: Record Payment (Transactions tab) */}
      {activeTab === 'payments' && userRole === 'admin' && (
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
