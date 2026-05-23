'use strict';
/**
 * caseHelpers.js — Shared utilities, DB helpers, and domain functions for case management
 *
 * Extracted from routes/cases.js (Architecture Fix A1).
 * All pure utility functions, constants, and shared DB helpers live here.
 * Route handlers remain in routes/cases.js and call these via require.
 *
 * Owned by: Varun (CTO)
 */

const pool               = require('../database/db');
const { logger }         = require('./logger');
const { createNotification } = require('./notificationCenterService');
const { emitDataSync }   = require('./appRealtimeService');
const { fireIntegrationEvent } = require('./integrationEngine');
const { resolveProductGroups } = require('./productGroupService');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const { resolveActivityScope } = require('./accessConfigurationService');

// ── Constants ─────────────────────────────────────────────────────────────────

const CASE_SORT_MAP = Object.freeze({
  created_at:           'c.created_at',
  updated_at:           'c.updated_at',
  case_number:          'c.case_number',
  date_received:        'c.date_received',
  communication_count:  'communication_count',
  last_comm_at:         'comm.last_comm_at',
});

const FORM_RULE_PRECEDENCE   = Object.freeze(['hide', 'disable', 'show', 'require', 'optional']);
const DEFAULT_UNMASK_ROLES   = Object.freeze(['admin', 'platform_admin']);

// ── Pure type utilities ───────────────────────────────────────────────────────

function parseJsonSafe(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function parseStoredJson(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function uniquePositiveInts(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyMergeFields(text, mergeData) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (
    mergeData[key] !== undefined && mergeData[key] !== null ? String(mergeData[key]) : `{{${key}}}`
  ));
}

function toDateOnlyOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const year  = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(dt.getUTCDate()).padStart(2, '0');
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

function parseDateForPicklistFilter(value) {
  const parsed = toDateOnlyOrNull(value);
  if (parsed) return parsed;
  return toDateOnlyOrNull(new Date()) || null;
}

// ── Field override / role / masking helpers ───────────────────────────────────

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function parseRolesCsv(value) {
  const source = String(value || '').trim();
  if (!source) return DEFAULT_UNMASK_ROLES;
  return source.split(',').map((item) => normalizeRole(item)).filter(Boolean);
}

function canViewSensitiveField(role, unmaskRoles, allowUnmask = false) {
  if (allowUnmask) return true;
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;
  return parseRolesCsv(unmaskRoles).includes(normalizedRole);
}

function maskStringValue(value, pattern = 'partial') {
  if (value === null || value === undefined) return value;
  const text = String(value);
  if (!text) return text;
  const mode = String(pattern || 'partial').trim().toLowerCase();
  if (mode === 'full') return '***';
  if (mode === 'last4') {
    if (text.length <= 4) return '*'.repeat(text.length);
    return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
  }
  if (text.length <= 2) return '*'.repeat(text.length);
  return `${text[0]}${'*'.repeat(Math.max(1, text.length - 2))}${text[text.length - 1]}`;
}

function applySensitiveMask(configMap, role, sectionName, fieldName, value, allowUnmask = false) {
  const key = `${sectionName}::${fieldName}`;
  const cfg = configMap.get(key);
  if (!cfg) return { value, masked: false };
  if (canViewSensitiveField(role, cfg.unmask_roles, allowUnmask)) return { value, masked: false };
  return { value: maskStringValue(value, cfg.masking_pattern), masked: true };
}

function normalizeFieldOverrides(value) {
  const parsed = parseStoredJson(value, {});
  const precedence = new Map(FORM_RULE_PRECEDENCE.map((key, index) => [key, index]));

  const normalizeRulesArray = (rules) => {
    if (!Array.isArray(rules)) return rules;
    return [...rules].sort((a, b) => {
      const left  = String(a?.action || a?.effect || '').trim().toLowerCase();
      const right = String(b?.action || b?.effect || '').trim().toLowerCase();
      const leftRank  = precedence.has(left)  ? precedence.get(left)  : 999;
      const rightRank = precedence.has(right) ? precedence.get(right) : 999;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return 0;
    });
  };

  if (Array.isArray(parsed?.rules)) {
    return { ...parsed, rules: normalizeRulesArray(parsed.rules), rule_precedence: FORM_RULE_PRECEDENCE };
  }
  if (Array.isArray(parsed?.conditional_rules)) {
    return { ...parsed, conditional_rules: normalizeRulesArray(parsed.conditional_rules), rule_precedence: FORM_RULE_PRECEDENCE };
  }
  if (parsed && typeof parsed === 'object') {
    const next = { ...parsed, rule_precedence: FORM_RULE_PRECEDENCE };
    for (const key of Object.keys(next)) {
      if (Array.isArray(next[key])) { next[key] = normalizeRulesArray(next[key]); continue; }
      if (next[key] && typeof next[key] === 'object') {
        if (Array.isArray(next[key].rules)) next[key] = { ...next[key], rules: normalizeRulesArray(next[key].rules) };
        if (Array.isArray(next[key].conditional_rules)) {
          next[key] = { ...next[key], conditional_rules: normalizeRulesArray(next[key].conditional_rules) };
        }
      }
    }
    return next;
  }
  return { rule_precedence: FORM_RULE_PRECEDENCE };
}

// ── Transmission priority normalizers ─────────────────────────────────────────

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

// ── Search clause builder ─────────────────────────────────────────────────────

function buildGlobalCaseSearchClause(search, tableAlias = 'c') {
  const q = String(search || '').trim();
  if (!q) return { clause: '', params: [] };
  const like   = `%${q}%`;
  const params = Array(23).fill(like);
  return {
    clause: `
      AND (
        ${tableAlias}.case_number LIKE ?
        OR ${tableAlias}.description LIKE ?
        OR ${tableAlias}.internal_notes LIKE ?
        OR EXISTS (
          SELECT 1 FROM case_contacts cc
          LEFT JOIN contacts ct ON ct.id = cc.contact_id
          WHERE cc.case_id = ${tableAlias}.id
            AND (cc.first_name LIKE ? OR cc.last_name LIKE ? OR cc.email LIKE ?
                 OR cc.institution LIKE ? OR cc.phone LIKE ?
                 OR ct.first_name LIKE ? OR ct.last_name LIKE ? OR ct.email LIKE ?
                 OR ct.institution LIKE ? OR ct.phone LIKE ?)
        )
        OR EXISTS (
          SELECT 1 FROM case_mi mi
          LEFT JOIN products p ON p.id = mi.product_id
          WHERE mi.case_id = ${tableAlias}.id
            AND (p.trade_name LIKE ? OR mi.question_summary LIKE ? OR mi.detailed_question LIKE ?)
        )
        OR EXISTS (
          SELECT 1 FROM case_ae_versions aev
          JOIN case_ae_product_info aepi ON aepi.version_id = aev.id
          WHERE aev.case_id = ${tableAlias}.id AND aepi.product_name LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM case_pc_versions pcv
          JOIN case_pc_product_info pcpi ON pcpi.version_id = pcv.id
          WHERE pcv.case_id = ${tableAlias}.id AND pcpi.product_name LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM case_comments ccm
          WHERE ccm.case_id = ${tableAlias}.id AND ccm.comment LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM inquiries iq
          WHERE iq.case_id = ${tableAlias}.id
            AND (iq.subject LIKE ? OR iq.body LIKE ? OR iq.sender LIKE ? OR iq.recipient LIKE ?)
        )
      )
    `,
    params,
  };
}

// ── DB write helpers (best-effort, never throw) ───────────────────────────────

async function logResponseError(orgId, caseId, errorType, errorMessage, details) {
  try {
    const logId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO response_error_logs (log_id, org_id, case_id, error_type, error_message, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [logId, orgId, caseId || null, errorType, String(errorMessage || '').slice(0, 2000), JSON.stringify(details || {})]
    );
    return logId;
  } catch (_) {}
}

async function writeCaseAudit(caseId, userId, userName, actionType, fieldName, oldValue, newValue) {
  try {
    await pool.execute(
      `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        caseId, userId, userName || null, actionType, fieldName || null,
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

// ── Org isolation ─────────────────────────────────────────────────────────────

function buildCaseOwnershipClause(tableAlias = 'c') {
  return `(${tableAlias}.case_owner_id = ? OR ${tableAlias}.created_by = ?)`;
}

function hasCaseScopeAccess(caseRow, userId, scope) {
  if (scope === 'all') return true;
  if (scope !== 'own') return false;
  return Number(caseRow?.case_owner_id || 0) === Number(userId)
    || Number(caseRow?.created_by || 0) === Number(userId);
}

async function verifyCaseOrg(caseId, req, privilegeKey = 'case.view') {
  const [[c]] = await pool.execute(
    'SELECT id, org_id, site_id, case_type, case_number, case_owner_id, status_id, created_by FROM cases WHERE id = ?',
    [caseId]
  );
  if (!c) return null;
  if (hasGlobalAdminScope(req.user)) return c;
  if (Number(c.org_id) !== Number(req.user.orgId)) return null;
  const scope = req?.activityScope?.[privilegeKey] || await resolveActivityScope(req.user, privilegeKey);
  return hasCaseScopeAccess(c, req.user.userId, scope) ? c : null;
}

// ── Picklist validation ───────────────────────────────────────────────────────

async function findActivePicklistEntry(orgId, fieldType, value, asOfDate) {
  const field     = String(fieldType || '').trim();
  const candidate = String(value || '').trim();
  if (!field || !candidate) return null;
  const scopedDate = parseDateForPicklistFilter(asOfDate);
  const [rows] = await pool.execute(
    `SELECT p.id, p.value, p.effective_from, p.effective_to, p.name AS label
       FROM picklists p
       LEFT JOIN picklist_fields pf ON pf.id = p.field_id
      WHERE p.org_id = ?
        AND p.status = 'Active'
        AND LOWER(TRIM(COALESCE(pf.name, p.field_type, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(p.value, ''))) = LOWER(TRIM(?))
        AND (? IS NULL OR (COALESCE(p.effective_from, '1900-01-01') <= ? AND COALESCE(p.effective_to, '2999-12-31') >= ?))
      ORDER BY p.id DESC LIMIT 1`,
    [orgId, field, candidate, scopedDate, scopedDate, scopedDate]
  );
  return rows?.[0] || null;
}

async function assertActivePicklistValue(orgId, fieldType, value, asOfDate, label) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const row = await findActivePicklistEntry(orgId, fieldType, value, asOfDate);
  if (!row) {
    throw new Error(`${label || fieldType} must be an active governed value.`);
  }
  return row;
}

// ── Schema snapshot builders ──────────────────────────────────────────────────

async function buildReporterPatientSchemaSnapshot(conn, orgId, caseType) {
  if (!orgId || !caseType) {
    return { reporterSchemaVersion: null, reporterSnapshot: null, patientSchemaVersion: null, patientSnapshot: null };
  }
  const [fields] = await conn.execute(
    `SELECT section_name, field_name, field_type, is_required, sort_order, updated_at
       FROM field_setup
      WHERE (org_id = ? OR org_id IS NULL)
        AND section_name IN ('Contact / Requestor', 'AE — Patient Information', 'PC — Patient Information')
        AND is_hidden = 0
      ORDER BY section_name, sort_order, id`,
    [orgId]
  );
  const reporterFields = fields
    .filter((r) => r.section_name === 'Contact / Requestor')
    .map((r) => ({ field_name: r.field_name, field_type: r.field_type, is_required: Number(r.is_required || 0), sort_order: Number(r.sort_order || 0) }));

  const patientSection = caseType === 'AE' ? 'AE — Patient Information' : caseType === 'PC' ? 'PC — Patient Information' : null;
  const patientFields  = patientSection
    ? fields.filter((r) => r.section_name === patientSection)
        .map((r) => ({ field_name: r.field_name, field_type: r.field_type, is_required: Number(r.is_required || 0), sort_order: Number(r.sort_order || 0) }))
    : [];

  const latestMs   = fields.map((r) => { const ms = r?.updated_at ? new Date(r.updated_at).getTime() : 0; return Number.isFinite(ms) ? ms : 0; }).reduce((a, b) => Math.max(a, b), 0);
  const stamp      = latestMs ? new Date(latestMs).toISOString() : 'baseline';

  return {
    reporterSchemaVersion: reporterFields.length ? `reporter-${caseType}-${stamp}-${reporterFields.length}` : null,
    reporterSnapshot:      reporterFields.length ? { section: 'Contact / Requestor', fields: reporterFields } : null,
    patientSchemaVersion:  patientFields.length  ? `patient-${caseType}-${stamp}-${patientFields.length}`  : null,
    patientSnapshot:       patientFields.length  ? { section: patientSection, fields: patientFields }       : null,
  };
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

  const fallbackSections = [...new Set(fields.map((f) => f.section_name))].map((sectionName, index) => ({
    id: index + 1, section_name: sectionName, is_visible: 1, field_overrides: null, updated_at: null,
  }));
  const sectionRows = sections.length > 0 ? sections : fallbackSections;

  const snapshotSections = sectionRows.map((section) => ({
    section_name:    section.section_name,
    is_visible:      Number(section.is_visible || 0),
    field_overrides: parseStoredJson(section.field_overrides, {}),
    fields: fields
      .filter((f) => f.section_name === section.section_name)
      .map((f) => ({
        id: f.id, field_name: f.field_name, field_type: f.field_type,
        is_required: Number(f.is_required || 0), is_hidden: Number(f.is_hidden || 0), is_disabled: Number(f.is_disabled || 0),
        custom_label: f.custom_label || null, help_text: f.help_text || null, picklist_type: f.picklist_type || null,
        lookup_target: f.lookup_target || null, sort_order: Number(f.sort_order || 0),
        max_length: f.max_length || null, default_value: f.default_value || null,
      })),
  }));

  const latestMs  = [...sectionRows, ...fields].map((r) => { const v = r?.updated_at ? new Date(r.updated_at).getTime() : 0; return Number.isFinite(v) ? v : 0; }).reduce((a, b) => Math.max(a, b), 0);
  const latestIso = latestMs ? new Date(latestMs).toISOString() : 'baseline';

  return {
    schemaVersion: `${caseType}-${latestIso}-${fields.length}`,
    snapshot: { case_type: caseType, captured_at: new Date().toISOString(), sections: snapshotSections },
  };
}

// ── Sensitive field config ────────────────────────────────────────────────────

async function loadSensitiveFieldConfigMap(orgId) {
  if (!orgId) return new Map();
  const [rows] = await pool.execute(
    `SELECT section_name, field_name, masking_pattern, unmask_roles
       FROM field_setup
      WHERE (org_id = ? OR org_id IS NULL) AND is_sensitive = 1`,
    [orgId]
  );
  const map = new Map();
  for (const row of rows || []) {
    map.set(`${row.section_name}::${row.field_name}`, {
      masking_pattern: row.masking_pattern || 'partial',
      unmask_roles:    row.unmask_roles || DEFAULT_UNMASK_ROLES.join(','),
    });
  }
  return map;
}

// ── Outbound event emitter ────────────────────────────────────────────────────

async function emitOutboundEvent(orgId, eventType, payload, entityType = null, entityId = null) {
  if (!orgId || !eventType) return;
  emitDataSync({ orgIds: [Number(orgId)], domains: ['cases', 'dashboard', 'alerts'], reason: eventType, payload });

  let logId = null;
  try {
    const [inserted] = await pool.execute(
      `INSERT INTO outbound_event_log (org_id, event_type, entity_type, entity_id, payload_json, status, attempts)
       VALUES (?, ?, ?, ?, ?, 'queued', 0)`,
      [orgId, eventType, entityType || null, entityId || null, JSON.stringify(payload || {})]
    );
    logId = inserted.insertId || null;
  } catch (_) {}

  try {
    const outcomes   = await fireIntegrationEvent(orgId, eventType, payload || {});
    const hasFailures = Array.isArray(outcomes) && outcomes.some((o) => o.status === 'rejected');
    if (logId) {
      await pool.execute(
        `UPDATE outbound_event_log SET status = ?, attempts = attempts + 1, last_attempt_at = NOW(), last_error = ? WHERE id = ?`,
        [hasFailures ? 'failed' : 'sent', hasFailures ? 'One or more integrations rejected the payload.' : null, logId]
      );
    }
  } catch (err) {
    if (logId) {
      await pool.execute(
        `UPDATE outbound_event_log SET status = 'failed', attempts = attempts + 1, last_attempt_at = NOW(), last_error = ? WHERE id = ?`,
        [err?.message || 'Outbound event dispatch failed.', logId]
      );
    }
  }
}

// ── Row fetchers ──────────────────────────────────────────────────────────────

async function getMiResponseRow(caseId, responseId) {
  const [[row]] = await pool.execute(
    `SELECT r.id, r.case_id, r.mi_tab_id, r.recipient_contact_id, r.recipient_name, r.recipient_email,
            r.product_id, r.template_id, r.template_name, r.response_text, r.response_body_html,
            r.rendered_preview_html, r.response_subject, r.response_channel AS channel,
            r.response_date AS responded_at, r.follow_up_required, r.response_status, r.draft_saved_at,
            r.approved_by, approver.name AS approved_by_name, r.approved_at, r.sent_at,
            r.cm_document_id, r.cm_document_name, r.selected_documents, r.selected_modules,
            r.language, r.is_customized, r.customization_notes,
            r.author_id, r.author_name AS responded_by_name, r.created_at
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

async function getCasePrimaryProductContext(caseId) {
  const [[row]] = await pool.execute(
    `SELECT c.product_id AS case_product_id, c.org_id,
            mi.product_id AS mi_product_id,
            ae.product_id AS ae_product_id,
            pc.product_id AS pc_product_id
       FROM cases c
       LEFT JOIN case_mi mi ON mi.case_id = c.id
       LEFT JOIN case_ae_product_info ae ON ae.version_id = (
         SELECT id FROM case_ae_versions WHERE case_id = c.id ORDER BY version_number DESC, id DESC LIMIT 1
       )
       LEFT JOIN case_pc_product_info pc ON pc.version_id = (
         SELECT id FROM case_pc_versions WHERE case_id = c.id ORDER BY version_number DESC, id DESC LIMIT 1
       )
      WHERE c.id = ? LIMIT 1`,
    [caseId]
  );
  if (!row) return { productId: null, orgId: null };
  return {
    productId: row.case_product_id || row.mi_product_id || row.ae_product_id || row.pc_product_id || null,
    orgId:     row.org_id || null,
  };
}

async function resolveTransmissionGroupSnapshot(caseId) {
  const context = await getCasePrimaryProductContext(caseId);
  if (!context.productId) return { product_group_id: null, product_group_snapshot: null };
  const groups = await resolveProductGroups({
    orgId:      context.orgId,
    groupType:  'transmissions',
    targetType: 'transmission_rule',
    productId:  context.productId,
  });
  if (!groups?.length) return { product_group_id: null, product_group_snapshot: null };
  const g = groups[0];
  return {
    product_group_id:       g.id || null,
    product_group_snapshot: JSON.stringify({ id: g.id, name: g.name, rules: g.rules || [] }),
  };
}

module.exports = {
  // Constants
  CASE_SORT_MAP,
  FORM_RULE_PRECEDENCE,
  DEFAULT_UNMASK_ROLES,
  // Pure utilities
  parseJsonSafe,
  parseStoredJson,
  uniquePositiveInts,
  stripHtml,
  applyMergeFields,
  toDateOnlyOrNull,
  isValidDateOnly,
  parseIntSafe,
  clamp,
  hasOwn,
  parseDateForPicklistFilter,
  // Field / role / masking
  normalizeRole,
  parseRolesCsv,
  canViewSensitiveField,
  maskStringValue,
  applySensitiveMask,
  normalizeFieldOverrides,
  // Transmission helpers
  normalizeAeTransmissionPriority,
  normalizePcTransmissionPriority,
  // Search
  buildGlobalCaseSearchClause,
  // DB write helpers
  logResponseError,
  writeCaseAudit,
  writeAuditLog,
  pushNotification,
  // Org isolation
  buildCaseOwnershipClause,
  hasCaseScopeAccess,
  verifyCaseOrg,
  // Picklist
  findActivePicklistEntry,
  assertActivePicklistValue,
  // Schema snapshots
  buildReporterPatientSchemaSnapshot,
  buildCaseSchemaSnapshot,
  // Sensitive fields
  loadSensitiveFieldConfigMap,
  // Events
  emitOutboundEvent,
  // Row fetchers
  getMiResponseRow,
  getAeTransmissionRow,
  getPcTransmissionRow,
  getCasePrimaryProductContext,
  resolveTransmissionGroupSnapshot,
};
