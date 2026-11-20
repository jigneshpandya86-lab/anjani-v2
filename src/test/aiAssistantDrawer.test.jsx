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

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      clients: [
        { id: 'c1', name: 'Jay Ambe' },
        { id: 'c2', name: 'Rohitbhai' },
        { id: 'c3', name: 'Bhaveshbhai', mobile: '9876543210' },
      ],
      orders: mockOrders,
      stockSummary: {},
      stockTotal: 0,
      stockEntries: [],
      addStockBatch: vi.fn(),
      createBatchSales: vi.fn(),
      createBatchAccountEntries: vi.fn(),
      updateOrder: mockUpdateOrder,
      updateClient: mockUpdateClient,
      addClient: mockAddClient,
      addPayment: mockAddPayment,
      deletePayment: mockDeletePayment,
      addOrder: mockAddOrder,
      addExpense: vi.fn(),
      recordAccountTransfer: vi.fn(),
      recordStaffAdvance: vi.fn(),
      staffList: [
        { id: 'nilesh', name: 'Nilesh', mobile: '7990943652' },
        { id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '7778077617' },
      ],
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

  it('renders WhatsApp-style bot action menu chips and initiates guided flow on click', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Anjani' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Anjani' })).not.toBeInTheDocument()
    expect(screen.queryByText('Anjani WhatsApp-Style Assistant')).not.toBeInTheDocument()
    expect(screen.queryByText(/guided workflows/i)).not.toBeInTheDocument()
    expect(screen.getByText('💸 Record Expense')).toBeInTheDocument()
    expect(screen.getByText('📦 Book Order')).toBeInTheDocument()
    expect(screen.getByText('💰 Receive Payment (Jama)')).toBeInTheDocument()
    expect(screen.getByText('🤝 Cash Handover')).toBeInTheDocument()
    expect(screen.getByText('🚚 Staff Advance')).toBeInTheDocument()

    // Click Record Expense chip
    fireEvent.click(screen.getByText('💸 Record Expense'))

    // Should prompt for Step 1 Expense Amount
    expect(screen.getByText(/Step 1\/4: Expense Amount/i)).toBeInTheDocument()
    expect(screen.getByText('₹500')).toBeInTheDocument()

    unmount()
  })

  it('renders clutter-free quick action pill strip with Staff Tasks and interactive task flow', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // Clutter-free quick action pills must be present
    expect(screen.getByRole('button', { name: /^Staff Tasks/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bot Menu/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Order Creation/i })).toBeInTheDocument()

    // Main menu must offer Staff Tasks flow
    expect(screen.getByText('📋 Assign Staff Task')).toBeInTheDocument()
    expect(screen.getByText('⏰ Staff Tasks & Follow-up')).toBeInTheDocument()

    // Click Assign Staff Task chip to initiate flow
    fireEvent.click(screen.getByText('📋 Assign Staff Task'))

    // Should prompt for Step 1 Select Staff Member (streamlined 3-step flow)
    expect(screen.getByText(/Step 1\/3: Select Staff Member/i)).toBeInTheDocument()
    expect(screen.getByText(/Nilesh/i)).toBeInTheDocument()

    unmount()
  })

  it('renders Staff Tasks card with 1-tap WhatsApp and SMS follow-up buttons', () => {
    const { unmount } = render(
      <AiAssistantDrawer
        isOpen={true}
        onClose={() => {}}
        onNavigateTab={() => {}}
      />
    )

    // Click Staff Tasks chip
    fireEvent.click(screen.getByText('⏰ Staff Tasks & Follow-up'))

    // Staff tasks list card appears with tasks
    expect(screen.getByText(/Staff Tasks \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText('Collect empty jars from Krishna Hotel')).toBeInTheDocument()

    // 1-tap WhatsApp and SMS follow-up buttons exist
    expect(screen.getByRole('button', { name: /^WhatsApp$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /SMS Follow-up/i })).toBeInTheDocument()

    unmount()
  })

  it('supports multi-selection for photo scan options (Client, Order, Payment simultaneously)', async () => {
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

    // "Scan photo as:" bar appears asynchronously after processing
    expect(await screen.findByText('Scan photo as:')).toBeInTheDocument()

    const clientBtn = screen.getByRole('button', { name: /👤 Client/i })
    const orderBtn = screen.getByRole('button', { name: /🛒 Order/i })
    const paymentBtn = screen.getByRole('button', { name: /💰 Payment/i })

    expect(clientBtn).toHaveAttribute('aria-pressed', 'false')
    expect(orderBtn).toHaveAttribute('aria-pressed', 'false')
    expect(paymentBtn).toHaveAttribute('aria-pressed', 'false')

    // 1. Toggle Client -> Client becomes active
    fireEvent.click(clientBtn)
    expect(clientBtn).toHaveAttribute('aria-pressed', 'true')
    expect(orderBtn).toHaveAttribute('aria-pressed', 'false')
    expect(paymentBtn).toHaveAttribute('aria-pressed', 'false')

    // 2. Toggle Order -> BOTH Client and Order are now active simultaneously!
    fireEvent.click(orderBtn)
    expect(clientBtn).toHaveAttribute('aria-pressed', 'true')
    expect(orderBtn).toHaveAttribute('aria-pressed', 'true')
    expect(paymentBtn).toHaveAttribute('aria-pressed', 'false')

    // 3. Toggle Payment -> ALL THREE are active simultaneously!
    fireEvent.click(paymentBtn)
    expect(clientBtn).toHaveAttribute('aria-pressed', 'true')
    expect(orderBtn).toHaveAttribute('aria-pressed', 'true')
    expect(paymentBtn).toHaveAttribute('aria-pressed', 'true')

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

  it('when payment receipt is shared and only payment is selected from three tabs, matches best existing client and never creates new client', async () => {
    // Simulate backend returning compound_action or receive_payment from a payment receipt
    mockHttpsCallableResponse.mockResolvedValueOnce({
      data: {
        type: 'compound_action',
        data: {
          client: { name: 'Rohit K Patel' },
          payment: { payerName: 'Rohit K Patel', amount: 850, onlineProvider: 'UPI', utr: 'UPI5566' },
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

    // Wait for "Scan photo as:" bar to appear
    expect(await screen.findByText('Scan photo as:')).toBeInTheDocument()

    // Three scan tabs should be visible: [👤 Client], [🛒 Order], [💰 Payment]
    const clientTab = screen.getByRole('button', { name: /👤 Client/i })
    const orderTab = screen.getByRole('button', { name: /🛒 Order/i })
    const paymentTab = screen.getByRole('button', { name: /💰 Payment/i })

    expect(clientTab).toBeInTheDocument()
    expect(orderTab).toBeInTheDocument()
    expect(paymentTab).toBeInTheDocument()

    // Unselect Client and Order, ensure only Payment is selected
    if (clientTab.getAttribute('aria-pressed') === 'true') {
      fireEvent.click(clientTab)
    }
    if (orderTab.getAttribute('aria-pressed') === 'true') {
      fireEvent.click(orderTab)
    }
    if (paymentTab.getAttribute('aria-pressed') !== 'true') {
      fireEvent.click(paymentTab)
    }

    expect(clientTab.getAttribute('aria-pressed')).toBe('false')
    expect(orderTab.getAttribute('aria-pressed')).toBe('false')
    expect(paymentTab.getAttribute('aria-pressed')).toBe('true')

    // Submit form to scan payment receipt
    const sendBtn = screen.getByRole('button', { name: /Send/i })
    await fireEvent.click(sendBtn)

    // Must render Payment Receipt Card (type: receive_payment)
    expect(await screen.findByText('Payment Receipt')).toBeInTheDocument()
    expect(screen.getByText(/Payment Receipt Detected: ₹850/i)).toBeInTheDocument()

    // Must NOT render order row or new client banner
    expect(screen.queryByText(/20 × Anjani 200ml/i)).not.toBeInTheDocument()

    // The Customer select dropdown must have preselected the best matching existing client: Rohitbhai (c2)
    const clientSelect = screen.getAllByRole('combobox')[0]
    expect(clientSelect.value).toBe('c2')

    // Confirm & Record Payment
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Record Payment/i })
    expect(confirmBtn).toBeEnabled()

    await fireEvent.click(confirmBtn)

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
})
