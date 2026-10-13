import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StaffSettingsSection from '../components/StaffSettingsSection'

const mockUpdateStaffProfile = vi.fn().mockResolvedValue({})
const mockAddStaffMember = vi.fn().mockResolvedValue({})
const mockDeleteStaffMember = vi.fn().mockResolvedValue({})
const mockFetchStaff = vi.fn(() => vi.fn())

const mockStaffList = [
  {
    id: 'nilesh',
    name: 'Nilesh',
    role: 'Delivery Staff & Driver',
    mobile: '9925997750',
    baseSalary: 15000,
    salaryType: 'monthly',
    active: true,
    color: '#2563eb',
  },
  {
    id: 'hiteshbhai',
    name: 'Hiteshbhai',
    role: 'Delivery Staff & Driver',
    mobile: '9825012345',
    baseSalary: 15000,
    salaryType: 'monthly',
    active: true,
    color: '#7c3aed',
  },
]

vi.mock('../firebase-config', () => ({
  db: {},
  auth: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db, _col, id) => ({ id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('../store/clientStore', () => ({
  useClientStore: (selector) => {
    const state = {
      staffList: mockStaffList,
      staffLoading: false,
      fetchStaff: mockFetchStaff,
      updateStaffProfile: mockUpdateStaffProfile,
      addStaffMember: mockAddStaffMember,
      deleteStaffMember: mockDeleteStaffMember,
    }
    return selector ? selector(state) : state
  },
}))

describe('StaffSettingsSection Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders staff list with member details, mobile numbers, and base salaries', () => {
    render(<StaffSettingsSection />)

    expect(screen.getByText('Staff & Employees')).toBeInTheDocument()
    expect(screen.getByText('2 Members')).toBeInTheDocument()
    expect(screen.getByText('Nilesh')).toBeInTheDocument()
    expect(screen.getByText('Hiteshbhai')).toBeInTheDocument()
    expect(screen.getByText('+91 9925997750')).toBeInTheDocument()
    expect(screen.getByText('+91 9825012345')).toBeInTheDocument()
  })

  it('opens add staff modal and submits new staff member', async () => {
    render(<StaffSettingsSection />)

    const addBtn = screen.getByRole('button', { name: /\+ Add Staff Member/i })
    fireEvent.click(addBtn)

    expect(screen.getByText('Add New Staff Member')).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText(/e\.g\. Nilesh, Hiteshbhai/i)
    const mobileInput = screen.getByPlaceholderText('9925997750')
    const baseSalaryInput = screen.getByPlaceholderText('15000')

    fireEvent.change(nameInput, { target: { value: 'Ramesh Patel' } })
    fireEvent.change(mobileInput, { target: { value: '9876543210' } })
    fireEvent.change(baseSalaryInput, { target: { value: '16500' } })

    const saveBtn = screen.getByRole('button', { name: /Save Staff/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(mockAddStaffMember).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Ramesh Patel',
          mobile: '9876543210',
          baseSalary: 16500,
        }),
      )
    })
  })

  it('opens edit staff modal, pre-fills data, and updates staff profile', async () => {
    render(<StaffSettingsSection />)

    const editBtns = screen.getAllByTitle('Edit Staff Member')
    fireEvent.click(editBtns[0]) // Nilesh

    expect(screen.getByText('Edit Staff Member')).toBeInTheDocument()

    const mobileInput = screen.getByDisplayValue('9925997750')
    fireEvent.change(mobileInput, { target: { value: '9925997799' } })

    const updateBtn = screen.getByRole('button', { name: /Update Staff/i })
    fireEvent.click(updateBtn)

    await waitFor(() => {
      expect(mockUpdateStaffProfile).toHaveBeenCalledWith(
        'nilesh',
        expect.objectContaining({
          name: 'Nilesh',
          mobile: '9925997799',
        }),
      )
    })
  })

  it('toggles active status when status button is clicked', async () => {
    render(<StaffSettingsSection />)

    const markInactiveBtns = screen.getAllByRole('button', { name: /Mark Inactive/i })
    fireEvent.click(markInactiveBtns[0])

    await waitFor(() => {
      expect(mockUpdateStaffProfile).toHaveBeenCalledWith(
        'nilesh',
        expect.objectContaining({ active: false }),
      )
    })
  })

  it('shows delete confirmation and removes staff on confirmation', async () => {
    render(<StaffSettingsSection />)

    const deleteBtns = screen.getAllByTitle('Remove Staff Member')
    fireEvent.click(deleteBtns[0]) // Nilesh

    expect(screen.getByText('Remove Nilesh?')).toBeInTheDocument()

    const confirmRemoveBtn = screen.getByRole('button', { name: /Yes, Remove/i })
    fireEvent.click(confirmRemoveBtn)

    await waitFor(() => {
      expect(mockDeleteStaffMember).toHaveBeenCalledWith('nilesh')
    })
  })
})
