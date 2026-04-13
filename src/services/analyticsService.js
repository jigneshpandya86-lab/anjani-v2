// KPI Computation Logic - All client-side, zero Firestore operations

export const getDateRangeForFilter = (filterType) => {
  const now = new Date();
  const startDate = new Date();

  switch (filterType) {
    case 'today': {
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'week': {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
    default: {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    }
  }

  return startDate;
};

export const computeAnalyticsKpis = (orders = [], payments = [], clients = [], dateRange = 'month') => {
  const monthStart = getDateRangeForFilter(dateRange);

  const isInRange = (date) => {
    if (!date) return false;
    const d = date.toDate ? date.toDate() : new Date(date);
    return d >= monthStart;
  };

  // 1. Revenue - Sum of DELIVERED order amounts only
  const deliveredOrders = orders.filter(
    (o) => isInRange(o.createdAt || o.date) && (o.status === 'Delivered' || o.status === 'delivered' || o.status === 'completed')
  );
  const revenue = deliveredOrders.reduce((sum, o) => sum + Number(o.qty || 0) * Number(o.rate || 0), 0);

  // 2. Orders - Count of DELIVERED orders only
  const orderCount = deliveredOrders.length;

  // 3. AOV - Average Order Value
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  // 4. Pending Orders - Orders not delivered
  const pendingOrderCount = orders.filter(
    (o) => o.status !== 'Delivered' && o.status !== 'delivered' && o.status !== 'completed'
  ).length;

  // 5. New Customers - New clients added in range
  const newCustomerCount = clients.filter((c) => isInRange(c.createdAt)).length;

  // 6. Collection Rate - Collected vs Billed
  const billed = payments
    .filter((p) => isInRange(p.createdAt) && (p.type === 'invoice' || p.type === 'order'))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const collected = payments
    .filter((p) => isInRange(p.createdAt) && p.type === 'payment')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;

  // 7. Top Customers - Top 5 by revenue (DELIVERED orders only)
  const customerRevenue = {};
  deliveredOrders.forEach((order) => {
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
