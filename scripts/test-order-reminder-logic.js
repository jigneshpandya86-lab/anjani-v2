function getISTDate(now) {
  return new Date(now.getTime() + 5.5 * 3600 * 1000);
}

function isArriving(order, nowIst) {
  const [h, m] = order.time.split(':').map(Number);
  const orderTimeIst = new Date(nowIst);
  orderTimeIst.setHours(h, m, 0, 0);
  
  const diffMs = orderTimeIst.getTime() - nowIst.getTime();
  const diffHours = diffMs / (1000 * 3600);
  
  // Return true if between -0.1 (just passed) and 2 hours (coming soon)
  return diffHours > -0.1 && diffHours < 2;
}

// Test cases
const now = new Date('2026-04-14T10:00:00Z'); // 10:00 UTC = 15:30 IST
const nowIst = getISTDate(now);
console.log('Now UTC:', now.toISOString());
console.log('Now IST:', nowIst.toISOString());

const orders = [
  { time: '16:00', label: 'In 30 mins IST' },
  { time: '17:00', label: 'In 1.5 hours IST' },
  { time: '18:00', label: 'In 2.5 hours IST' },
  { time: '15:25', label: 'Just passed IST' },
  { time: '10:00', label: 'Long ago IST' }
];

orders.forEach(o => {
  console.log(`${o.label} (${o.time}): ${isArriving(o, nowIst)}`);
});
