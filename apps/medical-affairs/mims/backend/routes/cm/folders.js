'use strict';

/**
 * cm/folders.js — Content Management Folders API
 * Top-level folder management for content management module.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

function getScopedOrgId(req, providedOrgId = null) {
  return isSuperadmin(req) ? (providedOrgId || null) : req.user.orgId;
}

// GET /api/cm/folders — list active folders
router.get('/folders', authenticate, async (req, res) => {
  try {
    const [folders] = await pool.execute(
      isSuperadmin(req)
        ? `SELECT f.*,
                  p.trade_name AS product_name,
                  s.name AS site_name,
                  u.name AS created_by_name
           FROM cm_folders f
           LEFT JOIN products p ON f.product_id = p.id
           LEFT JOIN sites s ON f.site_id = s.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE f.status = 'Active'
           ORDER BY f.name`
        : `SELECT f.*,
                  p.trade_name AS product_name,
                  s.name AS site_name,
                  u.name AS created_by_name
           FROM cm_folders f
           LEFT JOIN products p ON f.product_id = p.id
           LEFT JOIN sites s ON f.site_id = s.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE f.status = 'Active' AND f.org_id = ?
           ORDER BY f.name`,
      isSuperadmin(req) ? [] : [req.user.orgId]
    );
    res.json({ folders });
  } catch (err) {
    console.error('GET /cm/folders error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/folders — create folder
router.post('/folders', authenticate, async (req, res) => {
  try {
    const { name, product_id, site_id, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    const [result] = await pool.execute(
      'INSERT INTO cm_folders (name, product_id, site_id, description, created_by, org_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), product_id || null, site_id || null, description || null, req.user.userId, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_folder', result.insertId, { name });
    const [[created]] = await pool.execute('SELECT * FROM cm_folders WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Folder created.', id: result.insertId, folder: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A folder with this name already exists.' });
    }
    console.error('POST /cm/folders error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/folders/:id — update folder
router.put('/folders/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id, org_id FROM cm_folders WHERE id = ?'
        : 'SELECT id, org_id FROM cm_folders WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Folder not found.' });
    const orgId = getScopedOrgId(req, req.body.org_id || existing.org_id);

    const { name, product_id, site_id, description } = req.body;
    await pool.execute(
      'UPDATE cm_folders SET name = ?, product_id = ?, site_id = ?, description = ?, org_id = ?, updated_at = NOW() WHERE id = ?',
      [name, product_id || null, site_id || null, description || null, orgId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_folder', Number(id), { name });
    res.json({ message: 'Folder updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A folder with this name already exists.' });
    }
    console.error('PUT /cm/folders/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/cm/folders/:id — inactivate (only if no active documents in folder)
router.delete('/folders/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id, name FROM cm_folders WHERE id = ?'
        : 'SELECT id, name FROM cm_folders WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Folder not found.' });

    // Check for documents
    const [[docCount]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM cm_documents WHERE folder_id = ? AND status != 'Archived'",
      [id]
    );
    if (docCount.count > 0) {
      return res.status(400).json({ error: 'Cannot deactivate folder — it contains active documents. Archive all documents first.' });
    }

    // Check for FAQs
    const [[faqCount]] = await pool.execute(
      "SELECT COUNT(*) AS count FROM cm_faqs WHERE folder_id = ? AND status != 'Archived'",
      [id]
    );
    if (faqCount.count > 0) {
      return res.status(400).json({ error: 'Cannot deactivate folder — it contains active FAQs. Archive all FAQs first.' });
    }

    await pool.execute("UPDATE cm_folders SET status = 'Inactive', updated_at = NOW() WHERE id = ?", [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'cm_folder', Number(id), { name: existing.name });
    res.json({ message: 'Folder deactivated.' });
  } catch (err) {
    console.error('DELETE /cm/folders/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E8: Folder-level permissions ──────────────────────────────────────────

// GET /api/cm/folders/:id/permissions
router.get('/folders/:id/permissions', authenticate, async (req, res) => {
  try {
    const [perms] = await pool.execute(
      `SELECT fp.*, sg.name AS group_name
       FROM cm_folder_permissions fp
       JOIN security_groups sg ON sg.id = fp.security_group_id
       WHERE fp.folder_id = ?`,
      [req.params.id]
    );
    res.json({ permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/folders/:id/permissions
router.post('/folders/:id/permissions', authenticate, async (req, res) => {
  try {
    const { security_group_id, permission_level } = req.body;
    if (!security_group_id) return res.status(400).json({ error: 'security_group_id required' });
    await pool.execute(
      `INSERT INTO cm_folder_permissions (folder_id, security_group_id, permission_level, created_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permission_level = VALUES(permission_level)`,
      [req.params.id, security_group_id, permission_level || 'read', req.user.userId || null]
    );
    await audit(req.user.userId, req.user.email, 'SET_FOLDER_PERMISSION', 'cm_folder', Number(req.params.id), { security_group_id, permission_level });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cm/folders/:id/permissions/:groupId
router.delete('/folders/:id/permissions/:groupId', authenticate, async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM cm_folder_permissions WHERE folder_id = ? AND security_group_id = ?`,
      [req.params.id, req.params.groupId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CM-E9: Browse bookmarks ───────────────────────────────────────────────────

// GET /api/cm/folders/bookmarks
router.get('/folders/bookmarks', authenticate, async (req, res) => {
  try {
    const [bookmarks] = await pool.execute(
      `SELECT b.*,
        CASE b.entity_type
          WHEN 'document' THEN (SELECT name FROM cm_documents WHERE id = b.entity_id)
          WHEN 'folder'   THEN (SELECT name FROM cm_folders WHERE id = b.entity_id)
          WHEN 'faq'      THEN (SELECT title FROM cm_faqs WHERE id = b.entity_id)
        END AS entity_name
       FROM cm_browse_bookmarks b
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.userId]
    );
    res.json({ bookmarks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/folders/bookmarks
router.post('/folders/bookmarks', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.body;
    if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
    await pool.execute(
      `INSERT IGNORE INTO cm_browse_bookmarks (user_id, entity_type, entity_id) VALUES (?, ?, ?)`,
      [req.user.userId, entity_type, entity_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cm/folders/bookmarks/:id
router.delete('/folders/bookmarks/:id', authenticate, async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM cm_browse_bookmarks WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
