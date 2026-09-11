export const WATER_SKUS = [
  {
    id: 'anjani_200ml',
    label: 'Anjani 200ml',
    shortLabel: '200ml',
    brand: 'Anjani',
    size: '200ml',
    unit: 'Box',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-800',
    color: '#1e40af',
  },
  {
    id: 'bailey_250ml',
    label: 'Bailey 250ml',
    shortLabel: '250ml',
    brand: 'Bailey',
    size: '250ml',
    unit: 'Case / Box',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    color: '#065f46',
  },
  {
    id: 'bailey_500ml',
    label: 'Bailey 500ml',
    shortLabel: '500ml',
    brand: 'Bailey',
    size: '500ml',
    unit: 'Case / Box',
    badgeClass: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    color: '#155e75',
  },
  {
    id: 'bailey_1l',
    label: 'Bailey 1 Liter',
    shortLabel: '1L',
    brand: 'Bailey',
    size: '1 Liter',
    unit: 'Case / Box',
    badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    color: '#3730a3',
  },
  {
    id: 'bailey_2l',
    label: 'Bailey 2 Liter',
    shortLabel: '2L',
    brand: 'Bailey',
    size: '2 Liter',
    unit: 'Case / Box',
    badgeClass: 'border-purple-200 bg-purple-50 text-purple-800',
    color: '#6b21a8',
  },
]

export const DEFAULT_SKU = 'Anjani 200ml'

export const SKU_LABELS = WATER_SKUS.map((s) => s.label)

export function getSkuMeta(skuLabel) {
  const found = WATER_SKUS.find(
    (s) => s.label.toLowerCase() === String(skuLabel || '').toLowerCase(),
  )
  return found || WATER_SKUS[0]
}
