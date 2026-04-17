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
  // Get start date based on filter type
  const monthStart = getDateRangeForFilter(dateRange);

  // Helper to check if order date is in range
  const isInRange = (orderDate) => {
    if (!orderDate) return false;

    // If orderDate is a string like "2026-04-13", convert to Date
    let d;
    if (typeof orderDate === 'string' && orderDate.length === 10) {
      // String format "YYYY-MM-DD"
      d = new Date(orderDate + 'T00:00:00');
    } else if (orderDate.toDate) {
      // Firestore Timestamp
      d = orderDate.toDate();
    } else {
      // Regular Date or ISO string
      d = new Date(orderDate);
    }

    return d >= monthStart;
  };

  // Check if order status is delivered (handle whitespace and case variations)
  const isDelivered = (status) => {
    const normalized = (status || '').trim().toLowerCase();
    return normalized === 'delivered' || normalized === 'completed';
  };

  // 1. Revenue - Sum of DELIVERED order amounts only
  // Use order.date field (string "YYYY-MM-DD") for date filtering
  const deliveredOrders = orders.filter((o) => {
    const orderDate = o.date || o.createdAt; // Prefer 'date' field over 'createdAt'
    return isInRange(orderDate) && isDelivered(o.status);
  });
  const revenue = deliveredOrders.reduce((sum, o) => sum + Number(o.qty || 0) * Number(o.rate || 0), 0);

  // 2. Orders - Count of DELIVERED orders only
  const orderCount = deliveredOrders.length;

  // 3. AOV - Average Order Value
  const aov = orderCount > 0 ? revenue / orderCount : 0;

  // 4. Pending Orders - Orders not delivered in date range
  const pendingOrderCount = orders.filter((o) => {
    const orderDate = o.date || o.createdAt;
    return isInRange(orderDate) && !isDelivered(o.status);
  }).length;

  // 5. New Customers - New clients added in range
  const newCustomerCount = clients.filter((c) => {
    const clientDate = c.date || c.createdAt;
    return isInRange(clientDate);
  }).length;

  // 6. Collection Rate - Collected vs Billed
  const billed = payments
    .filter((p) => {
      const paymentDate = p.date || p.createdAt;
      return isInRange(paymentDate) && (p.type === 'invoice' || p.type === 'order');
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const collected = payments
    .filter((p) => {
      const paymentDate = p.date || p.createdAt;
      return isInRange(paymentDate) && p.type === 'payment';
    })
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

  // 8. Total Outstanding - Sum of client-level due amounts
  const totalOutstanding = clients.reduce((sum, client) => {
    const outstanding = Number(client.outstanding || 0);
    return outstanding > 0 ? sum + outstanding : sum;
  }, 0);

  return {
    revenue: Math.round(revenue),
    orderCount,
    aov: Math.round(aov * 100) / 100,
    pendingOrderCount,
    newCustomerCount,
    collectionRate: Math.round(collectionRate),
    totalOutstanding: Math.round(totalOutstanding),
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
