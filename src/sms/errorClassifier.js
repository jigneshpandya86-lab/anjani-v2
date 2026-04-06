/**
 * Error Classification System
 * Maps errors to codes and categories for intelligent retry logic
 */

export const ERROR_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',                 // Phone number validation failed
  PLUGIN_UNAVAILABLE: 'PLUGIN_UNAVAILABLE',       // Native SMS plugin not available
  PLUGIN_ERROR: 'PLUGIN_ERROR',                   // Plugin returned error
  NETWORK_ERROR: 'NETWORK_ERROR',                 // Network connectivity issue
  RATE_LIMIT: 'RATE_LIMIT',                       // Rate limit exceeded
  UNKNOWN: 'UNKNOWN',                             // Unknown error
}

export const ERROR_CATEGORIES = {
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal',
  RATE_LIMIT: 'rate_limit',
}

// Mapping of error code to category
const ERROR_CODE_TO_CATEGORY = {
  [ERROR_CODES.PLUGIN_ERROR]: ERROR_CATEGORIES.RETRYABLE,
  [ERROR_CODES.NETWORK_ERROR]: ERROR_CATEGORIES.RETRYABLE,
  [ERROR_CODES.INVALID_PHONE]: ERROR_CATEGORIES.TERMINAL,
  [ERROR_CODES.PLUGIN_UNAVAILABLE]: ERROR_CATEGORIES.TERMINAL,
  [ERROR_CODES.RATE_LIMIT]: ERROR_CATEGORIES.RATE_LIMIT,
  [ERROR_CODES.UNKNOWN]: ERROR_CATEGORIES.RETRYABLE,
}

/**
 * Classify an error to determine code and category
 * @param {Error|string} error - The error to classify
 * @param {Object} context - Additional context (job, etc)
 * @returns {Object} { code: string, category: string }
 */
export const classifyError = (error, context = {}) => {
  const errorMessage = typeof error === 'string' ? error : (error?.message || 'Unknown error')

  // Check for rate limit error
  if (errorMessage.includes('rate limit') || errorMessage.includes('RATE_LIMIT')) {
    return {
      code: ERROR_CODES.RATE_LIMIT,
      category: ERROR_CATEGORIES.RATE_LIMIT,
    }
  }

  // Check for plugin unavailable
  if (errorMessage.includes('plugin') && (errorMessage.includes('not') || errorMessage.includes('unavailable'))) {
    return {
      code: ERROR_CODES.PLUGIN_UNAVAILABLE,
      category: ERROR_CATEGORIES.TERMINAL,
    }
  }

  // Check for plugin error
  if (errorMessage.includes('plugin') || errorMessage.includes('SMS')) {
    return {
      code: ERROR_CODES.PLUGIN_ERROR,
      category: ERROR_CATEGORIES.RETRYABLE,
    }
  }

  // Check for network error
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('NETWORK')
  ) {
    return {
      code: ERROR_CODES.NETWORK_ERROR,
      category: ERROR_CATEGORIES.RETRYABLE,
    }
  }

  // Check for invalid phone
  if (errorMessage.includes('phone') || errorMessage.includes('invalid')) {
    return {
      code: ERROR_CODES.INVALID_PHONE,
      category: ERROR_CATEGORIES.TERMINAL,
    }
  }

  // Default to unknown retryable error
  return {
    code: ERROR_CODES.UNKNOWN,
    category: ERROR_CATEGORIES.RETRYABLE,
  }
}

/**
 * Check if an error is retryable
 * @param {string} errorCode - The error code
 * @returns {boolean}
 */
export const isRetryableError = (errorCode) => {
  const category = ERROR_CODE_TO_CATEGORY[errorCode] || ERROR_CATEGORIES.RETRYABLE
  return category === ERROR_CATEGORIES.RETRYABLE
}

/**
 * Check if error is terminal (should not retry)
 * @param {string} errorCode - The error code
 * @returns {boolean}
 */
export const isTerminalError = (errorCode) => {
  const category = ERROR_CODE_TO_CATEGORY[errorCode]
  return category === ERROR_CATEGORIES.TERMINAL
}

/**
 * Check if error is rate limit
 * @param {string} errorCode - The error code
 * @returns {boolean}
 */
export const isRateLimitError = (errorCode) => {
  return errorCode === ERROR_CODES.RATE_LIMIT
}
