import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SkuSelect from '../components/SkuSelect'
import { WATER_SKUS } from '../constants/skus'

describe('SkuSelect Component', () => {
  it('renders with default selected SKU and brand badge', () => {
    render(<SkuSelect value="Anjani 200ml" onChange={vi.fn()} />)
    expect(screen.getByText('Anjani 200ml')).toBeDefined()
    expect(screen.getByText('Anjani')).toBeDefined()
  })

  it('renders Rushi 500ml and Rushi 1 Liter when selected', () => {
    const { rerender } = render(<SkuSelect value="Rushi 500ml" onChange={vi.fn()} />)
    expect(screen.getByText('Rushi 500ml')).toBeDefined()
    expect(screen.getByText('Rushi')).toBeDefined()

    rerender(<SkuSelect value="Rushi 1 Liter" onChange={vi.fn()} />)
    expect(screen.getByText('Rushi 1 Liter')).toBeDefined()
  })

  it('opens search dropdown on click and displays all SKUs', () => {
    render(<SkuSelect value="Anjani 200ml" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText(/search sku or brand/i)
    expect(searchInput).toBeDefined()

    // All 9 SKUs should be accessible
    expect(screen.getAllByRole('option').length).toBe(WATER_SKUS.length)
  })

  it('filters SKUs when user searches by brand or size', () => {
    render(<SkuSelect value="Anjani 200ml" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText(/search sku or brand/i)
    fireEvent.change(searchInput, { target: { value: 'rushi' } })

    const options = screen.getAllByRole('option')
    expect(options.length).toBe(2)
    expect(screen.getByText('Rushi 500ml')).toBeDefined()
    expect(screen.getByText('Rushi 1 Liter')).toBeDefined()
  })

  it('calls onChange with selected SKU label when an option is clicked', () => {
    const handleChange = vi.fn()
    render(<SkuSelect value="Anjani 200ml" onChange={handleChange} />)

    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText(/search sku or brand/i)
    fireEvent.change(searchInput, { target: { value: 'rushi 500' } })

    const rushiOption = screen.getByRole('option')
    fireEvent.click(rushiOption)

    expect(handleChange).toHaveBeenCalledWith('Rushi 500ml')
  })

  it('shows empty state when no SKU matches search query', () => {
    render(<SkuSelect value="Anjani 200ml" onChange={vi.fn()} />)
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText(/search sku or brand/i)
    fireEvent.change(searchInput, { target: { value: 'nonexistentproduct' } })

    expect(screen.getByText(/no skus match/i)).toBeDefined()
  })
})
