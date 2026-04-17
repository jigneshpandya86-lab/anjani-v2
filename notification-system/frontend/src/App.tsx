import React, { useState, useEffect } from 'react';
import NotificationBell from './components/NotificationBell';
import NotificationList from './components/NotificationList';
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyANmqfdu8rccsTrfTF_-m4D2aeRHRNaqsU",
  authDomain: "anjaniappnew.firebaseapp.com",
  projectId: "anjaniappnew",
  storageBucket: "anjaniappnew.firebasestorage.app",
  messagingSenderId: "892497799371",
  appId: "1:892497799371:web:5671e248e6c8f05d16934e"
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, "asia-south1");
const messaging = getMessaging(app);

interface Notification {
  id: number;
  message: string;
  timestamp: string | Date | any;
}

const App: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showList, setShowList] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tokenStatus, setTokenStatus] = useState<string>("Notification Permission Not Granted");

  const requestPermissionAndRegister = async () => {
    try {
      console.log('Requesting permission...');
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        
        // Get FCM token
        // Note: You may need a VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web configuration
        const token = await getToken(messaging, { 
          vapidKey: 'BDJ_S_m7_Q1_X_u7_v_Z_q_Q_H_G_F_D_S_A_Q_W_E_R_T_Y' // Replace with your actual VAPID key
        });

        if (token) {
          console.log('FCM Token:', token);
          setTokenStatus("Notifications Active");
          
          // Call registerDevice Cloud Function
          const registerDevice = httpsCallable(functions, 'registerDevice');
          await registerDevice({ 
            token, 
            loginId: "web-user-" + Math.floor(Math.random() * 1000), // Placeholder loginId
            deviceName: window.navigator.userAgent 
          });
          console.log('Device registered successfully');
        } else {
          console.warn('No registration token available. Request permission to generate one.');
          setTokenStatus("No Token Available");
        }
      } else {
        console.warn('Unable to get permission to notify.');
        setTokenStatus("Permission Denied");
      }
    } catch (error) {
      console.error('An error occurred while retrieving token:', error);
      setTokenStatus("Error: " + (error as Error).message);
    }
  };

  const fetchNotifications = async () => {
    try {
      const getNotifications = httpsCallable(functions, 'getNotifications');
      const result: any = await getNotifications();
      const data = result.data.notifications;
      
      setNotifications(data);
      if (!showList) {
        setUnreadCount(data.length);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const sendTestNotification = async () => {
    try {
      const message = `Live Test message at ${new Date().toLocaleTimeString()}`;
      const sendNotification = httpsCallable(functions, 'sendNotification');
      await sendNotification({ message });
      fetchNotifications();
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    
    // Automatically try to register if permission was already granted
    if (Notification.permission === 'granted') {
      requestPermissionAndRegister();
    }

    // Foreground message listener
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);
      // Refresh notifications list when a new one arrives
      fetchNotifications();
      // Optional: Show a custom toast or alert since browser won't show notification in foreground
      alert(`New Notification: ${payload.notification?.title}\n${payload.notification?.body}`);
    });

    // Poll every 10 seconds for new notifications in live mode
    const interval = setInterval(fetchNotifications, 10000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const handleBellClick = () => {
    setShowList(!showList);
    if (!showList) {
      setUnreadCount(0);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>App Live Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
           <span style={{ fontSize: '12px', color: tokenStatus.includes('Error') ? 'red' : 'green' }}>
             Status: {tokenStatus}
           </span>
           <NotificationBell count={unreadCount} onClick={handleBellClick} />
        </div>
      </div>

      <div className="controls">
        <button onClick={requestPermissionAndRegister}>
          Enable Notifications
        </button>
        <button onClick={sendTestNotification}>
          Trigger Live Message for All Users
        </button>
      </div>

      {showList && <NotificationList notifications={notifications} />}
    </div>
  );
};

export default App;
