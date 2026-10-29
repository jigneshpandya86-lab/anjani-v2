import {
  collection,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore'
import { db } from '../firebase-config'
import { sendBackgroundSms, normalizeIndianPhone } from './leadSmsService'
import { DEFAULT_STAFF } from '../constants/staff'

export const DAYTIME_START_HOUR = 9 // 9:00 AM IST
export const DAYTIME_END_HOUR = 20 // 8:00 PM IST (20:00)

/**
 * Checks whether the current time in Indian Standard Time (IST - Asia/Kolkata)
 * is within respectful daytime hours (9:00 AM to 8:00 PM).
 *
 * @param {Date|string|number} [targetDate=new Date()]
 * @returns {{ isDayTime: boolean, currentHour: number, istTimeStr: string, reason: string }}
 */
export function checkIsDayTime(targetDate = new Date()) {
  const d = targetDate instanceof Date ? targetDate : new Date(targetDate)
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    })
    const parts = formatter.formatToParts(d)
    const hourPart = parts.find((p) => p.type === 'hour')
    const minutePart = parts.find((p) => p.type === 'minute')
    const currentHour = parseInt(hourPart?.value || '12', 10)
    const minute = minutePart?.value || '00'
    const istTimeStr = `${String(currentHour).padStart(2, '0')}:${minute} IST`

    const isDayTime = currentHour >= DAYTIME_START_HOUR && currentHour < DAYTIME_END_HOUR
    const reason = isDayTime
      ? `Daytime working hours (${istTimeStr}). Safe to notify staff.`
      : `Outside daytime working hours (${istTimeStr}). Daytime is 9:00 AM – 8:00 PM IST.`

    return { isDayTime, currentHour, istTimeStr, reason }
  } catch {
    // Fallback if Intl timeZone fails
    const localHour = d.getHours()
    const isDayTime = localHour >= DAYTIME_START_HOUR && localHour < DAYTIME_END_HOUR
    const istTimeStr = `${String(localHour).padStart(2, '0')}:00`
    return {
      isDayTime,
      currentHour: localHour,
      istTimeStr,
      reason: isDayTime ? 'Daytime working hours' : 'Outside daytime working hours',
    }
  }
}

/**
 * Formats a task description into natural direct Gujlish style:
 * e.g., "Oxira Sample aapyu?" -> "Oxira Sample aapyu ke nahi, keje mane..."
 * e.g., "Collect payment" -> "Collect payment kari dejo, ane thay aetle keje mane..."
 */
export function formatGujlishTaskText(taskText) {
  let clean = String(taskText || '').trim().replace(/[\r\n]+/g, ' ')
  if (!clean) return 'kaam kari dejo, ane thay aetle keje mane...'

  const lower = clean.toLowerCase()
  if (lower.includes('ke nahi') || lower.includes('ke nai') || lower.includes('keje mane')) {
    return clean.replace(/[?.!]+$/, '') + '...'
  }

  const hasQuestion = clean.endsWith('?')
  const core = clean.replace(/[?.!]+$/, '').trim()
  const coreLower = core.toLowerCase()

  if (/(?:karjo|dejo|aavjo|levjo|mokljo|aapjo|rakhjo)$/i.test(coreLower)) {
    return `${core}, ane thay aetle keje mane...`
  }

  if (
    hasQuestion ||
    /(?:aapyu|apiyu|didhu|lidhu|thayu|patavyu|pataavyu|moklyu|lidho|pahochyu|avyu|gayu)$/i.test(coreLower)
  ) {
    return `${core} ke nahi, keje mane...`
  }

  return `${core} kari dejo, ane thay aetle keje mane...`
}

/**
 * Builds a natural, respectful, direct Gujlish follow-up SMS message for delivery staff.
 * Varies phrasing progressively based on follow-up iteration (1st gentle -> 2nd reminder -> 3rd urgent).
 *
 * @param {Object} params
 * @param {string} params.staffName - e.g. "Nilesh" or "Hiteshbhai"
 * @param {string} params.taskText - Description of the task
 * @param {number} [params.followUpCount=0] - Number of previous follow-ups
 * @param {string} [params.dueDateStr] - Due date or target time
 * @param {boolean} [params.isUrgent=false]
 * @param {'direct_gujlish'|'formal'} [params.style='direct_gujlish']
 * @returns {string}
 */
export function buildHumanLikeFollowUpMessage({
  staffName = 'Staff',
  taskText = '',
  followUpCount = 0,
  dueDateStr = '',
  isUrgent = false,
  style = 'direct_gujlish',
}) {
  const cleanStaff = staffName.trim()
  const cleanTask = taskText.trim().replace(/[\r\n]+/g, ' ')
  const salutationName = /bhai/i.test(cleanStaff) ? cleanStaff : `${cleanStaff}bhai`

  if (style === 'formal') {
    if (isUrgent || followUpCount >= 2) {
      return `Jay Shree Krishna ${salutationName}, pending follow-up on urgent task: "${cleanTask}". Kindly complete and confirm back to Jigneshbhai as soon as possible. Thank you!`
    }
    if (followUpCount === 1) {
      return `Jay Shree Krishna ${salutationName}, gentle reminder regarding task: "${cleanTask}". Has this been completed? Pls update status to Jigneshbhai. Thanks!`
    }
    const dueInfo = dueDateStr ? ` (Target: ${dueDateStr})` : ''
    return `Jay Shree Krishna ${salutationName}, kindly update on this task: "${cleanTask}"${dueInfo}. When will it be completed? Thank you, Jigneshbhai`
  }

  const core = cleanTask.replace(/[?.!]+$/, '').trim()
  const targetSuffix = dueDateStr ? ` (Target: ${dueDateStr})` : ''

  if (isUrgent || followUpCount >= 2) {
    return `${salutationName}, ${core} thayu ke nahi? Jaldi patavjo ane keje mane...`
  }

  if (followUpCount === 1) {
    return `${salutationName}, ${core} ketle pahochyu? Keje mane update...`
  }

  // 1st initial follow-up
  const gujlishBody = formatGujlishTaskText(cleanTask)
  return `${salutationName}, ${gujlishBody}${targetSuffix}`
}

/**
 * Builds a natural, direct Gujlish assignment message when a new task is created.
 */
export function buildNewTaskAssignmentMessage({
  staffName = 'Staff',
  taskText = '',
  dueDateStr = 'Today',
  isFollowUp = false,
  style = 'direct_gujlish',
}) {
  const cleanStaff = staffName.trim()
  const cleanTask = taskText.trim().replace(/[\r\n]+/g, ' ')
  const salutationName = /bhai/i.test(cleanStaff) ? cleanStaff : `${cleanStaff}bhai`

  if (style === 'formal') {
    if (isFollowUp) {
      return `Jay Shree Krishna ${salutationName}, a follow-up task is assigned to you: "${cleanTask}". Target: ${dueDateStr}. Pls update Jigneshbhai once done. Thank you!`
    }
    return `Jay Shree Krishna ${salutationName}, new task assigned to you: "${cleanTask}". Target: ${dueDateStr}. Pls update Jigneshbhai once completed. Thank you!`
  }

  const targetSuffix = dueDateStr ? ` (Target: ${dueDateStr})` : ''
  const gujlishBody = formatGujlishTaskText(cleanTask)
  return `${salutationName}, ${gujlishBody}${targetSuffix}`
}

/**
 * Constructs a 1-tap WhatsApp chat URL for staff with pre-filled message.
 *
 * @param {Object} params
 * @param {string} params.staffPhone
 * @param {string} params.message
 * @returns {string}
 */
export function buildTaskWhatsAppUrl({ staffPhone, message = '' }) {
  const phone = normalizeIndianPhone(staffPhone)
  if (!phone) return ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

/**
 * Records a task follow-up entry in Firestore 'Jobs' (e.g. for WhatsApp or Background SMS).
 */
export async function recordTaskFollowUpHistory({
  taskId,
  staffName = 'Staff',
  message = '',
  channel = 'whatsapp',
  followUpCount = 0,
  dbInstance = db,
}) {
  if (!taskId || !dbInstance) return null

  const daytimeCheck = checkIsDayTime()
  const newCount = (Number(followUpCount) || 0) + 1
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    channel,
    staffName,
    followUpNumber: newCount,
    sentAt: daytimeCheck.istTimeStr,
    sender: 'Jigneshbhai',
  }

  try {
    const taskRef = doc(dbInstance, 'Jobs', taskId)
    await updateDoc(taskRef, {
      followUpCount: increment(1),
      lastFollowUpAt: serverTimestamp(),
      lastFollowUpMessage: message,
      followUpHistory: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    })
    return { success: true, followUpCount: newCount, entry }
  } catch (err) {
    console.warn('Could not record follow-up history in Firestore:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Resolves staff info (id, name, phone) given an identifier or search text.
 */
export function resolveStaffMember(staffQuery, staffList = DEFAULT_STAFF) {
  if (!staffQuery) return null
  const q = String(staffQuery).toLowerCase().trim()
  const pool = Array.isArray(staffList) && staffList.length > 0 ? staffList : DEFAULT_STAFF

  // 1. Direct ID or exact name match
  let match = pool.find((s) => s.id?.toLowerCase() === q || s.name?.toLowerCase() === q)
  if (match) return match

  // 2. Partial name match (e.g. "nilesh" matches "Nilesh", "hitesh" matches "Hiteshbhai")
  match = pool.find((s) => s.name?.toLowerCase().includes(q) || q.includes(s.name?.toLowerCase()))
  if (match) return match

  // 3. Fallback for common staff
  if (q.includes('nilesh')) {
    return pool.find((s) => s.id === 'nilesh') || { id: 'nilesh', name: 'Nilesh', mobile: '7990943652' }
  }
  if (q.includes('hitesh')) {
    return pool.find((s) => s.id === 'hiteshbhai') || { id: 'hiteshbhai', name: 'Hiteshbhai', mobile: '7778077617' }
  }

  return null
}

/**
 * Dispatches a human-like follow-up SMS to assigned staff, enforcing daytime checks
 * and updating the task document's follow-up history in Firestore.
 *
 * @param {Object} params
 * @param {string} params.taskId - Firestore document ID in 'Jobs'
 * @param {string} params.staffName
 * @param {string} params.staffPhone
 * @param {string} params.taskText
 * @param {number} [params.followUpCount=0]
 * @param {string} [params.customMessage] - Optional custom message override
 * @param {boolean} [params.forceOutsideDaytime=false] - Explicit override if user wants to send at night
 * @param {string} [params.macroUrl]
 * @returns {Promise<{ success: boolean, message: string, followUpCount: number, istTime: string }>}
 */
export async function sendTaskFollowUpSms({
  taskId,
  staffName,
  staffPhone,
  taskText,
  followUpCount = 0,
  customMessage = null,
  forceOutsideDaytime = false,
  macroUrl = null,
}) {
  const daytimeCheck = checkIsDayTime()
  if (!daytimeCheck.isDayTime && !forceOutsideDaytime) {
    const error = new Error(
      `⚠️ Cannot send SMS at night (${daytimeCheck.istTimeStr}). Staff follow-ups are restricted to daytime (9:00 AM – 8:00 PM IST) to avoid disturbing staff.`
    )
    error.code = 'OUTSIDE_DAYTIME'
    error.daytimeCheck = daytimeCheck
    throw error
  }

  const phone = normalizeIndianPhone(staffPhone)
  if (!phone || phone.length < 10) {
    throw new Error(`Valid 10-digit mobile number not found for staff ${staffName}`)
  }

  const message =
    customMessage ||
    buildHumanLikeFollowUpMessage({
      staffName,
      taskText,
      followUpCount,
    })

  // Send background SMS via MacroDroid
  await sendBackgroundSms({
    macroUrl,
    phone,
    message,
  })

  const newFollowUpCount = (Number(followUpCount) || 0) + 1
  const followUpEntry = {
    timestamp: new Date().toISOString(),
    message,
    channel: 'sms',
    followUpNumber: newFollowUpCount,
    sentAt: daytimeCheck.istTimeStr,
    sender: 'Jigneshbhai via AI Chatbot',
  }

  // Update Firestore if taskId exists
  if (taskId && db) {
    try {
      const taskRef = doc(db, 'Jobs', taskId)
      await updateDoc(taskRef, {
        followUpCount: increment(1),
        lastFollowUpAt: serverTimestamp(),
        lastFollowUpMessage: message,
        followUpHistory: arrayUnion(followUpEntry),
        stage: 'due', // Promote to due / in progress if active
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.warn('Could not record follow-up history in Firestore:', err)
    }
  }

  return {
    success: true,
    message,
    followUpCount: newFollowUpCount,
    istTime: daytimeCheck.istTimeStr,
  }
}

/**
 * Creates a new staff task or follow-up task in Firestore 'Jobs' collection.
 * Optionally dispatches an initial SMS notification to the staff member.
 *
 * @param {Object} taskData
 * @returns {Promise<{ id: string, ...taskData }>}
 */
export async function createStaffTaskInDb({
  text,
  assignedTo = 'nilesh',
  assignedStaffName = null,
  staffPhone = null,
  dueDate = null,
  stage = 'new',
  isFollowUp = false,
  parentTaskId = null,
  priority = 'normal',
  sendNotificationSms = false,
  macroUrl = null,
  forceOutsideDaytime = false,
}) {
  if (!text || !text.trim()) {
    throw new Error('Task description is required')
  }

  const cleanText = text.trim()
  const staff = resolveStaffMember(assignedTo)
  const resolvedStaffName = assignedStaffName || staff?.name || 'Nilesh'
  const resolvedPhone = staffPhone || staff?.mobile || '7990943652'

  let resolvedDueDate
  if (dueDate && typeof dueDate.toDate === 'function') {
    resolvedDueDate = dueDate
  } else if (dueDate instanceof Date) {
    resolvedDueDate = Timestamp.fromDate(dueDate)
  } else if (typeof dueDate === 'string' && dueDate) {
    const parsed = new Date(dueDate)
    resolvedDueDate = !isNaN(parsed.getTime()) ? Timestamp.fromDate(parsed) : Timestamp.now()
  } else {
    resolvedDueDate = Timestamp.now()
  }

  const dateStr = resolvedDueDate.toDate().toISOString().split('T')[0]

  const docPayload = {
    text: cleanText,
    stage,
    dueDate: resolvedDueDate,
    assignedTo: staff?.id || assignedTo || 'nilesh',
    assignedStaffName: resolvedStaffName,
    staffPhone: resolvedPhone,
    isFollowUp: Boolean(isFollowUp),
    parentTaskId: parentTaskId || null,
    priority,
    followUpCount: 0,
    followUpHistory: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  let newDocId = 'job-' + Date.now()
  if (db) {
    const docRef = await addDoc(collection(db, 'Jobs'), docPayload)
    newDocId = docRef.id
  }

  // Optionally send assignment SMS
  let smsSent = false
  let smsMessage = ''
  if (sendNotificationSms) {
    try {
      const daytimeCheck = checkIsDayTime()
      if (daytimeCheck.isDayTime || forceOutsideDaytime) {
        smsMessage = buildNewTaskAssignmentMessage({
          staffName: resolvedStaffName,
          taskText: cleanText,
          dueDateStr: dateStr,
          isFollowUp: Boolean(isFollowUp),
        })
        await sendBackgroundSms({
          macroUrl,
          phone: resolvedPhone,
          message: smsMessage,
        })
        smsSent = true
      }
    } catch (err) {
      console.warn('Initial task notification SMS could not be sent:', err)
    }
  }

  return {
    id: newDocId,
    ...docPayload,
    smsSent,
    smsMessage,
  }
}

/**
 * Fetches all non-archived staff tasks from Firestore 'Jobs' collection.
 */
export async function getActiveStaffTasks(dbInstance = db) {
  if (!dbInstance) return []
  const q = query(collection(dbInstance, 'Jobs'), orderBy('dueDate', 'asc'))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((j) => j.stage !== 'archived')
}
