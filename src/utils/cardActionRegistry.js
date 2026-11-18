/**
 * WhatsApp Banking-Style Card Action Registry
 * Generates ultra-compact (strictly 2-3 words) secondary actions for all AI Engine cards.
 */

import { normalizeIndianPhone } from '../services/leadSmsService'

/**
 * Builds secondary menu actions for Order Cards (open, draft, or past orders).
 */
export function getOrderCardActions({ order, handlers = {} }) {
  if (!order) return []

  const address = order.address || order.location || ''

  const actions = [
    {
      id: 'remind_staff',
      number: 1,
      label: '📲 Remind Nilesh',
      description: 'Send delivery SMS via MacroDroid',
      onSelect: () => handlers.onRemindStaff?.(order),
    },
    {
      id: 'whatsapp_staff',
      number: 2,
      label: '💬 WhatsApp Nilesh',
      description: 'Open pre-filled chat with Nilesh',
      onSelect: () => handlers.onWhatsAppStaff?.(order),
    },
    {
      id: 'google_maps',
      number: 3,
      label: '📍 Google Maps',
      description: 'Navigate to delivery address',
      disabled: !address,
      onSelect: () => {
        if (address) {
          window.open(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Vadodara')}`,
            '_blank'
          )
        }
      },
    },
    {
      id: 'mark_delivered',
      number: 4,
      label: '🚚 Mark Delivered',
      description: 'Update status to delivered',
      onSelect: () => handlers.onMarkDelivered?.(order),
    },
    {
      id: 'edit_qty',
      number: 5,
      label: '✏️ Edit Qty',
      description: 'Change order boxes / price',
      onSelect: () => handlers.onEditOrder?.(order),
    },
    {
      id: 'share_pdf',
      number: 6,
      label: '📄 Share PDF',
      description: 'Generate invoice bill',
      onSelect: () => handlers.onShareInvoice?.(order),
    },
  ]

  return actions
}

/**
 * Builds secondary menu actions for Client Cards.
 */
export function getClientCardActions({ client, handlers = {} }) {
  if (!client) return []

  const phone = client.mobile || client.phone || ''
  const cleanPhone = normalizeIndianPhone(phone)
  const address = client.address || ''

  const actions = [
    {
      id: 'book_order',
      number: 1,
      label: '📦 Book Order',
      description: 'New water order for client',
      onSelect: () => handlers.onBookOrder?.(client),
    },
    {
      id: 'record_jama',
      number: 2,
      label: '💰 Record Jama',
      description: 'Receive payment from client',
      onSelect: () => handlers.onRecordPayment?.(client),
    },
    {
      id: 'call_customer',
      number: 3,
      label: '📞 Call Customer',
      description: 'Direct phone call',
      disabled: !phone,
      onSelect: () => {
        if (phone) window.open(`tel:${phone}`, '_self')
      },
    },
    {
      id: 'whatsapp_chat',
      number: 4,
      label: '💬 WhatsApp Chat',
      description: 'Open customer WhatsApp',
      disabled: !cleanPhone,
      onSelect: () => {
        if (cleanPhone) {
          window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}`, '_blank')
        }
      },
    },
    {
      id: 'view_ledger',
      number: 5,
      label: '📜 View Ledger',
      description: 'Khatabook ledger & dues',
      onSelect: () => handlers.onViewLedger?.(client),
    },
    {
      id: 'navigate_address',
      number: 6,
      label: '📍 Navigate Address',
      description: 'Open in Google Maps',
      disabled: !address,
      onSelect: () => {
        if (address) {
          window.open(
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', Vadodara')}`,
            '_blank'
          )
        }
      },
    },
  ]

  return actions
}

/**
 * Builds secondary menu actions for Payment Cards.
 */
export function getPaymentCardActions({ payment, handlers = {} }) {
  if (!payment) return []

  const actions = [
    {
      id: 'whatsapp_receipt',
      number: 1,
      label: '💬 WhatsApp Receipt',
      description: 'Send payment slip to client',
      onSelect: () => handlers.onSendReceipt?.(payment),
    },
    {
      id: 'next_order',
      number: 2,
      label: '📦 Next Order',
      description: 'Book water against payment',
      onSelect: () => handlers.onNextOrder?.(payment),
    },
    {
      id: 'staff_handover',
      number: 3,
      label: '🤝 Staff Handover',
      description: 'Transfer cash to custody',
      onSelect: () => handlers.onStaffHandover?.(payment),
    },
    {
      id: 'client_balance',
      number: 4,
      label: '📜 Client Balance',
      description: 'Check outstanding dues',
      onSelect: () => handlers.onClientBalance?.(payment),
    },
  ]

  return actions
}

/**
 * Builds secondary menu actions for Staff Task Cards.
 */
export function getTaskCardActions({ task, handlers = {} }) {
  if (!task) return []

  const actions = [
    {
      id: 'sms_staff',
      number: 1,
      label: '📲 SMS Nilesh',
      description: 'Send follow-up via MacroDroid',
      onSelect: () => handlers.onSmsStaff?.(task),
    },
    {
      id: 'whatsapp_staff',
      number: 2,
      label: '💬 WhatsApp Nilesh',
      description: 'Open direct WhatsApp chat',
      onSelect: () => handlers.onWhatsAppStaff?.(task),
    },
    {
      id: 'tomorrow_morning',
      number: 3,
      label: '☀️ Tomorrow 9AM',
      description: 'Reschedule to morning',
      onSelect: () => handlers.onRescheduleTask?.(task),
    },
    {
      id: 'edit_note',
      number: 4,
      label: '✏️ Edit Note',
      description: 'Change task description',
      onSelect: () => handlers.onEditTask?.(task),
    },
    {
      id: 'mark_complete',
      number: 5,
      label: '✅ Mark Complete',
      description: 'Complete task in board',
      onSelect: () => handlers.onCompleteTask?.(task),
    },
  ]

  return actions
}

/**
 * Builds secondary menu actions for Cash Handover Cards.
 */
export function getHandoverCardActions({ handover, handlers = {} }) {
  if (!handover) return []

  const actions = [
    {
      id: 'staff_sms',
      number: 1,
      label: '📲 Staff SMS',
      description: 'Send Khatabook SMS confirmation',
      onSelect: () => handlers.onStaffSms?.(handover),
    },
    {
      id: 'whatsapp_slip',
      number: 2,
      label: '💬 WhatsApp Slip',
      description: 'Share handover slip',
      onSelect: () => handlers.onWhatsAppSlip?.(handover),
    },
    {
      id: 'open_calc',
      number: 3,
      label: '🧮 Open Calculator',
      description: 'Keypad formula calculator',
      onSelect: () => handlers.onOpenCalculator?.(handover),
    },
    {
      id: 'view_passbook',
      number: 4,
      label: '📜 View Passbook',
      description: 'Custody ledger history',
      onSelect: () => handlers.onViewPassbook?.(handover),
    },
  ]

  return actions
}
