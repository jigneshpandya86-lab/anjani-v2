const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { setGlobalOptions } = require('firebase-functions/v2')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const { VertexAI } = require('@google-cloud/vertexai')

admin.initializeApp()

const project = process.env.GCLOUD_PROJECT || 'anjaniappnew';
const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
});

const MACRODROID_URL = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
const INDIA_COUNTRY_CODE = "91";

function normalizeIndianPhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = `${INDIA_COUNTRY_CODE}${clean}`;
  return clean;
}

const PROMPTS = [
  { title: 'Ready to connect?', body: 'Ready to connect with new leads?', link: '/leads' },
  { title: 'Payments due', body: 'Check your outstanding payments', link: '/payments' },
  { title: 'Follow up needed', body: 'Follow up with pending customers', link: '/clients' },
  { title: 'New opportunities', body: 'Time to reach out to your leads!', link: '/leads' }
];

// Global settings for all functions
setGlobalOptions({
  region: 'asia-south1',
  maxInstances: 5,
})

// Global Constants
const STAFF_MOBILE = '917990943652'

// --- EXISTING FUNCTIONS ---

exports.sendSmsViaMacrodroid = onDocumentCreated('leads/{docId}', async (event) => {
  const db = admin.firestore()
  const leadRef = db.collection('leads').doc(event.params.docId)

  let leadData = null
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(leadRef)
      if (!doc.exists) {
        throw new Error('Lead document does not exist')
      }
      const data = doc.data()
      if (data.Tag) {
        throw new Error(`ALREADY_PROCESSED: Tag is ${data.Tag}`)
      }
      transaction.update(leadRef, { Tag: 'SENDING' })
      leadData = data
    })
  } catch (err) {
    if (err.message.includes('ALREADY_PROCESSED')) {
      logger.info(`Lead ${event.params.docId} already has tag or is sending: ${err.message}. Skipping SMS.`)
      return
    }
    logger.error(`Transaction failed for lead ${event.params.docId}: ${err.message}`)
    return
  }

  if (!leadData.mobile) {
    logger.error('ERROR: Missing mobile number for lead', { docId: event.params.docId })
    await leadRef.update({ Tag: 'FAILED_NO_MOBILE' })
    return
  }

  let cleanPhone = String(leadData.mobile).replace(/\D/g, '')
  if (!cleanPhone) {
    logger.error('ERROR: Empty mobile number for lead', { docId: event.params.docId })
    await leadRef.update({ Tag: 'FAILED_NO_MOBILE' })
    return
  }

  let last10 = cleanPhone
  if (cleanPhone.length >= 10) {
    last10 = cleanPhone.slice(-10)
  }

  try {
    const q1 = db.collection('leads').where('mobile', '==', last10).get()
    const q2 = db.collection('leads').where('mobile', '==', '91' + last10).get()
    const [snap1, snap2] = await Promise.all([q1, q2])

    let alreadySent = false
    const checkSnap = (snap) => {
      for (const doc of snap.docs) {
        if (doc.id !== event.params.docId) {
          const d = doc.data()
          if (d.Tag === 'SMS_SENT' || d.Tag === 'SENDING') {
            alreadySent = true
            break
          }
        }
      }
    }
    checkSnap(snap1)
    if (!alreadySent) checkSnap(snap2)

    if (alreadySent) {
      logger.info(`Lead ${event.params.docId} (${cleanPhone}) has a duplicate document that was already sent SMS or is sending. Marking as DUPLICATE.`)
      await leadRef.update({
        Tag: 'SMS_DUPLICATE_SKIPPED',
        skippedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return
    }
  } catch (err) {
    logger.error(`Error checking duplicate lead mobile numbers for doc ${event.params.docId}:`, err)
  }

  let smsPhone = cleanPhone
  if (smsPhone.length === 10) {
    smsPhone = '91' + smsPhone
  } else if (smsPhone.length > 10 && !smsPhone.startsWith('91')) {
    smsPhone = '91' + smsPhone.slice(-10)
  }

  const message =
    'Events in Vadodara? Serve Anjani Water 200ml bottles! Perfect size, zero waste. Special rates on bulk buys! Order here: https://wa.me/919925997750'
  const packet = `${smsPhone}@@@${message}`

  const baseUrl = 'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms'
  const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`

  try {
    const response = await fetch(finalUrl)

    if (response.ok) {
      logger.info('SMS Webhook Sent to ' + smsPhone)
      await leadRef.update({
        Tag: 'SMS_SENT',
        smsSentAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      logger.info('Updated Tag to SMS_SENT for doc: ' + event.params.docId)
    } else {
      logger.error('Macrodroid webhook failed:', response.status)
      await leadRef.update({ Tag: 'FAILED' })
    }
  } catch (e) {
    logger.error('SMS Error: ' + e.message)
    await leadRef.update({ Tag: 'FAILED' })
  }
})

/**
 * Sanitizes fields for SMS by removing special characters that might break the packet format.
 */
function sanitizeSmsField(field) {
  if (field === null || field === undefined) return 'N/A'
  return (
    String(field)
      .replace(/[@@@?&=]/g, ' ')
      .trim() || 'N/A'
  )
}

/**
 * Resolves full order and client context using order data and/or clientId/orderId.
 * Prioritizes explicitly provided orderData, but fetches from Firestore if needed to ensure
 * all required details are present.
 */
async function resolveOrderContext(orderDataOrId, clientIdOverride = null) {
  let orderData = typeof orderDataOrId === 'object' && orderDataOrId !== null ? orderDataOrId : null
  const orderId =
    typeof orderDataOrId === 'string'
      ? orderDataOrId
      : orderData?.id || orderData?.orderId || orderData?.OrderID

  // 1. If we only have an ID or incomplete data, fetch the order document
  if ((!orderData || !orderData.qty) && orderId) {
    try {
      const orderDoc = await admin.firestore().collection('orders').doc(String(orderId)).get()
      if (orderDoc.exists) {
        orderData = { ...orderDoc.data(), id: orderDoc.id }
      }
    } catch (e) {
      logger.error(`Error fetching order ${orderId}:`, e)
    }
  }

  if (!orderData) orderData = {}

  const clientId = clientIdOverride || orderData.clientId || orderData.ClientID
  let clientData = null

  // 2. Fetch customer data if clientId is available to get latest name/mobile/mapLink
  if (clientId) {
    try {
      const clientDoc = await admin.firestore().collection('customers').doc(String(clientId)).get()
      if (clientDoc.exists) {
        clientData = clientDoc.data()
      }
    } catch (e) {
      logger.error(`Error fetching customer ${clientId}:`, e)
    }
  }

  // 3. Consolidate details (Order Data > Client Data > Fallback)
  return {
    orderId: orderId || 'N/A',
    name: orderData.clientName || orderData.name || orderData.customer || clientData?.name || 'N/A',
    mobile: orderData.mobile || orderData.phone || clientData?.mobile || clientData?.phone || 'N/A',
    qty: orderData.qty || orderData.quantity || orderData.boxes || 'N/A',
    date: orderData.date || orderData.deliveryDate || orderData.orderDate || 'N/A',
    time: orderData.time || orderData.deliveryTime || 'N/A',
    address: orderData.address || orderData.deliveryAddress || 'N/A',
    location: orderData.location || orderData.area || 'N/A',
    mapLink: orderData.mapLink || orderData.googleMapsLink || clientData?.mapLink || 'N/A',
  }
}

exports.sendOrderSmsToStaff = onDocumentWritten('orders/{docId}', async (event) => {
  const beforeData = event.data.before.exists ? event.data.before.data() : null
  const afterData = event.data.after.exists ? event.data.after.data() : null

  logger.info(`Processing sendOrderSmsToStaff for ${event.params.docId}:`, {
    beforeData,
    afterData,
  })

  if (!afterData) {
    logger.info(`Order ${event.params.docId} deleted. Skipping SMS.`)
    return
  }

  const currentStatus = (afterData.status || '').toLowerCase()
  const previousStatus = beforeData ? (beforeData.status || '').toLowerCase() : null

  logger.info(
    `Processing order ${event.params.docId}: Status ${previousStatus} -> ${currentStatus}`,
  )

  const isCancelled = currentStatus === 'cancelled' || afterData.isCancelled === true
  const wasCancelled =
    beforeData && (previousStatus === 'cancelled' || beforeData.isCancelled === true)
  const justCancelled = isCancelled && !wasCancelled

  const importantFields = [
    'clientName',
    'name',
    'qty',
    'quantity',
    'date',
    'time',
    'deliveryTime',
    'address',
    'deliveryAddress',
    'location',
    'area',
    'mapLink',
    'googleMapsLink',
    'mobile',
    'phone',
    'status',
    'rate',
    'price',
    'amount',
  ]

  let anyDetailChanged = false
  let changedFields = []

  if (beforeData) {
    importantFields.forEach((field) => {
      const valBefore = beforeData[field]
      const valAfter = afterData[field]

      // Treat null, undefined, and empty string as equivalent
      const normalize = (v) => (v === null || v === undefined ? '' : String(v).trim())
      const normBefore = normalize(valBefore)
      const normAfter = normalize(valAfter)

      if (normBefore !== normAfter) {
        anyDetailChanged = true
        changedFields.push(field)
      }
    })
  }

  let shouldSend = false
  let statusHeader = 'ORDER UPDATED'

  if (!beforeData) {
    // New order - ALWAYS send
    shouldSend = true
    statusHeader = 'NEW ORDER'
    logger.info(`Decision: Sending notification for NEW order ${event.params.docId}`)
  } else if (justCancelled) {
    // Transition to cancelled - ALWAYS send
    shouldSend = true
    statusHeader = 'ORDER CANCELLED'
    logger.info(`Decision: Sending notification for CANCELLED order ${event.params.docId}`)
  } else if (anyDetailChanged) {
    // Skip notifications for confirmed or delivered status as requested
    if (currentStatus === 'confirmed' || currentStatus === 'delivered') {
      logger.info(
        `Decision: Skipping notification for order ${event.params.docId} - Status is ${currentStatus}.`,
      )
      return
    }

    shouldSend = true
    // Specific headers for important status transitions
    if (isCancelled) {
      statusHeader = 'ORDER CANCELLED'
    } else {
      statusHeader = 'ORDER UPDATED'
    }
    logger.info(
      `Decision: Sending notification for UPDATED order ${event.params.docId}. Changed: ${changedFields.join(', ')}`,
    )
  }

  if (!shouldSend) {
    logger.info(
      `Decision: Skipping notification for order ${event.params.docId} - no important details changed.`,
    )
    return
  }

  logger.info(
    `Sending notification for ${event.params.docId} with header: ${statusHeader}. Changed fields: ${changedFields.join(', ')}`,
  )

  // Resolve full order context including client details
  const resolved = await resolveOrderContext({ ...afterData, id: event.params.docId })

  // Sanitize all resolved fields for safe SMS construction
  const sName = sanitizeSmsField(resolved.name)
  const sMobile = sanitizeSmsField(resolved.mobile)
  const sQty = sanitizeSmsField(resolved.qty)
  const sDate = sanitizeSmsField(resolved.date)
  const sTime = sanitizeSmsField(resolved.time)
  const sAddress = sanitizeSmsField(resolved.address)
  const sLocation = sanitizeSmsField(resolved.location)
  const sMapLink = sanitizeSmsField(resolved.mapLink)

  const message = `${statusHeader} Details:
Client: ${sName}
Mobile: ${sMobile}
Qty: ${sQty}
Date: ${sDate}
Time: ${sTime}
Address: ${sAddress}
Location: ${sLocation}
MapLink: ${sMapLink}`

  const pushMessage = `${statusHeader}: ${sQty} for ${sName} at ${sTime} (${sDate}).`

  logger.info(`Constructed Staff message for ${event.params.docId}: ${message}`)

  // Send Push Notification
  try {
    await broadcastNotification(message, statusHeader, pushMessage, event.params.docId)
    logger.info(`Push notification sent for order: ${event.params.docId}`)
  } catch (pushError) {
    logger.error('Error sending push notification for order:', {
      orderId: event.params.docId,
      error: pushError.message,
    })
  }

  const staffMobile = STAFF_MOBILE
  const packet = `${staffMobile}@@@${message}`

  const baseUrl = MACRODROID_URL
  const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`

  try {
    const response = await fetch(finalUrl)
    if (response.ok) {
      logger.info(`${statusHeader} SMS Webhook Sent to Staff for order: ${event.params.docId}`)
    } else {
      logger.error('Staff SMS webhook failed:', {
        orderId: event.params.docId,
        status: response.status,
      })
    }
  } catch (e) {
    logger.error('Staff SMS Error:', { orderId: event.params.docId, error: e.message })
  }
})

/**
 * Helper to format date as YYYY-MM-DD
 */
exports.formatDate = (date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Helper to send order reminder SMS
 */
exports.sendOrderReminder = async function sendOrderReminder(doc, type, skipPush = false) {
  const data = doc.data()
  logger.info(`Processing ${type} reminder for order ${doc.id}:`, data)
  if (data.status === 'cancelled' || data.isCancelled === true) return

  // Resolve full order context including client details
  const resolved = await resolveOrderContext({ ...data, id: doc.id })

  // Skip if essential data is still missing (to avoid sending N/A messages for stub documents)
  if (resolved.name === 'N/A' && resolved.mobile === 'N/A') {
    logger.info(`Skipping reminder for doc ${doc.id} - missing client name and mobile.`)
    return
  }

  const message = `DELIVERY REMINDER (${type}):
Client: ${resolved.name}
Mobile: ${resolved.mobile}
Qty: ${resolved.qty}
Date: ${resolved.date}
Time: ${resolved.time}
Address: ${resolved.address}
Location: ${resolved.location}
MapLink: ${resolved.mapLink}`

  logger.info(`Constructed message for ${doc.id}: ${message}`)

  // Send Push Notification
  if (!skipPush) {
    try {
      await broadcastNotification(message, `DELIVERY REMINDER (${type})`, null, doc.id)
      logger.info(`Push reminder (${type}) sent for order: ${doc.id}`)
    } catch (pushError) {
      logger.error(`Error sending push reminder (${type}) for order:`, {
        orderId: doc.id,
        error: pushError.message,
      })
    }
  } else {
    logger.info(`Skipping individual push reminder for order ${doc.id} as per skipPush flag.`)
  }

  const staffMobile = '917990943652'
  const packet = `${staffMobile}@@@${message}`
  const baseUrl = 'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms'
  const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`

  try {
    const response = await fetch(finalUrl)
    if (response.ok) {
      logger.info(`Reminder (${type}) SMS Sent for order: ${doc.id}`)
    } else {
      logger.error(`Reminder (${type}) SMS failed:`, { orderId: doc.id, status: response.status })
    }
  } catch (e) {
    logger.error(`Reminder (${type}) SMS Error:`, { orderId: doc.id, error: e.message })
  }
}

// Morning reminder for TODAY's orders
exports.sendMorningOrderReminders = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    logger.info('Running morning order reminder job.')
    try {
      const todayStr = exports.formatDate(new Date())
      const snapshot = await admin
        .firestore()
        .collection('orders')
        .where('date', '==', todayStr)
        .get()

      const activeOrders = snapshot.docs.filter((doc) => {
        const data = doc.data()
        return !(data.status === 'cancelled' || data.isCancelled === true)
      })

      if (activeOrders.length > 0) {
        const summaryMessage = `Good Morning! You have ${activeOrders.length} order${activeOrders.length > 1 ? 's' : ''} scheduled for today. Check the app for details.`
        await broadcastNotification(summaryMessage, "TODAY'S ORDERS SUMMARY")

        // Still send individual SMS for staff automation, but skip individual push
        const promises = activeOrders.map((doc) => exports.sendOrderReminder(doc, 'TODAY', true))
        await Promise.all(promises)
        logger.info(
          `Morning order reminder job completed. Sent ${activeOrders.length} SMS reminders and 1 summary push.`,
        )
      } else {
        logger.info('No active orders found for today.')
      }
    } catch (e) {
      logger.error('Morning Order Reminder Job Error:', e.message)
    }
  },
)

// Evening reminder for TOMORROW's orders
exports.sendEveningOrderReminders = onSchedule(
  {
    schedule: '0 20 * * *',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    logger.info('Running evening order reminder job.')
    try {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = exports.formatDate(tomorrow)

      const snapshot = await admin
        .firestore()
        .collection('orders')
        .where('date', '==', tomorrowStr)
        .get()

      const activeOrders = snapshot.docs.filter((doc) => {
        const data = doc.data()
        return !(data.status === 'cancelled' || data.isCancelled === true)
      })

      if (activeOrders.length > 0) {
        const summaryMessage = `Evening Update: There are ${activeOrders.length} order${activeOrders.length > 1 ? 's' : ''} scheduled for tomorrow. Be ready!`
        await broadcastNotification(summaryMessage, "TOMORROW'S ORDERS SUMMARY")

        // Still send individual SMS for staff automation, but skip individual push
        const promises = activeOrders.map((doc) => exports.sendOrderReminder(doc, 'TOMORROW', true))
        await Promise.all(promises)
        logger.info(
          `Evening order reminder job completed. Sent ${activeOrders.length} SMS reminders and 1 summary push.`,
        )
      } else {
        logger.info('No active orders found for tomorrow.')
      }
    } catch (e) {
      logger.error('Evening Order Reminder Job Error:', e.message)
    }
  },
)

exports.sendWeeklyPaymentReminders = onSchedule(
  {
    schedule: 'every monday 18:00',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    logger.info('sendWeeklyPaymentReminders (Monday schedule) deactivated in favor of hourlySmsScheduler. Exiting.')
  },
)

// --- WEEKLY REGULAR CLIENT REMINDER SYSTEM ---

exports.sendWeeklyRegularOrderReminder = onSchedule(
  {
    schedule: '0 10 * * 3', // Every Wednesday at 10:00 AM India Time
    timeZone: 'Asia/Kolkata',
    retryCount: 2,
  },
  async (_event) => {
    logger.info('sendWeeklyRegularOrderReminder (Wednesday schedule) deactivated in favor of hourlySmsScheduler. Exiting.');
  },
)

// Constants and Helpers for the Follow-Up Logic
const MACRO_URL_FOLLOWUP =
  'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms'
const FOLLOW_UP_DAYS = [3, 7, 10, 15]
const DAY_IN_MS = 24 * 60 * 60 * 1000

function toDateObject(value) {
  if (!value) return null
  const { Timestamp } = require('firebase-admin/firestore')
  if (value instanceof Timestamp) return value.toDate()
  if (value?.toDate) return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getLeadPhone(lead) {
  return lead.mobile || lead.phone || ''
}

/*
 * Note: generateWeeklyPaymentSmsTemplate is commented out because the general weekly payment reminder schedule (for non-defaulters) was deactivated.
 * Keep this for future reference if general payment reminders are re-enabled.
 *
async function generateWeeklyPaymentSmsTemplate() {
  const prompt = `Write an extremely polite, humble, and friendly SMS reminder (max 140 chars) for a customer regarding their outstanding payment balance for "Anjani 200ml Packaged Drinking Water".
Tone: Very respectful, friendly, and soft (like family business). Use "Ji" for respect.
Language: Use a warm and natural mix of Hindi, Gujarati, and English (Hinglish/Gujarish).
Include placeholders {name} for name and {amount} for balance.
Output only the plain text of the SMS template.`

  try {
    const resp = await generativeModel.generateContent(prompt)
    const text = resp.response.candidates[0].content.parts[0].text.trim()
    return text
  } catch (error) {
    logger.error('Error generating weekly payment AI template:', error)
    // Fallback to a static message if AI fails
    return `Namaste {name} ji, a gentle reminder from Anjani Water for your pending balance of Rs {amount}. Krupaya apna payment clear karein. Thank you! 🙏`
  }
}
*/


async function sendBackgroundSms({ macroUrl, phone, message }) {
  const packet = `${normalizeIndianPhone(phone)}@@@${message}`
  const finalUrl = `${macroUrl}?data=${encodeURIComponent(packet)}`
  const res = await fetch(finalUrl, { method: 'GET' })
  if (!res.ok) {
    throw new Error(`Webhook failed with status ${res.status}`)
  }
}

function buildFollowUpSmsMessage({ reminderDay }) {
  return `Sir/Madam, this is a gentle follow-up from Anjani Water, Vadodara. It's been ${reminderDay} day${reminderDay > 1 ? 's' : ''} since our last message. Can we help with your packaged water bottle requirement?`
}

function getDueReminderContext(lead, now = new Date()) {
  const step = Number.isInteger(lead.followUpStep) ? lead.followUpStep : 0

  if (step >= FOLLOW_UP_DAYS.length) {
    return { shouldMarkComplete: true }
  }

  const lastSmsAt = toDateObject(lead.lastSmsAt) || toDateObject(lead.smsSentAt)
  if (!lastSmsAt) {
    logger.warn(
      `Lead ${lead.id} has Tag 'SMS_SENT' but no smsSentAt or lastSmsAt timestamp. Skipping.`,
    )
    return null
  }

  const fallbackDueAt = new Date(lastSmsAt.getTime() + FOLLOW_UP_DAYS[step] * DAY_IN_MS)
  const dueAt = toDateObject(lead.nextFollowUpAt) || fallbackDueAt
  if (dueAt > now) return null

  return {
    shouldMarkComplete: false,
    reminderDay: FOLLOW_UP_DAYS[step],
    nextStep: step + 1,
  }
}

function buildFollowUpUpdate({ lead, reminderDay, nextStep, now = new Date() }) {
  const { FieldValue, Timestamp } = require('firebase-admin/firestore')
  const payload = {
    followUpStep: nextStep,
    lastSmsAt: FieldValue.serverTimestamp(),
    smsCount: (Number(lead.smsCount) || 0) + 1,
    lastReminderDay: reminderDay,
  }

  if (nextStep >= FOLLOW_UP_DAYS.length) {
    payload.Tag = 'FOLLOWUP_DONE'
    payload.nextFollowUpAt = null
    payload.followUpDoneAt = FieldValue.serverTimestamp()
  } else {
    payload.nextFollowUpAt = Timestamp.fromDate(
      new Date(now.getTime() + FOLLOW_UP_DAYS[nextStep] * DAY_IN_MS),
    )
  }

  return payload
}

async function processDueFollowUpsInternal() {
  const now = new Date()
  const db = admin.firestore()

  const snap = await db.collection('leads').where('Tag', '==', 'SMS_SENT').limit(100).get()

  if (snap.empty) {
    return { checked: 0, sent: 0, markedDone: 0, skipped: 0 }
  }

  let checked = 0
  let sent = 0
  let markedDone = 0
  let skipped = 0

  const processingPromises = snap.docs.map(async (leadDoc) => {
    checked += 1
    const lead = leadDoc.data()
    lead.id = leadDoc.id // For logging
    const mobile = getLeadPhone(lead)
    if (!mobile) {
      skipped += 1
      return
    }

    const context = getDueReminderContext(lead, now)
    if (!context) {
      skipped += 1
      return
    }

    if (context.shouldMarkComplete) {
      await leadDoc.ref.update({ Tag: 'FOLLOWUP_DONE' })
      markedDone += 1
      return
    }

    try {
      await sendBackgroundSms({
        macroUrl: MACRO_URL_FOLLOWUP,
        phone: mobile,
        message: buildFollowUpSmsMessage({
          name: lead.name,
          reminderDay: context.reminderDay,
        }),
      })

      await leadDoc.ref.update(
        buildFollowUpUpdate({
          lead,
          reminderDay: context.reminderDay,
          nextStep: context.nextStep,
          now,
        }),
      )
      sent += 1
    } catch (e) {
      logger.error(`Failed to process follow-up for lead ${lead.id}:`, e)
      skipped += 1
    }
  })

  await Promise.all(processingPromises)

  return { checked, sent, markedDone, skipped }
}

// Scheduled job: weekly (Friday at 20:00 PM India Time)
exports.scheduleDueFollowUps = onSchedule(
  {
    schedule: '0 20 * * 5', // 8 PM on Friday
    timeZone: 'Asia/Kolkata',
    retryCount: 2,
  },
  async () => {
    logger.info('Starting weekly follow-up job...')
    const result = await processDueFollowUpsInternal()
    logger.info('Weekly follow-up job finished.', { result })
  },
)

exports.sendStaffLeadReminders = onSchedule(
  {
    schedule: '0 19 * * 6', // 7 PM on Saturday
    timeZone: 'Asia/Kolkata',
    retryCount: 2,
  },
  async () => {
    logger.info('Running weekly staff lead reminder job.')
    const staffMobile = STAFF_MOBILE
    const db = admin.firestore()

    try {
      const recentLeadsSnapshot = await db
        .collection('leads')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()

      if (recentLeadsSnapshot.empty) {
        logger.info('No recent leads found for staff reminder. Exiting.')
        return
      }

      let leadsDetails = []
      recentLeadsSnapshot.forEach((doc) => {
        const lead = doc.data()
        const sName = sanitizeSmsField(lead.name)
        const sMobile = sanitizeSmsField(lead.mobile)
        leadsDetails.push(`- ${sName} (ID: ${doc.id}, Mobile: ${sMobile})`)
      })

      const mainMessage = `Hello Team, here are 5 recent leads for 200ml packaged drinking water. Please engage with them via call, message, or meeting to close the deal!

${leadsDetails.join('\n')}

Good luck!`

      // Re-use existing helper function
      const cleanPhone = normalizeIndianPhone(staffMobile)

      const packet = `${cleanPhone}@@@${mainMessage}`
      const baseUrl = MACRODROID_URL
      const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`

      const response = await fetch(finalUrl)

      if (response.ok) {
        logger.info('Staff lead reminder SMS sent successfully.')
      } else {
        logger.error('Staff lead reminder SMS failed:', { status: response.status })
      }
    } catch (error) {
      logger.error('Error running staff lead reminder job:', error)
    }
  },
)

/**
 * Scheduled job to identify regular clients and ask for new orders.
 * Runs every Monday at 11:00 AM India Time.
 */
exports.sendIntelligentOrderReminders = onSchedule(
  {
    schedule: '0 11 * * 1',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
  },
  async () => {
    logger.info('Starting intelligent order reminder job...')
    const db = admin.firestore()
    const now = new Date()
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

    try {
      // 1. Get clients marked as suitable for intelligent reminders
      // Added limit to prevent unbounded memory usage
      const clientsSnap = await db
        .collection('clients')
        .where('suitable_with_intelki', '==', true)
        .limit(200)
        .get()

      if (clientsSnap.empty) {
        logger.info('No clients found with suitable_with_intelki: true. Exiting.')
        return
      }

      // Process sequentially to avoid webhook flooding
      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data()
        const clientId = clientDoc.id
        const clientName = client.name || client.clientName || 'Customer'
        const mobile = client.mobile || client.phone

        if (!mobile) {
          logger.warn(`Client ${clientId} is missing a mobile number.`)
          continue
        }

        // 2. Check last intelligent reminder date to avoid spamming
        const lastReminderAt = toDateObject(client.lastIntelligentReminderAt)
        if (lastReminderAt && now.getTime() - lastReminderAt.getTime() < SEVEN_DAYS_MS) {
          logger.info(`Client ${clientId} was recently reminded. Skipping.`)
          continue
        }

        // 3. Find the most recent order for this client to determine if they need a refill
        const ordersSnap = await db
          .collection('orders')
          .where('clientName', '==', clientName)
          .limit(50) // Reasonable limit for checking history
          .get()

        if (ordersSnap.empty) {
          logger.info(`No orders found for client ${clientName}. Skipping.`)
          continue
        }

        // Find the most recent order in memory (date is YYYY-MM-DD string)
        let lastOrder = null
        ordersSnap.forEach((orderDoc) => {
          const orderData = orderDoc.data()
          if (!lastOrder || orderData.date > lastOrder.date) {
            lastOrder = orderData
          }
        })

        if (!lastOrder || !lastOrder.date) {
          logger.warn(`Missing or invalid order date for client ${clientName}`)
          continue
        }

        // 4. If last order was more than 7 days ago, send a friendly reminder
        const lastOrderDate = new Date(lastOrder.date)
        if (isNaN(lastOrderDate.getTime())) {
          logger.warn(`Invalid order date format for client ${clientName}: ${lastOrder.date}`)
          continue
        }

        if (now.getTime() - lastOrderDate.getTime() >= SEVEN_DAYS_MS) {
          const sName = sanitizeSmsField(clientName)
          const message = `Hello ${sName}, this is Anjani Water. We noticed it's been about a week since your last order. Would you like to place a new order for packaged water bottles? You can order here: https://wa.me/919925997750. Have a great day!`

          try {
            await sendBackgroundSms({
              macroUrl: MACRODROID_URL,
              phone: mobile,
              message: message,
            })

            await clientDoc.ref.update({
              lastIntelligentReminderAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            logger.info(`Intelligent reminder sent to ${sName} (${mobile})`)
          } catch (smsError) {
            logger.error(`Failed to send intelligent reminder to ${sName}:`, smsError)
          }
        } else {
          logger.info(
            `Client ${clientName} ordered recently (${lastOrder.date}). No reminder needed.`,
          )
        }
      }

      logger.info('Intelligent order reminder job finished.')
    } catch (error) {
      logger.error('Error running intelligent order reminder job:', error)
    }
  },
)

/**
 * Scheduled job to discover new B2B leads using Vertex AI.
 * Runs bi-weekly on the 1st and 15th of the month at 08:00 AM India Time.
 */
exports.discoverLeadsWithAI = onSchedule(
  {
    schedule: '0 8 1,15 * *',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
  },
  async () => {
    logger.info('Starting AI lead discovery job...')
    const db = admin.firestore()

    try {
      // 1. Data Gathering (Mock implementation for now)
      // In a real scenario, this could be a fetch to Google Places, Eventbrite, or a news API.
      const mockRawData = `
        Upcoming events in Vadodara:
        - "Grand Wedding Expo" at Royal Palace Banquet (Contact: 9876543210).
        - "Corporate Tech Summit 2026" hosted by Elite Events Management. Call 9123456789 for inquiries.
        - New catering service "Spice & Serve" opening next week. Phone: 8888899999.
        `

      logger.info('Gathered raw data for AI evaluation.')

      // 2. AI Evaluation & Extraction
      // Capping input data size to 2000 characters to keep prompt tokens (and costs) under control.
      const promptInput = mockRawData.substring(0, 2000)
      const prompt = `
        Extract at most 5 most relevant B2B leads (like event venues, event organizers, or caterers) from the following text. 
        Return ONLY a raw JSON array containing objects with the keys: 
        'name', 'mobile' (extract only the 10-digit number), 'business_type', and 'relevance_score' (1-10).
        Do not include markdown blocks like \`\`\`json or anything else. Just the raw JSON array.
        
        Text:
        ${promptInput}
        `

      // Using generationConfig to cap output tokens and maintain cost control.
      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 800, // Capping response size
          temperature: 0.1, // Ensuring focused, structured output
        },
      })
      const aiResponseText = result.response.candidates[0].content.parts[0].text

      let leads = []
      try {
        // Clean up potentially present markdown JSON blocks if AI ignored the instruction
        let cleanedText = aiResponseText.trim()
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.substring(7)
        }
        if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.substring(3)
        }
        if (cleanedText.endsWith('```')) {
          cleanedText = cleanedText.substring(0, cleanedText.length - 3)
        }
        leads = JSON.parse(cleanedText.trim())
      } catch (_parseError) {
        logger.error('Failed to parse AI response into JSON:', aiResponseText)
        return
      }

      logger.info(`AI extracted ${leads.length} potential leads.`)

      // 3. Database Insertion
      let addedCount = 0
      for (const lead of leads) {
        // Strictly cap at 5 additions per run to prevent excessive Firestore writes and keep bill in control.
        if (addedCount >= 5) break

        if (lead.mobile && String(lead.mobile).length >= 10) {
          const cleanPhone = String(lead.mobile).replace(/\D/g, '')
          let last10 = cleanPhone
          if (cleanPhone.length >= 10) {
            last10 = cleanPhone.slice(-10)
          }

          // Check if lead already exists to avoid duplicates (checking both 10-digit and 12-digit versions)
          const q1 = db.collection('leads').where('mobile', '==', last10).limit(1).get()
          const q2 = db.collection('leads').where('mobile', '==', '91' + last10).limit(1).get()
          const [snap1, snap2] = await Promise.all([q1, q2])

          if (snap1.empty && snap2.empty) {
            await db.collection('leads').add({
              name: lead.name || 'Unknown',
              mobile: last10,
              business_type: lead.business_type || 'Unknown',
              relevance_score: lead.relevance_score || 0,
              source: 'AI_Discovery',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              Tag: null, // Trigger the SMS webhook
            })
            addedCount++
            logger.info(`Added new lead: ${lead.name} (${last10})`)
          } else {
            logger.info(`Lead already exists: ${last10}`)
          }
        }
      }

      logger.info(`AI lead discovery job finished. Added ${addedCount} new leads.`)
    } catch (error) {
      logger.error('Error running AI lead discovery job:', error)
    }
  },
)

// --- NOTIFICATION SYSTEM FUNCTIONS ---
const { onCall } = require('firebase-functions/v2/https')

/**
 * Helper to broadcast a notification message to all users via FCM
 * and record it in the Firestore notifications collection.
 * Includes token chunking for robustness.
 */
async function broadcastNotification(
  message,
  title = 'New Notification',
  pushMessage = null,
  tag = 'broadcast-notification',
) {
  const db = admin.firestore()
  try {
    const newNotification = {
      message,
      title,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }

    const notificationDocRef = await db.collection('notifications').add(newNotification)

    // Fetch all user devices to get FCM tokens across all users
    const devicesSnapshot = await db.collectionGroup('tokens').get()

    logger.info(`Broadcast (${tag}): Found ${devicesSnapshot.size} total token documents.`)

    if (devicesSnapshot.empty) {
      logger.info(`Broadcast (${tag}): No user devices found to send FCM.`)
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 }
    }

    const allTokens = []
    devicesSnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.token) {
        allTokens.push(data.token)
      }
    })

    if (allTokens.length === 0) {
      logger.info(`Broadcast (${tag}): No valid FCM tokens found.`)
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 }
    }

    const displayBody = pushMessage || message
    let totalSuccessCount = 0
    let totalFailureCount = 0

    // FCM limit for sendEach is 500 messages per call
    const chunkSize = 500
    for (let i = 0; i < allTokens.length; i += chunkSize) {
      const tokenChunk = allTokens.slice(i, i + chunkSize)

      const messages = tokenChunk.map((token) => ({
        token,
        notification: { title, body: displayBody },
        data: {
          title,
          body: message,
          click_action: 'https://anjaniappnew.firebaseapp.com',
          type: 'broadcast',
          orderId: tag !== 'broadcast-notification' ? tag : '',
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'order_alerts',
            priority: 'high',
            defaultVibrateTimings: true,
            defaultSound: true,
          },
        },
        webpush: {
          notification: {
            title,
            body: displayBody,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            renotify: true,
            tag: tag,
          },
          fcm_options: { link: 'https://anjaniappnew.firebaseapp.com' },
        },
      }))

      const response = await admin.messaging().sendEach(messages)
      totalSuccessCount += response.successCount
      totalFailureCount += response.failureCount

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            logger.info(
              `Broadcast (${tag}): Token ${tokenChunk[idx].substring(0, 10)}... failed with error: ${resp.error?.code}`,
            )
          }
        })
      }
    }

    logger.info(
      `Broadcast (${tag}): Sent to ${totalSuccessCount} tokens; ${totalFailureCount} failed.`,
    )
    return { id: notificationDocRef.id, ...newNotification, tokensNotified: totalSuccessCount }
  } catch (error) {
    logger.error('Error in broadcastNotification:', error)
    throw error
  }
}

/**
 * Fetch the latest notifications for the app.
 */
exports.getNotifications = onCall(async (_request) => {
  try {
    const snapshot = await admin
      .firestore()
      .collection('notifications')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get()

    const notifications = []
    snapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() })
    })

    return { notifications }
  } catch (error) {
    logger.error('Error fetching notifications:', error)
    throw new Error('Failed to fetch notifications')
  }
})

/**
 * Broadcast a notification to all users.
 */
exports.sendNotification = onCall(async (request) => {
  // In a real app, you'd check request.auth for admin permissions here
  const { message } = request.data

  if (!message) {
    throw new Error('Message is required')
  }

  try {
    const result = await broadcastNotification(message)
    return { ...result, status: 'success' }
  } catch (error) {
    logger.error('Error sending notification:', error)
    throw new Error('Failed to send notification')
  }
})

/**
 * Register or update a user device token.
 * Logs the login ID (mobile number or email) while registering.
 */
exports.registerDevice = onCall(async (request) => {
  const { token, loginId, deviceName } = request.data
  // Use authenticated UID or fallback to loginId if not authenticated
  const userId = request.auth ? request.auth.uid : loginId || 'unknown'

  if (!token) {
    throw new Error('Token is required')
  }

  const db = admin.firestore()
  try {
    // Standardize to userDevices/{userId}/tokens/{token}
    const deviceRef = db.collection('userDevices').doc(userId).collection('tokens').doc(token)
    await deviceRef.set(
      {
        token,
        loginId: loginId || 'anonymous',
        deviceName: deviceName || 'unknown',
        status: 'active', // Ensure the token is active when registered/refreshed
        lastRegistered: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    logger.info(`Device registered: ${token} for loginId: ${loginId} under user: ${userId}`)
    return { status: 'success' }
  } catch (error) {
    logger.error('Error registering device:', error)
    throw new Error('Failed to register device')
  }
})

/**
 * Helper to check if a delivery time string is within the next 3.5 hours.
 * Uses IST for all comparisons to avoid UTC server issues.
 */
function isDeliverySoon(deliveryTimeStr, now) {
  if (!deliveryTimeStr || deliveryTimeStr === 'N/A') return false

  // Convert current time to IST string and back to Date to "shift" it
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  const nowIST = new Date(istString)

  // Attempt to parse common time formats like "14:30", "02:30 PM", "2 PM"
  const match = deliveryTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i)
  if (!match) return true // Fallback

  let hours = parseInt(match[1])
  const minutes = parseInt(match[2]) || 0
  const ampm = match[3]

  if (ampm) {
    if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12
    if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0
  }

  // deliveryDateIST is based on the shifted nowIST
  const deliveryDateIST = new Date(nowIST)
  deliveryDateIST.setHours(hours, minutes, 0, 0)

  const diffMs = deliveryDateIST.getTime() - nowIST.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  // Return true if delivery is in the next 3.5 hours (slight buffer) and not more than 30 mins past
  return diffHours > -0.5 && diffHours <= 3.5
}

/**
 * Hourly Delivery Reminders
 * Runs hourly from 7 AM to 9 PM IST to check for orders due soon.
 */
exports.hourlyDeliveryReminders = onSchedule(
  {
    schedule: '0 7-21 * * *',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
  },
  async (_event) => {
    logger.info('Starting optimized hourly delivery reminder job...')
    const db = admin.firestore()
    const now = new Date()
    const todayStr = exports.formatDate(now)

    try {
      // Fetch today's orders. We filter status and pushReminderSent in memory
      // to avoid complex index requirements for inequality filters.
      const snapshot = await db.collection('orders').where('date', '==', todayStr).get()

      if (snapshot.empty) {
        logger.info('No orders scheduled for today. Exiting.')
        return
      }

      const ordersToRemind = []
      snapshot.forEach((doc) => {
        const data = doc.data()

        // Data efficiency: Skip if already reminded, delivered, or cancelled
        if (data.pushReminderSent === true) return
        const status = (data.status || '').toLowerCase()
        if (status === 'delivered' || status === 'cancelled' || data.isCancelled === true) return

        const deliveryTime = data.time || data.deliveryTime

        // Only proceed if delivery is "soon" (within next ~3 hours)
        if (deliveryTime && isDeliverySoon(deliveryTime, now)) {
          ordersToRemind.push({ id: doc.id, ref: doc.ref, ...data })
        }
      })

      if (ordersToRemind.length > 0) {
        let summaryMessage = ''
        if (ordersToRemind.length === 1) {
          const data = ordersToRemind[0]
          const deliveryTime = data.time || data.deliveryTime
          summaryMessage = `Upcoming Delivery: Order for ${data.clientName || data.name || 'Customer'} is scheduled for ${deliveryTime} today. Qty: ${data.qty || data.quantity}`
        } else {
          summaryMessage = `Upcoming Deliveries: You have ${ordersToRemind.length} orders due soon. Check the app for details.`
        }

        await broadcastNotification(summaryMessage, 'Delivery Reminder')

        const updatePromises = ordersToRemind.map((order) =>
          order.ref.update({ pushReminderSent: true }),
        )
        await Promise.all(updatePromises)

        logger.info(
          `Hourly delivery reminder job completed. Sent 1 summary push for ${ordersToRemind.length} orders.`,
        )
      } else {
        logger.info('No orders are due for reminder in this window.')
      }
    } catch (e) {
      logger.error('Hourly Delivery Reminder Job Error:', e.message)
    }
  },
)

// --- STAFF TASKS (JOBS) SYSTEM ---

/**
 * Intelligent Staff Task Reminders
 * Runs daily at 9:00 AM IST to remind staff of their 'new' and 'due' tasks.
 */
exports.intelligentStaffTaskReminders = onSchedule(
  {
    schedule: '0 9 * * *', // 9:00 AM every day
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
  },
  async (_event) => {
    logger.info('Starting intelligent staff task reminders job...')
    const db = admin.firestore()
    const now = new Date()

    try {
      // Query tasks that are new or due
      const jobsSnapshot = await db.collection('Jobs').where('stage', 'in', ['new', 'due']).get()

      if (jobsSnapshot.empty) {
        logger.info('No new or due tasks found. Exiting.')
        return
      }

      const pendingTasks = []
      jobsSnapshot.forEach((doc) => {
        const data = doc.data()
        const taskDueDate = data.dueDate ? data.dueDate.toDate() : null

        // Only include tasks that are past due or due within the next 24 hours
        if (taskDueDate && taskDueDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
          pendingTasks.push(`- ${data.text} (Due: ${taskDueDate.toLocaleDateString()})`)
        }
      })

      if (pendingTasks.length === 0) {
        logger.info('No tasks require immediate reminders today.')
        return
      }

      // Limit the number of tasks sent to the AI to prevent exceeding prompt size
      const tasksSummary = pendingTasks.slice(0, 10).join('\n')

      const prompt = `You are the automated assistant for Anjani Water. Write a highly conversational, friendly, and natural SMS (max 160 characters) to the staff team reminding them about their pending tasks for today.
Here are the pending tasks:
${tasksSummary}

Keep the message short, professional but warm (Hinglish is okay). Don't list all tasks, just summarize the count and urge them to check the app/dashboard to complete them. End with a motivating remark.`

      // Use Gemini to generate the human-like message
      const result = await generativeModel.generateContent(prompt)
      const aiMessage = result.response.candidates[0].content.parts[0].text.trim()
      logger.info('Generated AI Staff Reminder:', aiMessage)

      const STAFF_MOBILE_NUMBER = '917990943652' // Hardcoded as per existing standard
      const MACRO_WEBHOOK =
        'https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms'
      const packet = `${STAFF_MOBILE_NUMBER}@@@${aiMessage}`
      const finalUrl = `${MACRO_WEBHOOK}?data=${encodeURIComponent(packet)}`

      const response = await fetch(finalUrl)
      if (response.ok) {
        logger.info('Successfully sent intelligent staff task reminder via SMS.')
      } else {
        logger.error('Failed to send staff task reminder SMS:', response.status)
      }
    } catch (error) {
      logger.error('Error in intelligent staff task reminders job:', error)
    }
  },
)

// --- DEFAULTER PAYMENT REMINDER SYSTEM ---
// Runs every hour and checks Firestore config/defaulterReminder for the configured send time.
// Sends an AI-generated payment reminder SMS to all clients tagged as isDefaulter: true.

async function generateDefaulterPaymentSmsTemplate() {
  const prompt = `Write an extremely polite, respectful, and gentle SMS reminder (max 150 chars) for a customer regarding their pending payment for "Anjani 200ml Packaged Drinking Water".
Tone: Very humble, respectful (like a family business talking to a respected elder), yet clear about the balance.
Language: Use a very natural mix of Hindi, Gujarati, and English (Hinglish/Gujarish). For example, use words like "Krupaya", "Vinti", "Namaste", "Kem cho".
Include placeholder {name} for customer name and {amount} for outstanding balance in rupees.
The message should feel personal and warm, not robotic or automated.
Output only the plain SMS text, no quotes or formatting.`

  try {
    const resp = await generativeModel.generateContent(prompt)
    const text = resp.response.candidates[0].content.parts[0].text.trim()
    return text
  } catch (error) {
    logger.error('Error generating defaulter SMS AI template:', error)
    return `Namaste {name} ji, Anjani Water ki taraf se payment reminder. Aapka ₹{amount} outstanding hai. Krupaya jaldi payment clear karein. WhatsApp ya cash — dono chalega. Dhanyavaad! 🙏`
  }
}

// --- WEEKLY REGULAR CLIENT REMINDER SYSTEM ---

exports.sendWeeklyRegularOrderReminder = onSchedule(
  {
    schedule: "0 * * * *", // Run hourly, checks config/regularReminder to see if it should execute
    region: "asia-south1",
    retryCount: 2
  },
  async (_event) => {
    logger.info("sendWeeklyRegularOrderReminder (Hourly scheduler) deactivated in favor of hourlySmsScheduler. Exiting.");
  }
);

// --- DEFAULTER PAYMENT REMINDER SYSTEM ---

exports.sendWeeklyPaymentReminders = onSchedule(
  {
    schedule: "0 * * * *", // Run hourly, checks config/defaulterReminder to see if it should execute
    region: "asia-south1",
    retryCount: 2
  },
  async (_event) => {
    logger.info("sendWeeklyPaymentReminders (Hourly scheduler) deactivated in favor of hourlySmsScheduler. Exiting.");
  }
);

// --- AI GENERATIVE TEMPLATE HELPERS ---

/**
 * Uses Gemini to generate a single engaging, fresh SMS template for the week.
 */
async function generateWeeklySmsTemplate() {
  const prompt = `Write a very short, engaging, and friendly SMS reminder (max 140 chars) for a regular customer to order "Anjani 200ml Packaged Drinking Water". 
  The tone should be professional yet warm, extremely polite. 
  Use a mix of Hindi and Gujarati (Hinglish/Gujlish style). 
  Focus only on the 200ml bottles. 
  Include a placeholder {name} exactly where the customer's name should go.
  Include a call to action to reply or WhatsApp to order.
  Avoid complex formatting. Just the plain text of the SMS template.`;

  try {
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates[0].content.parts[0].text.trim();
    return text;
  } catch (error) {
    logger.error("Error generating weekly AI template:", error);
    return `Hello {name}, kem cho? Time for your weekly Anjani 200ml water refill! Message us to schedule delivery. 😊`;
  }
}


/**
 * Gets the current week's cached defaulter SMS template from Firestore, or generates a new one.
 */
async function getOrCreateDefaulterSmsTemplate() {
  const db = admin.firestore();
  const configRef = db.collection('config').doc('defaulterReminder');
  const configDoc = await configRef.get();
  
  let configData = configDoc.exists ? configDoc.data() : {};
  const now = new Date();
  
  // Helper to get week number (e.g. 2026-W22)
  const getWeekNumber = (d) => {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    const weekNo = 1 + Math.ceil((firstThursday - target) / 604800000);
    return `${target.getFullYear()}-W${weekNo}`;
  };
  
  const currentWeekKey = getWeekNumber(now);
  
  if (configData.currentTemplate && configData.templateWeek === currentWeekKey) {
    logger.info("Reusing existing weekly template for week:", currentWeekKey);
    return configData.currentTemplate;
  }
  
  logger.info("Generating new weekly template for week:", currentWeekKey);
  const newTemplate = await generateDefaulterPaymentSmsTemplate();
  
  try {
    await configRef.set({
      currentTemplate: newTemplate,
      templateWeek: currentWeekKey
    }, { merge: true });
    logger.info("Stored new weekly template in config/defaulterReminder.");
  } catch (e) {
    logger.error("Failed to save weekly template in Firestore config:", e);
  }
  
  return newTemplate;
}

exports.sendOrderDeliveredSmsToClient = onDocumentWritten('orders/{docId}', async (event) => {
  const beforeData = event.data.before.exists ? event.data.before.data() : null
  const afterData = event.data.after.exists ? event.data.after.data() : null

  if (!afterData) {
    logger.info(`Order ${event.params.docId} deleted. Skipping client delivery SMS.`)
    return
  }

  const currentStatus = (afterData.status || '').toLowerCase()
  const previousStatus = beforeData ? (beforeData.status || '').toLowerCase() : null

  // We only want to send the SMS when status transitions to "delivered"
  const justDelivered = currentStatus === 'delivered' && previousStatus !== 'delivered'

  if (!justDelivered) {
    logger.info(`Order ${event.params.docId} status is ${currentStatus} (previous: ${previousStatus}). Skipping client delivery SMS.`)
    return
  }

  logger.info(`Sending Delivery SMS to client for order ${event.params.docId}`)

  try {
    // Resolve client details
    const resolved = await resolveOrderContext({ ...afterData, id: event.params.docId })
    
    // Client name and mobile number
    const clientName = sanitizeSmsField(resolved.name)
    const clientMobile = resolved.mobile

    if (!clientMobile || clientMobile === 'N/A') {
      logger.warn(`No mobile number found for order ${event.params.docId}. Cannot send client SMS.`)
      return
    }

    // Construct the template
    // "Thank You [Client Name] your order with Anjani water is delivered, Stay hydrated."
    const message = `Thank You ${clientName} your order with Anjani water is delivered, Stay hydrated.`
    
    const cleanMobile = normalizeIndianPhone(clientMobile)
    const packet = `${cleanMobile}@@@${message}`

    const baseUrl = MACRODROID_URL
    const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`

    const response = await fetch(finalUrl)
    if (response.ok) {
      logger.info(`Delivery SMS Webhook Sent to Client (${clientName}) for order: ${event.params.docId}`)
    } else {
      logger.error('Client Delivery SMS webhook failed:', {
        orderId: event.params.docId,
        status: response.status,
      })
    }
  } catch (e) {
    logger.error('Client Delivery SMS Error:', { orderId: event.params.docId, error: e.message })
  }
})

exports.sendDailyStockReportToNilesh = onSchedule(
  {
    schedule: '0 21 * * *',
    timeZone: 'Asia/Kolkata',
  },
  async (_event) => {
    logger.info('sendDailyStockReportToNilesh legacy job deactivated in favor of hourlySmsScheduler. Exiting.');
  },
)

// --- UNIFIED HOURLY SMS SCHEDULER SYSTEM ---

/**
 * Helper to process Regular Client SMS Reminders
 */
async function processRegularClientReminders(db, currentHour, currentDayOfWeek) {
  try {
    const configRef = db.collection('config').doc('regularReminder');
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      logger.warn("regularReminder config document not found. Skipping.");
      return;
    }

    const configData = configDoc.data();
    if (!configData.enabled) {
      logger.info("Regular client reminders are disabled in config. Skipping.");
      return;
    }

    // Check if today matches configured weekdays
    if (Array.isArray(configData.days) && !configData.days.includes(currentDayOfWeek)) {
      logger.info(`Regular Reminders: Today (weekday ${currentDayOfWeek}) is not in the configured days [${configData.days.join(', ')}]. Skipping.`);
      return;
    }

    // Check if current hour matches configured hour
    const configHour = parseInt(configData.hour, 10);
    if (currentHour !== configHour) {
      logger.info(`Regular Reminders: Current hour (${currentHour}) does not match configured hour (${configHour}). Skipping.`);
      return;
    }

    const regularSnap = await db.collection('customers').where('isRegular', '==', true).get();
    
    if (regularSnap.empty) {
      logger.info("No regular customers found for reminder. Skipping.");
      return;
    }

    // Generate ONE fresh message template for the entire week
    const weeklyTemplate = await generateWeeklySmsTemplate();
    logger.info("Weekly AI template generated:", weeklyTemplate);

    const promises = regularSnap.docs.map(async (doc) => {
      const customer = doc.data();
      const mobile = customer.mobile;
      const name = customer.name || "Customer";

      if (!mobile) return;

      const message = weeklyTemplate.replace("{name}", name);

      try {
        await sendBackgroundSms({
          macroUrl: MACRODROID_URL,
          phone: mobile,
          message,
        });
        logger.info(`Weekly AI reminder sent to regular client: ${name} (${normalizeIndianPhone(mobile)})`);
      } catch (e) {
        logger.error(`Error calling AI webhook for regular client ${normalizeIndianPhone(mobile)}:`, { error: e.message });
      }
    });

    await Promise.all(promises);
    logger.info("Finished processing weekly AI reminders for regular clients.");
  } catch (error) {
    logger.error("Error processing weekly regular client AI reminders:", error);
  }
}

/**
 * Helper to process Defaulter Client Payment SMS Reminders
 */
async function processDefaulterPaymentReminders(db, currentHour, currentDayOfWeek) {
  try {
    const configRef = db.collection('config').doc('defaulterReminder');
    const configDoc = await configRef.get();

    if (!configDoc.exists) {
      logger.warn("defaulterReminder config document not found. Skipping.");
      return;
    }

    const configData = configDoc.data();
    if (!configData.enabled) {
      logger.info("Defaulter reminders are disabled in config. Skipping.");
      return;
    }

    // Check if today matches configured weekdays
    if (Array.isArray(configData.days) && !configData.days.includes(currentDayOfWeek)) {
      logger.info(`Defaulter Reminders: Today (weekday ${currentDayOfWeek}) is not in the configured days [${configData.days.join(', ')}]. Skipping.`);
      return;
    }

    // Check if current hour matches configured hour
    const configHour = parseInt(configData.hour, 10);
    if (currentHour !== configHour) {
      logger.info(`Defaulter Reminders: Current hour (${currentHour}) does not match configured hour (${configHour}). Skipping.`);
      return;
    }

    // Query customers where isDefaulter is true
    const defaultersSnapshot = await db.collection('customers').where('isDefaulter', '==', true).get();

    if (defaultersSnapshot.empty) {
      logger.info("No customers set as defaulter found. Skipping.");
      return;
    }

    // Generate or fetch the weekly template
    const template = await getOrCreateDefaulterSmsTemplate();
    logger.info("Defaulter weekly payment template:", template);

    let sentCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const sentDetails = [];

    const promises = defaultersSnapshot.docs.map(async (doc) => {
      const customerData = doc.data();
      const clientMobile = customerData.mobile || customerData.phone;
      const amountDue = customerData.outstanding || 0;
      const clientName = customerData.name || "Customer";

      if (amountDue <= 0) {
        logger.info(`Skipping defaulter customer ${clientName} because outstanding balance is <= 0.`);
        skippedCount++;
        return;
      }

      if (!clientMobile) {
        logger.warn(`Defaulter customer document ${doc.id} is missing a mobile number.`);
        skippedCount++;
        return;
      }
      
      const message = template
        .replace("{name}", clientName)
        .replace("{amount}", amountDue);

      try {
        await sendBackgroundSms({
          macroUrl: MACRODROID_URL,
          phone: clientMobile,
          message,
        });
        logger.info(`Defaulter payment reminder sent to ${clientName} (${normalizeIndianPhone(clientMobile)})`);
        await doc.ref.update({ 
          lastPaymentReminderSent: admin.firestore.FieldValue.serverTimestamp()
        });
        sentCount++;
        sentDetails.push(`${clientName} (₹${amountDue})`);
      } catch (e) {
        logger.error(`Error sending defaulter payment reminder to ${normalizeIndianPhone(clientMobile)}:`, { error: e.message });
        failCount++;
      }
    });

    await Promise.all(promises);
    logger.info(`Finished processing defaulter payment reminders. Sent: ${sentCount}, Failed: ${failCount}, Skipped: ${skippedCount}`);

    // Alert: Send SMS summary to staff/admin mobile
    if (sentCount > 0 || failCount > 0) {
      const alertMessage = `Defaulter Reminders Job Run Summary:\n- Sent: ${sentCount} reminders [${sentDetails.join(', ')}]\n- Failed: ${failCount}\n- Skipped: ${skippedCount}`;
      try {
        await sendBackgroundSms({
          macroUrl: MACRODROID_URL,
          phone: "919925997750",
          message: alertMessage,
        });
        logger.info("Admin alert SMS sent successfully.");
      } catch (alertErr) {
        logger.error("Error sending admin alert SMS:", alertErr.message);
      }
    }
  } catch (error) {
    logger.error("Error processing weekly defaulter payment reminders:", error);
  }
}

/**
 * Unified Hourly SMS Scheduler
 * Runs hourly from 9 AM to 10 PM India Time (0 9-22 * * *).
 * Centralizes all background scheduled SMS notifications.
 */
exports.hourlySmsScheduler = onSchedule(
  {
    schedule: "0 9-22 * * *",
    region: "asia-south1",
    timeZone: "Asia/Kolkata",
    retryCount: 2,
  },
  async (_event) => {
    logger.info("Starting unified hourly SMS scheduler...");
    const db = admin.firestore();

    try {
      const now = new Date();
      
      const hourFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        hour12: false
      });
      const currentHour = parseInt(hourFormatter.format(now), 10);

      const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        weekday: "short"
      });
      const dayName = weekdayFormatter.format(now);
      const dayMap = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
      const currentDayOfWeek = dayMap[dayName];

      logger.info(`Current local time in India: Weekday ${currentDayOfWeek} (${dayName}), Hour ${currentHour}:00`);

      // Run active reminder checkers concurrently
      await Promise.all([
        processRegularClientReminders(db, currentHour, currentDayOfWeek),
        processDefaulterPaymentReminders(db, currentHour, currentDayOfWeek),
        processDailyStockReportToNilesh(db, currentHour, currentDayOfWeek),
        processDefaulterAlertToStaff(db, currentHour, currentDayOfWeek),
        processDailyGreetings(db, currentHour)
      ]);

      logger.info("Unified hourly SMS scheduler completed.");
    } catch (error) {
      logger.error("Error running unified hourly SMS scheduler:", error);
    }
  }
);

/**
 * Helper to process Daily Stock Report summary to Nilesh
 */
async function processDailyStockReportToNilesh(db, currentHour, currentDayOfWeek) {
  try {
    const configRef = db.collection('config').doc('stockReminder');
    const configDoc = await configRef.get();

    // Default configuration if document doesn't exist
    let enabled = true;
    let configHour = 21; // Default to 9:00 PM
    let days = [0, 1, 2, 3, 4, 5, 6]; // Every day

    if (configDoc.exists) {
      const configData = configDoc.data();
      enabled = !!configData.enabled;
      configHour = parseInt(configData.hour, 10);
      days = Array.isArray(configData.days) ? configData.days : days;
    }

    if (!enabled) {
      logger.info("Stock Summary: Daily stock summary is disabled in config. Skipping.");
      return;
    }

    // Check if today matches configured weekdays
    if (!days.includes(currentDayOfWeek)) {
      logger.info(`Stock Summary: Today (weekday ${currentDayOfWeek}) is not in the configured days [${days.join(', ')}]. Skipping.`);
      return;
    }

    // Check if current hour matches configured hour
    if (currentHour !== configHour) {
      logger.info(`Stock Summary: Current hour (${currentHour}) does not match configured hour (${configHour}). Skipping.`);
      return;
    }

    logger.info('Stock Summary: Generating daily stock report...');

    // Calculate start of today in India timezone (Asia/Kolkata)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    const parts = formatter.formatToParts(new Date())
    const year = parts.find(p => p.type === 'year').value
    const month = parts.find(p => p.type === 'month').value.padStart(2, '0')
    const day = parts.find(p => p.type === 'day').value.padStart(2, '0')
    
    const indiaDateStr = `${year}-${month}-${day}`
    const startOfTodayIndia = new Date(`${indiaDateStr}T00:00:00.000+05:30`)

    // 1. Fetch stock entries since start of today in India
    const stockSnap = await db
      .collection('stock')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startOfTodayIndia))
      .get()

    // 2. Exit early if there are no stock entries today (no movements)
    if (stockSnap.empty) {
      logger.info(`Stock Summary: No stock additions or dispatches found for today (${indiaDateStr}). Skipping report SMS.`);
      return;
    }

    let additions = 0
    let dispatches = 0
    const stockList = []

    stockSnap.forEach((doc) => {
      const data = doc.data()
      const qty = Number(data.qty || 0)
      if (qty > 0) {
        additions += qty
      } else if (qty < 0) {
        dispatches += Math.abs(qty)
      }
      stockList.push({
        id: doc.id,
        qty: Math.abs(qty),
        narration: String(data.narration || ''),
      })
    })

    // 3. Fetch closing stock summary
    const summaryDoc = await db.collection('meta').doc('stockSummary').get()
    const closingStock = summaryDoc.exists ? (Number(summaryDoc.data().totalQty) || 0) : 0

    // 4. Calculate starting stock
    const startingStock = closingStock - additions + dispatches

    // 5. Difference analysis (filtered locally to bypass index requirements)
    const ordersSnap = await db
      .collection('orders')
      .where('date', '==', indiaDateStr)
      .get()

    const deliveredOrders = []
    ordersSnap.forEach((doc) => {
      const data = doc.data()
      if ((data.status || '').toLowerCase() === 'delivered') {
        deliveredOrders.push({
          id: doc.id,
          orderId: data.orderId || doc.id,
          ...data,
        })
      }
    })

    let differencesCount = 0
    deliveredOrders.forEach((order) => {
      const match = stockList.find(
        (se) => se.narration.includes(order.orderId) || se.narration.includes(order.id),
      )
      if (!match) {
        differencesCount++
      }
    })

    // 6. Format SMS message (kept concise to remain under 160 character limit)
    const message = `Anjani Stock Report (${indiaDateStr}): Closing: ${closingStock} boxes. (Start: ${startingStock}, Add: +${additions}, Disp: -${dispatches}). Diff: ${differencesCount}.`

    logger.info(`Stock Summary: Sending stock report to Nilesh: ${message}`)

    // 7. Send via Macrodroid webhook using standardized sendBackgroundSms helper
    try {
      await sendBackgroundSms({
        macroUrl: MACRODROID_URL,
        phone: STAFF_MOBILE,
        message,
      })
      logger.info(`Stock Summary: Stock report SMS successfully sent to Nilesh for ${indiaDateStr}.`)
    } catch (err) {
      logger.error(`Stock Summary: Failed to send stock report webhook: ${err.message}`)
    }
  } catch (error) {
    logger.error("Error processing daily stock report to Nilesh:", error);
  }
}

/**
 * Helper to process Defaulter Staff Alert to Nilesh (or staff)
 * Queries all defaulter customers with outstanding > 0, formats a list,
 * and sends an instruction SMS to STAFF_MOBILE.
 */
async function processDefaulterAlertToStaff(db, currentHour, currentDayOfWeek) {
  try {
    const configRef = db.collection('config').doc('defaulterStaffAlert');
    const configDoc = await configRef.get();

    // Default configuration if document doesn't exist
    let enabled = true;
    let configHour = 11; // Default to 11:00 AM
    let days = [6]; // Default to Saturday

    if (configDoc.exists) {
      const configData = configDoc.data();
      enabled = typeof configData.enabled === 'boolean' ? configData.enabled : enabled;
      configHour = configData.hour !== undefined ? parseInt(configData.hour, 10) : configHour;
      days = Array.isArray(configData.days) ? configData.days : days;
    }

    if (!enabled) {
      logger.info("Defaulter Staff Alert: Disabled in config. Skipping.");
      return;
    }

    // Check if today matches configured weekdays
    if (!days.includes(currentDayOfWeek)) {
      logger.info(`Defaulter Staff Alert: Today (weekday ${currentDayOfWeek}) is not in the configured days [${days.join(', ')}]. Skipping.`);
      return;
    }

    // Check if current hour matches configured hour
    if (currentHour !== configHour) {
      logger.info(`Defaulter Staff Alert: Current hour (${currentHour}) does not match configured hour (${configHour}). Skipping.`);
      return;
    }

    logger.info("Defaulter Staff Alert: Querying defaulter clients...");

    const snapshot = await db
      .collection('customers')
      .where('isDefaulter', '==', true)
      .get();

    if (snapshot.empty) {
      logger.info("Defaulter Staff Alert: No defaulters found. Skipping.");
      return;
    }

    const defaultersList = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const name = data.name || "Customer";
      const outstanding = Number(data.outstanding || 0);
      if (outstanding > 0) {
        defaultersList.push({ name, outstanding });
      }
    });

    if (defaultersList.length === 0) {
      logger.info("Defaulter Staff Alert: No defaulters with outstanding balance > 0. Skipping.");
      return;
    }

    // Format list: "[Name]: Rs [Amount]"
    // Instruction: "Nilesh, call these defaulters to ask for payment & report back:\n[Name]: Rs [Amount]..."
    const listLines = defaultersList.map(c => `${c.name}: Rs ${c.outstanding}`).join('\n');
    const message = `Nilesh, call these defaulters to ask for payment & report back:\n${listLines}`;

    logger.info(`Defaulter Staff Alert: Sending SMS to Nilesh: ${message}`);

    try {
      await sendBackgroundSms({
        macroUrl: MACRODROID_URL,
        phone: STAFF_MOBILE,
        message,
      });
      logger.info("Defaulter Staff Alert: Message successfully sent to Nilesh.");
    } catch (err) {
      logger.error(`Defaulter Staff Alert: Failed to send SMS to Nilesh: ${err.message}`);
    }
  } catch (error) {
    logger.error("Error processing defaulter alert to staff:", error);
  }
}

/**
 * Helper to process daily Birthday and Anniversary greetings.
 * Runs at the configured hour and sends messages if matches today's date in India.
 */
async function processDailyGreetings(db, currentHour) {
  try {
    const configRef = db.collection('config').doc('greetingsConfig');
    const configDoc = await configRef.get();

    // Default configuration if document doesn't exist
    let enabled = true;
    let configHour = 10; // Default to 10:00 AM
    let birthdayTemplate = "Happy Birthday {name}! Wishing you a wonderful day filled with joy, health, and success. - Anjani Water";
    let anniversaryTemplate = "Happy Wedding Anniversary {name}! Wishing you both a lifetime of love, happiness, and companionship. - Anjani Water";

    if (configDoc.exists) {
      const configData = configDoc.data();
      enabled = typeof configData.enabled === 'boolean' ? configData.enabled : enabled;
      configHour = configData.hour !== undefined ? parseInt(configData.hour, 10) : configHour;
      birthdayTemplate = configData.birthdayTemplate || birthdayTemplate;
      anniversaryTemplate = configData.anniversaryTemplate || anniversaryTemplate;
    }

    if (!enabled) {
      logger.info("Daily Greetings: Disabled in config. Skipping.");
      return;
    }

    // Check if current hour matches configured hour
    if (currentHour !== configHour) {
      logger.info(`Daily Greetings: Current hour (${currentHour}) does not match configured hour (${configHour}). Skipping.`);
      return;
    }

    logger.info("Daily Greetings: Checking birthdays and anniversaries...");

    // Get current date in India timezone (Asia/Kolkata)
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(new Date());
    const currentYear = parseInt(parts.find(p => p.type === 'year').value, 10);
    const month = parts.find(p => p.type === 'month').value.padStart(2, '0');
    const day = parts.find(p => p.type === 'day').value.padStart(2, '0');
    const todayMonthDay = `${month}-${day}`; // e.g. "06-04"

    const snapshot = await db.collection('celebrations').get();
    if (snapshot.empty) {
      logger.info("Daily Greetings: No celebrators found. Exiting.");
      return;
    }

    const promises = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const name = data.name || 'Friend';
      const phone = data.phone;
      const birthday = data.birthday || '';
      const anniversary = data.anniversary || '';
      const lastSentBirthdayYear = data.lastSentBirthdayYear || 0;
      const lastSentAnniversaryYear = data.lastSentAnniversaryYear || 0;

      if (!phone) return;

      const birthdayMD = birthday ? birthday.substring(5) : '';
      const anniversaryMD = anniversary ? anniversary.substring(5) : '';

      const updates = {};

      // Check Birthday
      if (birthdayMD === todayMonthDay && lastSentBirthdayYear !== currentYear) {
        const message = birthdayTemplate.replace('{name}', name);
        logger.info(`Daily Greetings: Sending Birthday greeting to ${name} (${phone}): ${message}`);
        try {
          await sendBackgroundSms({
            macroUrl: MACRODROID_URL,
            phone,
            message,
          });
          updates.lastSentBirthdayYear = currentYear;
        } catch (err) {
          logger.error(`Daily Greetings: Failed to send birthday greeting to ${name}: ${err.message}`);
        }
      }

      // Check Anniversary
      if (anniversaryMD === todayMonthDay && lastSentAnniversaryYear !== currentYear) {
        const message = anniversaryTemplate.replace('{name}', name);
        logger.info(`Daily Greetings: Sending Anniversary greeting to ${name} (${phone}): ${message}`);
        try {
          await sendBackgroundSms({
            macroUrl: MACRODROID_URL,
            phone,
            message,
          });
          updates.lastSentAnniversaryYear = currentYear;
        } catch (err) {
          logger.error(`Daily Greetings: Failed to send anniversary greeting to ${name}: ${err.message}`);
        }
      }

      // If any greeting was sent, update the tracking years in database
      if (Object.keys(updates).length > 0) {
        await docSnap.ref.update(updates);
      }
    });

    await Promise.all(promises);
    logger.info("Daily Greetings processing completed.");
  } catch (error) {
    logger.error("Error processing daily greetings:", error);
  }
}

