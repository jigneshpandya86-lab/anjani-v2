import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AccountsLedgerReportModal from '../components/AccountsLedgerReportModal'

// Mock dependencies
vi.mock('../firebase-config', () => ({
  db: {},
}))

vi.mock('../store/clientStore', () => ({
  useClientStore: () => ({
    accountsSummary: {
      nilesh: 2500,
      hiteshbhai: 1500,
      counter: 8000,
      bank: 25000,
    },
    clients: [
      { id: 'c1', name: 'Jay Ambe Provision' },
      { id: 'c2', name: 'Shreeji Mart' },
    ],
  }),
}))

describe('AccountsLedgerReportModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <AccountsLedgerReportModal isOpen={false} onClose={() => {}} initialAccountId="all" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders employee and account options when isOpen is true', () => {
    render(<AccountsLedgerReportModal isOpen={true} onClose={() => {}} initialAccountId="all" />)

    expect(screen.getByText(/Accounts & Cash Ledger \(PDF\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1\. Employee \/ Account Section/i)).toBeInTheDocument()
    expect(screen.getByText(/All Accounts & Staff/i)).toBeInTheDocument()
    expect(screen.getByText(/All Delivery Staff/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Nilesh/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/Hiteshbhai/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Counter \/ Jigneshbhai/i)).toBeInTheDocument()
    expect(screen.getByText(/Bank \/ UPI/i)).toBeInTheDocument()
  })

  it('displays date range presets and handles preset selection', () => {
    render(<AccountsLedgerReportModal isOpen={true} onClose={() => {}} initialAccountId="all" />)

    expect(screen.getByText(/2\. Date Range Selection/i)).toBeInTheDocument()
    const todayBtn = screen.getByRole('button', { name: /^Today$/i })
    const yesterdayBtn = screen.getByRole('button', { name: /^Yesterday$/i })
    const customBtn = screen.getByRole('button', { name: /Custom Range/i })

    expect(todayBtn).toBeInTheDocument()
    expect(yesterdayBtn).toBeInTheDocument()
    expect(customBtn).toBeInTheDocument()

    // Clicking custom range reveals Start Date and End Date inputs
    fireEvent.click(customBtn)
    expect(screen.getByText(/Start Date/i)).toBeInTheDocument()
    expect(screen.getByText(/End Date/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel button or X is clicked', () => {
    const handleClose = vi.fn()
    render(<AccountsLedgerReportModal isOpen={true} onClose={handleClose} initialAccountId="all" />)

    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i })
    fireEvent.click(cancelBtn)
    expect(handleClose).toHaveBeenCalledTimes(1)

    const closeBtn = screen.getByLabelText(/Close/i)
    fireEvent.click(closeBtn)
    expect(handleClose).toHaveBeenCalledTimes(2)
  })
})
