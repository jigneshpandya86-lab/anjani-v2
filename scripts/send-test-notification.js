import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const app = initializeApp({
  projectId: 'anjaniappnew'
});
const db = getFirestore(app);
const messaging = getMessaging(app);

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

async function sendTestNotification() {
  try {
    const tokensSnapshot = await db.collectionGroup('tokens').get();
    const tokens = [];

    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });

    if (tokens.length === 0) {
      console.log('No tokens found');
      return;
    }

    console.log(`Found ${tokens.length} tokens. Sending notification...`);

    const message = {
      notification: {
        title: 'Hi Good time to connect',
        body: 'Hi Good time to connect'
      },
      data: {
        link: '/leads',
        actionText: 'Connect'
      },
      webpush: {
        fcmOptions: {
          link: '/leads'
        },
        notification: {
          title: 'Hi Good time to connect',
          body: 'Hi Good time to connect',
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'test-notification',
          requireInteraction: false
        }
      }
    };

    const response = await messaging.sendEachForMulticast({
      tokens: tokens,
      ...message
    });

    console.log(`Successfully sent ${response.successCount} messages.`);
    console.log(`Failed to send ${response.failureCount} messages.`);
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Error sending to token ${tokens[idx]}:`, resp.error);
        }
      });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
}

sendTestNotification();
