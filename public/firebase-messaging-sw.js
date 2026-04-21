importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU",
  authDomain: "anjaniappnew.firebaseapp.com",
  projectId: "anjaniappnew",
  storageBucket: "anjaniappnew.firebasestorage.app",
  messagingSenderId: "892497799371",
  appId: "1:892497799371:web:5671e248e6c8f05d16934e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const title = payload.notification?.title || payload.data?.title || 'Anjani Water Update';
  const body = payload.notification?.body || payload.data?.body || '';
  
  const notificationOptions = {
    body: body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data,
    tag: 'background-notification',
    renotify: true
  };

  self.registration.showNotification(title, notificationOptions);
});
