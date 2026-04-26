const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { VertexAI } = require('@google-cloud/vertexai');

admin.initializeApp();

// Initialize Vertex AI
const project = process.env.GCLOUD_PROJECT || 'anjaniappnew';
const vertexAI = new VertexAI({ project: project, location: 'us-central1' });
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
});

// Global settings for all functions
setGlobalOptions({
  region: "asia-south1",
  maxInstances: 5
});

// Global Constants
const STAFF_MOBILE = "917990943652";
const MACRODROID_URL = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";

// --- EXISTING FUNCTIONS ---

exports.sendSmsViaMacrodroid = onDocumentCreated("leads/{docId}", async (event) => {
    const newLeadData = event.data.data();

    if (newLeadData.Tag) {
        logger.info(`Lead ${event.params.docId} already has a tag: ${newLeadData.Tag}. Skipping SMS.`);
        return;
    }
    
    if (!newLeadData.mobile) {
        logger.error("ERROR: Missing mobile number for lead", { docId: event.params.docId });
        return; 
    }

    let cleanPhone = String(newLeadData.mobile).replace(/\D/g, '');
    if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
    }

    const message = "Events in Vadodara? Serve Anjani Water 200ml bottles! Perfect size, zero waste. Special rates on bulk buys! Order here: https://wa.me/919925997750";
    const packet = `${cleanPhone}@@@${message}`;

    const baseUrl = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
    const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

    try {
        const response = await fetch(finalUrl);

        if (response.ok) {
            logger.info("SMS Webhook Sent to " + cleanPhone);
            const leadRef = admin.firestore().collection('leads').doc(event.params.docId);
            await leadRef.update({ Tag: 'SMS_SENT', smsSentAt: admin.firestore.FieldValue.serverTimestamp() });
            logger.info('Updated Tag to SMS_SENT for doc: ' + event.params.docId);
        } else {
            logger.error("Macrodroid webhook failed:", response.status);
        }
    } catch (e) {
        logger.error("SMS Error: " + e.message);
    }
});

/**
 * Sanitizes fields for SMS by removing special characters that might break the packet format.
 */
function sanitizeSmsField(field) {
    if (field === null || field === undefined) return "N/A";
    return String(field).replace(/[@@@?&=]/g, " ").trim() || "N/A";
}

/**
 * Resolves full order and client context using order data and/or clientId/orderId.
 * Prioritizes explicitly provided orderData, but fetches from Firestore if needed to ensure 
 * all required details are present.
 */
async function resolveOrderContext(orderDataOrId, clientIdOverride = null) {
    let orderData = (typeof orderDataOrId === 'object' && orderDataOrId !== null) ? orderDataOrId : null;
    const orderId = typeof orderDataOrId === 'string' ? orderDataOrId : (orderData?.id || orderData?.orderId || orderData?.OrderID);

    // 1. If we only have an ID or incomplete data, fetch the order document
    if ((!orderData || !orderData.qty) && orderId) {
        try {
            const orderDoc = await admin.firestore().collection('orders').doc(String(orderId)).get();
            if (orderDoc.exists) {
                orderData = { ...orderDoc.data(), id: orderDoc.id };
            }
        } catch (e) {
            logger.error(`Error fetching order ${orderId}:`, e);
        }
    }

    if (!orderData) orderData = {};

    const clientId = clientIdOverride || orderData.clientId || orderData.ClientID;
    let clientData = null;

    // 2. Fetch customer data if clientId is available to get latest name/mobile/mapLink
    if (clientId) {
        try {
            const clientDoc = await admin.firestore().collection('customers').doc(String(clientId)).get();
            if (clientDoc.exists) {
                clientData = clientDoc.data();
            }
        } catch (e) {
            logger.error(`Error fetching customer ${clientId}:`, e);
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
        mapLink: orderData.mapLink || orderData.googleMapsLink || clientData?.mapLink || 'N/A'
    };
}

exports.sendOrderSmsToStaff = onDocumentWritten("orders/{docId}", async (event) => {
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;
    
    logger.info(`Processing sendOrderSmsToStaff for ${event.params.docId}:`, { beforeData, afterData });

    if (!afterData) {
        logger.info(`Order ${event.params.docId} deleted. Skipping SMS.`);
        return;
    }

    const currentStatus = (afterData.status || "").toLowerCase();
    const previousStatus = beforeData ? (beforeData.status || "").toLowerCase() : null;
    
    logger.info(`Processing order ${event.params.docId}: Status ${previousStatus} -> ${currentStatus}`);

    const isCancelled = currentStatus === "cancelled" || afterData.isCancelled === true;
    const wasCancelled = beforeData && (previousStatus === "cancelled" || beforeData.isCancelled === true);
    const justCancelled = isCancelled && !wasCancelled;

    const importantFields = [
        "clientName", "name", "qty", "quantity", "date", "time", "deliveryTime",
        "address", "deliveryAddress", "location", "area", "mapLink", "googleMapsLink", "mobile", "phone", "status",
        "rate", "price", "amount"
    ];

    let anyDetailChanged = false;
    let changedFields = [];

    if (beforeData) {
        importantFields.forEach(field => {
            const valBefore = beforeData[field];
            const valAfter = afterData[field];
            
            // Treat null, undefined, and empty string as equivalent
            const normalize = (v) => (v === null || v === undefined) ? "" : String(v).trim();
            const normBefore = normalize(valBefore);
            const normAfter = normalize(valAfter);
            
            if (normBefore !== normAfter) {
                anyDetailChanged = true;
                changedFields.push(field);
            }
        });
    }

    let shouldSend = false;
    let statusHeader = "ORDER UPDATED";

    if (!beforeData) {
        // New order - ALWAYS send
        shouldSend = true;
        statusHeader = "NEW ORDER";
        logger.info(`Decision: Sending notification for NEW order ${event.params.docId}`);
    } else if (justCancelled) {
        // Transition to cancelled - ALWAYS send
        shouldSend = true;
        statusHeader = "ORDER CANCELLED";
        logger.info(`Decision: Sending notification for CANCELLED order ${event.params.docId}`);
    } else if (anyDetailChanged) {
        // Skip notifications for confirmed or delivered status as requested
        if (currentStatus === "confirmed" || currentStatus === "delivered") {
            logger.info(`Decision: Skipping notification for order ${event.params.docId} - Status is ${currentStatus}.`);
            return;
        }

        shouldSend = true;
        // Specific headers for important status transitions
        if (isCancelled) {
            statusHeader = "ORDER CANCELLED";
        } else {
            statusHeader = "ORDER UPDATED";
        }
        logger.info(`Decision: Sending notification for UPDATED order ${event.params.docId}. Changed: ${changedFields.join(", ")}`);
    }

    if (!shouldSend) {
        logger.info(`Decision: Skipping notification for order ${event.params.docId} - no important details changed.`);
        return;
    }

    logger.info(`Sending notification for ${event.params.docId} with header: ${statusHeader}. Changed fields: ${changedFields.join(", ")}`);

    // Resolve full order context including client details
    const resolved = await resolveOrderContext({ ...afterData, id: event.params.docId });

    // Sanitize all resolved fields for safe SMS construction
    const sName = sanitizeSmsField(resolved.name);
    const sMobile = sanitizeSmsField(resolved.mobile);
    const sQty = sanitizeSmsField(resolved.qty);
    const sDate = sanitizeSmsField(resolved.date);
    const sTime = sanitizeSmsField(resolved.time);
    const sAddress = sanitizeSmsField(resolved.address);
    const sLocation = sanitizeSmsField(resolved.location);
    const sMapLink = sanitizeSmsField(resolved.mapLink);

    const message = `${statusHeader} Details:
Client: ${sName}
Mobile: ${sMobile}
Qty: ${sQty}
Date: ${sDate}
Time: ${sTime}
Address: ${sAddress}
Location: ${sLocation}
MapLink: ${sMapLink}`;

    const pushMessage = `${statusHeader}: ${sQty} for ${sName} at ${sTime} (${sDate}).`;

    logger.info(`Constructed Staff message for ${event.params.docId}: ${message}`);

    // Send Push Notification
    try {
        await broadcastNotification(message, statusHeader, pushMessage, event.params.docId);
        logger.info(`Push notification sent for order: ${event.params.docId}`);
    } catch (pushError) {
        logger.error("Error sending push notification for order:", { orderId: event.params.docId, error: pushError.message });
    }

    const staffMobile = STAFF_MOBILE;
    const packet = `${staffMobile}@@@${message}`;

    const baseUrl = MACRODROID_URL;
    const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

    try {
        const response = await fetch(finalUrl);
        if (response.ok) {
            logger.info(`${statusHeader} SMS Webhook Sent to Staff for order: ${event.params.docId}`);
        } else {
            logger.error("Staff SMS webhook failed:", { orderId: event.params.docId, status: response.status });
        }
    } catch (e) {
        logger.error("Staff SMS Error:", { orderId: event.params.docId, error: e.message });
    }
});

/**
 * Helper to format date as YYYY-MM-DD
 */
exports.formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/**
 * Helper to send order reminder SMS
 */
exports.sendOrderReminder = async function sendOrderReminder(doc, type, skipPush = false) {
    const data = doc.data();
    logger.info(`Processing ${type} reminder for order ${doc.id}:`, data);
    if (data.status === "cancelled" || data.isCancelled === true) return;

    // Resolve full order context including client details
    const resolved = await resolveOrderContext({ ...data, id: doc.id });

    // Skip if essential data is still missing (to avoid sending N/A messages for stub documents)
    if (resolved.name === 'N/A' && resolved.mobile === 'N/A') {
        logger.info(`Skipping reminder for doc ${doc.id} - missing client name and mobile.`);
        return;
    }

    const message = `DELIVERY REMINDER (${type}):
Client: ${resolved.name}
Mobile: ${resolved.mobile}
Qty: ${resolved.qty}
Date: ${resolved.date}
Time: ${resolved.time}
Address: ${resolved.address}
Location: ${resolved.location}
MapLink: ${resolved.mapLink}`;


    logger.info(`Constructed message for ${doc.id}: ${message}`);

    // Send Push Notification
    if (!skipPush) {
        try {
            await broadcastNotification(message, `DELIVERY REMINDER (${type})`, null, doc.id);
            logger.info(`Push reminder (${type}) sent for order: ${doc.id}`);
        } catch (pushError) {
            logger.error(`Error sending push reminder (${type}) for order:`, { orderId: doc.id, error: pushError.message });
        }
    } else {
        logger.info(`Skipping individual push reminder for order ${doc.id} as per skipPush flag.`);
    }

    const staffMobile = "917990943652";
    const packet = `${staffMobile}@@@${message}`;
    const baseUrl = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
    const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

    try {
        const response = await fetch(finalUrl);
        if (response.ok) {
            logger.info(`Reminder (${type}) SMS Sent for order: ${doc.id}`);
        } else {
            logger.error(`Reminder (${type}) SMS failed:`, { orderId: doc.id, status: response.status });
        }
    } catch (e) {
        logger.error(`Reminder (${type}) SMS Error:`, { orderId: doc.id, error: e.message });
    }
}

// Morning reminder for TODAY's orders
exports.sendMorningOrderReminders = onSchedule({
    schedule: "0 8 * * *",
    timeZone: "Asia/Kolkata"
}, async (_event) => {
    logger.info("Running morning order reminder job.");
    try {
        const todayStr = exports.formatDate(new Date());
        const snapshot = await admin.firestore().collection('orders')
            .where('date', '==', todayStr).get();

        const activeOrders = snapshot.docs.filter(doc => {
            const data = doc.data();
            return !(data.status === "cancelled" || data.isCancelled === true);
        });

        if (activeOrders.length > 0) {
            const summaryMessage = `Good Morning! You have ${activeOrders.length} order${activeOrders.length > 1 ? 's' : ''} scheduled for today. Check the app for details.`;
            await broadcastNotification(summaryMessage, "TODAY'S ORDERS SUMMARY");
            
            // Still send individual SMS for staff automation, but skip individual push
            const promises = activeOrders.map(doc => exports.sendOrderReminder(doc, "TODAY", true));
            await Promise.all(promises);
            logger.info(`Morning order reminder job completed. Sent ${activeOrders.length} SMS reminders and 1 summary push.`);
        } else {
            logger.info("No active orders found for today.");
        }
    } catch (e) {
        logger.error("Morning Order Reminder Job Error:", e.message);
    }
});

// Evening reminder for TOMORROW's orders
exports.sendEveningOrderReminders = onSchedule({
    schedule: "0 20 * * *",
    timeZone: "Asia/Kolkata"
}, async (_event) => {
    logger.info("Running evening order reminder job.");
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = exports.formatDate(tomorrow);

        const snapshot = await admin.firestore().collection('orders')
            .where('date', '==', tomorrowStr).get();

        const activeOrders = snapshot.docs.filter(doc => {
            const data = doc.data();
            return !(data.status === "cancelled" || data.isCancelled === true);
        });

        if (activeOrders.length > 0) {
            const summaryMessage = `Evening Update: There are ${activeOrders.length} order${activeOrders.length > 1 ? 's' : ''} scheduled for tomorrow. Be ready!`;
            await broadcastNotification(summaryMessage, "TOMORROW'S ORDERS SUMMARY");

            // Still send individual SMS for staff automation, but skip individual push
            const promises = activeOrders.map(doc => exports.sendOrderReminder(doc, "TOMORROW", true));
            await Promise.all(promises);
            logger.info(`Evening order reminder job completed. Sent ${activeOrders.length} SMS reminders and 1 summary push.`);
        } else {
            logger.info("No active orders found for tomorrow.");
        }
    } catch (e) {
        logger.error("Evening Order Reminder Job Error:", e.message);
    }
});

exports.sendWeeklyPaymentReminders = onSchedule({
    schedule: "every monday 18:00",
    timeZone: "Asia/Kolkata"
}, async (_event) => {
    logger.info("Running weekly payment reminder job.");
    try {
        const customersRef = admin.firestore().collection('customers');
        const dueCustomersSnapshot = await customersRef.where('outstanding', '>', 100).get();

        if (dueCustomersSnapshot.empty) {
            logger.info("No customers with outstanding > 100 found. Exiting.");
            return;
        }

        // Generate ONE fresh message template for the entire week
        const weeklyPaymentTemplate = await generateWeeklyPaymentSmsTemplate();
        logger.info("Weekly payment AI template generated:", weeklyPaymentTemplate);

        const promises = dueCustomersSnapshot.docs.map(doc => {
            const customerData = doc.data();
            const clientMobile = customerData.mobile || customerData.phone;
            const amountDue = customerData.outstanding;
            const clientName = customerData.name || "Customer";

            if (!clientMobile) {
                logger.warn(`Customer document ${doc.id} is missing a mobile number.`);
                return Promise.resolve();
            }
            
            let cleanPhone = String(clientMobile).replace(/\D/g, '');
            if (cleanPhone.length === 10) {
                cleanPhone = "91" + cleanPhone;
            }

            // Personalized for this client using the weekly template
            const message = weeklyPaymentTemplate
                .replace("{name}", clientName)
                .replace("{amount}", amountDue);

            const packet = `${cleanPhone}@@@${message}`;
            const baseUrl = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
            const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

            return fetch(finalUrl).then(async (response) => {
                if (response.ok) {
                    logger.info(`Payment reminder sent to ${clientName} (${cleanPhone})`);
                    try {
                        await doc.ref.update({ 
                            lastPaymentReminderSent: admin.firestore.FieldValue.serverTimestamp()
                        });
                        logger.info(`Updated lastPaymentReminderSent for customer: ${doc.id}`);
                    } catch (updateError) {
                        logger.error(`Failed to update customer ${doc.id}:`, updateError);
                    }
                } else {
                    logger.error(`Failed to send payment reminder to ${cleanPhone}:`, { status: response.status });
                }
            }).catch(e => {
                logger.error(`Error sending payment reminder to ${cleanPhone}:`, { error: e.message });
            });
        });

        await Promise.all(promises);
        logger.info("Finished processing payment reminders.");
    } catch (error) {
        logger.error("Error running weekly payment reminder job:", error);
    }
});



// --- WEEKLY REGULAR CLIENT REMINDER SYSTEM ---

exports.sendWeeklyRegularOrderReminder = onSchedule(
    {
      schedule: "0 10 * * 3", // Every Wednesday at 10:00 AM India Time
      timeZone: "Asia/Kolkata",
      retryCount: 2
    },
    async (_event) => {
        logger.info("Starting weekly regular client order reminder job.");
        const db = admin.firestore();
        
        try {
            const regularSnap = await db.collection('customers').where('isRegular', '==', true).get();
            
            if (regularSnap.empty) {
                logger.info("No regular customers found for reminder. Exiting.");
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

                // Personalized for this client using the weekly template
                const message = weeklyTemplate.replace("{name}", name);
                
                const cleanPhone = normalizeIndianPhone(mobile);
                const packet = `${cleanPhone}@@@${message}`;
                const baseUrl = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
                const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

                try {
                    const response = await fetch(finalUrl);
                    if (response.ok) {
                        logger.info(`Weekly AI reminder sent to regular client: ${name} (${cleanPhone})`);
                    } else {
                        logger.error(`Failed to send AI reminder to ${cleanPhone}:`, { status: response.status });
                    }
                } catch (e) {
                    logger.error(`Error calling AI webhook for ${cleanPhone}:`, { error: e.message });
                }
            });

            await Promise.all(promises);
            logger.info("Finished sending weekly AI reminders to regular clients.");
        } catch (error) {
            logger.error("Error running weekly regular client AI reminder job:", error);
        }
    }
);


// Constants and Helpers for the Follow-Up Logic
const MACRO_URL_FOLLOWUP = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
const FOLLOW_UP_DAYS = [3, 7, 10, 15];
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const INDIA_COUNTRY_CODE = "91";

function toDateObject(value) {
  if (!value) return null;
  const { Timestamp } = require("firebase-admin/firestore");
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLeadPhone(lead) {
  return lead.mobile || lead.phone || "";
}

function normalizeIndianPhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.length === 10) clean = `${INDIA_COUNTRY_CODE}${clean}`;
  return clean;
}

/**
 * Uses Gemini to generate a single engaging, fresh SMS template for the week's payment reminders.
 */
async function generateWeeklyPaymentSmsTemplate() {
    const prompt = `Write a very polite, short, and friendly SMS reminder (max 140 chars) for a customer regarding their outstanding payment balance for "Anjani 200ml Packaged Drinking Water".
    The tone should be professional and very polite.
    Use a mix of Hindi and Gujarati (Hinglish/Gujlish style) if appropriate, but keep it clear.
    Include a placeholder {name} exactly where the customer's name should go, and {amount} exactly where the outstanding balance should go.
    Include a call to action to reply or WhatsApp to settle the amount.
    Avoid complex formatting. Just the plain text of the SMS template.`;

    try {
        const resp = await generativeModel.generateContent(prompt);
        const text = resp.response.candidates[0].content.parts[0].text.trim();
        return text;
    } catch (error) {
        logger.error("Error generating weekly payment AI template:", error);
        // Fallback to a static message if AI fails
        return `Namaste {name} ji, a gentle reminder from Anjani Water for your pending balance of Rs {amount}. Krupaya apna payment clear karein. Thank you! 🙏`;
    }
}

/**
 * Uses Gemini to generate a single engaging, fresh SMS template for the week.
 */
async function generateWeeklySmsTemplate() {
    const prompt = `Write a very short, engaging, and friendly SMS reminder (max 140 chars) for a regular customer to order "Anjani 200ml Packaged Drinking Water". 
    The tone should be professional yet warm. 
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
        // Fallback to a static message if AI fails
        return `Hello {name}, kem cho? Time for your weekly Anjani 200ml water refill! Message us to schedule delivery. 😊`;
    }
}

async function sendBackgroundSms({ macroUrl, phone, message }) {
  const packet = `${normalizeIndianPhone(phone)}@@@${message}`;
  const finalUrl = `${macroUrl}?data=${encodeURIComponent(packet)}`;
  const res = await fetch(finalUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Webhook failed with status ${res.status}`);
  }
}

function buildFollowUpSmsMessage({ reminderDay }) {
  return `Sir/Madam, this is a gentle follow-up from Anjani Water, Vadodara. It's been ${reminderDay} day${reminderDay > 1 ? "s" : ""} since our last message. Can we help with your packaged water bottle requirement?`;
}

function getDueReminderContext(lead, now = new Date()) {
  const step = Number.isInteger(lead.followUpStep) ? lead.followUpStep : 0;

  if (step >= FOLLOW_UP_DAYS.length) {
    return { shouldMarkComplete: true };
  }

  const lastSmsAt = toDateObject(lead.lastSmsAt) || toDateObject(lead.smsSentAt);
  if (!lastSmsAt) {
      logger.warn(`Lead ${lead.id} has Tag 'SMS_SENT' but no smsSentAt or lastSmsAt timestamp. Skipping.`);
      return null;
  }

  const fallbackDueAt = new Date(lastSmsAt.getTime() + FOLLOW_UP_DAYS[step] * DAY_IN_MS);
  const dueAt = toDateObject(lead.nextFollowUpAt) || fallbackDueAt;
  if (dueAt > now) return null;

  return {
    shouldMarkComplete: false,
    reminderDay: FOLLOW_UP_DAYS[step],
    nextStep: step + 1
  };
}

function buildFollowUpUpdate({ lead, reminderDay, nextStep, now = new Date() }) {
  const { FieldValue, Timestamp } = require("firebase-admin/firestore");
  const payload = {
    followUpStep: nextStep,
    lastSmsAt: FieldValue.serverTimestamp(),
    smsCount: (Number(lead.smsCount) || 0) + 1,
    lastReminderDay: reminderDay
  };

  if (nextStep >= FOLLOW_UP_DAYS.length) {
    payload.Tag = "FOLLOWUP_DONE";
    payload.nextFollowUpAt = null;
    payload.followUpDoneAt = FieldValue.serverTimestamp();
  } else {
    payload.nextFollowUpAt = Timestamp.fromDate(
      new Date(now.getTime() + FOLLOW_UP_DAYS[nextStep] * DAY_IN_MS)
    );
  }

  return payload;
}

async function processDueFollowUpsInternal() {
  const now = new Date();
  const db = admin.firestore();

  const snap = await db
    .collection("leads")
    .where("Tag", "==", "SMS_SENT")
    .limit(100)
    .get();

  if (snap.empty) {
    return { checked: 0, sent: 0, markedDone: 0, skipped: 0 };
  }

  let checked = 0;
  let sent = 0;
  let markedDone = 0;
  let skipped = 0;

  const processingPromises = snap.docs.map(async (leadDoc) => {
    checked += 1;
    const lead = leadDoc.data();
    lead.id = leadDoc.id; // For logging
    const mobile = getLeadPhone(lead);
    if (!mobile) {
      skipped += 1;
      return;
    }

    const context = getDueReminderContext(lead, now);
    if (!context) {
      skipped += 1;
      return;
    }

    if (context.shouldMarkComplete) {
      await leadDoc.ref.update({ Tag: "FOLLOWUP_DONE" });
      markedDone += 1;
      return;
    }

    try {
        await sendBackgroundSms({
          macroUrl: MACRO_URL_FOLLOWUP,
          phone: mobile,
          message: buildFollowUpSmsMessage({
            name: lead.name,
            reminderDay: context.reminderDay
          })
        });

        await leadDoc.ref.update(
          buildFollowUpUpdate({
            lead,
            reminderDay: context.reminderDay,
            nextStep: context.nextStep,
            now
          })
        );
        sent += 1;
    } catch (e) {
        logger.error(`Failed to process follow-up for lead ${lead.id}:`, e);
        skipped += 1;
    }
  });

  await Promise.all(processingPromises);

  return { checked, sent, markedDone, skipped };
}

// Scheduled job: twice a week (Tuesday and Friday at 20:00 PM India Time)
exports.scheduleDueFollowUps = onSchedule(
  {
    schedule: "0 20 * * 2,5", // 8 PM on Tuesday and Friday
    timeZone: "Asia/Kolkata",
    retryCount: 2
  },
  async () => {
    logger.info("Starting bi-weekly follow-up job...");
    const result = await processDueFollowUpsInternal();
    logger.info("Bi-weekly follow-up job finished.", { result });
  }
);

exports.sendStaffLeadReminders = onSchedule(
  {
    schedule: "0 19 * * 3,6", // 7 PM on Wednesday and Saturday
    timeZone: "Asia/Kolkata",
    retryCount: 2
  },
  async () => {
    logger.info("Running bi-weekly staff lead reminder job.");
    const staffMobile = STAFF_MOBILE;
    const db = admin.firestore();

    try {
        const recentLeadsSnapshot = await db.collection("leads")
            .orderBy("createdAt", "desc")
            .limit(5)
            .get();

        if (recentLeadsSnapshot.empty) {
            logger.info("No recent leads found for staff reminder. Exiting.");
            return;
        }

        let leadsDetails = [];
        recentLeadsSnapshot.forEach(doc => {
            const lead = doc.data();
            const sName = sanitizeSmsField(lead.name);
            const sMobile = sanitizeSmsField(lead.mobile);
            leadsDetails.push(`- ${sName} (ID: ${doc.id}, Mobile: ${sMobile})`);
        });

        const mainMessage = `Hello Team, here are 5 recent leads for 200ml packaged drinking water. Please engage with them via call, message, or meeting to close the deal!

${leadsDetails.join('\n')}

Good luck!`;

        // Re-use existing helper function
        const cleanPhone = normalizeIndianPhone(staffMobile);

        const packet = `${cleanPhone}@@@${mainMessage}`;
        const baseUrl = MACRODROID_URL;
        const finalUrl = `${baseUrl}?data=${encodeURIComponent(packet)}`;

        const response = await fetch(finalUrl);

        if (response.ok) {
            logger.info("Staff lead reminder SMS sent successfully.");
        } else {
            logger.error("Staff lead reminder SMS failed:", { status: response.status });
        }

    } catch (error) {
        logger.error("Error running staff lead reminder job:", error);
    }
  }
);

/**
 * Scheduled job to identify regular clients and ask for new orders.
 * Runs every Monday at 11:00 AM India Time.
 */
exports.sendIntelligentOrderReminders = onSchedule(
  {
    schedule: "0 11 * * 1",
    timeZone: "Asia/Kolkata",
    retryCount: 1
  },
  async () => {
    logger.info("Starting intelligent order reminder job...");
    const db = admin.firestore();
    const now = new Date();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    try {
        // 1. Get clients marked as suitable for intelligent reminders
        // Added limit to prevent unbounded memory usage
        const clientsSnap = await db.collection("clients")
            .where("suitable_with_intelki", "==", true)
            .limit(200)
            .get();

        if (clientsSnap.empty) {
            logger.info("No clients found with suitable_with_intelki: true. Exiting.");
            return;
        }

        // Process sequentially to avoid webhook flooding
        for (const clientDoc of clientsSnap.docs) {
            const client = clientDoc.data();
            const clientId = clientDoc.id;
            const clientName = client.name || client.clientName || "Customer";
            const mobile = client.mobile || client.phone;

            if (!mobile) {
                logger.warn(`Client ${clientId} is missing a mobile number.`);
                continue;
            }

            // 2. Check last intelligent reminder date to avoid spamming
            const lastReminderAt = toDateObject(client.lastIntelligentReminderAt);
            if (lastReminderAt && (now.getTime() - lastReminderAt.getTime() < SEVEN_DAYS_MS)) {
                logger.info(`Client ${clientId} was recently reminded. Skipping.`);
                continue;
            }

            // 3. Find the most recent order for this client to determine if they need a refill
            const ordersSnap = await db.collection("orders")
                .where("clientName", "==", clientName)
                .limit(50) // Reasonable limit for checking history
                .get();

            if (ordersSnap.empty) {
                logger.info(`No orders found for client ${clientName}. Skipping.`);
                continue;
            }

            // Find the most recent order in memory (date is YYYY-MM-DD string)
            let lastOrder = null;
            ordersSnap.forEach(orderDoc => {
                const orderData = orderDoc.data();
                if (!lastOrder || orderData.date > lastOrder.date) {
                    lastOrder = orderData;
                }
            });

            if (!lastOrder || !lastOrder.date) {
                logger.warn(`Missing or invalid order date for client ${clientName}`);
                continue;
            }

            // 4. If last order was more than 7 days ago, send a friendly reminder
            const lastOrderDate = new Date(lastOrder.date);
            if (isNaN(lastOrderDate.getTime())) {
                logger.warn(`Invalid order date format for client ${clientName}: ${lastOrder.date}`);
                continue;
            }

            if (now.getTime() - lastOrderDate.getTime() >= SEVEN_DAYS_MS) {
                const sName = sanitizeSmsField(clientName);
                const message = `Hello ${sName}, this is Anjani Water. We noticed it's been about a week since your last order. Would you like to place a new order for packaged water bottles? You can order here: https://wa.me/919925997750. Have a great day!`;
                
                try {
                    await sendBackgroundSms({
                        macroUrl: MACRODROID_URL,
                        phone: mobile,
                        message: message
                    });

                    await clientDoc.ref.update({
                        lastIntelligentReminderAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    logger.info(`Intelligent reminder sent to ${sName} (${mobile})`);
                } catch (smsError) {
                    logger.error(`Failed to send intelligent reminder to ${sName}:`, smsError);
                }
            } else {
                logger.info(`Client ${clientName} ordered recently (${lastOrder.date}). No reminder needed.`);
            }
        }

        logger.info("Intelligent order reminder job finished.");
    } catch (error) {
        logger.error("Error running intelligent order reminder job:", error);
    }
  }
);

/**
 * Scheduled job to discover new B2B leads using Vertex AI.
 * Runs every Sunday at 08:00 AM India Time.
 */
exports.discoverLeadsWithAI = onSchedule(
  {
    schedule: "0 8 * * 0",
    timeZone: "Asia/Kolkata",
    retryCount: 1
  },
  async () => {
    logger.info("Starting AI lead discovery job...");
    const db = admin.firestore();
    
    try {
        // 1. Data Gathering (Mock implementation for now)
        // In a real scenario, this could be a fetch to Google Places, Eventbrite, or a news API.
        const mockRawData = `
        Upcoming events in Vadodara:
        - "Grand Wedding Expo" at Royal Palace Banquet (Contact: 9876543210).
        - "Corporate Tech Summit 2026" hosted by Elite Events Management. Call 9123456789 for inquiries.
        - New catering service "Spice & Serve" opening next week. Phone: 8888899999.
        `;
        
        logger.info("Gathered raw data for AI evaluation.");

        // 2. AI Evaluation & Extraction
        // Capping input data size to 2000 characters to keep prompt tokens (and costs) under control.
        const promptInput = mockRawData.substring(0, 2000);
        const prompt = `
        Extract at most 5 most relevant B2B leads (like event venues, event organizers, or caterers) from the following text. 
        Return ONLY a raw JSON array containing objects with the keys: 
        'name', 'mobile' (extract only the 10-digit number), 'business_type', and 'relevance_score' (1-10).
        Do not include markdown blocks like \`\`\`json or anything else. Just the raw JSON array.
        
        Text:
        ${promptInput}
        `;

        // Using generationConfig to cap output tokens and maintain cost control.
        const result = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: 800, // Capping response size
                temperature: 0.1,    // Ensuring focused, structured output
            }
        });
        const aiResponseText = result.response.candidates[0].content.parts[0].text;
        
        let leads = [];
        try {
            // Clean up potentially present markdown JSON blocks if AI ignored the instruction
            let cleanedText = aiResponseText.trim();
            if (cleanedText.startsWith('```json')) {
                cleanedText = cleanedText.substring(7);
            }
            if (cleanedText.startsWith('```')) {
                cleanedText = cleanedText.substring(3);
            }
            if (cleanedText.endsWith('```')) {
                cleanedText = cleanedText.substring(0, cleanedText.length - 3);
            }
            leads = JSON.parse(cleanedText.trim());
        } catch (_parseError) {
            logger.error("Failed to parse AI response into JSON:", aiResponseText);
            return;
        }

        logger.info(`AI extracted ${leads.length} potential leads.`);

        // 3. Database Insertion
        let addedCount = 0;
        for (const lead of leads) {
            // Strictly cap at 5 additions per run to prevent excessive Firestore writes and keep bill in control.
            if (addedCount >= 5) break; 

            if (lead.mobile && String(lead.mobile).length >= 10) {
                const cleanPhone = String(lead.mobile).replace(/\D/g, '').slice(-10);
                
                // Check if lead already exists to avoid duplicates
                const existingLeadSnap = await db.collection('leads').where('mobile', '==', cleanPhone).limit(1).get();
                
                if (existingLeadSnap.empty) {
                    await db.collection('leads').add({
                        name: lead.name || 'Unknown',
                        mobile: cleanPhone,
                        business_type: lead.business_type || 'Unknown',
                        relevance_score: lead.relevance_score || 0,
                        source: 'AI_Discovery',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        Tag: null // Trigger the SMS webhook
                    });
                    addedCount++;
                    logger.info(`Added new lead: ${lead.name} (${cleanPhone})`);
                } else {
                    logger.info(`Lead already exists: ${cleanPhone}`);
                }
            }
        }
        
        logger.info(`AI lead discovery job finished. Added ${addedCount} new leads.`);
    } catch (error) {
        logger.error("Error running AI lead discovery job:", error);
    }
  }
);

// --- NOTIFICATION SYSTEM FUNCTIONS ---
const { onCall } = require("firebase-functions/v2/https");

/**
 * Helper to broadcast a notification message to all users via FCM
 * and record it in the Firestore notifications collection.
 * Includes token chunking for robustness.
 */
async function broadcastNotification(message, title = "New Notification", pushMessage = null, tag = "broadcast-notification") {
  const db = admin.firestore();
  try {
    const newNotification = {
      message,
      title,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const notificationDocRef = await db.collection("notifications").add(newNotification);
    
    // Fetch all user devices to get FCM tokens across all users
    const devicesSnapshot = await db.collectionGroup("tokens").get();
    
    logger.info(`Broadcast (${tag}): Found ${devicesSnapshot.size} total token documents.`);

    if (devicesSnapshot.empty) {
      logger.info(`Broadcast (${tag}): No user devices found to send FCM.`);
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 };
    }

    const allTokens = [];
    devicesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        allTokens.push(data.token);
      }
    });

    if (allTokens.length === 0) {
      logger.info(`Broadcast (${tag}): No valid FCM tokens found.`);
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 };
    }

    const displayBody = pushMessage || message;
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    // FCM limit for sendEach is 500 messages per call
    const chunkSize = 500;
    for (let i = 0; i < allTokens.length; i += chunkSize) {
      const tokenChunk = allTokens.slice(i, i + chunkSize);
      
      const messages = tokenChunk.map(token => ({
        token,
        notification: { title, body: displayBody },
        data: {
          title,
          body: message,
          click_action: "https://anjaniappnew.firebaseapp.com",
          type: "broadcast",
          orderId: tag !== "broadcast-notification" ? tag : ""
        },
        android: {
          priority: "high",
          notification: {
            channelId: "order_alerts",
            priority: "high",
            defaultVibrateTimings: true,
            defaultSound: true
          }
        },
        webpush: {
          notification: {
            title,
            body: displayBody,
            icon: "/favicon.svg",
            badge: "/favicon.svg",
            vibrate: [200, 100, 200],
            requireInteraction: true,
            renotify: true,
            tag: tag
          },
          fcm_options: { link: "https://anjaniappnew.firebaseapp.com" }
        }
      }));

      const response = await admin.messaging().sendEach(messages);
      totalSuccessCount += response.successCount;
      totalFailureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            logger.info(`Broadcast (${tag}): Token ${tokenChunk[idx].substring(0, 10)}... failed with error: ${resp.error?.code}`);
          }
        });
      }
    }

    logger.info(`Broadcast (${tag}): Sent to ${totalSuccessCount} tokens; ${totalFailureCount} failed.`);
    return { id: notificationDocRef.id, ...newNotification, tokensNotified: totalSuccessCount };
  } catch (error) {
    logger.error("Error in broadcastNotification:", error);
    throw error;
  }
}

/**
 * Fetch the latest notifications for the app.
 */
exports.getNotifications = onCall(async (_request) => {
  try {
    const snapshot = await admin.firestore()
      .collection("notifications")
      .orderBy("timestamp", "desc")
      .limit(20)
      .get();

    const notifications = [];
    snapshot.forEach((doc) => {
      notifications.push({ id: doc.id, ...doc.data() });
    });

    return { notifications };
  } catch (error) {
    logger.error("Error fetching notifications:", error);
    throw new Error("Failed to fetch notifications");
  }
});

/**
 * Broadcast a notification to all users.
 */
exports.sendNotification = onCall(async (request) => {
  // In a real app, you'd check request.auth for admin permissions here
  const { message } = request.data;

  if (!message) {
    throw new Error("Message is required");
  }

  try {
    const result = await broadcastNotification(message);
    return { ...result, status: "success" };
  } catch (error) {
    logger.error("Error sending notification:", error);
    throw new Error("Failed to send notification");
  }
});

/**
 * Register or update a user device token.
 * Logs the login ID (mobile number or email) while registering.
 */
exports.registerDevice = onCall(async (request) => {
  const { token, loginId, deviceName } = request.data;
  // Use authenticated UID or fallback to loginId if not authenticated
  const userId = request.auth ? request.auth.uid : (loginId || "unknown");

  if (!token) {
    throw new Error("Token is required");
  }

  const db = admin.firestore();
  try {
    // Standardize to userDevices/{userId}/tokens/{token}
    const deviceRef = db.collection("userDevices").doc(userId).collection("tokens").doc(token);
    await deviceRef.set({
      token,
      loginId: loginId || "anonymous",
      deviceName: deviceName || "unknown",
      status: 'active', // Ensure the token is active when registered/refreshed
      lastRegistered: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`Device registered: ${token} for loginId: ${loginId} under user: ${userId}`);
    return { status: "success" };
  } catch (error) {
    logger.error("Error registering device:", error);
    throw new Error("Failed to register device");
  }
});

/**
 * Helper to check if a delivery time string is within the next 3.5 hours.
 * Uses IST for all comparisons to avoid UTC server issues.
 */
function isDeliverySoon(deliveryTimeStr, now) {
    if (!deliveryTimeStr || deliveryTimeStr === "N/A") return false;
    
    // Convert current time to IST string and back to Date to "shift" it
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const nowIST = new Date(istString);
    
    // Attempt to parse common time formats like "14:30", "02:30 PM", "2 PM"
    const match = deliveryTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!match) return true; // Fallback

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]) || 0;
    const ampm = match[3];

    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }

    // deliveryDateIST is based on the shifted nowIST
    const deliveryDateIST = new Date(nowIST);
    deliveryDateIST.setHours(hours, minutes, 0, 0);

    const diffMs = deliveryDateIST.getTime() - nowIST.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Return true if delivery is in the next 3.5 hours (slight buffer) and not more than 30 mins past
    return diffHours > -0.5 && diffHours <= 3.5;
}

/**
 * Hourly Delivery Reminders
 * Runs hourly from 7 AM to 9 PM IST to check for orders due soon.
 */
exports.hourlyDeliveryReminders = onSchedule({
    schedule: "0 7-21 * * *",
    timeZone: "Asia/Kolkata",
    retryCount: 1
}, async (_event) => {
    logger.info("Starting optimized hourly delivery reminder job...");
    const db = admin.firestore();
    const now = new Date();
    const todayStr = exports.formatDate(now);
    
    try {
        // Fetch today's orders. We filter status and pushReminderSent in memory 
        // to avoid complex index requirements for inequality filters.
        const snapshot = await db.collection('orders')
            .where('date', '==', todayStr)
            .get();

        if (snapshot.empty) {
            logger.info("No orders scheduled for today. Exiting.");
            return;
        }

        const ordersToRemind = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Data efficiency: Skip if already reminded, delivered, or cancelled
            if (data.pushReminderSent === true) return;
            const status = (data.status || "").toLowerCase();
            if (status === 'delivered' || status === 'cancelled' || data.isCancelled === true) return;

            const deliveryTime = data.time || data.deliveryTime;
            
            // Only proceed if delivery is "soon" (within next ~3 hours)
            if (deliveryTime && isDeliverySoon(deliveryTime, now)) {
                ordersToRemind.push({ id: doc.id, ref: doc.ref, ...data });
            }
        });

        if (ordersToRemind.length > 0) {
            let summaryMessage = "";
            if (ordersToRemind.length === 1) {
                const data = ordersToRemind[0];
                const deliveryTime = data.time || data.deliveryTime;
                summaryMessage = `Upcoming Delivery: Order for ${data.clientName || data.name || 'Customer'} is scheduled for ${deliveryTime} today. Qty: ${data.qty || data.quantity}`;
            } else {
                summaryMessage = `Upcoming Deliveries: You have ${ordersToRemind.length} orders due soon. Check the app for details.`;
            }

            await broadcastNotification(summaryMessage, "Delivery Reminder");

            const updatePromises = ordersToRemind.map(order => 
                order.ref.update({ pushReminderSent: true })
            );
            await Promise.all(updatePromises);
            
            logger.info(`Hourly delivery reminder job completed. Sent 1 summary push for ${ordersToRemind.length} orders.`);
        } else {
            logger.info("No orders are due for reminder in this window.");
        }
    } catch (e) {
        logger.error("Hourly Delivery Reminder Job Error:", e.message);
    }
});

// --- STAFF TASKS (JOBS) SYSTEM ---

/**
 * Intelligent Staff Task Reminders
 * Runs daily at 9:00 AM IST to remind staff of their 'new' and 'due' tasks.
 */
exports.intelligentStaffTaskReminders = onSchedule({
    schedule: "0 9 * * *", // 9:00 AM every day
    timeZone: "Asia/Kolkata",
    retryCount: 1
}, async (_event) => {
    logger.info("Starting intelligent staff task reminders job...");
    const db = admin.firestore();
    const now = new Date();

    try {
        // Query tasks that are new or due
        const jobsSnapshot = await db.collection("Jobs")
            .where("stage", "in", ["new", "due"])
            .get();

        if (jobsSnapshot.empty) {
            logger.info("No new or due tasks found. Exiting.");
            return;
        }

        const pendingTasks = [];
        jobsSnapshot.forEach(doc => {
            const data = doc.data();
            const taskDueDate = data.dueDate ? data.dueDate.toDate() : null;
            
            // Only include tasks that are past due or due within the next 24 hours
            if (taskDueDate && taskDueDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
                pendingTasks.push(`- ${data.text} (Due: ${taskDueDate.toLocaleDateString()})`);
            }
        });

        if (pendingTasks.length === 0) {
            logger.info("No tasks require immediate reminders today.");
            return;
        }

        // Limit the number of tasks sent to the AI to prevent exceeding prompt size
        const tasksSummary = pendingTasks.slice(0, 10).join('\n');
        
        const prompt = `You are the automated assistant for Anjani Water. Write a highly conversational, friendly, and natural SMS (max 160 characters) to the staff team reminding them about their pending tasks for today.
Here are the pending tasks:
${tasksSummary}

Keep the message short, professional but warm (Hinglish is okay). Don't list all tasks, just summarize the count and urge them to check the app/dashboard to complete them. End with a motivating remark.`;

        // Use Gemini to generate the human-like message
        const result = await generativeModel.generateContent(prompt);
        const aiMessage = result.response.candidates[0].content.parts[0].text.trim();
        logger.info("Generated AI Staff Reminder:", aiMessage);

        const STAFF_MOBILE_NUMBER = "917990943652"; // Hardcoded as per existing standard
        const MACRO_WEBHOOK = "https://trigger.macrodroid.com/c54612db-2ff7-4ff5-ac00-e428c1011e31/anjani_sms";
        const packet = `${STAFF_MOBILE_NUMBER}@@@${aiMessage}`;
        const finalUrl = `${MACRO_WEBHOOK}?data=${encodeURIComponent(packet)}`;

        const response = await fetch(finalUrl);
        if (response.ok) {
            logger.info("Successfully sent intelligent staff task reminder via SMS.");
        } else {
            logger.error("Failed to send staff task reminder SMS:", response.status);
        }
    } catch (error) {
        logger.error("Error in intelligent staff task reminders job:", error);
    }
});


// --- DEFAULTER PAYMENT REMINDER SYSTEM ---
// Runs every hour and checks Firestore config/defaulterReminder for the configured send time.
// Sends an AI-generated payment reminder SMS to all clients tagged as isDefaulter: true.

async function generateDefaulterPaymentSmsTemplate() {
    const prompt = `Write a very polite but firm SMS reminder (max 150 chars) for a customer who has a long-overdue payment for "Anjani 200ml Packaged Drinking Water".
Tone: professional, firm but respectful, slightly urgent.
Use Hinglish (Hindi + English) or Gujarati-English mix.
Include placeholder {name} for customer name and {amount} for outstanding balance in rupees.
End with a call-to-action to clear the payment via WhatsApp or cash.
Output only the plain SMS text, no quotes or formatting.`;

    try {
        const resp = await generativeModel.generateContent(prompt);
        const text = resp.response.candidates[0].content.parts[0].text.trim();
        return text;
    } catch (error) {
        logger.error("Error generating defaulter SMS AI template:", error);
        return `Namaste {name} ji, Anjani Water ki taraf se payment reminder. Aapka ₹{amount} outstanding hai. Krupaya jaldi payment clear karein. WhatsApp ya cash — dono chalega. Dhanyavaad! 🙏`;
    }
}

exports.sendDefaulterPaymentReminders = onSchedule({
    schedule: "0 * * * *", // every hour, on the hour
    timeZone: "Asia/Kolkata",
    retryCount: 1,
}, async (_event) => {
    const db = admin.firestore();

    // Load schedule config from Firestore
    let config;
    try {
        const configSnap = await db.collection('config').doc('defaulterReminder').get();
        config = configSnap.exists ? configSnap.data() : null;
    } catch (e) {
        logger.error("Failed to read defaulterReminder config:", e.message);
        return;
    }

    if (!config || !config.enabled) {
        logger.info("Defaulter reminder is disabled or config missing. Skipping.");
        return;
    }

    // Check if current IST hour matches configured hour
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentHour = nowIST.getHours();
    const currentMinute = nowIST.getMinutes();
    const configHour = Number(config.hour ?? 10);
    const configMinute = Number(config.minute ?? 0);

    // Allow a 5-minute window to account for schedule jitter
    const minutesDiff = (currentHour * 60 + currentMinute) - (configHour * 60 + configMinute);
    if (minutesDiff < 0 || minutesDiff > 5) {
        logger.info(`Not the scheduled time. Config: ${configHour}:${String(configMinute).padStart(2,'0')}, Current IST: ${currentHour}:${String(currentMinute).padStart(2,'0')}. Skipping.`);
        return;
    }

    logger.info(`Running defaulter payment reminder job at IST ${currentHour}:${String(currentMinute).padStart(2,'0')}.`);

    try {
        const defaultersSnap = await db.collection('customers')
            .where('isDefaulter', '==', true)
            .get();

        if (defaultersSnap.empty) {
            logger.info("No clients tagged as defaulter. Exiting.");
            return;
        }

        const smsTemplate = await generateDefaulterPaymentSmsTemplate();
        logger.info("Defaulter SMS template generated:", smsTemplate);

        const promises = defaultersSnap.docs.map(async (docSnap) => {
            const customer = docSnap.data();
            const mobile = customer.mobile || customer.phone;
            const name = customer.name || "Customer";
            const outstanding = Number(customer.outstanding || 0);

            if (!mobile) {
                logger.warn(`Defaulter ${docSnap.id} (${name}) has no mobile number. Skipping.`);
                return;
            }

            const message = smsTemplate
                .replace("{name}", name)
                .replace("{amount}", outstanding.toLocaleString('en-IN'));

            const cleanPhone = normalizeIndianPhone(mobile);
            const packet = `${cleanPhone}@@@${message}`;
            const finalUrl = `${MACRODROID_URL}?data=${encodeURIComponent(packet)}`;

            try {
                const response = await fetch(finalUrl);
                if (response.ok) {
                    logger.info(`Defaulter reminder sent to ${name} (${cleanPhone}), outstanding: ₹${outstanding}`);
                    await docSnap.ref.update({
                        lastDefaulterReminderSent: admin.firestore.FieldValue.serverTimestamp()
                    });
                } else {
                    logger.error(`Webhook failed for ${name} (${cleanPhone}): HTTP ${response.status}`);
                }
            } catch (e) {
                logger.error(`Error sending defaulter reminder to ${cleanPhone}:`, e.message);
            }
        });

        await Promise.all(promises);
        logger.info(`Defaulter reminder job complete. Processed ${defaultersSnap.docs.length} defaulter(s).`);
    } catch (error) {
        logger.error("Error in sendDefaulterPaymentReminders:", error);
    }
});
