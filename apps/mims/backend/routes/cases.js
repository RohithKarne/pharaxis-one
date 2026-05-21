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
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  bcrypt = require('bcrypt');
}
const pool    = require('../database/db');
const { authenticate, requireRole, requireOrg, requireCapability } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { checkTransitionAllowed } = require('../services/workflowEngine');
const { logger } = require('../services/logger');
const { createNotification } = require('../services/notificationCenterService');
const { emitDataSync } = require('../services/appRealtimeService');
const { fireIntegrationEvent } = require('../services/integrationEngine');
const { fireWorkflowEvent } = require('../services/workflow/eventHookService');
const { resolveDefaultWorkflowStateId } = require('../services/orgBootstrapService');
const changeControl = require('../services/changeControlService');
const {
  calculateAeDueDate,
  calculatePcDueDate,
  computeTransmissionSlaStatus,
  findDuplicateCandidates,
  getCaseDuplicateCandidates,
} = require('../services/caseGovernanceService');
const { resolveProductGroups } = require('../services/productGroupService');
const { evaluateRule } = require('../../shared/services/ruleEvaluator');
const { recalculateAll: recalculateHaClocks } = require('../services/haClockService');
const { hasGlobalAdminScope, isAdminUser } = require('../utils/adminScope');

// ── Architecture Fix A1: shared helpers extracted to service files ─────────────
// All utility functions, constants and DB helpers previously defined inline here
// now live in caseHelpers.js (pure utils + DB helpers) and miResponseService.js
// (MI response package builder). Route handlers below are unchanged.
const {
  CASE_SORT_MAP, FORM_RULE_PRECEDENCE, DEFAULT_UNMASK_ROLES,
  parseJsonSafe, parseStoredJson, uniquePositiveInts, stripHtml, applyMergeFields,
  toDateOnlyOrNull, isValidDateOnly, parseIntSafe, clamp, hasOwn, parseDateForPicklistFilter,
  normalizeRole, parseRolesCsv, canViewSensitiveField, maskStringValue, applySensitiveMask,
  normalizeFieldOverrides, normalizeAeTransmissionPriority, normalizePcTransmissionPriority,
  buildGlobalCaseSearchClause, logResponseError, writeCaseAudit, writeAuditLog, pushNotification,
  verifyCaseOrg, findActivePicklistEntry, assertActivePicklistValue,
  buildReporterPatientSchemaSnapshot, buildCaseSchemaSnapshot,
  loadSensitiveFieldConfigMap, emitOutboundEvent,
  getMiResponseRow, getAeTransmissionRow, getPcTransmissionRow,
  getCasePrimaryProductContext, resolveTransmissionGroupSnapshot,
} = require('../services/caseHelpers');

const {
  getResponseBuilderCase, getResponseBuilderMiTab, getResponseBuilderRecipient,
  listResponseBuilderRecipients, buildResponsePackage,
} = require('../services/miResponseService');

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

router.post('/cases/saved-views', authenticate, validate(schemas.savedView), async (req, res) => {
  try {
    if (!req.user.orgId) return res.status(400).json({ error: 'Organisation context required.' });
    const name = String(req.body?.name || '').trim();
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const isShared = !!req.body?.is_shared;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    if (isShared && !isAdminUser(req.user)) {
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
    if (!isOwner && !isAdminUser(req.user)) {
      return res.status(403).json({ error: 'Only the owner or an admin can update this view.' });
    }

    const nextShared = Object.prototype.hasOwnProperty.call(req.body || {}, 'is_shared')
      ? !!req.body.is_shared
      : !!existing.is_shared;
    if (nextShared && !isAdminUser(req.user)) {
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
    if (!isOwner && !isAdminUser(req.user)) {
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
    // Org isolation — always scope to req.user.orgId (platform admin has no orgId and sees all)
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
    if (!hasGlobalAdminScope(req.user)) {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name, u.name AS owner_name,
              (SELECT MIN(mi.response_required_by) FROM case_mi mi WHERE mi.case_id = c.id) AS sla_due
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
    if (!hasGlobalAdminScope(req.user)) {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name, u.name AS owner_name,
              (SELECT MIN(mi.response_required_by) FROM case_mi mi WHERE mi.case_id = c.id) AS sla_due
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


// GET /api/cases/mi-responses/log — Response log: all MI responses (SENT) across cases (S19-P0)
router.get('/cases/mi-responses/log', authenticate, async (req, res) => {
  try {
    const { status, from_date, to_date, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orgClause = hasGlobalAdminScope(req.user) ? '' : ' AND c.org_id = ?';
    const orgParams = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];

    let where = `WHERE 1=1${orgClause}`;
    const params = [...orgParams];

    if (status)    { where += ' AND r.response_status = ?'; params.push(status); }
    if (from_date) { where += ' AND r.created_at >= ?';     params.push(from_date); }
    if (to_date)   { where += ' AND r.created_at <= ?';     params.push(to_date + ' 23:59:59'); }
    if (search) {
      where += ' AND (c.case_number LIKE ? OR r.response_text LIKE ? OR r.author_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = `SELECT COUNT(*) AS total
      FROM case_mi_responses r
      JOIN cases c ON c.id = r.case_id
      ${where}`;
    const [[{ total }]] = await pool.execute(countSql, params);

    const dataSql = `
      SELECT r.id, r.case_id, r.response_status, r.response_channel, r.response_date,
             r.response_text, r.follow_up_required, r.author_id, r.author_name,
             r.approved_by, r.approved_at, r.created_at,
             c.case_number, c.case_type, c.priority,
             approver.name AS approved_by_name,
             (SELECT CONCAT(cc.first_name,' ',cc.last_name)
              FROM case_contacts cc WHERE cc.case_id = c.id ORDER BY cc.is_primary DESC, cc.id ASC LIMIT 1
             ) AS recipient_name,
             (SELECT COALESCE(cc.email,'')
              FROM case_contacts cc WHERE cc.case_id = c.id ORDER BY cc.is_primary DESC, cc.id ASC LIMIT 1
             ) AS recipient_email
      FROM case_mi_responses r
      JOIN cases c ON c.id = r.case_id
      LEFT JOIN users approver ON approver.id = r.approved_by
      ${where}
      ORDER BY r.created_at DESC
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [rows] = await pool.execute(dataSql, params);
    res.json({ responses: rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    logger.error({ err }, 'GET /cases/mi-responses/log error');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/dashboard-summary — Home dashboard stats/recent/alerts (Sprint 14 G11)
router.get('/cases/dashboard-summary', authenticate, async (req, res) => {
  try {
    const orgClause = hasGlobalAdminScope(req.user) ? '' : ' AND c.org_id = ?';
    const orgParams = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];

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

    // S19-P1: MI KPIs — pending approvals, sent today, SLA breaches
    const miOrgClause = hasGlobalAdminScope(req.user) ? '' : ' AND c.org_id = ?';
    const miOrgParams = hasGlobalAdminScope(req.user) ? [] : [req.user.orgId];
    const [[miStats]] = await pool.execute(
      `SELECT
        COALESCE(SUM(CASE WHEN r.response_status IN ('DRAFT','READY') THEN 1 ELSE 0 END), 0) AS pending_responses,
        COALESCE(SUM(CASE WHEN r.response_status = 'APPROVED' THEN 1 ELSE 0 END), 0)         AS pending_approval,
        COALESCE(SUM(CASE WHEN r.response_status = 'SENT' AND DATE(r.approved_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS sent_today,
        COALESCE(SUM(CASE WHEN mi.response_required_by IS NOT NULL AND mi.response_required_by < CURDATE()
                           AND r.response_status NOT IN ('SENT','VOIDED') THEN 1 ELSE 0 END), 0) AS sla_breached
       FROM case_mi_responses r
       JOIN cases c ON c.id = r.case_id
       JOIN case_mi mi ON mi.id = r.mi_tab_id
       WHERE c.is_deleted = 0 AND r.response_status != 'VOIDED'${miOrgClause}`,
      miOrgParams
    );

    return res.json({
      stats: {
        total_cases: Number(counts.total_cases || 0),
        open_cases: Number(counts.open_cases || 0),
        my_cases: Number(counts.my_cases || 0),
        unassigned_cases: Number(counts.unassigned_cases || 0),
        priority_cases: Number(counts.priority_cases || 0),
      },
      mi_stats: {
        pending_responses: Number(miStats?.pending_responses || 0),
        pending_approval:  Number(miStats?.pending_approval  || 0),
        sent_today:        Number(miStats?.sent_today        || 0),
        sla_breached:      Number(miStats?.sla_breached      || 0),
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

    const orgId = hasGlobalAdminScope(req.user) ? (parseInt(req.query.org_id, 10) || 1) : req.user.orgId;
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

    const caseTypeLc = String(case_type || '').toLowerCase();
    const [fields] = await pool.execute(
      `SELECT id, section_name, field_name, field_type, is_required, is_hidden, is_disabled,
              custom_label, help_text, picklist_type, lookup_target, sort_order,
              max_length, default_value, is_sensitive, masking_pattern, unmask_roles,
              case_type_scope, display_tab
       FROM field_setup
       WHERE (org_id = ? OR org_id IS NULL) AND is_hidden = 0 AND is_disabled = 0
         AND section_name != '__customize_placeholder__'
         AND (case_type_scope = 'shared' OR case_type_scope = ?)
       ORDER BY section_name, sort_order, id`,
      [orgId, caseTypeLc]
    );

    const today = toDateOnlyOrNull(new Date());
    const [picklists] = await pool.execute(
      `SELECT COALESCE(pf.name, p.field_type) AS field_type, p.id, p.value, p.name AS label,
              p.description, p.external_codes, p.translations, p.parent_value_id, p.sort_order
       FROM picklists p
       LEFT JOIN picklist_fields pf ON p.field_id = pf.id
       WHERE p.org_id = ? AND p.status = 'Active'
         AND (? IS NULL OR (COALESCE(p.effective_from, '1900-01-01') <= ? AND COALESCE(p.effective_to, '2999-12-31') >= ?))
       ORDER BY COALESCE(pf.name, p.field_type), p.sort_order ASC, p.value ASC, p.id ASC`,
      [orgId, today, today, today]
    );

    const picklistMap = picklists.reduce((acc, row) => {
      if (!acc[row.field_type]) acc[row.field_type] = [];
      acc[row.field_type].push({
        id: row.id,
        value: row.value,
        label: row.label || row.value,
        description: row.description || '',
        external_codes: parseStoredJson(row.external_codes, null),
        translations: parseStoredJson(row.translations, null),
        parent_value_id: row.parent_value_id || null,
        sort_order: row.sort_order || 0,
      });
      return acc;
    }, {});

    const [rules] = await pool.execute(
      `SELECT id, org_id, case_type, section_name, field_name, rule_type,
              condition_json, action_json, is_active, priority
       FROM case_form_rules
       WHERE org_id = ? AND is_active = 1 AND (case_type = ? OR case_type = 'ALL')
       ORDER BY priority DESC, id ASC`,
      [orgId, case_type]
    );
    const normalizedRules = rules.map((rule) => ({
      ...rule,
      condition_json: parseStoredJson(rule.condition_json, {}),
      action_json: parseStoredJson(rule.action_json, {}),
      is_active: !!rule.is_active,
    }));

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
        field_overrides: normalizeFieldOverrides(section.field_overrides),
        fields: sectionFields,
      };
    });

    return res.json({ case_type, rule_precedence: FORM_RULE_PRECEDENCE, sections: sectionsWithFields, rules: normalizedRules });
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
    emitDataSync({
      orgIds: [Number(owned.org_id || 0)],
      domains: ['cases', 'dashboard'],
      reason: 'case.comment.created',
      payload: { caseId: Number(req.params.id) },
    });
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

// ─── Case Drafts / Productivity ─────────────────────────────────────────────

function draftKey(caseId) {
  if (String(caseId || '').toLowerCase() === 'new') return null;
  const parsed = Number(caseId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get('/cases/drafts', authenticate, requireOrg, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, case_id, user_id, org_id, case_type, payload_json, updated_at
       FROM case_drafts
       WHERE user_id = ? AND org_id = ?
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.user.userId, req.user.orgId]
    );
    res.json({ drafts: rows.map((row) => ({ ...row, payload: parseStoredJson(row.payload_json, {}) })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cases/drafts/:caseId', authenticate, requireOrg, async (req, res) => {
  try {
    const caseId = draftKey(req.params.caseId);
    const sql = caseId === null
      ? `SELECT * FROM case_drafts WHERE user_id = ? AND org_id = ? AND case_id IS NULL ORDER BY updated_at DESC LIMIT 1`
      : `SELECT * FROM case_drafts WHERE user_id = ? AND org_id = ? AND case_id = ? ORDER BY updated_at DESC LIMIT 1`;
    const params = caseId === null ? [req.user.userId, req.user.orgId] : [req.user.userId, req.user.orgId, caseId];
    const [[row]] = await pool.execute(sql, params);
    res.json({ draft: row ? { ...row, payload: parseStoredJson(row.payload_json, {}) } : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/drafts/:caseId', authenticate, requireOrg, async (req, res) => {
  try {
    const caseId = draftKey(req.params.caseId);
    const caseType = ['AE', 'MI', 'PC'].includes(req.body?.case_type) ? req.body.case_type : 'MI';
    const payload = req.body?.payload || req.body || {};
    if (caseId === null) {
      const [[existing]] = await pool.execute(
        `SELECT id FROM case_drafts
         WHERE user_id = ? AND org_id = ? AND case_id IS NULL
         ORDER BY updated_at DESC LIMIT 1`,
        [req.user.userId, req.user.orgId]
      );
      if (existing) {
        await pool.execute(
          `UPDATE case_drafts
             SET case_type = ?, payload_json = ?, updated_at = NOW()
           WHERE id = ?`,
          [caseType, JSON.stringify(payload), existing.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO case_drafts (case_id, user_id, org_id, case_type, payload_json)
           VALUES (NULL, ?, ?, ?, ?)`,
          [req.user.userId, req.user.orgId, caseType, JSON.stringify(payload)]
        );
      }
    } else {
      await pool.execute(
        `INSERT INTO case_drafts (case_id, user_id, org_id, case_type, payload_json)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE case_type = VALUES(case_type), payload_json = VALUES(payload_json), updated_at = NOW()`,
        [caseId, req.user.userId, req.user.orgId, caseType, JSON.stringify(payload)]
      );
    }
    res.json({ ok: true, updated_at: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cases/drafts/:caseId', authenticate, requireOrg, async (req, res) => {
  try {
    const caseId = draftKey(req.params.caseId);
    if (caseId === null) {
      await pool.execute('DELETE FROM case_drafts WHERE user_id = ? AND org_id = ? AND case_id IS NULL', [req.user.userId, req.user.orgId]);
    } else {
      await pool.execute('DELETE FROM case_drafts WHERE user_id = ? AND org_id = ? AND case_id = ?', [req.user.userId, req.user.orgId, caseId]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/copy-from/:id', authenticate, requireOrg, async (req, res) => {
  try {
    const source = await verifyCaseOrg(req.params.id, req);
    if (!source) return res.status(403).json({ error: 'Access denied' });
    const fields = Array.isArray(req.body?.fields_to_copy) ? req.body.fields_to_copy : ['priority', 'intake_channel', 'description', 'internal_notes'];
    const payload = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(source, field)) payload[field] = source[field];
    }
    const caseType = req.body?.new_case_type || source.case_type || 'MI';
    const [result] = await pool.execute(
      `INSERT INTO case_drafts (case_id, user_id, org_id, case_type, payload_json)
       VALUES (NULL, ?, ?, ?, ?)`,
      [req.user.userId, req.user.orgId, caseType, JSON.stringify(payload)]
    );
    await writeAuditLog(req.user.userId, req.user.email, 'COPY_FROM_CASE', 'case_draft', result.insertId, { source_case_id: Number(req.params.id), fields });
    res.status(201).json({ draft_id: result.insertId, payload, case_type: caseType });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
    if (!hasGlobalAdminScope(req.user) && Number(c.org_id) !== Number(req.user.orgId)) {
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

router.get('/cases/:id/intake-schema-snapshot', authenticate, async (req, res) => {
  try {
    const currentCase = await verifyCaseOrg(req.params.id, req);
    if (!currentCase) return res.status(403).json({ error: 'Access denied' });

    const [[row]] = await pool.execute(
      `SELECT reporter_schema_version, reporter_schema_snapshot, patient_schema_version, patient_schema_snapshot
       FROM cases
       WHERE id = ?`,
      [req.params.id]
    );
    return res.json({
      reporter_schema_version: row?.reporter_schema_version || null,
      reporter_snapshot: parseStoredJson(row?.reporter_schema_snapshot, null),
      patient_schema_version: row?.patient_schema_version || null,
      patient_snapshot: parseStoredJson(row?.patient_schema_snapshot, null),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── CREATE CASE (F-13) ───────────────────────────────────────────────────────

// POST /api/cases — create new case with intake fields captured at creation time (CF-E1–E5)
router.post('/cases', authenticate, requireOrg, requireCapability('case.create'), validate(schemas.createCase), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      site_id, case_type, intake_channel = 'manual', date_received, awareness_date, learn_of_validity_date, follow_up_received_date, case_number,
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
    if (!org_id) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'org_id is required' });
    }
    // Site concept retired from the UI. Users no longer pick a site, so resolve
    // the org's default (primary) site behind the scenes to keep site-scoped
    // data and queries intact.
    let resolvedSiteId = site_id || null;
    if (!resolvedSiteId) {
      const [[defSite]] = await conn.execute(
        'SELECT id FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC LIMIT 1',
        [org_id]
      );
      resolvedSiteId = defSite?.id || null;
    }
    if (case_type && !['MI', 'AE', 'PC'].includes(case_type)) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ error: 'case_type must be MI, AE, or PC' });
    }
    const dateReceived = toDateOnlyOrNull(date_received);
    const awarenessDate = awareness_date ? toDateOnlyOrNull(awareness_date) : null;
    const learnOfValidityDate = learn_of_validity_date ? toDateOnlyOrNull(learn_of_validity_date) : null;
    const followUpReceivedDate = follow_up_received_date ? toDateOnlyOrNull(follow_up_received_date) : null;
    const validationDate = dateReceived || toDateOnlyOrNull(new Date());
    const defaultStatusId = await resolveDefaultWorkflowStateId(conn, org_id);

    // Sprint 17 governance: strict controlled vocab and taxonomy validation
    let reporterTypeValue = reporter?.reporter_type || 'HCP';
    let patientGenderValue = patient?.gender || null;
    let patientAgeUnitValue = patient?.age_unit || (patient ? 'years' : null);
    let aeRouteValue = ae_intake?.route_of_admin || null;
    let aeOutcomeValue = ae_intake?.outcome || null;
    let pcCategoryTaxonomy = null;

    if (reporter && reporterTypeValue) {
      const resolved = await assertActivePicklistValue(org_id, 'reporter_type', reporterTypeValue, validationDate, 'Reporter Type');
      reporterTypeValue = resolved?.value || reporterTypeValue;
    }
    if (patient && patientAgeUnitValue) {
      const resolved = await assertActivePicklistValue(org_id, 'age_unit', patientAgeUnitValue, validationDate, 'Age Unit');
      patientAgeUnitValue = resolved?.value || patientAgeUnitValue;
    }
    if (patient && patientGenderValue) {
      const resolved = await assertActivePicklistValue(org_id, 'gender', patientGenderValue, validationDate, 'Gender');
      patientGenderValue = resolved?.value || patientGenderValue;
    }
    if (case_type === 'AE' && ae_intake) {
      if (aeRouteValue) {
        const resolved = await assertActivePicklistValue(org_id, 'route_of_admin', aeRouteValue, validationDate, 'AE route_of_admin');
        aeRouteValue = resolved?.value || aeRouteValue;
      }
      if (aeOutcomeValue) {
        const resolved = await assertActivePicklistValue(org_id, 'ae_outcome', aeOutcomeValue, validationDate, 'AE outcome');
        aeOutcomeValue = resolved?.value || aeOutcomeValue;
      }
    }
    if (case_type === 'PC' && pc_intake && pc_intake.complaint_category) {
      pcCategoryTaxonomy = await assertActivePicklistValue(
        org_id,
        'pc_category',
        pc_intake.complaint_category,
        validationDate,
        'PC complaint_category'
      );
    }

    // 1. Insert core case
    let result;
    try {
      [result] = await conn.execute(
        `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, awareness_date, learn_of_validity_date, follow_up_received_date, case_number, status_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [org_id, resolvedSiteId, case_type ?? null, intake_channel, dateReceived, awarenessDate, learnOfValidityDate, followUpReceivedDate, case_number ?? null, defaultStatusId, req.user.userId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' && String(err.message || '').includes('case_number')) {
        [result] = await conn.execute(
          `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, awareness_date, learn_of_validity_date, follow_up_received_date, case_number, status_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [org_id, resolvedSiteId, case_type ?? null, intake_channel, dateReceived, awarenessDate, learnOfValidityDate, followUpReceivedDate, `${case_number}-${Date.now()}`, defaultStatusId, req.user.userId]
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
         reporter.phone || null, reporterTypeValue || 'HCP', reporter.country || null, reporter.organisation || null]
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
         patientAgeUnitValue || 'years', patientGenderValue || null, patient.weight_kg ? Number(patient.weight_kg) : null]
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
         ae_intake.dose || null, aeRouteValue || null,
         toDateOnlyOrNull(ae_intake.treatment_start_date), toDateOnlyOrNull(ae_intake.treatment_stop_date),
         ae_intake.reaction_description || null, toDateOnlyOrNull(ae_intake.reaction_onset_date),
         aeOutcomeValue || null,
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
            complaint_category, complaint_taxonomy_id, complaint_taxonomy_label, complaint_taxonomy_effective_from, complaint_taxonomy_effective_to,
            complaint_description, sample_available, sample_return_requested)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE product_name=VALUES(product_name), batch_lot_number=VALUES(batch_lot_number),
           expiry_date=VALUES(expiry_date), purchase_date=VALUES(purchase_date),
           complaint_category=VALUES(complaint_category), complaint_description=VALUES(complaint_description),
           complaint_taxonomy_id=VALUES(complaint_taxonomy_id), complaint_taxonomy_label=VALUES(complaint_taxonomy_label),
           complaint_taxonomy_effective_from=VALUES(complaint_taxonomy_effective_from), complaint_taxonomy_effective_to=VALUES(complaint_taxonomy_effective_to),
           sample_available=VALUES(sample_available), sample_return_requested=VALUES(sample_return_requested)`,
        [caseId, pc_intake.product_name || null, pc_intake.batch_lot_number || null,
         toDateOnlyOrNull(pc_intake.expiry_date), toDateOnlyOrNull(pc_intake.purchase_date),
         pcCategoryTaxonomy?.value || pc_intake.complaint_category || null,
         pcCategoryTaxonomy?.id || null,
         pcCategoryTaxonomy?.label || pcCategoryTaxonomy?.value || null,
         pcCategoryTaxonomy?.effective_from || null,
         pcCategoryTaxonomy?.effective_to || null,
         pc_intake.complaint_description || null,
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
    const {
      reporterSchemaVersion,
      reporterSnapshot,
      patientSchemaVersion,
      patientSnapshot,
    } = await buildReporterPatientSchemaSnapshot(conn, org_id, case_type);
    if (reporterSchemaVersion || patientSchemaVersion) {
      await conn.execute(
        `UPDATE cases
         SET reporter_schema_version = ?, reporter_schema_snapshot = ?,
             patient_schema_version = ?, patient_schema_snapshot = ?
         WHERE id = ?`,
        [
          reporterSchemaVersion || null,
          reporterSnapshot ? JSON.stringify(reporterSnapshot) : null,
          patientSchemaVersion || null,
          patientSnapshot ? JSON.stringify(patientSnapshot) : null,
          caseId,
        ]
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
    emitOutboundEvent(org_id, 'case.created', {
      case_id: caseId,
      case_number: newCase.case_number || null,
      case_type: case_type || null,
      intake_channel,
    }, 'case', String(caseId)).catch(() => {});
    fireWorkflowEvent({
      orgId: org_id,
      eventName: 'case.created',
      entityId: caseId,
      entityData: { ...newCase, severity: newCase.priority || null, case_type: case_type || null },
    }).catch((err) => logger.warn({ err, case_id: caseId }, 'Workflow event hook failed for case.created'));
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
    if (!hasGlobalAdminScope(req.user) && Number(c.org_id) !== Number(req.user.orgId)) {
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
router.post('/cases/:id/reassign', authenticate, requireCapability('case.assign'), async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const reason = String(req.body?.reason || '').trim();
    if (reason.length > 1000) return res.status(400).json({ error: 'reason must be <= 1000 chars.' });

    // Division change-control: require a reason to refer/reassign a case (if enabled).
    const ccRules = await changeControl.getRules(req.user.orgId);
    const ccErr = changeControl.requireReasons(ccRules, reason, [
      { flag: 'cc_reason_refer_case', label: 'referring a case' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });

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
    if (hasGlobalAdminScope(req.user)) {
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
    if (hasOwn(body, 'awareness_date') || hasOwn(body, 'learn_of_validity_date') || hasOwn(body, 'follow_up_received_date') || hasOwn(body, 'date_received')) {
      recalculateHaClocks({ orgId: currentCase.org_id, caseId: req.params.id }).catch(() => {});
    }
    return res.json(updated);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id/reassign', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to reassign case');
    return res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE CASE — F-15 Case Information Section ─────────────────────────────

// PUT /api/cases/:id — update case info fields (also handles auto-save)
router.put('/cases/:id', authenticate, validate(schemas.updateCase), async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    const [[currentCase]] = await pool.execute(
      `SELECT id, org_id, site_id, status_id, case_owner_id, case_number, priority, date_received,
              awareness_date, learn_of_validity_date, follow_up_received_date, case_type,
              description, internal_notes, intake_channel, version_stamp
       FROM cases
       WHERE id = ? AND is_deleted = 0
       LIMIT 1`,
      [req.params.id]
    );
    if (!currentCase) return res.status(404).json({ error: 'Case not found' });

    const body = req.body || {};
    if (body.expected_version_stamp !== undefined && Number(body.expected_version_stamp) !== Number(currentCase.version_stamp || 0)) {
      return res.status(409).json({
        error: 'Case was updated by another user.',
        code: 'VERSION_CONFLICT',
        current_version_stamp: currentCase.version_stamp,
      });
    }

    // Division change-control: reason-required guards (all default OFF per org).
    const ccRules = await changeControl.getRules(currentCase.org_id);
    const ccErr = changeControl.requireReasons(ccRules, body.reason, [
      { flag: 'cc_reason_change_case', label: 'any change to a case record' },
      { flag: 'cc_reason_change_date_received', when: hasOwn(body, 'date_received'), label: 'a change to date received' },
      { flag: 'cc_reason_change_first_response', when: hasOwn(body, 'response_date'), label: 'a change to first response date' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });

    let nextStatusId = currentCase.status_id;
    let statusTransitionRule = null;
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
        const [ruleRows] = await pool.execute(
          `SELECT id, require_password, require_comment
           FROM workflow_rules
           WHERE is_active = 1
             AND from_state_id = ?
             AND to_state_id = ?
             AND (site_id IS NULL OR site_id = ?)
           ORDER BY CASE WHEN site_id = ? THEN 0 ELSE 1 END, id
           LIMIT 1`,
          [currentCase.status_id, nextStatusId, currentCase.site_id || null, currentCase.site_id || null]
        );
        statusTransitionRule = ruleRows?.[0] || null;
        if (Number(statusTransitionRule?.require_password || 0) === 1) {
          const password = String(body.password || '');
          const reason = String(body.reason || '').trim();
          if (!password || !reason) {
            return res.status(400).json({ error: 'password and reason are required for this status transition.' });
          }
          const [[userWithHash]] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.userId]);
          const valid = userWithHash?.password ? await bcrypt.compare(password, userWithHash.password) : false;
          if (!valid) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
        }

        // Division change-control: close-password and reopen-reason rules.
        // "Closed" is detected by workflow state name (matches caseGovernanceService).
        const [[oldState]] = await pool.execute('SELECT name FROM workflow_states WHERE id = ?', [currentCase.status_id]);
        const [[newState]] = await pool.execute('SELECT name FROM workflow_states WHERE id = ?', [nextStatusId]);
        const oldName = oldState?.name || '', newName = newState?.name || '';
        const isClose = newName === 'Closed' && oldName !== 'Closed';
        const isReopen = oldName === 'Closed' && newName !== 'Closed';
        const isAE = currentCase.case_type === 'AE', isPC = currentCase.case_type === 'PC';
        if (isClose) {
          const needPwd = ccRules.cc_password_close_case || (isAE && ccRules.cc_password_close_ae) || (isPC && ccRules.cc_password_close_pc);
          if (needPwd && !(await changeControl.verifyPassword(req.user.userId, body.password))) {
            return res.status(401).json({ error: 'Password (electronic signature) required to close this case.', code: 'PASSWORD_REQUIRED' });
          }
        }
        if (isReopen) {
          const reopenErr = changeControl.requireReasons(ccRules, body.reason, [
            { flag: 'cc_reason_reopen_case', label: 'reopening a case' },
            { flag: 'cc_reason_reopen_ae', when: isAE, label: 'reopening an adverse event' },
            { flag: 'cc_reason_reopen_pc', when: isPC, label: 'reopening a product complaint' },
          ]);
          if (reopenErr) return res.status(reopenErr.status).json({ error: reopenErr.error, code: reopenErr.code });
        }
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
        if (hasGlobalAdminScope(req.user)) {
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
    let nextAwarenessDate = currentCase.awareness_date;
    if (hasOwn(body, 'awareness_date')) {
      if (body.awareness_date === '' || body.awareness_date === null) nextAwarenessDate = null;
      else {
        const normalized = toDateOnlyOrNull(body.awareness_date);
        if (!normalized) return res.status(400).json({ error: 'awareness_date must be a valid date.' });
        nextAwarenessDate = normalized;
      }
    }
    let nextLearnOfValidityDate = currentCase.learn_of_validity_date;
    if (hasOwn(body, 'learn_of_validity_date')) {
      if (body.learn_of_validity_date === '' || body.learn_of_validity_date === null) nextLearnOfValidityDate = null;
      else {
        const normalized = toDateOnlyOrNull(body.learn_of_validity_date);
        if (!normalized) return res.status(400).json({ error: 'learn_of_validity_date must be a valid date.' });
        nextLearnOfValidityDate = normalized;
      }
    }
    let nextFollowUpReceivedDate = currentCase.follow_up_received_date;
    if (hasOwn(body, 'follow_up_received_date')) {
      if (body.follow_up_received_date === '' || body.follow_up_received_date === null) nextFollowUpReceivedDate = null;
      else {
        const normalized = toDateOnlyOrNull(body.follow_up_received_date);
        if (!normalized) return res.status(400).json({ error: 'follow_up_received_date must be a valid date.' });
        nextFollowUpReceivedDate = normalized;
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
        awareness_date = ?,
        learn_of_validity_date = ?,
        follow_up_received_date = ?,
        description    = ?,
        internal_notes = ?,
        intake_channel = ?,
        version_stamp  = version_stamp + 1
       WHERE id = ?`,
      [
        nextStatusId,
        nextOwnerId,
        nextPriority,
        nextDateReceived,
        nextAwarenessDate,
        nextLearnOfValidityDate,
        nextFollowUpReceivedDate,
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
      await writeAuditLog(req.user.userId, req.user.email, 'UPDATE', 'case_status', req.params.id, {
        case_id: Number(req.params.id),
        from_status_id: previousStatusId,
        to_status_id: updatedStatusId,
        workflow_rule_id: statusTransitionRule?.id || null,
        esigned: Number(statusTransitionRule?.require_password || 0) === 1,
      });
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
    if (statusChanged || ownerChanged) {
      emitOutboundEvent(currentCase.org_id, 'case.updated', {
        case_id: Number(req.params.id),
        case_number: updated.case_number || currentCase.case_number || null,
        status_id: updatedStatusId,
        owner_id: updatedOwnerId,
        changed_by: req.user.userId,
      }, 'case', String(req.params.id)).catch(() => {});
      fireWorkflowEvent({
        orgId: currentCase.org_id,
        eventName: statusChanged ? 'case.status_changed' : 'case.updated',
        entityId: Number(req.params.id),
        entityData: { ...updated, severity: updated.priority || null, previous_status_id: previousStatusId, status_id: updatedStatusId },
      }).catch((err) => logger.warn({ err, case_id: req.params.id }, 'Workflow event hook failed for case update'));
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to update case');
    res.status(500).json({ error: err.message });
  }
});

router.post('/cases/:id/validate', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });
    const formData = req.body?.payload || req.body || {};
    const [rules] = await pool.execute(
      `SELECT * FROM case_form_rules
       WHERE org_id = ? AND is_active = 1 AND rule_type IN ('required','validation')
         AND (case_type = ? OR case_type = 'ALL')
       ORDER BY priority DESC, id ASC`,
      [owned.org_id, owned.case_type || 'ALL']
    );
    const errors = [];
    for (const rule of rules) {
      const result = evaluateRule(rule, formData);
      if (rule.rule_type === 'required' && result === true) {
        const value = formData[rule.field_name];
        if (value === undefined || value === null || value === '') {
          errors.push({ field: rule.field_name, section: rule.section_name, message: `${rule.field_name} is required.` });
        }
      }
      if (rule.rule_type === 'validation' && result?.matched) {
        const action = parseStoredJson(rule.action_json, {});
        const value = formData[rule.field_name];
        let valid = true;
        if (action.min !== undefined && Number(value) < Number(action.min)) valid = false;
        if (action.max !== undefined && Number(value) > Number(action.max)) valid = false;
        if (action.pattern) {
          try { valid = new RegExp(action.pattern).test(String(value || '')); } catch (_) { valid = false; }
        }
        if (!valid) errors.push({ field: rule.field_name, section: rule.section_name, message: action.message || `${rule.field_name} is invalid.` });
      }
    }
    res.json({ valid: errors.length === 0, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cases/:id/links', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT l.*, c.case_number AS linked_case_number, c.case_type AS linked_case_type
       FROM case_links l
       JOIN cases c ON c.id = l.linked_case_id
       WHERE l.case_id = ?
       ORDER BY l.created_at DESC`,
      [req.params.id]
    );
    res.json({ links: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/links', authenticate, async (req, res) => {
  try {
    const source = await verifyCaseOrg(req.params.id, req);
    const target = await verifyCaseOrg(req.body?.linked_case_id, req);
    if (!source || !target) return res.status(403).json({ error: 'Access denied' });
    const linkType = ['duplicate', 'related', 'follow_up', 'superseded_by'].includes(req.body?.link_type) ? req.body.link_type : 'related';
    const [result] = await pool.execute(
      `INSERT INTO case_links (case_id, linked_case_id, link_type, created_by, notes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
      [req.params.id, req.body.linked_case_id, linkType, req.user.userId, req.body?.notes || null]
    );
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'CASE_LINKED', 'linked_case_id', null, req.body.linked_case_id);
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/cases/:id/links/:linkId', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    await pool.execute('DELETE FROM case_links WHERE id = ? AND case_id = ?', [req.params.linkId, req.params.id]);
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'CASE_LINK_REMOVED', 'case_link_id', req.params.linkId, null);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:id/merge', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const source = await verifyCaseOrg(req.params.id, req);
    const target = await verifyCaseOrg(req.body?.target_case_id, req);
    if (!source || !target) return res.status(403).json({ error: 'Access denied' });
    if (Number(source.id) === Number(target.id)) return res.status(400).json({ error: 'Cannot merge a case into itself.' });
    const choices = req.body?.field_choices && typeof req.body.field_choices === 'object' ? req.body.field_choices : {};
    await conn.beginTransaction();
    const updatable = ['priority', 'description', 'internal_notes', 'intake_channel', 'status_id', 'case_owner_id'];
    const updates = {};
    for (const field of updatable) {
      if (choices[field] === 'source') updates[field] = source[field];
    }
    if (Object.keys(updates).length) {
      const setSql = Object.keys(updates).map((field) => `${field} = ?`).join(', ');
      await conn.execute(`UPDATE cases SET ${setSql}, version_stamp = version_stamp + 1 WHERE id = ?`, [...Object.values(updates), target.id]);
    }
    await conn.execute('UPDATE cases SET merged_into_case_id = ?, version_stamp = version_stamp + 1 WHERE id = ?', [target.id, source.id]);
    await conn.commit();
    await writeCaseAudit(source.id, req.user.userId, req.user.email, 'CASE_MERGED_SOURCE', 'merged_into_case_id', null, target.id);
    await writeCaseAudit(target.id, req.user.userId, req.user.email, 'CASE_MERGED_TARGET', 'merge_choices', null, JSON.stringify(choices));
    res.json({ ok: true, merged_into_case_id: target.id, field_choices: choices });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

// GET /api/cases/:id/mi-response-builder/context — template/document context for MI response builder
router.get('/cases/:id/mi-response-builder/context', authenticate, async (req, res) => {
  try {
    const scopedCase = await getResponseBuilderCase(req, req.params.id);
    if (!scopedCase) return res.status(404).json({ error: 'Case not found.' });
    const miTab = await getResponseBuilderMiTab(req.params.id, req.query.mi_tab_id || null);
    const recipients = await listResponseBuilderRecipients(req.params.id);
    const productId = Number(req.query.product_id || miTab?.product_id || 0) || null;
    let responseGroups = [];
    if (productId) {
      responseGroups = await resolveProductGroups({
        orgId: scopedCase.org_id,
        groupType: 'response',
        targetType: 'cm_template',
        productId,
        country: miTab?.authorization_country || null,
      }).catch(() => []);
    }
    const responseGroupIds = responseGroups.map((group) => Number(group.id)).filter(Boolean);
    const groupSelect = responseGroupIds.length
      ? `EXISTS (SELECT 1 FROM product_group_assignments pga WHERE pga.target_type = 'cm_template' AND pga.target_id = t.id AND pga.group_id IN (${responseGroupIds.map(() => '?').join(',')}))`
      : '0';
    const [templates] = await pool.execute(
      `SELECT t.id, t.type, t.name, t.subject, t.body_html, t.status,
              t.version_major, t.version_minor,
              ${groupSelect} AS product_group_match
         FROM cm_templates t
         LEFT JOIN users u ON u.id = t.created_by
        WHERE t.status = 'Active'
          AND t.type IN ('Response','Email','Acknowledgment','Correspondence')
          AND (? = 1 OR u.org_id = ? OR EXISTS (
            SELECT 1 FROM user_org_access uoa
             WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
          ))
        ORDER BY product_group_match DESC, FIELD(t.type, 'Response','Email','Acknowledgment','Correspondence'), t.name ASC`,
      [...responseGroupIds, hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id, scopedCase.org_id]
    );
    const [documents] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.doc_type, d.response_doc_type, d.status,
              d.language, d.document_category, d.standard_response_text, d.content_html,
              d.send_as_pdf, d.selected_modules
         FROM cm_documents d
         INNER JOIN cm_folders f ON f.id = d.folder_id
        WHERE d.status IN ('Published','Approved')
          AND (? = 1 OR f.org_id = ?)
          AND (d.expiry_date IS NULL OR d.expiry_date >= CURDATE())
        ORDER BY CASE WHEN d.document_category = 'Response Builder' THEN 0 ELSE 1 END, d.name ASC
        LIMIT 200`,
      [hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id]
    );
    const [modules] = await pool.execute(
      `SELECT m.id, m.module_id, m.name, m.module_type, m.status,
              m.language, m.document_category, m.standard_response_text, m.content_html, m.send_as_pdf
         FROM cm_modules m
         INNER JOIN cm_folders f ON f.id = m.folder_id
        WHERE m.status IN ('Published','Approved')
          AND (? = 1 OR f.org_id = ?)
          AND (m.expiry_date IS NULL OR m.expiry_date >= CURDATE())
        ORDER BY CASE WHEN m.document_category = 'Response Builder' THEN 0 ELSE 1 END, m.name ASC
        LIMIT 200`,
      [hasGlobalAdminScope(req.user) ? 1 : 0, scopedCase.org_id]
    );
    const [bundles] = await pool.execute(
      `SELECT * FROM response_template_bundles
        WHERE org_id = ? AND is_active = 1
        ORDER BY language ASC, name ASC`,
      [scopedCase.org_id]
    ).catch(() => [[]]);

    res.json({
      case: scopedCase,
      mi_tab: miTab,
      recipients,
      response_product_groups: responseGroups,
      templates,
      documents: documents.map((doc) => ({ ...doc, selected_modules: parseJsonSafe(doc.selected_modules, []) })),
      modules,
      bundles: bundles.map((bundle) => ({
        ...bundle,
        document_ids: parseJsonSafe(bundle.document_ids, []),
        module_ids: parseJsonSafe(bundle.module_ids, []),
      })),
    });
  } catch (err) {
    logger.error({ err }, 'GET /cases/:id/mi-response-builder/context error');
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/cases/:id/mi-response-builder/preview — render composed response without saving
router.post('/cases/:id/mi-response-builder/preview', authenticate, async (req, res) => {
  try {
    const pkg = await buildResponsePackage(req, req.params.id, req.body || {});
    res.json(pkg);
  } catch (err) {
    logger.error({ err }, 'POST /cases/:id/mi-response-builder/preview error');
    res.status(err.statusCode || 500).json({ error: err.message || 'Server error.' });
  }
});

// GET /api/cases/:id/mi-responses — list response history for a case
router.get('/cases/:id/mi-responses', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT
         r.id,
         r.case_id,
         r.mi_tab_id,
         r.recipient_contact_id,
         r.recipient_name,
         r.recipient_email,
         r.product_id,
         r.template_id,
         r.template_name,
         r.response_text,
         r.response_body_html,
         r.rendered_preview_html,
         r.response_subject,
         r.response_channel AS channel,
         r.response_date AS responded_at,
         r.follow_up_required,
         r.response_status,
         r.supersedes_response_id,
         r.superseded_by_id,
         r.draft_saved_at,
         r.approved_by,
         approver.name AS approved_by_name,
         r.approved_at,
         r.cm_document_id,
         COALESCE(r.cm_document_name, d.name) AS cm_document_name,
         r.selected_documents,
         r.selected_modules,
         r.language,
         r.is_customized,
         r.customization_notes,
         r.sent_at,
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
    const responseStatus = String(req.body?.response_status || 'READY').toUpperCase();
    const validStatuses = ['DRAFT', 'READY'];
    if (!validStatuses.includes(responseStatus)) {
      return res.status(400).json({ error: `response_status must be one of: ${validStatuses.join(', ')}` });
    }
    let responsePackage = null;
    const hasBuilderPayload = req.body?.template_id || req.body?.response_body_html || req.body?.body_html || req.body?.selected_document_ids || req.body?.selected_documents;
    if (hasBuilderPayload) {
      responsePackage = await buildResponsePackage(req, req.params.id, {
        ...req.body,
        body_html: req.body.response_body_html !== undefined ? req.body.response_body_html : req.body.body_html,
      });
    }
    const finalResponseText = responsePackage?.rendered_text || response_text || null;
    const finalResponseHtml = responsePackage?.rendered_body_html || req.body?.response_body_html || null;
    const finalSubject = responsePackage?.rendered_subject || req.body?.response_subject || null;
    if (!finalResponseText && !finalResponseHtml && !cm_document_id) return res.status(400).json({ error: 'response_text, response_body_html, template, or cm_document_id is required.' });

    // Fetch CM doc name if provided
    let cm_document_name = null;
    if (cm_document_id) {
      const [[doc]] = await pool.execute('SELECT name FROM cm_documents WHERE id = ?', [cm_document_id]);
      cm_document_name = doc?.name || null;
    }

    const [result] = await pool.execute(
      `INSERT INTO case_mi_responses
         (case_id, mi_tab_id, recipient_contact_id, recipient_name, recipient_email,
          product_id, template_id, template_name,
          response_text, response_body_html, rendered_preview_html, response_subject,
          response_channel, response_date, follow_up_required, response_status, draft_saved_at,
          approved_by, approved_at, cm_document_id, cm_document_name,
          selected_documents, selected_modules, source_template_snapshot, source_document_snapshot,
          language, is_customized, customization_notes, author_id, author_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        mi_tab_id || responsePackage?.mi_tab?.id || null,
        responsePackage?.recipient?.case_contact_id || req.body?.recipient_contact_id || null,
        responsePackage?.recipient?.name || req.body?.recipient_name || null,
        responsePackage?.recipient?.email || req.body?.recipient_email || null,
        responsePackage?.product?.id || req.body?.product_id || null,
        responsePackage?.template?.id || req.body?.template_id || null,
        responsePackage?.template?.name || req.body?.template_name || null,
        finalResponseText,
        finalResponseHtml,
        responsePackage?.rendered_preview_html || req.body?.rendered_preview_html || null,
        finalSubject,
        channel,
        responseDate,
        follow_up_required ? 1 : 0,
        responseStatus,
        responseStatus === 'DRAFT' ? new Date() : null,
        responseStatus === 'APPROVED' || responseStatus === 'SENT' ? req.user.userId : null,
        responseStatus === 'APPROVED' || responseStatus === 'SENT' ? new Date() : null,
        cm_document_id || null,
        cm_document_name,
        responsePackage ? JSON.stringify(responsePackage.selected_documents || []) : JSON.stringify(req.body?.selected_documents || []),
        responsePackage ? JSON.stringify(responsePackage.selected_modules || []) : JSON.stringify(req.body?.selected_modules || []),
        responsePackage?.source_template_snapshot ? JSON.stringify(responsePackage.source_template_snapshot) : null,
        responsePackage?.source_document_snapshot ? JSON.stringify(responsePackage.source_document_snapshot) : null,
        responsePackage?.language || req.body?.language || 'en',
        responsePackage?.is_customized || req.body?.is_customized ? 1 : 0,
        req.body?.customization_notes || null,
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
    // Division change-control: require a reason for any change to a letter record (if enabled).
    {
      const ccRules = await changeControl.getRules(req.user.orgId);
      const ccErr = changeControl.requireReasons(ccRules, reason, [
        { flag: 'cc_reason_change_letter', label: 'any change to a letter record' },
      ]);
      if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });
    }
    const allowedTransitions = {
      DRAFT: new Set(['READY']),
      READY: new Set(['APPROVED']),
      APPROVED: new Set(['SENT']),
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

    // F7 FIX: set is_finalized=1 when advancing beyond DRAFT (DB-level immutability guard)
    const isFinalized = responseStatus !== 'DRAFT' ? 1 : 0;
    await pool.execute(
      `UPDATE case_mi_responses
       SET response_status = ?,
           is_finalized = CASE WHEN ? != 'DRAFT' THEN 1 ELSE is_finalized END,
           draft_saved_at = CASE WHEN ? = 'DRAFT' THEN NOW() ELSE draft_saved_at END,
           approved_by = CASE WHEN ? IN ('APPROVED', 'SENT') THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? IN ('APPROVED', 'SENT') THEN NOW() ELSE approved_at END,
           sent_at = CASE WHEN ? = 'SENT' THEN NOW() ELSE sent_at END
       WHERE id = ? AND case_id = ?`,
      [responseStatus, responseStatus, responseStatus, responseStatus, req.user.userId, responseStatus, responseStatus, req.params.responseId, req.params.id]
    );
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'MI_RESPONSE_STATUS', 'mi_response_status', existing.response_status, responseStatus);
    await writeAuditLog(req.user.userId, req.user.email, 'UPDATE', 'mi_response_status', req.params.responseId, {
      case_id: Number(req.params.id),
      from_status: existing.response_status,
      to_status: responseStatus,
      reason: reason || null,
      esigned: ['APPROVED', 'SENT'].includes(responseStatus),
    });

    const [[caseRow]] = await pool.execute('SELECT org_id, case_owner_id, case_number FROM cases WHERE id = ?', [req.params.id]);
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

    emitOutboundEvent(caseRow?.org_id || req.user.orgId, 'case.mi_response.status_changed', {
      case_id: Number(req.params.id),
      response_id: Number(req.params.responseId),
      from_status: existing.response_status,
      to_status: responseStatus,
      changed_by: req.user.userId,
    }, 'mi_response', String(req.params.responseId)).catch(() => {});

    // ── S19-P0 / Fix-9: Enqueue MI email via emailWorker (non-blocking) ────────
    // SMTP delivery is fully decoupled from the request path.
    // enqueueMiEmail writes one DB row and returns in < 5ms; the worker sends async.
    if (responseStatus === 'SENT') {
      try {
        const { enqueueMiEmail } = require('../services/emailWorker');

        // 1. Fetch composed response package
        const [[respRow]] = await pool.execute(
          `SELECT response_text, response_body_html, response_subject,
                  recipient_email, recipient_name, selected_documents
             FROM case_mi_responses WHERE id = ?`,
          [req.params.responseId]
        );

        // 2. Resolve recipient — package first, then primary contact fallback
        let recipientEmail = respRow?.recipient_email || '';
        let recipientName  = respRow?.recipient_name  || '';
        if (!recipientEmail) {
          const [[fb]] = await pool.execute(
            `SELECT COALESCE(cc.email, ct.email) AS recipient_email,
                    CONCAT(COALESCE(cc.first_name, ct.first_name, ''), ' ', COALESCE(cc.last_name, ct.last_name, '')) AS recipient_name
               FROM case_contacts cc
               LEFT JOIN contacts ct ON ct.id = cc.contact_id
              WHERE cc.case_id = ? AND cc.email IS NOT NULL AND cc.email != ''
              ORDER BY cc.is_primary DESC, cc.id ASC LIMIT 1`,
            [req.params.id]
          );
          if (fb) { recipientEmail = fb.recipient_email; recipientName = fb.recipient_name; }
        }

        // 3. Resolve outbound SMTP account (site purpose → org fallback)
        const [[siteRow]] = await pool.execute(`SELECT site_id FROM cases WHERE id = ?`, [req.params.id]);
        const siteId = siteRow?.site_id;
        let smtpAccount = null;
        if (siteId) {
          const [[byPurpose]] = await pool.execute(
            `SELECT ea.* FROM site_email_purpose sep
               JOIN email_accounts ea ON ea.id = sep.email_account_id
              WHERE sep.site_id = ? AND sep.purpose = 'response'
                AND ea.is_active = 1 AND ea.smtp_host IS NOT NULL LIMIT 1`,
            [siteId]
          );
          smtpAccount = byPurpose || null;
        }
        if (!smtpAccount) {
          const [[fallback]] = await pool.execute(
            `SELECT * FROM email_accounts
              WHERE is_active = 1 AND smtp_host IS NOT NULL
                AND smtp_port IS NOT NULL AND smtp_username IS NOT NULL LIMIT 1`
          );
          smtpAccount = fallback || null;
        }

        // 4. Enqueue — fire and forget (emailWorker picks up within 15s)
        await enqueueMiEmail({
          orgId:             req.user.orgId,
          caseId:            req.params.id,
          responseId:        req.params.responseId,
          caseNumber:        caseRow?.case_number,
          recipientEmail,
          recipientName,
          responseText:      respRow?.response_text,
          responseBodyHtml:  respRow?.response_body_html,
          responseSubject:   respRow?.response_subject,
          selectedDocuments: parseJsonSafe(respRow?.selected_documents, []),
          smtpAccount,
          enactedByUserId:   req.user.userId,
          enactedByEmail:    req.user.email,
        });
      } catch (enqueueErr) {
        // Non-fatal — SENT is already committed; log failure to enqueue
        logger.error({ err: enqueueErr, case_id: req.params.id, response_id: req.params.responseId }, 'MI email enqueue failed');
        await logResponseError(req.user.orgId, req.params.id, 'EMAIL_ENQUEUE_FAILED', enqueueErr.message,
          { response_id: req.params.responseId, user: req.user.email }
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const row = await getMiResponseRow(req.params.id, req.params.responseId);
    return res.json(row);
  } catch (err) {
    await logResponseError(req.user?.orgId, req.params.id, 'API_ERROR', err.message, { route: 'PATCH mi-response status', user: req.user?.email });
    return res.status(500).json({ error: err.message });
  }
});

// F6+D1 FIX: PATCH /cases/:id/mi-responses/:responseId/discard — VOIDED terminal (DRAFT only)
router.patch('/cases/:id/mi-responses/:responseId/discard', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [[existing]] = await pool.execute(
      `SELECT id, response_status, is_finalized FROM case_mi_responses WHERE id = ? AND case_id = ?`,
      [req.params.responseId, req.params.id]
    );
    if (!existing) return res.status(404).json({ error: 'Response not found.' });
    if (existing.response_status !== 'DRAFT') {
      return res.status(400).json({ error: `Only DRAFT responses can be discarded. Current status: ${existing.response_status}.` });
    }
    // Division change-control: require a reason for any change to a letter record (if enabled).
    {
      const ccRules = await changeControl.getRules(req.user.orgId);
      const ccErr = changeControl.requireReasons(ccRules, req.body?.reason, [
        { flag: 'cc_reason_change_letter', label: 'any change to a letter record' },
      ]);
      if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });
    }
    const reason = String(req.body?.reason || '').trim() || 'Discarded by user';
    await pool.execute(
      `UPDATE case_mi_responses SET response_status = 'VOIDED', voided_at = NOW(), voided_by = ? WHERE id = ? AND case_id = ?`,
      [req.user.userId, req.params.responseId, req.params.id]
    );
    // F8 FIX: audit trail for VOIDED (21 CFR Part 11 — every status change must be recorded)
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'MI_RESPONSE_VOIDED', 'mi_response_status', 'DRAFT', 'VOIDED');
    await writeAuditLog(req.user.userId, req.user.email, 'UPDATE', 'mi_response_status', req.params.responseId, {
      case_id: Number(req.params.id), from_status: 'DRAFT', to_status: 'VOIDED', reason, esigned: false,
    });
    const row = await getMiResponseRow(req.params.id, req.params.responseId);
    return res.json(row);
  } catch (err) { return res.status(500).json({ error: err.message }); }
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
    const productGroup = await resolveTransmissionGroupSnapshot(req.params.id);

    const [result] = await pool.execute(
      `INSERT INTO case_ae_transmissions (case_id, product_group_id, product_group_snapshot, assigned_to, assigned_name, priority, due_date, narrative, status, sla_status, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [req.params.id, productGroup.product_group_id, productGroup.product_group_snapshot, assignedTo, assignee.name, priority, dueDate, narrative || null, slaStatus,
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
      metadata: { case_id: req.params.id, transmission_id: result.insertId, priority, due_date: dueDate, sla_status: slaStatus, product_group_id: productGroup.product_group_id },
      eventKey: 'ae-transmission-created',
    }).catch(() => {});
    emitOutboundEvent(req.user.orgId, 'case.ae_transmission.created', {
      case_id: Number(req.params.id),
      transmission_id: result.insertId,
      assigned_to: assignedTo,
      due_date: dueDate,
      priority,
      product_group_id: productGroup.product_group_id,
    }, 'ae_transmission', String(result.insertId)).catch(() => {});
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
    if (status && ['Accepted', 'Closed'].includes(status)) {
      const password = String(req.body?.password || '');
      const reason = String(req.body?.reason || '').trim();
      if (!password || !reason) {
        return res.status(400).json({ error: 'password and reason are required for electronic signature.' });
      }
      const [[userWithHash]] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.userId]);
      const valid = userWithHash?.password ? await bcrypt.compare(password, userWithHash.password) : false;
      if (!valid) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
      await writeAuditLog(req.user.userId, req.user.email, 'ESIGN', 'ae_transmission', req.params.txId, {
        case_id: Number(req.params.id),
        status,
        reason,
      });
    }
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
    if (nextStatus) {
      emitOutboundEvent(req.user.orgId, 'case.ae_transmission.status_changed', {
        case_id: Number(req.params.id),
        transmission_id: Number(req.params.txId),
        status: nextStatus,
        updated_by: req.user.userId,
      }, 'ae_transmission', String(req.params.txId)).catch(() => {});
    }
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
    const productGroup = await resolveTransmissionGroupSnapshot(req.params.id);

    const [result] = await pool.execute(
      `INSERT INTO case_pc_transmissions (case_id, product_group_id, product_group_snapshot, assigned_to, assigned_name, priority, due_date, resolution_notes, status, sla_status, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [req.params.id, productGroup.product_group_id, productGroup.product_group_snapshot, assignedTo, assignee.name, priority, dueDate, resolution_notes || null, slaStatus,
       req.user.userId, req.user.name || req.user.email]
    );
    const [[c]] = await pool.execute('SELECT case_number FROM cases WHERE id = ?', [req.params.id]);
    await createNotification(assignedTo, {
      category: 'pc_transmission',
      severity: slaStatus === 'at_risk' ? 'warning' : 'info',
      title: `PC Complaint Routed to You — ${c?.case_number || req.params.id}`,
      message: `${req.user.name || 'A user'} routed PC complaint ${c?.case_number || req.params.id} to you for quality investigation. Due: ${dueDate}.`,
      linkUrl: `/cases/${req.params.id}?section=pc`,
      metadata: { case_id: req.params.id, transmission_id: result.insertId, priority, due_date: dueDate, sla_status: slaStatus, product_group_id: productGroup.product_group_id },
      eventKey: 'pc-transmission-created',
    }).catch(() => {});
    emitOutboundEvent(req.user.orgId, 'case.pc_transmission.created', {
      case_id: Number(req.params.id),
      transmission_id: result.insertId,
      assigned_to: assignedTo,
      due_date: dueDate,
      priority,
      product_group_id: productGroup.product_group_id,
    }, 'pc_transmission', String(result.insertId)).catch(() => {});
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
    if (status === 'Closed') {
      const password = String(req.body?.password || '');
      const reason = String(req.body?.reason || '').trim();
      if (!password || !reason) {
        return res.status(400).json({ error: 'password and reason are required for electronic signature.' });
      }
      const [[userWithHash]] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.userId]);
      const valid = userWithHash?.password ? await bcrypt.compare(password, userWithHash.password) : false;
      if (!valid) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
      await writeAuditLog(req.user.userId, req.user.email, 'ESIGN', 'pc_transmission', req.params.txId, {
        case_id: Number(req.params.id),
        status,
        reason,
      });
    }
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
    if (nextStatus) {
      emitOutboundEvent(req.user.orgId, 'case.pc_transmission.status_changed', {
        case_id: Number(req.params.id),
        transmission_id: Number(req.params.txId),
        status: nextStatus,
        updated_by: req.user.userId,
      }, 'pc_transmission', String(req.params.txId)).catch(() => {});
    }
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
         f.sort_order,
         f.is_sensitive,
         f.masking_pattern,
         f.unmask_roles
       FROM case_dynamic_field_values v
       JOIN field_setup f ON f.id = v.field_id
       WHERE v.case_id = ? ORDER BY f.sort_order, f.id`,
      [req.params.id]
    );
    const maskedRows = rows.map((row) => {
      if (!Number(row.is_sensitive || 0)) return row;
      const masked = applySensitiveMask(
        new Map([[`${row.section_label}::${row.field_name}`, {
          masking_pattern: row.masking_pattern || 'partial',
          unmask_roles: row.unmask_roles || DEFAULT_UNMASK_ROLES.join(','),
        }]]),
        req.user?.role,
        row.section_label,
        row.field_name,
        row.value
      );
      return {
        ...row,
        value: masked.value,
        is_masked: masked.masked ? 1 : 0,
      };
    });
    res.json(maskedRows);
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
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });
    const caseId = req.params.id;
    const [[reporter]] = await pool.execute('SELECT * FROM case_reporter WHERE case_id = ?', [caseId]);
    const [[patient]] = await pool.execute('SELECT * FROM case_patient WHERE case_id = ?', [caseId]);
    const [[ae_intake]] = await pool.execute('SELECT * FROM case_ae_intake WHERE case_id = ?', [caseId]);
    const [[pc_intake]] = await pool.execute('SELECT * FROM case_pc_intake WHERE case_id = ?', [caseId]);

    const sensitiveMap = await loadSensitiveFieldConfigMap(owned.org_id);
    const maskByField = (payload, sectionName, mappings) => {
      if (!payload) return payload;
      const next = { ...payload };
      for (const [key, fieldName] of Object.entries(mappings)) {
        if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
        const masked = applySensitiveMask(sensitiveMap, req.user?.role, sectionName, fieldName, next[key]);
        next[key] = masked.value;
      }
      return next;
    };

    const reporterPayload = maskByField(reporter || null, 'Contact / Requestor', {
      first_name: 'First Name',
      last_name: 'Last Name',
      email: 'Email',
      phone: 'Phone',
      reporter_type: 'Reporter Type',
      country: 'Country',
    });
    const patientSection = owned.case_type === 'AE' ? 'AE — Patient Information' : 'PC — Patient Information';
    const patientPayload = maskByField(patient || null, patientSection, {
      initials: 'Patient Initials',
      age: 'Age',
      age_unit: 'Age Unit',
      gender: 'Gender',
      weight_kg: 'Weight (kg)',
    });

    res.json({ reporter: reporterPayload || null, patient: patientPayload || null, ae_intake: ae_intake || null, pc_intake: pc_intake || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/cases/:id/intake — update intake data post-creation
router.put('/cases/:id/intake', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    // Division change-control: require a reason for AE/PC record changes (if enabled).
    const ccRules = await changeControl.getRules(req.user.orgId);
    const ccErr = changeControl.requireReasons(ccRules, req.body?.reason, [
      { flag: 'cc_reason_change_ae', when: !!req.body?.ae_intake, label: 'a change to an adverse event record' },
      { flag: 'cc_reason_change_pc', when: !!req.body?.pc_intake, label: 'a change to a product complaint record' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });

    const { reporter, patient, ae_intake, pc_intake } = req.body;
    const caseId = req.params.id;
    const validationDate = toDateOnlyOrNull(new Date());

    let reporterTypeValue = reporter?.reporter_type || 'HCP';
    let patientGenderValue = patient?.gender || null;
    let patientAgeUnitValue = patient?.age_unit || (patient ? 'years' : null);
    let aeRouteValue = ae_intake?.route_of_admin || null;
    let aeOutcomeValue = ae_intake?.outcome || null;
    let pcCategoryTaxonomy = null;

    if (reporter && reporterTypeValue) {
      const resolved = await assertActivePicklistValue(owned.org_id, 'reporter_type', reporterTypeValue, validationDate, 'Reporter Type');
      reporterTypeValue = resolved?.value || reporterTypeValue;
    }
    if (patient && patientAgeUnitValue) {
      const resolved = await assertActivePicklistValue(owned.org_id, 'age_unit', patientAgeUnitValue, validationDate, 'Age Unit');
      patientAgeUnitValue = resolved?.value || patientAgeUnitValue;
    }
    if (patient && patientGenderValue) {
      const resolved = await assertActivePicklistValue(owned.org_id, 'gender', patientGenderValue, validationDate, 'Gender');
      patientGenderValue = resolved?.value || patientGenderValue;
    }
    if (ae_intake && owned.case_type === 'AE') {
      if (aeRouteValue) {
        const resolved = await assertActivePicklistValue(owned.org_id, 'route_of_admin', aeRouteValue, validationDate, 'AE route_of_admin');
        aeRouteValue = resolved?.value || aeRouteValue;
      }
      if (aeOutcomeValue) {
        const resolved = await assertActivePicklistValue(owned.org_id, 'ae_outcome', aeOutcomeValue, validationDate, 'AE outcome');
        aeOutcomeValue = resolved?.value || aeOutcomeValue;
      }
    }
    if (pc_intake && owned.case_type === 'PC' && pc_intake.complaint_category) {
      pcCategoryTaxonomy = await assertActivePicklistValue(
        owned.org_id,
        'pc_category',
        pc_intake.complaint_category,
        validationDate,
        'PC complaint_category'
      );
    }

    if (reporter) {
      await pool.execute(
        `INSERT INTO case_reporter (case_id, first_name, last_name, email, phone, reporter_type, country, organisation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         first_name=VALUES(first_name), last_name=VALUES(last_name), email=VALUES(email),
         phone=VALUES(phone), reporter_type=VALUES(reporter_type), country=VALUES(country), organisation=VALUES(organisation)`,
        [caseId, reporter.first_name||null, reporter.last_name||null, reporter.email||null,
         reporter.phone||null, reporterTypeValue||'HCP', reporter.country||null, reporter.organisation||null]
      );
    }
    if (patient) {
      await pool.execute(
        `INSERT INTO case_patient (case_id, initials, age, age_unit, gender, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         initials=VALUES(initials), age=VALUES(age), age_unit=VALUES(age_unit), gender=VALUES(gender), weight_kg=VALUES(weight_kg)`,
        [caseId, patient.initials||null, patient.age?Number(patient.age):null, patientAgeUnitValue||'years', patientGenderValue||null, patient.weight_kg?Number(patient.weight_kg):null]
      );
    }
    if (ae_intake && owned.case_type === 'AE') {
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
         aeRouteValue||null, toDateOnlyOrNull(ae_intake.treatment_start_date), toDateOnlyOrNull(ae_intake.treatment_stop_date),
         ae_intake.reaction_description||null, toDateOnlyOrNull(ae_intake.reaction_onset_date), aeOutcomeValue||null,
         ae_intake.is_serious?1:0, ae_intake.is_death?1:0, ae_intake.is_life_threatening?1:0,
         ae_intake.is_hospitalization?1:0, ae_intake.is_prolonged_hospitalization?1:0,
         ae_intake.is_disability?1:0, ae_intake.is_congenital_anomaly?1:0, ae_intake.is_other_medically_important?1:0]
      );
    }
    if (pc_intake && owned.case_type === 'PC') {
      await pool.execute(
        `INSERT INTO case_pc_intake (case_id, product_name, batch_lot_number, expiry_date, purchase_date,
           complaint_category, complaint_taxonomy_id, complaint_taxonomy_label, complaint_taxonomy_effective_from, complaint_taxonomy_effective_to,
           complaint_description, sample_available, sample_return_requested)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
         product_name=VALUES(product_name), batch_lot_number=VALUES(batch_lot_number), expiry_date=VALUES(expiry_date),
         purchase_date=VALUES(purchase_date), complaint_category=VALUES(complaint_category),
         complaint_taxonomy_id=VALUES(complaint_taxonomy_id), complaint_taxonomy_label=VALUES(complaint_taxonomy_label),
         complaint_taxonomy_effective_from=VALUES(complaint_taxonomy_effective_from), complaint_taxonomy_effective_to=VALUES(complaint_taxonomy_effective_to),
         complaint_description=VALUES(complaint_description), sample_available=VALUES(sample_available),
         sample_return_requested=VALUES(sample_return_requested)`,
        [caseId, pc_intake.product_name||null, pc_intake.batch_lot_number||null,
         toDateOnlyOrNull(pc_intake.expiry_date), toDateOnlyOrNull(pc_intake.purchase_date),
         pcCategoryTaxonomy?.value || pc_intake.complaint_category || null,
         pcCategoryTaxonomy?.id || null,
         pcCategoryTaxonomy?.label || pcCategoryTaxonomy?.value || null,
         pcCategoryTaxonomy?.effective_from || null,
         pcCategoryTaxonomy?.effective_to || null,
         pc_intake.complaint_description||null,
         pc_intake.sample_available?1:0, pc_intake.sample_return_requested?1:0]
      );
    }
    emitOutboundEvent(owned.org_id, 'case.intake.updated', {
      case_id: Number(caseId),
      case_type: owned.case_type || null,
      updated_by: req.user.userId,
    }, 'case', String(caseId)).catch(() => {});
    res.json({ message: 'Intake data updated.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

// DELETE /api/cases/:id — soft delete (admin/platform admin only)
router.delete('/cases/:id', authenticate, requireRole('admin', 'platform_admin'), requireCapability('case.delete'), async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    // Division change-control: require a reason to delete a record / AE case (if enabled).
    const [[delCase]] = await pool.execute('SELECT case_type FROM cases WHERE id = ?', [req.params.id]);
    const ccRules = await changeControl.getRules(req.user.orgId);
    const ccErr = changeControl.requireReasons(ccRules, req.body?.reason, [
      { flag: 'cc_reason_delete_record', label: 'deleting a record' },
      { flag: 'cc_reason_delete_ae', when: delCase?.case_type === 'AE', label: 'deleting an AE case' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });

    await pool.execute('UPDATE cases SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    logger.warn({ case_id: req.params?.id, user_id: req.user?.userId }, 'Case soft deleted');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, route: '/api/cases/:id', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to soft delete case');
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/escalate — manual case escalation (enables cc_reason_escalation)
router.post('/cases/:id/escalate', authenticate, requireCapability('case.escalate'), async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const reason = String(req.body?.reason || '').trim();
    const ccRules = await changeControl.getRules(req.user.orgId);
    const ccErr = changeControl.requireReasons(ccRules, reason, [
      { flag: 'cc_reason_escalation', label: 'escalation' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });
    await pool.execute(
      `UPDATE cases SET escalated_at = NOW(), escalation_level = COALESCE(escalation_level, 0) + 1, escalation_reason = ?
       WHERE id = ? AND is_deleted = 0`,
      [reason || null, req.params.id]
    );
    await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'CASE_ESCALATED', 'escalation', null, reason || 'escalated');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cases/:id/mi-responses/:responseId/supersede — compliant letter "reopen"
// Creates a new amended DRAFT version; the finalized original is preserved intact
// (21 CFR Part 11 immutability). Enables cc_reason_reopen_letter.
router.post('/cases/:id/mi-responses/:responseId/supersede', authenticate, async (req, res) => {
  try {
    if (!(await verifyCaseOrg(req.params.id, req))) return res.status(403).json({ error: 'Access denied' });
    const [[original]] = await pool.execute(
      `SELECT * FROM case_mi_responses WHERE id = ? AND case_id = ?`,
      [req.params.responseId, req.params.id]
    );
    if (!original) return res.status(404).json({ error: 'Response not found.' });
    if (!original.is_finalized) {
      return res.status(400).json({ error: 'Only a finalized letter can be superseded. Edit the draft directly instead.' });
    }
    if (original.superseded_by_id) return res.status(409).json({ error: 'This letter has already been superseded.' });

    const reason = String(req.body?.reason || '').trim();
    const ccRules = await changeControl.getRules(req.user.orgId);
    const ccErr = changeControl.requireReasons(ccRules, reason, [
      { flag: 'cc_reason_reopen_letter', label: 'reopening a letter' },
    ]);
    if (ccErr) return res.status(ccErr.status).json({ error: ccErr.error, code: ccErr.code });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [ins] = await conn.execute(
        `INSERT INTO case_mi_responses
           (case_id, mi_tab_id, response_text, response_channel, response_date, follow_up_required,
            response_status, is_finalized, cm_document_id, cm_document_name, author_id, author_name, supersedes_response_id)
         VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 0, ?, ?, ?, ?, ?)`,
        [original.case_id, original.mi_tab_id, original.response_text, original.response_channel, original.response_date,
         original.follow_up_required, original.cm_document_id, original.cm_document_name,
         req.user.userId, req.user.name || req.user.email || null, original.id]
      );
      await conn.execute(
        `UPDATE case_mi_responses SET superseded_by_id = ?, superseded_at = NOW() WHERE id = ?`,
        [ins.insertId, original.id]
      );
      await conn.commit();
      await writeCaseAudit(req.params.id, req.user.userId, req.user.email, 'MI_RESPONSE_SUPERSEDED', 'mi_response', String(original.id), String(ins.insertId));
      res.status(201).json({ id: ins.insertId, supersedes_response_id: original.id, response_status: 'DRAFT' });
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
