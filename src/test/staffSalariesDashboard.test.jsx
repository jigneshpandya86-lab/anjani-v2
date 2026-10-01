import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import StaffSalariesDashboard from '../components/StaffSalariesDashboard'

// Mock dependencies
vi.mock('../firebase-config', () => ({
  db: {},
  app: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, _col, id) => ({ id })),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: {
    fromDate: vi.fn((d) => ({ toDate: () => d })),
  },
  increment: vi.fn(),
}))

vi.mock('../store/clientStore', () => ({
  useClientStore: () => ({
    staffList: [
      {
        id: 'nilesh',
        name: 'Nilesh',
        role: 'Delivery Staff & Driver',
        mobile: '9925997750',
        baseSalary: 15000,
        advanceBalance: 2000,
      },
      {
        id: 'hiteshbhai',
        name: 'Hiteshbhai',
        role: 'Delivery Staff & Assistant',
        mobile: '9825000000',
        baseSalary: 14000,
        advanceBalance: 0,
      },
    ],
    staffLoading: false,
    fetchStaff: vi.fn(),
    staffTransactions: [
      {
        id: 'tx-1',
        employeeId: 'nilesh',
        amount: 2000,
        date: '2026-09-28',
        reason: 'Fuel and bike repair',
        note: 'Fuel and bike repair',
        sourceAccountId: 'counter',
        status: 'active',
      },
    ],
    staffTransactionsLoading: false,
    fetchStaffTransactions: vi.fn(),
    salarySettlements: [
      {
        id: 'sal-1',
        employeeId: 'nilesh',
        month: '2026-08',
        baseSalary: 15000,
        grossEarnings: 15000,
        advancesDeducted: 2000,
        netPaid: 13000,
        payoutAccountId: 'counter',
        payoutDate: '2026-09-01',
      },
    ],
    salarySettlementsLoading: false,
    fetchSalarySettlements: vi.fn(),
    accountsSummary: {
      nilesh: 3200,
      hiteshbhai: 1500,
      counter: 12000,
      bank: 45000,
    },
    fetchAccountsSummary: vi.fn(),
    updateStaffProfile: vi.fn(),
    deleteStaffTransaction: vi.fn(),
  }),
}))

describe('StaffSalariesDashboard', () => {
  it('renders without crashing and displays correct custody balance for selected employee', () => {
    render(<StaffSalariesDashboard />)

    // Heading
    expect(screen.getByText(/Staff Salaries & Advances/i)).toBeInTheDocument()

    // Employee Pills
    expect(screen.getAllByText('Nilesh').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Hiteshbhai')).toBeInTheDocument()

    // Metric highlights: Monthly Salary, Active Advance, Est. Pending Pay, Route Custody
    expect(screen.getByText(/^Monthly Salary$/i)).toBeInTheDocument()
    expect(screen.getByText('₹15,000')).toBeInTheDocument()

    expect(screen.getAllByText(/Active Advance/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('₹2,000').length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText(/Est\. Pending Pay/i)).toBeInTheDocument()
    expect(screen.getByText('₹13,000')).toBeInTheDocument()

    // Route Custody metric card (custodyBal)
    expect(screen.getByText(/Route Custody/i)).toBeInTheDocument()
    expect(screen.getByText('₹3,200')).toBeInTheDocument()
  })

  it('renders Action buttons for giving advance and settling salary', () => {
    render(<StaffSalariesDashboard />)

    expect(screen.getByRole('button', { name: /Give Advance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Settle Monthly Salary/i })).toBeInTheDocument()
  })

  it('supports click-to-expand on Advances & Repayments via top metric card and accordion toggle', () => {
    render(<StaffSalariesDashboard />)

    // Initially collapsed: filter pills not present
    expect(screen.queryByRole('button', { name: /Active Only/i })).not.toBeInTheDocument()

    // Click Active Advance card to expand
    const activeAdvanceCard = screen.getByTitle(/Click to expand advances and repayments/i)
    fireEvent.click(activeAdvanceCard)

    // Now expanded: filter pills and row details are visible
    expect(screen.getByRole('button', { name: /Active Only \(1\)/i })).toBeInTheDocument()
    expect(screen.getByText(/Fuel and bike repair/i)).toBeInTheDocument()

    // Clicking row expands additional audit details
    const advanceRow = screen.getByRole('button', { name: /Toggle advance tx-1 details/i })
    fireEvent.click(advanceRow)
    expect(screen.getByText(/Counter Cash Drawer/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete Advance & Refund/i })).toBeInTheDocument()

    // Click accordion header to collapse
    const accordionHeader = screen.getByRole('button', { name: /Advances & Repayments/i })
    fireEvent.click(accordionHeader)
    expect(screen.queryByRole('button', { name: /Active Only/i })).not.toBeInTheDocument()
  })

  it('supports click-to-expand on Settled Salary Slips via top metric card and accordion toggle', () => {
    render(<StaffSalariesDashboard />)

    // Initially collapsed: slip PDF button is not visible
    expect(screen.queryByRole('button', { name: /Slip PDF/i })).not.toBeInTheDocument()

    // Click Est. Pending Pay card to expand settlements
    const estPendingCard = screen.getByTitle(/Click to expand settled monthly salary slips/i)
    fireEvent.click(estPendingCard)

    // Now expanded: slip row and PDF button are visible
    expect(screen.getByRole('button', { name: /Slip PDF/i })).toBeInTheDocument()
    expect(screen.getAllByText(/August 2026/i).length).toBeGreaterThanOrEqual(1)

    // Click slip row to expand financial breakdown
    const slipRow = screen.getByRole('button', { name: /Toggle August 2026 slip breakdown/i })
    fireEvent.click(slipRow)
    expect(screen.getByText(/Gross Base/i)).toBeInTheDocument()
    expect(screen.getByText(/Advance Deducted/i)).toBeInTheDocument()

    // Click accordion header to collapse
    const accordionHeader = screen.getByRole('button', { name: /Settled Salary Slips/i })
    fireEvent.click(accordionHeader)
    expect(screen.queryByRole('button', { name: /Slip PDF/i })).not.toBeInTheDocument()
  })
})
