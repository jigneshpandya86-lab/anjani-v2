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
    
    const isCancelled = currentStatus === "cancelled" || afterData.isCancelled === true;
    const wasCancelled = beforeData && (previousStatus === "cancelled" || beforeData.isCancelled === true);
    const justCancelled = isCancelled && !wasCancelled;

    const importantFields = [
        "clientName", "name", "qty", "quantity", "date", "time", "deliveryTime",
        "address", "deliveryAddress", "location", "area", "mapLink", "googleMapsLink", "mobile", "phone"
    ];

    let anyDetailChanged = false;
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
            }
        });
    }

    const isSkipStatus = currentStatus === "confirmed" || currentStatus === "delivered";

    let shouldSend = false;
    let statusHeader = "ORDER UPDATED";

    if (!beforeData) {
        // New order - ALWAYS send
        shouldSend = true;
        statusHeader = "NEW ORDER";
    } else if (justCancelled) {
        // Transition to cancelled - ALWAYS send
        shouldSend = true;
        statusHeader = "ORDER CANCELLED";
    } else if (anyDetailChanged && !isSkipStatus) {
        // Details changed and status is NOT confirmed or delivered
        shouldSend = true;
        statusHeader = isCancelled ? "ORDER CANCELLED" : "ORDER UPDATED";
    }

    if (!shouldSend) {
        const reason = isSkipStatus ? `status is ${currentStatus}` : "no important details changed";
        logger.info(`Skipping SMS for order ${event.params.docId} - ${reason}.`);
        return;
    }

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


    logger.info(`Constructed Staff message for ${event.params.docId}: ${message}`);

    // Send Push Notification
    try {
        await broadcastNotification(message, statusHeader);
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
exports.sendOrderReminder = async function sendOrderReminder(doc, type) {
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
    try {
        await broadcastNotification(message, `DELIVERY REMINDER (${type})`);
        logger.info(`Push reminder (${type}) sent for order: ${doc.id}`);
    } catch (pushError) {
        logger.error(`Error sending push reminder (${type}) for order:`, { orderId: doc.id, error: pushError.message });
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
}, async (event) => {
    logger.info("Running morning order reminder job.");
    try {
        const todayStr = exports.formatDate(new Date());
        const snapshot = await admin.firestore().collection('orders')
            .where('date', '==', todayStr).get();

        const promises = snapshot.docs.map(doc => exports.sendOrderReminder(doc, "TODAY"));
        await Promise.all(promises);
        logger.info(`Morning order reminder job completed. Sent ${promises.length} potential reminders.`);
    } catch (e) {
        logger.error("Morning Order Reminder Job Error:", e.message);
    }
});

// Evening reminder for TOMORROW's orders
exports.sendEveningOrderReminders = onSchedule({
    schedule: "0 20 * * *",
    timeZone: "Asia/Kolkata"
}, async (event) => {
    logger.info("Running evening order reminder job.");
    try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = exports.formatDate(tomorrow);

        const snapshot = await admin.firestore().collection('orders')
            .where('date', '==', tomorrowStr).get();

        const promises = snapshot.docs.map(doc => exports.sendOrderReminder(doc, "TOMORROW"));
        await Promise.all(promises);
        logger.info(`Evening order reminder job completed. Sent ${promises.length} potential reminders.`);
    } catch (e) {
        logger.error("Evening Order Reminder Job Error:", e.message);
    }
});

exports.sendWeeklyPaymentReminders = onSchedule({
    schedule: "every monday 18:00",
    timeZone: "Asia/Kolkata"
}, async (event) => {
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
    async (event) => {
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

function buildFollowUpSmsMessage({ name, reminderDay }) {
  const displayName = name || "Sir/Madam";
  return `Hello ${displayName}, this is a gentle follow-up from Anjani Water, Vadodara. It's been ${reminderDay} day${reminderDay > 1 ? "s" : ""} since our last message. Can we help with your packaged water bottle requirement?`;
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
        } catch (parseError) {
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
 * Internal helper to broadcast a notification message to all users via FCM
 * and record it in the Firestore notifications collection.
 */
async function broadcastNotification(message, title = "New Notification") {
  const db = admin.firestore();
  try {
    const newNotification = {
      message,
      title,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    const notificationDocRef = await db.collection("notifications").add(newNotification);
    
    // Fetch all user devices to get FCM tokens
    const devicesSnapshot = await db.collection("user_devices").get();
    
    if (devicesSnapshot.empty) {
      logger.info("No user devices found to send FCM.");
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 };
    }

    const tokens = [];
    const tokenDocMap = {};

    devicesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
        tokenDocMap[data.token] = doc.ref;
      }
    });

    if (tokens.length === 0) {
      logger.info("No valid FCM tokens found in user devices.");
      return { id: notificationDocRef.id, ...newNotification, tokensNotified: 0 };
    }

    // Prepare FCM payload
    const payload = {
      notification: {
        title: title,
        body: message,
      },
      tokens: tokens,
    };

    // Send to all tokens
    const response = await admin.messaging().sendEachForMulticast(payload);
    logger.info(`Broadcast: Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);

    // Cleanup dead tokens (DISABLED as per user request to ensure no device tokens are removed automatically)
    /*
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/invalid-registration-token' || errorCode === 'messaging/registration-token-not-registered') {
            failedTokens.push(tokens[idx]);
          }
        }
      });

      if (failedTokens.length > 0) {
        const batch = db.batch();
        failedTokens.forEach((token) => {
          const docRef = tokenDocMap[token];
          if (docRef) batch.delete(docRef);
        });
        await batch.commit();
        logger.info(`Broadcast: Deleted ${failedTokens.length} dead tokens.`);
      }
    }
    */

    return { id: notificationDocRef.id, ...newNotification, tokensNotified: response.successCount };
  } catch (error) {
    logger.error("Error in broadcastNotification:", error);
    throw error;
  }
}

/**
 * Fetch the latest notifications for the app.
 */
exports.getNotifications = onCall(async (request) => {
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

  if (!token) {
    throw new Error("Token is required");
  }

  const db = admin.firestore();
  try {
    const deviceRef = db.collection("user_devices").doc(token);
    await deviceRef.set({
      token,
      loginId: loginId || "anonymous",
      deviceName: deviceName || "unknown",
      lastRegistered: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`Device registered: ${token} for loginId: ${loginId}`);
    return { status: "success" };
  } catch (error) {
    logger.error("Error registering device:", error);
    throw new Error("Failed to register device");
  }
});

/**
 * Helper to check if a delivery time string is within the next 3 hours.
 */
function isDeliverySoon(deliveryTimeStr, now) {
    if (!deliveryTimeStr || deliveryTimeStr === "N/A") return false;
    
    // Attempt to parse common time formats like "14:30", "02:30 PM", "2 PM"
    const match = deliveryTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!match) return true; // Fallback: if we can't parse, assume it's soon to be safe

    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]) || 0;
    const ampm = match[3];

    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }

    const deliveryDate = new Date(now);
    deliveryDate.setHours(hours, minutes, 0, 0);

    const diffMs = deliveryDate.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    // Return true if delivery is in the next 3.5 hours (slight buffer) and not in the past
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
}, async (event) => {
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

        const promises = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Data efficiency: Skip if already reminded, delivered, or cancelled
            if (data.pushReminderSent === true) return;
            const status = (data.status || "").toLowerCase();
            if (status === 'delivered' || status === 'cancelled' || data.isCancelled === true) return;

            const deliveryTime = data.time || data.deliveryTime;
            
            // Only proceed if delivery is "soon" (within next ~3 hours)
            if (deliveryTime && isDeliverySoon(deliveryTime, now)) {
                promises.push((async () => {
                    const message = `Upcoming Delivery: Order for ${data.clientName || data.name || 'Customer'} is scheduled for ${deliveryTime} today. Qty: ${data.qty || data.quantity}`;
                    await broadcastNotification(message, "Delivery Reminder");
                    await doc.ref.update({ pushReminderSent: true });
                    logger.info(`Hourly push reminder sent for order: ${doc.id}`);
                })());
            }
        });

        if (promises.length > 0) {
            await Promise.all(promises);
            logger.info(`Hourly delivery reminder job completed. Sent ${promises.length} reminders.`);
        } else {
            logger.info("No orders are due for reminder in this window.");
        }
    } catch (e) {
        logger.error("Hourly Delivery Reminder Job Error:", e.message);
    }
});

/**
 * Daily General Broadcast
 * Runs daily at 8:30 AM IST to send a friendly morning notification to all app users.
 */
exports.dailyGeneralBroadcast = onSchedule({
    schedule: "30 8 * * *", 
    timeZone: "Asia/Kolkata",
    retryCount: 1
}, async (event) => {
    logger.info("Starting daily general broadcast job...");
    try {
        const prompt = `You are the automated assistant for Anjani Water, Vadodara. 
        Write a very short, friendly, and professional morning greeting for our customers (max 100 characters). 
        Wish them a great day and mention that we are ready to serve their packaged water needs today. 
        Hinglish is okay. Avoid being too salesy; keep it warm and helpful.`;

        logger.info("Requesting content from Gemini...");
        const result = await generativeModel.generateContent(prompt);
        
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
            throw new Error("No response candidates from Gemini");
        }
        
        const aiMessage = result.response.candidates[0].content.parts[0].text.trim();
        logger.info(`Generated AI message: ${aiMessage}`);
        
        const broadcastResult = await broadcastNotification(aiMessage, "Anjani Water Morning Update");
        logger.info("Daily general broadcast sent successfully.", broadcastResult);
    } catch (error) {
        logger.error("Error in daily general broadcast job:", {
            error: error.message,
            stack: error.stack
        });
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
}, async (event) => {
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

