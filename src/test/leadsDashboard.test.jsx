import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeadsDashboard from '../components/LeadsDashboard'

vi.mock('../firebase-config', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  updateDoc: vi.fn().mockResolvedValue({}),
}))

const mockFetchLeads = vi.fn(() => vi.fn())

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      leads: [
        { id: 'l1', name: 'Ravi', mobile: '9925997750', Tag: null },
        { id: 'l2', name: 'Amit', mobile: '9825012345', Tag: 'SMS_SENT' },
      ],
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
})
