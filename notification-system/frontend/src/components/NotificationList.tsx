import React from 'react';

interface Notification {
  id: number;
  message: string;
  timestamp: string | Date;
}

interface NotificationListProps {
  notifications: Notification[];
}

const NotificationList: React.FC<NotificationListProps> = ({ notifications }) => {
  return (
    <div className="notifications-panel">
      <h3>Notifications</h3>
      {notifications.length === 0 ? (
        <p>No new notifications</p>
      ) : (
        notifications.map((n) => (
          <div key={n.id} className="notification-item">
            <div className="message">{n.message}</div>
            <div className="timestamp">
              {new Date(n.timestamp).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default NotificationList;
