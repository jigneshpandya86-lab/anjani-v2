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
    const tokenRefs = [];

    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      // Only include active tokens
      if (data.token && data.status !== 'invalid') {
        tokens.push(data.token);
        tokenRefs.push(doc.ref);
      }
    });

    if (tokens.length === 0) {
      console.log('No active tokens found');
      return;
    }

    console.log(`Found ${tokens.length} active tokens. Sending notification...`);

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
      for (let idx = 0; idx < response.responses.length; idx++) {
        const resp = response.responses[idx];
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.error(`Error sending to token ${tokens[idx]}:`, errorCode);
          
          if (errorCode === 'messaging/registration-token-not-registered' || 
              errorCode === 'messaging/invalid-registration-token') {
            console.log(`Marking token ${tokens[idx]} as invalid...`);
            await tokenRefs[idx].update({ 
              status: 'invalid',
              invalidAt: new Date(),
              lastError: errorCode
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
  }
}

sendTestNotification();
