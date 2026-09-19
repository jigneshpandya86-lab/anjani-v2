export const DEFAULT_ACCOUNTS = [
  {
    id: 'nilesh',
    name: 'Nilesh',
    shortLabel: 'Nilesh',
    type: 'custody',
    color: '#2563eb', // Blue
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Delivery Staff Cash Custody',
  },
  {
    id: 'hiteshbhai',
    name: 'Hiteshbhai',
    shortLabel: 'Hiteshbhai',
    type: 'custody',
    color: '#7c3aed', // Purple
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Delivery Staff Cash Custody',
  },
  {
    id: 'counter',
    name: 'Counter / Jigneshbhai',
    shortLabel: 'Counter Cash',
    type: 'cash',
    color: '#059669', // Emerald
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Primary Cash Drawer',
    isDefault: true,
  },
  {
    id: 'bank',
    name: 'Bank / UPI',
    shortLabel: 'Bank',
    type: 'bank',
    color: '#ea580c', // Orange
    bgLight: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'Bank & QR Code Collections',
  },
]

export function getAccountMeta(accountId) {
  const found = DEFAULT_ACCOUNTS.find((a) => a.id === accountId)
  if (found) return found
  return {
    id: accountId || 'counter',
    name: accountId ? String(accountId).toUpperCase() : 'Counter Cash',
    shortLabel: accountId || 'Counter',
    type: 'cash',
    color: '#4b5563',
    bgLight: 'bg-gray-50 text-gray-700 border-gray-200',
    description: 'General Account',
  }
}
