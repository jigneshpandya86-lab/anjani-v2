// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Initialize Firebase in service worker (matches src/firebase-config.js)
firebase.initializeApp({
  apiKey: 'AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU',
  authDomain: 'anjaniappnew.firebaseapp.com',
  projectId: 'anjaniappnew',
  storageBucket: 'anjaniappnew.firebasestorage.app',
  messagingSenderId: '892497799371',
  appId: '1:892497799371:web:5671e248e6c8f05d16934e'
});

// Initialize messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Background message received:', payload);

  const { notification, data } = payload;

  const notificationOptions = {
    body: notification.body || 'New notification',
    icon: notification.icon || '/app-icon.png',
    badge: notification.badge || '/app-badge.png',
    tag: 'firebase-notification',
    data: data || {},
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: data?.actionText || 'Open'
      }
    ]
  };

  self.registration.showNotification(
    notification.title || 'Anjani',
    notificationOptions
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data?.link || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (clientList) => {
        // Check if app window is already open
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            client.focus();
            // Send message to app to navigate
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              link: link
            });
            return;
          }
        }
        // Open new window if not open
        if (clients.openWindow) {
          return clients.openWindow(link);
        }
      }
    )
  );
});
