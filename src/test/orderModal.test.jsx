import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import OrderModal from '../components/OrderModal'

const mockClients = [
  { id: 'c1', name: 'Drumil Bhai', mobile: '9712636271', address: 'Ajwa Road' },
]

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) =>
    selector({
      clients: mockClients,
      addOrder: vi.fn(),
      updateOrder: vi.fn(),
    }),
}))

vi.mock('../components/GoogleMapPicker', () => ({
  default: () => <div data-testid="mock-google-map-picker">Map Picker</div>,
}))

describe('OrderModal - Natural Time Population (Strictly NO REGEX)', () => {
  it('correctly passes and populates time slot "4:00 PM – 5:00 PM" as "16:00" in time input', () => {
    const orderToEdit = {
      clientId: 'c1',
      clientName: 'Drumil Bhai',
      deliveryTime: '4:00 PM – 5:00 PM',
      deliveryDate: '2026-11-21',
      qty: 25,
      sku: 'Anjani 200ml',
      rate: 130,
    }

    render(<OrderModal orderToEdit={orderToEdit} onClose={vi.fn()} />)

    const timeInput = screen.getByLabelText('Time')
    expect(timeInput.value).toBe('16:00')
  })

  it('correctly populates "11 AM" as "11:00" in time input', () => {
    const orderToEdit = {
      clientId: 'c1',
      time: '11 AM',
      qty: 10,
    }

    render(<OrderModal orderToEdit={orderToEdit} onClose={vi.fn()} />)

    const timeInput = screen.getByLabelText('Time')
    expect(timeInput.value).toBe('11:00')
  })

  it('correctly populates "4 PM" as "16:00" in time input', () => {
    const orderToEdit = {
      clientId: 'c1',
      time: '4 PM',
      qty: 10,
    }

    render(<OrderModal orderToEdit={orderToEdit} onClose={vi.fn()} />)

    const timeInput = screen.getByLabelText('Time')
    expect(timeInput.value).toBe('16:00')
  })

  it('correctly populates preferredTime property as "16:00"', () => {
    const orderToEdit = {
      clientId: 'c1',
      preferredTime: '4:00 PM – 5:00 PM',
      qty: 10,
    }

    render(<OrderModal orderToEdit={orderToEdit} onClose={vi.fn()} />)

    const timeInput = screen.getByLabelText('Time')
    expect(timeInput.value).toBe('16:00')
  })
})
