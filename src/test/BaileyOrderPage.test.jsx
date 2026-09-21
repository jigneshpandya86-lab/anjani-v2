import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BaileyOrderPage from '../components/BaileyOrderPage'

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

describe('BaileyOrderPage', () => {
  it('renders page header, hero banner and all 4 Bailey SKUs', () => {
    render(<BaileyOrderPage onBack={() => {}} />)

    expect(screen.getByText(/Bailey Replenishment Engine/i)).toBeInTheDocument()
    expect(screen.getByText('Bailey 250ml')).toBeInTheDocument()
    expect(screen.getByText('Bailey 500ml')).toBeInTheDocument()
    expect(screen.getByText('Bailey 1 Liter')).toBeInTheDocument()
    expect(screen.getByText('Bailey 2 Liter')).toBeInTheDocument()
  })

  it('allows changing buffer days and switches window chips', () => {
    render(<BaileyOrderPage onBack={() => {}} />)

    const sevenDaysBtn = screen.getByRole('button', { name: 'Consumption window 7 days' })
    fireEvent.click(sevenDaysBtn)
    expect(sevenDaysBtn).toHaveClass('bg-white')

    const tenDaysBuffer = screen.getByRole('button', { name: 'Safety buffer 10 days' })
    fireEvent.click(tenDaysBuffer)
    expect(tenDaysBuffer).toHaveClass('bg-[#ff9900]')
  })

  it('renders action buttons for WhatsApp, Inward, Print, and Copy', () => {
    render(<BaileyOrderPage onBack={() => {}} />)

    expect(screen.getAllByRole('button', { name: /Print/i })[0]).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Copy/i })[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Inward Stock/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send PO/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    const onBackMock = vi.fn()
    render(<BaileyOrderPage onBack={onBackMock} />)

    const backBtn = screen.getByRole('button', { name: /Back/i })
    fireEvent.click(backBtn)
    expect(onBackMock).toHaveBeenCalledTimes(1)
  })
})
