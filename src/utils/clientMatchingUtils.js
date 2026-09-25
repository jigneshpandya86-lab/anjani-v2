import { ensureEnglishText } from './textUtils'

/**
 * Normalizes an Indian personal or business name to its core phonetic signature.
 * Strips honorifics, common business descriptors, vowel variations (ee/i, oo/u),
 * consonant variations (w/v, ph/f, sh/s), and collapses repeated letters.
 *
 * @param {string} raw - Name or phrase to normalize
 * @returns {string} Phonetic key in uppercase
 */
export function getPhoneticKey(raw) {
  if (!raw || typeof raw !== 'string') return ''

  // 1. Transliterate if Gujarati or Devanagari
  let str = ensureEnglishText(raw).toLowerCase().trim()

  // 2. Remove punctuation and non-alphanumeric (keep spaces)
  str = str.replace(/[^a-z0-9\s]/g, ' ')

  // 3. Remove common business suffixes, prefixes, and honorific words (as separate words)
  const businessWords = [
    'provision', 'provisions', 'store', 'stores', 'kirana', 'general',
    'super', 'market', 'supermarket', 'mart', 'agency', 'agencies',
    'enterprise', 'enterprises', 'trader', 'traders', 'trading',
    'hotel', 'restaurant', 'dhaba', 'cafe', 'parlor', 'parlour',
    'center', 'centre', 'dairy', 'farm', 'tea', 'stall', 'ice', 'cream',
    'cold', 'drink', 'drinks', 'beverage', 'beverages', 'foods', 'food',
    'bakery', 'sweets', 'farsan', 'point', 'corner',
    'bhai', 'ben', 'kumar', 'sinh', 'singh', 'seth', 'sheth', 'babu', 'ji',
    'shree', 'shri', 'sri', 'om', 'jay', 'jai'
  ]
  const words = str.split(/\s+/).filter(Boolean)
  const filteredWords = words.filter((w) => !businessWords.includes(w))
  str = (filteredWords.length > 0 ? filteredWords : words).join(' ')

  // 4. Remove Indian honorific suffixes attached to words (e.g., "sandipbhai" -> "sandip")
  str = str.replace(/\b([a-z]{3,})(?:bhai|ben|kumar|sinh|singh|seth|sheth|babu|ji|lal|chand)\b/g, '$1')

  // 5. Phonetic transformations:
  // Vowels and digraphs
  str = str.replace(/ee|ea/g, 'i')
  str = str.replace(/oo|ou/g, 'u')
  str = str.replace(/ai|ay|ey/g, 'e')
  str = str.replace(/au|aw/g, 'o')
  str = str.replace(/y\b/g, 'i') // e.g. Rony -> Roni

  // Consonants
  str = str.replace(/ph/g, 'f')
  str = str.replace(/w/g, 'v')
  str = str.replace(/sh/g, 's')
  str = str.replace(/z/g, 'j')
  str = str.replace(/ck|c/g, 'k')

  // 6. Collapse duplicate letters: "dd" -> "d", "pp" -> "p", "tt" -> "t"
  str = str.replace(/([a-z])\1+/g, '$1')

  // 7. Strip remaining whitespace for a tight comparison key
  return str.replace(/\s+/g, '').toUpperCase()
}

/**
 * Computes Levenshtein distance between two strings.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0
  if (!a) return b ? b.length : 0
  if (!b) return a.length

  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[m][n]
}

/**
 * Computes similarity ratio (0 to 1) between two strings using Levenshtein distance.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 1 = identical, 0 = completely different
 */
export function similarityRatio(a, b) {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const dist = levenshteinDistance(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return (maxLen - dist) / maxLen
}

/**
 * Finds a matching client from an array of clients using multi-stage matching:
 * 1. Exact Name match (case-insensitive)
 * 2. Mobile match (if 10-digit mobile provided)
 * 3. Phonetic Key match (e.g. Sandeep === Sandip, Sandipbhai === Sandeep, Pradeep === Pradip)
 * 4. Business Substring match (e.g. "Jay Ambe" in "Jay Ambe Provision Store")
 * 5. Fuzzy match (Levenshtein distance <= 2, similarity >= 0.82)
 *
 * @param {string} rawName - The name to search for
 * @param {Array} clients - Array of customer documents
 * @param {Object} options - { mobile, threshold }
 * @returns {Object|null} { matched: true, client, matchType, confidence, canonicalName }
 */
export function findMatchingClient(rawName, clients = [], options = {}) {
  if (!rawName && !options.mobile) return null
  if (!Array.isArray(clients) || clients.length === 0) return null

  const targetName = String(rawName || '').trim()
  const targetLower = targetName.toLowerCase()
  const targetMobile = options.mobile ? String(options.mobile).replace(/\D/g, '').slice(-10) : ''

  // Tier 1: Mobile Match (Highest fidelity if provided)
  if (targetMobile && targetMobile.length === 10) {
    const mobileMatch = clients.find((c) => {
      const cMob = String(c.mobile || c.phone || '').replace(/\D/g, '').slice(-10)
      return cMob === targetMobile
    })
    if (mobileMatch) {
      return {
        matched: true,
        client: mobileMatch,
        matchType: 'mobile',
        confidence: 1.0,
        canonicalName: mobileMatch.name,
      }
    }
  }

  if (!targetName) return null

  // Tier 2: Exact Name Match
  const exactMatch = clients.find((c) => c?.name && c.name.toLowerCase().trim() === targetLower)
  if (exactMatch) {
    return {
      matched: true,
      client: exactMatch,
      matchType: 'exact',
      confidence: 1.0,
      canonicalName: exactMatch.name,
    }
  }

  // Tier 3: Phonetic Key Match (Sandeep <-> Sandip, Pradeep <-> Pradip, Nilesh <-> Neelesh)
  const targetPhonetic = getPhoneticKey(targetName)
  if (targetPhonetic && targetPhonetic.length >= 3) {
    let phoneticMatch = clients.find((c) => {
      if (!c?.name) return false
      return getPhoneticKey(c.name) === targetPhonetic
    })
    if (!phoneticMatch && targetPhonetic.length >= 4) {
      phoneticMatch = clients.find((c) => {
        if (!c?.name) return false
        const cPhonetic = getPhoneticKey(c.name)
        return (
          cPhonetic.includes(targetPhonetic) ||
          (cPhonetic.length >= 4 && targetPhonetic.includes(cPhonetic))
        )
      })
    }
    if (phoneticMatch) {
      return {
        matched: true,
        client: phoneticMatch,
        matchType: 'phonetic',
        confidence: 0.95,
        canonicalName: phoneticMatch.name,
      }
    }
  }

  // Tier 4: Business Word / Core Substring Match
  // E.g. Query "Jay Ambe" matches "Jay Ambe Provision Store" or vice-versa
  const cleanTarget = targetLower.replace(/[^a-z0-9]/g, '')
  if (cleanTarget.length >= 4) {
    const substringMatch = clients.find((c) => {
      if (!c?.name) return false
      const cleanC = c.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (cleanC.length < 4) return false
      return cleanTarget.includes(cleanC) || cleanC.includes(cleanTarget)
    })
    if (substringMatch) {
      return {
        matched: true,
        client: substringMatch,
        matchType: 'substring',
        confidence: 0.90,
        canonicalName: substringMatch.name,
      }
    }
  }

  // Tier 5: Fuzzy Similarity Match (Typos like "Sundip" or "Sandep")
  let bestMatch = null
  let bestScore = 0
  const threshold = options.threshold || 0.82

  for (const c of clients) {
    if (!c?.name) continue
    const cLower = c.name.toLowerCase().trim()
    const score = similarityRatio(targetLower, cLower)
    if (score >= threshold && score > bestScore) {
      bestScore = score
      bestMatch = c
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      client: bestMatch,
      matchType: 'fuzzy',
      confidence: bestScore,
      canonicalName: bestMatch.name,
    }
  }

  return null
}
