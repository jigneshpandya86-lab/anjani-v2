export const TASK_TYPES = {
  LEADS: 'LEADS',
  PAYMENTS: 'PAYMENTS',
  ORDER_DELIVERED: 'ORDER_DELIVERED',
};

export async function cancelPendingSmsJobsForEntity() {
  // SMS feature disabled: no-op
  return Promise.resolve();
}

export async function enqueueSmsJobsForEvent() {
  // SMS feature disabled: no-op
  return Promise.resolve();
}

export async function buildSmsJobsFromConfig() {
  // SMS feature disabled: no-op
  return [];
}
