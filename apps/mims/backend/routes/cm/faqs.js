'use strict';

/**
 * cm/faqs.js — Content Management FAQs API
 * FAQ lifecycle: Draft → CheckedOut → Pending (or Published if approval_required=false) → Approved → Published → Archived
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const bcrypt = require('bcrypt');
const { enforceEvidenceGate } = require('../../services/contentIntelligenceService');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

async function addVersionHistory(entityId, version, status, notes, authorId) {
  try {
    await pool.execute(
      'INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['faq', entityId, version, status, notes || null, authorId]
    );
  } catch (_) {}
}

// Try to add view_count column if it doesn't exist (CM-E6)
pool.execute(`ALTER TABLE cm_faqs ADD COLUMN view_count INT DEFAULT 0`).catch(() => {});

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

async function getScopedFaq(req, faqId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ?`
      : `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ? AND fo.org_id = ?`,
    isSuperadmin(req) ? [faqId] : [faqId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedFolder(req, folderId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT id FROM cm_folders WHERE id = ?'
      : 'SELECT id FROM cm_folders WHERE id = ? AND org_id = ?',
    isSuperadmin(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

// GET /api/cm/faqs — list with filters
router.get('/faqs', authenticate, async (req, res) => {
  try {
    const { status, folder_id, search, page = 1, limit = 50, include_expired = 'false' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT f.*, fo.name AS folder_name, u.name AS created_by_name
      FROM cm_faqs f
      LEFT JOIN cm_folders fo ON f.folder_id = fo.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperadmin(req)) {
      query += ' AND fo.org_id = ?';
      params.push(req.user.orgId);
    }

    if (status) {
      query += ' AND f.status = ?';
      params.push(status);
    }
    if (folder_id) {
      query += ' AND f.folder_id = ?';
      params.push(folder_id);
    }
    if (search) {
      query += ' AND (f.question LIKE ? OR f.category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (include_expired !== 'true') {
      query += ' AND (f.expiry_date IS NULL OR f.expiry_date >= CURDATE())';
    }

    const countQuery = query.replace('SELECT f.*, fo.name AS folder_name, u.name AS created_by_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY f.updated_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [faqs] = await pool.execute(query, params);
    res.json({ faqs, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/faqs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs — create FAQ (status=Draft)
router.post('/faqs', authenticate, async (req, res) => {
  try {
    const { folder_id, question, answer_html, category, approval_required, expiry_date } = req.body;
    if (!folder_id || !question) return res.status(400).json({ error: 'folder_id and question are required.' });
    const scopedFolder = await getScopedFolder(req, folder_id);
    if (!scopedFolder) return res.status(404).json({ error: 'Folder not found for active organisation.' });

    const [result] = await pool.execute(
      `INSERT INTO cm_faqs (folder_id, question, answer_html, category, approval_required, expiry_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [
        folder_id, question.trim(), answer_html || null, category || null,
        approval_required !== undefined ? (approval_required ? 1 : 0) : 1,
        expiry_date || null, req.user.userId,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_faq', result.insertId, { folder_id, category });
    const [[created]] = await pool.execute('SELECT * FROM cm_faqs WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'FAQ created.', id: result.insertId, faq: created });
  } catch (err) {
    console.error('POST /cm/faqs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/faqs/:id — get faq
router.get('/faqs/:id', authenticate, async (req, res) => {
  try {
    const [[faq]] = await pool.execute(
      isSuperadmin(req)
        ? `SELECT f.*, fo.name AS folder_name, u.name AS created_by_name
           FROM cm_faqs f
           LEFT JOIN cm_folders fo ON f.folder_id = fo.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE f.id = ?`
        : `SELECT f.*, fo.name AS folder_name, u.name AS created_by_name
           FROM cm_faqs f
           LEFT JOIN cm_folders fo ON f.folder_id = fo.id
           LEFT JOIN users u ON f.created_by = u.id
           WHERE f.id = ? AND fo.org_id = ?`,
      isSuperadmin(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'faq' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );

    res.json({ faq, versions });
  } catch (err) {
    console.error('GET /cm/faqs/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/faqs/:id — update FAQ
router.put('/faqs/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });

    if (faq.status !== 'Draft' && !(faq.status === 'CheckedOut' && faq.checked_out_by === req.user.userId)) {
      return res.status(403).json({ error: 'FAQ can only be updated when in Draft status or checked out by you.' });
    }

    const { question, answer_html, category, approval_required, expiry_date } = req.body;
    await pool.execute(
      `UPDATE cm_faqs SET question = ?, answer_html = ?, category = ?, approval_required = ?, expiry_date = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        question || faq.question, answer_html !== undefined ? answer_html : faq.answer_html,
        category || faq.category, approval_required !== undefined ? (approval_required ? 1 : 0) : faq.approval_required,
        expiry_date || faq.expiry_date || null, req.user.userId, id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_faq', Number(id), {});
    res.json({ message: 'FAQ updated.' });
  } catch (err) {
    console.error('PUT /cm/faqs/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/checkout — check out FAQ
router.post('/faqs/:id/checkout', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (faq.status !== 'Draft') return res.status(400).json({ error: 'Only Draft FAQs can be checked out.' });
    if (faq.checked_out_by) return res.status(400).json({ error: 'FAQ is already checked out.' });

    await pool.execute(
      "UPDATE cm_faqs SET status = 'CheckedOut', checked_out_by = ?, checked_out_at = NOW(), updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'CHECKOUT', 'cm_faq', Number(id), {});
    res.json({ message: 'FAQ checked out.' });
  } catch (err) {
    console.error('POST /cm/faqs/:id/checkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/checkin — check in
// Special: if approval_required=false, go directly to Published
router.post('/faqs/:id/checkin', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (faq.status !== 'CheckedOut') return res.status(400).json({ error: 'FAQ is not checked out.' });
    if (faq.checked_out_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the user who checked out this FAQ can check it in.' });
    }

    const newMinor = faq.version_minor + 1;
    const versionStr = `${faq.version_major}.${newMinor}`;
    const nextStatus = faq.approval_required ? 'Pending' : 'Published';

    if (nextStatus === 'Published') {
      const evidenceGate = await enforceEvidenceGate({
        orgId: faq.folder_org_id || req.user.orgId,
        contentType: 'faq',
        contentId: Number(id),
        mode: 'publish',
        actorUserId: req.user.userId,
        metadata: { route: '/api/cm/faqs/:id/checkin', auto_publish: true },
      });
      if (!evidenceGate.allow) {
        return res.status(422).json({
          error: 'Evidence Chain Compiler blocked publish during FAQ check-in.',
          run_id: evidenceGate.run_id,
          evidence: evidenceGate.result,
        });
      }
    }

    await pool.execute(
      `UPDATE cm_faqs SET status = ?, checked_out_by = NULL, checked_out_at = NULL,
         version_minor = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextStatus, newMinor, req.user.userId, id]
    );

    await addVersionHistory(Number(id), versionStr, nextStatus, notes || 'Checked in', req.user.userId);
    await audit(req.user.userId, req.user.email, 'CHECKIN', 'cm_faq', Number(id), { version: versionStr, status: nextStatus });
    res.json({ message: `FAQ checked in. Status: ${nextStatus}.`, version: versionStr });
  } catch (err) {
    console.error('POST /cm/faqs/:id/checkin error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/approve — approve
router.post('/faqs/:id/approve', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'password and reason are required.' });

    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (!['Pending', 'Under Review'].includes(faq.status)) {
      return res.status(400).json({ error: 'FAQ must be in Pending or Under Review status to approve.' });
    }

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });

    const versionStr = `${faq.version_major}.${faq.version_minor}`;
    await pool.execute(
      "UPDATE cm_faqs SET status = 'Approved', updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await addVersionHistory(Number(id), versionStr, 'Approved', reason, req.user.userId);
    await audit(req.user.userId, req.user.email, 'APPROVE', 'cm_faq', Number(id), { reason, version: versionStr });
    res.json({ message: 'FAQ approved.' });
  } catch (err) {
    console.error('POST /cm/faqs/:id/approve error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/publish — publish
router.post('/faqs/:id/publish', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'password and reason are required.' });

    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (faq.status !== 'Approved') return res.status(400).json({ error: 'Only Approved FAQs can be published.' });

    const evidenceGate = await enforceEvidenceGate({
      orgId: faq.folder_org_id || req.user.orgId,
      contentType: 'faq',
      contentId: Number(id),
      mode: 'publish',
      actorUserId: req.user.userId,
      metadata: { route: '/api/cm/faqs/:id/publish', reason: reason || null },
    });
    if (!evidenceGate.allow) {
      return res.status(422).json({
        error: 'Evidence Chain Compiler blocked this FAQ publish request.',
        run_id: evidenceGate.run_id,
        evidence: evidenceGate.result,
      });
    }

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });

    const newMajor = faq.version_major + 1;
    const versionStr = `${newMajor}.0`;

    await pool.execute(
      "UPDATE cm_faqs SET status = 'Published', version_major = ?, version_minor = 0, updated_by = ?, updated_at = NOW() WHERE id = ?",
      [newMajor, req.user.userId, id]
    );
    await addVersionHistory(Number(id), versionStr, 'Published', reason, req.user.userId);
    await audit(req.user.userId, req.user.email, 'PUBLISH', 'cm_faq', Number(id), { reason, version: versionStr });
    res.json({ message: 'FAQ published.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/faqs/:id/publish error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/view — increment view count (CM-E6)
router.post('/faqs/:id/view', authenticate, async (req, res) => {
  try {
    const faq = await getScopedFaq(req, req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    // Try to increment view_count column; if column doesn't exist, just return ok
    await pool.execute(`UPDATE cm_faqs SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?`, [req.params.id]).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cm/faqs/bulk-tags — bulk assign tags to multiple FAQs (CM-E6)
router.patch('/faqs/bulk-tags', authenticate, async (req, res) => {
  try {
    const { ids, tags } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });
    const normalizedIds = ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
    if (normalizedIds.length === 0) return res.status(400).json({ error: 'No valid FAQ ids supplied.' });
    const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
    const placeholders = normalizedIds.map(() => '?').join(',');
    let query = `UPDATE cm_faqs SET search_tags = ?, updated_by = ?, updated_at = NOW() WHERE id IN (${placeholders})`;
    const params = [tagsStr, req.user.userId, ...normalizedIds];
    if (!isSuperadmin(req)) {
      query += ` AND folder_id IN (SELECT id FROM cm_folders WHERE org_id = ?)`;
      params.push(req.user.orgId);
    }
    const [result] = await pool.execute(query, params);
    res.json({ success: true, updated: Number(result.affectedRows || 0) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cm/faqs/:id/archive — archive
router.post('/faqs/:id/archive', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });

    const versionStr = `${faq.version_major}.${faq.version_minor}`;
    await pool.execute(
      "UPDATE cm_faqs SET status = 'Archived', updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await addVersionHistory(Number(id), versionStr, 'Archived', reason || 'Manually archived', req.user.userId);
    await audit(req.user.userId, req.user.email, 'ARCHIVE', 'cm_faq', Number(id), {});
    res.json({ message: 'FAQ archived.' });
  } catch (err) {
    console.error('POST /cm/faqs/:id/archive error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
