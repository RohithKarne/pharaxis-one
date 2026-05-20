'use strict';

const pool = require('../database/db');

function normalizePath(pathname) {
  return String(pathname || '')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, ':uuid');
}

function inferModule(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (p.includes('/auth')) return 'Auth';
  if (p.includes('/inbox')) return 'Inbox';
  if (p.includes('/cases') || p.includes('/case')) return 'Case Management';
  if (p.includes('/admin')) return 'Admin Console';
  if (p.includes('/admin/platform')) return 'Platform Admin';
  if (p.includes('/cm')) return 'Content';
  if (p.includes('/analytics')) return 'Analytics';
  if (p.includes('/dv')) return 'Data Visualization';
  return 'Core';
}

function deriveEventType(method) {
  const m = String(method || '').toUpperCase();
  if (m === 'POST') return 'create';
  if (m === 'PUT' || m === 'PATCH') return 'update';
  if (m === 'DELETE') return 'delete';
  return 'read';
}

function deriveEntity(pathname) {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .filter(p => p !== 'api' && !/^[0-9]+$/.test(p));
  if (!parts.length) return 'resource';
  return parts[parts.length - 1];
}

function shouldCaptureBusinessEvent(req, res) {
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  if (res.statusCode >= 500) return false;

  const path = String(req.originalUrl || '').split('?')[0].toLowerCase();
  if (path.startsWith('/api/admin/process-logs')) return false;
  if (path.startsWith('/api/health')) return false;
  if (path.includes('/login') || path.includes('/logout') || path.includes('/verify') || path.includes('/forgot-password')) return false;
  return true;
}

async function emitProcessEvent({
  orgId = null,
  sourceModule = 'Core',
  method = 'POST',
  path = '/system/event',
  statusCode = 200,
  durationMs = 0,
  eventType = 'update',
  entityType = 'resource',
  entityId = null,
  summary = null,
  payload = null,
  errorMessage = null,
}) {
  try {
    const payloadJson = payload == null ? null : JSON.stringify(payload).slice(0, 8000);
    await pool.execute(
      `INSERT INTO mims_process_logs
         (org_id, source_module, method, path, path_pattern, status_code, duration_ms,
          event_type, entity_type, entity_id, summary, request_payload, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        sourceModule,
        String(method || 'POST').toUpperCase(),
        path,
        normalizePath(path),
        statusCode,
        durationMs,
        eventType,
        entityType,
        entityId,
        summary,
        payloadJson,
        errorMessage,
      ]
    );
  } catch (_) {
    // Explorer logging is best-effort.
  }
}

module.exports = {
  normalizePath,
  inferModule,
  deriveEventType,
  deriveEntity,
  shouldCaptureBusinessEvent,
  emitProcessEvent,
};
