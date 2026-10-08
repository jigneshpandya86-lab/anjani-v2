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
  {
    id: 'bisleri_200ml',
    label: 'Bisleri 200ml',
    shortLabel: 'Bisleri 200ml',
    brand: 'Bisleri',
    size: '200ml',
    unit: 'Case / Box',
    badgeClass: 'border-teal-200 bg-teal-50 text-teal-800',
    color: '#0f766e',
  },
  {
    id: 'bisleri_1l',
    label: 'Bisleri 1 Liter',
    shortLabel: 'Bisleri 1L',
    brand: 'Bisleri',
    size: '1 Liter',
    unit: 'Case / Box',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    color: '#047857',
  },
]

export const DEFAULT_SKU = 'Anjani 200ml'

export const SKU_LABELS = WATER_SKUS.map((s) => s.label)

export function getSkuMeta(skuLabel) {
  const norm = String(skuLabel || '').trim().toLowerCase()
  if (!norm) return WATER_SKUS[0]

  // 1. Direct match on label, id, or shortLabel
  const exact = WATER_SKUS.find(
    (s) =>
      s.label.toLowerCase() === norm ||
      s.id.toLowerCase() === norm ||
      s.shortLabel.toLowerCase() === norm,
  )
  if (exact) return exact

  // 2. Bisleri specific matches
  if (norm.includes('bisleri')) {
    if (norm.includes('200')) {
      return WATER_SKUS.find((s) => s.id === 'bisleri_200ml') || WATER_SKUS[0]
    }
    if (
      norm.includes('1 l') ||
      norm.includes('1l') ||
      norm.includes('1 liter') ||
      norm.includes('1ltr') ||
      norm.includes('liter') ||
      norm.includes('litre')
    ) {
      return WATER_SKUS.find((s) => s.id === 'bisleri_1l') || WATER_SKUS[0]
    }
    return WATER_SKUS.find((s) => s.id === 'bisleri_1l') || WATER_SKUS[0]
  }

  // 3. Anjani specific matches
  if (norm.includes('anjani') || norm.includes('petli') || norm.includes('patli')) {
    return WATER_SKUS.find((s) => s.id === 'anjani_200ml') || WATER_SKUS[0]
  }

  // 4. Bailey specific matches
  if (norm.includes('bailey')) {
    if (norm.includes('250')) return WATER_SKUS.find((s) => s.id === 'bailey_250ml') || WATER_SKUS[0]
    if (norm.includes('500')) return WATER_SKUS.find((s) => s.id === 'bailey_500ml') || WATER_SKUS[0]
    if (norm.includes('2 l') || norm.includes('2l') || norm.includes('2 liter')) {
      return WATER_SKUS.find((s) => s.id === 'bailey_2l') || WATER_SKUS[0]
    }
    if (norm.includes('1 l') || norm.includes('1l') || norm.includes('1 liter')) {
      return WATER_SKUS.find((s) => s.id === 'bailey_1l') || WATER_SKUS[0]
    }
  }

  // 5. Fallback volume checks when brand is omitted
  if (norm.includes('500')) return WATER_SKUS.find((s) => s.id === 'bailey_500ml') || WATER_SKUS[0]
  if (norm.includes('250')) return WATER_SKUS.find((s) => s.id === 'bailey_250ml') || WATER_SKUS[0]
  if (norm.includes('2 l') || norm.includes('2l')) return WATER_SKUS.find((s) => s.id === 'bailey_2l') || WATER_SKUS[0]
  if (norm.includes('1 l') || norm.includes('1l')) return WATER_SKUS.find((s) => s.id === 'bailey_1l') || WATER_SKUS[0]
  if (norm.includes('200')) return WATER_SKUS.find((s) => s.id === 'anjani_200ml') || WATER_SKUS[0]

  return WATER_SKUS[0]
}
