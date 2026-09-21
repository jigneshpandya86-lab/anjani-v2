import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SmartBaileyOrderModal from '../components/SmartBaileyOrderModal'

// Mock useClientStore
vi.mock('../store/clientStore', () => ({
  useClientStore: () => ({
    orders: [
      {
        id: 'ord-1',
        createdAt: Date.now() - 2 * 86400000,
        items: [
          { sku: 'Bailey 500ml', qty: 28 },
          { sku: 'Bailey 1 Liter', qty: 14 },
        ],
      },
    ],
    stockEntries: [],
    stockSummary: {
      'Bailey 250ml': 10,
      'Bailey 500ml': 5,
      'Bailey 1 Liter': 0,
      'Bailey 2 Liter': 20,
    },
    addStockBatch: vi.fn(),
  }),
}))

describe('SmartBaileyOrderModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(<SmartBaileyOrderModal isOpen={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders modal dialog and all 4 Bailey SKUs when isOpen is true', () => {
    render(<SmartBaileyOrderModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByText(/Bailey Water Replenishment Order/i)).toBeInTheDocument()
    expect(screen.getByText('Bailey 250ml')).toBeInTheDocument()
    expect(screen.getByText('Bailey 500ml')).toBeInTheDocument()
    expect(screen.getByText('Bailey 1 Liter')).toBeInTheDocument()
    expect(screen.getByText('Bailey 2 Liter')).toBeInTheDocument()
  })

  it('allows changing buffer days and switches window chips', () => {
    render(<SmartBaileyOrderModal isOpen={true} onClose={() => {}} />)

    const sevenDaysBtn = screen.getByRole('button', { name: 'Consumption window 7 days' })
    fireEvent.click(sevenDaysBtn)
    expect(sevenDaysBtn).toHaveClass('bg-[#064e3b]')

    const tenDaysBuffer = screen.getByRole('button', { name: 'Safety buffer 10 days' })
    fireEvent.click(tenDaysBuffer)
    expect(tenDaysBuffer).toHaveClass('bg-emerald-600')
  })

  it('renders action buttons for WhatsApp, Inward, Print, and Copy', () => {
    render(<SmartBaileyOrderModal isOpen={true} onClose={() => {}} />)

    expect(screen.getByRole('button', { name: /Print PO/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Record Inward/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send PO/i })).toBeInTheDocument()
  })
})
