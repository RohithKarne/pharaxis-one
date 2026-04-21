'use strict';

/**
 * cases.js — Case Management Core API
 * F-13: New case creation + case number generation (Bhavya)
 * F-15: Case information update + auto-save (Vivek)
 *
 * RAJEEV REVIEW POINT: assign-number endpoint uses DB transaction + FOR UPDATE
 * row-lock on case_number_config to guarantee sequence uniqueness under concurrency.
 */

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const pool    = require('../database/db');
const { authenticate, requireRole, requireOrg } = require('../middleware/auth');
const { checkTransitionAllowed } = require('../services/workflowEngine');
const { logger } = require('../services/logger');
const { createNotification } = require('../services/notificationCenterService');
const {
  calculateAeDueDate,
  calculatePcDueDate,
  computeTransmissionSlaStatus,
  findDuplicateCandidates,
  getCaseDuplicateCandidates,
} = require('../services/caseGovernanceService');

const CASE_SORT_MAP = Object.freeze({
  created_at: 'c.created_at',
  updated_at: 'c.updated_at',
  case_number: 'c.case_number',
  date_received: 'c.date_received',
  communication_count: 'communication_count',
  last_comm_at: 'comm.last_comm_at',
});

function toDateOnlyOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIntSafe(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function buildGlobalCaseSearchClause(search, tableAlias = 'c') {
  const q = String(search || '').trim();
  if (!q) return { clause: '', params: [] };
  const like = `%${q}%`;
  const params = Array(23).fill(like);
  return {
    clause: `
      AND (
        ${tableAlias}.case_number LIKE ?
        OR ${tableAlias}.description LIKE ?
        OR ${tableAlias}.internal_notes LIKE ?
        OR EXISTS (
          SELECT 1
          FROM case_contacts cc
          LEFT JOIN contacts ct ON ct.id = cc.contact_id
          WHERE cc.case_id = ${tableAlias}.id
            AND (
              cc.first_name LIKE ?
              OR cc.last_name LIKE ?
              OR cc.email LIKE ?
              OR cc.institution LIKE ?
              OR cc.phone LIKE ?
              OR ct.first_name LIKE ?
              OR ct.last_name LIKE ?
              OR ct.email LIKE ?
              OR ct.institution LIKE ?
              OR ct.phone LIKE ?
            )
        )
        OR EXISTS (
          SELECT 1
          FROM case_mi mi
          LEFT JOIN products p ON p.id = mi.product_id
          WHERE mi.case_id = ${tableAlias}.id
            AND (
              p.trade_name LIKE ?
              OR mi.question_summary LIKE ?
              OR mi.detailed_question LIKE ?
            )
        )
        OR EXISTS (
          SELECT 1
          FROM case_ae_versions aev
          JOIN case_ae_product_info aepi ON aepi.version_id = aev.id
          WHERE aev.case_id = ${tableAlias}.id
            AND aepi.product_name LIKE ?
        )
        OR EXISTS (
          SELECT 1
          FROM case_pc_versions pcv
          JOIN case_pc_product_info pcpi ON pcpi.version_id = pcv.id
          WHERE pcv.case_id = ${tableAlias}.id
            AND pcpi.product_name LIKE ?
        )
        OR EXISTS (
          SELECT 1
          FROM case_comments ccm
          WHERE ccm.case_id = ${tableAlias}.id
            AND ccm.comment LIKE ?
        )
        OR EXISTS (
          SELECT 1
          FROM inquiries iq
          WHERE iq.case_id = ${tableAlias}.id
            AND (
              iq.subject LIKE ?
              OR iq.body LIKE ?
              OR iq.sender LIKE ?
              OR iq.recipient LIKE ?
            )
        )
      )
    `,
    params,
  };
}

async function writeCaseAudit(caseId, userId, userName, actionType, fieldName, oldValue, newValue) {
  try {
    await pool.execute(
      `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        caseId,
        userId,
        userName || null,
        actionType,
        fieldName || null,
        oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
        newValue !== undefined && newValue !== null ? String(newValue) : null,
      ]
    );
  } catch (_) {
    // best-effort: audit must never block case operations
  }
}

async function writeAuditLog(userId, userName, action, entity, entityId, details = null) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId || null, userName || null, action, entity, entityId || null, details ? JSON.stringify(details) : null]
    );
  } catch (_) {
    // best-effort only
  }
}

async function pushNotification(userId, { category = 'general', title, message, linkUrl, metadata }) {
  try {
    await createNotification(userId, { category, title, message, linkUrl, metadata });
  } catch (_) {
    // best-effort: notification should not fail main transaction path
  }
}

// ─── ORG ISOLATION HELPER ────────────────────────────────────────────────────

// Verify a case belongs to the requesting user's org. Returns the case row or null.
async function verifyCaseOrg(caseId, req) {
  const [[c]] = await pool.execute(
    'SELECT id, org_id, case_number, case_owner_id, status_id FROM cases WHERE id = ?',
    [caseId]
  );
  if (!c) return null;
  if (req.user.role === 'superadmin') return c;
  if (Number(c.org_id) !== Number(req.user.orgId)) return null;
  return c;
}

function parseStoredJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeAeTransmissionPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'standard' || normalized === 'routine') return 'standard';
  if (normalized === 'expedited' || normalized === '15-day-expedited') return '15-day-expedited';
  if (normalized === 'urgent' || normalized === '7-day-expedited') return '7-day-expedited';
  return normalized;
}

function normalizePcTransmissionPriority(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'standard' || normalized === 'routine') return 'standard';
  if (normalized === 'expedited' || normalized === 'high') return 'high';
  if (normalized === 'urgent') return 'urgent';
  return normalized;
}

async function buildCaseSchemaSnapshot(conn, orgId, caseType) {
  if (!orgId || !caseType) return { schemaVersion: null, snapshot: null };

  const [sections] = await conn.execute(
    `SELECT id, section_name, is_visible, field_overrides, updated_at
     FROM case_form_definition
     WHERE org_id = ? AND case_type = ? AND is_visible = 1
     ORDER BY id`,
    [orgId, caseType]
  );
  const [fields] = await conn.execute(
    `SELECT id, section_name, field_name, field_type, is_required, is_hidden, is_disabled,
            custom_label, help_text, picklist_type, lookup_target, sort_order, max_length, default_value, updated_at
     FROM field_setup
     WHERE (org_id = ? OR org_id IS NULL) AND is_hidden = 0
     ORDER BY section_name, sort_order, id`,
    [orgId]
  );

  const fallbackSections = [...new Set(fields.map((field) => field.section_name))].map((sectionName, index) => ({
    id: index + 1,
    section_name: sectionName,
    is_visible: 1,
    field_overrides: null,
    updated_at: null,
  }));
  const sectionRows = sections.length > 0 ? sections : fallbackSections;

  const snapshotSections = sectionRows.map((section) => ({
    section_name: section.section_name,
    is_visible: Number(section.is_visible || 0),
    field_overrides: parseStoredJson(section.field_overrides, {}),
    fields: fields
      .filter((field) => field.section_name === section.section_name)
      .map((field) => ({
        id: field.id,
        field_name: field.field_name,
        field_type: field.field_type,
        is_required: Number(field.is_required || 0),
        is_hidden: Number(field.is_hidden || 0),
        is_disabled: Number(field.is_disabled || 0),
        custom_label: field.custom_label || null,
        help_text: field.help_text || null,
        picklist_type: field.picklist_type || null,
        lookup_target: field.lookup_target || null,
        sort_order: Number(field.sort_order || 0),
        max_length: field.max_length || null,
        default_value: field.default_value || null,
      })),
  }));

  const latestUpdatedAt = [...sectionRows, ...fields]
    .map((row) => {
      const value = row?.updated_at ? new Date(row.updated_at).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    })
    .reduce((max, current) => Math.max(max, current), 0);

  const latestIso = latestUpdatedAt ? new Date(latestUpdatedAt).toISOString() : 'baseline';
  return {
    schemaVersion: `${caseType}-${latestIso}-${fields.length}`,
    snapshot: {
      case_type: caseType,
      captured_at: new Date().toISOString(),
      sections: snapshotSections,
    },
  };
}

async function getMiResponseRow(caseId, responseId) {
  const [[row]] = await pool.execute(
    `SELECT
       r.id,
       r.case_id,
       r.mi_tab_id,
       r.response_text,
       r.response_channel AS channel,
       r.response_date AS responded_at,
       r.follow_up_required,
       r.response_status,
       r.draft_saved_at,
       r.approved_by,
       approver.name AS approved_by_name,
       r.approved_at,
       r.cm_document_id,
       r.cm_document_name,
       r.author_id,
       r.author_name AS responded_by_name,
       r.created_at
     FROM case_mi_responses r
     LEFT JOIN users approver ON approver.id = r.approved_by
     WHERE r.case_id = ? AND r.id = ?`,
    [caseId, responseId]
  );
  return row || null;
}

async function getAeTransmissionRow(caseId, transmissionId) {
  const [[row]] = await pool.execute(
    `SELECT t.*, u.name AS assignee_name
     FROM case_ae_transmissions t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.case_id = ? AND t.id = ?`,
    [caseId, transmissionId]
  );
  return row || null;
}

async function getPcTransmissionRow(caseId, transmissionId) {
  const [[row]] = await pool.execute(
    `SELECT t.*, t.resolution_notes AS notes, u.name AS assignee_name
     FROM case_pc_transmissions t
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.case_id = ? AND t.id = ?`,
    [caseId, transmissionId]
  );
  return row || null;
}

// ─── SPRINT 17: SAVED CASE VIEWS ────────────────────────────────────────────

router.get('/cases/saved-views', authenticate, async (req, res) => {
  try {
    if (!req.user.orgId) return res.json({ views: [] });
    const [rows] = await pool.execute(
      `SELECT id, org_id, user_id, name, scope, filters_json, is_shared, created_at, updated_at
       FROM case_saved_views
       WHERE org_id = ? AND (user_id = ? OR is_shared = 1)
       ORDER BY is_shared DESC, updated_at DESC, id DESC`,
      [req.user.orgId, req.user.userId]
    );
    return res.json({
      views: rows.map((row) => ({ ...row, filters: parseStoredJson(row.filters_json, {}) })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/cases/saved-views', authenticate, async (req, res) => {
  try {
    if (!req.user.orgId) return res.status(400).json({ error: 'Organisation context required.' });
    const name = String(req.body?.name || '').trim();
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const isShared = !!req.body?.is_shared;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (isShared && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admin roles can create shared views.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO case_saved_views (org_id, user_id, name, scope, filters_json, is_shared)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        req.user.userId,
        name,
        isShared ? 'shared' : 'personal',
        JSON.stringify(filters),
        isShared ? 1 : 0,
      ]
    );

    const [[row]] = await pool.execute(
      `SELECT id, org_id, user_id, name, scope, filters_json, is_shared, created_at, updated_at
       FROM case_saved_views
       WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ view: { ...row, filters: parseStoredJson(row.filters_json, {}) } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/cases/saved-views/:viewId', authenticate, async (req, res) => {
  try {
    const [[existing]] = await pool.execute(
      'SELECT * FROM case_saved_views WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.viewId, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Saved view not found.' });

    const isOwner = Number(existing.user_id) === Number(req.user.userId);
    if (!isOwner && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the owner or an admin can update this view.' });
    }

    const nextShared = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_shared')
      ? !!req.body.is_shared
      : !!existing.is_shared;
    if (nextShared && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only admin roles can publish shared views.' });
    }

    const nextName = String(req.body?.name || existing.name || '').trim();
    const nextFilters = req.body?.filters && typeof req.body.filters === 'object'
      ? req.body.filters
      : parseStoredJson(existing.filters_json, {});

    await pool.execute(
      `UPDATE case_saved_views
       SET name = ?, scope = ?, filters_json = ?, is_shared = ?, updated_at = NOW()
       WHERE id = ? AND org_id = ?`,
      [
        nextName,
        nextShared ? 'shared' : 'personal',
        JSON.stringify(nextFilters),
        nextShared ? 1 : 0,
        req.params.viewId,
        req.user.orgId,
      ]
    );

    const [[row]] = await pool.execute(
      `SELECT id, org_id, user_id, name, scope, filters_json, is_shared, created_at, updated_at
       FROM case_saved_views
       WHERE id = ?`,
      [req.params.viewId]
    );
    return res.json({ view: { ...row, filters: parseStoredJson(row.filters_json, {}) } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/cases/saved-views/:viewId', authenticate, async (req, res) => {
  try {
    const [[existing]] = await pool.execute(
      'SELECT * FROM case_saved_views WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.viewId, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Saved view not found.' });

    const isOwner = Number(existing.user_id) === Number(req.user.userId);
    if (!isOwner && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the owner or an admin can delete this view.' });
    }

    await pool.execute(
      'DELETE FROM case_saved_views WHERE id = ? AND org_id = ?',
      [req.params.viewId, req.user.orgId]
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── LIST CASES ──────────────────────────────────────────────────────────────

// GET /api/cases — list cases with filters
router.get('/cases', authenticate, requireOrg, async (req, res) => {
  try {
    const {
      type, status_id, owner_id, deleted, search,
      has_correspondence, corr_from, corr_to, corr_box, corr_party,
      sort_by, sort_dir, include_meta,
    } = req.query;
    const limit  = clamp(parseIntSafe(req.query.limit, 50), 1, 500);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));

    if (corr_from && !isValidDateOnly(corr_from)) {
      return res.status(400).json({ error: 'corr_from must be YYYY-MM-DD.' });
    }
    if (corr_to && !isValidDateOnly(corr_to)) {
      return res.status(400).json({ error: 'corr_to must be YYYY-MM-DD.' });
    }
    if (corr_box && !['inbox', 'sent'].includes(corr_box)) {
      return res.status(400).json({ error: "corr_box must be 'inbox' or 'sent'." });
    }
    if (has_correspondence && !['yes', 'no', 'true', 'false'].includes(String(has_correspondence))) {
      return res.status(400).json({ error: "has_correspondence must be one of: yes, no, true, false." });
    }
    const sortBy = CASE_SORT_MAP[sort_by] || CASE_SORT_MAP.created_at;
    const sortDir = String(sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let query = `
      SELECT c.*,
        o.name  AS org_name,
        s.name  AS site_name,
        ws.name AS status_name,
        u.name  AS owner_name,
        COALESCE(comm.communication_count, 0) AS communication_count,
        comm.last_comm_at,
        CASE
          WHEN comm.last_comm_source IS NULL THEN NULL
          WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
            OR LOWER(comm.last_comm_source) LIKE '%forward%'
            OR LOWER(comm.last_comm_source) LIKE '%sent%'
            OR LOWER(comm.last_comm_source) LIKE '%transmission%'
          THEN 'sent'
          ELSE 'inbox'
        END AS last_comm_box
      FROM cases c
      LEFT JOIN organisations  o  ON c.org_id        = o.id
      LEFT JOIN sites          s  ON c.site_id        = s.id
      LEFT JOIN workflow_states ws ON c.status_id     = ws.id
      LEFT JOIN users           u  ON c.case_owner_id = u.id
      LEFT JOIN (
        SELECT i.case_id,
          COUNT(*) AS communication_count,
          (
            SELECT i2.received_at
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_at,
          (
            SELECT i2.source_tag
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_source
        FROM inquiries i
        WHERE i.case_id IS NOT NULL
        GROUP BY i.case_id
      ) comm ON comm.case_id = c.id
      WHERE c.is_deleted = ${deleted === 'true' ? 1 : 0}
    `;
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM cases c
      LEFT JOIN (
        SELECT i.case_id,
          COUNT(*) AS communication_count,
          (
            SELECT i2.received_at
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_at,
          (
            SELECT i2.source_tag
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_source
        FROM inquiries i
        WHERE i.case_id IS NOT NULL
        GROUP BY i.case_id
      ) comm ON comm.case_id = c.id
      WHERE c.is_deleted = ${deleted === 'true' ? 1 : 0}
    `;
    const params = [];
    const countParams = [];
    // Org isolation — always scope to req.user.orgId (superadmin has no orgId, sees all)
    if (req.user.orgId) {
      query += ' AND c.org_id = ?'; params.push(req.user.orgId);
      countQuery += ' AND c.org_id = ?'; countParams.push(req.user.orgId);
    }
    if (type)      {
      query += ' AND c.case_type = ?'; params.push(type);
      countQuery += ' AND c.case_type = ?'; countParams.push(type);
    }
    if (status_id) {
      query += ' AND c.status_id = ?'; params.push(status_id);
      countQuery += ' AND c.status_id = ?'; countParams.push(status_id);
    }
    if (owner_id)  {
      query += ' AND c.case_owner_id = ?'; params.push(owner_id);
      countQuery += ' AND c.case_owner_id = ?'; countParams.push(owner_id);
    }
    const globalSearch = buildGlobalCaseSearchClause(search, 'c');
    if (globalSearch.clause) {
      query += globalSearch.clause;
      params.push(...globalSearch.params);
      countQuery += globalSearch.clause;
      countParams.push(...globalSearch.params);
    }
    if (has_correspondence === 'yes' || has_correspondence === 'true') {
      query += ' AND COALESCE(comm.communication_count, 0) > 0';
      countQuery += ' AND COALESCE(comm.communication_count, 0) > 0';
    }
    if (has_correspondence === 'no' || has_correspondence === 'false') {
      query += ' AND COALESCE(comm.communication_count, 0) = 0';
      countQuery += ' AND COALESCE(comm.communication_count, 0) = 0';
    }
    if (corr_from) {
      query += ' AND DATE(comm.last_comm_at) >= ?';
      params.push(corr_from);
      countQuery += ' AND DATE(comm.last_comm_at) >= ?';
      countParams.push(corr_from);
    }
    if (corr_to) {
      query += ' AND DATE(comm.last_comm_at) <= ?';
      params.push(corr_to);
      countQuery += ' AND DATE(comm.last_comm_at) <= ?';
      countParams.push(corr_to);
    }
    if (corr_box === 'inbox' || corr_box === 'sent') {
      query += `
        AND (
          CASE
            WHEN comm.last_comm_source IS NULL THEN NULL
            WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
              OR LOWER(comm.last_comm_source) LIKE '%forward%'
              OR LOWER(comm.last_comm_source) LIKE '%sent%'
              OR LOWER(comm.last_comm_source) LIKE '%transmission%'
            THEN 'sent'
            ELSE 'inbox'
          END
        ) = ?
      `;
      params.push(corr_box);
      countQuery += `
        AND (
          CASE
            WHEN comm.last_comm_source IS NULL THEN NULL
            WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
              OR LOWER(comm.last_comm_source) LIKE '%forward%'
              OR LOWER(comm.last_comm_source) LIKE '%sent%'
              OR LOWER(comm.last_comm_source) LIKE '%transmission%'
            THEN 'sent'
            ELSE 'inbox'
          END
        ) = ?
      `;
      countParams.push(corr_box);
    }
    if (corr_party) {
      query += ' AND EXISTS (SELECT 1 FROM inquiries iq WHERE iq.case_id = c.id AND (iq.sender LIKE ? OR iq.recipient LIKE ?))';
      params.push(`%${corr_party}%`, `%${corr_party}%`);
      countQuery += ' AND EXISTS (SELECT 1 FROM inquiries iq WHERE iq.case_id = c.id AND (iq.sender LIKE ? OR iq.recipient LIKE ?))';
      countParams.push(`%${corr_party}%`, `%${corr_party}%`);
    }
    query += ` ORDER BY ${sortBy} ${sortDir}, c.id DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(query, params);
    if (String(include_meta) === 'true') {
      const [[{ total }]] = await pool.execute(countQuery, countParams);
      return res.json({ rows, total, limit, offset });
    }
    return res.json(rows);
  } catch (err) {
    logger.error({ err, route: '/api/cases', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to list cases');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/my — cases owned by the logged-in user
router.get('/cases/my', authenticate, async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 50), 1, 500);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));
    const globalSearch = buildGlobalCaseSearchClause(req.query.search, 'c');
    const params = [req.user.userId];
    let orgClause = '';
    if (req.user.role !== 'superadmin') {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       LEFT JOIN users u ON c.case_owner_id = u.id
       WHERE c.case_owner_id = ? AND c.is_deleted = 0${orgClause}
       ${globalSearch.clause}
       ORDER BY c.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [...params, ...globalSearch.params]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err, route: '/api/cases/my', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to list my cases');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/unassigned
router.get('/cases/unassigned', authenticate, async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 50), 1, 500);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));
    const globalSearch = buildGlobalCaseSearchClause(req.query.search, 'c');
    const params = [];
    let orgClause = '';
    if (req.user.role !== 'superadmin') {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       LEFT JOIN users u ON c.case_owner_id = u.id
       WHERE c.case_owner_id IS NULL AND c.is_deleted = 0${orgClause}
       ${globalSearch.clause}
       ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [...params, ...globalSearch.params]
    );
    res.json(rows);
  } catch (err) {
    logger.error({ err, route: '/api/cases/unassigned', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to list unassigned cases');
    res.status(500).json({ error: err.message });
  }
});


// GET /api/cases/dashboard-summary — Home dashboard stats/recent/alerts (Sprint 14 G11)
router.get('/cases/dashboard-summary', authenticate, async (req, res) => {
  try {
    const orgClause = req.user.role === 'superadmin' ? '' : ' AND c.org_id = ?';
    const orgParams = req.user.role === 'superadmin' ? [] : [req.user.orgId];

    const [countRows] = await pool.execute(
      'SELECT ' +
      'COALESCE(SUM(CASE WHEN c.is_deleted = 0 THEN 1 ELSE 0 END), 0) AS total_cases, ' +
      'COALESCE(SUM(CASE WHEN c.is_deleted = 0 AND (ws.name IS NULL OR LOWER(ws.name) NOT LIKE \'closed%\') THEN 1 ELSE 0 END), 0) AS open_cases, ' +
      'COALESCE(SUM(CASE WHEN c.is_deleted = 0 AND c.case_owner_id = ? THEN 1 ELSE 0 END), 0) AS my_cases, ' +
      'COALESCE(SUM(CASE WHEN c.is_deleted = 0 AND c.case_owner_id IS NULL THEN 1 ELSE 0 END), 0) AS unassigned_cases, ' +
      'COALESCE(SUM(CASE WHEN c.is_deleted = 0 AND c.priority IN (\'high\',\'urgent\') THEN 1 ELSE 0 END), 0) AS priority_cases ' +
      'FROM cases c ' +
      'LEFT JOIN workflow_states ws ON ws.id = c.status_id ' +
      'WHERE 1=1' + orgClause,
      [req.user.userId, ...orgParams]
    );

    const counts = Array.isArray(countRows) && countRows.length ? countRows[0] : {};

    const [recentCases] = await pool.execute(
      'SELECT c.id, c.case_number, c.case_type, c.priority, c.updated_at, c.created_at, ' +
      'ws.name AS status_name, u.name AS owner_name ' +
      'FROM cases c ' +
      'LEFT JOIN workflow_states ws ON ws.id = c.status_id ' +
      'LEFT JOIN users u ON u.id = c.case_owner_id ' +
      'WHERE c.is_deleted = 0' + orgClause + ' ' +
      'ORDER BY c.updated_at DESC, c.id DESC LIMIT 8',
      [...orgParams]
    );

    const [alerts] = await pool.execute(
      'SELECT id, category, title, message, link_url, is_read, created_at ' +
      'FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 6',
      [req.user.userId]
    );

    return res.json({
      stats: {
        total_cases: Number(counts.total_cases || 0),
        open_cases: Number(counts.open_cases || 0),
        my_cases: Number(counts.my_cases || 0),
        unassigned_cases: Number(counts.unassigned_cases || 0),
        priority_cases: Number(counts.priority_cases || 0),
      },
      recentCases,
      alerts,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, route: '/api/cases/dashboard-summary', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to load dashboard summary');
    return res.status(500).json({ error: err.message || 'Failed to load dashboard summary.' });
  }
});

// GET /api/cases/form-config — section/field config for case form
router.get('/cases/form-config', authenticate, async (req, res) => {
  try {
    const { case_type } = req.query;
    if (!case_type || !['MI', 'AE', 'PC'].includes(case_type)) {
      return res.status(400).json({ error: 'case_type is required and must be MI, AE, or PC' });
    }

    const orgId = req.user.role === 'superadmin' ? (parseInt(req.query.org_id, 10) || 1) : req.user.orgId;
    if (orgId == null || Number(orgId) === 0) {
      return res.status(400).json({ error: 'org_id required' });
    }

    const [sections] = await pool.execute(
      `SELECT section_name, is_visible, field_overrides
       FROM case_form_definition
       WHERE org_id = ? AND case_type = ? AND is_visible = 1
       ORDER BY id`,
      [orgId, case_type]
    );

    const [fields] = await pool.execute(
      `SELECT id, section_name, field_name, field_type, is_required, is_hidden, is_disabled, custom_label, help_text, picklist_type, lookup_target, sort_order, max_length, default_value
       FROM field_setup
       WHERE (org_id = ? OR org_id IS NULL) AND is_hidden = 0
       ORDER BY section_name, sort_order, id`,
      [orgId]
    );

    const [picklists] = await pool.execute(
      `SELECT pf.name AS field_type, p.value, p.name AS label
       FROM picklists p
       JOIN picklist_fields pf ON p.field_id = pf.id
       WHERE p.org_id = ? AND p.status = 'Active'
       ORDER BY pf.name, p.id`,
      [orgId]
    );

    const picklistMap = picklists.reduce((acc, row) => {
      if (!acc[row.field_type]) acc[row.field_type] = [];
      acc[row.field_type].push({ value: row.value, label: row.label });
      return acc;
    }, {});

    const sectionsWithFields = sections.map((section) => {
      const sectionFields = fields
        .filter((field) => field.section_name === section.section_name)
        .map((field) => {
          if (field.field_type === 'dropdown' || field.field_type === 'multiselect') {
            return { ...field, options: picklistMap[field.picklist_type] || [] };
          }
          return field;
        });

      return {
        section_name: section.section_name,
        is_visible: section.is_visible,
        field_overrides: section.field_overrides,
        fields: sectionFields,
      };
    });

    return res.json({ case_type, sections: sectionsWithFields });
  } catch (err) {
    logger.error({ err, route: '/api/cases/form-config', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to load case form config');
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id/comments — list case comments newest-first
router.get('/cases/:id/comments', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const [rows] = await pool.execute(
      `SELECT cc.id, cc.case_id, cc.user_id, cc.comment, cc.created_at, u.name AS user_name, u.email AS user_email
       FROM case_comments cc
       LEFT JOIN users u ON u.id = cc.user_id
       WHERE cc.case_id = ?
       ORDER BY cc.created_at DESC, cc.id DESC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id/comments', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to fetch case comments');
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/comments — create case comment
router.post('/cases/:id/comments', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const text = String(req.body?.comment || '').trim();
    if (!text) return res.status(400).json({ error: 'comment is required.' });
    if (text.length > 4000) return res.status(400).json({ error: 'comment must be <= 4000 chars.' });

    const [result] = await pool.execute(
      `INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, ?, ?)`,
      [req.params.id, req.user.userId, text]
    );
    const [[saved]] = await pool.execute(
      `SELECT cc.id, cc.case_id, cc.user_id, cc.comment, cc.created_at, u.name AS user_name, u.email AS user_email
       FROM case_comments cc
       LEFT JOIN users u ON u.id = cc.user_id
       WHERE cc.id = ?`,
      [result.insertId]
    );

    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'COMMENT_ADDED', 'comment', null, text);

    if (owned.case_owner_id && Number(owned.case_owner_id) !== Number(req.user.userId)) {
      const caseRef = owned.case_number || `Case ${req.params.id}`;
      await pushNotification(owned.case_owner_id, {
        category: 'case_comment',
        title: `New comment on ${caseRef}`,
        message: `${req.user.email} added a note.`,
        linkUrl: `/cases/${req.params.id}`,
        metadata: { case_id: Number(req.params.id) },
      });
    }
    return res.status(201).json(saved);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id/comments', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to create case comment');
    return res.status(500).json({ error: err.message });
  }
});

// ─── SPRINT 17: DEDUP ASSIST ────────────────────────────────────────────────

router.post('/cases/duplicate-check', authenticate, requireOrg, async (req, res) => {
  try {
    const caseType = String(req.body?.case_type || '').toUpperCase();
    if (!['MI', 'AE', 'PC'].includes(caseType)) {
      return res.status(400).json({ error: 'case_type must be MI, AE, or PC.' });
    }

    const candidates = await findDuplicateCandidates({
      orgId: req.user.orgId,
      caseType,
      reporter: req.body?.reporter || {},
      patient: req.body?.patient || {},
      ae_intake: req.body?.ae_intake || {},
      pc_intake: req.body?.pc_intake || {},
      excludeCaseId: req.body?.exclude_case_id || null,
    });

    return res.json({ candidates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/cases/:id/duplicates', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const candidates = await getCaseDuplicateCandidates(req.params.id);
    return res.json({ candidates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id — single case detail
router.get('/cases/:id', authenticate, async (req, res) => {
  try {
    const [[c]] = await pool.execute(
      `SELECT c.*,
        o.name  AS org_name,
        s.name  AS site_name,
        ws.name AS status_name,
        u.name  AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id        = o.id
       LEFT JOIN sites           s  ON c.site_id        = s.id
       LEFT JOIN workflow_states ws ON c.status_id      = ws.id
       LEFT JOIN users           u  ON c.case_owner_id  = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (req.user.role !== 'superadmin' && Number(c.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(c);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to fetch case details');
    res.status(500).json({ error: err.message });
  }
});

router.get('/cases/:id/schema-snapshot', authenticate, async (req, res) => {
  try {
    const currentCase = await verifyCaseOrg(req.params.id, req);
    if (!currentCase) return res.status(403).json({ error: 'Access denied' });

    const [[row]] = await pool.execute(
      `SELECT field_schema_version, field_schema_snapshot
       FROM cases
       WHERE id = ?`,
      [req.params.id]
    );
    return res.json({
      schema_version: row?.field_schema_version || null,
      snapshot: parseStoredJson(row?.field_schema_snapshot, null),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── CREATE CASE (F-13) ───────────────────────────────────────────────────────

// POST /api/cases — create new case with intake fields captured at creation time (CF-E1–E5)
router.post('/cases', authenticate, requireOrg, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      site_id, case_type, intake_channel = 'manual', date_received, case_number,
      // CF-E3: Reporter
      reporter,
      // CF-E3: Patient (AE/PC)
      patient,
      // CF-E4: AE intake
      ae_intake,
      // CF-E5: PC intake
      pc_intake,
      // CF-E1: Dynamic fields [{field_id, field_value}]
      dynamic_fields,
    } = req.body;

    const org_id = req.user.orgId;
    if (!org_id || !site_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'org_id and site_id are required' });
    }
    if (case_type && !['MI', 'AE', 'PC'].includes(case_type)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'case_type must be MI, AE, or PC' });
    }
    const dateReceived = toDateOnlyOrNull(date_received);

    // 1. Insert core case
    let result;
    try {
      [result] = await conn.execute(
        `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, case_number, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [org_id, site_id, case_type ?? null, intake_channel, dateReceived, case_number ?? null, req.user.userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' && String(err.message || '').includes('case_number')) {
        [result] = await conn.execute(
          `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, case_number, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [org_id, site_id, case_type ?? null, intake_channel, dateReceived, `${case_number}-${Date.now()}`, req.user.userId]
        );
      } else { throw err; }
    }
    const caseId = result.insertId;

    // 2. Reporter (CF-E3)
    if (reporter && typeof reporter === 'object') {
      await conn.execute(
        `INSERT INTO case_reporter (case_id, first_name, last_name, email, phone, reporter_type, country, organisation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name),
           email=VALUES(email), phone=VALUES(phone), reporter_type=VALUES(reporter_type),
           country=VALUES(country), organisation=VALUES(organisation)`,
        [caseId, reporter.first_name || null, reporter.last_name || null, reporter.email || null,
         reporter.phone || null, reporter.reporter_type || 'HCP', reporter.country || null, reporter.organisation || null]
      );
    }

    // 3. Patient — AE/PC only (CF-E3)
    if (patient && typeof patient === 'object' && ['AE', 'PC'].includes(case_type)) {
      await conn.execute(
        `INSERT INTO case_patient (case_id, initials, age, age_unit, gender, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE initials=VALUES(initials), age=VALUES(age), age_unit=VALUES(age_unit),
           gender=VALUES(gender), weight_kg=VALUES(weight_kg)`,
        [caseId, patient.initials || null, patient.age ? Number(patient.age) : null,
         patient.age_unit || 'years', patient.gender || null, patient.weight_kg ? Number(patient.weight_kg) : null]
      );
    }

    // 4. AE intake — seriousness + suspect product (CF-E4)
    if (ae_intake && typeof ae_intake === 'object' && case_type === 'AE') {
      await conn.execute(
        `INSERT INTO case_ae_intake
           (case_id, suspect_drug_name, batch_lot_number, dose, route_of_admin,
            treatment_start_date, treatment_stop_date, reaction_description, reaction_onset_date, outcome,
            is_serious, is_death, is_life_threatening, is_hospitalization, is_prolonged_hospitalization,
            is_disability, is_congenital_anomaly, is_other_medically_important)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE suspect_drug_name=VALUES(suspect_drug_name), batch_lot_number=VALUES(batch_lot_number),
           dose=VALUES(dose), route_of_admin=VALUES(route_of_admin), treatment_start_date=VALUES(treatment_start_date),
           treatment_stop_date=VALUES(treatment_stop_date), reaction_description=VALUES(reaction_description),
           reaction_onset_date=VALUES(reaction_onset_date), outcome=VALUES(outcome),
           is_serious=VALUES(is_serious), is_death=VALUES(is_death), is_life_threatening=VALUES(is_life_threatening),
           is_hospitalization=VALUES(is_hospitalization), is_prolonged_hospitalization=VALUES(is_prolonged_hospitalization),
           is_disability=VALUES(is_disability), is_congenital_anomaly=VALUES(is_congenital_anomaly),
           is_other_medically_important=VALUES(is_other_medically_important)`,
        [caseId, ae_intake.suspect_drug_name || null, ae_intake.batch_lot_number || null,
         ae_intake.dose || null, ae_intake.route_of_admin || null,
         toDateOnlyOrNull(ae_intake.treatment_start_date), toDateOnlyOrNull(ae_intake.treatment_stop_date),
         ae_intake.reaction_description || null, toDateOnlyOrNull(ae_intake.reaction_onset_date),
         ae_intake.outcome || null,
         ae_intake.is_serious ? 1 : 0, ae_intake.is_death ? 1 : 0, ae_intake.is_life_threatening ? 1 : 0,
         ae_intake.is_hospitalization ? 1 : 0, ae_intake.is_prolonged_hospitalization ? 1 : 0,
         ae_intake.is_disability ? 1 : 0, ae_intake.is_congenital_anomaly ? 1 : 0,
         ae_intake.is_other_medically_important ? 1 : 0]
      );
    }

    // 5. PC intake — complaint fields (CF-E5)
    if (pc_intake && typeof pc_intake === 'object' && case_type === 'PC') {
      await conn.execute(
        `INSERT INTO case_pc_intake
           (case_id, product_name, batch_lot_number, expiry_date, purchase_date,
            complaint_category, complaint_description, sample_available, sample_return_requested)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE product_name=VALUES(product_name), batch_lot_number=VALUES(batch_lot_number),
           expiry_date=VALUES(expiry_date), purchase_date=VALUES(purchase_date),
           complaint_category=VALUES(complaint_category), complaint_description=VALUES(complaint_description),
           sample_available=VALUES(sample_available), sample_return_requested=VALUES(sample_return_requested)`,
        [caseId, pc_intake.product_name || null, pc_intake.batch_lot_number || null,
         toDateOnlyOrNull(pc_intake.expiry_date), toDateOnlyOrNull(pc_intake.purchase_date),
         pc_intake.complaint_category || null, pc_intake.complaint_description || null,
         pc_intake.sample_available ? 1 : 0, pc_intake.sample_return_requested ? 1 : 0]
      );
    }

    // 6. Dynamic fields bulk upsert (CF-E1)
    if (Array.isArray(dynamic_fields) && dynamic_fields.length > 0) {
      for (const df of dynamic_fields) {
        const fieldId = Number(df.field_id || df.field_definition_id || 0);
        if (!fieldId) continue;
        await conn.execute(
          `INSERT INTO case_dynamic_field_values (case_id, field_id, field_value)
           VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE field_value=VALUES(field_value)`,
          [caseId, fieldId, Object.prototype.hasOwnProperty.call(df, 'field_value') ? df.field_value : (df.value ?? null)]
        );
      }
    }

    const { schemaVersion, snapshot } = await buildCaseSchemaSnapshot(conn, org_id, case_type);
    if (schemaVersion && snapshot) {
      await conn.execute(
        `UPDATE cases
         SET field_schema_version = ?, field_schema_snapshot = ?
         WHERE id = ?`,
        [schemaVersion, JSON.stringify(snapshot), caseId]
      );
    }

    await conn.commit();
    const [[newCase]] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name
       FROM cases c
       LEFT JOIN organisations o ON c.org_id  = o.id
       LEFT JOIN sites         s ON c.site_id = s.id
       WHERE c.id = ?`,
      [caseId]
    );
    const duplicateCandidates = await findDuplicateCandidates({
      orgId: org_id,
      caseType: case_type,
      reporter: reporter || {},
      patient: patient || {},
      ae_intake: ae_intake || {},
      pc_intake: pc_intake || {},
      excludeCaseId: caseId,
    });
    if (duplicateCandidates.length > 0) {
      await createNotification(req.user.userId, {
        category: 'dedup_assist',
        severity: 'warning',
        title: `Possible duplicate detected for ${newCase.case_number || `Case ${caseId}`}`,
        message: `${duplicateCandidates.length} similar case${duplicateCandidates.length === 1 ? '' : 's'} found in your organisation.`,
        linkUrl: `/cases/${caseId}`,
        metadata: { case_id: caseId, duplicate_ids: duplicateCandidates.map((item) => item.id) },
        eventKey: 'case-duplicate-detected',
      }).catch(() => {});
    }
    logger.info({ case_id: caseId, org_id, user_id: req.user?.userId, case_type }, 'Case created with intake data');
    res.status(201).json({ ...newCase, duplicate_candidates: duplicateCandidates });
  } catch (err) {
    await conn.rollback();
    logger.error({ err, route: '/api/cases', user_id: req.user?.userId }, 'Failed to create case');
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/cases/:id/assign-number — generate + lock case number on first Save
// RAJEEV REVIEW: FOR UPDATE row-lock guarantees no two concurrent saves get the same sequence
router.post('/cases/:id/assign-number', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get the case and lock the config row simultaneously
    const [[c]] = await conn.execute(
      'SELECT * FROM cases WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ error: 'Case not found' });
    }
    // Org isolation check
    if (req.user.role !== 'superadmin' && Number(c.org_id) !== Number(req.user.orgId)) {
      await conn.rollback();
      return res.status(403).json({ error: 'Access denied' });
    }
    // Already numbered — return idempotently
    if (c.case_number) {
      await conn.rollback();
      return res.json({ case_number: c.case_number });
    }

    // Lock the number config row for this org + case_type (or ALL fallback)
    let [[cfg]] = await conn.execute(
      'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
      [c.org_id, c.case_type]
    );
    if (!cfg) {
      [[cfg]] = await conn.execute(
        'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
        [c.org_id, 'ALL']
      );
    }

    // If no config exists at all, create a default per-case-type config row.
    // This prevents repeated "MI-00001" when config is absent.
    if (!cfg) {
      await conn.execute(
        `INSERT INTO case_number_config (org_id, case_type, prefix, \`separator\`, include_year, include_month, seq_length, current_seq)
         VALUES (?, ?, ?, '-', 0, 0, 5, 0)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [c.org_id, c.case_type, c.case_type]
      );
      [[cfg]] = await conn.execute(
        'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
        [c.org_id, c.case_type]
      );
    }

    // Generate next unique number for this org (guards against manual counter resets).
    let seq      = (cfg.current_seq || 0) + 1;
    const sepChar  = cfg.separator || '-';
    const seqLen   = cfg.seq_length || 5;
    const prefix   = cfg.prefix || c.case_type;
    let caseNumber = null;
    for (let attempts = 0; attempts < 10000; attempts += 1) {
      const padded = String(seq).padStart(seqLen, '0');
      const parts = [prefix];
      if (cfg.include_year)  parts.push(new Date().getFullYear());
      if (cfg.include_month) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
      parts.push(padded);
      const candidate = parts.join(sepChar);

      const [[dup]] = await conn.execute(
        'SELECT id FROM cases WHERE org_id = ? AND case_number = ? LIMIT 1 FOR UPDATE',
        [c.org_id, candidate]
      );
      if (!dup) {
        caseNumber = candidate;
        break;
      }
      seq += 1;
    }
    if (!caseNumber) {
      throw new Error('Unable to generate unique case number.');
    }

    // Atomically update sequence counter + assign number
    await conn.execute(
      'UPDATE case_number_config SET current_seq = ? WHERE id = ?',
      [seq, cfg.id]
    );
    await conn.execute(
      'UPDATE cases SET case_number = ? WHERE id = ?',
      [caseNumber, req.params.id]
    );

    await conn.commit();
    logger.info({ case_id: req.params?.id, user_id: req.user?.userId, org_id: c.org_id }, 'Case number assigned');
    res.json({ case_number: caseNumber });
  } catch (err) {
    await conn.rollback();
    logger.error({ err, route: '/api/cases/:id/assign-number', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to assign case number');
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Case number conflict detected. Please retry assign number.' });
    }
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// POST /api/cases/:id/reassign — dedicated reassignment flow with audit + notifications
router.post('/cases/:id/reassign', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const reason = String(req.body?.reason || '').trim();
    if (reason.length > 1000) return res.status(400).json({ error: 'reason must be <= 1000 chars.' });

    let newOwnerId = req.body?.new_owner_id;
    if (newOwnerId === '' || newOwnerId === undefined) {
      return res.status(400).json({ error: 'new_owner_id is required.' });
    }
    if (newOwnerId === null) {
      return res.status(400).json({ error: 'Use update case flow to unassign owner.' });
    }
    newOwnerId = parseInt(newOwnerId, 10);
    if (!Number.isInteger(newOwnerId) || newOwnerId <= 0) {
      return res.status(400).json({ error: 'new_owner_id must be a valid user id.' });
    }

    let nextOwner = null;
    if (req.user.role === 'superadmin') {
      [[nextOwner]] = await pool.execute(
        'SELECT id, name, email FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [newOwnerId]
      );
    } else {
      [[nextOwner]] = await pool.execute(
        `SELECT u.id, u.name, u.email
         FROM users u
         WHERE u.id = ? AND u.is_active = 1
           AND EXISTS (
             SELECT 1
             FROM user_org_access uoa
             WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
           )
         LIMIT 1`,
        [newOwnerId, owned.org_id]
      );
    }
    if (!nextOwner) return res.status(400).json({ error: 'Selected owner is not active for this organisation.' });

    if (Number(owned.case_owner_id || 0) === Number(newOwnerId)) {
      return res.status(400).json({ error: 'Case is already assigned to this owner.' });
    }

    const [[prevOwner]] = owned.case_owner_id
      ? await pool.execute('SELECT id, name, email FROM users WHERE id = ? LIMIT 1', [owned.case_owner_id])
      : [[]];

    await pool.execute('UPDATE cases SET case_owner_id = ? WHERE id = ?', [newOwnerId, req.params.id]);

    await writeCaseAudit(
      req.params.id,
      req.user.userId,
      req.user.email,
      'REASSIGNED',
      'case_owner_id',
      owned.case_owner_id || null,
      newOwnerId
    );
    if (reason) {
      await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'REASSIGN_REASON', 'reason', null, reason);
    }

    const caseRef = owned.case_number || `Case ${req.params.id}`;
    if (Number(newOwnerId) !== Number(req.user.userId)) {
      await pushNotification(newOwnerId, {
        category: 'case_reassignment',
        title: `Case reassigned: ${caseRef}`,
        message: reason
          ? `${req.user.email} reassigned this case to you. Reason: ${reason}`
          : `${req.user.email} reassigned this case to you.`,
        linkUrl: `/cases/${req.params.id}`,
        metadata: { case_id: Number(req.params.id), reassigned_by: req.user.userId },
      });
    }
    if (prevOwner?.id && Number(prevOwner.id) !== Number(req.user.userId) && Number(prevOwner.id) !== Number(newOwnerId)) {
      await pushNotification(prevOwner.id, {
        category: 'case_reassignment',
        title: `Case ownership changed: ${caseRef}`,
        message: `${req.user.email} reassigned this case to ${nextOwner.name || nextOwner.email}.`,
        linkUrl: `/cases/${req.params.id}`,
        metadata: { case_id: Number(req.params.id), reassigned_to: newOwnerId },
      });
    }

    const [[updated]] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name,
        ws.name AS status_name, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id        = o.id
       LEFT JOIN sites           s  ON c.site_id        = s.id
       LEFT JOIN workflow_states ws ON c.status_id      = ws.id
       LEFT JOIN users           u  ON c.case_owner_id  = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    return res.json(updated);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id/reassign', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to reassign case');
    return res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE CASE — F-15 Case Information Section ─────────────────────────────

// PUT /api/cases/:id — update case info fields (also handles auto-save)
router.put('/cases/:id', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const [[currentCase]] = await pool.execute(
      `SELECT id, org_id, status_id, case_owner_id, case_number, priority, date_received,
              description, internal_notes, intake_channel
       FROM cases
       WHERE id = ? AND is_deleted = 0
       LIMIT 1`,
      [req.params.id]
    );
    if (!currentCase) return res.status(404).json({ error: 'Case not found' });

    const body = req.body || {};

    let nextStatusId = currentCase.status_id;
    if (hasOwn(body, 'status_id')) {
      if (body.status_id === '' || body.status_id === null) {
        nextStatusId = null;
      } else {
        const parsed = parseInt(body.status_id, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'status_id must be a valid state id.' });
        }
        nextStatusId = parsed;
      }
      if (nextStatusId !== null && Number(nextStatusId) !== Number(currentCase.status_id || 0)) {
        const result = await checkTransitionAllowed(currentCase.org_id, currentCase.status_id, nextStatusId);
        if (!result.allowed) return res.status(400).json({ error: result.reason });
      }
    }

    let nextOwnerId = currentCase.case_owner_id;
    if (hasOwn(body, 'case_owner_id')) {
      if (body.case_owner_id === '' || body.case_owner_id === null) {
        nextOwnerId = null;
      } else {
        const parsed = parseInt(body.case_owner_id, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'case_owner_id must be a valid user id.' });
        }
        let owner = null;
        if (req.user.role === 'superadmin') {
          [[owner]] = await pool.execute(
            'SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
            [parsed]
          );
        } else {
          [[owner]] = await pool.execute(
            `SELECT u.id
             FROM users u
             WHERE u.id = ? AND u.is_active = 1
               AND EXISTS (
                 SELECT 1
                 FROM user_org_access uoa
                 WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
               )
             LIMIT 1`,
            [parsed, currentCase.org_id]
          );
        }
        if (!owner) {
          return res.status(400).json({ error: 'Selected owner is not active for this organisation.' });
        }
        nextOwnerId = parsed;
      }
    }

    let nextDateReceived = currentCase.date_received;
    if (hasOwn(body, 'date_received')) {
      if (body.date_received === '' || body.date_received === null) {
        nextDateReceived = null;
      } else {
        const normalized = toDateOnlyOrNull(body.date_received);
        if (!normalized) {
          return res.status(400).json({ error: 'date_received must be a valid date.' });
        }
        nextDateReceived = normalized;
      }
    }

    const nextPriority = hasOwn(body, 'priority') ? (body.priority ?? null) : currentCase.priority;
    const nextDescription = hasOwn(body, 'description') ? (body.description ?? null) : currentCase.description;
    const nextInternalNotes = hasOwn(body, 'internal_notes') ? (body.internal_notes ?? null) : currentCase.internal_notes;
    const nextIntakeChannel = hasOwn(body, 'intake_channel') ? (body.intake_channel ?? null) : currentCase.intake_channel;

    await pool.execute(
      `UPDATE cases SET
        status_id      = ?,
        case_owner_id  = ?,
        priority       = ?,
        date_received  = ?,
        description    = ?,
        internal_notes = ?,
        intake_channel = ?
       WHERE id = ?`,
      [
        nextStatusId,
        nextOwnerId,
        nextPriority,
        nextDateReceived,
        nextDescription,
        nextInternalNotes,
        nextIntakeChannel,
        req.params.id
      ]
    );
    const [[updated]] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name,
        ws.name AS status_name, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id        = o.id
       LEFT JOIN sites           s  ON c.site_id        = s.id
       LEFT JOIN workflow_states ws ON c.status_id      = ws.id
       LEFT JOIN users           u  ON c.case_owner_id  = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );

    const previousStatusId = currentCase.status_id === null ? null : Number(currentCase.status_id);
    const updatedStatusId = updated.status_id === null ? null : Number(updated.status_id);
    const statusChanged = previousStatusId !== updatedStatusId;

    const previousOwnerId = currentCase.case_owner_id === null ? null : Number(currentCase.case_owner_id);
    const updatedOwnerId = updated.case_owner_id === null ? null : Number(updated.case_owner_id);
    const ownerChanged = previousOwnerId !== updatedOwnerId;

    const caseRef = updated.case_number || currentCase.case_number || `Case ${req.params.id}`;
    if (statusChanged) {
      await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'STATUS_CHANGED', 'status_id', previousStatusId, updatedStatusId);
      if (updatedOwnerId && Number(updatedOwnerId) !== Number(req.user.userId)) {
        await pushNotification(updatedOwnerId, {
          category: 'case_status',
          title: `Status updated: ${caseRef}`,
          message: `${req.user.email} changed the case status to ${updated.status_name || 'updated state'}.`,
          linkUrl: `/cases/${req.params.id}`,
          metadata: { case_id: Number(req.params.id), status_id: updatedStatusId },
        });
      }
    }

    if (ownerChanged) {
      await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'OWNER_CHANGED', 'case_owner_id', previousOwnerId, updatedOwnerId);
      if (updatedOwnerId && Number(updatedOwnerId) !== Number(req.user.userId)) {
        await pushNotification(updatedOwnerId, {
          category: 'case_reassignment',
          title: `Case assigned: ${caseRef}`,
          message: `${req.user.email} assigned this case to you.`,
          linkUrl: `/cases/${req.params.id}`,
          metadata: { case_id: Number(req.params.id), previous_owner_id: previousOwnerId },
        });
      }
      if (previousOwnerId && Number(previousOwnerId) !== Number(req.user.userId) && previousOwnerId !== updatedOwnerId) {
        await pushNotification(previousOwnerId, {
          category: 'case_reassignment',
          title: `Case ownership changed: ${caseRef}`,
          message: `${req.user.email} moved this case to another owner.`,
          linkUrl: `/cases/${req.params.id}`,
          metadata: { case_id: Number(req.params.id), new_owner_id: updatedOwnerId },
        });
      }
    }

    logger.info({ case_id: req.params?.id, user_id: req.user?.userId, status_changed: statusChanged, owner_changed: ownerChanged }, 'Case updated');
    res.json(updated);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to update case');
    res.status(500).json({ error: err.message });
  }
});

// ─── CF-E6/E7: MI RESPONSES ──────────────────────────────────────────────────

// GET /api/cases/:id/mi-responses — list response history for a case
router.get('/cases/:id/mi-responses', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT
         r.id,
         r.case_id,
         r.mi_tab_id,
         r.response_text,
         r.response_channel AS channel,
         r.response_date AS responded_at,
         r.follow_up_required,
         r.response_status,
         r.draft_saved_at,
         r.approved_by,
         approver.name AS approved_by_name,
         r.approved_at,
         r.cm_document_id,
         COALESCE(r.cm_document_name, d.name) AS cm_document_name,
         r.author_id,
         r.author_name AS responded_by_name,
         r.created_at
       FROM case_mi_responses r
       LEFT JOIN cm_documents d ON d.id = r.cm_document_id
       LEFT JOIN users approver ON approver.id = r.approved_by
       WHERE r.case_id = ? ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cases/:id/mi-responses — add a new MI response (not overwrite)
router.post('/cases/:id/mi-responses', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const { mi_tab_id, response_text, response_channel, response_date, follow_up_required, cm_document_id } = req.body;
    const channel = response_channel || req.body?.channel || null;
    const responseDate = toDateOnlyOrNull(response_date || req.body?.responded_at);
    const responseStatus = String(req.body?.response_status || 'SENT').toUpperCase();
    const validStatuses = ['DRAFT', 'READY', 'APPROVED', 'SENT'];
    if (!validStatuses.includes(responseStatus)) {
      return res.status(400).json({ error: `response_status must be one of: ${validStatuses.join(', ')}` });
    }
    if (!response_text && !cm_document_id) return res.status(400).json({ error: 'response_text or cm_document_id is required.' });

    // Fetch CM doc name if provided
    let cm_document_name = null;
    if (cm_document_id) {
      const [[doc]] = await pool.execute('SELECT name FROM cm_documents WHERE id = ?', [cm_document_id]);
      cm_document_name = doc?.name || null;
    }

    const [result] = await pool.execute(
      `INSERT INTO case_mi_responses
         (case_id, mi_tab_id, response_text, response_channel, response_date, follow_up_required, response_status, draft_saved_at, approved_by, approved_at, cm_document_id, cm_document_name, author_id, author_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        mi_tab_id || null,
        response_text || null,
        channel,
        responseDate,
        follow_up_required ? 1 : 0,
        responseStatus,
        responseStatus === 'DRAFT' ? new Date() : null,
        responseStatus === 'APPROVED' || responseStatus === 'SENT' ? req.user.userId : null,
        responseStatus === 'APPROVED' || responseStatus === 'SENT' ? new Date() : null,
        cm_document_id || null,
        cm_document_name,
        req.user.userId,
        req.user.name || req.user.email,
      ]
    );
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'MI_RESPONSE_CREATED', 'mi_response_status', null, responseStatus);
    await writeAuditLog(req.user.userId, req.user.email, 'CREATE', 'mi_response', result.insertId, {
      case_id: Number(req.params.id),
      response_status: responseStatus,
      response_channel: channel,
      response_date: responseDate,
    });
    // Notify case owner via notifications
    const [[c]] = await pool.execute('SELECT case_owner_id, case_number FROM cases WHERE id = ?', [req.params.id]);
    if (c?.case_owner_id && c.case_owner_id !== req.user.userId) {
      await createNotification(c.case_owner_id, {
        category: 'mi_response',
        severity: follow_up_required ? 'warning' : 'info',
        title: `MI Response ${responseStatus} — ${c.case_number || req.params.id}`,
        message: `${req.user.name || 'A user'} ${responseStatus === 'DRAFT' ? 'saved a draft for' : 'added a response to'} case ${c.case_number || req.params.id}.`,
        linkUrl: `/cases/${req.params.id}?section=mi`,
        metadata: { case_id: req.params.id, response_id: result.insertId, response_status: responseStatus },
        eventKey: 'mi-response-updated',
      }).catch(() => {});
    }
    const row = await getMiResponseRow(req.params.id, result.insertId);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/cases/:id/mi-responses/:responseId/status', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [[existing]] = await pool.execute(
      `SELECT id, response_status
       FROM case_mi_responses
       WHERE id = ? AND case_id = ?`,
      [req.params.responseId, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Response not found.' });

    const responseStatus = String(req.body?.response_status || '').toUpperCase();
    const validStatuses = ['DRAFT', 'READY', 'APPROVED', 'SENT'];
    if (!validStatuses.includes(responseStatus)) {
      return res.status(400).json({ error: `response_status must be one of: ${validStatuses.join(', ')}` });
    }
    const reason = String(req.body?.reason || '').trim();
    const password = String(req.body?.password || '');
    const allowedTransitions = {
      DRAFT: new Set(['READY', 'APPROVED']),
      READY: new Set(['DRAFT', 'APPROVED']),
      APPROVED: new Set(['READY', 'SENT']),
      SENT: new Set([]),
    };
    if (existing.response_status && !allowedTransitions[existing.response_status]?.has(responseStatus)) {
      return res.status(400).json({ error: `Cannot move MI response from ${existing.response_status} to ${responseStatus}.` });
    }
    if (responseStatus === 'SENT' && existing.response_status !== 'APPROVED') {
      return res.status(400).json({ error: 'Response must be APPROVED before it can be SENT.' });
    }
    if (['APPROVED', 'SENT'].includes(responseStatus)) {
      if (!password || !reason) {
        return res.status(400).json({ error: 'password and reason are required for electronic signature.' });
      }
      const [[userWithHash]] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.userId]);
      const match = userWithHash?.password ? await bcrypt.compare(password, userWithHash.password) : false;
      if (!match) {
        return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
      }
    }

    await pool.execute(
      `UPDATE case_mi_responses
       SET response_status = ?,
           draft_saved_at = CASE WHEN ? = 'DRAFT' THEN NOW() ELSE draft_saved_at END,
           approved_by = CASE WHEN ? IN ('APPROVED', 'SENT') THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? IN ('APPROVED', 'SENT') THEN NOW() ELSE approved_at END
       WHERE id = ? AND case_id = ?`,
      [responseStatus, responseStatus, responseStatus, req.user.userId, responseStatus, req.params.responseId, req.params.id]
    );
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'MI_RESPONSE_STATUS', 'mi_response_status', existing.response_status, responseStatus);
    await writeAuditLog(req.user.userId, req.user.email, 'UPDATE', 'mi_response_status', req.params.responseId, {
      case_id: Number(req.params.id),
      from_status: existing.response_status,
      to_status: responseStatus,
      reason: reason || null,
      esigned: ['APPROVED', 'SENT'].includes(responseStatus),
    });

    const [[caseRow]] = await pool.execute('SELECT case_owner_id, case_number FROM cases WHERE id = ?', [req.params.id]);
    if (caseRow?.case_owner_id && Number(caseRow.case_owner_id) !== Number(req.user.userId)) {
      await createNotification(caseRow.case_owner_id, {
        category: 'mi_response',
        severity: responseStatus === 'SENT' ? 'critical' : responseStatus === 'APPROVED' ? 'warning' : 'info',
        title: `MI Response ${responseStatus} — ${caseRow.case_number || req.params.id}`,
        message: `${req.user.name || req.user.email} moved response ${req.params.responseId} to ${responseStatus}.`,
        linkUrl: `/cases/${req.params.id}?section=mi`,
        metadata: { case_id: req.params.id, response_id: req.params.responseId, response_status: responseStatus },
        requiresAcknowledgement: responseStatus === 'SENT',
        eventKey: 'mi-response-status-updated',
      }).catch(() => {});
    }

    const row = await getMiResponseRow(req.params.id, req.params.responseId);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── CF-E8/E10: AE TRANSMISSIONS ─────────────────────────────────────────────

// GET /api/cases/:id/ae-transmissions
router.get('/cases/:id/ae-transmissions', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT t.*, u.name AS assignee_name FROM case_ae_transmissions t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.case_id = ? ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cases/:id/ae-transmissions — create AE transmission (route to PV)
router.post('/cases/:id/ae-transmissions', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const assignedTo = Number(req.body?.assigned_to || req.body?.assigned_to_id || 0);
    const priority = normalizeAeTransmissionPriority(req.body?.priority || 'standard');
    const due_date = req.body?.due_date || null;
    const narrative = req.body?.narrative || null;
    if (!assignedTo) return res.status(400).json({ error: 'assigned_to is required.' });

    const [[assignee]] = await pool.execute('SELECT name, email FROM users WHERE id = ? AND is_active = 1', [assignedTo]);
    if (!assignee) return res.status(404).json({ error: 'Assignee user not found.' });

    // Auto-calculate due_date if not provided (7-day = 7d, 15-day = 15d, standard = 30d)
    const dueDate = calculateAeDueDate(priority, due_date || null);
    const slaStatus = computeTransmissionSlaStatus(dueDate, 'Pending');

    const [result] = await pool.execute(
      `INSERT INTO case_ae_transmissions (case_id, assigned_to, assigned_name, priority, due_date, narrative, status, sla_status, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [req.params.id, assignedTo, assignee.name, priority, dueDate, narrative || null, slaStatus,
       req.user.userId, req.user.name || req.user.email]
    );
    // Notify assigned user
    const [[c]] = await pool.execute('SELECT case_number FROM cases WHERE id = ?', [req.params.id]);
    await createNotification(assignedTo, {
      category: 'ae_transmission',
      severity: slaStatus === 'at_risk' ? 'warning' : 'info',
      title: `AE Case Routed to You — ${c?.case_number || req.params.id}`,
      message: `${req.user.name || 'A user'} routed AE case ${c?.case_number || req.params.id} to you for PV review. Due: ${dueDate}.`,
      linkUrl: `/cases/${req.params.id}?section=ae`,
      metadata: { case_id: req.params.id, transmission_id: result.insertId, priority, due_date: dueDate, sla_status: slaStatus },
      eventKey: 'ae-transmission-created',
    }).catch(() => {});
    const row = await getAeTransmissionRow(req.params.id, result.insertId);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cases/:id/ae-transmissions/:txId — update status
router.patch('/cases/:id/ae-transmissions/:txId', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const { status, resolution_notes } = req.body;
    const VALID = ['Pending', 'In Review', 'Accepted', 'Closed'];
    if (status && !VALID.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    const [[existingTx]] = await pool.execute(
      'SELECT due_date FROM case_ae_transmissions WHERE id = ? AND case_id = ?',
      [req.params.txId, req.params.id]
    );
    if (!existingTx) return res.status(404).json({ error: 'Transmission not found.' });
    const nextStatus = status || null;
    await pool.execute(
      `UPDATE case_ae_transmissions
       SET status = COALESCE(?, status),
           resolution_notes = COALESCE(?, resolution_notes),
           sla_status = COALESCE(?, sla_status)
       WHERE id = ? AND case_id = ?`,
      [nextStatus, resolution_notes || null, nextStatus ? computeTransmissionSlaStatus(existingTx.due_date, nextStatus) : null, req.params.txId, req.params.id]
    );
    const row = await getAeTransmissionRow(req.params.id, req.params.txId);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CF-E9/E10: PC TRANSMISSIONS ─────────────────────────────────────────────

// GET /api/cases/:id/pc-transmissions
router.get('/cases/:id/pc-transmissions', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT t.*, t.resolution_notes AS notes, u.name AS assignee_name FROM case_pc_transmissions t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.case_id = ? ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cases/:id/pc-transmissions — route to quality team
router.post('/cases/:id/pc-transmissions', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const assignedTo = Number(req.body?.assigned_to || req.body?.assigned_to_id || 0);
    const priority = normalizePcTransmissionPriority(req.body?.priority || 'standard');
    const due_date = req.body?.due_date || null;
    const resolution_notes = req.body?.resolution_notes || req.body?.notes || null;
    if (!assignedTo) return res.status(400).json({ error: 'assigned_to is required.' });

    const [[assignee]] = await pool.execute('SELECT name, email FROM users WHERE id = ? AND is_active = 1', [assignedTo]);
    if (!assignee) return res.status(404).json({ error: 'Assignee user not found.' });

    const dueDate = calculatePcDueDate(priority, due_date || null);
    const slaStatus = computeTransmissionSlaStatus(dueDate, 'Pending');

    const [result] = await pool.execute(
      `INSERT INTO case_pc_transmissions (case_id, assigned_to, assigned_name, priority, due_date, resolution_notes, status, sla_status, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [req.params.id, assignedTo, assignee.name, priority, dueDate, resolution_notes || null, slaStatus,
       req.user.userId, req.user.name || req.user.email]
    );
    const [[c]] = await pool.execute('SELECT case_number FROM cases WHERE id = ?', [req.params.id]);
    await createNotification(assignedTo, {
      category: 'pc_transmission',
      severity: slaStatus === 'at_risk' ? 'warning' : 'info',
      title: `PC Complaint Routed to You — ${c?.case_number || req.params.id}`,
      message: `${req.user.name || 'A user'} routed PC complaint ${c?.case_number || req.params.id} to you for quality investigation. Due: ${dueDate}.`,
      linkUrl: `/cases/${req.params.id}?section=pc`,
      metadata: { case_id: req.params.id, transmission_id: result.insertId, priority, due_date: dueDate, sla_status: slaStatus },
      eventKey: 'pc-transmission-created',
    }).catch(() => {});
    const row = await getPcTransmissionRow(req.params.id, result.insertId);
    res.status(201).json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/cases/:id/pc-transmissions/:txId — update status
router.patch('/cases/:id/pc-transmissions/:txId', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const { status, resolution_notes } = req.body;
    const VALID = ['Pending', 'Under Investigation', 'Closed'];
    if (status && !VALID.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    const [[existingTx]] = await pool.execute(
      'SELECT due_date FROM case_pc_transmissions WHERE id = ? AND case_id = ?',
      [req.params.txId, req.params.id]
    );
    if (!existingTx) return res.status(404).json({ error: 'Transmission not found.' });
    const nextStatus = status || null;
    await pool.execute(
      `UPDATE case_pc_transmissions
       SET status = COALESCE(?, status),
           resolution_notes = COALESCE(?, resolution_notes),
           sla_status = COALESCE(?, sla_status)
       WHERE id = ? AND case_id = ?`,
      [nextStatus, resolution_notes || null, nextStatus ? computeTransmissionSlaStatus(existingTx.due_date, nextStatus) : null, req.params.txId, req.params.id]
    );
    const row = await getPcTransmissionRow(req.params.id, req.params.txId);
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CF-E1: DYNAMIC FIELDS ────────────────────────────────────────────────────

// GET /api/cases/:id/dynamic-fields
router.get('/cases/:id/dynamic-fields', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT
         v.field_id AS field_definition_id,
         v.field_value AS value,
         f.field_name,
         f.field_type,
         COALESCE(f.custom_label, f.field_name) AS field_label,
         f.section_name AS section_label,
         f.picklist_type,
         f.is_required,
         f.sort_order
       FROM case_dynamic_field_values v
       JOIN field_setup f ON f.id = v.field_id
       WHERE v.case_id = ? ORDER BY f.sort_order, f.id`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cases/:id/dynamic-fields — bulk upsert dynamic field values
router.post('/cases/:id/dynamic-fields', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const { fields } = req.body; // [{field_id, field_value}]
    if (!Array.isArray(fields) || !fields.length) return res.status(400).json({ error: 'fields array required.' });
    for (const f of fields) {
      const fieldId = Number(f.field_id || f.field_definition_id || 0);
      if (!fieldId) continue;
      const fieldValue = Object.prototype.hasOwnProperty.call(f, 'field_value') ? f.field_value : f.value;
      await pool.execute(
        `INSERT INTO case_dynamic_field_values (case_id, field_id, field_value) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE field_value = VALUES(field_value)`,
        [req.params.id, fieldId, fieldValue ?? null]
      );
    }
    res.json({ message: 'Dynamic fields saved.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cases/:id/intake — return reporter + patient + ae_intake/pc_intake for a case
router.get('/cases/:id/intake', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const caseId = req.params.id;
    const [[reporter]] = await pool.execute('SELECT * FROM case_reporter WHERE case_id = ?', [caseId]);
    const [[patient]] = await pool.execute('SELECT * FROM case_patient WHERE case_id = ?', [caseId]);
    const [[ae_intake]] = await pool.execute('SELECT * FROM case_ae_intake WHERE case_id = ?', [caseId]);
    const [[pc_intake]] = await pool.execute('SELECT * FROM case_pc_intake WHERE case_id = ?', [caseId]);
    res.json({ reporter: reporter || null, patient: patient || null, ae_intake: ae_intake || null, pc_intake: pc_intake || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/cases/:id/intake — update intake data post-creation
router.put('/cases/:id/intake', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const { reporter, patient, ae_intake, pc_intake } = req.body;
    const caseId = req.params.id;
    const [[c]] = await pool.execute('SELECT case_type FROM cases WHERE id = ?', [caseId]);
    if (!c) return res.status(404).json({ error: 'Case not found.' });

    if (reporter) {
      await pool.execute(
        `INSERT INTO case_reporter (case_id, first_name, last_name, email, phone, reporter_type, country, organisation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         first_name=VALUES(first_name), last_name=VALUES(last_name), email=VALUES(email),
         phone=VALUES(phone), reporter_type=VALUES(reporter_type), country=VALUES(country), organisation=VALUES(organisation)`,
        [caseId, reporter.first_name||null, reporter.last_name||null, reporter.email||null,
         reporter.phone||null, reporter.reporter_type||'HCP', reporter.country||null, reporter.organisation||null]
      );
    }
    if (patient) {
      await pool.execute(
        `INSERT INTO case_patient (case_id, initials, age, age_unit, gender, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         initials=VALUES(initials), age=VALUES(age), age_unit=VALUES(age_unit), gender=VALUES(gender), weight_kg=VALUES(weight_kg)`,
        [caseId, patient.initials||null, patient.age?Number(patient.age):null, patient.age_unit||'years', patient.gender||null, patient.weight_kg?Number(patient.weight_kg):null]
      );
    }
    if (ae_intake && c.case_type === 'AE') {
      await pool.execute(
        `INSERT INTO case_ae_intake
           (case_id, suspect_drug_name, batch_lot_number, dose, route_of_admin, treatment_start_date, treatment_stop_date,
            reaction_description, reaction_onset_date, outcome, is_serious, is_death, is_life_threatening, is_hospitalization,
            is_prolonged_hospitalization, is_disability, is_congenital_anomaly, is_other_medically_important)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE suspect_drug_name=VALUES(suspect_drug_name), batch_lot_number=VALUES(batch_lot_number),
           dose=VALUES(dose), route_of_admin=VALUES(route_of_admin), treatment_start_date=VALUES(treatment_start_date),
           treatment_stop_date=VALUES(treatment_stop_date), reaction_description=VALUES(reaction_description),
           reaction_onset_date=VALUES(reaction_onset_date), outcome=VALUES(outcome), is_serious=VALUES(is_serious),
           is_death=VALUES(is_death), is_life_threatening=VALUES(is_life_threatening), is_hospitalization=VALUES(is_hospitalization),
           is_prolonged_hospitalization=VALUES(is_prolonged_hospitalization), is_disability=VALUES(is_disability),
           is_congenital_anomaly=VALUES(is_congenital_anomaly), is_other_medically_important=VALUES(is_other_medically_important)`,
        [caseId, ae_intake.suspect_drug_name||null, ae_intake.batch_lot_number||null, ae_intake.dose||null,
         ae_intake.route_of_admin||null, toDateOnlyOrNull(ae_intake.treatment_start_date), toDateOnlyOrNull(ae_intake.treatment_stop_date),
         ae_intake.reaction_description||null, toDateOnlyOrNull(ae_intake.reaction_onset_date), ae_intake.outcome||null,
         ae_intake.is_serious?1:0, ae_intake.is_death?1:0, ae_intake.is_life_threatening?1:0,
         ae_intake.is_hospitalization?1:0, ae_intake.is_prolonged_hospitalization?1:0,
         ae_intake.is_disability?1:0, ae_intake.is_congenital_anomaly?1:0, ae_intake.is_other_medically_important?1:0]
      );
    }
    if (pc_intake && c.case_type === 'PC') {
      await pool.execute(
        `INSERT INTO case_pc_intake (case_id, product_name, batch_lot_number, expiry_date, purchase_date,
           complaint_category, complaint_description, sample_available, sample_return_requested)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         product_name=VALUES(product_name), batch_lot_number=VALUES(batch_lot_number), expiry_date=VALUES(expiry_date),
         purchase_date=VALUES(purchase_date), complaint_category=VALUES(complaint_category),
         complaint_description=VALUES(complaint_description), sample_available=VALUES(sample_available),
         sample_return_requested=VALUES(sample_return_requested)`,
        [caseId, pc_intake.product_name||null, pc_intake.batch_lot_number||null,
         toDateOnlyOrNull(pc_intake.expiry_date), toDateOnlyOrNull(pc_intake.purchase_date),
         pc_intake.complaint_category||null, pc_intake.complaint_description||null,
         pc_intake.sample_available?1:0, pc_intake.sample_return_requested?1:0]
      );
    }
    res.json({ message: 'Intake data updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

// DELETE /api/cases/:id — soft delete (admin/superadmin only)
router.delete('/cases/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    await pool.execute('UPDATE cases SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    logger.warn({ case_id: req.params?.id, user_id: req.user?.userId }, 'Case soft deleted');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to soft delete case');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
