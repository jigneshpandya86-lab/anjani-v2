import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CashHandoverModal from '../components/CashHandoverModal'

const mockRecordAccountTransfer = vi.fn().mockResolvedValue({})
const mockSendBackgroundSms = vi.fn().mockResolvedValue({})
const mockFetchStaff = vi.fn().mockReturnValue(vi.fn())

vi.mock('../firebase-config', () => ({
  db: {},
  auth: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: { now: vi.fn() },
  increment: vi.fn(),
}))

vi.mock('../services/leadSmsService', () => ({
  sendBackgroundSms: (...args) => mockSendBackgroundSms(...args),
  DEFAULT_MACRO_URL: 'https://mock.macrodroid.url',
}))

const mockStaffList = [
  { id: 'nilesh', name: 'Nilesh', mobile: '7990943652' },
  { id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '7778077617' },
]

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      recordAccountTransfer: mockRecordAccountTransfer,
      staffList: mockStaffList,
      fetchStaff: mockFetchStaff,
    }
    return selector(state)
  },
}))

describe('CashHandoverModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
  })

  it('renders modal with transfer details, calculator toggle, and SMS section', () => {
    render(
      <CashHandoverModal
        isOpen={true}
        onClose={vi.fn()}
        initialSource="nilesh"
        accountsSummary={{ nilesh: 6200, counter: 15000 }}
      />,
    )

    expect(screen.getByRole('heading', { name: /cash handover/i })).toBeInTheDocument()
    expect(screen.getByText(/From \(Payer\)/i)).toBeInTheDocument()
    expect(screen.getByText(/To \(Receiver\)/i)).toBeInTheDocument()

    // Calculator button exists
    expect(screen.getByRole('button', { name: /calculator/i })).toBeInTheDocument()

    // MacroDroid menu starts collapsed with click-to-open header
    const macroButton = screen.getByRole('button', { name: /macrodroid/i })
    expect(macroButton).toBeInTheDocument()
    expect(screen.getByText(/click to open/i)).toBeInTheDocument()
    expect(screen.queryByDisplayValue('7990943652')).not.toBeInTheDocument()

    // Click to open MacroDroid menu
    fireEvent.click(macroButton)

    // SMS checkbox exists and is checked for Nilesh with real phone 7990943652
    const smsCheckbox = screen.getByRole('checkbox', { name: /send sms confirmation/i })
    expect(smsCheckbox).toBeChecked()
    expect(screen.getByDisplayValue('7990943652')).toBeInTheDocument()
    expect(screen.getByText('DEBIT ENTRY')).toBeInTheDocument()
    expect(screen.getByText(/SMS Preview \(DEBIT ENTRY\):/i)).toBeInTheDocument()

    // Click again to collapse
    fireEvent.click(macroButton)
    expect(screen.queryByDisplayValue('7990943652')).not.toBeInTheDocument()
  })

  it('toggles Khatabook calculator keypad and evaluates formula using = button', () => {
    render(
      <CashHandoverModal
        isOpen={true}
        onClose={vi.fn()}
        initialSource="nilesh"
        accountsSummary={{ nilesh: 6200, counter: 15000 }}
      />,
    )

    const calcButton = screen.getByRole('button', { name: /calculator/i })
    fireEvent.click(calcButton)

    // Keypad numbers should be visible
    expect(screen.getByRole('button', { name: '7' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '×' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '=' })).toBeInTheDocument()

    // Tap 5 0 0 × 3
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: '×' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))

    // Amount input now has formula
    const amountInput = screen.getByPlaceholderText(/0.00 or e.g. 1000\+500/i)
    expect(amountInput.value).toBe('500×3')

    // Tap =
    fireEvent.click(screen.getByRole('button', { name: '=' }))
    expect(amountInput.value).toBe('1500')
  })

  it('submits handover and triggers sendBackgroundSms to staff with DEBIT format', async () => {
    const handleClose = vi.fn()
    render(
      <CashHandoverModal
        isOpen={true}
        onClose={handleClose}
        initialSource="nilesh"
        accountsSummary={{ nilesh: 6200, counter: 15000 }}
      />,
    )

    // Set amount to 5000
    const amountInput = screen.getByPlaceholderText(/0.00 or e.g. 1000\+500/i)
    fireEvent.change(amountInput, { target: { value: '5000' } })

    // Click submit
    const submitButton = screen.getByRole('button', { name: /confirm handover/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      // Transfer recorded
      expect(mockRecordAccountTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'nilesh',
          toAccountId: 'counter',
          amount: 5000,
        }),
      )

      // SMS triggered via MacroDroid to staff mobile (7990943652), not owner
      expect(mockSendBackgroundSms).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '7990943652',
          message: expect.stringContaining('Annapurna Foods: Hi Nilesh, ₹5,000 DEBITED from your cash custody account.'),
        }),
      )

      expect(handleClose).toHaveBeenCalled()
    })
  })

  it('sends CREDIT entry SMS to staff when cash is transferred to staff custody', async () => {
    const handleClose = vi.fn()
    render(
      <CashHandoverModal
        isOpen={true}
        onClose={handleClose}
        initialSource="counter"
        accountsSummary={{ counter: 15000, nilesh: 1000 }}
      />,
    )

    // Set destination to nilesh
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'nilesh' } })

    // Set amount to 2000
    const amountInput = screen.getByPlaceholderText(/0.00 or e.g. 1000\+500/i)
    fireEvent.change(amountInput, { target: { value: '2000' } })

    // Submit
    const submitButton = screen.getByRole('button', { name: /confirm handover/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockRecordAccountTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'counter',
          toAccountId: 'nilesh',
          amount: 2000,
        }),
      )

      // SMS triggered to staff with CREDIT entry
      expect(mockSendBackgroundSms).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '7990943652',
          message: expect.stringContaining('Annapurna Foods: Hi Nilesh, ₹2,000 CREDITED to your cash custody account.'),
        }),
      )

      expect(handleClose).toHaveBeenCalled()
    })
  })
})
