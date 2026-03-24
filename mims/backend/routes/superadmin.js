/**
 * routes/superadmin.js — Superadmin API
 * Superadmin manages per-user module access (separate from Admin Console user management).
 */

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const ALLOWED_MODULES = ['mims_core', 'admin_console', 'content_mgmt', 'data_visualization'];

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/superadmin/users — list users with current module overrides
router.get('/users', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    const [perms] = await pool.execute(
      'SELECT user_id, module FROM user_module_permissions WHERE can_access = 1'
    );
    const byUser = perms.reduce((acc, p) => {
      if (!acc[p.user_id]) acc[p.user_id] = [];
      acc[p.user_id].push(p.module);
      return acc;
    }, {});
    res.json({ users: users.map(u => ({ ...u, modules: byUser[u.id] || [] })) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/superadmin/users/:id/modules — replace module list for a user
router.put('/users/:id/modules', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { modules } = req.body || {};

    const [[user]] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: 'modules must be an array.' });
    }
    const invalid = modules.filter(m => !ALLOWED_MODULES.includes(m));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid module(s): ${invalid.join(', ')}` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM user_module_permissions WHERE user_id = ?', [id]);
      for (const mod of modules) {
        await conn.execute(
          'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
          [id, mod]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await audit(req.user.userId, req.user.email, 'UPDATE', 'user_module_permissions', Number(id), { modules });
    res.json({ message: 'Updated.', modules });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/superadmin/audit — general audit log (module access changes)
router.get('/audit', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const [rows] = await pool.execute(
      `SELECT id, user_id, user_name, action, entity, entity_id, details, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );
    const [[{ cnt: total }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM audit_logs');
    res.json({ logs: rows.map(r => ({ ...r, details: tryParse(r.details) })), total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/superadmin/login-audit — login/logout event log
router.get('/login-audit', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    let rows, total;
    if (status) {
      [rows] = await pool.execute(
        `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason
         FROM login_audit WHERE status = ? ORDER BY login_time DESC LIMIT ${limit} OFFSET ${offset}`,
        [status]
      );
      const [[{ cnt }]] = await pool.execute(
        'SELECT COUNT(*) AS cnt FROM login_audit WHERE status = ?', [status]
      );
      total = cnt;
    } else {
      [rows] = await pool.execute(
        `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason
         FROM login_audit ORDER BY login_time DESC LIMIT ${limit} OFFSET ${offset}`
      );
      const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM login_audit');
      total = cnt;
    }
    res.json({ logs: rows, total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

function tryParse(str) {
  try { return JSON.parse(str) } catch { return str }
}

module.exports = router;
