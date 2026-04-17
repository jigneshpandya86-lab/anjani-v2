import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-config';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

let messaging = null;

export async function initializeFcm(userId, userEmail = null) {
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
    const vapidKey = import.meta.env.VITE_VAPID_KEY || 'BDJ_S_m7_Q1_X_u7_v_Z_q_Q_H_G_F_D_S_A_Q_W_E_R_T_Y'; 
    const token = await getToken(messaging, { vapidKey });

    if (!token) {
      return false;
    }

    // Store token in Firestore (legacy collection)
    const tokenDocRef = doc(
      db,
      'userDevices',
      userId,
      'tokens',
      token.substring(0, 32)
    );

    await setDoc(tokenDocRef, {
      token: token,
      platform: 'web',
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });

    // Call the new registerDevice Cloud Function for consolidated logging
    try {
        const functions = getFunctions(undefined, "asia-south1");
        const registerDevice = httpsCallable(functions, 'registerDevice');
        await registerDevice({ 
          token, 
          loginId: userEmail || userId,
          deviceName: window.navigator.userAgent 
        });
    } catch (regError) {
        console.error('Error calling registerDevice function:', regError);
    }

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
