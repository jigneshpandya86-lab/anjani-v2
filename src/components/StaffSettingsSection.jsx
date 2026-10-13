import React, { useState, useEffect } from 'react'
import {
  Users,
  UserPlus,
  Phone,
  MessageCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Briefcase,
  IndianRupee,
  Loader2,
  X,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useClientStore } from '../store/clientStore'

const COLOR_PALETTE = [
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Indigo', value: '#4f46e5' },
]

const ROLE_OPTIONS = [
  'Delivery Staff & Driver',
  'Delivery Driver',
  'Counter & Billing Staff',
  'Factory / Plant Helper',
  'Loading & Unloading',
  'Manager & Supervisor',
  'Other',
]

export default function StaffSettingsSection() {
  const {
    staffList,
    staffLoading,
    fetchStaff,
    updateStaffProfile,
    addStaffMember,
    deleteStaffMember,
  } = useClientStore()

  useEffect(() => {
    const unsub = fetchStaff?.()
    return () => unsub?.()
  }, [fetchStaff])

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form Fields
  const [formName, setFormName] = useState('')
  const [formMobile, setFormMobile] = useState('')
  const [formRole, setFormRole] = useState('Delivery Staff & Driver')
  const [customRole, setCustomRole] = useState('')
  const [formBaseSalary, setFormBaseSalary] = useState(15000)
  const [formSalaryType, setFormSalaryType] = useState('monthly')
  const [formActive, setFormActive] = useState(true)
  const [formColor, setFormColor] = useState('#2563eb')

  // Delete confirmation state
  const [deletingStaff, setDeletingStaff] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const openAddModal = () => {
    setEditingStaffId(null)
    setFormName('')
    setFormMobile('')
    setFormRole('Delivery Staff & Driver')
    setCustomRole('')
    setFormBaseSalary(15000)
    setFormSalaryType('monthly')
    setFormActive(true)
    setFormColor('#2563eb')
    setModalOpen(true)
  }

  const openEditModal = (staff) => {
    setEditingStaffId(staff.id)
    setFormName(staff.name || '')
    setFormMobile(staff.mobile || '')
    if (ROLE_OPTIONS.includes(staff.role)) {
      setFormRole(staff.role)
      setCustomRole('')
    } else {
      setFormRole('Other')
      setCustomRole(staff.role || '')
    }
    setFormBaseSalary(staff.baseSalary !== undefined ? staff.baseSalary : 15000)
    setFormSalaryType(staff.salaryType || 'monthly')
    setFormActive(staff.active !== false)
    setFormColor(staff.color || '#2563eb')
    setModalOpen(true)
  }

  const handleMobileInput = (e) => {
    const raw = e.target.value
    // Strip non-digits and keep up to 10 digits
    const cleaned = raw.replace(/\D/g, '').slice(-10)
    setFormMobile(cleaned)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmedName = formName.trim()
    if (!trimmedName) {
      toast.error('Please enter staff name')
      return
    }

    const cleanMobile = formMobile.replace(/\D/g, '').slice(-10)
    if (cleanMobile && cleanMobile.length !== 10) {
      toast.error('Mobile number must be exactly 10 digits')
      return
    }

    const finalRole = formRole === 'Other' ? (customRole.trim() || 'Staff') : formRole
    const numSalary = Number(formBaseSalary) || 0

    setSaving(true)
    try {
      if (editingStaffId) {
        await updateStaffProfile(editingStaffId, {
          name: trimmedName,
          mobile: cleanMobile,
          role: finalRole,
          baseSalary: numSalary,
          salaryType: formSalaryType,
          active: formActive,
          color: formColor,
        })
        toast.success(`Updated details for ${trimmedName}`)
      } else {
        await addStaffMember({
          name: trimmedName,
          mobile: cleanMobile,
          role: finalRole,
          baseSalary: numSalary,
          salaryType: formSalaryType,
          active: formActive,
          color: formColor,
        })
        toast.success(`Added ${trimmedName} to staff`)
      }
      setModalOpen(false)
    } catch (err) {
      console.error('Error saving staff:', err)
      toast.error(err.message || 'Failed to save staff member')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (staff) => {
    const nextStatus = staff.active === false ? true : false
    try {
      await updateStaffProfile(staff.id, { active: nextStatus })
      toast.success(`${staff.name} is now ${nextStatus ? 'Active' : 'Inactive'}`)
    } catch (err) {
      console.error('Error toggling staff status:', err)
      toast.error('Failed to update status')
    }
  }

  const confirmDelete = async () => {
    if (!deletingStaff) return
    setIsDeleting(true)
    try {
      await deleteStaffMember(deletingStaff.id)
      toast.success(`Removed ${deletingStaff.name}`)
      setDeletingStaff(null)
    } catch (err) {
      console.error('Error deleting staff:', err)
      toast.error(err.message || 'Failed to remove staff member')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#131921] px-4 py-3.5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-[#ff9900] flex items-center justify-center font-bold shadow-inner">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm md:text-base font-black tracking-tight">Staff & Employees</h2>
              <span className="text-[10px] bg-orange-500/20 text-[#ff9900] font-bold px-2 py-0.5 rounded-full border border-orange-500/30">
                {(staffList || []).length} Members
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-medium">
              Manage staff phone numbers for Cash Handover SMS, roles & base salaries
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="w-full sm:w-auto px-3.5 py-1.5 bg-[#ff9900] hover:bg-[#e68a00] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
        >
          <UserPlus size={15} />
          <span>+ Add Staff Member</span>
        </button>
      </div>

      {/* Staff List Body */}
      <div className="p-3 sm:p-5 space-y-3">
        {staffLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-orange-500 mr-2" />
            <span className="text-xs font-semibold">Loading staff details...</span>
          </div>
        ) : (staffList || []).length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-gray-700">No staff members found</p>
            <p className="text-xs text-gray-400 mt-0.5">Click "+ Add Staff Member" to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(staffList || []).map((staff) => {
              const isActive = staff.active !== false
              const hasPhone = Boolean(staff.mobile && staff.mobile.trim())

              return (
                <div
                  key={staff.id}
                  className={`relative rounded-xl border transition-all p-3.5 flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-gray-200 bg-white hover:border-gray-300 shadow-xs'
                      : 'border-gray-200 bg-gray-50/70 opacity-75'
                  }`}
                >
                  {/* Top Row: Avatar, Name, Role & Status */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-xs"
                        style={{ backgroundColor: staff.color || '#2563eb' }}
                      >
                        {(staff.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-black text-gray-900 truncate">
                            {staff.name}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                            }`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-medium flex items-center gap-1 mt-0.5 truncate">
                          <Briefcase size={12} className="text-gray-400 shrink-0" />
                          <span className="truncate">{staff.role || 'Staff Member'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(staff)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Edit Staff Member"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingStaff(staff)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove Staff Member"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Middle Row: Mobile Number & SMS Status */}
                  <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-blue-100/60 text-blue-700 flex items-center justify-center shrink-0">
                        <Phone size={13} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Mobile (SMS / WhatsApp)
                        </span>
                        {hasPhone ? (
                          <span className="text-xs font-mono font-bold text-gray-900 block truncate">
                            +91 {staff.mobile}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} /> Not configured
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Call / WhatsApp */}
                    {hasPhone && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`tel:${staff.mobile}`}
                          className="px-2 py-1 text-[11px] font-bold text-gray-700 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors"
                          title="Call Staff"
                        >
                          Call
                        </a>
                        <a
                          href={`https://wa.me/91${staff.mobile}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 bg-white rounded-lg border border-gray-200 transition-colors"
                          title="WhatsApp Chat"
                        >
                          <MessageCircle size={14} />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Salary & Active Toggle */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 font-bold text-gray-800">
                      <span className="text-gray-400 font-medium">Base Salary:</span>
                      <span className="text-emerald-700 font-mono">
                        ₹{(Number(staff.baseSalary) || 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-[10px] text-gray-500 font-medium lowercase">
                        / {staff.salaryType || 'month'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleActive(staff)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors cursor-pointer ${
                        isActive
                          ? 'text-gray-600 hover:text-amber-700 hover:bg-amber-50'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                    >
                      {isActive ? 'Mark Inactive' : 'Activate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[#131921] px-5 py-3.5 text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-[#ff9900] flex items-center justify-center font-bold">
                  {editingStaffId ? <Edit2 size={15} /> : <UserPlus size={15} />}
                </div>
                <h3 className="text-sm font-black tracking-tight">
                  {editingStaffId ? 'Edit Staff Member' : 'Add New Staff Member'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Nilesh, Hiteshbhai, Ramesh"
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-hidden font-medium"
                />
              </div>

              {/* Mobile Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-700">
                    Mobile Number (10 Digits)
                  </label>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {formMobile.length}/10 digits
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={formMobile}
                    onChange={handleMobileInput}
                    placeholder="9925997750"
                    maxLength={10}
                    className="w-full pl-11 pr-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                  <Phone size={11} className="text-gray-400 shrink-0" />
                  Auto-fills recipient in Cash Handover MacroDroid SMS & WhatsApp salary slip.
                </p>
              </div>

              {/* Role / Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Role / Designation
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-hidden font-medium bg-white"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {formRole === 'Other' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Custom Role Title
                    </label>
                    <input
                      type="text"
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="e.g. Field Supervisor"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-hidden font-medium"
                    />
                  </div>
                )}
              </div>

              {/* Base Salary & Cycle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Base Salary (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={formBaseSalary}
                      onChange={(e) => setFormBaseSalary(e.target.value)}
                      placeholder="15000"
                      className="w-full pl-7 pr-3 py-2 text-sm font-mono rounded-xl border border-gray-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-hidden font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Salary Cycle
                  </label>
                  <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setFormSalaryType('monthly')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        formSalaryType === 'monthly'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormSalaryType('daily')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        formSalaryType === 'daily'
                          ? 'bg-white text-gray-900 shadow-xs'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      Daily
                    </button>
                  </div>
                </div>
              </div>

              {/* Color Theme */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Avatar Color Theme
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_PALETTE.map((pal) => (
                    <button
                      key={pal.value}
                      type="button"
                      onClick={() => setFormColor(pal.value)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${
                        formColor === pal.value
                          ? 'border-gray-900 scale-110 shadow-xs'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: pal.value }}
                      title={pal.label}
                    >
                      {formColor === pal.value && (
                        <div className="w-2 h-2 rounded-full bg-white"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">Active Status</span>
                  <span className="text-[11px] text-gray-500">
                    Active staff appear in Cash Handover and Salary menus
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFormActive((prev) => !prev)}
                  className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative p-0.5 ${
                    formActive ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      formActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-black bg-[#ff9900] hover:bg-[#e68a00] text-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  <span>{editingStaffId ? 'Update Staff' : 'Save Staff'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingStaff && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden p-5 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <ShieldAlert size={24} />
            </div>
            <div className="text-center">
              <h3 className="text-base font-black text-gray-900">
                Remove {deletingStaff.name}?
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to remove this staff profile? Alternatively, you can mark them
                inactive to retain past records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeletingStaff(null)}
                disabled={isDeleting}
                className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
