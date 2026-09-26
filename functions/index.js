const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const { VertexAI } = require('@google-cloud/vertexai')

admin.initializeApp()

const project = process.env.GCLOUD_PROJECT || 'anjaniappnew';
const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
});

const MACRODROID_URL = "https://trigger.macrodroid.com/25efcbac-eb13-4461-ae90-3158ba6c5b90/anjani_sms";
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

  const isBailey =
    (leadData.target_product && String(leadData.target_product).toLowerCase().includes('bailey')) ||
    leadData.source === 'Bailey_Water_Radar' ||
    (leadData.business_type && /restaurant|snack|farsan|dhaba|cafe|food/i.test(leadData.business_type))

  const message = isBailey
    ? 'Need Bailey Water (250ml, 500ml, 1L, 2L bottles & jars) or Anjani 200ml for your outlet at direct bulk distributor rates? Order: https://wa.me/919925997750'
    : 'Vadodara events & business: Serve Anjani 200ml & Bailey Water (250ml, 500ml, 1L, 2L) at direct bulk distributor rates! Order: https://wa.me/919925997750'
  const packet = `${smsPhone}@@@${message}`

  const baseUrl = 'https://trigger.macrodroid.com/25efcbac-eb13-4461-ae90-3158ba6c5b90/anjani_sms'
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
    sku: orderData.sku || orderData.product || 'Anjani 200ml',
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
    'sku',
    'product',
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
  const sSku = sanitizeSmsField(resolved.sku || 'Anjani 200ml')
  const sQty = sanitizeSmsField(resolved.qty)
  const sDate = sanitizeSmsField(resolved.date)
  const sTime = sanitizeSmsField(resolved.time)
  const sAddress = sanitizeSmsField(resolved.address)
  const sLocation = sanitizeSmsField(resolved.location)
  const sMapLink = sanitizeSmsField(resolved.mapLink)

  const message = `${statusHeader} Details:
Client: ${sName}
Mobile: ${sMobile}
SKU: ${sSku}
Qty: ${sQty}
Date: ${sDate}
Time: ${sTime}
Address: ${sAddress}
Location: ${sLocation}
MapLink: ${sMapLink}`

  const pushMessage = `${statusHeader}: ${sQty} ${sSku} for ${sName} at ${sTime} (${sDate}).`

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

  const sSku = sanitizeSmsField(resolved.sku || 'Anjani 200ml')
  const message = `DELIVERY REMINDER (${type}):
Client: ${resolved.name}
Mobile: ${resolved.mobile}
SKU: ${sSku}
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
  const baseUrl = 'https://trigger.macrodroid.com/25efcbac-eb13-4461-ae90-3158ba6c5b90/anjani_sms'
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


// Constants and Helpers for the Follow-Up Logic
const MACRO_URL_FOLLOWUP =
  'https://trigger.macrodroid.com/25efcbac-eb13-4461-ae90-3158ba6c5b90/anjani_sms'
const FOLLOW_UP_DAYS = [20, 45]
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

function buildFollowUpSmsMessage({ reminderDay, lead = {} }) {
  const isBailey =
    (lead.target_product && String(lead.target_product).toLowerCase().includes('bailey')) ||
    lead.source === 'Bailey_Water_Radar' ||
    (lead.business_type && /restaurant|snack|farsan|dhaba|cafe|food/i.test(lead.business_type))

  if (isBailey) {
    return `Sir/Madam, gentle follow-up from Anjani & Bailey Water, Vadodara. Can we supply Bailey (250ml/500ml/1L/2L) or Anjani 200ml for your outlet? Order: https://wa.me/919925997750`
  }

  return `Sir/Madam, gentle follow-up from Anjani & Bailey Water Distributorship, Vadodara. It's been ${reminderDay} day${reminderDay > 1 ? 's' : ''} since our last message. Can we help with your water bottle supply? Order: https://wa.me/919925997750`
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

  const processedMobiles = new Set()

  for (const leadDoc of snap.docs) {
    checked += 1
    const lead = leadDoc.data()
    lead.id = leadDoc.id // For logging
    const mobile = getLeadPhone(lead)
    if (!mobile) {
      skipped += 1
      continue
    }

    const cleanPhone = String(mobile).replace(/\D/g, '')
    const last10 = cleanPhone.slice(-10)

    if (processedMobiles.has(last10)) {
      logger.info(`Duplicate mobile ${last10} found in this follow-up batch. Marking doc ${lead.id} as FOLLOWUP_DONE without sending SMS.`)
      await leadDoc.ref.update({ Tag: 'FOLLOWUP_DONE' })
      markedDone += 1
      continue
    }
    processedMobiles.add(last10)

    const context = getDueReminderContext(lead, now)
    if (!context) {
      skipped += 1
      continue
    }

    if (context.shouldMarkComplete) {
      await leadDoc.ref.update({ Tag: 'FOLLOWUP_DONE' })
      markedDone += 1
      continue
    }

    try {
      await sendBackgroundSms({
        macroUrl: MACRO_URL_FOLLOWUP,
        phone: mobile,
        message: buildFollowUpSmsMessage({
          name: lead.name,
          reminderDay: context.reminderDay,
          lead,
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
  }

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
 * Standalone scheduled job to discover new B2B leads using dynamic festival radar.
 * Runs weekly on Monday at 08:00 AM India Time or can be triggered via console.
 */
exports.discoverLeadsWithAI = onSchedule(
  {
    schedule: '0 8 * * 1',
    timeZone: 'Asia/Kolkata',
    retryCount: 1,
  },
  async () => {
    logger.info('Starting scheduled dynamic AI lead discovery job...')
    const db = admin.firestore()
    await processDynamicLeadDiscovery(db, null, null, true)
  }
)

/**
 * On-demand callable function to trigger Bailey Water potential customer discovery.
 */
exports.triggerBaileyLeadDiscovery = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Authentication required')
  }
  const db = admin.firestore()
  const customConfig = request.data || null
  const result = await processDynamicLeadDiscovery(db, null, null, true, customConfig)
  return result || { success: true, addedCount: 0 }
})

/**
 * Helper to send a notification to a specific user's active device tokens.
 */
async function sendNotificationToUser(
  userId,
  message,
  title = 'Anjani Alert',
  _tag = 'user-notification',
) {
  const db = admin.firestore()
  try {
    const snapshot = await db.collection('userDevices').doc(userId).collection('tokens').get()
    const tokens = []
    snapshot.forEach((doc) => {
      const data = doc.data()
      if (data.token && data.status !== 'invalid') {
        tokens.push(data.token)
      }
    })

    logger.info(`sendNotificationToUser (${userId}): Found ${tokens.length} active tokens.`)

    if (tokens.length === 0) {
      logger.info(`sendNotificationToUser (${userId}): No active tokens found.`)
      return
    }

    const messages = tokens.map((token) => ({
      token,
      notification: { title, body: message },
      data: {
        title,
        body: message,
        click_action: 'https://app1.anjaniwater.in',
      },
    }))

    const response = await admin.messaging().sendEach(messages)
    logger.info(`sendNotificationToUser (${userId}): Successfully sent ${response.successCount} messages; failures: ${response.failureCount}`)
  } catch (error) {
    logger.error(`Error in sendNotificationToUser for user ${userId}:`, error)
  }
}

// --- NOTIFICATION SYSTEM FUNCTIONS ---

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
      if (data.token && data.status !== 'invalid') {
        allTokens.push({ token: data.token, ref: doc.ref })
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

      const messages = tokenChunk.map(({ token }) => ({
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
          headers: {
            Urgency: 'high',
            TTL: '86400',
          },
          notification: {
            title,
            body: displayBody,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            renotify: true,
            tag: tag || 'order-alert',
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
            const errCode = resp.error?.code
            const failedTokenObj = tokenChunk[idx]
            logger.info(
              `Broadcast (${tag}): Token ${failedTokenObj.token.substring(0, 10)}... failed with error: ${errCode}`,
            )
            if (
              errCode === 'messaging/registration-token-not-registered' ||
              errCode === 'messaging/invalid-registration-token'
            ) {
              failedTokenObj.ref
                .update({
                  status: 'invalid',
                  invalidAt: admin.firestore.FieldValue.serverTimestamp(),
                  lastError: errCode,
                })
                .catch((e) => logger.warn('Failed to mark token invalid:', e.message))
            }
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
 * Callable Cloud Function: askAnjaniAi
 * Handles multimodal vendor bill OCR and general assistant queries with strict token caps.
 * Supports hot-swappable models configured in Firestore `config/aiSettings`.
 */
let cachedAiSettings = null
let cachedAiSettingsTime = 0

async function getAiSettings() {
  const now = Date.now()
  if (cachedAiSettings && now - cachedAiSettingsTime < 5 * 60 * 1000) {
    return cachedAiSettings
  }
  try {
    const doc = await admin.firestore().collection('config').doc('aiSettings').get()
    if (doc.exists) {
      cachedAiSettings = doc.data()
    } else {
      cachedAiSettings = {
        activeModel: 'gemini-2.5-flash-lite',
        fallbackModel: 'gemini-2.5-flash',
        maxOutputTokens: 600,
        temperature: 0.15,
      }
    }
  } catch (e) {
    logger.warn('Failed to read config/aiSettings, using default:', e.message)
    cachedAiSettings = {
      activeModel: 'gemini-2.5-flash-lite',
      fallbackModel: 'gemini-2.5-flash',
      maxOutputTokens: 600,
      temperature: 0.15,
    }
  }
  cachedAiSettingsTime = now
  return cachedAiSettings
}

let cachedAiMemories = null
let cachedAiMemoriesTime = 0

async function getAiMemories() {
  const now = Date.now()
  if (cachedAiMemories && now - cachedAiMemoriesTime < 60 * 1000) {
    return cachedAiMemories
  }
  try {
    const snap = await admin
      .firestore()
      .collection('aiMemories')
      .where('active', '==', true)
      .limit(60)
      .get()

    cachedAiMemories = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    logger.warn('Failed to fetch aiMemories in cloud function:', e.message)
    cachedAiMemories = []
  }
  cachedAiMemoriesTime = now
  return cachedAiMemories
}

function formatMemoriesForPrompt(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) return ''
  const active = memories.filter((m) => m && m.active !== false && m.rule)
  if (active.length === 0) return ''

  const categoryHeaders = {
    error_correction: '⚠️ Learned Error Corrections (DO NOT REPEAT THESE MISTAKES)',
    client_rule: '👤 Client & Pricing Rules',
    shorthand: '📖 Shorthand & Slang Mappings',
    staff_rule: '🚚 Staff & Cash Custody Rules',
    operational: '⏱️ Delivery & Route Operations',
    general_rule: '📌 Business Directives',
  }

  const grouped = {}
  for (const m of active) {
    const cat = m.category || 'general_rule'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(m.rule)
  }

  let output = '\n\n## 🧠 PERMANENT BUSINESS MEMORIES & LEARNED ERROR CORRECTIONS (STRICTLY ENFORCE):\n'
  output += 'The owner (Jignesh Pandya) has trained you with these persistent rules and past error corrections. You MUST obey every single rule below and avoid repeating past errors:\n\n'

  for (const [cat, rules] of Object.entries(grouped)) {
    output += `### ${categoryHeaders[cat] || cat.toUpperCase()}:\n`
    rules.forEach((r, idx) => {
      output += `${idx + 1}. ${r}\n`
    })
    output += '\n'
  }

  return output.trimEnd()
}

/**
 * Context-Targeted Rule Slicing (Cost & Token Optimizer)
 * Prevents prompt bloat and saves tokens by prioritizing relevant rules for the query.
 */
function sliceMemoriesForContext(memories = [], queryText = '', mode = 'auto') {
  if (!Array.isArray(memories) || memories.length === 0) return []
  const active = memories.filter((m) => m && m.active !== false && m.rule)
  if (active.length <= 15) return active

  const qLower = String(queryText || '').toLowerCase()
  const selected = []
  const remaining = []

  for (const m of active) {
    const struct = m.structured || {}
    const ruleLower = String(m.rule || '').toLowerCase()

    // 1. Always prioritize error corrections
    if (m.category === 'error_correction' || m.isCorrection) {
      selected.push(m)
      continue
    }

    // 2. Client-targeted match
    if (
      struct.clientName &&
      (qLower.includes(struct.clientName.toLowerCase()) || ruleLower.includes(qLower))
    ) {
      selected.push(m)
      continue
    }

    // 3. Shorthand mappings if relevant
    if (m.category === 'shorthand' && (mode === 'sales' || mode === 'auto')) {
      selected.push(m)
      continue
    }

    remaining.push(m)
  }

  while (selected.length < 20 && remaining.length > 0) {
    selected.push(remaining.shift())
  }

  return selected
}

function formatSkuSlangForPrompt() {
  return `\n\n## 🍶 BEVERAGE & PRODUCT SLANG DICTIONARY (INDIAN DISTRIBUTION):
- "petli", "petly", "patli": Anjani 200ml box (or bottle box). Default unit: Box.
- "chhota botal", "chhoti", "mini", "250ml": Bailey 250ml (Case / Box).
- "500ml", "aadho liter", "half liter", "500": Bailey 500ml (Case / Box).
- "1 liter", "1L", "badi botal", "ek liter": Bailey 1 Liter (Case / Box).
- "2 liter", "2L", "jumbo", "family pack": Bailey 2 Liter (Case / Box).
- "kedi", "crate", "khokhu", "case", "box": Box unit.
When parsing voice speech or shorthand notes containing these words, resolve them to the standard product labels above.\n`
}

let cachedKnownCustomerNames = null
let cachedKnownCustomersTime = 0

async function getKnownCustomerNames() {
  const now = Date.now()
  if (cachedKnownCustomerNames && now - cachedKnownCustomersTime < 5 * 60 * 1000) {
    return cachedKnownCustomerNames
  }
  try {
    const snap = await admin
      .firestore()
      .collection('customers')
      .where('active', '!=', false)
      .limit(300)
      .get()
    cachedKnownCustomerNames = snap.docs.map((d) => d.data().name).filter(Boolean)
  } catch (e) {
    logger.warn('Failed to load known customers in cloud function:', e.message)
    cachedKnownCustomerNames = []
  }
  cachedKnownCustomersTime = now
  return cachedKnownCustomerNames
}

function formatKnownClientsForPrompt(clientNames = []) {
  if (!Array.isArray(clientNames) || clientNames.length === 0) return ''
  const uniqueNames = Array.from(new Set(clientNames.filter(Boolean))).slice(0, 150)
  if (uniqueNames.length === 0) return ''

  let block = '\n\n## 👥 KNOWN EXISTING CUSTOMERS / CLIENT MASTER (STRICT REUSE & DEDUPLICATION):\n'
  block += 'Annapurna already has these registered customers in the system:\n'
  block += uniqueNames.map((n) => `• "${n}"`).join(', ') + '\n\n'
  block += 'MANDATORY CLIENT MATCHING & PHONETIC DEDUPLICATION RULES:\n'
  block += '1. PHONETIC & SPELLING VARIATION MATCHING: If the user dictates or writes a name that is phonetically or functionally identical to any existing customer above (e.g., "Sandeep" vs "Sandip", "Pradeep" vs "Pradip", "Rohit" vs "Rohitbhai", "Jay Ambe" vs "Jay Ambe Provision Store"), you MUST output the EXACT canonical name from the KNOWN EXISTING CUSTOMERS list above.\n'
  block += '2. NEVER CREATE A SLIGHTLY DIFFERENT SPELLING: Do NOT invent or output "Sandeep" if "Sandip" exists in the known customer list. Output "Sandip".\n'
  block += '3. Only output a new customer name if the business or person is genuinely new and does not match any existing customer above.\n'
  return block
}

exports.askAnjaniAi = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Authentication required')
  }

  const {
    text,
    imageBase64,
    mimeType = 'image/jpeg',
    mode = 'auto',
    conversationHistory = [],
    knownClients = [],
  } = request.data || {}

  if (!text && !imageBase64) {
    throw new Error('Either text prompt or image is required')
  }

  // Anti-abuse payload guard: reject oversized base64 (> 3MB)
  if (imageBase64 && imageBase64.length > 3 * 1024 * 1024) {
    throw new Error('Image too large. Please upload an image under 2MB.')
  }

  const aiSettings = await getAiSettings()
  const activeMemories = await getAiMemories()
  const slicedMemories = sliceMemoriesForContext(activeMemories, text, mode)
  const memoriesBlock = formatMemoriesForPrompt(slicedMemories)
  const skuSlangBlock = formatSkuSlangForPrompt()
  const clientNames =
    Array.isArray(knownClients) && knownClients.length > 0
      ? knownClients
      : await getKnownCustomerNames()
  const knownClientsBlock = formatKnownClientsForPrompt(clientNames)
  const contextInjections = `${memoriesBlock}${skuSlangBlock}${knownClientsBlock}`
  const primaryModelName = aiSettings.activeModel || 'gemini-2.5-flash-lite'
  const fallbackModelName = aiSettings.fallbackModel || 'gemini-2.5-flash'
  const chatMaxTokens = Math.min(Number(aiSettings.maxOutputTokens) || 800, 1500)
  const jsonMaxTokens = 3500
  const temperature = Number(aiSettings.temperature) || 0.15

  const parseStructuredJson = (rawJson) => {
    let clean = String(rawJson || '').replace(/^```json\s*|\s*```$/g, '').trim()
    try {
      return JSON.parse(clean)
    } catch (_pe) {
      // Auto-repair if output was truncated mid-array
      const lastBrace = clean.lastIndexOf('}')
      if (lastBrace !== -1) {
        const candidate = clean.slice(0, lastBrace + 1)
        const attempts = [candidate + ']}', candidate + ']', candidate + '}']
        for (const att of attempts) {
          try {
            return JSON.parse(att)
          } catch (_e) {
            // ignore and try next repair attempt
          }
        }
      }
      throw _pe
    }
  }

  const DIGIT_MAP = {
    '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4',
    '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9',
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  }

  const normalizeDigits = (str) => {
    if (!str) return ''
    let out = String(str)
    for (const [k, v] of Object.entries(DIGIT_MAP)) {
      out = out.split(k).join(v)
    }
    return out
  }

  const transliterateIndic = (str) => {
    if (!str) return ''
    let out = normalizeDigits(str)
    const vocab = [
      [/ચાર\s*રસ્તા/gi, 'Char Rasta'],
      [/ચાર\s*રાસ્તા/gi, 'Char Rasta'],
      [/શાક\s*માર્કેટ|શાકભાજી\s*માર્કેટ/gi, 'Vegetable Market'],
      [/સુપર\s*માર્કેટ|સુપરમાર્કેટ/gi, 'Super Market'],
      [/પ્રોવિઝન\s*સ્ટોર્સ?/gi, 'Provision Store'],
      [/જનરલ\s*સ્ટોર્સ?/gi, 'General Store'],
      [/કિરાણા\s*સ્ટોર્સ?/gi, 'Kirana Store'],
      [/દુકાન\s*નં(?:\.|\s*|બર)/gi, 'Shop No. '],
      [/આઈસ્ક્રીમ|આઇસ્ક્રીમ/gi, 'Ice Cream'],
      [/ડેરી\s*ફાર્મ/gi, 'Dairy Farm'],
      [/શ્રી|श्री/g, 'Shree '],
      [/જય\s*અંબે|જયઅંબે|जय\s*अम्बे/gi, 'Jay Ambe '],
      [/અંબે|अम्બે/gi, 'Ambe'],
      [/મહાદેવ|महादेव/gi, 'Mahadev'],
      [/ગણેશ|गणेश/gi, 'Ganesh'],
      [/બાલાજી|बालाजी/gi, 'Balaji'],
      [/હનુમાન|हनुमान/gi, 'Hanuman'],
      [/શિવ\s*શક્તિ|शिव\s*शक्ति/gi, 'Shiv Shakti'],
      [/રાધા\s*કૃષ્ણ|राधा\s*कृष्ण/gi, 'Radha Krishna'],
      [/પ્રોવિઝન|પ્રોવિજન/gi, 'Provision'],
      [/કિરાણા/gi, 'Kirana'],
      [/સુપર|सुपर/gi, 'Super'],
      [/સ્ટોર[્સાં]*|સ્ટોર્સ/gi, 'Store'],
      [/રેસ્ટોરન્ટ|રેસ્ટોરેન્ટ/gi, 'Restaurant'],
      [/હોટેલ|હોટલ/gi, 'Hotel'],
      [/ડેરી/gi, 'Dairy'],
      [/પાર્લર/gi, 'Parlour'],
      [/એન્ટરપ્રાઈઝ|એન્ટરપ્રાઇઝ/gi, 'Enterprise'],
      [/ટ્રેડર્સ|ટ્રેડિંગ/gi, 'Traders'],
      [/એજન્સી[સઝ]?/gi, 'Agency'],
      [/મેડિકલ/gi, 'Medical'],
      [/સામે/gi, 'Opp.'],
      [/પાસે|નજીક/gi, 'Near'],
      [/પાછળ/gi, 'Behind'],
      [/રોડ|માર્ગ/gi, 'Road'],
      [/સર્કલ/gi, 'Circle'],
      [/સોસાયટી/gi, 'Society'],
      [/નગર/gi, 'Nagar'],
      [/કોમ્પ્લેક્સ/gi, 'Complex'],
      [/પ્લાઝા/gi, 'Plaza'],
      [/સેન્ટર/gi, 'Center'],
      [/દુકાન/gi, 'Shop'],
      [/માંજલપુર/gi, 'Manjalpur'],
      [/વડોદરા/gi, 'Vadodara'],
      [/મકરપુરા/gi, 'Makarpura'],
      [/ગોરવા/gi, 'Gorwa'],
      [/અલકાપુરી/gi, 'Alkapuri'],
      [/સુભાનપુરા/gi, 'Subhanpura'],
      [/વાઘોડિયા|વાઘોડીયા/gi, 'Waghodia'],
      [/ગોત્રી/gi, 'Gotri'],
      [/વાસણા/gi, 'Vasna'],
      [/તરસાળી/gi, 'Tarsali'],
      [/કારેલીબાગ/gi, 'Karelibaug'],
      [/અને/gi, '&'],
      [/પટેલ/gi, 'Patel'],
      [/શાહ/gi, 'Shah'],
      [/જોષી|જોશી/gi, 'Joshi'],
      [/પંડ્યા/gi, 'Pandya'],
      [/ભાઈ|ભાઇ/gi, 'bhai'],
      [/બેન|બહેન/gi, 'ben'],
      [/કુમાર/gi, 'kumar'],
    ]
    for (const [pattern, repl] of vocab) {
      out = out.replace(pattern, repl)
    }

    const charMap = {
      '\u0A85': 'a', '\u0A86': 'aa', '\u0A87': 'i', '\u0A88': 'ee', '\u0A89': 'u', '\u0A8A': 'oo',
      '\u0A8B': 'ru', '\u0A8F': 'e', '\u0A90': 'ai', '\u0A93': 'o', '\u0A94': 'au',
      '\u0A95': 'k', '\u0A96': 'kh', '\u0A97': 'g', '\u0A98': 'gh', '\u0A99': 'ng',
      '\u0A9A': 'ch', '\u0A9B': 'chh', '\u0A9C': 'j', '\u0A9D': 'z', '\u0A9E': 'ny',
      '\u0A9F': 't', '\u0AA0': 'th', '\u0AA1': 'd', '\u0AA2': 'dh', '\u0AA3': 'n',
      '\u0AA4': 't', '\u0AA5': 'th', '\u0AA6': 'd', '\u0AA7': 'dh', '\u0AA8': 'n',
      '\u0AAA': 'p', '\u0AAB': 'f', '\u0AAC': 'b', '\u0AAD': 'bh', '\u0AAE': 'm',
      '\u0AAF': 'y', '\u0AB0': 'r', '\u0AB2': 'l', '\u0AB3': 'l', '\u0AB5': 'v',
      '\u0AB6': 'sh', '\u0AB7': 'sh', '\u0AB8': 's', '\u0AB9': 'h',
      '\u0ABE': 'a', '\u0ABF': 'i', '\u0AC0': 'i', '\u0AC1': 'u', '\u0AC2': 'u',
      '\u0AC3': 'ru', '\u0AC4': 'ru', '\u0AC7': 'e', '\u0AC8': 'ai', '\u0ACB': 'o', '\u0ACC': 'au',
      '\u0A82': 'n', '\u0A81': 'n', '\u0A83': 'h',
      '\u0905': 'a', '\u0906': 'aa', '\u0907': 'i', '\u0908': 'ee', '\u0909': 'u', '\u090A': 'oo',
      '\u090B': 'ru', '\u090F': 'e', '\u0910': 'ai', '\u0913': 'o', '\u0914': 'au',
      '\u0915': 'k', '\u0916': 'kh', '\u0917': 'g', '\u0918': 'gh', '\u0919': 'ng',
      '\u091A': 'ch', '\u091B': 'chh', '\u091C': 'j', '\u091D': 'jh', '\u091E': 'ny',
      '\u091F': 't', '\u0920': 'th', '\u0921': 'd', '\u0922': 'dh', '\u0923': 'n',
      '\u0924': 't', '\u0925': 'th', '\u0926': 'd', '\u0927': 'dh', '\u0928': 'n',
      '\u092A': 'p', '\u092B': 'f', '\u092C': 'b', '\u092D': 'bh', '\u092E': 'm',
      '\u092F': 'y', '\u0930': 'r', '\u0932': 'l', '\u0935': 'v',
      '\u0936': 'sh', '\u0937': 'sh', '\u0938': 's', '\u0939': 'h',
      '\u093E': 'a', '\u093F': 'i', '\u0940': 'i', '\u0941': 'u', '\u0942': 'u',
      '\u0943': 'ru', '\u0947': 'e', '\u0948': 'ai', '\u094B': 'o', '\u094C': 'au',
      '\u0902': 'n', '\u0901': 'n', '\u0903': 'h',
    }

    const isCons = (c) => (c >= '\u0A95' && c <= '\u0AB9') || (c >= '\u0915' && c <= '\u0939')
    const isMtr = (c) => (c >= '\u0ABE' && c <= '\u0ACC') || (c >= '\u093E' && c <= '\u094C')
    const isVir = (c) => c === '\u0ACD' || c === '\u094D'

    let res = ''
    for (let i = 0; i < out.length; i++) {
      const ch = out[i]
      const next = out[i + 1]
      if (charMap[ch]) {
        res += charMap[ch]
        if (isCons(ch) && next && !isVir(next) && !isMtr(next) && !/[\s,.;:!?'"()[\]{}/\\-]/.test(next)) {
          res += 'a'
        }
      } else if (!isVir(ch)) {
        res += ch
      }
    }
    return res
      .replace(/[^\x20-\x7E\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b[a-z]/g, (l) => l.toUpperCase())
  }

  const toEnglish = (val) => {
    if (!val) return ''
    const norm = normalizeDigits(val)
    if (/[\u0900-\u0DFF]/.test(norm)) {
      return transliterateIndic(norm)
    }
    return String(norm).replace(/\s+/g, ' ').trim()
  }

  const ensureEnglishClient = (cli) => {
    if (!cli || typeof cli !== 'object') return cli
    return {
      ...cli,
      name: toEnglish(cli.name),
      contactPerson: toEnglish(cli.contactPerson),
      address: toEnglish(cli.address),
      location: toEnglish(cli.location || cli.address),
      mobile: normalizeDigits(cli.mobile || cli.phone || '').replace(/\D/g, ''),
      alternateMobile: normalizeDigits(cli.alternateMobile || '').replace(/\D/g, ''),
      notes: toEnglish(cli.notes),
    }
  }

  const tryGenerate = async (modelName) => {
    if (imageBase64) {
      const model = vertexAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: jsonMaxTokens,
          temperature,
          responseMimeType: 'application/json',
        },
      })

      const documentOcrPrompt = `You are an expert document and invoice OCR AI for Annapurna Foods, authorized water distributor in Vadodara, Gujarat (owned by Jignesh Pandya).
Analyze this image. It is either:
1. "retail_sales": A handwritten retail sales notepad, diary page, dispatch memo, or daily customer delivery note containing multiple customer orders, quantities, and payment notes.
2. "vendor_bill": A vendor delivery challan, factory tax invoice, or supplier stock inward receipt.
3. "accounts_cash": A staff cash settlement slip, daily cash sheet, handover note, customer collection slip, or route expense memo.
4. "create_client": A customer bill book, estimate book, cash memo header, visiting card, business card, shop signboard, contact card, or customer pamphlet.

Map all water products EXCLUSIVELY to our 5 canonical SKUs:
1. "Anjani 200ml" (unit: Box)
2. "Bailey 250ml" (unit: Case / Box)
3. "Bailey 500ml" (unit: Case / Box)
4. "Bailey 1 Liter" (unit: Case / Box)
5. "Bailey 2 Liter" (unit: Case / Box)

If it is a retail sales notepad / customer delivery list:
IMPORTANT RULES:
1. RETAIL CONSOLIDATION: All walk-in, cash counter, unnamed, or retail customer sales MUST BE CONSOLIDATED INTO A SINGLE order with "clientName": "Retail". NEVER create multiple separate "Retail" sales entries. Regular named business customers (e.g., specific shop names like "Jay Ambe Provision", "Rohitbhai") each get their own separate order.
2. DIFFERENT RATES MUST REMAIN SEPARATE LINE ITEMS: If the same SKU is sold at different rates (for example: "Bailey 1 Liter 10 @ 120" and "Bailey 1 Liter 5 @ 125"), DO NOT merge them! Keep each distinct rate as its own item in the "items" array with its exact qty and rate. Only combine items if BOTH the SKU and the unit rate are identical.

Return strict JSON:
{
  "docType": "retail_sales",
  "summary": {
    "totalOrders": number,
    "totalQty": number,
    "date": string (YYYY-MM-DD or as written)
  },
  "sales": [
    {
      "clientName": string (customer or shop name; for unknown, walk-in, or unnamed retail buyers, use "Retail"),
      "mobile": string (if written, else ""),
      "items": [
        {
          "sku": "Anjani 200ml" | "Bailey 250ml" | "Bailey 500ml" | "Bailey 1 Liter" | "Bailey 2 Liter",
          "qty": number (positive integer),
          "rate": number (unit rate if written, else 0),
          "unit": "Box" | "Case / Box"
        }
      ],
      "totalAmount": number (total amount if stated, else 0),
      "paymentMode": "cash" | "online" | "credit" (cash if cash/rokda/paid, online if gpay/upi, credit if udhar/baaki/due/pending or unspecified),
      "amountCollected": number (if cash/online, else 0),
      "notes": string
    }
  ]
}

If it is a staff cash handover / collection / accounts note:
Available accounts: "nilesh" (delivery staff), "hiteshbhai" (delivery staff), "counter" (drawer / Jigneshbhai), "bank" (Bank / UPI).
Return strict JSON:
{
  "docType": "accounts_cash",
  "summary": {
    "totalInward": number,
    "totalOutward": number,
    "entryCount": number,
    "date": string (YYYY-MM-DD or as written)
  },
  "entries": [
    {
      "type": "transfer" | "collection" | "expense",
      "fromAccount": "nilesh" | "hiteshbhai" | "counter" | "bank",
      "toAccount": "counter" | "bank" | "nilesh" | "hiteshbhai",
      "accountId": "nilesh" | "hiteshbhai" | "counter" | "bank",
      "clientName": string (customer or shop name if collection, else ""),
      "category": string (e.g. "Fuel / Petrol", "Vehicle Maintenance", "Tea / Refreshments", "General"),
      "amount": number,
      "notes": string
    }
  ]
}

If it is a vendor inward delivery bill / factory challan:
Return strict JSON:
{
  "docType": "vendor_bill",
  "vendorName": string,
  "billNumber": string,
  "billDate": string,
  "items": [
    {
      "sku": "Anjani 200ml" | "Bailey 250ml" | "Bailey 500ml" | "Bailey 1 Liter" | "Bailey 2 Liter",
      "qty": number,
      "unit": "Box" | "Case / Box"
    }
  ],
  "totalAmount": number,
  "notes": string
}

If it is a customer payment receipt, UPI payment screenshot (Google Pay, PhonePe, Paytm, BHIM, Bank transfer), or cheque:
Return strict JSON:
{
  "docType": "receive_payment",
  "payerName": string,
  "amount": number,
  "paymentMode": "online" | "cash" | "cheque",
  "onlineProvider": "GPay" | "PhonePe" | "Paytm" | "UPI" | "Bank",
  "utr": string,
  "date": string,
  "notes": string
}

If it is a customer bill book, estimate book, cash memo header, visiting card, business card, shop signboard, contact card, or retail customer pamphlet:
Return strict JSON:
{
  "docType": "create_client",
  "name": string,
  "contactPerson": string,
  "mobile": string,
  "alternateMobile": string,
  "address": string,
  "location": string,
  "rate": number,
  "notes": string
}
CRITICAL REQUIREMENT: ALL CLIENT INFORMATION ("name", "contactPerson", "address", "location", "notes") MUST BE IN ENGLISH (Latin alphabet / Roman script) ONLY, even if the card, signboard, or paper is in Gujarati, Hindi, Marathi, or any other language! Translate descriptive words and transliterate shop/person/area names into clean English Title Case. Convert all Indic digits (૦-૯ or ०-९) to standard digits 0-9. NEVER return Gujarati or Devanagari characters in client fields.`

      let ocrPrompt = documentOcrPrompt

      if (mode === 'create_client') {
        ocrPrompt = `You are an expert customer onboarding and OCR AI for Annapurna Foods, authorized water distributor in Vadodara, Gujarat (owned by Jignesh Pandya).
The user wants to ONBOARD / CREATE A NEW CLIENT from this photo.
The photo is a customer document or shop photo:
- A customer's bill book, estimate book, cash memo, invoice header, or receipt pad (common in Hindi, Gujarati, or English, showing shop/business name, proprietor name, address, GSTIN, phone numbers).
- A visiting card, business card, trade pamphlet, or leaflet.
- A shop signboard, banner, flex board, or shop front.

CRITICAL INSTRUCTION:
Do NOT create an order, sale, or bill! Extract the SHOP/CUSTOMER details to register them as a new client in the client master.
Look at the top masthead / header / title of the bill book or card to find the shop name, owner name, phone number, and address.

Return strict JSON:
{
  "docType": "create_client",
  "name": string (Shop, store, hotel, or customer business name in English Title Case. Extracted from the bill book masthead or card header),
  "contactPerson": string (Owner, proprietor, or contact person name in English),
  "mobile": string (Primary 10-digit mobile number, digits 0-9 only),
  "alternateMobile": string (Secondary phone number if present, digits 0-9 only),
  "address": string (Shop address, market, street, or area in English),
  "location": string (Landmark, city, or area in English, e.g. 'Manjalpur', 'Karelibaug', 'Waghodia Road', 'Vadodara'),
  "rate": number (Default 200ml rate per unit if written on slip, else 0),
  "notes": string (in English, include GSTIN or bill book details if found)
}

CRITICAL REQUIREMENT: ALL CLIENT INFORMATION ("name", "contactPerson", "address", "location", "notes") MUST BE RETURNED IN ENGLISH (Latin alphabet / Roman script) ONLY!
Even if the bill book, signboard, or card is in Hindi (देवनागरी), Gujarati (ગુજરાતી), or Marathi:
- Transliterate and translate all business names, person names, and addresses into clean English in Title Case (e.g. 'श्री गणेश किराना स्टोर' -> 'Shree Ganesh Kirana Store', 'अशोक कुमार' -> 'Ashok Kumar', 'माणेक चौक' -> 'Manek Chowk', 'सब्जी मंडी' -> 'Vegetable Market').
- Convert any Hindi (०-९) or Gujarati (૦-૯) numerals into standard English digits (0-9).
- NEVER return Devanagari or Gujarati characters in client fields.
- Do NOT generate orders, sales, or bills. The ONLY goal is onboarding this business as a new client.`
      } else if (mode === 'receive_payment') {
        ocrPrompt = `You are an expert payment receipt and UPI OCR AI for Annapurna Foods in Vadodara, Gujarat.
The user wants to RECORD A PAYMENT from this photo (UPI screenshot from Google Pay, PhonePe, Paytm, BHIM, Bank transfer receipt, cash counter slip, or cheque).
Return strict JSON:
{
  "docType": "receive_payment",
  "payerName": string (Customer or shop name who made the payment),
  "amount": number (Total payment amount in INR),
  "paymentMode": "online" | "cash" | "cheque",
  "onlineProvider": "GPay" | "PhonePe" | "Paytm" | "UPI" | "Bank",
  "utr": string (UPI transaction ID, UTR, reference number, or cheque number),
  "date": string (YYYY-MM-DD or as shown),
  "notes": string
}`
      }

      const isAudio = mimeType && mimeType.startsWith('audio/')
      if (isAudio) {
        if (mode === 'create_client') {
          ocrPrompt = `You are an expert customer onboarding and transcription AI for Annapurna Foods in Vadodara, Gujarat (owned by Jignesh Pandya).
Listen to this audio voice note or recording spoken in Gujarati, Hindi, English, or mixed language.
The user is dictating or forwarding customer details for onboarding a new client.
Extract into strict JSON:
{
  "docType": "create_client",
  "name": string (Shop, business, or customer name in English Title Case),
  "contactPerson": string (Owner or contact person name in English),
  "mobile": string (10-digit mobile number, digits 0-9 only),
  "alternateMobile": string (digits 0-9 only),
  "address": string (Shop address/area in English),
  "location": string (Landmark/area in English, e.g. 'Manjalpur', 'Karelibaug'),
  "rate": number (Default 200ml rate if mentioned, else 0),
  "notes": string (in English)
}
CRITICAL REQUIREMENT: Return all client fields strictly in English (Latin alphabet). Transliterate Gujarati/Hindi names into English Title Case.`
        } else if (mode === 'receive_payment') {
          ocrPrompt = `You are an accounts and payment assistant for Annapurna Foods in Vadodara, Gujarat.
Listen to this audio recording or WhatsApp voice note spoken in Gujarati, Hindi, or English.
The speaker is reporting a payment received.
Parse into strict JSON:
{
  "docType": "receive_payment",
  "payerName": string (Customer or shop name who paid),
  "amount": number (Payment amount in INR),
  "paymentMode": "online" | "cash" | "cheque",
  "onlineProvider": "GPay" | "PhonePe" | "Paytm" | "UPI" | "Bank",
  "utr": string (UTR, reference number, or cheque no if mentioned, else ""),
  "date": string (YYYY-MM-DD or today),
  "notes": string
}`
        } else {
          ocrPrompt = `You are an expert sales and operational voice assistant for Annapurna Foods, authorized water distributor in Vadodara, Gujarat (owned by Jignesh Pandya).
Listen to this audio recording or WhatsApp voice note spoken in Gujarati, Hindi, or English.
The speaker is placing water orders, dictating sales, or reporting operational notes.
Map all water items exclusively to our 5 canonical SKUs: "Anjani 200ml", "Bailey 250ml", "Bailey 500ml", "Bailey 1 Liter", "Bailey 2 Liter".
Return strict JSON:
{
  "docType": "retail_sales",
  "summary": { "totalOrders": number, "totalQty": number, "date": string },
  "sales": [
    {
      "clientName": string (Shop or customer name in English, or "Retail"),
      "mobile": string,
      "items": [
        {
          "sku": "Anjani 200ml" | "Bailey 250ml" | "Bailey 500ml" | "Bailey 1 Liter" | "Bailey 2 Liter",
          "qty": number,
          "rate": number,
          "unit": "Box" | "Case / Box"
        }
      ],
      "totalAmount": number,
      "paymentMode": "cash" | "online" | "credit",
      "amountCollected": number,
      "notes": string
    }
  ]
}`
        }
      }

      const parts = [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg',
          },
        },
        { text: ocrPrompt + contextInjections },
      ]

      const res = await model.generateContent({
        contents: [{ role: 'user', parts }],
      })

      const rawJson = res.response.candidates[0].content.parts[0].text.trim()
      const parsedData = parseStructuredJson(rawJson)

      if (
        mode === 'create_client' ||
        parsedData.docType === 'create_client'
      ) {
        let clientData = { ...parsedData }
        // Fallback recovery if Gemini still returned a sales order format for a bill book:
        if (!clientData.name && Array.isArray(parsedData.sales) && parsedData.sales.length > 0) {
          const first = parsedData.sales[0]
          clientData = {
            docType: 'create_client',
            name: first.clientName && first.clientName !== 'Retail' ? first.clientName : 'New Client',
            contactPerson: '',
            mobile: first.mobile || '',
            alternateMobile: '',
            address: first.notes || '',
            location: '',
            rate: first.items?.[0]?.rate || 0,
            notes: first.notes || 'Extracted from bill book photo',
          }
        }
        if (clientData.name || mode === 'create_client') {
          return {
            type: 'create_client',
            modelUsed: modelName,
            data: ensureEnglishClient(clientData),
          }
        }
      }

      if (
        mode === 'receive_payment' ||
        parsedData.docType === 'receive_payment' ||
        (Number(parsedData.amount) > 0 && (parsedData.payerName || parsedData.utr) && !Array.isArray(parsedData.sales))
      ) {
        return {
          type: 'receive_payment',
          modelUsed: modelName,
          data: parsedData,
        }
      }

      if (
        parsedData.docType === 'retail_sales' ||
        (Array.isArray(parsedData.sales) && parsedData.sales.length > 0)
      ) {
        return {
          type: 'retail_sales',
          modelUsed: modelName,
          data: parsedData,
        }
      }

      if (
        parsedData.docType === 'create_client' ||
        (parsedData.name && (parsedData.mobile || parsedData.address))
      ) {
        return {
          type: 'create_client',
          modelUsed: modelName,
          data: ensureEnglishClient(parsedData),
        }
      }

      if (
        parsedData.docType === 'accounts_cash' ||
        (Array.isArray(parsedData.entries) && parsedData.entries.length > 0)
      ) {
        return {
          type: 'accounts_cash',
          modelUsed: modelName,
          data: parsedData,
        }
      }

      return {
        type: 'vendor_bill',
        modelUsed: modelName,
        data: parsedData,
      }
    } else {
      // Text mode
      const rawText = String(text || '').trim()

      // Check if this is an accounts & staff cash entry
      const isExplicitAccounts = mode === 'accounts_cash' || mode === 'accounts'
      const hasAccountsKeywords =
        /(?:handover|jama|lidha|aapy[ao]|aapya|transfer|petrol|diesel|kharch|expense|hitesh|nilesh)\b/i.test(rawText) &&
        /\d+/.test(rawText)
      const hasSkuKeywords = /(?:200ml|250ml|500ml|1\s*l|2\s*l|peti|box\b|cases?\b)/i.test(rawText)
      const isAccountsNotes = isExplicitAccounts || (hasAccountsKeywords && !hasSkuKeywords)

      if (isAccountsNotes) {
        const model = vertexAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: jsonMaxTokens,
            temperature,
            responseMimeType: 'application/json',
          },
        })

        const accountsCashPrompt = `You are an expert accounts & staff cash custody assistant for Annapurna Foods in Vadodara, Gujarat (owned by Jignesh Pandya).
The user provided staff cash notes, handovers, customer collections, or route expenses (in English, Gujarati, or Gujlish).
Available accounts:
1. "nilesh": Delivery staff Nilesh's cash custody
2. "hiteshbhai": Delivery staff Hiteshbhai's cash custody
3. "counter": Counter Cash Drawer / Jigneshbhai
4. "bank": Bank / UPI / Online

Parse each transaction into structured JSON:
{
  "docType": "accounts_cash",
  "summary": {
    "totalInward": number,
    "totalOutward": number,
    "entryCount": number,
    "date": string (YYYY-MM-DD or today)
  },
  "entries": [
    {
      "type": "transfer" | "collection" | "expense",
      "fromAccount": "nilesh" | "hiteshbhai" | "counter" | "bank",
      "toAccount": "counter" | "bank" | "nilesh" | "hiteshbhai",
      "accountId": "nilesh" | "hiteshbhai" | "counter" | "bank",
      "clientName": string (customer or shop name if collection, else ""),
      "category": string (e.g. "Fuel / Petrol", "Vehicle Maintenance", "Tea / Refreshments", "General"),
      "amount": number (positive number),
      "notes": string
    }
  ]
}

Classification Rules:
1. "transfer" (Cash Handover / Transfer between accounts):
   - When delivery staff (Nilesh or Hiteshbhai) hands over cash to Counter / Jignesh / Owner -> type: "transfer", fromAccount: "nilesh" or "hiteshbhai", toAccount: "counter".
   - When cash is deposited into Bank / UPI from Counter or Staff -> type: "transfer", fromAccount: "counter" (or staff), toAccount: "bank".
2. "collection" (Money collected from customer / shop):
   - When cash/payment is collected from a customer / shop (e.g. "Nilesh collected 2000 from Jay Ambe") -> type: "collection", accountId: "nilesh" (or staff name), clientName: "Jay Ambe".
3. "expense" (Expense or petty cash spent by staff):
   - Petrol, diesel, tea, repair, or food paid by staff on route -> type: "expense", accountId: staff name (or "counter"), category: appropriate category (e.g. "Fuel / Petrol").

Notes:
${rawText.slice(0, 3000)}`

        try {
          const res = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: accountsCashPrompt + contextInjections }] }],
          })
          const rawJson = res.response.candidates[0].content.parts[0].text.trim()
          const parsedData = parseStructuredJson(rawJson)

          if (Array.isArray(parsedData.entries) && parsedData.entries.length > 0) {
            return {
              type: 'accounts_cash',
              modelUsed: modelName,
              data: parsedData,
            }
          }
        } catch (parseErr) {
          logger.warn('Failed to parse accounts notes as JSON, falling back to chat:', parseErr.message)
        }
      }

      // 1. Check for client creation intent in text (Priority 1 when in client mode or client keywords detected)
      const isClientTextIntent =
        mode === 'create_client' ||
        /^(?:add|new|create)\s+(?:client|customer|party|shop)\b/i.test(rawText) ||
        /(?:add\s+new\s+client|create\s+new\s+client)\b/i.test(rawText) ||
        /(?:નવો|નવા|નવી)\s+(?:ગ્રાહક|કસ્ટમર|ક્લાયન્ટ|પાર્ટી|દુકાન)/i.test(rawText) ||
        /(?:નવો\s+ગ્રાહક\s+બનાવો|નવા\s+ક્લાયન્ટ\s+ઉમેરો)/i.test(rawText) ||
        /(?:नया|नए|नई)\s+(?:ग्राहक|कस्टमर|क्लाइंट|पार्टी|दुकान)/i.test(rawText) ||
        /(?:नया\s+ग्राहक\s+बनाओ|नया\s+ग्राहक\s+जोड़ो)/i.test(rawText)

      if (isClientTextIntent) {
        const model = vertexAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: jsonMaxTokens,
            temperature,
            responseMimeType: 'application/json',
          },
        })

        const textClientPrompt = `You are a client onboarding assistant for Annapurna Foods in Vadodara, Gujarat.
Parse the user's client details into strict JSON:
{
  "docType": "create_client",
  "name": string (Shop or customer name in English Title Case),
  "contactPerson": string (Contact person name in English),
  "mobile": string (10-digit mobile number, digits 0-9 only),
  "alternateMobile": string (digits 0-9 only),
  "address": string (Shop address/area in English),
  "location": string (Landmark/area in English),
  "rate": number (Default 200ml rate if mentioned, else 0),
  "notes": string (in English)
}
CRITICAL REQUIREMENT: ALL CLIENT INFORMATION MUST BE RETURNED IN ENGLISH (Latin alphabet / Roman script) ONLY!
Even if the user writes in Gujarati, Hindi, Marathi, or mixed language:
- Transliterate and translate all business names, person names, and addresses into clean English in Title Case (e.g. 'શ્રી ગણેશ પ્રોવિઝન સ્ટોર' -> 'Shree Ganesh Provision Store', 'માંજલપુર' -> 'Manjalpur', 'કિશોરભાઈ પટેલ' -> 'Kishorbhai Patel').
- Convert any Gujarati (૦-૯) or Hindi (०-९) digits into standard English digits (0-9).
- Under NO circumstance return Gujarati or Devanagari script in client fields.
User Text: ${rawText.slice(0, 1000)}`

        try {
          const res = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: textClientPrompt + contextInjections }] }],
          })
          const rawJson = res.response.candidates[0].content.parts[0].text.trim()
          const parsedData = parseStructuredJson(rawJson)
          if (parsedData.name) {
            return {
              type: 'create_client',
              modelUsed: modelName,
              data: ensureEnglishClient(parsedData),
            }
          }
        } catch (clientErr) {
          logger.warn('Failed to parse text client as JSON:', clientErr.message)
        }
      }

      // 2. Check for payment received intent in text
      const isPaymentTextIntent =
        mode === 'receive_payment' ||
        (/(?:received|payment\s+received|jama\s+kary[ao]|paid|rupiya\s+malya|rupaye\s+mile)\b/i.test(rawText) &&
          /\d+/.test(rawText) &&
          !/(?:stock|order|delivery|invoice)\b/i.test(rawText))

      if (isPaymentTextIntent) {
        const model = vertexAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: jsonMaxTokens,
            temperature,
            responseMimeType: 'application/json',
          },
        })

        const textPaymentPrompt = `You are an accounts and payment assistant for Annapurna Foods in Vadodara, Gujarat.
The user provided a customer payment received record in English, Gujarati, or Hindi.
Parse into strict JSON:
{
  "docType": "receive_payment",
  "payerName": string (Customer or shop name who paid),
  "amount": number (Payment amount in INR),
  "paymentMode": "online" | "cash" | "cheque",
  "onlineProvider": "GPay" | "PhonePe" | "Paytm" | "UPI" | "Bank",
  "utr": string (UTR, reference number, or cheque no if mentioned, else ""),
  "date": string (YYYY-MM-DD or today),
  "notes": string
}
User Text: ${rawText.slice(0, 1000)}`

        try {
          const res = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: textPaymentPrompt + contextInjections }] }],
          })
          const rawJson = res.response.candidates[0].content.parts[0].text.trim()
          const parsedData = parseStructuredJson(rawJson)
          if (Number(parsedData.amount) > 0) {
            return {
              type: 'receive_payment',
              modelUsed: modelName,
              data: parsedData,
            }
          }
        } catch (payErr) {
          logger.warn('Failed to parse text payment as JSON:', payErr.message)
        }
      }

      // 3. Check for sales notes / customer orders (Only if NOT in client creation or payment mode)
      const isSalesNotes =
        mode !== 'create_client' &&
        mode !== 'receive_payment' &&
        !isClientTextIntent &&
        (mode === 'retail_sales' ||
          /(?:sales|peti|box|case|bxs|qty|cash|rokda|gpay|upi|udhar|baaki|jama)\b/i.test(rawText) ||
          /(?:200ml|250ml|500ml|1\s*l|2\s*l|anjani|bailey)/i.test(rawText) ||
          (rawText.includes('\n') && /\d+/.test(rawText)))

      if (isSalesNotes) {
        const model = vertexAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: jsonMaxTokens,
            temperature,
            responseMimeType: 'application/json',
          },
        })

        const textSalesPrompt = `You are an expert sales notepad parser for Annapurna Foods, authorized water distributor in Vadodara, Gujarat (owned by Jignesh Pandya).
The user pasted daily retail sales notes (from WhatsApp or notepad in English, Gujarati, or Gujlish).
Parse every customer sale into structured JSON.
Map all products EXCLUSIVELY to our 5 canonical SKUs:
1. "Anjani 200ml" (unit: Box)
2. "Bailey 250ml" (unit: Case / Box)
3. "Bailey 500ml" (unit: Case / Box)
4. "Bailey 1 Liter" (unit: Case / Box)
5. "Bailey 2 Liter" (unit: Case / Box)

CRITICAL RULES & USER INSTRUCTIONS:
1. RETAIL CONSOLIDATION (MANDATORY): All walk-in, counter, cash, unnamed, or retail sales MUST BE COMBINED / CONSOLIDATED INTO A SINGLE order with "clientName": "Retail". NEVER generate multiple separate "Retail" or "Walk-in" sales entries in the "sales" array.
2. DIFFERENT RATES MUST REMAIN SEPARATE LINE ITEMS (MANDATORY): If the user writes or pastes the same SKU at different rates (for example: "Bailey 1 Liter 10 @ 120" and "Bailey 1 Liter 5 @ 125", or "10 case 120 bhav, 5 case 125 bhav"), ALWAYS output them as SEPARATE items in the "items" array with their own qty and rate. NEVER combine items that have different rates into one line! Only combine items if BOTH the product SKU AND unit rate are identical.
3. NAMED CUSTOMERS: Regular business / named customers (e.g., "Jay Ambe Provision", "Rohitbhai") each get their own individual order in the "sales" array.
4. USER INSTRUCTIONS: Strictly follow any explicit instructions written by the user in the prompt (such as specific pricing, dates, or payment notes).

Return strict JSON:
{
  "docType": "retail_sales",
  "summary": {
    "totalOrders": number,
    "totalQty": number,
    "date": string (YYYY-MM-DD or today)
  },
  "sales": [
    {
      "clientName": string (customer or shop name; for unknown, walk-in, or unnamed retail buyers, use "Retail"),
      "mobile": string (if provided, else ""),
      "items": [
        {
          "sku": "Anjani 200ml" | "Bailey 250ml" | "Bailey 500ml" | "Bailey 1 Liter" | "Bailey 2 Liter",
          "qty": number (positive integer),
          "rate": number (unit rate if written, else 0),
          "unit": "Box" | "Case / Box"
        }
      ],
      "totalAmount": number (total amount if stated, else 0),
      "paymentMode": "cash" | "online" | "credit" (cash if cash/rokda/paid/jama, online if gpay/upi/phonepe, credit if udhar/baaki/due/pending or unspecified),
      "amountCollected": number (if cash/online, else 0),
      "notes": string
    }
  ]
}

Sales Notes:
${rawText.slice(0, 3000)}`

        try {
          const res = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: textSalesPrompt + contextInjections }] }],
          })
          const rawJson = res.response.candidates[0].content.parts[0].text.trim()
          const parsedData = parseStructuredJson(rawJson)

          if (Array.isArray(parsedData.sales) && parsedData.sales.length > 0) {
            return {
              type: 'retail_sales',
              modelUsed: modelName,
              data: parsedData,
            }
          }
        } catch (parseErr) {
          logger.warn('Failed to parse sales notes as JSON, falling back to chat:', parseErr.message)
        }
      }


      // General conversational chat reply
      const model = vertexAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: chatMaxTokens,
          temperature,
          responseMimeType: 'text/plain',
        },
      })

      const systemPrompt = `You are the concise and helpful AI Assistant for Annapurna Foods (distributor for Anjani & Bailey Packaged Drinking Water in Vadodara, owned by Jignesh Pandya).
Help with water orders, stock, clients, accounts, cash custody, and inquiries in English, Gujarati, or Hindi.
Keep your answer clear, polite, and under 120 words.
Our 5 products are: Anjani 200ml (Boxes), Bailey 250ml (Cases), Bailey 500ml (Cases), Bailey 1 Liter (Cases), Bailey 2 Liter (Cases).
NOTE: All walk-in, unnamed, or counter retail sales are always consolidated into a single master order/invoice for "Retail" to keep order logs clean.
ACCOUNTS & CASH CUSTODY: Delivery staff Nilesh and Hiteshbhai collect cash on routes. Cash can be handed over partially or fully to Counter (Jigneshbhai) or Bank. Staff expenses (e.g. diesel, vehicle repairs) are debited from their cash custody.`

      const safeHistory = Array.isArray(conversationHistory)
        ? conversationHistory.slice(-3).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: [{ text: String(m.text || '').slice(0, 300) }],
          }))
        : []

      const parts = [{ text: `${systemPrompt}${contextInjections}\n\nUser: ${rawText.slice(0, 500)}` }]

      const res = await model.generateContent({
        contents: [...safeHistory, { role: 'user', parts }],
      })

      const replyText = res.response.candidates[0].content.parts[0].text.trim()
      return {
        type: 'chat_reply',
        modelUsed: modelName,
        text: replyText,
      }
    }
  }

  try {
    return await tryGenerate(primaryModelName)
  } catch (primaryError) {
    logger.warn(`Primary model ${primaryModelName} failed: ${primaryError.message}. Retrying fallback ${fallbackModelName}...`)
    try {
      return await tryGenerate(fallbackModelName)
    } catch (fallbackError) {
      logger.error('Both AI models failed:', fallbackError)
      throw new Error(`AI processing failed: ${fallbackError.message}`)
    }
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
// Reminders for staff tasks have been disabled per user request.


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
    schedule: "0 8-22 * * *",
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
        processDailyGreetings(db, currentHour),
        processDailyExpenseReport(db, currentHour),
        processRecurringExpenses(db, currentHour),
        processDynamicLeadDiscovery(db, currentHour, currentDayOfWeek)
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

      const birthdayMD = birthday ? (birthday.length === 5 ? birthday : birthday.substring(5)) : '';
      const anniversaryMD = anniversary ? (anniversary.length === 5 ? anniversary : anniversary.substring(5)) : '';

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

/**
 * Helper to process Daily Expense summary to Nilesh / Admin in the evening (9:00 PM IST)
 */
async function processDailyExpenseReport(db, currentHour) {
  if (currentHour !== 21) {
    return; // Only run at 9:00 PM local India Time
  }

  try {
    logger.info("Daily Expense Report: Processing evening expense summary...");
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;

    const istStartStr = `${year}-${month}-${day}T00:00:00+05:30`;
    const istEndStr = `${year}-${month}-${day}T23:59:59+05:30`;
    
    const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(istStartStr));
    const endTimestamp = admin.firestore.Timestamp.fromDate(new Date(istEndStr));

    const expenseSnap = await db.collection('expenses')
      .where('date', '>=', startTimestamp)
      .where('date', '<=', endTimestamp)
      .get();

    if (expenseSnap.empty) {
      logger.info("Daily Expense Report: No expenses recorded today. Sending reminder to owner.");
      const ownerUid = '99sjK9Fgn4Y6jv4tZiIsTOoGVLm1';
      await sendNotificationToUser(
        ownerUid,
        "Reminder: You haven't recorded any expenses today. Please open the app and log them if any.",
        "Daily Expense Reminder",
        "expense-reminder"
      );
      return;
    }

    let totalAmount = 0;
    const categoryBreakdown = {};

    expenseSnap.forEach((doc) => {
      const exp = doc.data();
      const amt = Number(exp.amount || 0);
      totalAmount += amt;

      const cat = exp.category || 'Miscellaneous';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amt;
    });

    const breakdownStr = Object.entries(categoryBreakdown)
      .map(([cat, amt]) => `${cat}: ₹${amt}`)
      .join(', ');

    const notificationMessage = `Today's Expense Summary: Total: ₹${totalAmount}. Breakdown: ${breakdownStr}.`;

    // Broadcast push/in-app notification
    await broadcastNotification(notificationMessage, 'Daily Expense Summary', null, 'daily-expense-summary');
    logger.info("Daily Expense Report: FCM notification successfully sent to admin.");
  } catch (error) {
    logger.error("Error processing daily expense report:", error);
  }
}

/**
 * Helper to process recurring expenses daily at 9:00 AM IST
 */
async function processRecurringExpenses(db, currentHour) {
  if (currentHour !== 9) {
    return; // Only run at 9:00 AM local India Time
  }

  try {
    logger.info("Recurring Expenses: Processing daily templates...");
    const now = new Date();
    
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const todayStr = `${year}-${month}-${day}`;

    // Get all active templates
    const snapshot = await db.collection('recurringExpenses')
      .where('status', '==', 'active')
      .get();

    if (snapshot.empty) {
      logger.info("Recurring Expenses: No active templates found.");
      return;
    }

    const batch = db.batch();
    let generatedCount = 0;

    snapshot.forEach((doc) => {
      const template = doc.data();
      const templateId = doc.id;
      const occurrenceDateStr = template.nextOccurrenceDate;

      if (!occurrenceDateStr || occurrenceDateStr > todayStr) {
        return;
      }

      generatedCount++;

      // 1. Create the new expense entry
      const expenseRef = db.collection('expenses').doc();
      const expenseData = {
        amount: Number(template.amount),
        category: template.category,
        note: template.note || '',
        date: admin.firestore.Timestamp.fromDate(new Date(`${occurrenceDateStr}T10:00:00+05:30`)),
        recurringTemplateId: templateId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(expenseRef, expenseData);

      // 2. Calculate the next occurrence date
      const occurrenceDate = new Date(`${occurrenceDateStr}T12:00:00`); // Use noon to avoid timezone shift
      let nextDate = new Date(occurrenceDate);

      if (template.frequency === 'weekly') {
        nextDate.setDate(nextDate.getDate() + 7);
      } else if (template.frequency === 'monthly') {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (template.frequency === 'yearly') {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      } else {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }

      const nextYear = nextDate.getFullYear();
      const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
      const nextDay = String(nextDate.getDate()).padStart(2, '0');
      const nextOccurrenceStr = `${nextYear}-${nextMonth}-${nextDay}`;

      // 3. Update the template document
      const templateRef = db.collection('recurringExpenses').doc(templateId);
      batch.update(templateRef, {
        nextOccurrenceDate: nextOccurrenceStr,
        lastGeneratedDate: occurrenceDateStr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      logger.info(`Recurring Expenses: Generated expense for template "${template.note}" (${templateId}) for date ${occurrenceDateStr}. Next: ${nextOccurrenceStr}`);
    });

    if (generatedCount > 0) {
      await batch.commit();
      logger.info(`Recurring Expenses: Successfully generated ${generatedCount} expenses.`);
    } else {
      logger.info("Recurring Expenses: No pending occurrences due today.");
    }
  } catch (error) {
    logger.error("Error processing recurring expenses:", error);
  }
}

/**
 * Helper to dynamically discover new B2B leads using targeted Bailey Water key customer
 * corridors (Ajwa Road, Waghodia Road, Kapurai, Parivar Char Rasta, Mahavir Char Rasta -
 * Restaurants, Dhabas & Snacks outlets).
 */
async function processDynamicLeadDiscovery(
  db,
  currentHour,
  currentDayOfWeek,
  bypassScheduleCheck = false,
  runtimeConfig = null,
) {
  try {
    const configRef = db.collection('config').doc('leadDiscoveryConfig');
    const configDoc = await configRef.get();

    let config = {
      enabled: true,
      hour: 9,
      days: [1], // Monday default
      mode: 'auto',
      baileyTargeting: true,
      corridors: [
        'Ajwa Road',
        'Waghodia Road',
        'Kapurai',
        'Parivar Char Rasta',
        'Mahavir Char Rasta',
      ],
      categories: [
        'Restaurants & Dining',
        'Snacks & Farsan Outlets',
        'Cafes & Fast Food',
        'Dhabas & Food Points',
      ],
    };

    if (configDoc.exists) {
      config = Object.assign(config, configDoc.data());
    }

    if (runtimeConfig && typeof runtimeConfig === 'object') {
      config = Object.assign(config, runtimeConfig);
    }

    if (!config.enabled && !bypassScheduleCheck) {
      return { skipped: true, reason: 'disabled' };
    }

    // Determine current local time in India (Asia/Kolkata)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const currentMonth = parseInt(parts.find((p) => p.type === 'month').value, 10);
    const year = parts.find((p) => p.type === 'year').value;
    const monthStr = String(currentMonth).padStart(2, '0');
    const day = parts.find((p) => p.type === 'day').value;
    const todayStr = `${year}-${monthStr}-${day}`;

    if (!bypassScheduleCheck) {
      // Check hour
      if (currentHour !== Number(config.hour)) {
        return { skipped: true, reason: 'hour_mismatch' };
      }

      // Avoid running multiple times on the same date unless bypassed
      if (config.lastRunDate === todayStr) {
        logger.info(`Dynamic Lead Discovery: Already executed today (${todayStr}). Skipping.`);
        return { skipped: true, reason: 'already_run_today' };
      }
    }

    let activeDays = Array.isArray(config.days) ? config.days : [1];
    if (!bypassScheduleCheck && !activeDays.includes(currentDayOfWeek)) {
      return { skipped: true, reason: 'day_not_active' };
    }

    let targetCount = 8;
    if (config.mode === 'aggressive') {
      targetCount = 12;
    } else if (config.mode === 'normal') {
      targetCount = 5;
    }

    const isBaileyRadar = config.baileyTargeting !== false;
    const corridors =
      Array.isArray(config.corridors) && config.corridors.length > 0
        ? config.corridors
        : ['Ajwa Road', 'Waghodia Road', 'Kapurai', 'Parivar Char Rasta', 'Mahavir Char Rasta'];
    const categories =
      Array.isArray(config.categories) && config.categories.length > 0
        ? config.categories
        : ['Restaurants & Dining', 'Snacks & Farsan Outlets', 'Cafes & Fast Food', 'Dhabas & Food Points'];

    const seasonName = isBaileyRadar ? 'Bailey Water Key Corridor Radar' : 'Routine Business Coverage';
    const corridorsStr = corridors.join(', ');
    const categoriesStr = categories.join(', ');

    logger.info(`Dynamic Lead Discovery: Starting ${seasonName} (Target: ${targetCount} leads in ${corridorsStr})...`);

    const prompt = `
Search Google for real, verified businesses in categories: "${categoriesStr}" located strictly in or around these corridors: ${corridorsStr} in Vadodara, Gujarat, India.
These outlets are key commercial buyers of Bailey Packaged Drinking Water (250ml, 500ml, 1L, 2L bottles and 20L jars).
Extract their verified 10-digit Indian mobile numbers (do NOT include landline numbers starting with 0265 or +91-265).
Return ONLY a raw JSON array containing up to ${targetCount} objects with the keys:
'name': Business or restaurant name,
'mobile': clean 10-digit mobile number as a string,
'business_type': category (e.g. 'Restaurant', 'Snacks Outlet', 'Dhaba', 'Cafe'),
'area': specific corridor or junction (must be one of ${corridorsStr}),
'notes': brief note mentioning suitability for Bailey Water,
'relevance_score': number 1-10.
Do not include markdown codeblocks like \`\`\`json or backticks. Just the raw JSON array.`;

    let aiResponseText = '';
    try {
      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ googleSearchRetrieval: {} }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.1,
        },
      });
      aiResponseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (toolErr) {
      logger.warn('Google Search Retrieval tool failed, falling back to direct generativeModel:', toolErr);
      const fallbackResult = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.2,
        },
      });
      aiResponseText = fallbackResult.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    let leads = [];
    try {
      let cleanedText = aiResponseText.trim();
      if (cleanedText.startsWith('```json')) cleanedText = cleanedText.substring(7);
      if (cleanedText.startsWith('```')) cleanedText = cleanedText.substring(3);
      if (cleanedText.endsWith('```')) cleanedText = cleanedText.substring(0, cleanedText.length - 3);
      leads = JSON.parse(cleanedText.trim());
    } catch (parseErr) {
      logger.error('Dynamic Lead Discovery: Failed to parse AI response into JSON:', aiResponseText, parseErr);
      return { success: false, error: 'Failed to parse AI response' };
    }

    if (!Array.isArray(leads)) {
      logger.warn('Dynamic Lead Discovery: AI response was not an array.', leads);
      return { success: false, error: 'AI response was not an array' };
    }

    logger.info(`Dynamic Lead Discovery: AI found ${leads.length} candidates.`);

    let addedCount = 0;
    const addedLeads = [];

    for (const lead of leads) {
      if (addedCount >= targetCount) break;

      if (lead.mobile && String(lead.mobile).length >= 10) {
        const cleanPhone = String(lead.mobile).replace(/\D/g, '');
        const last10 = cleanPhone.slice(-10);

        // Deduplication across leads, clients, and customers
        const [l1, l2, c1, c2, cust1, cust2] = await Promise.all([
          db.collection('leads').where('mobile', '==', last10).limit(1).get(),
          db.collection('leads').where('mobile', '==', '91' + last10).limit(1).get(),
          db.collection('clients').where('mobile', '==', last10).limit(1).get(),
          db.collection('clients').where('mobile', '==', '91' + last10).limit(1).get(),
          db.collection('customers').where('mobile', '==', last10).limit(1).get(),
          db.collection('customers').where('mobile', '==', '91' + last10).limit(1).get(),
        ]);

        if (l1.empty && l2.empty && c1.empty && c2.empty && cust1.empty && cust2.empty) {
          const leadDoc = {
            name: lead.name || 'Unknown Business',
            mobile: last10,
            business_type: lead.business_type || 'Restaurant / Snacks Outlet',
            area: lead.area || corridors[addedCount % corridors.length],
            target_product: 'Bailey Packaged Drinking Water',
            source: 'Bailey_Water_Radar',
            season: seasonName,
            notes: lead.notes || `Key customer for Bailey Water at ${lead.area || 'Vadodara'}`,
            createdAt: new Date().toISOString(),
            Tag: null,
            relevance_score: lead.relevance_score || 9,
          };

          await db.collection('leads').add(leadDoc);
          addedCount++;
          addedLeads.push(leadDoc);
          logger.info(`Dynamic Lead Discovery: Added Bailey Water lead: ${lead.name} (${last10}) in ${lead.area}`);
        } else {
          logger.info(`Dynamic Lead Discovery: Duplicate lead/client found for ${last10}. Skipping.`);
        }
      }
    }

    // Update config record with execution statistics
    await configRef.set(
      {
        lastRunDate: todayStr,
        lastRunCount: addedCount,
        lastRunSeason: seasonName,
        lastRunCorridors: corridors,
        lastRunCategories: categories,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.info(`Dynamic Lead Discovery: Completed. Added ${addedCount} new leads.`);
    return {
      success: true,
      addedCount,
      totalCandidates: leads.length,
      corridors,
      leads: addedLeads,
    };
  } catch (error) {
    logger.error('Dynamic Lead Discovery: Error executing job:', error);
    return { success: false, error: error.message };
  }
}
