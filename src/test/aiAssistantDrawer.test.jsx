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
const mockAddPayment = vi.fn()
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
      addClient: mockAddClient,
      addPayment: mockAddPayment,
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
})
