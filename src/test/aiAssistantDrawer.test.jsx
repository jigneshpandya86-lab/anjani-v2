import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: { currentUser: { uid: 'test' } },
  storage: {},
}))

const mockUploadBytes = vi.fn(() => Promise.resolve({ ref: {} }))
const mockGetDownloadURL = vi.fn(() => Promise.resolve('https://storage.googleapis.com/test-bucket/screenshot.png'))

const mockGetDocs = vi.fn(() => Promise.resolve({
  empty: false,
  docs: [{ id: 'pay-123', data: () => ({ id: 'pay-123', amount: 1500, clientId: 'c3', method: 'online' }) }]
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  getDocs: (...args) => mockGetDocs(...args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  uploadBytes: (...args) => mockUploadBytes(...args),
  getDownloadURL: (...args) => mockGetDownloadURL(...args),
}))

let mockHttpsCallableResponse = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => (...args) => mockHttpsCallableResponse(...args)),
}))

vi.mock('../utils/aiImageHelper', () => ({
  processAiBillImage: vi.fn(async (file) => ({
    base64: 'mock-base64',
    dataUrl: 'data:image/jpeg;base64,mock',
    mimeType: 'image/jpeg',
    fileName: file.name,
    sizeKb: 120,
    isAudio: false,
  })),
}))

const mockAddClient = vi.fn()
const mockUpdateClient = vi.fn()
const mockAddPayment = vi.fn()
const mockDeletePayment = vi.fn()
const mockAddExpense = vi.fn()
const mockDeleteAccountExpense = vi.fn()
const mockUpdateAccountExpense = vi.fn()
const mockAddStockBatch = vi.fn()
const mockRecordAccountTransfer = vi.fn()
const mockDeleteAccountTransfer = vi.fn()
const mockUpdateLead = vi.fn()
let mockStaffTransactions = [
  { id: 'st1', employeeId: 'nilesh', amount: 1500, status: 'active' },
]
const mockAddOrder = vi.fn()
const mockUpdateOrder = vi.fn()
let mockOrders = [
  {
    id: 'o1',
    clientId: 'c1',
    status: 'Delivered',
    items: [{ sku: 'Bailey 500ml', rate: 85, qty: 10 }],
  },
]
const mockAddAiFeedback = vi.fn(() => Promise.resolve({ id: 'fb-new', status: 'pending_weekly_review' }))
const mockMarkAiFeedbackReviewed = vi.fn(() => Promise.resolve())
const mockDeleteAiFeedback = vi.fn(() => Promise.resolve())
const mockClearAllAiFeedbacks = vi.fn(() => Promise.resolve())

export const mockSendBackgroundSms = vi.fn(() => Promise.resolve({ success: true }))
vi.mock('../services/leadSmsService', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    sendBackgroundSms: (...args) => mockSendBackgroundSms(...args),
  }
})

let mockAiPrefillFile = null

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      aiPrefillFile: mockAiPrefillFile,
      clients: [
        { id: 'c1', name: 'Jay Ambe' },
        { id: 'c2', name: 'Rohitbhai' },
        { id: 'c3', name: 'Bhaveshbhai', mobile: '9876543210' },
      ],
      orders: mockOrders,
      stockSummary: {},
      stockTotal: 0,
      stockEntries: [],
      addStockBatch: mockAddStockBatch,
      createBatchSales: vi.fn(),
      createBatchAccountEntries: vi.fn(),
      updateOrder: mockUpdateOrder,
      updateClient: mockUpdateClient,
      addClient: mockAddClient,
      addPayment: mockAddPayment,
      deletePayment: mockDeletePayment,
      addOrder: mockAddOrder,
      addExpense: mockAddExpense,
      deleteAccountExpense: mockDeleteAccountExpense,
      updateAccountExpense: mockUpdateAccountExpense,
      recordAccountTransfer: mockRecordAccountTransfer,
      deleteAccountTransfer: mockDeleteAccountTransfer,
      recordStaffAdvance: vi.fn(),
      staffTransactions: mockStaffTransactions,
      staffList: [
        { id: 'nilesh', name: 'Nilesh', mobile: '7990943652' },
        { id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '7778077617' },
      ],
      leads: [
        { id: 'lead-1', name: 'Krishna Hotel', area: 'Manjalpur', mobile: '9988776655', business_type: 'Hotel' },
      ],
      updateLead: mockUpdateLead,
      fetchLeads: vi.fn(),
      accountsSummary: { balances: {} },
      jobs: [
        {
          id: 'job-1',
          text: 'Collect empty jars from Krishna Hotel',
          assignedTo: 'nilesh',
          assignedStaffName: 'Nilesh',
          staffPhone: '7990943652',
          stage: 'new',
          followUpCount: 0,
        },
      ],
      fetchJobs: vi.fn(),
      addStaffJob: vi.fn(() => Promise.resolve({ id: 'job-new', smsSent: true })),
      updateStaffJobStage: vi.fn(),
      sendStaffJobFollowUp: vi.fn(() => Promise.resolve({ success: true, followUpCount: 1, message: 'Test SMS' })),
      aiSettings: {},
      aiPrefillPrompt: null,
      aiMemories: [
        { id: 'm1', rule: 'Royal Hotel rate is 115', category: 'client_rule', active: true }
      ],
      fetchAiMemories: vi.fn(),
      addAiMemory: vi.fn(() => Promise.resolve({ id: 'm2', rule: 'Test Rule', category: 'general_rule', active: true })),
      toggleAiMemory: vi.fn(),
      deleteAiMemory: vi.fn(),
      aiFeedbacks: [
        {
          id: 'fb-1',
          type: 'catering_sales',
          rating: 'positive',
          message: 'Parsed Maruti caterers perfectly with 3 separate dates and venues',
          status: 'pending_weekly_review',
          submittedAt: '2026-11-17T12:00:00Z',
        },
      ],
      fetchAiFeedbacks: vi.fn(),
      addAiFeedback: mockAddAiFeedback,
      markAiFeedbackReviewed: mockMarkAiFeedbackReviewed,
      deleteAiFeedback: mockDeleteAiFeedback,
      clearAllAiFeedbacks: mockClearAllAiFeedbacks,
    }
    return selector ? selector(state) : state
  },
}))

import AiAssistantDrawer from '../components/AiAssistantDrawer'

describe('AiAssistantDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAiPrefillFile = null
  })

  it('renders without crashing when open in all modes', () => {
    const modes = [undefined, 'auto', 'retail_sales', 'receive_payment', 'create_client', 'accounts_cash']
    for (const mode of modes) {
      const { unmount } = render(
        <AiAssistantDrawer
          isOpen={true}
          initialMode={mode}
          onClose={() => {}}
          onNavigateTab={() => {}}
          onOpenPaymentModal={() => {}}
          onOpenOrderModal={() => {}}
          onOpenAddClient={() => {}}
        />
      )
      expect(screen.getAllByRole('heading', { name: 'Anjani' })[0]).toBeInTheDocument()
      unmount()
    }
  })

  it('renders without crashing when closed and transitions to open', () => {
    const { rerender } = render(
      <AiAssistantDrawer
        isOpen={false}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )
    rerender(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )
    expect(screen.getAllByRole('heading', { name: 'Anjani' })[0]).toBeInTheDocument()
  })

  it('shows SKU autocomplete popup with pricing when user types /', () => {
    render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/' } })

    expect(screen.getByText(/Products & SKUs/i)).toBeInTheDocument()
    expect(screen.getByText('Bailey 500ml')).toBeInTheDocument()
    expect(screen.getByText('₹85')).toBeInTheDocument()
  })

  it('shows client autocomplete popup when user types @', () => {
    render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '@jay' } })

    expect(screen.getByText('Jay Ambe')).toBeInTheDocument()
  })

  it('renders speech language selector defaulting to EN and allows switching to Gujarati and Hindi', () => {
    localStorage.clear()
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    // Language toggle button displays EN by default
    const langBtn = screen.getByRole('button', { name: /switch speech language/i })
    expect(langBtn).toHaveTextContent('EN')

    // Open language menu
    fireEvent.click(langBtn)
    expect(screen.getByText('Voice Language')).toBeInTheDocument()
    expect(screen.getByText('ગુજરાતી')).toBeInTheDocument()
    expect(screen.getByText('हिंदी')).toBeInTheDocument()

    // Select Gujarati
    fireEvent.click(screen.getByText('ગુજરાતી'))
    expect(localStorage.getItem('anjani_ai_speech_lang')).toBe('gu-IN')
    expect(langBtn).toHaveTextContent('GU')

    // Switch to Hindi
    fireEvent.click(langBtn)
    fireEvent.click(screen.getByText('हिंदी'))
    expect(localStorage.getItem('anjani_ai_speech_lang')).toBe('hi-IN')
    expect(langBtn).toHaveTextContent('HI')

    unmount()
  })

  it('does not render Permanent AI Memory button or accordion in drawer', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    // Memory button and accordion are removed as requested
    expect(screen.queryByRole('button', { name: /view ai memories/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /toggle permanent ai memory/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Permanent AI Memory/i)).not.toBeInTheDocument()

    unmount()
  })

  it('renders minimalist AI welcome screen without hardwired chips in empty state', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Anjani' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Anjani AI' })).toBeInTheDocument()
    expect(screen.queryByText('Powered by Gemini 3.5 Flash')).not.toBeInTheDocument()
    expect(screen.queryByText('Orders & Deliveries:')).not.toBeInTheDocument()

    // Unintelligent hardwired chips must NOT be in the document
    expect(screen.queryByText('💸 Record Expense')).not.toBeInTheDocument()
    expect(screen.queryByText('📦 Book Order')).not.toBeInTheDocument()
    expect(screen.queryByText('💰 Receive Payment (Jama)')).not.toBeInTheDocument()
    expect(screen.queryByText('🤝 Cash Handover')).not.toBeInTheDocument()
    expect(screen.queryByText('🚚 Staff Advance')).not.toBeInTheDocument()
    expect(screen.queryByText('Scan photo as:')).not.toBeInTheDocument()

    unmount()
  })

  it('operates in 100% minimalist chat mode with top quick action strip removed', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // Quick action strip buttons must NOT be present in minimalist UI
    expect(screen.queryByRole('button', { name: (content) => content.includes('Staff Tasks') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: (content) => content.includes('Bot Menu') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: (content) => content.includes('Order Creation') })).not.toBeInTheDocument()
    expect(screen.queryByText('📋 Assign Staff Task')).not.toBeInTheDocument()
    expect(screen.queryByText('⏰ Staff Tasks & Follow-up')).not.toBeInTheDocument()

    unmount()
  })

  it('renders Staff Tasks card with 1-tap WhatsApp and SMS follow-up buttons via natural chat query', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'tasks_query',
        data: { staffName: 'all' },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText((content) => content.includes('Ask bot above'))
    fireEvent.change(input, { target: { value: 'show staff tasks' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    // Staff tasks list card appears with tasks
    expect(await screen.findByText((content) => content.includes('Staff Tasks (1)'))).toBeInTheDocument()
    expect(screen.getByText('Collect empty jars from Krishna Hotel')).toBeInTheDocument()

    // 1-tap WhatsApp and SMS follow-up buttons exist
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: (content) => content.includes('SMS Follow-up') })).toBeInTheDocument()

    unmount()
  })

  it('operates in pure auto mode for photo scan without hardwired scan mode chips', async () => {
    const { unmount, container } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()

    // Simulate attaching a photo using userEvent.upload
    const mockFile = new File(['photo-bytes'], 'payment_screenshot.jpg', { type: 'image/jpeg' })
    await userEvent.upload(fileInput, mockFile)

    // "Scan photo as:" bar must NOT appear in pure auto mode
    expect(screen.queryByText('Scan photo as:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: (content) => content.includes('Auto') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: (content) => content.includes('Payment') })).not.toBeInTheDocument()

    unmount()
  })

  it('renders neat and clean compound action card with default Anjani 200ml and default rate Rs 130', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'compound_action',
        data: {
          client: { name: 'Ramesh Patel', mobile: '9825012345' },
          payment: { amount: 1300, onlineProvider: 'GPay', utr: 'UPI98765' },
        },
      },
    })

    const mockOpenOrder = vi.fn()
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenOrderModal={mockOpenOrder}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'client plus order plus payment' } })

    const form = input.closest('form')
    await fireEvent.submit(form)

    // Verify neat and clean card rendered with default SKU and Rs 130 rate
    expect(await screen.findByText('Ramesh Patel')).toBeInTheDocument()
    expect(screen.getByText('(9825012345)')).toBeInTheDocument()
    expect(screen.getByText(/Anjani 200ml/i)).toBeInTheDocument()
    expect(screen.getByText(/@ ₹130/i)).toBeInTheDocument()
    expect(screen.getAllByText(/₹1,300/i).length).toBeGreaterThanOrEqual(1)

    // Clutter-free check: marketing banner "Smart 3-in-1 Action" should NOT be present
    expect(screen.queryByText(/Smart 3-in-1 Action/i)).not.toBeInTheDocument()

    // Neat action button exists
    const saveBtn = screen.getByRole('button', { name: /Confirm & Save/i })
    expect(saveBtn).toBeInTheDocument()

    // Click Confirm & Save -> updates to Saved Cleanly AND provides option to Open Record post-save
    await fireEvent.click(saveBtn)
    expect(await screen.findByText(/Saved Cleanly ✓/i)).toBeInTheDocument()

    // Post-save option to open saved record is present
    const openRecBtn = screen.getByRole('button', { name: /Open Record/i })
    expect(openRecBtn).toBeInTheDocument()
    fireEvent.click(openRecBtn)
    expect(mockOpenOrder).toHaveBeenCalled()

    unmount()
  })

  it('rejects Annapurna Foods as client name in GPay payment receipt and prioritizes sender or phone', async () => {
    // Simulate Gemini incorrectly returning merchant name "Annapurna Foods" because it read "Paid to Annapurna Foods"
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'compound_action',
        data: {
          client: { name: 'Annapurna Foods', mobile: '9988776655' },
          payment: { payerName: 'Annapurna Foods', amount: 2600, onlineProvider: 'GPay', utr: 'GPAY12345' },
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'client plus order plus payment' } })

    const form = input.closest('form')
    await fireEvent.submit(form)

    // Verify "Annapurna Foods" is NEVER used as the client name!
    expect(screen.queryByText(/^Annapurna Foods$/i)).not.toBeInTheDocument()

    // Since mobile 9988776655 does not match an existing client, it should fall back to Customer (6655)
    expect(await screen.findByText('Customer (6655)')).toBeInTheDocument()
    expect(screen.getByText('(9988776655)')).toBeInTheDocument()

    // Order calculated correctly: 2600 / 130 = 20 boxes @ 130
    expect(screen.getByText(/20 × Anjani 200ml/i)).toBeInTheDocument()
    expect(screen.getAllByText(/₹2,600/i).length).toBeGreaterThanOrEqual(1)

    unmount()
  })

  it('when payment receipt is shared and processed in pure auto mode, matches best existing client and never creates new client', async () => {
    // Simulate backend returning receive_payment from a payment receipt
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: 'Rohit K Patel',
          amount: 850,
          paymentMode: 'online',
          onlineProvider: 'UPI',
          utr: 'UPI5566',
        },
      },
    })

    const { container, unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // Simulate attaching receipt photo
    const file = new File(['mock content'], 'upi_receipt.jpg', { type: 'image/jpeg' })
    const fileInput = container.querySelector('input[type="file"]')
    expect(fileInput).toBeInTheDocument()
    await userEvent.upload(fileInput, file)

    // In pure auto mode, "Scan photo as:" bar is NOT present
    expect(screen.queryByText('Scan photo as:')).not.toBeInTheDocument()

    // Submit form to scan payment receipt
    const form = container.querySelector('form')
    await fireEvent.submit(form)

    // Must render Payment Receipt Card (type: receive_payment)
    expect(await screen.findByText('Payment Receipt')).toBeInTheDocument()
    expect(screen.getByText(/Payment Receipt Detected: ₹850/i)).toBeInTheDocument()

    // Must NOT render order row or new client banner
    expect(screen.queryByText(/20 × Anjani 200ml/i)).not.toBeInTheDocument()

    // The Customer select dropdown must have preselected the best matching existing client: Rohitbhai (c2)
    const clientSelect = screen.getAllByRole('combobox')[0]
    expect(clientSelect.value).toBe('c2')

    // Confirm & Record Payment
    const confirmButtons = screen.getAllByRole('button', { name: (content) => content.includes('Confirm & Record Payment') })
    expect(confirmButtons.length).toBeGreaterThanOrEqual(1)
    expect(confirmButtons[0]).toBeEnabled()

    await fireEvent.click(confirmButtons[0])

    // Verify addClient was NEVER called
    expect(mockAddClient).not.toHaveBeenCalled()
    expect(mockAddPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'c2',
        amount: 850,
      }),
    )

    unmount()
  })

  it('opens in pure auto mode without hardwired chips when aiPrefillFile is shared', async () => {
    const mockFile = {
      file: new File(['mock'], 'gpay_receipt.jpg', { type: 'image/jpeg' }),
      dataUrl: 'data:image/jpeg;base64,mock',
      fileName: 'gpay_receipt.jpg',
      sizeKb: 120,
    }

    mockAiPrefillFile = mockFile

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // In pure auto mode, no hardwired scan mode chips are displayed
    expect(screen.queryByText('Scan photo as:')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: (content) => content.includes('✨ Auto') })).not.toBeInTheDocument()

    mockAiPrefillFile = null
    unmount()
  })

  it('renders Feedback button, toggles single streamlined feedback modal, and empties chatbox on submission', async () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    // Check Header Feedback button
    const feedbackBtn = screen.getByRole('button', { name: /AI Feedback/i })
    expect(feedbackBtn).toBeInTheDocument()

    // Manual trigger button beside feedback button
    const runBtn = screen.getByRole('button', { name: /Trigger Feedback Review Manually/i })
    expect(runBtn).toBeInTheDocument()
    fireEvent.click(runBtn)

    // Weekly review tab should not exist
    expect(screen.queryByText('Weekly Review')).not.toBeInTheDocument()

    // Toggle open Feedback modal
    fireEvent.click(feedbackBtn)

    expect(screen.getByText('Submit AI Feedback')).toBeInTheDocument()
    expect(screen.queryByText('Weekly Review')).not.toBeInTheDocument()
    expect(screen.queryByText('Accurate')).not.toBeInTheDocument()
    expect(screen.queryByText('Needs Correction')).not.toBeInTheDocument()
    expect(screen.queryByText('Catering / Multi-Date')).not.toBeInTheDocument()
    expect(screen.queryByText('Payment OCR')).not.toBeInTheDocument()

    // Put text in chat input to verify it gets emptied on submit
    const chatInput = screen.getByPlaceholderText(/Ask bot above/i)
    fireEvent.change(chatInput, { target: { value: 'some draft query in chatbox' } })
    expect(chatInput.value).toBe('some draft query in chatbox')

    // Fill submit feedback form
    const textarea = screen.getByPlaceholderText(/Enter your feedback or improvement request/i)
    fireEvent.change(textarea, {
      target: { value: 'Nung is Piece of bottle, 48 Pieces are equal to one box' },
    })

    const submitBtn = screen.getByRole('button', { name: /Send Feedback/i })
    await fireEvent.click(submitBtn)

    expect(mockAddAiFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Nung is Piece of bottle, 48 Pieces are equal to one box',
      })
    )

    // Verify chatbox is emptied and ready
    await waitFor(() => {
      expect(chatInput.value).toBe('')
      expect(screen.queryByText('Submit AI Feedback')).not.toBeInTheDocument()
    })

    unmount()
  })

  it('allows attaching and uploading screenshot in feedback modal and persists attachmentUrl', async () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    // Open Feedback modal
    const feedbackBtn = screen.getByRole('button', { name: /AI Feedback/i })
    fireEvent.click(feedbackBtn)

    expect(screen.getByText('Submit AI Feedback')).toBeInTheDocument()
    expect(screen.getByText('Attach Screenshot')).toBeInTheDocument()

    // Attach screenshot file
    const file = new File(['fake-screenshot-content'], 'screenshot-ui-bug.png', { type: 'image/png' })
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]')
    expect(fileInput).not.toBeNull()

    fireEvent.change(fileInput, { target: { files: [file] } })

    // Verify screenshot preview appears
    await waitFor(() => {
      expect(screen.getByText('screenshot-ui-bug.png')).toBeInTheDocument()
      expect(screen.getByText('Screenshot attached')).toBeInTheDocument()
    })

    // Submit feedback with screenshot
    const submitBtn = screen.getByRole('button', { name: /Send Feedback/i })
    fireEvent.click(submitBtn)

    // Check feedback saved with screenshot data
    await waitFor(() => {
      expect(mockAddAiFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentUrl: 'data:image/jpeg;base64,mock',
          attachmentName: 'screenshot-ui-bug.png',
          screenshotDataUrl: 'data:image/jpeg;base64,mock',
          screenshotBase64: 'mock-base64',
        })
      )
    })

    unmount()
  })

  it('renders interactive customer message draft card when AI returns client_message intent', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'client_message',
        text: 'Drafted cancellation inquiry message for Bhaveshbhai',
        data: {
          clientName: 'Bhaveshbhai',
          channel: 'sms',
          message: 'Hi Bhaveshbhai, regarding your Anjani Water order: do you want to cancel the order? Please confirm.',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenPaymentModal={() => {}}
        onOpenOrderModal={() => {}}
        onOpenAddClient={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Can you send SMS directly to Bhaveshbhai? To cancel the order?' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getAllByText(/Bhaveshbhai/i).length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('+91 9876543210')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /SMS Customer/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /WhatsApp Customer/i })).toBeInTheDocument()
    })

    unmount()
  })

  it('renders message draft cards with phone numbers resolved dynamically for multiple lead recipients', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'client_message',
        text: 'Drafted review messages for first 2 leads',
        data: {
          clientName: 'Shared Lead',
          channel: 'auto',
          message: 'Hello! Thank you for choosing Anjani Water. Please drop us a Google Maps review!',
          recipients: [
            { name: 'Shared Lead', phone: '7984875717' },
            { name: 'IndiaMART Lead', phone: '9313107250' },
          ],
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Send message for google map review to first 2' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Shared Lead')).toBeInTheDocument()
      expect(screen.getByText('+91 7984875717')).toBeInTheDocument()
      expect(screen.getByText('IndiaMART Lead')).toBeInTheDocument()
      expect(screen.getByText('+91 9313107250')).toBeInTheDocument()
    })

    unmount()
  })

  it('sends raw query without prompt rewriting when typing client plus order plus payment in text mode', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'chat_reply',
        text: 'Please provide the customer name, order quantity, and delivery details to proceed.',
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'client plus order plus payment' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(mockHttpsCallableResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'client plus order plus payment',
        mode: 'auto',
      })
    )

    unmount()
  })

  it('prompts user for customer and quantity when typing Book Order without rendering dummy order card', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'chat_reply',
        text: 'Sure! Please specify the customer name and quantity (e.g. "Kamleshbhai 30 box tomorrow 11 AM").',
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Book Order' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(
        screen.getByText(/Please specify the customer name and quantity/i)
      ).toBeInTheDocument()
    })

    // Verify NO dummy order draft card was created
    expect(screen.queryByText(/Confirm & Book Order/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Total (0 units):')).not.toBeInTheDocument()

    unmount()
  })

  it('renders interactive order edit card when AI invokes edit_order intent', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        text: 'Found order for Bhaveshbhai',
        data: {
          clientName: 'Bhaveshbhai',
          order: {
            id: 'ord-123',
            clientName: 'Bhaveshbhai',
            qty: 30,
            date: 'Today',
            time: '11 AM',
            address: 'Vadodara',
            status: 'Pending',
          },
        },
      },
    })

    const handleOpenOrderModal = vi.fn()

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenOrderModal={handleOpenOrderModal}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Bhaveshbhai' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/What would you like to update/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /✏️ Full Edit/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /📅 Reschedule to Tomorrow/i })).toBeInTheDocument()
    })

    // Clicking Full Edit invokes onOpenOrderModal
    fireEvent.click(screen.getByRole('button', { name: /✏️ Full Edit/i }))
    expect(handleOpenOrderModal).toHaveBeenCalled()

    unmount()
  })

  it('marks orders delivered for today and strictly avoids tomorrow orders', async () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrowDate)

    // Setup mock orders: Maruti Caterers has an order today AND tomorrow
    mockOrders.length = 0
    mockOrders.push(
      // Note: Tomorrow's order is first in array (descending sort simulation)
      { id: 'ord-tomorrow', clientName: 'Maruti Caterers', status: 'Confirmed', date: tomorrowStr, deliveryDate: tomorrowStr },
      { id: 'ord-today', clientName: 'Maruti Caterers', status: 'Confirmed', date: todayStr, deliveryDate: todayStr },
      { id: 'ord-kamlesh-today', clientName: 'Kamleshbhai', status: 'Confirmed', date: todayStr, deliveryDate: todayStr }
    )

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'mark_orders_delivered',
        text: 'Marked orders as delivered',
        data: {
          clientNames: ['Kamleshbhai', 'Maruti Caterers'],
          targetDate: todayStr,
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: "Mark Kamleshbhai and Maruti Caterers today's orders as delivered" },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      // Must update today's orders
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-today', expect.objectContaining({ status: 'Delivered' }))
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-kamlesh-today', expect.objectContaining({ status: 'Delivered' }))
      // Must NEVER update tomorrow's order!
      expect(mockUpdateOrder).not.toHaveBeenCalledWith('ord-tomorrow', expect.anything())
    })

    unmount()
  })

  it('updates client agreed price when AI returns update_price', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'update_price',
        text: 'Updated price to 140',
        data: {
          clientName: 'Bhaveshbhai',
          rate: 140,
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Update price for Bhaveshbhai to 140' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith('c3', expect.objectContaining({ rate: 140 }))
      expect(screen.getByText(/Rate Updated for Bhaveshbhai/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates order rate when edit_order specifies fieldToUpdate price', async () => {
    mockOrders.length = 0
    mockOrders.push({
      id: 'ord-bhav-1',
      clientName: 'Bhaveshbhai',
      status: 'Confirmed',
      qty: 10,
      rate: 130,
      totalAmount: 1300,
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        text: 'Price updated',
        data: {
          clientName: 'Bhaveshbhai',
          fieldToUpdate: 'price',
          newValue: '140',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Change price of Bhaveshbhai order to 140' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-bhav-1', expect.objectContaining({
        rate: 140,
        totalAmount: 1400,
      }))
      expect(screen.getByText(/Updated price for \*\*Bhaveshbhai\*\*\'s order to \*\*₹140\/box\*\*/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates order location and address when edit_order specifies fieldToUpdate location', async () => {
    mockOrders.length = 0
    mockOrders.push({
      id: 'ord-maruti-loc',
      clientName: 'Maruti Caterers',
      status: 'Confirmed',
      qty: 84,
      rate: 130,
      location: 'To be confirmed',
      address: 'To be confirmed',
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        text: 'Location updated',
        data: {
          clientName: 'Maruti Caterers',
          fieldToUpdate: 'location',
          newValue: 'P G Party Plot Harni',
          changes: 'Update location as P G Party Plot Harni',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Update location as P G Party Plot Harni' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-maruti-loc', expect.objectContaining({
        location: 'P G Party Plot Harni',
        address: 'P G Party Plot Harni',
        deliveryAddress: 'P G Party Plot Harni',
      }))
      expect(screen.getByText(/Updated delivery location for \*\*Maruti Caterers\*\*\'s order to \*\*P G Party Plot Harni\*\*/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates multiple order fields simultaneously via universal updates dictionary', async () => {
    mockOrders.length = 0
    mockOrders.push({
      id: 'ord-multi-test',
      clientName: 'Maruti Caterers',
      status: 'Confirmed',
      qty: 84,
      rate: 130,
      deliveryTime: '11 AM',
      location: 'Old Venue',
      sku: 'Anjani 200ml',
      notes: '',
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        text: 'Order updated',
        data: {
          clientName: 'Maruti Caterers',
          updates: {
            qty: 50,
            deliveryTime: '16:00',
            location: 'PG Party Plot',
            sku: 'Bailey 500ml',
            notes: 'Deliver backside',
            paymentMode: 'cash',
          },
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Change Maruti Caterers order to 50 boxes at 4 PM at PG Party Plot' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-multi-test', expect.objectContaining({
        qty: 50,
        totalQty: 50,
        totalAmount: 50 * 130,
        time: '16:00',
        deliveryTime: '16:00',
        location: 'PG Party Plot',
        sku: 'Bailey 500ml',
        notes: 'Deliver backside',
        paymentMode: 'cash',
      }))
      expect(screen.getByText(/Updated Order for Maruti Caterers/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates multiple client fields simultaneously via universal client updates dictionary', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_client',
        text: 'Client profile updated',
        data: {
          clientName: 'Bhaveshbhai',
          updates: {
            mobile: '9825099999',
            rate: 125,
            address: 'Karelibaug Vadodara',
          },
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Update Bhaveshbhai phone to 9825099999 and rate to 125' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith('c3', expect.objectContaining({
        mobile: '9825099999',
        rate: 125,
        address: 'Karelibaug Vadodara',
      }))
      expect(screen.getByText(/Updated Client Profile for Bhaveshbhai/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('marks client as inactive when edit_client specifies inactive', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_client',
        text: 'Client marked inactive',
        data: {
          clientName: 'Bhaveshbhai',
          fieldToUpdate: 'inactive',
          active: false,
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Mark Bhaveshbhai as inactive' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateClient).toHaveBeenCalledWith('c3', expect.objectContaining({ active: false }))
      expect(screen.getByText(/marked as \*\*Inactive\*\*/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('confirms order when edit_order specifies confirm', async () => {
    mockOrders.length = 0
    mockOrders.push({
      id: 'ord-confirm-1',
      clientName: 'Bhaveshbhai',
      status: 'Pending',
      qty: 15,
      rate: 130,
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        text: 'Order confirmed',
        data: {
          clientName: 'Bhaveshbhai',
          fieldToUpdate: 'confirm',
          newValue: 'Confirmed',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Confirm Bhaveshbhai order' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateOrder).toHaveBeenCalledWith('ord-confirm-1', expect.objectContaining({ status: 'Confirmed' }))
      expect(screen.getByText(/Order for \*\*Bhaveshbhai\*\* has been \*\*Confirmed\*\*/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('cancels payment when AI returns cancel_payment', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'cancel_payment',
        text: 'Payment cancelled',
        data: {
          clientName: 'Bhaveshbhai',
          amount: 1500,
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: 'Cancel payment of 1500 for Bhaveshbhai' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockDeletePayment).toHaveBeenCalledWith('pay-123')
      expect(screen.getByText(/Payment Cancelled/i)).toBeInTheDocument()
      expect(screen.getByText(/Ledger & outstanding balance have been reversed/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('strictly isolates orders when querying tomorrow orders and never leaks open orders', async () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
    const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrowDate)

    // Setup orders: only today has orders, tomorrow has zero orders
    mockOrders.length = 0
    mockOrders.push(
      { id: 'ord-today-1', clientName: 'Maruti Caterers', status: 'Pending', date: todayStr, deliveryDate: todayStr },
      { id: 'ord-today-2', clientName: 'Kamleshbhai', status: 'Confirmed', date: todayStr, deliveryDate: todayStr }
    )

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'orders_query',
        text: 'Showing orders for tomorrow',
        data: {
          dateFilter: 'tomorrow',
          targetDate: tomorrowStr,
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: "tomorrow's order" },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      // Must show zero orders empty state for tomorrow
      expect(screen.getByText(/No delivery orders scheduled for tomorrow/i)).toBeInTheDocument()
      // Must NEVER display today's pending orders
      expect(screen.queryByText(/Maruti Caterers/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Kamleshbhai/i)).not.toBeInTheDocument()
    })

    unmount()
  })

  it('records bad output to Firebase with complete details when tiny thumbs down button is clicked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'chat_reply',
        text: 'Found 12 orders across all dates',
        data: {},
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, {
      target: { value: "tomorrow's order" },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    // Wait for the assistant message to appear
    await waitFor(() => {
      expect(screen.getByText(/Found 12 orders across all dates/i)).toBeInTheDocument()
    })

    // Find the tiny Thumbs Down button on the message bubble
    const thumbsDownBtn = screen.getByRole('button', { name: /^Report Bad Output$/i })
    expect(thumbsDownBtn).toBeInTheDocument()

    // Click the tiny thumbs down button
    fireEvent.click(thumbsDownBtn)

    // Verify addAiFeedback was called with all required bad output details
    await waitFor(() => {
      expect(mockAddAiFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 'negative',
          category: 'bad_output',
          tag: 'bad_output',
          userQuery: "tomorrow's order",
          badOutput: expect.objectContaining({
            text: 'Found 12 orders across all dates',
            type: 'chat_reply',
          }),
          runtimeContext: expect.objectContaining({
            activeTab: 'ai',
          }),
          status: 'pending_review',
        })
      )
    })

    // Verify visual update to Reported state
    expect(screen.getByText(/Reported 👎/i)).toBeInTheDocument()

    unmount()
  })

  it('allows user to clear all existing AI feedbacks from the App UI', async () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // Open feedback modal
    const feedbackBtn = screen.getByRole('button', { name: /AI Feedback/i })
    fireEvent.click(feedbackBtn)

    // Clear Queue button should be present in the modal
    const clearBtn = screen.getByRole('button', { name: /Clear all feedback records from Firebase/i })
    expect(clearBtn).toBeInTheDocument()

    // Click Clear Queue
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(mockClearAllAiFeedbacks).toHaveBeenCalled()
      expect(screen.getByText(/All AI Feedbacks Cleared/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates unconfirmed payment draft amount when edit_payment is invoked with Edit to 2', async () => {
    // 1. Initial receive_payment returns draft for Jay Ambe with ₹1
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: 'Jay Ambe',
          amount: 1,
          paymentMode: 'online',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: '1 Rs' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Receipt Detected: ₹1/i)).toBeInTheDocument()

    // 2. User says "Edit to 2", backend returns edit_payment
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_payment',
        data: {
          amount: 2,
          changes: 'Edit to 2',
        },
      },
    })

    fireEvent.change(input, { target: { value: 'Edit to 2' } })
    await fireEvent.submit(form)

    // Draft card should now show ₹2
    expect(await screen.findByText(/Payment Receipt Detected: ₹2/i)).toBeInTheDocument()

    unmount()
  })

  it('confirms pending payment when user types confirm payment', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: 'Jay Ambe',
          amount: 1500,
          paymentMode: 'online',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Jay Ambe 1500 online' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Receipt Detected: ₹1,500/i)).toBeInTheDocument()

    // Now user types "confirm payment"
    fireEvent.change(input, { target: { value: 'confirm payment' } })
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAddPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'c1',
          clientName: 'Jay Ambe',
          amount: 1500,
          method: 'online',
        })
      )
      expect(screen.getByText(/Payment Confirmed & Recorded/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('confirms pending payment when user clicks Confirm & Record Payment chip', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: 'Jay Ambe',
          amount: 3000,
          paymentMode: 'cash',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Jay Ambe paid 3000 cash' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Receipt Detected: ₹3,000/i)).toBeInTheDocument()

    // Find and click the "Confirm & Record Payment" button
    const confirmButtons = await screen.findAllByRole('button', { name: /Confirm & Record Payment/i })
    expect(confirmButtons.length).toBeGreaterThanOrEqual(1)
    await fireEvent.click(confirmButtons[0])

    await waitFor(() => {
      expect(mockAddPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'c1',
          clientName: 'Jay Ambe',
          amount: 3000,
          method: 'cash',
          accountId: 'counter',
        })
      )
      expect(screen.getByText(/Payment Recorded & Confirmed/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('does not assign a random customer when payerName is empty for payment receipt', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: '',
          amount: 1,
          paymentMode: 'cash',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Payment received 1 Rs' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Receipt Detected: ₹1/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /-- Select Client --/i })).toBeInTheDocument()

    unmount()
  })

  it('cancels unconfirmed payment draft when cancel_payment is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'receive_payment',
        data: {
          payerName: 'Jay Ambe',
          amount: 500,
          paymentMode: 'online',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Jay Ambe 500' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Receipt Detected: ₹500/i)).toBeInTheDocument()

    // User cancels the draft
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'cancel_payment',
        data: {
          clientName: 'Jay Ambe',
          amount: 500,
        },
      },
    })

    fireEvent.change(input, { target: { value: 'cancel payment' } })
    await fireEvent.submit(form)

    expect(await screen.findByText(/Payment Draft Cancelled/i)).toBeInTheDocument()
    expect(screen.getByText(/No payment was recorded to ledger/i)).toBeInTheDocument()

    unmount()
  })

  it('records operational expense when record_expense is invoked for Loader', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'record_expense',
        data: {
          amount: 500,
          category: 'Loading / Labor',
          note: 'Loader',
          accountId: 'counter',
          date: '2026-11-20',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Record Expense of 500 Rs for Loader' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          category: 'Loading / Labor',
          note: 'Loader',
          accountId: 'counter',
        })
      )
      expect(screen.getByText(/Expense Recorded: ₹500/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates expense amount when edit_expense is invoked', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{
        id: 'exp-101',
        data: () => ({
          id: 'exp-101',
          amount: 500,
          category: 'Fuel / Transport',
          accountId: 'counter',
          note: 'Petrol',
        }),
      }],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_expense',
        data: {
          expenseId: 'exp-101',
          amount: 600,
          newAmount: 600,
          oldAmount: 500,
          category: 'Fuel / Transport',
          changes: 'Edit to 600',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Edit expense to 600' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockUpdateAccountExpense).toHaveBeenCalledWith(
        'exp-101',
        expect.objectContaining({
          amount: 600,
          category: 'Fuel / Transport',
        })
      )
      expect(screen.getByText(/Expense Updated/i)).toBeInTheDocument()
      expect(screen.getByText(/₹600/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('deletes expense and refunds balance when cancel_expense is invoked', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{
        id: 'exp-202',
        data: () => ({
          id: 'exp-202',
          amount: 300,
          category: 'Maintenance',
          accountId: 'counter',
          note: 'Puncture',
        }),
      }],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'cancel_expense',
        data: {
          expenseId: 'exp-202',
          amount: 300,
          category: 'Maintenance',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Cancel puncture expense 300' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockDeleteAccountExpense).toHaveBeenCalledWith('exp-202')
      expect(screen.getByText(/Expense Deleted/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('queries expenses and renders summary breakdown when query_expenses is invoked', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'exp-1',
          data: () => ({
            id: 'exp-1',
            amount: 800,
            category: 'Fuel / Transport',
            accountId: 'counter',
            date: new Date().toISOString().slice(0, 10),
          }),
        },
        {
          id: 'exp-2',
          data: () => ({
            id: 'exp-2',
            amount: 200,
            category: 'Food & Refreshments',
            accountId: 'counter',
            date: new Date().toISOString().slice(0, 10),
          }),
        },
      ],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'query_expenses',
        data: {
          dateFilter: 'today',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: "Show today's expenses" } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Expense Summary/i)).toBeInTheDocument()
      expect(screen.getByText(/₹1,000/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('records cash handover when record_transfer is invoked', async () => {
    mockRecordAccountTransfer.mockResolvedValueOnce({ id: 'transfer-123' })
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'record_transfer',
        data: {
          fromAccountId: 'nilesh',
          toAccountId: 'counter',
          amount: 5000,
          notes: 'Nilesh route cash handover',
          date: '2026-11-20',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Handover 5000 from Nilesh to Counter' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockRecordAccountTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'nilesh',
          toAccountId: 'counter',
          amount: 5000,
          notes: 'Nilesh route cash handover',
        })
      )
      expect(screen.getByText(/Cash Handover Recorded/i)).toBeInTheDocument()
      expect(screen.getByText(/₹5,000/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('records inward stock when add_stock is invoked', async () => {
    mockAddStockBatch.mockResolvedValueOnce({ id: 'stock-456' })
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'add_stock',
        data: {
          sku: 'Anjani 200ml',
          qty: 200,
          narration: 'Plant delivery',
          date: '2026-11-20',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Add stock 200 boxes Anjani 200ml from factory' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAddStockBatch).toHaveBeenCalledWith(
        [{ sku: 'Anjani 200ml', qty: 200, rate: 0 }],
        'Plant delivery'
      )
      expect(screen.getByText(/Stock Inward Recorded/i)).toBeInTheDocument()
      expect(screen.getAllByText(/200 boxes/i).length).toBeGreaterThanOrEqual(1)
    })

    unmount()
  })

  it('queries leads and displays matching results when query_leads is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'query_leads',
        data: {
          area: 'Manjalpur',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Show leads in Manjalpur' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Prospective B2B Leads/i)).toBeInTheDocument()
      expect(screen.getByText(/Krishna Hotel/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('records stock damage and leakage when record_stock_damage is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'record_stock_damage',
        data: {
          sku: 'Anjani 200ml',
          qty: 5,
          reason: 'Transit breakage',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: '5 box 200ml damage thaya chhe' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAddStockBatch).toHaveBeenCalledWith(
        [{ sku: 'Anjani 200ml', qty: -5, rate: 0 }],
        'Damage / Leakage: Transit breakage'
      )
      expect(screen.getByText(/Stock Damage \/ Leakage Recorded/i)).toBeInTheDocument()
      expect(screen.getByText(/-5 boxes/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('cancels and reverses a cash handover when cancel_transfer is invoked', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'trans-999',
          data: () => ({
            amount: 5000,
            fromAccountId: 'nilesh',
            toAccountId: 'counter',
            date: new Date(),
          }),
        },
      ],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'cancel_transfer',
        data: {
          amount: 5000,
          fromAccountId: 'nilesh',
          reason: 'Mistake in entry',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Cancel handover of 5000 from Nilesh' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockDeleteAccountTransfer).toHaveBeenCalledWith('trans-999')
      expect(screen.getByText(/Cash Handover Cancelled & Reversed/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('converts a prospective lead to active client when convert_lead is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'convert_lead',
        data: {
          leadName: 'Krishna Hotel',
          rate: 125,
          mobile: '9988776655',
          address: 'Manjalpur Vadodara',
          notes: 'Converted from B2B radar',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Convert lead Krishna Hotel to client with rate 125' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(mockAddClient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Krishna Hotel',
          rate: 125,
          mobile: '9988776655',
        })
      )
      expect(mockUpdateLead).toHaveBeenCalledWith(
        'lead-1',
        expect.objectContaining({ status: 'converted' })
      )
      expect(screen.getByText(/Lead Converted to Customer Client!/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('queries celebrations for today when query_celebrations is invoked', async () => {
    const now = new Date()
    const todayMD = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'cel-1',
          data: () => ({
            name: 'Jay Ambe Provision',
            birthday: todayMD,
            phone: '9876543210',
          }),
        },
      ],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'query_celebrations',
        data: {
          period: 'today',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Whose birthday is it today?' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Celebrations Today/i)).toBeInTheDocument()
      expect(screen.getByText(/Jay Ambe Provision/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('prepares celebration wish link when send_celebration_wish is invoked', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'cel-1',
          data: () => ({
            name: 'Jay Ambe Provision',
            phone: '9876543210',
          }),
        },
      ],
    })

    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'send_celebration_wish',
        data: {
          contactName: 'Jay Ambe Provision',
          type: 'birthday',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Send birthday wish to Jay Ambe' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Celebration Wish Prepared for Jay Ambe Provision/i)).toBeInTheDocument()
      expect(screen.getByText(/Send WhatsApp to Jay Ambe Provision/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('prepares instant delivery invoice action card when generate_invoice is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'generate_invoice',
        data: {
          clientName: 'Jay Ambe',
          channel: 'whatsapp',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Send invoice to Jay Ambe' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Delivery Invoice Ready for Jay Ambe/i)).toBeInTheDocument()
      expect(screen.getByText(/Share Invoice WhatsApp/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('prepares customer ledger statement report card when generate_statement is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'generate_statement',
        data: {
          clientName: 'Jay Ambe',
          dateRange: 'current-month',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Show ledger statement for Jay Ambe' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Account Ledger Statement: Jay Ambe/i)).toBeInTheDocument()
      expect(screen.getByText(/Open Ledger Statement/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('queries driver cash custody and active advances when query_staff_balance is invoked', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'query_staff_balance',
        data: {
          staffName: 'Nilesh',
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText(/Ask bot above, type @client/i)
    fireEvent.change(input, { target: { value: 'Nilesh nu ketlu baaki chhe?' } })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Staff Driver Balances & Advances/i)).toBeInTheDocument()
      expect(screen.getByText(/Route Cash Custody/i)).toBeInTheDocument()
    })

    unmount()
  })

  it('updates in-flight draft rate when user types Rate 127 without requiring prior Firestore order', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'order_draft',
        text: 'Drafted order for Twinkle Caterers',
        data: {
          clientId: 'c-twinkle',
          clientName: 'Twinkle Caterers',
          qty: 30,
          rate: 130,
          date: '2026-11-21',
          location: 'reva party plot',
          address: 'reva party plot',
          items: [{ sku: 'Anjani 200ml', qty: 30, rate: 130 }],
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText((content) =>
      content.includes('Ask bot above, type @client')
    )
    fireEvent.change(input, {
      target: { value: 'Twinkle Caterers 30 box reva party plot today' },
    })
    const form = input.closest('form')
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes('Drafted order for Twinkle Caterers'))
      ).toBeInTheDocument()
    })

    // Now user types "Rate 127"
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'edit_order',
        data: {
          clientName: 'Twinkle Caterers',
          fieldToUpdate: 'rate',
          newValue: '127',
        },
      },
    })

    fireEvent.change(input, { target: { value: 'Rate 127' } })
    await fireEvent.submit(form)

    await waitFor(() => {
      expect(
        screen.getByText((content) => content.includes('Confirm Order Booking'))
      ).toBeInTheDocument()
      expect(
        screen.getByText((content) => content.includes('₹127 / unit'))
      ).toBeInTheDocument()
      expect(
        screen.getByText((content) => content.includes('₹3,810'))
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByText((content) => content.includes('No open active order found'))
    ).not.toBeInTheDocument()

    unmount()
  })

  it('handles incoming website order request with compound client and order creation', async () => {
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'compound_action',
        data: {
          client: {
            name: 'Drumil Bhai',
            mobile: '9712636271',
            address: 'Shri rameshwar mahadev temple vadodara',
          },
          order: {
            sku: 'Anjani 200ml',
            qty: 25,
            rate: 130,
            totalAmount: 3250,
            deliveryDate: '2026-11-21',
            deliveryTime: '4:00 PM – 5:00 PM',
            location: 'Shri rameshwar mahadev temple vadodara',
          },
          payment: null,
        },
      },
    })

    const mockOpenOrder = vi.fn()
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
        onOpenOrderModal={mockOpenOrder}
      />
    )

    const input = screen.getByPlaceholderText((content) => content.includes('Ask bot above'))
    fireEvent.change(input, {
      target: {
        value: 'Name: DRUMIL BHAI, Phone: 9712636271, Address: Shri rameshwar mahadev temple, Quantity: 25 Boxes, Time: 4:00 PM – 5:00 PM, Date: 2026-11-21',
      },
    })

    const form = input.closest('form')
    await fireEvent.submit(form)

    // Verify both client details and order details are displayed
    expect(await screen.findByText('Drumil Bhai')).toBeInTheDocument()
    expect(screen.getByText('(9712636271)')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('25 × Anjani 200ml'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('@ ₹130'))).toBeInTheDocument()
    expect(screen.getByText('📅 2026-11-21')).toBeInTheDocument()
    expect(screen.getByText('🕒 4:00 PM – 5:00 PM')).toBeInTheDocument()

    // Verify no payment row is displayed when payment is null
    expect(screen.queryByText('₹3,250')).not.toBeInTheDocument()

    // Confirm & Save button is present and clickable
    const saveBtn = screen.getByRole('button', { name: (content) => content.includes('Confirm & Save') })
    expect(saveBtn).toBeInTheDocument()

    await fireEvent.click(saveBtn)
    expect(await screen.findByText((content) => content.includes('Saved Cleanly ✓'))).toBeInTheDocument()

    unmount()
  })

  it('strictly decouples order booking from payment and never records payment when ordering for Shivshakti Caterers', async () => {
    mockAddPayment.mockClear()
    mockAddOrder.mockClear()
    mockAddClient.mockClear()

    // Even if backend accidentally returned a payment object with the order amount:
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'compound_action',
        data: {
          client: {
            name: 'Shivshakti Caterers',
            mobile: '9724112233',
            address: 'Waghodia Road Vadodara',
          },
          order: {
            sku: 'Anjani 200ml',
            qty: 20,
            rate: 130,
            totalAmount: 2600,
            deliveryDate: '2026-11-21',
            deliveryTime: '4:00 PM – 5:00 PM',
            location: 'Waghodia Road Vadodara',
          },
          payment: {
            amount: 2600,
            paymentMode: 'online',
            onlineProvider: 'GPay',
            payerName: 'Shivshakti Caterers',
          },
        },
      },
    })

    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    const input = screen.getByPlaceholderText((content) => content.includes('Ask bot above'))
    fireEvent.change(input, {
      target: {
        value: 'Shivshakti Caterers mobile 9724112233 address Waghodia Road 20 boxes at 130',
      },
    })

    const form = input.closest('form')
    await fireEvent.submit(form)

    // Verify client and order rendered
    expect(await screen.findByText('Shivshakti Caterers')).toBeInTheDocument()
    expect(screen.getByText('(9724112233)')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('20 × Anjani 200ml'))).toBeInTheDocument()

    // Deterministic guard dropped the payment: button displays "Confirm & Save Order"
    const saveBtn = screen.getByRole('button', { name: (content) => content.includes('Confirm & Save Order') })
    expect(saveBtn).toBeInTheDocument()

    await fireEvent.click(saveBtn)
    expect(await screen.findByText((content) => content.includes('Saved Cleanly ✓'))).toBeInTheDocument()

    // Assert that order and client were created, but payment was NEVER called!
    expect(mockAddOrder).toHaveBeenCalled()
    expect(mockAddPayment).not.toHaveBeenCalled()

    unmount()
  })
})
