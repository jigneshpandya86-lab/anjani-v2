/**
 * AI Memory & Learned Error Avoidance Utilities
 * Detects memory commands, error corrections, extracts dual-layer structured metadata,
 * detects and resolves rule conflicts, and slices memories for cost & token optimization.
 */

import { findMatchingClient } from './clientMatchingUtils'
import { findMatchingSku } from './skuAliasUtils'

// Patterns that identify the user is giving an instruction or teaching the AI
const MEMORY_INSTRUCTION_PATTERNS = [
  /^(?:remember(?:\s+that)?|yad\s+rakhjo|yaad\s+rakhna|store\s+in\s+memory|add\s+rule|note\s+down|rule:)\s*[:\-]?\s*(.+)$/i,
  /^(?:from\s+now\s+on|aaj\s+thi|have\s+thi|aage\s+se)\s*[:\-,\.]?\s*(.+)$/i,
  /^(?:always\s+remember|keep\s+in\s+mind)\s*[:\-]?\s*(.+)$/i,
]

// Patterns that identify the user is correcting an error the AI just made
const CORRECTION_PATTERNS = [
  /^(?:that(?:'s|\s+is)\s+(?:wrong|incorrect|a\s+mistake)|this\s+is\s+wrong|khotu\s+chhe|bhul\s+chhe|galat\s+hai)\s*[:\-,\.]?\s*(.+)$/i,
  /^(?:no,\s+|incorrect[:\s]+|correction[:\s]+|mistake[:\s]+)(.+)$/i,
  /^(?:don't|do\s+not|never)\s+(?:repeat|use|confuse|make)\s+(.+)$/i,
  /(?:not\s+\d+[\s\w]*,\s*(?:it\s+is|use|rate\s+is|qty\s+is)\s+\d+)/i,
]

// Patterns to check if user is asking to view or list memories
const QUERY_MEMORY_PATTERNS = [
  /(?:what\s+do\s+you\s+remember|show\s+memories|list\s+memories|show\s+(?:my\s+)?rules|what\s+are\s+your\s+rules|what\s+did\s+you\s+learn)/i,
]

/**
 * Extracts structured metadata (Client ID, SKU, Rate, Day, Topic) from rule text.
 * @param {string} ruleText
 * @param {Array} knownClients
 * @returns {object} structured metadata
 */
export function extractStructuredRuleData(ruleText, knownClients = []) {
  if (!ruleText || typeof ruleText !== 'string') return {}

  const clean = ruleText.trim()
  const lower = clean.toLowerCase()

  // 1. Identify Client
  let matchedClient = null
  if (Array.isArray(knownClients) && knownClients.length > 0) {
    for (const c of knownClients) {
      if (!c?.name) continue
      const cNorm = c.name.toLowerCase().trim()
      if (cNorm.length >= 3 && lower.includes(cNorm)) {
        matchedClient = c
        break
      }
    }
    if (!matchedClient) {
      const res = findMatchingClient(clean, knownClients)
      if (res?.client) {
        matchedClient = res.client
      }
    }
  }

  // 2. Identify SKU
  const skuRes = findMatchingSku(clean)
  const matchedSku = skuRes?.confidence >= 0.8 ? skuRes.sku : null

  // 3. Extract Rate (e.g. "rate is 115", "rate: 110", "at 120", "115 rs", "₹115", "rate 110")
  let enforcedRate = null
  const rateMatch =
    clean.match(/(?:rate|price|bhav)\s*(?:is|of|for|at|[:=])?\s*(?:rs\.?|₹)?\s*(\d+(?:\.\d+)?)/i) ||
    clean.match(/(?:at|for|rs\.?|₹)\s*(\d+(?:\.\d+)?)\s*(?:rs|rupees|\/-|per\s+box|\/box)?/i) ||
    clean.match(/\b(\d+(?:\.\d+)?)\s*(?:rs|rupees|\/-)\b/i) ||
    clean.match(/(?:not\s+\d+[\s\w]*,\s*(?:it\s+is|use|rate\s+is)\s+(\d+(?:\.\d+)?))/i)

  if (rateMatch && rateMatch[1]) {
    const r = parseFloat(rateMatch[1])
    if (!isNaN(r) && r > 0 && r < 5000) {
      enforcedRate = r
    }
  }

  // 4. Extract Delivery Day
  let deliveryDay = null
  const dayMatch = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
  if (dayMatch) {
    deliveryDay = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase()
  }

  // 5. Determine structured action/type
  let type = 'general'
  if (matchedClient && enforcedRate !== null) {
    type = 'client_rate'
  } else if (matchedClient && deliveryDay) {
    type = 'client_delivery_day'
  } else if (matchedClient) {
    type = 'client_rule'
  } else if (matchedSku && enforcedRate !== null) {
    type = 'sku_rate'
  } else if (/(?:means?|stands?\s+for|petli|box|shorthand)/i.test(lower)) {
    type = 'shorthand'
  } else if (deliveryDay) {
    type = 'delivery_day'
  }

  return {
    type,
    clientId: matchedClient?.id || null,
    clientName: matchedClient?.name || null,
    skuId: matchedSku?.id || null,
    skuLabel: matchedSku?.label || null,
    enforcedRate,
    deliveryDay,
  }
}

/**
 * Checks if a newly taught rule conflicts with or supersedes an existing active rule.
 * Example: "Royal Hotel rate is 110" conflicts with existing "Royal Hotel rate is 115".
 *
 * @param {object} newIntent - The detected memory intent
 * @param {Array} existingMemories - Array of active memory documents
 * @param {Array} knownClients - Array of client records
 * @returns {object} { hasConflict: boolean, conflictingMemory: object|null, reason: string|null }
 */
export function detectRuleConflict(newIntent, existingMemories = [], knownClients = []) {
  if (!newIntent || !Array.isArray(existingMemories) || existingMemories.length === 0) {
    return { hasConflict: false, conflictingMemory: null, reason: null }
  }

  const newStruct = newIntent.structured || extractStructuredRuleData(newIntent.rule, knownClients)
  const activeExisting = existingMemories.filter((m) => m && m.active !== false && m.rule)

  for (const oldMem of activeExisting) {
    const oldStruct = oldMem.structured || extractStructuredRuleData(oldMem.rule, knownClients)

    // Conflict Check 1: Client Rate conflict
    // Same client AND either same SKU or both setting rates for the client
    if (
      newStruct.clientId &&
      oldStruct.clientId &&
      newStruct.clientId === oldStruct.clientId &&
      newStruct.enforcedRate !== null &&
      oldStruct.enforcedRate !== null
    ) {
      // If SKUs match OR if either doesn't specify SKU (general client rate)
      if (
        !newStruct.skuId ||
        !oldStruct.skuId ||
        newStruct.skuId === oldStruct.skuId
      ) {
        return {
          hasConflict: true,
          conflictingMemory: oldMem,
          reason: `Found existing rate rule of ₹${oldStruct.enforcedRate} for ${newStruct.clientName || 'this client'}`,
        }
      }
    }

    // Conflict Check 2: Delivery Day conflict for same client
    if (
      newStruct.clientId &&
      oldStruct.clientId &&
      newStruct.clientId === oldStruct.clientId &&
      newStruct.deliveryDay &&
      oldStruct.deliveryDay &&
      newStruct.deliveryDay !== oldStruct.deliveryDay
    ) {
      return {
        hasConflict: true,
        conflictingMemory: oldMem,
        reason: `Found existing delivery schedule (${oldStruct.deliveryDay}) for ${newStruct.clientName || 'this client'}`,
      }
    }

    // Conflict Check 3: Error correction superseding an old rule on same client
    if (
      newIntent.isCorrection &&
      newStruct.clientId &&
      oldStruct.clientId &&
      newStruct.clientId === oldStruct.clientId
    ) {
      return {
        hasConflict: true,
        conflictingMemory: oldMem,
        reason: `Correction supersedes prior client rule for ${newStruct.clientName || 'this client'}`,
      }
    }
  }

  return { hasConflict: false, conflictingMemory: null, reason: null }
}

/**
 * Detects if a user message is a memory/instruction command or an error correction.
 * @param {string} text - User message
 * @param {Array} knownClients - Optional array of known client objects
 * @returns {object|null} - { isMemory: boolean, rule: string, category: string, isCorrection: boolean, structured: object } or null
 */
export function detectMemoryIntent(text, knownClients = []) {
  if (!text || typeof text !== 'string') return null
  const trimmed = text.trim()
  if (trimmed.length < 5) return null

  // 1. Check for error corrections
  for (const pattern of CORRECTION_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) {
      const rawRule = (match[1] || match[0]).trim()
      if (rawRule.length >= 4) {
        const sanitized = sanitizeRuleText(rawRule)
        const structured = extractStructuredRuleData(sanitized, knownClients)
        return {
          isMemory: true,
          isCorrection: true,
          category: 'error_correction',
          rule: sanitized,
          originalText: trimmed,
          structured,
        }
      }
    }
  }

  // 2. Check for explicit memory commands
  for (const pattern of MEMORY_INSTRUCTION_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match && match[1]) {
      const rawRule = match[1].trim()
      if (rawRule.length >= 4) {
        const sanitized = sanitizeRuleText(rawRule)
        const category = categorizeRule(sanitized, knownClients)
        const structured = extractStructuredRuleData(sanitized, knownClients)
        return {
          isMemory: true,
          isCorrection: false,
          category,
          rule: sanitized,
          originalText: trimmed,
          structured,
        }
      }
    }
  }

  return null
}

/**
 * Checks if the user is asking to see what the AI remembers.
 * @param {string} text
 * @returns {boolean}
 */
export function isQueryingMemories(text) {
  if (!text || typeof text !== 'string') return false
  return QUERY_MEMORY_PATTERNS.some((p) => p.test(text.trim()))
}

/**
 * Categorizes a rule based on keywords or matched entities.
 */
function categorizeRule(rule, knownClients = []) {
  const lower = rule.toLowerCase()

  if (/(?:error|mistake|wrong|incorrect|never\s+do|don't\s+mix)/.test(lower)) {
    return 'error_correction'
  }

  if (/(?:means?|stands?\s+for|petli|box|shorthand|short\s+form)/.test(lower)) {
    return 'shorthand'
  }

  if (/(?:nilesh|hiteshbhai|driver|staff|counter|handover|cash\s+drawer)/.test(lower)) {
    return 'staff_rule'
  }

  if (/(?:delivery|afternoon|morning|timing|tuesday|sunday|route|vehicle)/.test(lower)) {
    return 'operational'
  }

  if (Array.isArray(knownClients) && knownClients.some((c) => c?.name && lower.includes(c.name.toLowerCase()))) {
    return 'client_rule'
  }

  if (/(?:rate|price|discount|per\s+box|client|hotel|dhaba|store)/.test(lower)) {
    return 'client_rule'
  }

  return 'general_rule'
}

/**
 * Sanitizes rule text into clean sentence case.
 */
function sanitizeRuleText(text) {
  if (!text) return ''
  let clean = text.replace(/^[:\-,\s]+/, '').replace(/[\s\.\?!]+$/, '').trim()
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1)
  }
  return clean
}

/**
 * Context-Targeted Rule Slicing (Cost & Token Optimizer).
 * Slices memories dynamically so only relevant rules are sent in the prompt,
 * saving 50-70% tokens and preventing prompt dilution.
 *
 * @param {Array} memories - All active memories
 * @param {object} context - { queryText: string, clientName: string, mode: string }
 * @returns {Array} Sliced, prioritized array of memories
 */
export function sliceMemoriesForContext(memories = [], context = {}) {
  if (!Array.isArray(memories) || memories.length === 0) return []

  const active = memories.filter((m) => m && m.active !== false && m.rule)
  if (active.length <= 15) return active // Small bank, safe to send all

  const queryText = String(context.queryText || '').toLowerCase()
  const targetClient = String(context.clientName || '').toLowerCase()

  const selected = []
  const remaining = []

  for (const m of active) {
    const struct = m.structured || {}
    const ruleLower = String(m.rule || '').toLowerCase()

    // 1. Always include error corrections (highest priority)
    if (m.category === 'error_correction' || m.isCorrection) {
      selected.push(m)
      continue
    }

    // 2. Client-targeted match
    if (
      (targetClient && (struct.clientName?.toLowerCase().includes(targetClient) || ruleLower.includes(targetClient))) ||
      (queryText && struct.clientName && queryText.includes(struct.clientName.toLowerCase()))
    ) {
      selected.push(m)
      continue
    }

    // 3. Shorthand mappings if relevant to sales/orders
    if (m.category === 'shorthand' && (!context.mode || context.mode === 'sales' || context.mode === 'auto')) {
      selected.push(m)
      continue
    }

    remaining.push(m)
  }

  // Fill up to a safe cap of 20 rules
  while (selected.length < 20 && remaining.length > 0) {
    selected.push(remaining.shift())
  }

  return selected
}

/**
 * Formats an array of memories for injection into Gemini system prompts.
 * @param {Array} memories - List of memory objects [{ rule, category, active }]
 * @returns {string} - Injected prompt block
 */
export function formatMemoriesForPrompt(memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) return ''

  const activeMemories = memories.filter((m) => m && m.active !== false && m.rule)
  if (activeMemories.length === 0) return ''

  const categoryHeaders = {
    error_correction: '⚠️ Past Learned Error Corrections (DO NOT REPEAT THESE MISTAKES)',
    client_rule: '👤 Client & Pricing Rules',
    shorthand: '📖 Shorthand & Slang Mappings',
    staff_rule: '🚚 Staff & Cash Custody Rules',
    operational: '⏱️ Delivery & Route Operations',
    general_rule: '📌 Business Directives',
  }

  // Group by category
  const grouped = {}
  for (const m of activeMemories) {
    const cat = m.category || 'general_rule'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(m.rule)
  }

  let output = '\n\n## 🧠 PERMANENT BUSINESS MEMORIES & LEARNED ERROR CORRECTIONS (STRICTLY ENFORCE):\n'
  output += 'The owner (Jignesh Pandya) has trained you with the following strict rules and error corrections. You MUST prioritize and obey every single rule below across all orders, calculations, OCR, and replies:\n\n'

  for (const [cat, rules] of Object.entries(grouped)) {
    output += `### ${categoryHeaders[cat] || cat.toUpperCase()}:\n`
    rules.forEach((r, idx) => {
      output += `${idx + 1}. ${r}\n`
    })
    output += '\n'
  }

  return output.trimEnd()
}
