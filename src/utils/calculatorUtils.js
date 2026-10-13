/**
 * Utility functions for arithmetic evaluation, number formatting,
 * and Khatabook-style cash handover SMS formatting.
 */

/**
 * Safely evaluates a basic arithmetic string expression without using eval().
 * Supports +, -, *, /, ×, ÷, parentheses, and decimals.
 *
 * @param {string} expr - Expression like "1200 + 450" or "500 * 4"
 * @returns {number|null} Evaluated number (rounded to 2 decimal places) or null if invalid.
 */
export function evaluateArithmetic(expr) {
  if (!expr || typeof expr !== 'string') return null

  // Normalize operators and remove whitespace & commas
  const clean = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/,/g, '')
    .replace(/\s+/g, '')

  if (!clean) return null

  // Ensure only valid arithmetic characters
  if (!/^[\d\.\+\-\*\/\(\)]+$/.test(clean)) return null

  try {
    const tokens = clean.match(/(\d+\.?\d*|\+|\-|\*|\/|\(|\))/g)
    if (!tokens || tokens.length === 0) return null

    let pos = 0

    function parsePrimary() {
      if (pos >= tokens.length) throw new Error('Unexpected end of expression')
      const tok = tokens[pos++]

      if (tok === '(') {
        const val = parseAddSub()
        if (pos >= tokens.length || tokens[pos++] !== ')') {
          throw new Error('Unbalanced parentheses')
        }
        return val
      }
      if (tok === '-') return -parsePrimary()
      if (tok === '+') return parsePrimary()

      const num = parseFloat(tok)
      if (Number.isNaN(num)) throw new Error('Invalid number')
      return num
    }

    function parseMulDiv() {
      let val = parsePrimary()
      while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
        const op = tokens[pos++]
        const right = parsePrimary()
        if (op === '*') {
          val *= right
        } else {
          if (right === 0) throw new Error('Division by zero')
          val /= right
        }
      }
      return val
    }

    function parseAddSub() {
      let val = parseMulDiv()
      while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
        const op = tokens[pos++]
        const right = parseMulDiv()
        if (op === '+') {
          val += right
        } else {
          val -= right
        }
      }
      return val
    }

    const result = parseAddSub()
    if (pos < tokens.length) return null
    if (!Number.isFinite(result)) return null

    return Math.round(result * 100) / 100
  } catch {
    return null
  }
}

/**
 * Checks if a string contains arithmetic operators.
 * @param {string} str
 * @returns {boolean}
 */
export function hasArithmeticOperators(str) {
  if (!str || typeof str !== 'string') return false
  return /[\+\-\*\/\×\÷]/.test(str)
}

/**
 * Formats a short & sweet Khatabook-style Cash Handover SMS.
 * Stays under ~100 characters for instant, low-cost delivery.
 *
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.fromName
 * @param {string} [params.toName]
 * @param {string|Date} [params.date]
 * @param {number} [params.remainingBalance]
 * @returns {string}
 */
export function buildCashHandoverSms({
  amount = 0,
  fromName = 'Staff',
  toName = 'Counter',
  date = new Date(),
  remainingBalance = null,
}) {
  const d =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)
      ? new Date(`${date}T12:00:00`)
      : new Date(date)

  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  const dateStr = !Number.isNaN(d.getTime())
    ? `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}`
    : 'today'

  const amtStr = Number(amount || 0).toLocaleString('en-IN')

  let remText = ''
  if (remainingBalance !== null && remainingBalance !== undefined && !Number.isNaN(Number(remainingBalance))) {
    remText = ` Remaining: ₹${Number(remainingBalance).toLocaleString('en-IN')}.`
  }

  // Short and sweet Khatabook format
  return `Annapurna Foods: Received ₹${amtStr} cash from ${fromName} on ${dateStr}.${remText} Thank you!`
}
