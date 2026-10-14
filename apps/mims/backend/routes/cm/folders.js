'use strict';

/**
 * cm/folders.js — Content Management Folders API
 * Top-level folder management for content management module.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { logAudit } = require('../../utils/auditLog');
const { folderFilterSql } = require('../../services/cmFolderAccess');

// Security groups this organisation may use: its own, and shared groups opened
// to it — the same rule as Admin > Security Groups.
async function usableGroups(req) {
  const [rows] = await pool.execute(
    `SELECT id, name, org_id, privileges FROM security_groups
      WHERE is_active = 1 AND COALESCE(is_template, 0) = 0
        ${hasPlatformAdminScope(req) ? '' : 'AND (org_id = ? OR org_id IS NULL)'}
      ORDER BY name`,
    hasPlatformAdminScope(req) ? [] : [req.user.orgId]);
  return rows.filter((g) => {
    if (hasPlatformAdminScope(req) || Number(g.org_id) === Number(req.user.orgId)) return true;
    let p = g.privileges;
    try { p = typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch (_) { p = {}; }
    return (p?.details?.tenant_ids || []).map(Number).includes(Number(req.user.orgId));
  }).map(({ id, name }) => ({ id, name }));
}

const FOLDER_STATUSES = ['Active', 'Inactive'];

// What still lives in a folder: a folder holding live content cannot be closed.
async function liveContent(folderId) {
  const [[c]] = await pool.execute(
    `SELECT (SELECT COUNT(*) FROM cm_documents WHERE folder_id = ? AND status != 'Archived') AS documents,
            (SELECT COUNT(*) FROM cm_faqs WHERE folder_id = ? AND status != 'Archived') AS faqs,
            (SELECT COUNT(*) FROM cm_modules WHERE folder_id = ? AND status != 'Archived') AS modules,
            (SELECT COUNT(*) FROM cm_templates WHERE folder_id = ? AND status != 'Archived') AS templates`,
    [folderId, folderId, folderId, folderId]);
  const parts = Object.entries(c).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${Number(n) === 1 ? k.replace(/s$/, '') : k}`);
  return parts.length ? `This folder still holds ${parts.join(', ')}. Archive or move them first.` : null;
}

async function audit(userId, userName, action, entity, entityId, details) {
  await logAudit(userId, userName, action, entity, entityId, details);
}

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function getScopedOrgId(req, providedOrgId = null) {
  return hasPlatformAdminScope(req) ? (providedOrgId || null) : req.user.orgId;
}

async function getScopedFolder(req, folderId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? 'SELECT * FROM cm_folders WHERE id = ?'
      : 'SELECT * FROM cm_folders WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

async function verifyScopedEntity(req, entityType, entityId) {
  const id = Number(entityId);
  if (!Number.isInteger(id) || id <= 0) return false;

  if (entityType === 'folder') {
    return !!(await getScopedFolder(req, id));
  }
  if (entityType === 'document') {
    const [rows] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT d.id
           FROM cm_documents d
           JOIN cm_folders f ON f.id = d.folder_id
           WHERE d.id = ?`
        : `SELECT d.id
           FROM cm_documents d
           JOIN cm_folders f ON f.id = d.folder_id
           WHERE d.id = ? AND f.org_id = ?`,
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    return !!rows[0];
  }
  if (entityType === 'faq') {
    const [rows] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT q.id
           FROM cm_faqs q
           JOIN cm_folders f ON f.id = q.folder_id
           WHERE q.id = ?`
        : `SELECT q.id
           FROM cm_faqs q
           JOIN cm_folders f ON f.id = q.folder_id
           WHERE q.id = ? AND f.org_id = ?`,
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    return !!rows[0];
  }
  return false;
}

// What Browse shows: published and in date. The counts above include drafts,
// so a browser saw "3" against a folder that showed one item.
const PUBLISHED_COUNTS = `
                  (SELECT COUNT(*) FROM cm_documents WHERE folder_id = f.id AND status = 'Published' AND (expiry_date IS NULL OR expiry_date >= CURDATE())) AS published_doc_count,
                  (SELECT COUNT(*) FROM cm_faqs WHERE folder_id = f.id AND status = 'Published' AND (expiry_date IS NULL OR expiry_date >= CURDATE())) AS published_faq_count,
                  (SELECT COUNT(*) FROM cm_modules WHERE folder_id = f.id AND status = 'Published' AND (expiry_date IS NULL OR expiry_date >= CURDATE())) AS published_module_count`;

// GET /api/cm/folders — list active folders
router.get('/folders', authenticate, async (req, res) => {
  try {
    const statusSql = req.query.include_inactive === 'true' ? '1=1' : "f.status = 'Active'";
    const readable = await folderFilterSql(req.user, 'f.id');
    const [folders] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT f.*,
                  p.trade_name AS product_name,
                  s.name AS site_name,
                  u.name AS created_by_name,
                  (SELECT COUNT(*) FROM cm_documents WHERE folder_id = f.id AND status != 'Archived') AS doc_count,
                  (SELECT COUNT(*) FROM cm_faqs WHERE folder_id = f.id AND status != 'Archived') AS faq_count,
                  (SELECT COUNT(*) FROM cm_modules WHERE folder_id = f.id AND status != 'Archived') AS module_count,
                  ${PUBLISHED_COUNTS}
           FROM cm_folders f
           LEFT JOIN products p ON f.product_id = p.id
           LEFT JOIN sites s ON f.site_id = s.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE ${statusSql}${readable}
           ORDER BY f.name`
        : `SELECT f.*,
                  p.trade_name AS product_name,
                  s.name AS site_name,
                  u.name AS created_by_name,
                  (SELECT COUNT(*) FROM cm_documents WHERE folder_id = f.id AND status != 'Archived') AS doc_count,
                  (SELECT COUNT(*) FROM cm_faqs WHERE folder_id = f.id AND status != 'Archived') AS faq_count,
                  (SELECT COUNT(*) FROM cm_modules WHERE folder_id = f.id AND status != 'Archived') AS module_count,
                  ${PUBLISHED_COUNTS}
           FROM cm_folders f
           LEFT JOIN products p ON f.product_id = p.id
           LEFT JOIN sites s ON f.site_id = s.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE ${statusSql}${readable} AND f.org_id = ?
           ORDER BY f.name`,
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
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
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    const [result] = await pool.execute(
      "INSERT INTO cm_folders (name, product_id, site_id, description, created_by, org_id, status) VALUES (?, ?, ?, ?, ?, ?, 'Active')",
      [String(name).trim(), product_id || null, site_id || null, description || null, req.user.userId, orgId]
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
      hasPlatformAdminScope(req)
        ? 'SELECT id, org_id, status FROM cm_folders WHERE id = ?'
        : 'SELECT id, org_id, status FROM cm_folders WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Folder not found.' });
    const orgId = getScopedOrgId(req, req.body.org_id || existing.org_id);

    const { name, product_id, site_id, description } = req.body;
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name is required.' });
    const status = req.body.status === undefined ? existing.status : req.body.status;
    if (!FOLDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be Active or Inactive.' });
    if (status === 'Inactive' && existing.status !== 'Inactive') {
      const busy = await liveContent(id);
      if (busy) return res.status(400).json({ error: busy });
    }
    await pool.execute(
      'UPDATE cm_folders SET name = ?, product_id = ?, site_id = ?, description = ?, org_id = ?, status = ?, updated_at = NOW() WHERE id = ?',
      [String(name).trim(), product_id || null, site_id || null, description || null, orgId, status, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_folder', Number(id), { name, status });
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
      hasPlatformAdminScope(req)
        ? 'SELECT id, name FROM cm_folders WHERE id = ?'
        : 'SELECT id, name FROM cm_folders WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Folder not found.' });

    const busy = await liveContent(id);
    if (busy) return res.status(400).json({ error: busy });

    await pool.execute("UPDATE cm_folders SET status = 'Inactive', updated_at = NOW() WHERE id = ?", [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'cm_folder', Number(id), { name: existing.name });
    res.json({ message: 'Folder deactivated.' });
  } catch (err) {
    console.error('DELETE /cm/folders/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/sites — the organisation's sites, for a folder. The admin site
// list refuses content managers.
router.get('/sites', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name FROM sites WHERE is_active = 1 AND org_id = ? ORDER BY name', [req.user.orgId]);
    res.json({ sites: rows });
  } catch (err) {
    console.error('GET /cm/sites error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E8: Folder-level permissions ──────────────────────────────────────────

// GET /api/cm/folders/:id/permissions
router.get('/folders/:id/permissions', authenticate, async (req, res) => {
  try {
    const folder = await getScopedFolder(req, req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    const [perms] = await pool.execute(
      `SELECT fp.*, sg.name AS group_name
       FROM cm_folder_permissions fp
       JOIN security_groups sg ON sg.id = fp.security_group_id
       WHERE fp.folder_id = ?
       ORDER BY sg.name`,
      [req.params.id]
    );
    res.json({ permissions: perms, groups: await usableGroups(req) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/folders/:id/permissions
router.post('/folders/:id/permissions', authenticate, async (req, res) => {
  try {
    const folder = await getScopedFolder(req, req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    const { security_group_id, permission_level } = req.body;
    if (!security_group_id) return res.status(400).json({ error: 'security_group_id required' });
    if (permission_level && !['read', 'write', 'manage'].includes(permission_level)) {
      return res.status(400).json({ error: 'Permission level must be read, write or manage.' });
    }
    if (!(await usableGroups(req)).some((g) => Number(g.id) === Number(security_group_id))) {
      return res.status(404).json({ error: 'Security group not found for active organisation.' });
    }
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
    const folder = await getScopedFolder(req, req.params.id);
    if (!folder) return res.status(404).json({ error: 'Folder not found.' });
    const [gone] = await pool.execute(
      `DELETE FROM cm_folder_permissions WHERE folder_id = ? AND security_group_id = ?`,
      [req.params.id, req.params.groupId]
    );
    if (!gone.affectedRows) return res.status(404).json({ error: 'That group has no permission on this folder.' });
    await audit(req.user.userId, req.user.email, 'REMOVE_FOLDER_PERMISSION', 'cm_folder', Number(req.params.id), { security_group_id: Number(req.params.groupId) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CM-E9: Browse bookmarks ───────────────────────────────────────────────────

// GET /api/cm/folders/bookmarks
router.get('/folders/bookmarks', authenticate, async (req, res) => {
  try {
    // Only what can still be opened: a bookmark to content since archived,
    // expired or put in a folder the user cannot open stayed listed and led
    // nowhere. The rows are kept, so it comes back if the item does.
    const docFilter = await folderFilterSql(req.user, 'd.folder_id');
    const faqFilter = await folderFilterSql(req.user, 'q.folder_id');
    const [bookmarks] = await pool.execute(
      `SELECT b.*, COALESCE(d.name, q.question, fo.name) AS entity_name
         FROM cm_browse_bookmarks b
         LEFT JOIN cm_documents d ON b.entity_type = 'document' AND d.id = b.entity_id
              AND d.status = 'Published' AND (d.expiry_date IS NULL OR d.expiry_date >= CURDATE())${docFilter}
         LEFT JOIN cm_faqs q ON b.entity_type = 'faq' AND q.id = b.entity_id
              AND q.status = 'Published' AND (q.expiry_date IS NULL OR q.expiry_date >= CURDATE())${faqFilter}
         LEFT JOIN cm_folders fo ON b.entity_type = 'folder' AND fo.id = b.entity_id AND fo.status = 'Active'
        WHERE b.user_id = ? AND COALESCE(d.id, q.id, fo.id) IS NOT NULL
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
    if (!await verifyScopedEntity(req, entity_type, entity_id)) {
      return res.status(404).json({ error: 'Entity not found for active organisation.' });
    }
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
