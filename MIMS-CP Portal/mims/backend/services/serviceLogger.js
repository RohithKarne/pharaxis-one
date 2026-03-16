/**
 * services/serviceLogger.js — Centralised Service Event Logger
 *
 * Call logService() from any backend service/route to write a structured
 * entry into the service_logs table. Never throws — logging must not
 * break the parent service.
 *
 * Usage:
 *   const { logService } = require('./serviceLogger')
 *   logService({ source: 'Email Accounts', service_type: 'IMAP', description: '...', status: 'success', details: { task_name: 'Email Import' } })
 *
 * status values: 'success' | 'failed' | 'warning'
 */

const db = require('../database/db')

function logService({ source, service_type, description, status = 'success', details = null }) {
  try {
    const detailsJson = details ? JSON.stringify(details) : null
    db.prepare(`
      INSERT INTO service_logs (source, service_type, description, details, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(source, service_type, description, detailsJson, status)
  } catch (err) {
    console.warn('[SERVICE_LOG] Failed to write log entry:', err?.message)
  }
}

module.exports = { logService }
