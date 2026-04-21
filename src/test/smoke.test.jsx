import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('test harness', () => {
  it('renders a component and makes jest-dom matchers available', () => {
    render(<h1>Anjani</h1>)
    expect(screen.getByRole('heading', { name: /anjani/i })).toBeInTheDocument()
  })
})
