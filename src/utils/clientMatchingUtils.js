import { ensureEnglishText } from './textUtils'

export const COMMON_INDIAN_SURNAMES = new Set([
  'PATEL', 'PARMAR', 'SHAH', 'SOLANKI', 'CHAUHAN', 'PANCHAL', 'RAVAL',
  'PRAJAPATI', 'JOSHI', 'BHATT', 'SHARMA', 'GOHIL', 'RATHOD', 'MAKWANA',
  'DESAI', 'THAKOR', 'THAKKAR', 'MISTRY', 'SONI', 'VORA', 'MODI', 'MEHTA',
  'PANDYA', 'DAVE', 'VYAS', 'TRIVEDI', 'SHUKLA', 'JADEJA', 'ZALA', 'BARIA',
  'PADHIYAR', 'VASAVA', 'TADVI', 'KAPADIA', 'DALAL', 'CHOKSHI'
])

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

  // 1. Transliterate if Gujarati or Devanagari, and split camelCase/PascalCase (e.g. AlpeshbhaiParmar -> Alpeshbhai Parmar)
  let str = ensureEnglishText(raw)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim()

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
    'caterer', 'caterers', 'catering', 'decorators', 'decorator', 'mandap', 'party', 'plot',
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

  // Indian aspirated consonants / digraphs:
  // Gujarati/Hindi mahaprana letters (ધ, થ, ભ, ખ, ઘ, ઝ, છ) commonly transliterated with 'h'
  str = str.replace(/dh/g, 'd')
  str = str.replace(/th/g, 't')
  str = str.replace(/bh/g, 'b')
  str = str.replace(/kh/g, 'k')
  str = str.replace(/gh/g, 'g')
  str = str.replace(/jh/g, 'j')
  str = str.replace(/chh/g, 'c')
  str = str.replace(/ch/g, 'c')

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

  // Special Isolation: Generic walk-in / retail customers should NEVER be phonetically
  // or fuzzily matched to named business clients or individuals (e.g. Dr. Rahul Vasava).
  const isGenericRetail =
    targetLower === 'retail' ||
    targetLower === 'counter' ||
    targetLower === 'walk-in' ||
    targetLower === 'walkin' ||
    targetLower === 'unknown' ||
    /^customer\s*\d*$/i.test(targetName)

  if (isGenericRetail) {
    const retailClient = clients.find(
      (c) => c?.name && c.name.toLowerCase().trim() === 'retail'
    )
    if (retailClient) {
      return {
        matched: true,
        client: retailClient,
        matchType: 'exact',
        confidence: 1.0,
        canonicalName: 'Retail',
      }
    }
    return null
  }

  // Tier 2: Exact Name Match (Checks official name, Zoho-style displayName, and base business alias)
  const exactMatch = clients.find((c) => {
    const cName = c?.name ? c.name.toLowerCase().trim() : ''
    const cDisplay = c?.displayName ? c.displayName.toLowerCase().trim() : ''
    const cBase = c?.displayName
      ? c.displayName.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim()
      : ''
    const cParen = c?.displayName
      ? (c.displayName.match(/\(([^)]+)\)/)?.[1] || '').toLowerCase().trim()
      : ''
    return (
      (cDisplay && cDisplay === targetLower) ||
      (cBase && cBase === targetLower) ||
      (cParen && cParen === targetLower) ||
      (cName && cName === targetLower)
    )
  })
  if (exactMatch) {
    return {
      matched: true,
      client: exactMatch,
      matchType: 'exact',
      confidence: 1.0,
      canonicalName: exactMatch.displayName || exactMatch.name,
    }
  }

  // Tier 3: Phonetic Key Match (Sandeep <-> Sandip, Pradeep <-> Pradip, Nilesh <-> Neelesh)
  const targetPhonetic = getPhoneticKey(targetName)
  if (targetPhonetic && targetPhonetic.length >= 3) {
    let phoneticMatch = clients.find((c) => {
      const nameKey = c?.name ? getPhoneticKey(c.name) : null
      const displayKey = c?.displayName ? getPhoneticKey(c.displayName) : null
      const cBase = c?.displayName ? c.displayName.replace(/\s*\([^)]*\)/g, '').trim() : ''
      const baseKey = cBase ? getPhoneticKey(cBase) : null
      return nameKey === targetPhonetic || displayKey === targetPhonetic || baseKey === targetPhonetic
    })
    if (!phoneticMatch && targetPhonetic.length >= 4) {
      const candidates = clients.filter((c) => {
        const nameKey = c?.name ? getPhoneticKey(c.name) : ''
        const displayKey = c?.displayName ? getPhoneticKey(c.displayName) : ''
        const cBase = c?.displayName ? c.displayName.replace(/\s*\([^)]*\)/g, '').trim() : ''
        const baseKey = cBase ? getPhoneticKey(cBase) : ''
        return (
          (nameKey && (nameKey.includes(targetPhonetic) || (nameKey.length >= 4 && targetPhonetic.includes(nameKey)))) ||
          (displayKey && (displayKey.includes(targetPhonetic) || (displayKey.length >= 4 && targetPhonetic.includes(displayKey)))) ||
          (baseKey && (baseKey.includes(targetPhonetic) || (baseKey.length >= 4 && targetPhonetic.includes(baseKey))))
        )
      })
      if (candidates.length > 0) {
        // Prioritize candidates matching given name over candidates matching only common surnames
        candidates.sort((a, b) => {
          const keyA = getPhoneticKey(a.displayName || a.name || '')
          const keyB = getPhoneticKey(b.displayName || b.name || '')
          const isSurnameA = COMMON_INDIAN_SURNAMES.has(keyA) ? 1 : 0
          const isSurnameB = COMMON_INDIAN_SURNAMES.has(keyB) ? 1 : 0
          if (isSurnameA !== isSurnameB) return isSurnameA - isSurnameB
          return keyB.length - keyA.length
        })
        phoneticMatch = candidates[0]
      }
    }
    if (phoneticMatch) {
      return {
        matched: true,
        client: phoneticMatch,
        matchType: 'phonetic',
        confidence: 0.95,
        canonicalName: phoneticMatch.displayName || phoneticMatch.name,
      }
    }
  }

  // Tier 4: Business Word / Core Substring Match
  // E.g. Query "Jay Ambe" matches "Jay Ambe Provision Store" or vice-versa
  const cleanTarget = targetLower.replace(/[^a-z0-9]/g, '')
  if (cleanTarget.length >= 4) {
    const substringCandidates = clients.filter((c) => {
      const cleanName = c?.name ? c.name.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
      const cleanDisplay = c?.displayName ? c.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
      const cBase = c?.displayName ? c.displayName.replace(/\s*\([^)]*\)/g, '').trim() : ''
      const cleanBase = cBase ? cBase.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
      const matchName = cleanName.length >= 4 && (cleanTarget.includes(cleanName) || cleanName.includes(cleanTarget))
      const matchDisplay = cleanDisplay.length >= 4 && (cleanTarget.includes(cleanDisplay) || cleanDisplay.includes(cleanTarget))
      const matchBase = cleanBase.length >= 4 && (cleanTarget.includes(cleanBase) || cleanBase.includes(cleanTarget))
      return matchName || matchDisplay || matchBase
    })
    if (substringCandidates.length > 0) {
      substringCandidates.sort((a, b) => {
        const keyA = getPhoneticKey(a.displayName || a.name || '')
        const keyB = getPhoneticKey(b.displayName || b.name || '')
        const isSurnameA = COMMON_INDIAN_SURNAMES.has(keyA) ? 1 : 0
        const isSurnameB = COMMON_INDIAN_SURNAMES.has(keyB) ? 1 : 0
        if (isSurnameA !== isSurnameB) return isSurnameA - isSurnameB
        return keyB.length - keyA.length
      })
      const substringMatch = substringCandidates[0]
      return {
        matched: true,
        client: substringMatch,
        matchType: 'substring',
        confidence: 0.90,
        canonicalName: substringMatch.displayName || substringMatch.name,
      }
    }
  }

  // Tier 5: Fuzzy Similarity Match (Typos like "Sundip" or "Sandep")
  let bestMatch = null
  let bestScore = 0
  const threshold = options.threshold || 0.82

  for (const c of clients) {
    if (!c?.name && !c?.displayName) continue
    const cLower = (c.name || '').toLowerCase().trim()
    const dLower = (c.displayName || '').toLowerCase().trim()
    const cBase = c?.displayName ? c.displayName.replace(/\s*\([^)]*\)/g, '').toLowerCase().trim() : ''
    const score = Math.max(
      cLower ? similarityRatio(targetLower, cLower) : 0,
      dLower ? similarityRatio(targetLower, dLower) : 0,
      cBase ? similarityRatio(targetLower, cBase) : 0
    )
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
      canonicalName: bestMatch.displayName || bestMatch.name,
    }
  }

  return null
}

/**
 * Finds the single best matching client from existing clients.
 * ALWAYS returns an existing client if the clients list is non-empty.
 * Never returns null when clients are available, ensuring payment receipts
 * are attributed strictly to an existing client without creating new ones.
 *
 * @param {string} rawName - Payer name, merchant text, or receipt note
 * @param {Array} clients - Array of existing customer documents
 * @param {Object} options - { mobile, upi, threshold }
 * @returns {Object|null} The best matched existing client object
 */
export function findBestExistingClientMatch(rawName, clients = [], options = {}) {
  if (!Array.isArray(clients) || clients.length === 0) return null

  const targetStr = String(rawName || '').trim()
  const targetMobile = options?.mobile ? String(options.mobile).replace(/\D/g, '').slice(-10) : ''

  // If no name and no mobile number was provided, there is no entity to match
  if (!targetStr && !targetMobile) {
    return null
  }

  if (clients.length === 1 && (targetStr || targetMobile)) return clients[0]

  // 1. First attempt standard multi-tier matching (exact, mobile, phonetic, substring, fuzzy)
  const standardMatch = findMatchingClient(rawName, clients, options)
  if (standardMatch?.client) {
    return standardMatch.client
  }

  // 2. Extract potential 10-digit mobile from rawName string if mobile option was not provided
  if (!options.mobile && targetStr) {
    const digitsOnly = targetStr.replace(/\D/g, '')
    if (digitsOnly.length >= 10) {
      const last10 = digitsOnly.slice(-10)
      const foundByPhone = clients.find((c) => {
        const cMob = String(c.mobile || c.phone || '').replace(/\D/g, '').slice(-10)
        return cMob === last10
      })
      if (foundByPhone) return foundByPhone
    }
  }

  const targetLower = targetStr.toLowerCase()
  const targetPhonetic = getPhoneticKey(targetStr)

  // Helper to extract clean word tokens
  const extractTokens = (str) => {
    return (str || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['bhai', 'ben', 'kumar', 'store', 'kirana', 'general', 'shree', 'om'].includes(w))
  }

  const targetTokens = extractTokens(targetStr)

  let bestClient = null
  let bestScore = -1

  for (const client of clients) {
    if (!client) continue
    const cName = String(client.displayName || client.name || '').trim()
    if (!cName) continue

    const cLower = cName.toLowerCase()
    const cPhonetic = getPhoneticKey(cName)
    const cTokens = extractTokens(cName)

    let score = 0

    // Direct similarity
    const sim = similarityRatio(targetLower, cLower)
    score += sim * 0.4

    // Phonetic similarity
    if (targetPhonetic && cPhonetic) {
      const phonSim = similarityRatio(targetPhonetic, cPhonetic)
      score += phonSim * 0.35
    }

    // Token overlap with given-name priority over common surnames
    if (targetTokens.length > 0 && cTokens.length > 0) {
      let matchedTokens = 0
      for (const tt of targetTokens) {
        const ttPhon = getPhoneticKey(tt)
        const isSurname = COMMON_INDIAN_SURNAMES.has(tt.toUpperCase()) || COMMON_INDIAN_SURNAMES.has(ttPhon)
        const weight = isSurname ? 0.5 : 1.0

        if (cTokens.includes(tt)) {
          matchedTokens += weight
        } else if (cTokens.some((ct) => {
          const ctPhon = getPhoneticKey(ct)
          return ct === tt || (ctPhon && ttPhon && ctPhon === ttPhon)
        })) {
          matchedTokens += weight * 0.95
        } else if (cTokens.some((ct) => ct.includes(tt) || tt.includes(ct))) {
          matchedTokens += weight * 0.7
        }
      }
      const tokenScore = (2 * matchedTokens) / (targetTokens.length + cTokens.length)
      score += tokenScore * 0.35
    }

    // Substring containment bonus (higher bonus for non-surnames)
    if (
      (targetLower.length >= 4 && cLower.includes(targetLower)) ||
      (cLower.length >= 4 && targetLower.includes(cLower))
    ) {
      const key = getPhoneticKey(cLower)
      score += COMMON_INDIAN_SURNAMES.has(key) ? 0.1 : 0.25
    }

    // Outstanding balance bonus (a customer with outstanding balance is much more likely to make a payment)
    const outstanding = Number(client.outstanding || client.pendingBalance || client.balance || 0)
    if (outstanding > 0) {
      score += 0.05
    }

    if (score > bestScore) {
      bestScore = score
      bestClient = client
    }
  }

  if (bestClient && bestScore > 0.15) {
    return bestClient
  }

  // Fallback: If no meaningful score but non-empty text was provided,
  // pick the client with the highest outstanding balance, or the first client
  if (targetStr && targetStr.length >= 2) {
    const clientWithDue = [...clients].sort(
      (a, b) => Number(b.outstanding || b.pendingBalance || 0) - Number(a.outstanding || a.pendingBalance || 0),
    )[0]
    return clientWithDue || clients[0]
  }

  return null
}

