'use strict';

/**
 * cm/templates.js — Content Management Templates API
 * Email/response/acknowledgment templates (no lifecycle, just Active/Inactive).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { enforceEvidenceGate } = require('../../services/contentIntelligenceService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
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
  revert:  { from: ['Approved', 'Published', 'Archived'], to: 'Draft' },
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
          error: 'Evidence Chain Compiler blocked template publish.',
          run_id: evidenceGate.run_id,
          evidence: evidenceGate.result,
        });
      }
    }

    const sets = ['status = ?', 'updated_by = ?', 'updated_at = NOW()'];
    const params = [cfg.to, req.user.userId];
    if (action === 'approve') { sets.push('approved_by = ?', 'approved_at = NOW()'); params.push(req.user.userId); }
    if (action === 'publish') { sets.push('published_by = ?', 'published_at = NOW()'); params.push(req.user.userId); }
    if (action === 'revert')  { sets.push('approved_by = NULL', 'approved_at = NULL', 'published_by = NULL', 'published_at = NULL'); }
    params.push(req.params.id);

    await pool.execute(`UPDATE cm_templates SET ${sets.join(', ')} WHERE id = ?`, params);
    await audit(req.user.userId, req.user.email, `TEMPLATE_${action.toUpperCase()}`, 'cm_template', Number(req.params.id), { name: tmpl.name, from: tmpl.status, to: cfg.to });
    try {
      await pool.execute(
        `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
         VALUES ('template', ?, ?, ?, ?, ?)`,
        [req.params.id, `${tmpl.version_major || 1}.${tmpl.version_minor || 0}`, cfg.to, `${action} → ${cfg.to}`, req.user.userId]
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
      SELECT t.*, u.name AS created_by_name
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

    const countQuery = query.replace('SELECT t.*, u.name AS created_by_name', 'SELECT COUNT(*) AS total');
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
    const { type, name, subject, body_html, body, folder_id, expiry_date } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const resolvedBodyHtml = body_html !== undefined ? body_html : (body !== undefined ? body : null);

    // New templates always start as Draft — they must pass through approve →
    // publish before they can be used in a response. Status is never client-set.
    const [result] = await pool.execute(
      'INSERT INTO cm_templates (type, name, subject, body_html, status, folder_id, expiry_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [type || 'Response', name.trim(), subject || null, resolvedBodyHtml || null, 'Draft', folder_id || null, expiry_date || null, req.user.userId]
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

    const { type, name, subject, body_html, body, folder_id, expiry_date } = req.body;
    const resolvedBodyHtml = body_html !== undefined ? body_html : (body !== undefined ? body : existing.body_html);
    const resolvedFolderId = folder_id !== undefined ? (folder_id || null) : existing.folder_id;
    const resolvedExpiry = expiry_date !== undefined ? (expiry_date || null) : existing.expiry_date;

    // Editing reviewed content invalidates its approval: an Approved/Published
    // template is sent back to Draft so the new wording must be re-approved
    // before it can reach a doctor again.
    const wasGoverned = existing.status === 'Approved' || existing.status === 'Published';
    const newStatus = wasGoverned ? 'Draft' : existing.status;

    await pool.execute(
      `UPDATE cm_templates
          SET type = ?, name = ?, subject = ?, body_html = ?, folder_id = ?, expiry_date = ?,
              status = ?,
              approved_by  = CASE WHEN ? = 'Draft' THEN NULL ELSE approved_by  END,
              approved_at  = CASE WHEN ? = 'Draft' THEN NULL ELSE approved_at  END,
              published_by = CASE WHEN ? = 'Draft' THEN NULL ELSE published_by END,
              published_at = CASE WHEN ? = 'Draft' THEN NULL ELSE published_at END,
              updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [type || 'Response', name, subject || null, resolvedBodyHtml || null, resolvedFolderId, resolvedExpiry,
       newStatus, newStatus, newStatus, newStatus, newStatus, req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_template', Number(id), { name, type, reverted_to_draft: wasGoverned });
    res.json({ message: 'Template updated.', reverted_to_draft: wasGoverned, status: newStatus });
  } catch (err) {
    console.error('PUT /cm/templates/:id error:', err);
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

// POST /api/cm/templates/:id/checkin — snapshot current body as a new version
router.post('/templates/:id/checkin', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const tmpl = await getScopedTemplate(req, req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Template not found.' });

    const newMinor = (tmpl.version_minor || 0) + 1;
    const versionStr = `${tmpl.version_major || 1}.${newMinor}`;

    await pool.execute(
      'UPDATE cm_templates SET version_minor = ?, version_notes = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [newMinor, notes || null, req.user.userId, req.params.id]
    );
    await pool.execute(
      `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
       VALUES ('template', ?, ?, 'Active', ?, ?)`,
      [req.params.id, versionStr, notes || 'Version saved', req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CHECKIN', 'cm_template', Number(req.params.id), { version: versionStr });
    res.json({ message: `Template saved as version ${versionStr}.`, version: versionStr });
  } catch (err) {
    console.error('POST /cm/templates/:id/checkin error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/templates/:id/versions — version history for a template
router.get('/templates/:id/versions', authenticate, async (req, res) => {
  try {
    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
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

// POST /api/cm/templates/:id/render — render template with live case data (merge fields)
// Supported merge fields: {{case_number}}, {{case_type}}, {{patient_name}}, {{patient_email}},
//   {{product_name}}, {{agent_name}}, {{org_name}}, {{date}}
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
    const evidenceOrgId = Number(req.user.orgId || scopedCase?.org_id || 0) || null;
    if (evidenceOrgId) {
      const evidenceGate = await enforceEvidenceGate({
        orgId: evidenceOrgId,
        contentType: 'template',
        contentId: Number(req.params.id),
        mode: 'response',
        actorUserId: req.user.userId,
        metadata: { route: '/api/cm/templates/:id/render', case_id: case_id || null },
      });
      if (!evidenceGate.allow) {
        return res.status(422).json({
          error: 'Evidence Chain Compiler blocked template rendering for response use.',
          run_id: evidenceGate.run_id,
          evidence: evidenceGate.result,
        });
      }
    }

    // Build merge data
    const mergeData = {
      date: new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      agent_name: req.user.name || req.user.email || '',
      case_number: '',
      case_type: '',
      patient_name: '',
      patient_email: '',
      product_name: '',
      org_name: '',
    };

    if (case_id) {
      mergeData.case_number = scopedCase.case_number || '';
      mergeData.case_type   = scopedCase.case_type || '';
      mergeData.org_name    = scopedCase.org_name || '';

      const [[contactRow]] = await pool.execute(
        `SELECT CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) AS full_name, email
         FROM case_contacts WHERE case_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
        [case_id]
      );
      if (contactRow) {
        mergeData.patient_name  = contactRow.full_name?.trim() || '';
        mergeData.patient_email = contactRow.email || '';
      }

      const [[miRow]] = await pool.execute(
        `SELECT product FROM case_mi WHERE case_id = ? ORDER BY id ASC LIMIT 1`,
        [case_id]
      );
      if (miRow?.product) mergeData.product_name = miRow.product;
    }

    // Apply merge fields to subject and body
    function applyMerge(text) {
      if (!text) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_, key) => mergeData[key] !== undefined ? mergeData[key] : `{{${key}}}`);
    }

    res.json({
      rendered_subject: applyMerge(template.subject),
      rendered_body:    applyMerge(template.body_html),
      merge_data:       mergeData,
      template_id:      template.id,
      template_name:    template.name,
    });
  } catch (err) {
    console.error('POST /cm/templates/:id/render error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
