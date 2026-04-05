import admin from 'firebase-admin';
import crypto from 'crypto';

// Notification prompts
const PROMPTS = [
  {
    title: 'Ready to connect?',
    body: 'Ready to connect with new leads?',
    link: '/leads',
    actionText: 'Connect'
  },
  {
    title: 'Payments due',
    body: 'Check your outstanding payments',
    link: '/payments',
    actionText: 'Review'
  },
  {
    title: 'Follow up needed',
    body: 'Follow up with pending customers',
    link: '/clients',
    actionText: 'Check'
  },
  {
    title: 'New opportunities',
    body: 'Time to reach out to your leads!',
    link: '/leads',
    actionText: 'Go'
  }
];

async function sendRandomNotification() {
  try {
    // Validate environment variables
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.error('Error: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set');
      console.error('Please add FIREBASE_SERVICE_ACCOUNT_KEY to GitHub Secrets');
      process.exit(1);
    }

    if (!process.env.FIREBASE_PROJECT_ID) {
      console.error('Error: FIREBASE_PROJECT_ID environment variable is not set');
      console.error('Please add FIREBASE_PROJECT_ID to GitHub Secrets');
      process.exit(1);
    }

    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        console.log(`✅ Firebase credentials loaded for project: ${serviceAccount.project_id}`);
      } catch (parseError) {
        console.error('Error: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY');
        console.error('Make sure it is a valid JSON string');
        console.error('Error details:', parseError.message);
        process.exit(1);
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      console.log(`✅ Firebase Admin SDK initialized`);
    }

    const db = admin.firestore();
    console.log(`✅ Firestore database connected`);

    // Calculate target hour based on date (deterministic)
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const hash = crypto.createHash('sha256').update(dateStr).digest('hex');
    const targetHour = parseInt(hash.substring(0, 2), 16) % 24;
    const currentHour = new Date().getUTCHours();

    console.log(`Target hour: ${targetHour}, Current hour: ${currentHour}`);

    // Check if this is the target hour
    if (currentHour !== targetHour) {
      console.log('Not target hour, skipping');
      return;
    }

    // Check if already sent today
    const docRef = db.collection('fcmNotifications').doc(dateStr);
    const doc = await docRef.get();

    if (doc.exists) {
      console.log('Already sent today, skipping');
      return;
    }

    // Fetch all FCM tokens
    const tokensSnapshot = await db.collectionGroup('tokens').get();
    const tokens = [];

    console.log(`Total token documents found: ${tokensSnapshot.size}`);

    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      const token = data.token;
      console.log(`Token doc: ${doc.ref.path}, has token: ${!!token}`);
      if (token) {
        tokens.push(token);
        console.log(`Added token: ${token.substring(0, 20)}...`);
      }
    });

    console.log(`Total valid tokens: ${tokens.length}`);

    if (tokens.length === 0) {
      console.log('⚠️ No FCM tokens found in Firestore!');
      console.log('Check if userDevices/{userId}/tokens/ collection has documents');
      return;
    }

    console.log(`✅ Found ${tokens.length} FCM tokens to send to`);

    // Select random prompt
    const randomIndex = Math.floor(Math.random() * PROMPTS.length);
    const prompt = PROMPTS[randomIndex];

    console.log(`Sending prompt: ${prompt.title}`);

    // Send multicast message
    const message = {
      notification: {
        title: prompt.title,
        body: prompt.body
      },
      data: {
        link: prompt.link,
        actionText: prompt.actionText
      },
      webpush: {
        fcmOptions: {
          link: prompt.link
        },
        notification: {
          title: prompt.title,
          body: prompt.body,
          icon: '/app-icon.png',
          badge: '/app-badge.png',
          tag: 'random-notification',
          requireInteraction: false
        }
      }
    };

    // Send in batches (FCM multicast limit is 500)
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const response = await admin.messaging().sendMulticast({
        tokens: batch,
        ...message
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.log(`Failed to send to token: ${batch[idx]}`);
          }
        });
      }
    }

    // Mark as sent today
    await docRef.set({
      sent: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      promptIndex: randomIndex,
      successCount,
      failureCount
    });

    console.log(`Notification sent successfully. Success: ${successCount}, Failures: ${failureCount}`);
  } catch (error) {
    console.error('Error sending notification:', error);
    process.exit(1);
  }
}

sendRandomNotification();

