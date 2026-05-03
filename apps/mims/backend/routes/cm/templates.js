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

function templateScopePredicate(req, alias = 't') {
  if (isSuperadmin(req)) return '1=1';
  return `EXISTS (
    SELECT 1
    FROM users tu
    LEFT JOIN user_org_access tua
      ON tua.user_id = tu.id
     AND tua.org_id = ?
     AND tua.is_active = 1
    WHERE tu.id = ${alias}.created_by
      AND (tu.org_id = ? OR tua.user_id IS NOT NULL)
  )`;
}

function templateScopeParams(req) {
  return isSuperadmin(req) ? [] : [req.user.orgId, req.user.orgId];
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
    isSuperadmin(req)
      ? `SELECT c.id, c.case_number, c.case_type, c.org_id, o.name AS org_name
         FROM cases c
         LEFT JOIN organisations o ON o.id = c.org_id
         WHERE c.id = ?`
      : `SELECT c.id, c.case_number, c.case_type, c.org_id, o.name AS org_name
         FROM cases c
         LEFT JOIN organisations o ON o.id = c.org_id
         WHERE c.id = ? AND c.org_id = ?`,
    isSuperadmin(req) ? [caseId] : [caseId, req.user.orgId]
  );
  return rows[0] || null;
}

// GET /api/cm/templates — list with filters
router.get('/templates', authenticate, async (req, res) => {
  try {
    const { type, status, search, product_group_id, page = 1, limit = 50 } = req.query;
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

    const countQuery = query.replace('SELECT t.*, u.name AS created_by_name', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY t.name LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [templates] = await pool.execute(query, params);
    res.json({ templates, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/templates — create template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { type, name, subject, body_html, status } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });

    const [result] = await pool.execute(
      'INSERT INTO cm_templates (type, name, subject, body_html, status, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [type || 'Response', name.trim(), subject || null, body_html || null, status || 'Active', req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_template', result.insertId, { name, type: type || 'Response' });
    const created = await getScopedTemplate(req, result.insertId);
    res.status(201).json({ message: 'Template created.', id: result.insertId, template: created });
  } catch (err) {
    console.error('POST /cm/templates error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/templates/:id — get template
router.get('/templates/:id', authenticate, async (req, res) => {
  try {
    const template = await getScopedTemplate(req, req.params.id);
    if (!template) return res.status(404).json({ error: 'Template not found.' });
    res.json({ template });
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

    const { type, name, subject, body_html, status } = req.body;
    await pool.execute(
      'UPDATE cm_templates SET type = ?, name = ?, subject = ?, body_html = ?, status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [type || 'Response', name, subject || null, body_html || null, status || 'Active', req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_template', Number(id), { name, type });
    res.json({ message: 'Template updated.' });
  } catch (err) {
    console.error('PUT /cm/templates/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/cm/templates/:id/status — toggle Active/Inactive
router.patch('/templates/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScopedTemplate(req, id);
    if (!existing) return res.status(404).json({ error: 'Template not found.' });

    const newStatus = existing.status === 'Active' ? 'Inactive' : 'Active';
    if (newStatus === 'Active' && req.user.orgId) {
      const evidenceGate = await enforceEvidenceGate({
        orgId: req.user.orgId,
        contentType: 'template',
        contentId: Number(id),
        mode: 'response',
        actorUserId: req.user.userId,
        metadata: { route: '/api/cm/templates/:id/status', action: 'activate' },
      });
      if (!evidenceGate.allow) {
        return res.status(422).json({
          error: 'Evidence Chain Compiler blocked template activation.',
          run_id: evidenceGate.run_id,
          evidence: evidenceGate.result,
        });
      }
    }

    await pool.execute(
      'UPDATE cm_templates SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'STATUS_CHANGE', 'cm_template', Number(id), { name: existing.name, status: newStatus });
    res.json({ message: `Template ${newStatus === 'Active' ? 'activated' : 'deactivated'}.`, status: newStatus });
  } catch (err) {
    console.error('PATCH /cm/templates/:id/status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

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
