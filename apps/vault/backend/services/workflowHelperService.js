const crypto = require('crypto')

const ALLOWED_TASK_TYPES = ['review', 'approval', 'signature']
const ALLOWED_SIGNATURE_MEANINGS = ['reviewed', 'approved', 'rejected', 'acknowledged']
const ALLOWED_TASK_STATUSES = ['pending', 'completed', 'rejected', 'cancelled']
const ALLOWED_ROLES = ['admin', 'author', 'reviewer', 'approver', 'viewer']

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Allowed roles: ${allowedRoles.join(', ')}` })
    }
    next()
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}

function buildSnapshotHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function parseDueDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function buildDueDateFromHours(hours) {
  if (!Number.isInteger(hours) || hours <= 0) return null
  const due = new Date()
  due.setHours(due.getHours() + hours)
  return due
}

function clampAnalyticsWindowDays(rawValue) {
  const value = Number.parseInt(rawValue || '30', 10)
  if (!Number.isInteger(value)) return 30
  return Math.min(180, Math.max(7, value))
}

function toRoundedNumber(value, precision = 2) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Number(numeric.toFixed(precision))
}

function computeMedian(values) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function computePercentile(values, percentile) {
  if (!values.length) return null
  if (percentile <= 0) return values[0]
  if (percentile >= 100) return values[values.length - 1]
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]
}

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  const raw = String(value)
  if (!/[,"\n]/.test(raw)) return raw
  return `"${raw.replace(/"/g, '""')}"`
}

function toCsv(headers, rows) {
  const output = [headers.join(',')]
  for (const row of rows) {
    output.push(row.map(entry => csvEscape(entry)).join(','))
  }
  return `${output.join('\n')}\n`
}

module.exports = {
  ALLOWED_TASK_TYPES,
  ALLOWED_SIGNATURE_MEANINGS,
  ALLOWED_TASK_STATUSES,
  ALLOWED_ROLES,
  requireRole,
  requireAdmin,
  buildSnapshotHash,
  parseDueDate,
  buildDueDateFromHours,
  clampAnalyticsWindowDays,
  toRoundedNumber,
  computeMedian,
  computePercentile,
  csvEscape,
  toCsv
}
