import React from 'react';

interface NotificationBellProps {
  count: number;
  onClick: () => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ count, onClick }) => {
  return (
    <div className="bell-container" onClick={onClick}>
      <span className="bell-icon">🔔</span>
      {count > 0 && <span className="badge">{count}</span>}
    </div>
  );
};

export default NotificationBell;
