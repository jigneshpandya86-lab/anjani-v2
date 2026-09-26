import { WATER_SKUS, DEFAULT_SKU, getSkuMeta } from '../constants/skus'

/**
 * Common regional slang, abbreviations, and unit terms used in Gujarati/Hindi beverage distribution.
 */
export const UNIT_SLANG_MAP = {
  petli: 'Box',
  petly: 'Box',
  patli: 'Box',
  kedi: 'Box',
  keti: 'Box',
  crate: 'Box',
  crata: 'Box',
  khokhu: 'Box',
  khokha: 'Box',
  case: 'Box',
  box: 'Box',
  boxes: 'Box',
  botal: 'Bottle',
  bottle: 'Bottle',
  bottles: 'Bottle',
  btl: 'Bottle',
  jar: 'Jar',
  can: 'Jar',
  dabbo: 'Jar',
  batch: 'Jar',
}

/**
 * Known product aliases mapped to standard SKU identifiers.
 */
export const SKU_ALIAS_PATTERNS = [
  {
    skuId: 'anjani_200ml',
    patterns: [
      /\b(?:anjani|anjny|anajni)\b/i,
      /\b(?:200\s*ml|200ml|200)\b/i,
      /\b(?:petli|patli)\b/i, // Petli traditionally refers to 200ml cup/bottle box
    ],
    priority: 1,
  },
  {
    skuId: 'bailey_250ml',
    patterns: [
      /\b(?:250\s*ml|250ml|250)\b/i,
      /\b(?:chhot[ai]|chhoti\s+botal|mini\s+bottle|quarter)\b/i,
    ],
    priority: 2,
  },
  {
    skuId: 'bailey_500ml',
    patterns: [
      /\b(?:500\s*ml|500ml|500)\b/i,
      /\b(?:aadho|adha|aadha|half)\s*(?:liter|litre|ltr|l)?\b/i,
    ],
    priority: 2,
  },
  {
    skuId: 'bailey_1l',
    patterns: [
      /\b(?:1\s*l(?:iter|itre|tr)?|1l|ek\s*liter)\b/i,
      /\b(?:bad[ai]\s+botal|big\s+bottle|full\s+bottle)\b/i,
    ],
    priority: 2,
  },
  {
    skuId: 'bailey_2l',
    patterns: [
      /\b(?:2\s*l(?:iter|itre|tr)?|2l|be\s*liter|do\s*liter)\b/i,
      /\b(?:jumbo|family\s*pack)\b/i,
    ],
    priority: 2,
  },
]

/**
 * Normalizes a unit string or slang into a canonical unit (Box, Bottle, Jar).
 * @param {string} rawUnit
 * @returns {string}
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit || typeof rawUnit !== 'string') return 'Box'
  const clean = rawUnit.toLowerCase().trim()
  return UNIT_SLANG_MAP[clean] || (clean.includes('box') || clean.includes('case') ? 'Box' : 'Box')
}

/**
 * Finds the matching SKU from freeform text using product aliases, volume identifiers, and brand keywords.
 * @param {string} text - Spoken or typed string (e.g. "5 petli 500ml", "10 chhota botal")
 * @param {Array} skusList - List of SKU objects (defaults to WATER_SKUS)
 * @returns {object} { sku: object, matchedAlias: string|null, confidence: number }
 */
export function findMatchingSku(text, skusList = WATER_SKUS) {
  if (!text || typeof text !== 'string') {
    return { sku: getSkuMeta(DEFAULT_SKU), matchedAlias: null, confidence: 0 }
  }

  const clean = text.toLowerCase().trim()

  // 1. Direct label or ID exact match
  for (const s of skusList) {
    if (s.label.toLowerCase() === clean || s.id.toLowerCase() === clean) {
      return { sku: s, matchedAlias: s.label, confidence: 1.0 }
    }
  }

  // 2. Specific volume checks (highest determinism)
  if (/\b(?:2\s*l|2\s*liter|2\s*ltr|2l|be\s*liter|do\s*liter)\b/i.test(clean)) {
    const s = skusList.find((x) => x.id === 'bailey_2l')
    if (s) return { sku: s, matchedAlias: '2L', confidence: 0.95 }
  }

  if (/\b(?:1\s*l|1\s*liter|1\s*ltr|1l|ek\s*liter|bad[ai]\s+botal)\b/i.test(clean)) {
    const s = skusList.find((x) => x.id === 'bailey_1l')
    if (s) return { sku: s, matchedAlias: '1L', confidence: 0.95 }
  }

  if (/\b(?:500\s*ml|500ml|500|aadho|adha|aadha|half)\b/i.test(clean)) {
    const s = skusList.find((x) => x.id === 'bailey_500ml')
    if (s) return { sku: s, matchedAlias: '500ml', confidence: 0.95 }
  }

  if (/\b(?:250\s*ml|250ml|250|chhot[ai]|chhoti\s+botal|quarter)\b/i.test(clean)) {
    const s = skusList.find((x) => x.id === 'bailey_250ml')
    if (s) return { sku: s, matchedAlias: '250ml', confidence: 0.95 }
  }

  if (/\b(?:200\s*ml|200ml|200|anjani|petli|patli)\b/i.test(clean)) {
    const s = skusList.find((x) => x.id === 'anjani_200ml')
    if (s) return { sku: s, matchedAlias: '200ml', confidence: 0.95 }
  }

  // 3. Fallback to standard getSkuMeta
  const fallback = getSkuMeta(clean)
  return { sku: fallback, matchedAlias: null, confidence: 0.6 }
}

/**
 * Extracts quantity, unit, and matching SKU from a raw order line.
 * Example: "5 petli 500ml" -> { qty: 5, unit: "Box", sku: Bailey 500ml }
 * Example: "20 box anjani" -> { qty: 20, unit: "Box", sku: Anjani 200ml }
 * Example: "chhoti botal 10" -> { qty: 10, unit: "Box", sku: Bailey 250ml }
 *
 * @param {string} line
 * @param {Array} skusList
 * @returns {object} { qty: number, unit: string, sku: object, matchedAlias: string|null }
 */
export function parseQuantityAndSku(line, skusList = WATER_SKUS) {
  if (!line || typeof line !== 'string') {
    return { qty: 1, unit: 'Box', sku: getSkuMeta(DEFAULT_SKU), matchedAlias: null }
  }

  const clean = line.trim()

  // Extract quantity number (e.g. "5 petli", "10", "x 12")
  let qty = 1
  const qtyMatch = clean.match(/(?:^|\s)(?:x\s*)?(\d+)(?:\s*(?:box|boxes|petli|kedi|case|crate|btl|bottle|jar))?/i)
  if (qtyMatch && qtyMatch[1]) {
    qty = Math.max(1, parseInt(qtyMatch[1], 10))
  }

  // Detect unit slang
  let unit = 'Box'
  for (const [slang, stdUnit] of Object.entries(UNIT_SLANG_MAP)) {
    const reg = new RegExp(`\\b${slang}\\b`, 'i')
    if (reg.test(clean)) {
      unit = stdUnit
      break
    }
  }

  const match = findMatchingSku(clean, skusList)
  return {
    qty,
    unit,
    sku: match.sku,
    matchedAlias: match.matchedAlias,
    confidence: match.confidence,
  }
}

/**
 * Returns a clean shorthand reference mapping for Gemini prompts.
 */
export function getSkuShorthandDict() {
  return [
    { slang: 'petli / patli / 200', sku: 'Anjani 200ml (Box)' },
    { slang: 'chhota / chhoti botal / 250', sku: 'Bailey 250ml (Case / Box)' },
    { slang: '500 / aadho liter / half liter', sku: 'Bailey 500ml (Case / Box)' },
    { slang: '1L / 1 liter / badi botal', sku: 'Bailey 1 Liter (Case / Box)' },
    { slang: '2L / 2 liter / jumbo', sku: 'Bailey 2 Liter (Case / Box)' },
    { slang: 'kedi / crate / box / khokhu', unit: 'Box unit' },
  ]
}
