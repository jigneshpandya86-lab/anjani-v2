const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory store for notifications
let notifications = [
  { id: 1, message: 'Welcome to the Notification System!', timestamp: new Date() }
];

// Endpoint to fetch all notifications
app.get('/api/notifications', (req, res) => {
  res.json(notifications);
});

// Endpoint to broadcast a new notification to all users
app.post('/api/notify-all', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const newNotification = {
    id: notifications.length + 1,
    message,
    timestamp: new Date()
  };

  notifications.push(newNotification);
  console.log(`New notification broadcasted: ${message}`);
  res.status(201).json(newNotification);
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
