'use strict';

/**
 * cm/faqs.js — Content Management FAQs API
 * FAQ lifecycle: Draft → CheckedOut → Pending → Approved → Published → Archived
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireCapability } = require('../../middleware/auth');
const bcrypt = require('bcrypt');
const { enforceEvidenceGate, evaluateEvidenceChain } = require('../../services/contentIntelligenceService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { publishedOnly } = require('../../middleware/cmAccess');
const { folderFilterSql } = require('../../services/cmFolderAccess');
const { lineageHistory } = require('../../services/cmLineage');
const { logAudit } = require('../../utils/auditLog');

async function audit(userId, userName, action, entity, entityId, details) {
  await logAudit(userId, userName, action, entity, entityId, details);
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

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function decorateFaqRow(faq) {
  if (!faq) return faq;
  return {
    ...faq,
    answer: faq.answer_html ?? '',
    tags: faq.search_tags ?? '',
    version: `${faq.version_major || 1}.${faq.version_minor || 0}`,
  };
}

async function getScopedFaq(req, faqId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ?`
      : `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ? AND fo.org_id = ?`,
    hasPlatformAdminScope(req) ? [faqId] : [faqId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedFolder(req, folderId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? 'SELECT id FROM cm_folders WHERE id = ?'
      : 'SELECT id FROM cm_folders WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

// GET /api/cm/faqs — list with filters
router.get('/faqs', authenticate, async (req, res) => {
  try {
    const { status, folder_id, search, category, page = 1, limit = 50, include_expired = 'false' } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT f.*, fo.name AS folder_name, u.name AS created_by_name,
             (SELECT r.id FROM cm_faqs r WHERE r.revision_of = f.id AND r.status NOT IN ('Published','Archived') LIMIT 1) AS open_revision_id,
             (SELECT CONCAT(o.version_major, '.', o.version_minor) FROM cm_faqs o WHERE o.id = f.revision_of) AS revises_version
      FROM cm_faqs f
      LEFT JOIN cm_folders fo ON f.folder_id = fo.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!hasPlatformAdminScope(req)) {
      query += ' AND fo.org_id = ?';
      params.push(req.user.orgId);
    }

    if (status) {
      query += ' AND f.status = ?';
      params.push(status);
    }
    // MIPM-210: drafts are for Content Management, not for agents browsing.
    if (await publishedOnly(req)) query += " AND f.status = 'Published'";
    query += await folderFilterSql(req.user, 'f.folder_id');
    if (folder_id) {
      query += ' AND f.folder_id = ?';
      params.push(folder_id);
    }
    if (search) {
      query += ' AND (f.question LIKE ? OR f.category LIKE ? OR f.search_tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      query += ' AND f.category = ?';
      params.push(category);
    }
    if (include_expired !== 'true') {
      query += ' AND (f.expiry_date IS NULL OR f.expiry_date >= CURDATE())';
    }

    const countQuery = `SELECT COUNT(*) AS total FROM (${query}) counted`;
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY f.updated_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [faqs] = await pool.execute(query, params);
    res.json({ faqs: faqs.map(decorateFaqRow), total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/faqs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/faqs/:id/versions — the version history of the whole line of
// versions. The screen had no history for faqs although it was recorded.
router.get('/faqs/:id/versions', authenticate, async (req, res) => {
  try {
    const row = await getScopedFaq(req, req.params.id);
    if (!row) return res.status(404).json({ error: 'FAQ not found.' });
    if (await publishedOnly(req)) return res.status(404).json({ error: 'FAQ not found.' });
    res.json({ versions: await lineageHistory('faq', row.id) });
  } catch (err) {
    console.error('GET /cm/faqs/:id/versions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/faqs/:id/publish-checks — the publishing checks, run without publishing.
router.get('/faqs/:id/publish-checks', authenticate, async (req, res) => {
  try {
    const faq = await getScopedFaq(req, req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    const r = await evaluateEvidenceChain({ orgId: faq.folder_org_id || req.user.orgId, contentType: 'faq', contentId: faq.id, mode: 'publish' });
    res.json({ allow: r.allow, blockers: r.blockers, warnings: r.warnings, checks: r.checks });
  } catch (err) {
    console.error('GET /cm/faqs/:id/publish-checks error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs — create FAQ (status=Draft)
router.post('/faqs', authenticate, requireCapability('content.faq.manage'), async (req, res) => {
  try {
    const {
      folder_id,
      question,
      answer_html,
      answer,
      category,
      approval_required,
      expiry_date,
      search_tags,
      tags,
    } = req.body;
    if (!folder_id || !question) return res.status(400).json({ error: 'folder_id and question are required.' });
    const scopedFolder = await getScopedFolder(req, folder_id);
    if (!scopedFolder) return res.status(404).json({ error: 'Folder not found for active organisation.' });
    const resolvedAnswerHtml = answer_html !== undefined ? answer_html : (answer !== undefined ? answer : null);
    const resolvedSearchTags = Array.isArray(tags) ? tags.join(',') : (search_tags !== undefined ? search_tags : tags || null);

    const [result] = await pool.execute(
      `INSERT INTO cm_faqs (folder_id, question, answer_html, category, approval_required, expiry_date, search_tags, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [
        folder_id, question.trim(), resolvedAnswerHtml || null, category || null,
        approval_required !== undefined ? (approval_required ? 1 : 0) : 1,
        expiry_date || null, resolvedSearchTags || null, req.user.userId,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_faq', result.insertId, { folder_id, category });
    const [[created]] = await pool.execute('SELECT * FROM cm_faqs WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'FAQ created.', id: result.insertId, faq: decorateFaqRow(created) });
  } catch (err) {
    console.error('POST /cm/faqs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/faqs/:id — get faq
router.get('/faqs/:id', authenticate, async (req, res) => {
  try {
    const [[faq]] = await pool.execute(
      hasPlatformAdminScope(req)
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
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (faq.status !== 'Published' && await publishedOnly(req)) return res.status(404).json({ error: 'FAQ not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'faq' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );

    res.json({ faq: decorateFaqRow(faq), versions });
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

    const {
      folder_id,
      question,
      answer_html,
      answer,
      category,
      approval_required,
      expiry_date,
      search_tags,
      tags,
    } = req.body;
    if (folder_id && Number(folder_id) !== Number(faq.folder_id)) {
      const scopedFolder = await getScopedFolder(req, folder_id);
      if (!scopedFolder) return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }
    const resolvedAnswerHtml = answer_html !== undefined ? answer_html : (answer !== undefined ? answer : faq.answer_html);
    const resolvedSearchTags = Array.isArray(tags) ? tags.join(',') : (search_tags !== undefined ? search_tags : (tags !== undefined ? tags : faq.search_tags));
    await pool.execute(
      `UPDATE cm_faqs SET folder_id = ?, question = ?, answer_html = ?, category = ?, approval_required = ?, expiry_date = ?, search_tags = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        folder_id || faq.folder_id,
        question || faq.question, resolvedAnswerHtml,
        category || faq.category, approval_required !== undefined ? (approval_required ? 1 : 0) : faq.approval_required,
        expiry_date || faq.expiry_date || null, resolvedSearchTags || null, req.user.userId, id,
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
// Check-in always goes to Pending (see below).
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
    // An FAQ marked "approval not required" was meant to publish on check-in, but
    // the evidence gate only publishes Approved content, so that check-in always
    // failed and left the FAQ checked out. The gate is the control: every
    // check-in goes to Pending for an independent approval (MIPM-131 follow-up).
    const nextStatus = 'Pending';

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
router.post('/faqs/:id/approve', authenticate, requireCapability('content.approve'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'password and reason are required.' });

    const faq = await getScopedFaq(req, id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    if (!['Pending', 'Under Review'].includes(faq.status)) {
      return res.status(400).json({ error: 'FAQ must be in Pending or Under Review status to approve.' });
    }
    if (Number(req.user.userId) === Number(faq.created_by)) {
      return res.status(403).json({ error: 'The author of a document cannot approve it. An independent reviewer is required.' });
    }

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    // WP5: guard against missing user / SSO-only (null password) account — bcrypt.compare
    // on a null hash threw a TypeError → generic 500 instead of a clean 401 on the e-sign path.
    if (!user?.password) return res.status(401).json({ error: 'Electronic signature rejected — password sign-off not available for this account.' });
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
router.post('/faqs/:id/publish', authenticate, requireCapability('content.publish'), async (req, res) => {
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
        error: `This FAQ cannot be published yet: ${(evidenceGate.result?.blockers || []).join(' ') || 'it did not pass the evidence check.'}`,
        run_id: evidenceGate.run_id,
        evidence: evidenceGate.result,
      });
    }

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    // WP5: guard against missing user / SSO-only (null password) account — bcrypt.compare
    // on a null hash threw a TypeError → generic 500 instead of a clean 401 on the e-sign path.
    if (!user?.password) return res.status(401).json({ error: 'Electronic signature rejected — password sign-off not available for this account.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });

    // WP5: bump the version ATOMICALLY (was computed from the earlier read — concurrent
    // publishes could land the same major), then read back for the version string.
    await pool.execute(
      "UPDATE cm_faqs SET status = 'Published', version_major = version_major + 1, version_minor = 0, updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    const [[afterFaq]] = await pool.execute('SELECT version_major, version_minor FROM cm_faqs WHERE id = ?', [id]);
    const versionStr = `${afterFaq.version_major}.${afterFaq.version_minor}`;
    await addVersionHistory(Number(id), versionStr, 'Published', reason, req.user.userId);
    // Publishing a revision retires the version it replaces.
    if (faq.revision_of) {
      const [[old]] = await pool.execute("SELECT id, version_major, version_minor FROM cm_faqs WHERE id = ? AND status = 'Published'", [faq.revision_of]);
      if (old) {
        await pool.execute("UPDATE cm_faqs SET status = 'Archived', updated_by = ?, updated_at = NOW() WHERE id = ?", [req.user.userId, old.id]);
        await addVersionHistory(old.id, `${old.version_major}.${old.version_minor}`, 'Archived', `Superseded by version ${versionStr}.`, req.user.userId);
        await audit(req.user.userId, req.user.email, 'SUPERSEDE', 'cm_faq', old.id, { superseded_by: Number(id), new_version: versionStr });
      }
    }
    await audit(req.user.userId, req.user.email, 'PUBLISH', 'cm_faq', Number(id), { reason, version: versionStr });
    res.json({ message: 'FAQ published.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/faqs/:id/publish error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/revise — draft the next version of a published FAQ. A
// published FAQ could not be changed at all (check-out takes Draft only); the
// published one stays in Browse Content until this one is published.
router.post('/faqs/:id/revise', authenticate, requireCapability('content.faq.manage'), async (req, res) => {
  try {
    const src = await getScopedFaq(req, req.params.id);
    if (!src) return res.status(404).json({ error: 'FAQ not found.' });
    if (src.status !== 'Published') return res.status(400).json({ error: 'Only a published FAQ is revised. Edit a draft directly.' });
    const [[open]] = await pool.execute(
      "SELECT id FROM cm_faqs WHERE revision_of = ? AND status NOT IN ('Published','Archived') LIMIT 1", [src.id]);
    if (open) return res.status(409).json({ error: 'This FAQ already has a revision in progress.', id: open.id });
    const [result] = await pool.execute(
      `INSERT INTO cm_faqs (folder_id, question, answer_html, category, approval_required, expiry_date, search_tags,
          status, version_major, version_minor, revision_of, created_by)
       SELECT folder_id, question, answer_html, category, approval_required, expiry_date, search_tags,
          'Draft', version_major, version_minor, id, ?
         FROM cm_faqs WHERE id = ?`, [req.user.userId, src.id]);
    const version = `${src.version_major}.${src.version_minor}`;
    await addVersionHistory(result.insertId, version, 'Draft', `Revision of published version ${version} started.`, req.user.userId);
    await audit(req.user.userId, req.user.email, 'REVISE', 'cm_faq', result.insertId, { revision_of: src.id, from_version: version });
    res.status(201).json({ message: 'Revision started. The published FAQ stays in use until this one is published.', id: result.insertId });
  } catch (err) {
    console.error('POST /cm/faqs/:id/revise error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/faqs/:id/view — increment view count and log to cm_content_view_log (#11)
router.post('/faqs/:id/view', authenticate, async (req, res) => {
  try {
    const faq = await getScopedFaq(req, req.params.id);
    if (!faq) return res.status(404).json({ error: 'FAQ not found.' });
    await pool.execute(`UPDATE cm_faqs SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?`, [req.params.id]).catch(() => {});
    await pool.execute(
      `INSERT INTO cm_content_view_log (entity_type, entity_id, user_id, user_name, ip_address)
       VALUES ('faq', ?, ?, ?, ?)`,
      [req.params.id, req.user.userId || null, req.user.name || req.user.email || null, req.ip || null]
    ).catch(() => {});
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
    if (!hasPlatformAdminScope(req)) {
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

// POST /api/cm/faqs/:id/clone — duplicate FAQ as Draft (#8)
// WP5: clone creates a new FAQ, so it must require the same capability as POST /faqs.
router.post('/faqs/:id/clone', authenticate, requireCapability('content.faq.manage'), async (req, res) => {
  try {
    const src = await getScopedFaq(req, req.params.id);
    if (!src) return res.status(404).json({ error: 'FAQ not found.' });

    const [result] = await pool.execute(
      `INSERT INTO cm_faqs (folder_id, question, answer_html, category, approval_required, expiry_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      [
        src.folder_id, `Copy of ${src.question}`, src.answer_html || null,
        src.category || null, src.approval_required !== undefined ? src.approval_required : 1,
        src.expiry_date || null, req.user.userId,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CLONE', 'cm_faq', result.insertId, { source_id: src.id, source_question: src.question });
    res.status(201).json({ message: 'FAQ cloned.', id: result.insertId });
  } catch (err) {
    console.error('POST /cm/faqs/:id/clone error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
