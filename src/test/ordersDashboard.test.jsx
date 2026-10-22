import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OrdersDashboard from '../components/OrdersDashboard'
import { getNormalizedOrderStatus, normalizeOrderDoc } from '../utils/orderUtils'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

let mockUserRole = 'staff'
let mockOrders = []
const mockClients = [
  { id: 'c1', name: 'Krishna Enterprise', mobile: '9998887771', address: 'Shop 1, Vadodara' },
  { id: 'c2', name: 'Radhe Provision Store', mobile: '9998887772', address: 'Shop 2, Vadodara' },
]

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      orders: mockOrders,
      clients: mockClients,
      userRole: mockUserRole,
      hasMoreOrders: false,
      loadingOlderOrders: false,
      loadOlderOrders: vi.fn(),
      loadAllPastOrders: vi.fn(),
      updateOrder: vi.fn(),
      deleteOrder: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

describe('Order Status Normalization', () => {
  it('normalizes missing, open, pending, and legacy statuses to Pending', () => {
    expect(getNormalizedOrderStatus(undefined)).toBe('Pending')
    expect(getNormalizedOrderStatus(null)).toBe('Pending')
    expect(getNormalizedOrderStatus('')).toBe('Pending')
    expect(getNormalizedOrderStatus('pending')).toBe('Pending')
    expect(getNormalizedOrderStatus('Pending')).toBe('Pending')
    expect(getNormalizedOrderStatus('open')).toBe('Pending')
    expect(getNormalizedOrderStatus('Open')).toBe('Pending')
    expect(getNormalizedOrderStatus('legacy')).toBe('Pending')
    expect(getNormalizedOrderStatus('LEGACY')).toBe('Pending')
  })

  it('normalizes confirmed variations to Confirmed', () => {
    expect(getNormalizedOrderStatus('confirmed')).toBe('Confirmed')
    expect(getNormalizedOrderStatus('Confirmed')).toBe('Confirmed')
  })

  it('normalizes delivered variations to Delivered', () => {
    expect(getNormalizedOrderStatus('delivered')).toBe('Delivered')
    expect(getNormalizedOrderStatus('Delivered')).toBe('Delivered')
  })

  it('normalizeOrderDoc automatically normalizes order status', () => {
    const docWithNullStatus = normalizeOrderDoc({ id: 'ord-1', clientName: 'Test' })
    expect(docWithNullStatus.status).toBe('Pending')

    const docWithOpenStatus = normalizeOrderDoc({ id: 'ord-2', status: 'open', clientName: 'Test' })
    expect(docWithOpenStatus.status).toBe('Pending')

    const docWithConfirmedStatus = normalizeOrderDoc({
      id: 'ord-3',
      status: 'confirmed',
      clientName: 'Test',
    })
    expect(docWithConfirmedStatus.status).toBe('Confirmed')
  })
})

describe('OrdersDashboard Staff Visibility vs Admin Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserRole = 'staff'
    mockOrders = [
      {
        id: 'ord-pending',
        clientName: 'Krishna Enterprise',
        clientId: 'c1',
        status: 'Pending',
        date: '2026-10-20',
        qty: 10,
        rate: 50,
        totalAmount: 500,
        sku: '250ml',
      },
      {
        id: 'ord-confirmed',
        clientName: 'Radhe Provision Store',
        clientId: 'c2',
        status: 'Confirmed',
        date: '2026-10-20',
        qty: 20,
        rate: 50,
        totalAmount: 1000,
        sku: '500ml',
      },
      {
        id: 'ord-delivered',
        clientName: 'Jay Ambe Store',
        clientId: 'c3',
        status: 'Delivered',
        date: '2026-10-19',
        qty: 5,
        rate: 100,
        totalAmount: 500,
        sku: '1L',
      },
    ]
  })

  it('renders prominent status badges for staff (Nilesh) without admin action buttons', () => {
    mockUserRole = 'staff'
    render(<OrdersDashboard />)

    // Staff sees explicit status indicators on cards
    expect(screen.getByText('Open Order')).toBeInTheDocument()
    expect(screen.getByText('Confirmed Order')).toBeInTheDocument()
    expect(screen.getAllByText('Delivered').length).toBeGreaterThanOrEqual(1)

    // Staff must NOT see admin mutation buttons
    expect(screen.queryByRole('button', { name: /^confirm$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^mark delivered$/i })).not.toBeInTheDocument()
  })

  it('renders action buttons for admin users', () => {
    mockUserRole = 'admin'
    render(<OrdersDashboard />)

    // Admin should see action buttons
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^mark delivered$/i })).toBeInTheDocument()
  })

  it('allows staff to filter orders by OPEN / CONFIRM, OPEN, CONFIRMED, and DELIVERED tabs', () => {
    mockUserRole = 'staff'
    render(<OrdersDashboard />)

    // Initially Open / Confirm view: Open and Confirmed orders are visible, Delivered is excluded
    expect(screen.getByText('Krishna Enterprise')).toBeInTheDocument()
    expect(screen.getByText('Radhe Provision Store')).toBeInTheDocument()
    expect(screen.queryByText('Jay Ambe Store')).not.toBeInTheDocument()

    // Click ALL filter to see all orders including delivered
    const allFilterBtn = screen.getByRole('button', { name: /^ALL$/i })
    fireEvent.click(allFilterBtn)

    expect(screen.getByText('Krishna Enterprise')).toBeInTheDocument()
    expect(screen.getByText('Radhe Provision Store')).toBeInTheDocument()
    expect(screen.getByText('Jay Ambe Store')).toBeInTheDocument()

    // Click OPEN filter
    const openFilterBtn = screen.getByRole('button', { name: /^OPEN$/i })
    fireEvent.click(openFilterBtn)

    expect(screen.getByText('Krishna Enterprise')).toBeInTheDocument()
    expect(screen.queryByText('Radhe Provision Store')).not.toBeInTheDocument()
    expect(screen.queryByText('Jay Ambe Store')).not.toBeInTheDocument()

    // Click CONFIRMED filter
    const confirmedFilterBtn = screen.getByRole('button', { name: /^CONFIRMED$/i })
    fireEvent.click(confirmedFilterBtn)

    expect(screen.queryByText('Krishna Enterprise')).not.toBeInTheDocument()
    expect(screen.getByText('Radhe Provision Store')).toBeInTheDocument()
    expect(screen.queryByText('Jay Ambe Store')).not.toBeInTheDocument()

    // Click DELIVERED filter
    const deliveredFilterBtn = screen.getByRole('button', { name: /^DELIVERED$/i })
    fireEvent.click(deliveredFilterBtn)

    expect(screen.queryByText('Krishna Enterprise')).not.toBeInTheDocument()
    expect(screen.queryByText('Radhe Provision Store')).not.toBeInTheDocument()
    expect(screen.getByText('Jay Ambe Store')).toBeInTheDocument()

    // Click OPEN / CONFIRM filter
    const openConfirmFilterBtn = screen.getByRole('button', { name: /open \/ confirm/i })
    fireEvent.click(openConfirmFilterBtn)

    expect(screen.getByText('Krishna Enterprise')).toBeInTheDocument()
    expect(screen.getByText('Radhe Provision Store')).toBeInTheDocument()
    expect(screen.queryByText('Jay Ambe Store')).not.toBeInTheDocument()
  })

  it('sorts open/confirm orders by date older first (yesterday -> today -> tomorrow)', () => {
    const now = new Date()
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const yesterdayStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
    const todayStr = fmt(now)
    const tomorrowStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const oldStr = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3))

    mockOrders = [
      {
        id: 'ord-tomorrow',
        clientName: 'Tomorrow Client',
        status: 'Pending',
        date: tomorrowStr,
        time: '11:00',
        qty: 15,
        sku: '200ml',
      },
      {
        id: 'ord-yesterday',
        clientName: 'Yesterday Client',
        status: 'Confirmed',
        date: yesterdayStr,
        time: '09:00',
        qty: 25,
        sku: '250ml',
      },
      {
        id: 'ord-today',
        clientName: 'Today Client',
        status: 'Pending',
        date: todayStr,
        time: '14:00',
        qty: 10,
        sku: '500ml',
      },
      {
        id: 'ord-delivered-old',
        clientName: 'Delivered Old Client',
        status: 'Delivered',
        date: oldStr,
        qty: 50,
      },
    ]

    render(<OrdersDashboard />)

    // Delivered order must NOT be visible in default Open / Confirm view
    expect(screen.queryByText('Delivered Old Client')).not.toBeInTheDocument()

    // Get rendered client headings in order
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent.trim())

    // Must be sorted older first: Yesterday (Oct 19) -> Today (Oct 20) -> Tomorrow (Oct 21)
    expect(headings).toEqual([
      'Yesterday Client',
      'Today Client',
      'Tomorrow Client',
    ])

    // Verify relative date badge pills
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getAllByText('Today').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })
})
