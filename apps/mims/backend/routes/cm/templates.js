'use strict';

/**
 * cm/templates.js — Content Management Templates API
 * Email/response/acknowledgment templates (no lifecycle, just Active/Inactive).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { MERGE_FIELDS, buildMergeData, applyHtml, applyText } = require('../../services/mergeFields');
const { authenticate } = require('../../middleware/auth');
const { enforceEvidenceGate } = require('../../services/contentIntelligenceService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { publishedOnly } = require('../../middleware/cmAccess');
const { folderFilterSql } = require('../../services/cmFolderAccess');
const { logAudit } = require('../../utils/auditLog');
const bcrypt = require('bcrypt');

// The kinds of template the letter builder uses. "Transmission" was offered on
// the screen but nothing ever read a template of that type.
const TEMPLATE_TYPES = ['Response', 'Acknowledgment', 'Correspondence', 'Email'];

// A language code as stored on content (en, fr, de …); English when not given.
function languageCode(value) {
  const v = String(value || '').trim().toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v) ? v : 'en';
}

async function passwordMatches(userId, password) {
  if (!password) return false;
  const [[u]] = await pool.execute('SELECT password FROM users WHERE id = ?', [userId]);
  return !!u?.password && bcrypt.compare(String(password), u.password);
}

async function audit(userId, userName, action, entity, entityId, details) {
  await logAudit(userId, userName, action, entity, entityId, details);
}

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function templateScopePredicate(req, alias = 't') {
  if (hasPlatformAdminScope(req)) return '1=1';
  // WP1: a foldered template is scoped strictly by its folder's org (cm_folders.org_id)
  // — the old creator-based scope leaked a multi-org user's templates into every org
  // they could access. NULL-folder templates keep the creator-based fallback so they
  // don't vanish (no regression for legacy folderless templates).
  return `(
    EXISTS (SELECT 1 FROM cm_folders cf WHERE cf.id = ${alias}.folder_id AND cf.org_id = ?)
    OR (${alias}.folder_id IS NULL AND EXISTS (
      SELECT 1
      FROM users tu
      LEFT JOIN user_org_access tua
        ON tua.user_id = tu.id
       AND tua.org_id = ?
       AND tua.is_active = 1
      WHERE tu.id = ${alias}.created_by
        AND (tu.org_id = ? OR tua.user_id IS NOT NULL)
    ))
  )`;
}

function templateScopeParams(req) {
  return hasPlatformAdminScope(req) ? [] : [req.user.orgId, req.user.orgId, req.user.orgId];
}

async function getScopedTemplate(req, templateId) {
  const [rows] = await pool.execute(
    `SELECT t.*, u.name AS created_by_name, uu.name AS updated_by_name
     FROM cm_templates t
     LEFT JOIN users u ON t.created_by = u.id
     LEFT JOIN users uu ON t.updated_by = uu.id
     WHERE t.id = ? AND ${templateScopePredicate(req, 't')}`,
    [templateId, ...templateScopeParams(req)]
  );
  return rows[0] || null;
}

async function getScopedCase(req, caseId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT c.id, c.case_number, c.case_type, c.org_id, o.name AS org_name
         FROM cases c
         LEFT JOIN organisations o ON o.id = c.org_id
         WHERE c.id = ?`
      : `SELECT c.id, c.case_number, c.case_type, c.org_id, o.name AS org_name
         FROM cases c
         LEFT JOIN organisations o ON o.id = c.org_id
         WHERE c.id = ? AND c.org_id = ?`,
    hasPlatformAdminScope(req) ? [caseId] : [caseId, req.user.orgId]
  );
  return rows[0] || null;
}

function decorateTemplateRow(template) {
  if (!template) return template;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = template.expiry_date ? new Date(template.expiry_date) : null;
  return {
    ...template,
    body: template.body_html ?? '',
    version: `${template.version_major || 1}.${template.version_minor || 0}`,
    is_expired: !!exp && exp < today,
  };
}

// Lifecycle transitions for a template. Mirrors the cm_documents governance
// model (Draft → Approved → Published → Archived). Templates only reach the MI
// response builder once they are 'Published' and not expired.
const TEMPLATE_TRANSITIONS = {
  approve: { from: ['Draft'], to: 'Approved' },
  publish: { from: ['Approved'], to: 'Published' },
  archive: { from: ['Draft', 'Approved', 'Published'], to: 'Archived' },
  revert:  { from: ['Approved', 'Archived'], to: 'Draft' }, // a published one changes through Revise
};

async function transitionTemplate(req, res, action) {
  try {
    const cfg = TEMPLATE_TRANSITIONS[action];
    const tmpl = await getScopedTemplate(req, req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Template not found.' });
    if (!cfg.from.includes(tmpl.status)) {
      return res.status(409).json({ error: `Cannot ${action} a template that is '${tmpl.status}'.` });
    }

    // Publishing makes a template live for response use — same gate as activation.
    if (action === 'publish' && req.user.orgId) {
      const evidenceGate = await enforceEvidenceGate({
        orgId: req.user.orgId,
        contentType: 'template',
        contentId: Number(req.params.id),
        mode: 'response',
        actorUserId: req.user.userId,
        metadata: { route: '/api/cm/templates/:id/publish', action: 'publish' },
      });
      if (!evidenceGate.allow) {
        return res.status(422).json({
          error: `This template cannot be published yet: ${(evidenceGate.result?.blockers || []).join(' ') || 'it did not pass the evidence check.'}`,
          run_id: evidenceGate.run_id,
          evidence: evidenceGate.result,
        });
      }
    }

    // Approving and publishing a template is an electronic signature — password
    // and reason — as it is for documents, modules and FAQs. Templates moved on a
    // single click, and the author could approve their own wording.
    const signing = action === 'approve' || action === 'publish';
    const reason = String(req.body?.reason || '').trim();
    if (signing) {
      if (action === 'approve' && Number(tmpl.created_by) === Number(req.user.userId)) {
        return res.status(403).json({ error: 'The author of a template cannot approve it. An independent reviewer is required.' });
      }
      if (!req.body?.password || !reason) {
        return res.status(400).json({ error: `Your password and a reason are required to ${action} a template.` });
      }
      if (!(await passwordMatches(req.user.userId, req.body.password))) {
        return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
      }
    }

    const sets = ['status = ?', 'updated_by = ?', 'updated_at = NOW()'];
    const params = [cfg.to, req.user.userId];
    if (action === 'approve') { sets.push('approved_by = ?', 'approved_at = NOW()'); params.push(req.user.userId); }
    // Publishing moves to the next major version, as for documents (the version a
    // letter records); edits add to the minor number.
    if (action === 'publish') { sets.push('published_by = ?', 'published_at = NOW()', 'version_major = version_major + 1', 'version_minor = 0'); params.push(req.user.userId); }
    if (action === 'revert')  { sets.push('approved_by = NULL', 'approved_at = NULL', 'published_by = NULL', 'published_at = NULL'); }
    params.push(req.params.id);

    await pool.execute(`UPDATE cm_templates SET ${sets.join(', ')} WHERE id = ?`, params);
    const [[after]] = await pool.execute('SELECT version_major, version_minor FROM cm_templates WHERE id = ?', [req.params.id]);
    const version = `${after.version_major || 1}.${after.version_minor || 0}`;
    // Publishing a revision retires the version it replaces.
    if (action === 'publish' && tmpl.revision_of) {
      const [[old]] = await pool.execute("SELECT id, version_major, version_minor FROM cm_templates WHERE id = ? AND status = 'Published'", [tmpl.revision_of]);
      if (old) {
        await pool.execute("UPDATE cm_templates SET status = 'Archived', updated_by = ?, updated_at = NOW() WHERE id = ?", [req.user.userId, old.id]);
        await pool.execute(
          `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id) VALUES ('template', ?, ?, 'Archived', ?, ?)`,
          [old.id, `${old.version_major || 1}.${old.version_minor || 0}`, `Superseded by version ${version}.`, req.user.userId]);
        await audit(req.user.userId, req.user.email, 'SUPERSEDE', 'cm_template', old.id, { superseded_by: Number(req.params.id), new_version: version });
      }
    }
    await audit(req.user.userId, req.user.email, `TEMPLATE_${action.toUpperCase()}`, 'cm_template', Number(req.params.id), { name: tmpl.name, from: tmpl.status, to: cfg.to, version, reason: reason || null, esigned: signing });
    try {
      await pool.execute(
        `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
         VALUES ('template', ?, ?, ?, ?, ?)`,
        [req.params.id, version, cfg.to, reason || `${action} → ${cfg.to}`, req.user.userId]
      );
    } catch (_) {}

    res.json({ message: `Template moved to ${cfg.to}.`, status: cfg.to });
  } catch (err) {
    console.error(`POST /cm/templates/:id/${action} error:`, err);
    res.status(500).json({ error: 'Server error.' });
  }
}

// GET /api/cm/templates — list with filters
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { type, status, search, product_group_id, folder_id, include_expired, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT t.*, u.name AS created_by_name,
             (SELECT r.id FROM cm_templates r WHERE r.revision_of = t.id AND r.status NOT IN ('Published','Archived') LIMIT 1) AS open_revision_id,
             (SELECT CONCAT(o.version_major, '.', o.version_minor) FROM cm_templates o WHERE o.id = t.revision_of) AS revises_version
      FROM cm_templates t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params = [...templateScopeParams(req)];
    query += ` AND ${templateScopePredicate(req, 't')}`;

    if (type) {
      query += ' AND t.type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    // MIPM-210: drafts are for Content Management, not for agents.
    if (await publishedOnly(req)) query += " AND t.status = 'Published'";
    query += await folderFilterSql(req.user, 't.folder_id');
    if (search) {
      query += ' AND (t.name LIKE ? OR t.subject LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (product_group_id) {
      query += ` AND EXISTS (
        SELECT 1
          FROM product_group_assignments pga
         WHERE pga.target_type = 'cm_template'
           AND pga.target_id = t.id
           AND pga.group_id = ?
      )`;
      params.push(Number(product_group_id));
    }
    if (folder_id) {
      query += ' AND t.folder_id = ?';
      params.push(Number(folder_id));
    }
    if (include_expired !== 'true') {
      query += ' AND (t.expiry_date IS NULL OR t.expiry_date >= CURDATE())';
    }

    const countQuery = `SELECT COUNT(*) AS total FROM (${query}) counted`;
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY t.name LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [templates] = await pool.execute(query, params);
    res.json({ templates: templates.map(decorateTemplateRow), total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/templates — create template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { type, name, subject, body_html, body, folder_id, expiry_date, language } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (type && !TEMPLATE_TYPES.includes(type)) return res.status(400).json({ error: `Template type must be one of: ${TEMPLATE_TYPES.join(', ')}.` });
    // A template belongs to its organisation through its folder; one with no
    // folder fell back to its creator's organisations and could cross over.
    if (!folder_id) return res.status(400).json({ error: 'Choose a folder for the template.' });
    const [[folder]] = await pool.execute(
      hasPlatformAdminScope(req) ? 'SELECT id FROM cm_folders WHERE id = ?' : 'SELECT id FROM cm_folders WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [folder_id] : [folder_id, req.user.orgId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found for active organisation.' });
    const resolvedBodyHtml = body_html !== undefined ? body_html : (body !== undefined ? body : null);

    // New templates always start as Draft — they must pass through approve →
    // publish before they can be used in a response. Status is never client-set.
    const [result] = await pool.execute(
      'INSERT INTO cm_templates (type, name, subject, body_html, status, folder_id, expiry_date, language, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [type || 'Response', name.trim(), subject || null, resolvedBodyHtml || null, 'Draft', folder_id, expiry_date || null, languageCode(language), req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_template', result.insertId, { name, type: type || 'Response' });
    const created = await getScopedTemplate(req, result.insertId);
    res.status(201).json({ message: 'Template created.', id: result.insertId, template: decorateTemplateRow(created) });
  } catch (err) {
    console.error('POST /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/templates/case-search — search cases for template merge-field preview (#13)
// Must be registered before /templates/:id to prevent route shadowing.
router.get('/templates/case-search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters.' });
    }
    const search = `%${String(q).trim()}%`;
    const params = [search, search];
    let query = `
      SELECT c.id, c.case_number, c.case_type, c.org_id,
             TRIM(CONCAT(COALESCE(cc.first_name,''), ' ', COALESCE(cc.last_name,''))) AS patient_name
      FROM cases c
      LEFT JOIN case_contacts cc ON cc.case_id = c.id AND cc.is_primary = 1
      WHERE (c.case_number LIKE ? OR TRIM(CONCAT(COALESCE(cc.first_name,''), ' ', COALESCE(cc.last_name,''))) LIKE ?)
    `;
    if (!hasPlatformAdminScope(req)) {
      query += ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    query += ' ORDER BY c.created_at DESC LIMIT 20';
    const [cases] = await pool.execute(query, params);
    res.json({ cases });
  } catch (err) {
    console.error('GET /cm/templates/case-search error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/templates/:id — get template
router.get('/templates/:id', authenticate, async (req, res) => {
  try {
    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    if (template.status !== 'Published' && await publishedOnly(req)) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template: decorateTemplateRow(template) });
  } catch (err) {
    console.error('GET /cm/templates/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/templates/:id — update template
router.put('/templates/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScopedTemplate(req, id);
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const { type, name, subject, body_html, body, folder_id, expiry_date, language } = req.body;
    if (type && !TEMPLATE_TYPES.includes(type)) return res.status(400).json({ error: `Template type must be one of: ${TEMPLATE_TYPES.join(', ')}.` });
    const resolvedBodyHtml = body_html !== undefined ? body_html : (body !== undefined ? body : existing.body_html);
    const resolvedFolderId = folder_id !== undefined ? (folder_id || null) : existing.folder_id;
    if (!resolvedFolderId) return res.status(400).json({ error: 'Choose a folder for the template.' });
    if (Number(resolvedFolderId) !== Number(existing.folder_id)) {
      const [[folder]] = await pool.execute(
        hasPlatformAdminScope(req) ? 'SELECT id FROM cm_folders WHERE id = ?' : 'SELECT id FROM cm_folders WHERE id = ? AND org_id = ?',
        hasPlatformAdminScope(req) ? [resolvedFolderId] : [resolvedFolderId, req.user.orgId]);
      if (!folder) return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }
    const resolvedExpiry = expiry_date !== undefined ? (expiry_date || null) : existing.expiry_date;
    const resolvedName = String(name ?? existing.name ?? '').trim();
    if (!resolvedName) return res.status(400).json({ error: 'name is required.' });
    const resolvedSubject = subject !== undefined ? (subject || null) : existing.subject;

    // A published template stays in use while it changes: its next version is
    // drafted through Revise. Editing it here sent it back to Draft at once and
    // letters lost it until it was approved and published again.
    if (existing.status === 'Published') {
      return res.status(409).json({ error: 'A published template stays in use while it changes: use Revise to draft its next version.' });
    }
    // Editing approved wording invalidates the approval: back to Draft.
    const wasGoverned = existing.status === 'Approved';
    const newStatus = wasGoverned ? 'Draft' : existing.status;
    // A change of wording adds to the minor version, so a letter records which
    // wording it used (the version never moved, so every letter read 1.0).
    const wordingChanged = String(resolvedBodyHtml || '') !== String(existing.body_html || '')
      || String(resolvedSubject || '') !== String(existing.subject || '') || resolvedName !== existing.name;

    await pool.execute(
      `UPDATE cm_templates
          SET type = ?, name = ?, subject = ?, body_html = ?, folder_id = ?, expiry_date = ?, language = ?,
              version_minor = version_minor + ?,
              status = ?,
              approved_by  = CASE WHEN ? = 'Draft' THEN NULL ELSE approved_by  END,
              approved_at  = CASE WHEN ? = 'Draft' THEN NULL ELSE approved_at  END,
              published_by = CASE WHEN ? = 'Draft' THEN NULL ELSE published_by END,
              published_at = CASE WHEN ? = 'Draft' THEN NULL ELSE published_at END,
              updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [type || existing.type || 'Response', resolvedName, resolvedSubject, resolvedBodyHtml || null, resolvedFolderId, resolvedExpiry,
       language !== undefined ? languageCode(language) : (existing.language || 'en'),
       wordingChanged ? 1 : 0,
       newStatus, newStatus, newStatus, newStatus, newStatus, req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_template', Number(id), { name: resolvedName, type, reverted_to_draft: wasGoverned, wording_changed: wordingChanged });
    res.json({ message: 'Template updated.', reverted_to_draft: wasGoverned, status: newStatus });
  } catch (err) {
    console.error('PUT /cm/templates/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/templates/:id/revise — draft the next version of a published
// template. The published one stays in letters until the revision is published.
router.post('/templates/:id/revise', authenticate, async (req, res) => {
  try {
    const src = await getScopedTemplate(req, req.params.id);
    if (!src) return res.status(404).json({ error: 'Template not found.' });
    if (src.status !== 'Published') return res.status(400).json({ error: 'Only a published template is revised. Edit a draft directly.' });
    const [[open]] = await pool.execute(
      "SELECT id FROM cm_templates WHERE revision_of = ? AND status NOT IN ('Published','Archived') LIMIT 1", [src.id]);
    if (open) return res.status(409).json({ error: 'This template already has a revision in progress.', id: open.id });
    const [result] = await pool.execute(
      `INSERT INTO cm_templates (type, name, subject, body_html, status, folder_id, expiry_date, language, version_major, version_minor, revision_of, created_by)
       SELECT type, name, subject, body_html, 'Draft', folder_id, expiry_date, language, version_major, version_minor, id, ? FROM cm_templates WHERE id = ?`,
      [req.user.userId, src.id]);
    // Its product groups carry over, so the builder still ranks it for the product.
    await pool.execute(
      `INSERT INTO product_group_assignments (group_id, target_type, target_id, metadata, created_by)
       SELECT group_id, target_type, ?, metadata, ? FROM product_group_assignments WHERE target_type = 'cm_template' AND target_id = ?`,
      [result.insertId, req.user.userId, src.id]).catch(() => {});
    const version = `${src.version_major || 1}.${src.version_minor || 0}`;
    await pool.execute(
      `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id) VALUES ('template', ?, ?, 'Draft', ?, ?)`,
      [result.insertId, version, `Revision of published version ${version} started.`, req.user.userId]).catch(() => {});
    await audit(req.user.userId, req.user.email, 'REVISE', 'cm_template', result.insertId, { revision_of: src.id, from_version: version });
    res.status(201).json({ message: 'Revision started. The published version stays in use until this one is published.', id: result.insertId });
  } catch (err) {
    console.error('POST /cm/templates/:id/revise error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// Lifecycle transitions — Draft → Approved → Published → Archived (+ revert).
// Replaces the old Active/Inactive toggle. Only a Published, non-expired
// template is offered in the MI response builder.
router.post('/templates/:id/approve', authenticate, (req, res) => transitionTemplate(req, res, 'approve'));
router.post('/templates/:id/publish', authenticate, (req, res) => transitionTemplate(req, res, 'publish'));
router.post('/templates/:id/archive', authenticate, (req, res) => transitionTemplate(req, res, 'archive'));
router.post('/templates/:id/revert',  authenticate, (req, res) => transitionTemplate(req, res, 'revert'));

// GET /api/cm/templates/:id/versions — version history for a template
router.get('/templates/:id/versions', authenticate, async (req, res) => {
  try {
    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    if (await publishedOnly(req)) return res.status(404).json({ error: 'Template not found.' });
    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON u.id = vh.author_id
       WHERE vh.entity_type = 'template' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/merge-fields — the fields a template can use, for the editors.
router.get('/merge-fields', authenticate, (req, res) => {
  res.json({ fields: MERGE_FIELDS });
});

// POST /api/cm/templates/:id/render — preview a template with a case's data.
router.post('/templates/:id/render', authenticate, async (req, res) => {
  try {
    const { case_id } = req.body;
    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    let scopedCase = null;
    if (case_id) {
      scopedCase = await getScopedCase(req, case_id);
      if (!scopedCase) return res.status(404).json({ error: 'Case not found.' });
    }
    // A preview is not a send: the evidence gate applies when a letter is made.
    const mergeData = await buildMergeData({ caseId: scopedCase?.id || null, userId: req.user.userId });
    res.json({
      rendered_subject: applyText(template.subject, mergeData),
      rendered_body:    applyHtml(template.body_html, mergeData),
      merge_data:       mergeData,
      template_id:      template.id,
      template_name:    template.name,
    });
  } catch (err) {
    console.error('POST /cm/templates/:id/render error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/templates/:id/generate — make a letter for a case from a
// published template and file it on the case (its Letters attachments). This
// replaces Merge Reports, which made letters from unapproved wording, kept the
// output on the report itself and never put it on the case.
router.post('/templates/:id/generate', authenticate, async (req, res) => {
  try {
    const caseNumber = String(req.body?.case_number || '').trim();
    if (!caseNumber) return res.status(400).json({ error: 'Enter the case number the letter is for.' });
    const [cases] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id, org_id, case_number FROM cases WHERE case_number = ? AND is_deleted = 0 LIMIT 2'
        : 'SELECT id, org_id, case_number FROM cases WHERE case_number = ? AND org_id = ? AND is_deleted = 0 LIMIT 2',
      hasPlatformAdminScope(req) ? [caseNumber] : [caseNumber, req.user.orgId]);
    if (cases.length !== 1) return res.status(404).json({ error: `No case ${caseNumber} in this organisation.` });
    const theCase = cases[0];

    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    const expired = template.expiry_date && new Date(template.expiry_date) < new Date(new Date().toISOString().slice(0, 10));
    if (template.status !== 'Published' || expired) {
      return res.status(409).json({ error: 'A letter is made only from a published, in-date template.' });
    }
    const evidenceGate = await enforceEvidenceGate({
      orgId: theCase.org_id, contentType: 'template', contentId: Number(template.id), mode: 'response',
      actorUserId: req.user.userId, metadata: { route: '/api/cm/templates/:id/generate', case_id: theCase.id },
    });
    if (!evidenceGate.allow) {
      return res.status(422).json({ error: `This template cannot be used yet: ${(evidenceGate.result?.blockers || []).join(' ')}` });
    }

    const mergeData = await buildMergeData({ caseId: theCase.id, userId: req.user.userId });
    const subject = applyText(template.subject || template.name, mergeData);
    const body = applyHtml(template.body_html, mergeData);
    // The letter is a PDF (Helvetica, wrapped, paged), so it can be printed,
    // posted or attached as it stands.
    const { makeLetterPdf } = require('../../services/pdfExportService');
    const { buffer: buf, pages } = makeLetterPdf({
      title: subject, html: body, footer: [mergeData.org_name, theCase.case_number].filter(Boolean).join(' · '),
    });
    const storage = require('../../services/fileStorageService');
    const crypto = require('crypto');
    const key = storage.generateKey('.pdf');
    await storage.put({ orgId: theCase.org_id, key, body: buf, contentType: 'application/pdf' });
    const fileName = `${template.name} - ${theCase.case_number} - ${new Date().toISOString().slice(0, 10)}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
    const [ins] = await pool.execute(
      `INSERT INTO attachments (org_id, entity_type, entity_id, field_name, storage_provider, storage_key, original_name, mime_type, size_bytes, checksum_sha256, uploaded_by, ocr_status)
       VALUES (?, 'case', ?, 'Letters', ?, ?, ?, 'application/pdf', ?, ?, ?, 'skipped')`,
      [theCase.org_id, theCase.id, storage.PROVIDER || 'local', key, fileName, buf.length,
       crypto.createHash('sha256').update(buf).digest('hex'), req.user.userId]);
    await audit(req.user.userId, req.user.email, 'GENERATE_LETTER', 'cm_template', Number(template.id), {
      case_id: theCase.id, case_number: theCase.case_number, attachment_id: ins.insertId,
      template_version: `${template.version_major || 1}.${template.version_minor || 0}`,
    });
    res.status(201).json({
      message: `Letter filed on case ${theCase.case_number}.`,
      attachment_id: ins.insertId, file_name: fileName, case_id: theCase.id, case_number: theCase.case_number,
      pages, rendered_subject: subject, rendered_body: body,
    });
  } catch (err) {
    console.error('POST /cm/templates/:id/generate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
