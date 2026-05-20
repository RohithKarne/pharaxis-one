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

const pool = require('../database/db')
const { emitPlatformAdminAlert } = require('./alertService')

async function logService({ source, service_type, description, status = 'success', details = null }) {
  try {
    const detailsJson = details ? JSON.stringify(details) : null
    await pool.execute(
      `INSERT INTO service_logs (source, service_type, description, details, status) VALUES (?, ?, ?, ?, ?)`,
      [source, service_type, description, detailsJson, status]
    )
    if (status === 'failed') {
      const normalizedSource = String(source || '').toLowerCase()
      const eventType = normalizedSource.includes('mail')
        ? 'mailbox_failure'
        : 'service_error_threshold'
      await emitPlatformAdminAlert(eventType, {
        severity: 'high',
        title: eventType === 'mailbox_failure' ? 'Mailbox operation failed' : 'Service error threshold breached',
        message: description || `${source || 'Service'} reported a failure.`,
        metadata: { source, service_type, description, details },
        linkUrl: '/mims-admin?standalone=1',
      })
    }
  } catch (err) {
    console.warn('[SERVICE_LOG] Failed to write log entry:', err?.message)
  }
}

module.exports = { logService }
