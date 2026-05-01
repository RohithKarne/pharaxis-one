const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const SCRIPT_PATTERN = /<\s*script|javascript:|onerror\s*=|onload\s*=/i
const SQL_PATTERN = /\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+.+\s+set)\b/i
const COMMAND_PATTERN = /(?:;|&&|\|\|)\s*(?:rm|curl|wget|bash|sh|python|node)\b/i

function sanitizeValue(value, depth = 0) {
  if (depth > 12) {
    const error = new Error('Input nesting depth exceeded')
    error.statusCode = 400
    throw error
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    if (SCRIPT_PATTERN.test(normalized) || SQL_PATTERN.test(normalized) || COMMAND_PATTERN.test(normalized)) {
      const error = new Error('Request contains unsafe input')
      error.statusCode = 400
      throw error
    }
    if (normalized.length > 10000) {
      const error = new Error('Input field length exceeded')
      error.statusCode = 400
      throw error
    }
    return normalized
  }

  if (Array.isArray(value)) {
    if (value.length > 1000) {
      const error = new Error('Input array length exceeded')
      error.statusCode = 400
      throw error
    }
    return value.map(item => sanitizeValue(item, depth + 1))
  }

  if (value && typeof value === 'object') {
    const output = {}
    const entries = Object.entries(value)
    if (entries.length > 500) {
      const error = new Error('Input object key count exceeded')
      error.statusCode = 400
      throw error
    }
    for (const [key, item] of entries) {
      if (BLOCKED_KEYS.has(key)) continue
      output[key] = sanitizeValue(item, depth + 1)
    }
    return output
  }

  return value
}

function inputSecurity(req, _res, next) {
  try {
    if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body)
    if (req.query && typeof req.query === 'object') req.query = sanitizeValue(req.query)
    if (req.params && typeof req.params === 'object') req.params = sanitizeValue(req.params)
    next()
  } catch (error) {
    next(error)
  }
}

module.exports = { inputSecurity }
