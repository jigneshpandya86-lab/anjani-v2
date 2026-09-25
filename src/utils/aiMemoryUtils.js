/**
 * AI Memory & Learned Error Avoidance Utilities
 * Detects memory commands, error corrections, and formats persistent memories for Gemini prompt injection.
 */

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
 * Detects if a user message is a memory/instruction command or an error correction.
 * @param {string} text - User message
 * @param {Array} knownClients - Optional array of known client objects
 * @returns {object|null} - { isMemory: boolean, rule: string, category: string, isCorrection: boolean } or null
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
        return {
          isMemory: true,
          isCorrection: true,
          category: 'error_correction',
          rule: sanitizeRuleText(rawRule),
          originalText: trimmed,
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
        const category = categorizeRule(rawRule, knownClients)
        return {
          isMemory: true,
          isCorrection: false,
          category,
          rule: sanitizeRuleText(rawRule),
          originalText: trimmed,
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
