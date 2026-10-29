import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../firebase-config', () => ({
  app: {},
  db: {},
  auth: { currentUser: { uid: 'test' } },
  storage: {},
}))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn()),
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

    // Should prompt for Step 1 Select Staff Member
    expect(screen.getByText(/Step 1\/4: Select Staff Member/i)).toBeInTheDocument()
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
})
