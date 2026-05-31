const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { logger } = require("firebase-functions");
const { VertexAI } = require('@google-cloud/vertexai');

admin.initializeApp();

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

const IST_OFFSET = 5.5 * 3600 * 1000;

exports.sendRandomNotification = onSchedule({
  schedule: "0 * * * *",
  region: "asia-south1"
}, async (event) => {
  try {
    const db = admin.firestore();
    const messaging = admin.messaging();
    
    const nowUtc = new Date();
    const nowIst = new Date(nowUtc.getTime() + IST_OFFSET);
    const currentHourIst = nowIst.getHours();
    const dateStr = nowIst.toISOString().split('T')[0];
    
    // 1. EFFICIENCY: Exit early if outside 7 AM - 8 PM IST
    if (currentHourIst < 7 || currentHourIst > 20) {
      logger.info(`Outside active window (7AM-8PM IST). Current: ${currentHourIst}. Skipping.`);
      return;
    }

    // 2. CHECK FOR ORDER REMINDERS (PRIORITY)
    // Only read orders that are active and scheduled for today
    const ordersSnapshot = await db.collection('orders')
      .where('date', '==', dateStr)
      .where('status', 'in', ['Pending', 'Confirmed'])
      .get();
      
    const arrivingOrders = [];
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.reminderSent) return; // Skip if already notified

      const [h, m] = (data.time || "00:00").split(':').map(Number);
      const orderTimeIst = new Date(nowIst);
      orderTimeIst.setHours(h, m, 0, 0);
      
      const diffHours = (orderTimeIst.getTime() - nowIst.getTime()) / (1000 * 3600);
      
      // Remind if delivery is within the next 2 hours
      if (diffHours > -0.1 && diffHours < 2) {
        arrivingOrders.push({ id: doc.id, ...data });
      }
    });

    let tokens = null; // Deferred loading of tokens to save reads

    const getTokensOnce = async () => {
      if (tokens) return tokens;
      const snapshot = await db.collectionGroup('tokens').get();
      tokens = [];
      snapshot.forEach(doc => {
        const t = doc.data().token;
        if (t) tokens.push(t);
      });
      return tokens;
    };

    const sendToAll = async (payload) => {
      const activeTokens = await getTokensOnce();
      if (activeTokens.length === 0) return { success: 0 };
      
      let success = 0;
      for (let i = 0; i < activeTokens.length; i += 500) {
        const batch = activeTokens.slice(i, i + 500);
        const res = await messaging.sendEachForMulticast({ tokens: batch, ...payload });
        success += res.successCount;
      }
      return { success };
    };

    if (arrivingOrders.length > 0) {
      logger.info(`Processing ${arrivingOrders.length} order reminders.`);
      for (const order of arrivingOrders) {
        const title = `🚚 Delivery Arriving: ${order.clientName}`;
        const body = `${order.qty} Boxes due at ${order.time}. Tap for details.`;
        
        const message = {
          notification: { title, body },
          data: { link: '/orders' },
          webpush: {
            fcmOptions: { link: '/orders' },
            notification: { title, body, icon: '/favicon.svg', tag: `order-${order.id}` }
          }
        };

        const result = await sendToAll(message);
        await db.collection('orders').doc(order.id).update({ 
          reminderSent: true,
          reminderSentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        logger.info(`Sent reminder for ${order.orderId}. Reached ${result.success} devices.`);
      }
      return; // Skip random prompt if we handled orders
    }

    // 3. DAILY RANDOM PROMPT (FALLBACK)
    const hash = crypto.createHash('sha256').update(dateStr).digest('hex');
    const targetHour = parseInt(hash.substring(0, 2), 16) % 14 + 7; // Map to 7 AM - 8 PM window

    if (currentHourIst === targetHour) {
      const docRef = db.collection('fcmNotifications').doc(dateStr);
      const doc = await docRef.get();

      if (!doc.exists) {
        const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
        const message = {
          notification: { title: prompt.title, body: prompt.body },
          data: { link: prompt.link },
          webpush: {
            fcmOptions: { link: prompt.link },
            notification: { title: prompt.title, body: prompt.body, icon: '/favicon.svg' }
          }
        };

        const result = await sendToAll(message);
        await docRef.set({
          sent: true,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          successCount: result.success
        });
        logger.info(`Daily random prompt sent to ${result.success} devices.`);
      }
    }
  } catch (error) {
    logger.error('Error in notification scheduler:', error);
  }
});

// --- WEEKLY REGULAR CLIENT REMINDER SYSTEM ---

exports.sendWeeklyRegularOrderReminder = onSchedule(
  {
    schedule: "0 * * * *", // Run hourly, checks config/regularReminder to see if it should execute
    region: "asia-south1",
    retryCount: 2
  },
  async (_event) => {
    logger.info("Starting weekly regular client order reminder job check.");
    const db = admin.firestore();
    
    try {
      const configRef = db.collection('config').doc('regularReminder');
      const configDoc = await configRef.get();

      if (!configDoc.exists) {
        logger.warn("regularReminder config document not found. Exiting.");
        return;
      }

      const configData = configDoc.data();
      if (!configData.enabled) {
        logger.info("Regular client reminders are disabled in config. Exiting.");
        return;
      }

      // Get current local time details in India time zone
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

      // Check if today matches configured weekdays
      if (Array.isArray(configData.days) && !configData.days.includes(currentDayOfWeek)) {
        logger.info(`Today (weekday ${currentDayOfWeek} / ${dayName}) is not in the configured days [${configData.days.join(', ')}]. Exiting.`);
        return;
      }

      // Check if current hour matches configured hour
      const configHour = parseInt(configData.hour, 10);
      if (currentHour !== configHour) {
        logger.info(`Current hour (${currentHour}) does not match configured hour (${configHour}). Exiting.`);
        return;
      }

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
        const finalUrl = `${MACRODROID_URL}?data=${encodeURIComponent(packet)}`;

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

// --- DEFAULTER PAYMENT REMINDER SYSTEM ---

exports.sendWeeklyPaymentReminders = onSchedule(
  {
    schedule: "0 * * * *", // Run hourly, checks config/defaulterReminder to see if it should execute
    region: "asia-south1",
    retryCount: 2
  },
  async (_event) => {
    logger.info("Running defaulter payment reminder job.");
    const db = admin.firestore();
    try {
      const configRef = db.collection('config').doc('defaulterReminder');
      const configDoc = await configRef.get();

      if (!configDoc.exists) {
        logger.warn("defaulterReminder config document not found. Exiting.");
        return;
      }

      const configData = configDoc.data();
      if (!configData.enabled) {
        logger.info("Defaulter reminders are disabled in config. Exiting.");
        return;
      }

      // Get current local time details in India time zone
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

      // Check if today matches configured weekdays
      if (Array.isArray(configData.days) && !configData.days.includes(currentDayOfWeek)) {
        logger.info(`Today (weekday ${currentDayOfWeek} / ${dayName}) is not in the configured days [${configData.days.join(', ')}]. Exiting.`);
        return;
      }

      // Check if current hour matches configured hour
      const configHour = parseInt(configData.hour, 10);
      if (currentHour !== configHour) {
        logger.info(`Current hour (${currentHour}) does not match configured hour (${configHour}). Exiting.`);
        return;
      }

      // Query customers where isDefaulter is true
      const defaultersSnapshot = await db.collection('customers').where('isDefaulter', '==', true).get();

      if (defaultersSnapshot.empty) {
        logger.info("No customers set as defaulter found. Exiting.");
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

        // Only send if they have an outstanding balance > 0
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
        
        const cleanPhone = normalizeIndianPhone(clientMobile);
        const message = template
          .replace("{name}", clientName)
          .replace("{amount}", amountDue);

        const packet = `${cleanPhone}@@@${message}`;
        const finalUrl = `${MACRODROID_URL}?data=${encodeURIComponent(packet)}`;

        try {
          const response = await fetch(finalUrl);
          if (response.ok) {
            logger.info(`Defaulter payment reminder sent to ${clientName} (${cleanPhone})`);
            await doc.ref.update({ 
              lastPaymentReminderSent: admin.firestore.FieldValue.serverTimestamp()
            });
            sentCount++;
            sentDetails.push(`${clientName} (₹${amountDue})`);
          } else {
            logger.error(`Failed to send defaulter payment reminder to ${cleanPhone}:`, { status: response.status });
            failCount++;
          }
        } catch (e) {
          logger.error(`Error sending defaulter payment reminder to ${cleanPhone}:`, { error: e.message });
          failCount++;
        }
      });

      await Promise.all(promises);
      logger.info(`Finished processing defaulter payment reminders. Sent: ${sentCount}, Failed: ${failCount}, Skipped: ${skippedCount}`);

      // Option C Alert: Send SMS summary to staff/admin mobile
      if (sentCount > 0 || failCount > 0) {
        const alertMessage = `Defaulter Reminders Job Run Summary:\n- Sent: ${sentCount} reminders [${sentDetails.join(', ')}]\n- Failed: ${failCount}\n- Skipped: ${skippedCount}`;
        const cleanStaffPhone = normalizeIndianPhone("919925997750");
        const alertPacket = `${cleanStaffPhone}@@@${alertMessage}`;
        const alertUrl = `${MACRODROID_URL}?data=${encodeURIComponent(alertPacket)}`;
        
        try {
          const alertResponse = await fetch(alertUrl);
          if (alertResponse.ok) {
            logger.info("Admin alert SMS sent successfully.");
          } else {
            logger.error("Failed to send admin alert SMS:", alertResponse.status);
          }
        } catch (alertErr) {
          logger.error("Error sending admin alert SMS:", alertErr.message);
        }
      }
    } catch (error) {
      logger.error("Error running weekly payment reminder job:", error);
    }
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
 * Uses Gemini to generate a single engaging, fresh SMS template for the week's payment reminders.
 */
async function generateDefaulterPaymentSmsTemplate() {
  const prompt = `Write a very polite, short, and friendly SMS reminder (max 140 chars) for a customer regarding their overdue outstanding payment balance for "Anjani 200ml Packaged Drinking Water".
  The tone must be professional, gentle, and extremely polite, as we want to maintain a good relationship.
  Use a mix of Hindi and Gujarati (Hinglish/Gujlish style) if appropriate, but keep it clear.
  Include a placeholder {name} exactly where the customer's name should go, and {amount} exactly where the outstanding balance should go.
  Include a call to action to reply or WhatsApp to settle the amount.
  Avoid complex formatting. Just the plain text of the SMS template.`;

  try {
    const resp = await generativeModel.generateContent(prompt);
    const text = resp.response.candidates[0].content.parts[0].text.trim();
    return text;
  } catch (error) {
    logger.error("Error generating weekly payment AI template for defaulters:", error);
    return `Namaste {name} ji, a gentle reminder from Anjani Water regarding your outstanding balance of Rs {amount}. Krupaya contact karein aur payment clear karein. Thank you! 🙏`;
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
