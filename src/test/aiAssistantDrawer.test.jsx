import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: { currentUser: { uid: 'test' } },
  storage: {},
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

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      clients: [
        { id: 'c1', name: 'Jay Ambe' },
        { id: 'c2', name: 'Rohitbhai' },
      ],
      orders: [
        {
          id: 'o1',
          clientId: 'c1',
          status: 'Delivered',
          items: [{ sku: 'Bailey 500ml', rate: 85, qty: 10 }],
        },
      ],
      stockSummary: {},
      stockTotal: 0,
      stockEntries: [],
      addStockBatch: vi.fn(),
      createBatchSales: vi.fn(),
      createBatchAccountEntries: vi.fn(),
      updateOrder: vi.fn(),
      addClient: vi.fn(),
      addPayment: vi.fn(),
      addOrder: vi.fn(),
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
    }
    return selector ? selector(state) : state
  },
}))

import AiAssistantDrawer from '../components/AiAssistantDrawer'

describe('AiAssistantDrawer', () => {
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
      expect(screen.getByText('Anjani AI Assistant')).toBeInTheDocument()
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
    expect(screen.getByText('Anjani AI Assistant')).toBeInTheDocument()
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

  it('renders Memory Bank button and toggles memory inspector panel with saved rules', () => {
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

    // Memory button exists in header
    const memBtn = screen.getByRole('button', { name: /view ai memories/i })
    expect(memBtn).toBeInTheDocument()

    // Open Memory Inspector
    fireEvent.click(memBtn)
    expect(screen.getByText(/Permanent AI Memory/i)).toBeInTheDocument()
    expect(screen.getByText('Royal Hotel rate is 115')).toBeInTheDocument()

    // Close Memory Inspector
    fireEvent.click(memBtn)
    expect(screen.queryByText('Auto-enforced to prevent mistakes')).not.toBeInTheDocument()

    unmount()
  })

  it('enforces click-to-open style accordion for Permanent AI Memory (collapsed by default)', () => {
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

    // Accordion toggle exists and is collapsed by default ("Tap to open")
    const toggleBtn = screen.getByRole('button', { name: /toggle permanent ai memory/i })
    expect(toggleBtn).toBeInTheDocument()
    expect(toggleBtn).toHaveTextContent(/tap to open/i)
    expect(screen.queryByText('Auto-enforced to prevent mistakes')).not.toBeInTheDocument()
    expect(screen.queryByText('Royal Hotel rate is 115')).not.toBeInTheDocument()

    // Click to open
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveTextContent(/open/i)
    expect(screen.getByText('Auto-enforced to prevent mistakes')).toBeInTheDocument()
    expect(screen.getByText('Royal Hotel rate is 115')).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(toggleBtn)
    expect(toggleBtn).toHaveTextContent(/tap to open/i)
    expect(screen.queryByText('Auto-enforced to prevent mistakes')).not.toBeInTheDocument()

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

    expect(screen.getByText('Anjani WhatsApp-Style Assistant')).toBeInTheDocument()
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
})
