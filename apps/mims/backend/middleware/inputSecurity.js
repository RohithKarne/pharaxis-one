'use strict';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_INJECTION_PATTERN = /<\s*\/?\s*script\b|javascript:|on[a-z]+\s*=/i;
const SQLI_PATTERN = /\bunion\b\s+\bselect\b|\bor\b\s+1\s*=\s*1|\bdrop\b\s+table\b|--|\/\*|\*\//i;
const COMMAND_INJECTION_PATTERN = /`|\$\(|\|\||&&|;\s*(?:rm|bash|sh|curl|wget|nc|python|node)\b/i;
const HIGH_RISK_KEY_PATTERN = /(command|cmd|shell|exec|script|query|sql)/i;

const MAX_DEPTH = Number.parseInt(process.env.INPUT_MAX_DEPTH || '8', 10);
const MAX_ARRAY_ITEMS = Number.parseInt(process.env.INPUT_MAX_ARRAY_ITEMS || '500', 10);
const MAX_OBJECT_KEYS = Number.parseInt(process.env.INPUT_MAX_OBJECT_KEYS || '200', 10);
const MAX_QUERY_STRING = Number.parseInt(process.env.INPUT_MAX_QUERY_STRING || '2048', 10);
const MAX_PARAM_STRING = Number.parseInt(process.env.INPUT_MAX_PARAM_STRING || '1024', 10);
const MAX_BODY_STRING = Number.parseInt(process.env.INPUT_MAX_BODY_STRING || '250000', 10);

function sanitizeString(value) {
  return String(value).replace(CONTROL_CHARS, '');
}

function assertSafeString({ value, key, location, path }) {
  const maxLength = location === 'body'
    ? MAX_BODY_STRING
    : (location === 'query' ? MAX_QUERY_STRING : MAX_PARAM_STRING);
  if (value.length > maxLength) {
    throw new Error(`Invalid input at ${path}: exceeds allowed length.`);
  }

  if (SCRIPT_INJECTION_PATTERN.test(value)) {
    throw new Error(`Invalid input at ${path}: script injection pattern detected.`);
  }

  const isEdgeInput = location === 'query' || location === 'params';
  if (isEdgeInput && (SQLI_PATTERN.test(value) || COMMAND_INJECTION_PATTERN.test(value))) {
    throw new Error(`Invalid input at ${path}: unsafe pattern detected.`);
  }

  if (HIGH_RISK_KEY_PATTERN.test(String(key || '')) && COMMAND_INJECTION_PATTERN.test(value)) {
    throw new Error(`Invalid input at ${path}: command injection pattern detected.`);
  }
}

function sanitizeValue(value, location, path, depth = 0, key = '') {
  if (depth > MAX_DEPTH) {
    throw new Error(`Invalid input at ${path}: payload nesting too deep.`);
  }

  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      throw new Error(`Invalid input at ${path}: too many items.`);
    }
    return value.map((item, index) => sanitizeValue(item, location, `${path}[${index}]`, depth + 1, key));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) {
      throw new Error(`Invalid input at ${path}: too many object keys.`);
    }
    const out = {};
    for (const [entryKey, entryValue] of entries) {
      if (DANGEROUS_KEYS.has(entryKey)) {
        throw new Error(`Invalid input at ${path}.${entryKey}: forbidden key.`);
      }
      out[entryKey] = sanitizeValue(entryValue, location, `${path}.${entryKey}`, depth + 1, entryKey);
    }
    return out;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid input at ${path}: non-finite number.`);
    }
    return value;
  }

  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const sanitized = sanitizeString(value);
    assertSafeString({ value: sanitized, key, location, path });
    return location === 'body' ? sanitized : sanitized.trim();
  }

  throw new Error(`Invalid input at ${path}: unsupported value type.`);
}

function sanitizeInputBucket(value, location) {
  if (!value || typeof value !== 'object') return value;
  return sanitizeValue(value, location, `req.${location}`);
}

function inputSecurityMiddleware(req, res, next) {
  try {
    req.params = sanitizeInputBucket(req.params, 'params') || {};
    req.query = sanitizeInputBucket(req.query, 'query') || {};
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeInputBucket(req.body, 'body') || {};
    }
    next();
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid input payload.' });
  }
}

module.exports = { inputSecurityMiddleware };
