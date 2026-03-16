/**
 * routes/superadmin.js — Superadmin API
 * Superadmin manages per-user module access (separate from Admin Console user management).
 */

const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const ALLOWED_MODULES = ['mims_core', 'admin_console', 'content_mgmt', 'data_visualization'];

function audit(userId, userName, action, entity, entityId, details) {
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)`).run(userId, userName, action, entity, entityId, JSON.stringify(details));
}

// GET /api/superadmin/users — list users with current module overrides
router.get('/users', authenticate, requireRole('superadmin'), (_req, res) => {
  const users = db.prepare('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC').all();
  const perms = db.prepare('SELECT user_id, module FROM user_module_permissions WHERE can_access = 1').all();
  const byUser = perms.reduce((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = [];
    acc[p.user_id].push(p.module);
    return acc;
  }, {});
  res.json({
    users: users.map(u => ({ ...u, modules: byUser[u.id] || [] }))
  });
});

// PUT /api/superadmin/users/:id/modules — replace module list for a user
router.put('/users/:id/modules', authenticate, requireRole('superadmin'), (req, res) => {
  const { id } = req.params;
  const { modules } = req.body || {};

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (!Array.isArray(modules)) {
    return res.status(400).json({ error: 'modules must be an array.' });
  }
  const invalid = modules.filter(m => !ALLOWED_MODULES.includes(m));
  if (invalid.length) {
    return res.status(400).json({ error: `Invalid module(s): ${invalid.join(', ')}` });
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM user_module_permissions WHERE user_id = ?').run(id);
    const ins = db.prepare('INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)');
    for (const mod of modules) ins.run(id, mod);
  });
  tx();

  audit(req.user.userId, req.user.email, 'UPDATE', 'user_module_permissions', Number(id), { modules });
  res.json({ message: 'Updated.', modules });
});

// GET /api/superadmin/audit — general audit log (module access changes)
router.get('/audit', authenticate, requireRole('superadmin'), (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const rows = db.prepare(`
    SELECT id, user_id, user_name, action, entity, entity_id, details, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) AS cnt FROM audit_logs').get().cnt;
  res.json({ logs: rows.map(r => ({ ...r, details: tryParse(r.details) })), total, limit, offset });
});

// GET /api/superadmin/login-audit — login/logout event log
router.get('/login-audit', authenticate, requireRole('superadmin'), (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status || null;
  const query = status
    ? `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason FROM login_audit WHERE status = ? ORDER BY login_time DESC LIMIT ? OFFSET ?`
    : `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason FROM login_audit ORDER BY login_time DESC LIMIT ? OFFSET ?`;
  const params = status ? [status, limit, offset] : [limit, offset];
  const rows = db.prepare(query).all(...params);
  const total = status
    ? db.prepare('SELECT COUNT(*) AS cnt FROM login_audit WHERE status = ?').get(status).cnt
    : db.prepare('SELECT COUNT(*) AS cnt FROM login_audit').get().cnt;
  res.json({ logs: rows, total, limit, offset });
});

function tryParse(str) {
  try { return JSON.parse(str) } catch { return str }
}

module.exports = router;
