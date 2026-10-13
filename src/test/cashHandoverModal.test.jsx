import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CashHandoverModal from '../components/CashHandoverModal'

const mockRecordAccountTransfer = vi.fn().mockResolvedValue({})
const mockSendBackgroundSms = vi.fn().mockResolvedValue({})

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
  { id: 'nilesh', name: 'Nilesh', mobile: '9925997750' },
  { id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '9825012345' },
]

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      recordAccountTransfer: mockRecordAccountTransfer,
      staffList: mockStaffList,
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
    expect(screen.queryByDisplayValue('9925997750')).not.toBeInTheDocument()

    // Click to open MacroDroid menu
    fireEvent.click(macroButton)

    // SMS checkbox exists and is checked for Nilesh with phone 9925997750
    const smsCheckbox = screen.getByRole('checkbox', { name: /send sms confirmation/i })
    expect(smsCheckbox).toBeChecked()
    expect(screen.getByDisplayValue('9925997750')).toBeInTheDocument()
    expect(screen.getByText(/SMS Preview \(Khatabook Style\):/i)).toBeInTheDocument()

    // Click again to collapse
    fireEvent.click(macroButton)
    expect(screen.queryByDisplayValue('9925997750')).not.toBeInTheDocument()
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

  it('submits handover and triggers sendBackgroundSms with Khatabook format', async () => {
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

      // SMS triggered via MacroDroid
      expect(mockSendBackgroundSms).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '9925997750',
          message: expect.stringContaining('Annapurna Foods: Received ₹5,000 cash from Nilesh'),
        }),
      )

      expect(handleClose).toHaveBeenCalled()
    })
  })
})
