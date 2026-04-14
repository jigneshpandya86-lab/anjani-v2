import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from 'firebase/messaging';
import { db } from '../firebase-config';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let messaging = null;

export async function initializeFcm(userId) {
  try {
    // Check if FCM is supported in this browser
    const supported = await isSupported();
    if (!supported) {
      return false;
    }

    // Initialize messaging
    messaging = getMessaging();

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return false;
    }

    // Get FCM token
    const vapidKey = import.meta.env.REACT_APP_VAPID_PUBLIC_KEY;
    const tokenOptions = vapidKey ? { vapidKey } : {};
    const token = await getToken(messaging, tokenOptions);

    if (!token) {
      return false;
    }

    // Store token in Firestore
    const tokenDocRef = doc(
      db,
      'userDevices',
      userId,
      'tokens',
      token.substring(0, 32) // Use first 32 chars as doc ID
    );

    await setDoc(tokenDocRef, {
      token: token,
      platform: 'web',
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });

    // Listen for messages when app is in foreground
    onMessage(messaging, (payload) => {
      handleForegroundMessage(payload);
    });

    return true;
  } catch (error) {
    console.error('Error initializing FCM:', error);
    return false;
  }
}

function handleForegroundMessage(payload) {
  const { notification, data } = payload;

  if (!notification) {
    return;
  }

  // Create and show notification programmatically
  if ('serviceWorker' in navigator && messaging) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(notification.title, {
        body: notification.body,
        icon: notification.icon || '/app-icon.png',
        badge: notification.badge || '/app-badge.png',
        tag: 'foreground-notification',
        data: data || {}
      });
    });
  }
}

export async function cleanupFcm(userId, token) {
  try {
    if (!token) return;

    const tokenDocRef = doc(
      db,
      'userDevices',
      userId,
      'tokens',
      token.substring(0, 32)
    );

    await deleteDoc(tokenDocRef);
  } catch (error) {
    console.error('Error cleaning up FCM:', error);
  }
}

export function getMessagingInstance() {
  return messaging;
}
