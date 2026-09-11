import { serverTimestamp } from 'firebase/firestore'

const INDIA_COUNTRY_CODE = '91'
const DAY_IN_MS = 24 * 60 * 60 * 1000
const BUSINESS_WHATSAPP_NUMBER = import.meta.env.VITE_BUSINESS_WHATSAPP_NUMBER || ''

export const FOLLOW_UP_DAYS = [20, 45]

export const getLeadPhone = (lead) => lead.mobile || lead.phone || ''

export const toDateObject = (value) => {
  if (!value) return null
  if (value?.toDate) return value.toDate()

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeIndianPhone = (phone) => {
  let cleanPhone = String(phone || '').replace(/\D/g, '')
  if (cleanPhone.length === 10) cleanPhone = `${INDIA_COUNTRY_CODE}${cleanPhone}`
  return cleanPhone
}

export const sendBackgroundSms = async ({ macroUrl, phone, message }) => {
  const packet = `${normalizeIndianPhone(phone)}@@@${message}`
  const finalUrl = `${macroUrl}?data=${encodeURIComponent(packet)}`
  const response = await fetch(finalUrl, { method: 'GET' })

  if (!response.ok) {
    throw new Error(`Webhook failed with status ${response.status}`)
  }
}

export const buildInitialSmsMessage = () => {
  const waLink = BUSINESS_WHATSAPP_NUMBER ? `\nChat/Order: https://wa.me/${BUSINESS_WHATSAPP_NUMBER}` : ''
  return `Hello! I'm Jignesh Pandya, Annapurna Foods (Anjani & Bailey Water Distributorship, Vadodara). We supply Anjani 200ml & Bailey (250ml, 500ml, 1L, 2L) pure packaged water at direct bulk rates! Reply 1 for free sample/quote!${waLink}`
}

export const buildFollowUpSmsMessage = ({ reminderDay }) => {
  return `Dear Sir/Madam, gentle follow-up from Annapurna Foods (Anjani & Bailey Water Distributorship, Vadodara). It's been ${reminderDay} day${reminderDay > 1 ? 's' : ''} since our last message. Can we help with packaged water supply (Anjani 200ml / Bailey 250ml, 500ml, 1L, 2L)?`
}

export const buildInitialSmsUpdate = ({ lead = {}, leadId, now = new Date() } = {}) => {
  const payload = {
    Tag: 'SMS_SENT',
    smsSentAt: serverTimestamp(),
    lastSmsAt: serverTimestamp(),
    followUpStep: 0,
    smsCount: 1,
    nextFollowUpAt: new Date(now.getTime() + FOLLOW_UP_DAYS[0] * DAY_IN_MS),
    id: lead.id || leadId || null,
    source: lead.source || 'manual',
  }

  const normalizedPhone = getLeadPhone(lead)
  if (normalizedPhone) payload.mobile = normalizedPhone
  if (lead.name) payload.name = lead.name
  if (lead.createdAt) payload.createdAt = lead.createdAt

  return payload
}

export const getDueReminderContext = (lead, now = new Date()) => {
  const step = Number.isInteger(lead.followUpStep) ? lead.followUpStep : 0
  if (step >= FOLLOW_UP_DAYS.length) {
    return { shouldMarkComplete: true }
  }

  const lastSmsAt = toDateObject(lead.lastSmsAt) || toDateObject(lead.smsSentAt)
  if (!lastSmsAt) return null

  const fallbackDueAt = new Date(lastSmsAt.getTime() + FOLLOW_UP_DAYS[step] * DAY_IN_MS)
  const dueAt = toDateObject(lead.nextFollowUpAt) || fallbackDueAt
  if (dueAt > now) return null

  return {
    shouldMarkComplete: false,
    reminderDay: FOLLOW_UP_DAYS[step],
    nextStep: step + 1,
  }
}

export const buildFollowUpUpdate = ({ lead, reminderDay, nextStep, now = new Date() }) => {
  const payload = {
    followUpStep: nextStep,
    lastSmsAt: serverTimestamp(),
    smsCount: (Number(lead.smsCount) || 0) + 1,
    lastReminderDay: reminderDay,
  }

  if (nextStep >= FOLLOW_UP_DAYS.length) {
    payload.Tag = 'FOLLOWUP_DONE'
    payload.nextFollowUpAt = null
    payload.followUpDoneAt = serverTimestamp()
  } else {
    payload.nextFollowUpAt = new Date(now.getTime() + FOLLOW_UP_DAYS[nextStep] * DAY_IN_MS)
  }

  return payload
}
