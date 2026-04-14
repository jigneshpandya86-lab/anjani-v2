const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { logger } = require("firebase-functions");

admin.initializeApp();

const PROMPTS = [
  { title: 'Ready to connect?', body: 'Ready to connect with new leads?', link: '/leads' },
  { title: 'Payments due', body: 'Check your outstanding payments', link: '/payments' },
  { title: 'Follow up needed', body: 'Follow up with pending customers', link: '/clients' },
  { title: 'New opportunities', body: 'Time to reach out to your leads!', link: '/leads' }
];

const IST_OFFSET = 5.5 * 3600 * 1000;

exports.sendRandomNotification = onSchedule("0 * * * *", async (event) => {
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
