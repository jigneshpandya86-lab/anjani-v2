// KPI Computation Logic - All client-side, zero Firestore operations

export const computeAnalyticsKpis = (orders = [], payments = [], clients = []) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const isThisMonth = (date) => {
    if (!date) return false;
    const d = date.toDate ? date.toDate() : new Date(date);
    return d >= monthStart;
  };

  // 1. Revenue (MTD) - Sum of order amounts
  const revenue = orders
    .filter((o) => isThisMonth(o.createdAt || o.date))
    .reduce((sum, o) => sum + Number(o.qty || 0) * Number(o.rate || 0), 0);

  // 2. Orders (MTD) - Count of orders
  const orderCount = orders.filter((o) => isThisMonth(o.createdAt || o.date)).length;

  // 3. AOV - Average Order Value
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  // 4. Pending Orders - Orders not delivered
  const pendingOrderCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'completed'
  ).length;

  // 5. New Customers (MTD) - New clients added this month
  const newCustomerCount = clients.filter((c) => isThisMonth(c.createdAt)).length;

  // 6. Collection Rate - Collected vs Billed
  const billed = payments
    .filter((p) => isThisMonth(p.createdAt) && (p.type === 'invoice' || p.type === 'order'))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const collected = payments
    .filter((p) => isThisMonth(p.createdAt) && p.type === 'payment')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;

  // 7. Top Customers - Top 5 by revenue
  const customerRevenue = {};
  orders
    .filter((o) => isThisMonth(o.createdAt || o.date))
    .forEach((order) => {
      const clientId = order.clientId || order.customerId || order.client_id;
      if (!clientId) return;

      const client = clients.find((c) => c.id === clientId);
      const clientName = client?.name || `Client ${clientId.slice(0, 8)}`;
      const amount = Number(order.qty || 0) * Number(order.rate || 0);

      if (customerRevenue[clientId]) {
        customerRevenue[clientId].revenue += amount;
      } else {
        customerRevenue[clientId] = { name: clientName, revenue: amount };
      }
    });

  const topCustomers = Object.entries(customerRevenue)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    revenue: Math.round(revenue),
    orderCount,
    aov: Math.round(aov * 100) / 100,
    pendingOrderCount,
    newCustomerCount,
    collectionRate: Math.round(collectionRate),
    topCustomers,
    lastUpdated: new Date(),
  };
};

// Format currency for display
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};
