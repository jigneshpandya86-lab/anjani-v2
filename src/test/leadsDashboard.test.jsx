import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LeadsDashboard from '../components/LeadsDashboard'

vi.mock('../firebase-config', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  where: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  updateDoc: vi.fn().mockResolvedValue({}),
}))

const mockFetchLeads = vi.fn(() => vi.fn())

let currentMockLeads = [
  { id: 'l1', name: 'Ravi', mobile: '9925997750', Tag: null },
  { id: 'l2', name: 'Amit', mobile: '9825012345', Tag: 'SMS_SENT' },
]

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      leads: currentMockLeads,
      fetchLeads: mockFetchLeads,
      updateLead: vi.fn(),
      addLead: vi.fn(),
      deleteLead: vi.fn(),
    }
    return selector(state)
  },
}))

describe('LeadsDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentMockLeads = [
      { id: 'l1', name: 'Ravi', mobile: '9925997750', Tag: null },
      { id: 'l2', name: 'Amit', mobile: '9825012345', Tag: 'SMS_SENT' },
    ]
  })

  it('renders without ReferenceError and has click-to-expand panel', () => {
    render(<LeadsDashboard />)

    // Heading should be visible
    expect(screen.getByRole('heading', { name: /^leads$/i })).toBeInTheDocument()

    // Action panel toggle button should be visible
    const toggleButton = screen.getByRole('button', { name: /toggle lead automations/i })
    expect(toggleButton).toBeInTheDocument()
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    // Inner action buttons should NOT be visible when collapsed
    expect(screen.queryByRole('button', { name: /^connect 1$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /re-message/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^run both$/i })).not.toBeInTheDocument()

    // Click to expand
    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')

    // Now actions should be visible
    expect(screen.getByRole('button', { name: /^connect 1$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /re-message/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^run both$/i })).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(toggleButton)
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^connect 1$/i })).not.toBeInTheDocument()
  })

  it('auto-expands action panel when pendingAction is passed', () => {
    const handleHandled = vi.fn()
    render(<LeadsDashboard pendingAction="connect" onPendingActionHandled={handleHandled} />)

    const toggleButton = screen.getByRole('button', { name: /toggle lead automations/i })
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/connect new leads/i)).toBeInTheDocument()
  })

  it('properly categorizes untagged leads with and without phone numbers, displaying No Phone badge', () => {
    currentMockLeads = [
      { id: 'l1', name: 'Ravi', mobile: '9925997750', Tag: null },
      { id: 'l2', name: 'Old Phoner', mobile: '', Tag: null },
      { id: 'l3', name: 'Already Marked', mobile: '', Tag: 'NO_PHONE' },
      { id: 'l4', name: 'Sent Guy', mobile: '9825012345', Tag: 'SMS_SENT' },
    ]

    render(<LeadsDashboard />)

    // Should display 1 New and 1 No Phone badges in header
    expect(screen.getByText('1 New')).toBeInTheDocument()
    expect(screen.getByText('1 No Phone')).toBeInTheDocument()
    expect(screen.getByText('1 In Follow-up')).toBeInTheDocument()

    // Expand
    const toggleButton = screen.getByRole('button', { name: /toggle lead automations/i })
    fireEvent.click(toggleButton)

    // Connect button should only count connectable leads (1)
    const connectButton = screen.getByRole('button', { name: /^connect 1$/i })
    expect(connectButton).toBeInTheDocument()
  })

  it('opens WhatsApp with valid phone on WA click', () => {
    const originalOpen = window.open
    window.open = vi.fn()

    render(<LeadsDashboard />)
    const waButtons = screen.getAllByRole('button', { name: /whatsapp/i })
    fireEvent.click(waButtons[0])

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/919925997750'),
      '_blank'
    )
    window.open = originalOpen
  })

  it('connects untagged lead with phone and marks phoneless lead as NO_PHONE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    currentMockLeads = [
      { id: 'l1', name: 'Ravi', mobile: '9925997750', Tag: null },
      { id: 'l2', name: 'Old Phoner', mobile: '', Tag: null },
    ]

    render(<LeadsDashboard />)
    const toggleButton = screen.getByRole('button', { name: /toggle lead automations/i })
    fireEvent.click(toggleButton)

    const connectButton = screen.getByRole('button', { name: /^connect 1$/i })
    fireEvent.click(connectButton)

    const { updateDoc } = await import('firebase/firestore')
    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ Tag: 'NO_PHONE' })
      )
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ Tag: 'SMS_SENT' })
      )
    })
  })
})
