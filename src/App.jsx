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
  Sliders,
  CheckSquare,
  LogOut,
  Bell,
  CheckCheck,
  Brain,
  Gift,
  Receipt,
  Sparkles,
  Wallet,
  Droplets,
} from 'lucide-react'
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  startAfter,
} from 'firebase/firestore'
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
import AiAssistantDrawer from './components/AiAssistantDrawer'
import Login from './components/Login'
import TasksPage from './TasksPage'
import SettingsTab from './components/SettingsTab'
import DefaulterReminderSettings from './components/DefaulterReminderSettings'
import IntelligenceDashboard from './components/IntelligenceDashboard'
import CelebrationsTab from './components/CelebrationsTab'
import ExpensesDashboard from './components/ExpensesDashboard'
import AccountsDashboard from './components/AccountsDashboard'
import BaileyOrderPage from './components/BaileyOrderPage'
import {
  isMobileOrNative,
  shareOrDownloadPdf,
  resolveTimestamp,
  buildTabularReportPdf,
  buildSimpleInvoicePdfFile,
  buildLedgerPdf,
} from './utils/pdf'

const LEDGER_EXPORT_PAGE_SIZE = 500

function App() {
  const NOTIFICATION_READ_STORAGE_PREFIX = 'anjani-notification-read-v1'
  const [activeTab, setActiveTab] = useState('orders')
  const [editOrder, setEditOrder] = useState(null)
  const [editClient, setEditClient] = useState(null)
  const [addClientOpen, setAddClientOpen] = useState(false)
  const [clientPrefill, setClientPrefill] = useState(null)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
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
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockStatementMonth, setStockStatementMonth] = useState(
    new Date().toISOString().slice(0, 7),
  )
  const [pendingLeadAction, setPendingLeadAction] = useState(null)
  // ─────────────────────────────────────────
  // AUTH — DO NOT MODIFY WITHOUT TEAM REVIEW
  // ─────────────────────────────────────────
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const {
    fetchClients,
    fetchOrders,
    fetchStock,
    fetchStockTotal,
    fetchPaymentSettings,
    fetchAiSettings,
    aiDrawerOpen,
    setAiDrawerOpen,
    orders,
    clients,
    userRole,
    fetchUserRole,
  } = useClientStore()
  const readStorageKey = user?.uid ? `${NOTIFICATION_READ_STORAGE_PREFIX}-${user.uid}` : null

  const unreadNotificationCount = useMemo(() => {
    return notifications.reduce(
      (count, item) => (notificationReadMap[item.id] ? count : count + 1),
      0,
    )
  }, [notificationReadMap, notifications])

  // AUTH: monitors login/logout state with fast-path cache and watchdog timer
  useEffect(() => {
    // Safety watchdog: ensure loading screen NEVER hangs longer than 2.5s on slow mobile networks
    const watchdogTimer = setTimeout(() => {
      setAuthLoading(false)
    }, 2500)

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(watchdogTimer)
      setUser(currentUser)

      if (currentUser) {
        // Fast-path: immediate cache check so user sees UI instantly
        try {
          const cachedRole = window.localStorage.getItem(`anjani_user_role_${currentUser.uid}`)
          if (cachedRole) {
            useClientStore.setState({ userRole: cachedRole })
          } else if (
            currentUser.email?.toLowerCase().includes('admin') ||
            currentUser.email?.toLowerCase().includes('owner')
          ) {
            useClientStore.setState({ userRole: 'admin' })
          }
        } catch (_e) {
          // Ignore localStorage errors
        }

        // Release loading screen immediately!
        setAuthLoading(false)

        // Fetch/sync fresh role in background without blocking screen
        fetchUserRole(currentUser.uid)
      } else {
        await fetchUserRole(null)
        setAuthLoading(false)
      }
    })

    return () => {
      clearTimeout(watchdogTimer)
      unsubAuth()
    }
  }, [fetchUserRole])

  // FCM Auto-initialization for robustness
  useEffect(() => {
    if (user && Notification.permission === 'granted') {
      const initFcmAuto = async () => {
        try {
          const { initializeFcm } = await import('./services/fcm-setup')
          await initializeFcm(user.uid, user.email)
          console.log('FCM auto-initialized for user:', user.uid)
        } catch (err) {
          console.error('FCM auto-init error:', err)
        }
      }
      initFcmAuto()
    }
  }, [user])

  const handleEnableNotifications = async () => {
    if (!user) {
      toast.error('User not logged in.')
      return
    }
    try {
      console.log('Starting notification setup...')
      const { initializeFcm, sendLocalTestNotification } = await import('./services/fcm-setup')
      console.log('FCM module imported successfully')
      const result = await initializeFcm(user.uid, user.email)
      console.log('FCM initialization result:', result)

      if (result.success) {
        toast.success(`Push notifications enabled (${result.tokenPreview})`)
        sendLocalTestNotification(result.serviceWorkerRegistration).then((testSent) => {
          if (testSent) {
            toast.success('Test notification sent to this device.')
          } else {
            toast.error('Device registered, but test notification could not be displayed.')
          }
        })
        if (!result.tokenStored) {
          toast.error('Notification permission granted, but token record could not be verified.')
        }
      } else {
        console.log('FCM initialization failed with reason:', result.reason)
        if (result.reason === 'permission-denied') {
          toast.error(
            'Notification permission denied. Please allow notifications in browser settings.',
          )
        } else if (result.reason === 'unsupported-browser') {
          toast.error('This browser does not support Firebase web push notifications.')
        } else if (result.reason === 'service-worker-unavailable') {
          toast.error('Service Worker is not available in this browser context.')
        } else if (result.reason === 'token-missing') {
          toast.error('Permission granted, but Firebase could not issue a device token.')
        } else {
          toast.error('Failed to enable notifications. Please check browser permissions.')
        }
      }
    } catch (error) {
      console.error('Error in handleEnableNotifications:', error)
      toast.error('Error enabling notifications: ' + error.message)
    }
  }

  const formatNotificationTime = (value) => {
    if (!value) return ''

    const asDate =
      value?.toDate?.() ||
      (typeof value === 'object' && typeof value.seconds === 'number'
        ? new Date(value.seconds * 1000)
        : new Date(value))

    if (!(asDate instanceof Date) || Number.isNaN(asDate.getTime())) return ''

    return asDate.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
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
      limit(20),
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
    let unsubClients, unsubStock, unsubStockTotal
    fetchPaymentSettings()
    fetchAiSettings()

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
  }, [fetchClients, fetchOrders, fetchStock, fetchStockTotal, fetchPaymentSettings, fetchAiSettings, user, userRole])

  // AUTH: signs out the current user and clears session
  const handleLogout = async () => {
    try {
      await signOut(auth)
      toast.success('Signed out successfully')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  // AUTH: simple admin check — placeholder for proper role system
  const isAdmin =
    user?.email?.toLowerCase()?.includes('admin') || user?.email?.toLowerCase()?.includes('owner')

  const navItems = [
    { id: 'orders', label: 'Orders', icon: <ShoppingCart size={20} /> },
    { id: 'clients', label: 'Clients', icon: <Users size={20} /> },
    { id: 'payments', label: 'Transactions', icon: <CreditCard size={20} /> },
    { id: 'stock', label: 'Stock', icon: <Package size={20} /> },
    { id: 'expenses', label: 'Expenses', icon: <Receipt size={20} /> },
  ].filter(item => userRole === 'admin' || item.id === 'orders')

  const drawerNavItems = [
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
    userRole === 'admin' && {
      id: 'accounts',
      label: 'Accounts & Staff Cash',
      icon: <Wallet size={20} />,
    },
    userRole === 'admin' && {
      id: 'intelligence',
      label: 'Intelligence Hub',
      icon: <Brain size={20} />,
    },
    userRole === 'admin' && {
      id: 'celebrations',
      label: 'Celebrations',
      icon: <Gift size={20} />,
    },
    ...navItems,
    userRole === 'admin' && {
      id: 'settings',
      label: 'Settings',
      icon: <Sliders size={20} />,
    },
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
      },
    },
    {
      id: 'quick-open-leads',
      label: 'Open Leads',
      icon: <TrendingUp size={18} />,
      onClick: () => {
        setActiveTab('leads')
        setDrawerOpen(false)
      },
    },
    {
      id: 'quick-add-client',
      label: 'Add Client',
      icon: <UserPlus size={18} />,
      onClick: () => {
        setActiveTab('clients')
        setAddClientOpen(true)
        setDrawerOpen(false)
      },
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
      },
    },
    {
      id: 'quick-order-bailey',
      label: 'Order Bailey Water',
      icon: <Droplets size={18} />,
      onClick: () => {
        setActiveTab('bailey-order')
        setDrawerOpen(false)
      },
    },
  ].filter(() => userRole === 'admin')

  const openReportWindow = ({
    title,
    columns,
    rows,
    metadata = [],
    reportWindow: providedReportWindow = null,
    styles = '', // Optional: extra CSS
  }) => {
    const reportWindow = providedReportWindow || window.open('', '_blank', 'width=900,height=700')
    if (!reportWindow) {
      toast.error('Popup blocked. Please allow popups to generate PDF report.')
      return false
    }

    const generatedAt = new Date().toLocaleString('en-IN')
    const headerRow = columns.map((col) => `<th>${col}</th>`).join('')
    const bodyRows = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${cell || '-'}</td>`).join('')}</tr>`)
      .join('')
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
            ${styles}
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


  const handleRecordPaymentFromOrder = (order) => {
    const client = clients.find((c) => c.id === order.clientId)
    const amount =
      Number(order.totalAmount) || (Number(order.qty) || 0) * (Number(order.rate) || 0)
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    setPayClient(client || {})
    setPaymentPrefill({
      amount,
      date,
      time,
      note: `Payment received for order ${order.orderId || order.id}`,
    })
  }

  const handleOrderInvoiceWhatsApp = async (order) => {
    const client = clients.find((c) => c.id === order.clientId)
    const clientName = order.clientName || order.customerName || client?.name || 'Unknown Client'
    const mobile = order.mobile || order.phone || client?.mobile || ''
    const amountVal =
      Number(order.totalAmount) || (Number(order.qty) || 0) * (Number(order.rate) || 0)
    const amount = amountVal.toLocaleString('en-IN')
    const pdfFile = buildSimpleInvoicePdfFile({
      order,
      clientName,
      mobile,
      paymentSettings: useClientStore.getState()?.paymentSettings,
    })
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

      // Fetch payments — always query Firestore directly (no stale cache for ledger)
      let payments = []
      let lastVisibleDoc = null
      while (true) {
        const constraints =
          selectedClient.id === 'all'
            ? [
                where('createdAt', '>=', startDate),
                where('createdAt', '<=', endDate),
                orderBy('createdAt', 'asc'),
                limit(LEDGER_EXPORT_PAGE_SIZE),
              ]
            : [where('clientId', '==', selectedClient.id), limit(LEDGER_EXPORT_PAGE_SIZE)]
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
        const ta = (
          resolveTimestamp(a.createdAt) ||
          resolveTimestamp(a.date) ||
          new Date(0)
        ).getTime()
        const tb = (
          resolveTimestamp(b.createdAt) ||
          resolveTimestamp(b.date) ||
          new Date(0)
        ).getTime()
        return ta - tb
      })

      // Opening balance: sum of all prior transactions before startDate (0 extra database reads)
      let openingBalance = 0
      if (selectedClient.id !== 'all') {
        openingBalance = payments.reduce((acc, tx) => {
          const d = resolveTimestamp(tx.createdAt) || resolveTimestamp(tx.date)
          if (!d || d >= startDate) return acc
          const amt = Number(tx.amount || 0)
          if (tx.type === 'invoice') {
            return acc + Math.abs(amt)
          } else if (tx.type === 'payment') {
            return acc - Math.abs(amt)
          } else {
            return amt < 0 ? acc + Math.abs(amt) : acc - amt
          }
        }, 0)
      }

      if (isMobileOrNative) {
        const file = buildLedgerPdf({
          clientName: selectedClient.name,
          dateRangeLabel,
          txns: filtered,
          openingBalance,
        })
        await shareOrDownloadPdf(file, 'Ledger Statement')
      } else {
        // Desktop: improved HTML table with running balance
        const clientMap = new Map(clients.map((c) => [c.id, c.name || 'Unknown']))
        let bal = openingBalance
        const rows = filtered.map((tx, idx) => {
          const amt = Math.abs(Number(tx.amount || 0))
          let dr = '',
            cr = ''
          if (tx.type === 'invoice') {
            bal += amt
            dr = `Rs.${amt.toLocaleString('en-IN')}`
          } else if (tx.type === 'payment') {
            bal -= amt
            cr = `Rs.${amt.toLocaleString('en-IN')}`
          } else {
            if (Number(tx.amount || 0) < 0) {
              bal += amt
              dr = `Rs.${amt.toLocaleString('en-IN')}`
            } else {
              bal -= amt
              cr = `Rs.${amt.toLocaleString('en-IN')}`
            }
          }
          const txDate =
            (resolveTimestamp(tx.date) || resolveTimestamp(tx.createdAt))?.toLocaleDateString(
              'en-IN',
            ) || '-'
          const typeLabel =
            tx.type === 'invoice' ? 'Invoice' : tx.type === 'payment' ? 'Payment' : 'Reversal'
          const client = selectedClient.id === 'all' ? clientMap.get(tx.clientId) || '-' : ''
          return [
            String(idx + 1),
            ...(selectedClient.id === 'all' ? [client] : []),
            txDate,
            typeLabel,
            dr,
            cr,
            `Rs.${bal.toLocaleString('en-IN')}`,
            tx.narration || '-',
          ]
        })
        const columns = [
          'Sr',
          ...(selectedClient.id === 'all' ? ['Client'] : []),
          'Date',
          'Type',
          'Debit (Dr)',
          'Credit (Cr)',
          'Balance',
          'Narration',
        ]
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

  const handleStockStatementPdf = async () => {
    try {
      const selectedMonthStr = stockStatementMonth
      if (!selectedMonthStr) {
        toast.error('Please select a month.')
        return
      }

      const [year, month] = selectedMonthStr.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)

      const getTime = (value) => {
        if (!value) return 0
        if (value?.toMillis) return value.toMillis()
        if (value?.seconds) return value.seconds * 1000
        if (value instanceof Date) return value.getTime()
        if (typeof value === 'string') {
          const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/)
          if (ddmmyyyy) {
            const [, dd, mm, yyyy] = ddmmyyyy
            return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
          }
          return new Date(value).getTime()
        }
        return 0
      }

      const getQty = (raw) => {
        const hasLegacyProducedDelivered =
          raw.produced !== undefined || raw.delivered !== undefined
        if (hasLegacyProducedDelivered && raw.qty === undefined) {
          return (Number(raw.produced) || 0) - (Number(raw.delivered) || 0)
        }
        return Number(raw.qty || raw.boxes || raw.quantity) || 0
      }

      // 1. Fetch ALL stock docs to ensure accuracy (handling legacy fields and various date formats)
      // If performance becomes an issue, we can optimize by storing monthly snapshots.
      console.log(`[StockReport] Fetching all stock entries for accurate calculation...`)
      const allSnap = await getDocs(collection(db, 'stock'))
      const allEntries = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      let openingBalance = 0
      const monthlyTxns = []

      const startMs = startDate.getTime()
      const endMs = endDate.getTime()

      allEntries.forEach((entry) => {
        const entryTime = getTime(entry.date || entry.createdAt)
        const qty = getQty(entry)

        if (entryTime < startMs) {
          openingBalance += qty
        } else if (entryTime >= startMs && entryTime <= endMs) {
          monthlyTxns.push({ ...entry, _time: entryTime, _qty: qty })
        }
      })

      // Sort monthly transactions by date
      monthlyTxns.sort((a, b) => a._time - b._time)

      let runningBalance = openingBalance
      const rows = []
      // Opening Balance Row
      rows.push(['-', 'OPENING BALANCE', '-', '-', openingBalance.toLocaleString('en-IN')])

      monthlyTxns.forEach((data) => {
        const qty = data._qty
        const debit = qty < 0 ? Math.abs(qty).toLocaleString('en-IN') : '-'
        const credit = qty > 0 ? qty.toLocaleString('en-IN') : '-'
        runningBalance += qty

        let dateDisplay = '-'
        const d = data.date || data.createdAt
        if (d?.toDate) {
          dateDisplay = d.toDate().toLocaleDateString('en-IN')
        } else if (typeof d === 'string') {
          dateDisplay = d
        } else if (d instanceof Date) {
          dateDisplay = d.toLocaleDateString('en-IN')
        }

        rows.push([
          dateDisplay,
          data.narration || data.note || '-',
          debit,
          credit,
          runningBalance.toLocaleString('en-IN'),
        ])
      })

      // Closing Balance Row
      rows.push(['-', 'CLOSING BALANCE', '-', '-', runningBalance.toLocaleString('en-IN')])

      const columns = ['Date', 'Description', 'Debit', 'Credit', 'Balance']
      const columnWidths = [0.18, 0.42, 0.12, 0.12, 0.16] // Better distribution for Description
      const metadata = [
        `Period: ${startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
      ]

      if (isMobileOrNative) {
        const file = buildTabularReportPdf({
          title: 'Stock Statement',
          columns,
          rows,
          metadata,
          columnWidths,
          filename: `stock_statement_${selectedMonthStr}.pdf`,
        })
        await shareOrDownloadPdf(file, 'Stock Statement')
      } else {
        // For web, we inject styles to handle widths
        openReportWindow({
          title: 'Stock Statement Report (PDF)',
          columns,
          rows,
          metadata,
          styles: 'table td:nth-child(2) { width: 42%; } table td:nth-child(3), table td:nth-child(4) { width: 12%; text-align: center; }',
        })
      }

      setStockModalOpen(false)
    } catch (error) {
      const errorMessage = error.message || 'Unknown error'
      if (errorMessage.includes('index')) {
        toast.error('Firestore index required. Check console for link.')
      } else {
        toast.error(`Error: ${errorMessage.slice(0, 50)}`)
      }
      console.error('[StockReport Error]', error)
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
      const clientName = (
        client?.name ||
        order.clientName ||
        order.customerName ||
        ''
      ).toLowerCase()
      const mobile = String(client?.mobile || order.mobile || order.phone || '').toLowerCase()
      const orderId = String(order.orderId || order.id || '').toLowerCase()
      return (
        orderId.includes(searchTerm) ||
        clientName.includes(searchTerm) ||
        mobile.includes(searchTerm)
      )
    })

    if (matchedOrders.length === 0) {
      toast.error('No matching orders found.')
      return
    }

    if (matchedOrders.length > 1) {
      toast.error(
        'Multiple matching orders found. Please search by exact Order ID for single invoice.',
      )
      return
    }

    const order = matchedOrders[0]
    const client = clients.find((c) => c.id === order.clientId)
    const clientName = client?.name || order.clientName || order.customerName || 'Unknown Client'
    const mobile = client?.mobile || order.mobile || order.phone || '-'

    const pdfFile = buildSimpleInvoicePdfFile({
      order,
      clientName,
      mobile,
      paymentSettings: useClientStore.getState()?.paymentSettings,
    })
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
      },
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
      },
    },
    {
      id: 'report-stock-statement',
      label: 'Stock Statement (PDF)',
      icon: <Package size={18} />,
      onClick: () => {
        setDrawerOpen(false)
        setStockModalOpen(true)
      },
    },
  ].filter((r) => {
    if (r.id === 'report-order-specific') return true
    return userRole === 'admin' || isAdmin
  })

  // AUTH: show loading screen while Firebase resolves the auth state on startup
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] font-sans flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-tighter text-[#131921]">
            ANJANI <span className="text-[#ff9900]">WATER</span>
          </h1>
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
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#131921',
            border: '1px solid #e5e7eb',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            borderRadius: '12px',
            fontWeight: '900',
            fontSize: '14px',
            padding: '16px 24px',
          },
          success: { iconTheme: { primary: '#25D366', secondary: '#fff' } },
          error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />

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
            <h1 className="text-xl font-black tracking-tighter text-[#131921]">
              ANJANI <span className="text-[#ff9900]">WATER</span>
            </h1>
          </div>
        </div>
        {/* AUTH: user email + logout button — do not remove */}
        <div className="flex items-center gap-2 relative" ref={notificationPanelRef}>
          <button
            onClick={() => setAiDrawerOpen(true)}
            className="p-2 rounded-xl text-[#ff9900] bg-orange-50 hover:bg-orange-100 transition-colors relative flex items-center justify-center border border-orange-200"
            aria-label="Anjani AI Assistant"
            title="Anjani AI Assistant (Scan Vendor Bill / Queries)"
          >
            <Sparkles size={19} className="text-[#ff9900]" />
          </button>
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
                        <p className="text-sm font-bold text-[#131921]">
                          {item.title || item.message || 'Notification'}
                        </p>
                        {item.message && item.title ? (
                          <p className="mt-1 text-xs text-gray-600">{item.message}</p>
                        ) : null}
                        <p className="mt-2 text-[11px] text-gray-400">
                          {formatNotificationTime(item.timestamp)}
                        </p>
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
              onCopy={(o) => {
                const now = new Date()
                const yyyy = now.getFullYear()
                const mm = String(now.getMonth() + 1).padStart(2, '0')
                const dd = String(now.getDate()).padStart(2, '0')
                const localDate = `${yyyy}-${mm}-${dd}`
                const hh = String(now.getHours()).padStart(2, '0')
                const min = String(now.getMinutes()).padStart(2, '0')
                const localTime = `${hh}:${min}`
                setEditOrder({
                  ...o,
                  id: null,
                  date: localDate,
                  time: localTime,
                  deliveryDate: localDate,
                  orderDate: localDate,
                  deliveryTime: localTime,
                })
              }}
              onRecordPayment={handleRecordPaymentFromOrder}
              onShareInvoice={handleOrderInvoiceWhatsApp}
              onOpenBaileyOrder={() => setActiveTab('bailey-order')}
            />
          )}
          {activeTab === 'stock' && (
            <StockDashboard
              onOpenReport={() => setStockModalOpen(true)}
              onOpenBaileyOrder={() => setActiveTab('bailey-order')}
            />
          )}
          {activeTab === 'bailey-order' && userRole === 'admin' && (
            <BaileyOrderPage onBack={() => setActiveTab('stock')} />
          )}
          {activeTab === 'payments' && (
            <PaymentDashboard onNavigateAccounts={() => setActiveTab('accounts')} />
          )}
          {activeTab === 'accounts' && userRole === 'admin' && <AccountsDashboard />}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <ClientList
                onEdit={setEditClient}
                onPay={(client) => {
                  setPaymentPrefill(null)
                  setPayClient(client)
                }}
                onOrder={(client) =>
                  setEditOrder({
                    clientId: client.id,
                    clientName: client.name || '',
                    address: client.address || '',
                    location: client.location || client.mapLink || '',
                    mapLink: client.mapLink || '',
                    locationLat: Number.isFinite(Number(client.locationLat))
                      ? Number(client.locationLat)
                      : null,
                    locationLng: Number.isFinite(Number(client.locationLng))
                      ? Number(client.locationLng)
                      : null,
                    rate: Number(client.rate) || 0,
                  })
                }
              />
              {userRole === 'admin' && <DefaulterReminderSettings />}
            </div>
          )}
          {activeTab === 'tasks' && <TasksPage />}
          {activeTab === 'intelligence' && <IntelligenceDashboard />}
          {activeTab === 'celebrations' && <CelebrationsTab />}
          {activeTab === 'expenses' && userRole === 'admin' && (
            <ExpensesDashboard
              showAddForm={addExpenseOpen}
              onOpenAddForm={() => setAddExpenseOpen(true)}
              onCloseAddForm={() => setAddExpenseOpen(false)}
            />
          )}
          {activeTab === 'leads' && (
            <LeadsDashboard
              pendingAction={pendingLeadAction}
              onPendingActionHandled={() => setPendingLeadAction(null)}
            />
          )}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </div>

      {/* Slide-in Drawer (all screen sizes) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[1001]">
          <div className="absolute inset-0 bg-black/20" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-black tracking-tighter text-[#131921]">
                  ANJANI <span className="text-[#ff9900]">WATER</span>
                </h2>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-xl text-gray-400 hover:bg-gray-100"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-black tracking-[0.14em] text-gray-400 uppercase">
                  Quick Actions
                </p>
                {drawerQuickActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={action.onClick}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    <span className="text-[#ff9900]">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {drawerNavItems.map((item) => (
                  <button
                    key={`drawer-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id)
                      setDrawerOpen(false)
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      activeTab === item.id
                        ? 'bg-orange-50 text-[#131921] border border-orange-100'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <span className={activeTab === item.id ? 'text-[#ff9900]' : 'text-gray-400'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <p className="px-2 text-[11px] font-black tracking-[0.14em] text-gray-400 uppercase">
                  Reports (PDF)
                </p>
                {drawerReports
                  .filter((report) => report.id !== 'report-stock-statement' || isAdmin)
                  .map((report) => (
                    <button
                      key={report.id}
                      onClick={report.onClick}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
                    >
                      <span className="text-[#ff9900]">{report.icon}</span>
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
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => setEditOrder(null)}
        >
          <div
            className="relative bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 pt-12"
            onClick={(e) => e.stopPropagation()}
          >
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
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-3 sm:p-4"
          onClick={() => setEditClient(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AddClient client={editClient} onDone={() => setEditClient(null)} />
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {addClientOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-3 sm:p-4"
          onClick={() => {
            setAddClientOpen(false)
            setClientPrefill(null)
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <AddClient
              initialValues={clientPrefill || {}}
              onDone={() => {
                setAddClientOpen(false)
                setClientPrefill(null)
              }}
            />
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {(payClient !== null || paymentPrefill !== null) && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => {
            setPayClient(null)
            setPaymentPrefill(null)
          }}
        >
          <div
            className="relative bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 pt-10 md:p-5 md:pt-10"
            onClick={(e) => e.stopPropagation()}
          >
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
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => setLedgerModalOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
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

      {/* Stock Statement Modal */}
      {stockModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[1000] flex items-end md:items-center justify-center p-4"
          onClick={() => setStockModalOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setStockModalOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-lg text-gray-500 bg-gray-100 hover:bg-gray-200"
              aria-label="Close stock statement options"
            >
              <X size={18} />
            </button>

            <h3 className="text-lg font-black text-[#131921]">Stock Statement Options</h3>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              Admin Only • Max 1 Month
            </p>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-gray-700">Select Month</span>
                <input
                  type="month"
                  value={stockStatementMonth}
                  onChange={(e) => setStockStatementMonth(e.target.value)}
                  max={new Date().toISOString().slice(0, 7)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStockModalOpen(false)}
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStockStatementPdf}
                className="rounded-xl bg-[#ff9900] px-4 py-2 text-sm font-bold text-white hover:bg-orange-600"
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
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === item.id
                ? 'text-[#ff9900] bg-[#fff4e5] shadow-[0_4px_10px_rgba(255,153,0,0.15)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            aria-label={`Open ${item.label}`}
          >
            {item.icon}
            <span
              className={`text-[9px] mt-0 uppercase tracking-tight ${activeTab === item.id ? 'font-black' : 'font-bold'}`}
            >
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

      {/* FAB: Record Expense (Expenses tab) */}
      {activeTab === 'expenses' && userRole === 'admin' && (
        <button
          onClick={() => setAddExpenseOpen(true)}
          className="fixed right-4 bottom-24 z-[998] h-14 w-14 rounded-full bg-[#ff9900] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center active:scale-95 transition-all"
          aria-label="Record expense"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      )}

      {/* AI Assistant Drawer */}
      <AiAssistantDrawer
        isOpen={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenPaymentModal={(prefill) => {
          if (prefill?.clientId) {
            const client = clients.find((c) => c.id === prefill.clientId)
            setPayClient(client || null)
          } else if (prefill?.clientName) {
            const client = clients.find(
              (c) => c.name?.toLowerCase() === prefill.clientName?.toLowerCase(),
            )
            setPayClient(client || null)
          } else if (prefill && typeof prefill === 'object' && prefill.id) {
            setPayClient(prefill)
          } else {
            setPayClient(null)
          }
          setPaymentPrefill(prefill || null)
          setAiDrawerOpen(false)
        }}
        onOpenAddClient={(prefill) => {
          setClientPrefill(prefill || null)
          setAddClientOpen(true)
          setAiDrawerOpen(false)
        }}
        onOpenOrderModal={(order) => {
          setEditOrder(order)
          setAiDrawerOpen(false)
        }}
      />

      {/* Floating AI Assistant Trigger Button (Compact, Bottom-Right) */}
      <button
        type="button"
        onClick={() => setAiDrawerOpen(true)}
        className={`fixed right-4 z-[998] bg-[#131921] hover:bg-black text-[#ff9900] border border-[#ff9900]/80 h-11 w-11 sm:h-12 sm:w-12 rounded-full shadow-lg shadow-black/30 flex items-center justify-center active:scale-90 transition-all group ${
          userRole === 'admin' && ['orders', 'clients', 'payments', 'expenses'].includes(activeTab)
            ? 'bottom-40'
            : 'bottom-22 sm:bottom-24'
        }`}
        aria-label="Open AI Assistant"
        title="Anjani AI Assistant (Scan Vendor Bills, Inquire Stock)"
      >
        <Sparkles size={20} className="text-[#ff9900] group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  )
}

export default App
