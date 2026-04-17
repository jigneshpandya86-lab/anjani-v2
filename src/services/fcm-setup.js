import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase-config';
import { doc, setDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';

let messaging = null;

export async function initializeFcm(userId, userEmail = null) {
  try {
    // Check if FCM is supported in this browser
    const supported = await isSupported();
    if (!supported) {
      return { success: false, reason: 'unsupported-browser' };
    }

    if (!('serviceWorker' in navigator)) {
      return { success: false, reason: 'service-worker-unavailable' };
    }

    // Register FCM service worker before requesting token
    const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    // Initialize messaging
    messaging = getMessaging();

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, reason: 'permission-denied' };
    }

    // Get FCM token
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.warn('VITE_FIREBASE_VAPID_KEY is not set. Notifications may not work.');
    }
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration });

    if (!token) {
      return { success: false, reason: 'token-missing' };
    }

    // Store token in Firestore (legacy collection)
    const tokenDocRef = doc(
      db,
      'userDevices',
      userId,
      'tokens',
      token
    );

    await setDoc(tokenDocRef, {
      token: token,
      loginId: userEmail || userId,
      platform: 'web',
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });
    const tokenSnapshot = await getDoc(tokenDocRef);

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

    return {
      success: true,
      token,
      tokenPreview: `${token.slice(0, 8)}...${token.slice(-8)}`,
      tokenStored: tokenSnapshot.exists(),
      serviceWorkerRegistration
    };
  } catch (error) {
    console.error('Error initializing FCM:', error);
    return { success: false, reason: 'unknown-error' };
  }
}

export async function sendLocalTestNotification(existingRegistration = null) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return false;
    }

    const notificationTitle = 'Test notification enabled ✅';
    const notificationOptions = {
      body: 'This device is now registered for Anjani Water alerts.',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'notification-test'
    };

    if (existingRegistration && typeof existingRegistration.showNotification === 'function') {
      await existingRegistration.showNotification(notificationTitle, notificationOptions);
      return true;
    }

    if ('serviceWorker' in navigator) {
      const readyRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 2000))
      ]);
      if (readyRegistration && typeof readyRegistration.showNotification === 'function') {
        await readyRegistration.showNotification(notificationTitle, notificationOptions);
        return true;
      }
    }

    // Fallback: show in-page notification without service worker dependency.
    // This ensures users get immediate feedback even if SW is still activating.
    new Notification(notificationTitle, notificationOptions);
    return true;
  } catch (error) {
    console.error('Failed to show local test notification:', error);
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
      token
    );

    await deleteDoc(tokenDocRef);
  } catch (error) {
    console.error('Error cleaning up FCM:', error);
  }
}

export function getMessagingInstance() {
  return messaging;
}
