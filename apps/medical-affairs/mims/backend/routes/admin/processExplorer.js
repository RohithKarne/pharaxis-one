'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { getRouteServiceCatalog } = require('../../services/routeCatalogService');
const { emitSuperadminAlert } = require('../../services/alertService');

const FULL_VIEW_HINTS = String(process.env.PROCESS_EXPLORER_FULL_VIEW_EMAILS || 'superadmin,rohith,rohithkarne')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
const TABLE_COLUMNS_CACHE = new Map();
const CATALOG_CACHE_TTL_MS = 60 * 1000;
let mimsCatalogCache = {
  builtAt: 0,
  routeByKey: new Map(),
};

function isFullViewUser(email) {
  const normalized = String(email || '').toLowerCase();
  return FULL_VIEW_HINTS.some(hint => normalized.includes(hint));
}

function maskSensitive(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      const k = key.toLowerCase();
      if (
        k.includes('password') ||
        k.includes('secret') ||
        k.includes('token') ||
        k.includes('otp') ||
        k.includes('code') ||
        k.includes('email') ||
        k.includes('phone')
      ) {
        out[key] = '[MASKED]';
      } else {
        out[key] = maskSensitive(raw);
      }
    }
    return out;
  }
  return value;
}

async function checkOrgFeatureEnabled(orgId) {
  if (!orgId) return false;
  const [[row]] = await pool.execute(
    'SELECT process_explorer_enabled FROM organisations WHERE id = ? LIMIT 1',
    [orgId]
  );
  return !!row?.process_explorer_enabled;
}

async function getExplorerConfig(req, includeSensitive = false) {
  const fullView = isFullViewUser(req.user.email);
  const isSuperadmin = req.user.role === 'superadmin';
  const orgId = req.user.orgId || null;
  const envName = sqlEnvironment();
  const sqlPolicy = buildSqlPolicy(req.user.role, envName);

  if (isSuperadmin) {
    return {
      allowed: true,
      fullView,
      orgId,
      retentionDays: 30,
      defaultRefreshMinutes: 5,
      minRefreshMinutes: 1,
      maxRefreshMinutes: 60,
      includeSensitive,
      sql_policy: sqlPolicy,
    };
  }

  const enabled = await checkOrgFeatureEnabled(orgId);
  return {
    allowed: enabled,
    fullView,
    orgId,
    retentionDays: 30,
    defaultRefreshMinutes: 5,
    minRefreshMinutes: 1,
    maxRefreshMinutes: 60,
    includeSensitive,
    sql_policy: sqlPolicy,
  };
}

function sqlEnvironment() {
  const raw = String(process.env.APP_ENV || process.env.NODE_ENV || 'dev').toLowerCase();
  if (raw.includes('prod')) return 'prod';
  if (raw.includes('qa') || raw.includes('uat') || raw.includes('stage')) return 'qa';
  return 'dev';
}

function buildSqlPolicy(role, envName) {
  const normalizedRole = String(role || '').toLowerCase();
  const isSuperadmin = normalizedRole === 'superadmin';
  const isAdmin = normalizedRole === 'admin';
  const canReadOnly = isSuperadmin || isAdmin;
  const canWriteExecute = isSuperadmin || (isAdmin && envName !== 'prod');

  return {
    role: normalizedRole || 'unknown',
    environment: envName,
    statement_types: ['SELECT', 'INSERT', 'UPDATE'],
    can_execute_select: canReadOnly,
    can_execute_write: canWriteExecute,
    can_dry_run_select: canReadOnly,
    can_dry_run_write: canReadOnly,
    write_execute_confirmation: envName === 'prod' ? 'CONFIRM PROD WRITE' : 'CONFIRM',
    blocked_keywords: ['DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'REPLACE'],
  };
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\u0000/g, '').trim();
}

function stripTrailingSemicolon(sql) {
  return String(sql || '').replace(/;+\s*$/, '');
}

function containsMultipleStatements(sql) {
  const cleaned = stripTrailingSemicolon(
    String(sql || '')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/'([^'\\]|\\.|'')*'|"([^"\\]|\\.)*"/g, '')
      .trim()
  );
  return cleaned.includes(';');
}

function getStatementType(sql) {
  const m = sql.match(/^\s*([a-zA-Z]+)/);
  return m ? m[1].toUpperCase() : '';
}

function hasWhereClause(sql) {
  return /\bwhere\b/i.test(sql);
}

function addSelectSafety(sql, limitRows = 200) {
  const bounded = Math.max(1, Math.min(1000, Number(limitRows) || 200));
  let safe = sql;
  if (!/\blimit\s+\d+\b/i.test(safe)) {
    safe = `${safe} LIMIT ${bounded}`;
  }
  if (!/^\s*select\s+\/\*\+\s*max_execution_time\(\d+\)\s*\*\//i.test(safe)) {
    safe = safe.replace(/^\s*select\s+/i, 'SELECT /*+ MAX_EXECUTION_TIME(5000) */ ');
  }
  return safe;
}

function bindNamedParams(sql, params = {}) {
  const values = [];
  const rewritten = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_all, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing required SQL parameter :${name}`);
    }
    values.push(params[name]);
    return '?';
  });
  return { sql: rewritten, values };
}

function getDatabaseName() {
  return String(process.env.MYSQL_DATABASE || 'pharaxis_mims_dev');
}

function tokenizeSimple(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean);
}

function sqlRiskReport(rawSql, statementType) {
  const sqlText = String(rawSql || '');
  const lowered = sqlText.toLowerCase();
  const issues = [];
  const recommendations = [];
  let riskScore = 0;

  if (statementType === 'UPDATE' && !hasWhereClause(sqlText)) {
    issues.push('UPDATE without WHERE may affect all rows.');
    recommendations.push('Add a WHERE clause with a scoped identifier like org_id and id.');
    riskScore += 70;
  }
  if (statementType === 'SELECT' && !/\blimit\s+\d+\b/i.test(sqlText)) {
    issues.push('SELECT without LIMIT can return a very large result set.');
    recommendations.push('Add LIMIT and filters for safer and faster reads.');
    riskScore += 20;
  }
  if (/\bjoin\b/i.test(sqlText) && !/\bon\b/i.test(sqlText)) {
    issues.push('JOIN detected without ON condition.');
    recommendations.push('Add explicit JOIN ON conditions to avoid Cartesian products.');
    riskScore += 35;
  }
  if (/\bwhere\b/i.test(sqlText) && /(?:1\s*=\s*1|true)/i.test(sqlText)) {
    issues.push('Weak WHERE condition detected.');
    recommendations.push('Use selective predicates (org_id, id, status, dates).');
    riskScore += 15;
  }
  if (/\b(delete|drop|truncate|alter|create|grant|revoke|replace)\b/i.test(sqlText)) {
    issues.push('Blocked or destructive keyword detected.');
    recommendations.push('Use executor-supported statements only (SELECT/INSERT/UPDATE).');
    riskScore += 80;
  }
  if (containsMultipleStatements(sqlText)) {
    issues.push('Multiple statements are not allowed.');
    recommendations.push('Split into separate single-statement executions.');
    riskScore += 40;
  }
  if (/\/\*\+?\s*max_execution_time/i.test(lowered)) {
    recommendations.push('MAX_EXECUTION_TIME hint is already present, good for runtime safety.');
  }

  const band = riskScore >= 70 ? 'high' : riskScore >= 35 ? 'medium' : 'low';
  return { risk_score: Math.min(100, riskScore), risk_band: band, issues, recommendations };
}

function explainSql(rawSql, statementType) {
  const sqlText = String(rawSql || '').replace(/\s+/g, ' ').trim();
  const tableMatch =
    sqlText.match(/\bfrom\s+([a-zA-Z0-9_]+)/i) ||
    sqlText.match(/\binto\s+([a-zA-Z0-9_]+)/i) ||
    sqlText.match(/\bupdate\s+([a-zA-Z0-9_]+)/i);
  const table = tableMatch ? tableMatch[1] : null;
  const where = hasWhereClause(sqlText);
  const limitMatch = sqlText.match(/\blimit\s+(\d+)/i);
  const fieldsMatch = sqlText.match(/^\s*select\s+(.+?)\s+from\s+/i);
  const fields = fieldsMatch ? fieldsMatch[1] : null;

  if (statementType === 'SELECT') {
    return {
      summary: `Reads data${table ? ` from ${table}` : ''}${where ? ' with filters' : ''}.`,
      detail: `This query fetches ${fields || 'selected columns'}${table ? ` from ${table}` : ''}${where ? ', applying WHERE conditions' : ''}${limitMatch ? `, and limits rows to ${limitMatch[1]}` : ''}.`,
    };
  }
  if (statementType === 'INSERT') {
    return {
      summary: `Creates new row(s)${table ? ` in ${table}` : ''}.`,
      detail: `This query inserts new data${table ? ` into ${table}` : ''}. Ensure mandatory fields and org scope are included.`,
    };
  }
  if (statementType === 'UPDATE') {
    return {
      summary: `Modifies existing row(s)${table ? ` in ${table}` : ''}.`,
      detail: `This query updates existing records${table ? ` in ${table}` : ''}${where ? ' using WHERE filters' : ' without WHERE (unsafe)'}.`,
    };
  }
  return {
    summary: 'Unknown statement type.',
    detail: 'Supported statement types are SELECT, INSERT, UPDATE.',
  };
}

function deriveNlSql(prompt = '') {
  const text = String(prompt || '').trim();
  const tokens = tokenizeSimple(text);
  const hasFailed = tokens.includes('failed') || tokens.includes('error');
  const hasToday = tokens.includes('today');
  const hasYesterday = tokens.includes('yesterday');
  const hasWeek = tokens.includes('week') || tokens.includes('weekly');
  const hasCases = tokens.includes('case') || tokens.includes('cases');
  const hasInbox = tokens.includes('inbox') || tokens.includes('inquiries');
  const hasPicklist = tokens.includes('picklist') || tokens.includes('picklists');
  const hasOps = tokens.includes('ops') || tokens.includes('operation') || tokens.includes('rollback') || tokens.includes('retry');
  const hasAudit = tokens.includes('audit') || tokens.includes('history');
  const hasStatus = tokens.includes('status');
  const hasByOrg = tokens.includes('org') || tokens.includes('organization') || tokens.includes('organisation');
  const hasTop = tokens.includes('top');
  const wantsCount = tokens.includes('count') || tokens.includes('how') || tokens.includes('many');
  const hasSlow = tokens.includes('slow') || tokens.includes('latency') || tokens.includes('duration');
  const defaultDateFilter = hasToday
    ? 'DATE(created_at) = DATE(NOW())'
    : hasYesterday
      ? 'DATE(created_at) = DATE(DATE_SUB(NOW(), INTERVAL 1 DAY))'
      : hasWeek
        ? 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
        : 'created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';

  if (hasCases && hasFailed) {
    return {
      sql: `SELECT id, case_number, status, updated_at\nFROM cases\nWHERE status IN ('failed','error')\n  AND ${defaultDateFilter}\nORDER BY updated_at DESC\nLIMIT 100;`,
      rationale: 'Generated from: failed + cases (+ optional today).',
    };
  }
  if (hasInbox && wantsCount) {
    return {
      sql: `SELECT org_id, COUNT(*) AS total_inquiries\nFROM inquiries\nWHERE ${defaultDateFilter}\nGROUP BY org_id\nORDER BY total_inquiries DESC;`,
      rationale: 'Generated from: inbox/inquiries + count intent.',
    };
  }
  if (hasPicklist) {
    return {
      sql: `SELECT id, category, value, is_active, updated_at\nFROM picklists\nORDER BY updated_at DESC\nLIMIT 100;`,
      rationale: 'Generated from: picklist intent.',
    };
  }
  if (hasOps && wantsCount) {
    return {
      sql: `SELECT action_type, status, COUNT(*) AS total\nFROM process_explorer_ops_requests\nWHERE ${defaultDateFilter}\nGROUP BY action_type, status\nORDER BY total DESC;`,
      rationale: 'Generated from safe-ops count intent.',
    };
  }
  if (hasOps) {
    return {
      sql: `SELECT id, action_type, status, route_method, route_path_pattern, created_at\nFROM process_explorer_ops_requests\nWHERE ${defaultDateFilter}\nORDER BY id DESC\nLIMIT 100;`,
      rationale: 'Generated from safe-ops intent.',
    };
  }
  if (hasAudit && hasCases) {
    return {
      sql: `SELECT id, user_name, action, entity, entity_id, created_at\nFROM audit_logs\nWHERE entity IN ('case','cases')\n  AND ${defaultDateFilter}\nORDER BY id DESC\nLIMIT 200;`,
      rationale: 'Generated from case audit/history intent.',
    };
  }
  if (hasSlow) {
    return {
      sql: `SELECT source_module, path_pattern, COUNT(*) AS hits, AVG(duration_ms) AS avg_ms, MAX(duration_ms) AS max_ms\nFROM mims_process_logs\nWHERE duration_ms IS NOT NULL\n  AND ${defaultDateFilter}\nGROUP BY source_module, path_pattern\nORDER BY avg_ms DESC\nLIMIT 50;`,
      rationale: 'Generated from latency/slow request intent.',
    };
  }
  if (hasStatus && hasByOrg) {
    return {
      sql: `SELECT org_id, status_code, COUNT(*) AS total\nFROM mims_process_logs\nWHERE ${defaultDateFilter}\nGROUP BY org_id, status_code\nORDER BY org_id ASC, total DESC;`,
      rationale: 'Generated from status-by-organisation intent.',
    };
  }
  if (hasTop && hasCases && wantsCount) {
    return {
      sql: `SELECT status, COUNT(*) AS total\nFROM cases\nGROUP BY status\nORDER BY total DESC\nLIMIT 10;`,
      rationale: 'Generated from top case status distribution intent.',
    };
  }
  return {
    sql: `SELECT id, source_module, method, path, status_code, created_at\nFROM mims_process_logs\nWHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)\nORDER BY created_at DESC\nLIMIT 100;`,
    rationale: 'Default suggestion when intent is broad/unclear.',
  };
}

function normalizeRoutePath(pathValue = '') {
  return String(pathValue || '')
    .trim()
    .split('?')[0]
    .replace(/\/+/g, '/')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig, ':uuid');
}

function getMimsCatalogIndex({ force = false } = {}) {
  const now = Date.now();
  if (!force && mimsCatalogCache.routeByKey.size > 0 && (now - mimsCatalogCache.builtAt) < CATALOG_CACHE_TTL_MS) {
    return mimsCatalogCache;
  }
  const catalogRows = getRouteServiceCatalog();
  const routeByKey = new Map();
  for (const row of catalogRows) {
    const method = String(row.method || '').toUpperCase();
    const pathPattern = normalizeRoutePath(row.path_pattern || '');
    if (!method || !pathPattern) continue;
    routeByKey.set(`${method} ${pathPattern}`, row);
  }
  mimsCatalogCache = { builtAt: now, routeByKey };
  return mimsCatalogCache;
}

function findCatalogRoute(method, pathPattern) {
  const index = getMimsCatalogIndex();
  return index.routeByKey.get(`${String(method || '').toUpperCase()} ${normalizeRoutePath(pathPattern || '')}`) || null;
}

function isAllowedTelemetryRow(row) {
  const method = String(row?.method || '').toUpperCase();
  const pathPattern = normalizeRoutePath(row?.path_pattern || row?.path || '');
  const sourceModule = String(row?.source_module || '').toLowerCase();
  if (findCatalogRoute(method, pathPattern)) return true;
  if (sourceModule === 'process_explorer_sql' || sourceModule === 'process_explorer_ops') return true;
  if (method === 'JOB' && pathPattern === '/jobs/email-poller') return true;
  if (method === 'SCHEMA' && pathPattern === '/schema/tracker') return true;
  return false;
}

function extractTableNames(sqlText) {
  const out = new Set();
  const text = String(sqlText || '');
  const patterns = [
    /\bfrom\s+([a-zA-Z0-9_]+)/gi,
    /\binto\s+([a-zA-Z0-9_]+)/gi,
    /\bupdate\s+([a-zA-Z0-9_]+)/gi,
    /\bjoin\s+([a-zA-Z0-9_]+)/gi,
    /\bdelete\s+from\s+([a-zA-Z0-9_]+)/gi,
  ];
  for (const rx of patterns) {
    let m;
    while ((m = rx.exec(text)) !== null) {
      const name = String(m[1] || '').trim();
      if (name) out.add(name);
    }
  }
  return Array.from(out);
}

function normalizeOpsAction(action) {
  const value = String(action || '').trim().toLowerCase();
  if (value === 'retry') return 'retry';
  if (value === 'reprocess') return 'reprocess';
  if (value === 'rollback') return 'rollback';
  return '';
}

function opsConfirmationText(envName) {
  return envName === 'prod' ? 'CONFIRM SAFE OPS PROD' : 'CONFIRM SAFE OPS';
}

function normalizeTableNameForSql(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return '';
  if (!/^[a-z0-9_]+$/.test(v)) return '';
  return v;
}

function inferOpsTableCandidates(row = {}) {
  const route = String(row.route_path_pattern || '');
  const parts = route.split('/').filter(Boolean);
  const leaf = parts[parts.length - 1] || '';
  const aliases = {
    orgs: 'organisations',
    org: 'organisations',
    case: 'cases',
    cases: 'cases',
    picklist: 'picklists',
    picklists: 'picklists',
    inquiry: 'inquiries',
    inquiries: 'inquiries',
    'process-logs': 'mims_process_logs',
    process_logs: 'mims_process_logs',
  };
  const out = new Set();
  if (leaf) {
    const normalized = normalizeTableNameForSql(leaf);
    if (normalized) out.add(normalized);
    if (normalized && !normalized.endsWith('s')) out.add(`${normalized}s`);
    if (aliases[leaf.toLowerCase()]) out.add(aliases[leaf.toLowerCase()]);
  }
  if (row.request_payload) {
    try {
      const payload = typeof row.request_payload === 'string' ? JSON.parse(row.request_payload) : row.request_payload;
      if (payload?.target_table) {
        const t = normalizeTableNameForSql(payload.target_table);
        if (t) out.add(t);
      }
      if (payload?.rollback_sql) {
        extractTableNames(payload.rollback_sql).forEach((t) => {
          const safe = normalizeTableNameForSql(t);
          if (safe) out.add(safe);
        });
      }
    } catch (_) {
      // ignore
    }
  }
  return Array.from(out).slice(0, 5);
}

async function captureOpsSnapshots(opsRequestId, tables = [], phase = 'before') {
  const safeTables = tables
    .map(normalizeTableNameForSql)
    .filter(Boolean)
    .slice(0, 5);
  for (const table of safeTables) {
    try {
      const [countRows] = await pool.query(`SELECT COUNT(*) AS c FROM ${table}`);
      const rowCount = Number(countRows?.[0]?.c || 0);
      let sampleRows = [];
      try {
        const [sample] = await pool.query(`SELECT * FROM ${table} ORDER BY 1 DESC LIMIT 5`);
        sampleRows = Array.isArray(sample) ? sample : [];
      } catch (_) {
        sampleRows = [];
      }
      await pool.execute(
        `INSERT INTO process_explorer_ops_snapshots
         (ops_request_id, snapshot_phase, table_name, row_count, sampled_rows_json)
         VALUES (?, ?, ?, ?, ?)`,
        [opsRequestId, phase, table, rowCount, JSON.stringify(sampleRows)]
      );
    } catch (_) {
      // best effort snapshots
    }
  }
}

async function executeOpsAction(row) {
  const action = String(row.action_type || '').toLowerCase();
  const routeMethod = String(row.route_method || 'POST').toUpperCase();
  const routePath = normalizeRoutePath(row.route_path_pattern || '/');
  let payload = {};
  try {
    payload = row.request_payload ? (typeof row.request_payload === 'string' ? JSON.parse(row.request_payload) : row.request_payload) : {};
  } catch (_) {
    payload = {};
  }

  if (action === 'retry' || action === 'reprocess') {
    const numericEntityId = Number(row.entity_id || payload.entity_id || 0);
    let adapter = 'generic_replay';
    let mutated = false;
    let affectedRows = 0;

    if (routePath.includes('/api/admin/picklists') && numericEntityId > 0) {
      adapter = 'picklists_touch';
      const [result] = await pool.execute(
        `UPDATE picklists
         SET updated_at = NOW()
         WHERE id = ?`,
        [numericEntityId]
      );
      affectedRows = Number(result?.affectedRows || 0);
      mutated = affectedRows > 0;
    } else if ((routePath.includes('/api/cases') || routePath.includes('/api/case')) && numericEntityId > 0) {
      adapter = 'cases_touch';
      const [result] = await pool.execute(
        `UPDATE cases
         SET updated_at = NOW()
         WHERE id = ?`,
        [numericEntityId]
      );
      affectedRows = Number(result?.affectedRows || 0);
      mutated = affectedRows > 0;
    } else if (routePath.includes('/api/inbox') && numericEntityId > 0) {
      adapter = 'inquiries_touch';
      const [result] = await pool.execute(
        `UPDATE inquiries
         SET updated_at = NOW()
         WHERE id = ?`,
        [numericEntityId]
      );
      affectedRows = Number(result?.affectedRows || 0);
      mutated = affectedRows > 0;
    }

    await pool.execute(
      `INSERT INTO mims_process_logs
       (org_id, source_module, method, path, path_pattern, status_code, duration_ms, event_type, entity_type, entity_id, summary, request_payload)
       VALUES (?, 'process_explorer_ops', ?, ?, ?, 200, 0, ?, ?, ?, ?, ?)`,
      [
        row.org_id || null,
        routeMethod,
        routePath,
        routePath,
        action === 'retry' ? 'ops_retry_executed' : 'ops_reprocess_executed',
        row.entity_type || 'flow',
        row.entity_id || null,
        `${action} executed for ${routeMethod} ${routePath} via ${adapter}`,
        JSON.stringify({ ops_request_id: row.id, payload, adapter, affected_rows: affectedRows }),
      ]
    );
    return {
      ok: true,
      mode: action,
      mutated,
      affected_rows: affectedRows,
      adapter,
      message: mutated
        ? `${action} executed using ${adapter}.`
        : `${action} executed as replay marker (no direct entity mutation).`,
    };
  }

  if (action === 'rollback') {
    const rollbackSql = normalizeSql(payload.rollback_sql || '');
    const rollbackParams = payload.rollback_params && typeof payload.rollback_params === 'object' ? payload.rollback_params : {};
    if (!rollbackSql) {
      return {
        ok: true,
        mode: 'rollback',
        mutated: false,
        message: 'Rollback approved but no rollback_sql payload was provided; manual DB action required.',
      };
    }
    const statementType = getStatementType(rollbackSql);
    if (statementType !== 'UPDATE') {
      throw new Error('rollback_sql must be an UPDATE statement.');
    }
    if (!hasWhereClause(rollbackSql)) {
      throw new Error('rollback_sql UPDATE must include WHERE clause.');
    }
    if (containsMultipleStatements(rollbackSql)) {
      throw new Error('rollback_sql must be a single statement.');
    }
    if (/\b(delete|drop|truncate|alter|create|grant|revoke|replace)\b/i.test(rollbackSql)) {
      throw new Error('rollback_sql contains blocked keyword.');
    }
    const { sql: finalSql, values } = bindNamedParams(stripTrailingSemicolon(rollbackSql), rollbackParams);
    const [result] = await pool.query({ sql: finalSql, timeout: 10000 }, values);
    await pool.execute(
      `INSERT INTO mims_process_logs
       (org_id, source_module, method, path, path_pattern, status_code, duration_ms, event_type, entity_type, entity_id, summary, request_payload)
       VALUES (?, 'process_explorer_ops', 'SQL', '/api/admin/process-logs/ops/rollback', '/api/admin/process-logs/ops/rollback',
               200, 0, 'ops_rollback_executed', ?, ?, ?, ?)`,
      [
        row.org_id || null,
        row.entity_type || 'flow',
        row.entity_id || null,
        `rollback executed for request ${row.id}`,
        JSON.stringify({
          ops_request_id: row.id,
          rollback_sql_preview: finalSql.slice(0, 400),
          affected_rows: Number(result?.affectedRows || 0),
        }),
      ]
    );
    return {
      ok: true,
      mode: 'rollback',
      mutated: true,
      affected_rows: Number(result?.affectedRows || 0),
      message: 'Rollback SQL executed successfully.',
    };
  }

  throw new Error(`Unsupported safe operation action: ${action}`);
}

async function finalizeOpsExecution(row, actorUserId) {
  const tables = inferOpsTableCandidates(row);
  await captureOpsSnapshots(row.id, tables, 'before');
  const executionResult = await executeOpsAction(row);
  await captureOpsSnapshots(row.id, tables, 'after');
  await pool.execute(
    `UPDATE process_explorer_ops_requests
     SET status = 'executed',
         executed_at = NOW(),
         execution_result = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [JSON.stringify({ ...executionResult, executed_by: actorUserId || null }), row.id]
  );
  if (String(row.action_type || '').toLowerCase() === 'rollback') {
    await emitSuperadminAlert('service_error_threshold', {
      severity: 'high',
      title: 'Safe rollback operation executed',
      message: `Rollback request #${row.id} was executed in Process Explorer.`,
      metadata: {
        requestId: row.id,
        routeMethod: row.route_method,
        routePath: row.route_path_pattern,
        actorUserId,
        executionResult,
      },
      linkUrl: '/process-explorer',
    });
  }
  return executionResult;
}

async function logOpsEvent({
  req,
  statusCode = 200,
  eventType = 'ops_request_created',
  summary = 'Safe operation request created',
  payload = null,
  errorMessage = null,
}) {
  try {
    await pool.execute(
      `INSERT INTO mims_process_logs
       (org_id, source_module, method, path, path_pattern, status_code, duration_ms, event_type, entity_type, entity_id, summary, request_payload, error_message)
       VALUES (?, 'process_explorer_ops', 'POST', '/api/admin/process-logs/ops/request', '/api/admin/process-logs/ops/request',
               ?, 0, ?, 'safe_ops', ?, ?, ?, ?)`,
      [
        req.user.orgId || null,
        statusCode,
        eventType,
        `${req.user.userId || 'user'}:${req.user.role || 'role'}`,
        summary,
        payload ? JSON.stringify(payload) : null,
        errorMessage ? String(errorMessage).slice(0, 255) : null,
      ]
    );
  } catch (_) {
    // best effort
  }
}

async function writeSqlAudit({
  req,
  mode,
  statementType,
  sqlPreview,
  params,
  status,
  rowCount = null,
  affectedRows = null,
  errorMessage = null,
  metadata = null,
}) {
  try {
    await pool.execute(
      `INSERT INTO process_explorer_sql_audit
       (org_id, user_id, user_role, mode, statement_type, sql_preview, params_json, status, row_count, affected_rows, error_message, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId || null,
        req.user.userId || null,
        req.user.role || null,
        String(mode || 'execute'),
        String(statementType || 'UNKNOWN'),
        String(sqlPreview || '').slice(0, 4000),
        JSON.stringify(params || {}),
        String(status || 'success'),
        rowCount == null ? null : Number(rowCount),
        affectedRows == null ? null : Number(affectedRows),
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (_) {
    // SQL audit persistence is best-effort only.
  }
}

async function logSqlExecution({
  req,
  statementType,
  statementPreview,
  statusCode,
  durationMs,
  mode,
  envName,
  errorMessage = null,
}) {
  try {
    await pool.execute(
      `INSERT INTO mims_process_logs
       (org_id, source_module, method, path, path_pattern, status_code, duration_ms, event_type, entity_type, entity_id, summary, request_payload, error_message)
       VALUES (?, 'process_explorer_sql', 'SQL', '/api/admin/process-logs/sql/execute', '/api/admin/process-logs/sql/execute',
               ?, ?, ?, 'sql_statement', ?, ?, ?, ?)`,
      [
        req.user.orgId || null,
        statusCode,
        durationMs,
        mode === 'dry_run' ? 'sql_dry_run' : 'sql_execute',
        statementType || 'UNKNOWN',
        `${req.user.userId || 'user'}:${req.user.role || 'role'}`,
        `${statementType} (${mode}) in ${envName}`,
        JSON.stringify({
          statement_type: statementType,
          sql_preview: statementPreview,
          mode,
          env: envName,
          user_id: req.user.userId,
          role: req.user.role,
        }),
        errorMessage ? String(errorMessage).slice(0, 255) : null,
      ]
    );
  } catch (_) {
    // SQL telemetry logging is best-effort only.
  }
}

// GET /api/admin/process-logs/config
router.get('/config', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req, true);
    return res.json(cfg);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load Process Explorer config.' });
  }
});

// POST /api/admin/process-logs/sql/execute
router.post('/sql/execute', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const started = Date.now();
  const envName = sqlEnvironment();
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) {
      return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    }

    const {
      sql,
      params = {},
      mode = 'execute', // execute | dry_run
      timeout_ms = 5000,
      limit_rows = 200,
      confirmation_text = '',
    } = req.body || {};

    const modeName = String(mode).toLowerCase() === 'dry_run' ? 'dry_run' : 'execute';
    const isDryRun = modeName === 'dry_run';
    const rawSql = normalizeSql(sql);
    if (!rawSql) return res.status(400).json({ error: 'SQL text is required.' });

    if (containsMultipleStatements(rawSql)) {
      return res.status(400).json({ error: 'Only a single SQL statement is allowed per request.' });
    }

    const statementType = getStatementType(rawSql);
    const sqlPolicy = cfg.sql_policy || buildSqlPolicy(req.user.role, envName);

    if (!sqlPolicy.statement_types.includes(statementType)) {
      return res.status(403).json({
        error: `Statement type ${statementType || 'UNKNOWN'} is blocked by SQL policy.`,
      });
    }

    if (/\b(delete|drop|truncate|alter|create|grant|revoke|replace)\b/i.test(rawSql)) {
      return res.status(400).json({
        error: 'Unsafe/DDL statement detected. This executor blocks delete/ddl operations.',
      });
    }

    if (statementType === 'UPDATE' && !hasWhereClause(rawSql)) {
      return res.status(400).json({ error: 'UPDATE without WHERE is blocked by safety guardrails.' });
    }

    if (!isDryRun && statementType === 'SELECT' && !sqlPolicy.can_execute_select) {
      return res.status(403).json({ error: 'Execute SELECT is blocked by role policy.' });
    }

    if (isDryRun && statementType === 'SELECT' && !sqlPolicy.can_dry_run_select) {
      return res.status(403).json({ error: 'Dry-run SELECT is blocked by role policy.' });
    }

    if (!isDryRun && statementType !== 'SELECT' && !sqlPolicy.can_execute_write) {
      return res.status(403).json({ error: 'Write execution is blocked by SQL role/environment policy.' });
    }

    if (isDryRun && statementType !== 'SELECT' && !sqlPolicy.can_dry_run_write) {
      return res.status(403).json({ error: 'Write dry-run is blocked by SQL role policy.' });
    }

    if (!isDryRun && statementType !== 'SELECT') {
      const expected = sqlPolicy.write_execute_confirmation;
      if (String(confirmation_text || '').trim().toUpperCase() !== expected) {
        return res.status(400).json({
          error: `Write execution requires confirmation_text="${expected}".`,
        });
      }
    }

    let statementSql = stripTrailingSemicolon(rawSql);
    if (statementType === 'SELECT') {
      statementSql = addSelectSafety(statementSql, limit_rows);
    }
    const { sql: finalSql, values } = bindNamedParams(statementSql, params || {});
    const queryOptions = { sql: finalSql, timeout: Math.max(1000, Math.min(30000, Number(timeout_ms) || 5000)) };

    if (isDryRun) {
      let explainRows = [];
      try {
        const [rows] = await pool.query({ sql: `EXPLAIN ${finalSql}`, timeout: queryOptions.timeout }, values);
        explainRows = Array.isArray(rows) ? rows : [];
      } catch (_) {
        explainRows = [];
      }

      if (statementType === 'SELECT') {
        const estimatedRows = explainRows.reduce((sum, r) => sum + Number(r.rows || 0), 0);
        const durationMs = Date.now() - started;
        await logSqlExecution({
          req,
          statementType,
          statementPreview: finalSql.slice(0, 500),
          statusCode: 200,
          durationMs,
          mode: 'dry_run',
          envName,
        });
        await writeSqlAudit({
          req,
          mode: 'dry_run',
          statementType,
          sqlPreview: finalSql,
          params,
          status: 'success',
          rowCount: estimatedRows,
          metadata: { env: envName, explain_rows: explainRows.length },
        });
        return res.json({
          ok: true,
          mode: 'dry_run',
          environment: envName,
          sql_policy: sqlPolicy,
          statement_type: statementType,
          explain_rows: explainRows,
          estimated_rows: estimatedRows,
          message: 'Dry run completed successfully for SELECT.',
        });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [result] = await conn.query(queryOptions, values);
        await conn.rollback();
        const durationMs = Date.now() - started;
        await logSqlExecution({
          req,
          statementType,
          statementPreview: finalSql.slice(0, 500),
          statusCode: 200,
          durationMs,
          mode: 'dry_run',
          envName,
        });
        await writeSqlAudit({
          req,
          mode: 'dry_run',
          statementType,
          sqlPreview: finalSql,
          params,
          status: 'success',
          affectedRows: Number(result?.affectedRows || 0),
          metadata: { env: envName, explain_rows: explainRows.length },
        });
        return res.json({
          ok: true,
          mode: 'dry_run',
          environment: envName,
          sql_policy: sqlPolicy,
          statement_type: statementType,
          explain_rows: explainRows,
          affected_rows: Number(result?.affectedRows || 0),
          warning: 'Dry run used transaction rollback. No persistent data changes were committed.',
        });
      } finally {
        conn.release();
      }
    }

    const [result] = await pool.query(queryOptions, values);
    const durationMs = Date.now() - started;
    await logSqlExecution({
      req,
      statementType,
      statementPreview: finalSql.slice(0, 500),
      statusCode: 200,
      durationMs,
      mode: 'execute',
      envName,
    });

    if (statementType === 'SELECT') {
      await writeSqlAudit({
        req,
        mode: 'execute',
        statementType,
        sqlPreview: finalSql,
        params,
        status: 'success',
        rowCount: Array.isArray(result) ? result.length : 0,
        metadata: { env: envName },
      });
      return res.json({
        ok: true,
        mode: 'execute',
        environment: envName,
        sql_policy: sqlPolicy,
        statement_type: statementType,
        rows: Array.isArray(result) ? result : [],
        row_count: Array.isArray(result) ? result.length : 0,
      });
    }

    await writeSqlAudit({
      req,
      mode: 'execute',
      statementType,
      sqlPreview: finalSql,
      params,
      status: 'success',
      affectedRows: Number(result?.affectedRows || 0),
      metadata: { env: envName, insert_id: result?.insertId || null },
    });

    return res.json({
      ok: true,
      mode: 'execute',
      environment: envName,
      sql_policy: sqlPolicy,
      statement_type: statementType,
      affected_rows: Number(result?.affectedRows || 0),
      insert_id: result?.insertId || null,
      message: `${statementType} executed successfully.`,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const rawSql = normalizeSql(req.body?.sql || '');
    const statementType = getStatementType(rawSql);
    await logSqlExecution({
      req,
      statementType,
      statementPreview: rawSql.slice(0, 500),
      statusCode: 500,
      durationMs,
      mode: String(req.body?.mode || 'execute').toLowerCase() === 'dry_run' ? 'dry_run' : 'execute',
      envName,
      errorMessage: err?.message || err,
    });
    await writeSqlAudit({
      req,
      mode: String(req.body?.mode || 'execute').toLowerCase() === 'dry_run' ? 'dry_run' : 'execute',
      statementType,
      sqlPreview: rawSql,
      params: req.body?.params || {},
      status: 'failed',
      errorMessage: err?.message || 'SQL execution failed.',
      metadata: { env: envName },
    });
    return res.status(500).json({ error: err?.message || 'SQL execution failed.' });
  }
});

// GET /api/admin/process-logs/sql/schema
router.get('/sql/schema', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });

    const dbName = getDatabaseName();
    const cacheKey = `schema:${dbName}`;
    const cached = TABLE_COLUMNS_CACHE.get(cacheKey);
    const now = Date.now();
    if (cached && (now - cached.createdAt) < 60 * 1000) {
      return res.json({
        ...cached.payload,
        cache: { hit: true, age_ms: now - cached.createdAt },
      });
    }

    const [tables, columns, relationships] = await Promise.all([
      pool.execute(
        `SELECT table_name, table_rows, create_time, update_time
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY table_name ASC`,
        [dbName]
      ).then((r) => r[0] || []),
      pool.execute(
        `SELECT table_name, column_name, data_type, is_nullable, column_key
         FROM information_schema.columns
         WHERE table_schema = ?
         ORDER BY table_name ASC, ordinal_position ASC`,
        [dbName]
      ).then((r) => r[0] || []),
      pool.execute(
        `SELECT kcu.table_name, kcu.column_name, kcu.referenced_table_name, kcu.referenced_column_name
         FROM information_schema.key_column_usage kcu
         WHERE kcu.table_schema = ?
           AND kcu.referenced_table_name IS NOT NULL
         ORDER BY kcu.table_name ASC, kcu.column_name ASC`,
        [dbName]
      ).then((r) => r[0] || []),
    ]);

    const payload = {
      tables,
      columns,
      relationships,
      db_name: dbName,
    };
    TABLE_COLUMNS_CACHE.set(cacheKey, { createdAt: now, payload });

    return res.json({
      ...payload,
      cache: { hit: false, age_ms: 0 },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load SQL schema metadata.' });
  }
});

// GET /api/admin/process-logs/sql/saved
router.get('/sql/saved', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const [rows] = await pool.execute(
      `SELECT id, org_id, created_by_user_id, name, description, category, tags_json, sql_text,
              is_shared, is_active, last_used_at, created_at, updated_at
       FROM process_explorer_saved_queries
       WHERE is_active = 1
         AND org_id = ?
         AND (is_shared = 1 OR created_by_user_id = ?)
       ORDER BY is_shared DESC, updated_at DESC, id DESC
       LIMIT 500`,
      [req.user.orgId || 0, req.user.userId || 0]
    );
    return res.json({
      saved_queries: (rows || []).map((r) => ({
        ...r,
        tags_json: r.tags_json || null,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load saved SQL queries.' });
  }
});

// POST /api/admin/process-logs/sql/saved
router.post('/sql/saved', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const {
      name,
      description = '',
      category = 'general',
      tags = [],
      sql_text = '',
      is_shared = false,
    } = req.body || {};
    const cleanName = String(name || '').trim();
    const cleanSql = normalizeSql(sql_text);
    if (!cleanName) return res.status(400).json({ error: 'name is required.' });
    if (!cleanSql) return res.status(400).json({ error: 'sql_text is required.' });

    const [result] = await pool.execute(
      `INSERT INTO process_explorer_saved_queries
       (org_id, created_by_user_id, name, description, category, tags_json, sql_text, is_shared, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        req.user.orgId || 0,
        req.user.userId || 0,
        cleanName.slice(0, 255),
        String(description || '').slice(0, 500),
        String(category || 'general').slice(0, 100),
        JSON.stringify(Array.isArray(tags) ? tags.slice(0, 20) : []),
        cleanSql,
        is_shared ? 1 : 0,
      ]
    );
    return res.status(201).json({ ok: true, id: result?.insertId || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save SQL query.' });
  }
});

// PUT /api/admin/process-logs/sql/saved/:id
router.put('/sql/saved/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Valid query id is required.' });
    const {
      name,
      description,
      category,
      tags,
      sql_text,
      is_shared,
      is_active,
    } = req.body || {};
    const [[existing]] = await pool.execute(
      `SELECT id, created_by_user_id, org_id, name, description, category, tags_json, sql_text, is_shared, is_active
       FROM process_explorer_saved_queries
       WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Saved query not found.' });
    if ((existing.org_id || 0) !== (req.user.orgId || 0)) return res.status(403).json({ error: 'Cross-org update blocked.' });
    if (String(req.user.role || '').toLowerCase() !== 'superadmin' && Number(existing.created_by_user_id || 0) !== Number(req.user.userId || 0)) {
      return res.status(403).json({ error: 'Only owner or superadmin can update this query.' });
    }

    await pool.execute(
      `UPDATE process_explorer_saved_queries
       SET name = ?, description = ?, category = ?, tags_json = ?, sql_text = ?, is_shared = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        String(name || existing.name || '').trim().slice(0, 255) || `Query ${id}`,
        String(description ?? existing.description ?? '').slice(0, 500),
        String(category || existing.category || 'general').slice(0, 100),
        JSON.stringify(Array.isArray(tags) ? tags.slice(0, 20) : (existing.tags_json || [])),
        normalizeSql(sql_text || existing.sql_text || ''),
        is_shared == null ? Number(existing.is_shared || 0) : (is_shared ? 1 : 0),
        is_active === false ? 0 : 1,
        id,
      ]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update saved query.' });
  }
});

// DELETE /api/admin/process-logs/sql/saved/:id
router.delete('/sql/saved/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Valid query id is required.' });
    const [[existing]] = await pool.execute(
      `SELECT id, created_by_user_id, org_id FROM process_explorer_saved_queries WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing) return res.status(404).json({ error: 'Saved query not found.' });
    if ((existing.org_id || 0) !== (req.user.orgId || 0)) return res.status(403).json({ error: 'Cross-org delete blocked.' });
    if (String(req.user.role || '').toLowerCase() !== 'superadmin' && Number(existing.created_by_user_id || 0) !== Number(req.user.userId || 0)) {
      return res.status(403).json({ error: 'Only owner or superadmin can delete this query.' });
    }

    await pool.execute(
      `UPDATE process_explorer_saved_queries SET is_active = 0, updated_at = NOW() WHERE id = ?`,
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete saved query.' });
  }
});

// POST /api/admin/process-logs/sql/explain
router.post('/sql/explain', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const rawSql = normalizeSql(req.body?.sql || '');
    if (!rawSql) return res.status(400).json({ error: 'SQL text is required.' });
    const statementType = getStatementType(rawSql);
    const explanation = explainSql(rawSql, statementType);
    return res.json({
      statement_type: statementType || 'UNKNOWN',
      ...explanation,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to explain SQL.' });
  }
});

// POST /api/admin/process-logs/sql/validate
router.post('/sql/validate', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const rawSql = normalizeSql(req.body?.sql || '');
    if (!rawSql) return res.status(400).json({ error: 'SQL text is required.' });
    const statementType = getStatementType(rawSql);
    const risk = sqlRiskReport(rawSql, statementType);
    return res.json({
      statement_type: statementType || 'UNKNOWN',
      ...risk,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to validate SQL.' });
  }
});

// GET /api/admin/process-logs/sql/suggest?q=...
router.get('/sql/suggest', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const dbName = getDatabaseName();
    const q = String(req.query.q || '').trim().toLowerCase();
    const like = `%${q}%`;
    const [tables] = await pool.execute(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ?
         AND (? = '' OR table_name LIKE ?)
       ORDER BY table_name ASC
       LIMIT 25`,
      [dbName, q, like]
    );
    const [columns] = await pool.execute(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = ?
         AND (? = '' OR column_name LIKE ? OR table_name LIKE ?)
       ORDER BY table_name ASC, column_name ASC
       LIMIT 50`,
      [dbName, q, like, like]
    );
    return res.json({ tables: tables || [], columns: columns || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load SQL suggestions.' });
  }
});

// GET /api/admin/process-logs/sql/graph
router.get('/sql/graph', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const dbName = getDatabaseName();
    const [relRows] = await pool.execute(
      `SELECT table_name, column_name, referenced_table_name, referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = ?
         AND referenced_table_name IS NOT NULL
       ORDER BY table_name, column_name`,
      [dbName]
    );
    const nodeMap = new Map();
    for (const r of relRows || []) {
      const from = String(r.table_name);
      const to = String(r.referenced_table_name);
      if (!nodeMap.has(from)) nodeMap.set(from, { table_name: from, degree: 0 });
      if (!nodeMap.has(to)) nodeMap.set(to, { table_name: to, degree: 0 });
      nodeMap.get(from).degree += 1;
      nodeMap.get(to).degree += 1;
    }
    const nodes = Array.from(nodeMap.values()).sort((a, b) => b.degree - a.degree || a.table_name.localeCompare(b.table_name));
    const edges = (relRows || []).map((r) => ({
      from_table: r.table_name,
      from_column: r.column_name,
      to_table: r.referenced_table_name,
      to_column: r.referenced_column_name,
    }));
    return res.json({ nodes, edges });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load schema graph.' });
  }
});

// POST /api/admin/process-logs/sql/nl2sql
router.post('/sql/nl2sql', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required.' });
    const generated = deriveNlSql(prompt);
    return res.json({ prompt, ...generated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate SQL from prompt.' });
  }
});

// GET /api/admin/process-logs/sql/audit
router.get('/sql/audit', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const [rows] = await pool.execute(
      `SELECT id, org_id, user_id, user_role, mode, statement_type, sql_preview, status, row_count, affected_rows, error_message, created_at
       FROM process_explorer_sql_audit
       WHERE org_id = ?
       ORDER BY id DESC
       LIMIT ?`,
      [req.user.orgId || 0, limit]
    );
    return res.json({ logs: rows || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load SQL audit logs.' });
  }
});

// POST /api/admin/process-logs/flow-map
router.post('/flow-map', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });

    const inputMethod = String(req.body?.method || 'GET').toUpperCase();
    const inputPath = String(req.body?.path_pattern || req.body?.path || '').trim();
    if (!inputPath) return res.status(400).json({ error: 'path_pattern is required.' });

    const method = inputMethod;
    const pathPattern = normalizeRoutePath(inputPath);
    const dbName = getDatabaseName();
    const catalogRows = getRouteServiceCatalog();
    const catalogEntry = catalogRows.find(
      (r) => String(r.method || '').toUpperCase() === method && String(r.path_pattern || '') === pathPattern
    ) || null;

    const [recentEvents] = await pool.execute(
      `SELECT id, source_module, method, path_pattern, event_type, request_payload, created_at
       FROM mims_process_logs
       WHERE org_id = ?
         AND method = ?
         AND path_pattern = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY id DESC
       LIMIT 200`,
      [req.user.orgId || 0, method, pathPattern]
    );

    const [sqlEvents] = await pool.execute(
      `SELECT id, statement_type, sql_preview, status, created_at
       FROM process_explorer_sql_audit
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY id DESC
       LIMIT 500`,
      [req.user.orgId || 0]
    );

    const [relationships] = await pool.execute(
      `SELECT table_name, column_name, referenced_table_name, referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = ?
         AND referenced_table_name IS NOT NULL`,
      [dbName]
    );

    const [tableStats] = await pool.execute(
      `SELECT table_name, table_rows
       FROM information_schema.tables
       WHERE table_schema = ?`,
      [dbName]
    );
    const tableRowsMap = new Map((tableStats || []).map((t) => [String(t.table_name), Number(t.table_rows || 0)]));

    const eventTableCandidates = new Set();
    for (const ev of recentEvents || []) {
      try {
        const payload = ev.request_payload ? JSON.parse(ev.request_payload) : null;
        const sqlPreview = payload?.sql_preview || payload?.db_query || payload?.query || '';
        extractTableNames(sqlPreview).forEach((t) => eventTableCandidates.add(t));
      } catch (_) {
        // ignore malformed payloads
      }
      const pathParts = String(ev.path_pattern || '').split('/').filter(Boolean);
      const tail = pathParts[pathParts.length - 1];
      if (tail && /^[a-z_]+$/i.test(tail) && !['api', 'admin', 'superadmin'].includes(tail)) {
        eventTableCandidates.add(tail);
      }
    }

    for (const ae of sqlEvents || []) {
      extractTableNames(ae.sql_preview).forEach((t) => eventTableCandidates.add(t));
    }

    if (eventTableCandidates.size === 0) {
      const routeParts = String(pathPattern).split('/').filter(Boolean);
      const leaf = routeParts[routeParts.length - 1];
      if (leaf && /^[a-z_]+$/i.test(leaf)) {
        eventTableCandidates.add(leaf);
        if (!leaf.endsWith('s')) eventTableCandidates.add(`${leaf}s`);
      }
      const aliases = {
        orgs: 'organisations',
        org: 'organisations',
        case: 'cases',
        process_logs: 'mims_process_logs',
        'process-logs': 'mims_process_logs',
      };
      for (const [k, v] of Object.entries(aliases)) {
        if (String(leaf || '').toLowerCase() === k) eventTableCandidates.add(v);
      }
    }

    const mappedTables = Array.from(eventTableCandidates)
      .map((name) => ({
        table_name: name,
        approx_rows: tableRowsMap.get(name) || 0,
      }))
      .sort((a, b) => b.approx_rows - a.approx_rows || a.table_name.localeCompare(b.table_name));

    const relationshipSet = new Set(mappedTables.map((t) => t.table_name));
    const mappedRelationships = (relationships || []).filter((r) => (
      relationshipSet.has(String(r.table_name)) || relationshipSet.has(String(r.referenced_table_name))
    ));

    const serviceStages = [
      { key: 'frontend', label: 'Frontend', status: 'mapped' },
      { key: 'auth', label: 'Auth Middleware', status: 'mapped' },
      { key: 'backend', label: 'Route Handler', status: catalogEntry?.route_file ? 'mapped' : 'derived' },
      { key: 'database', label: 'Database', status: mappedTables.length > 0 ? 'mapped' : 'pending' },
    ];

    return res.json({
      route: {
        method,
        path_pattern: pathPattern,
        source_module: catalogEntry?.source_module || null,
        route_file: catalogEntry?.route_file || null,
      },
      telemetry: {
        events_30d: (recentEvents || []).length,
        sql_audit_30d: (sqlEvents || []).length,
      },
      mapped_tables: mappedTables.slice(0, 40),
      relationships: mappedRelationships.slice(0, 120),
      service_stages: serviceStages,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to build flow map.' });
  }
});

// GET /api/admin/process-logs/ops/requests
router.get('/ops/requests', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const status = String(req.query.status || 'all').toLowerCase();
    const where = ['org_id = ?'];
    const params = [req.user.orgId || 0];
    if (status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT id, org_id, requested_by_user_id, requested_by_role, action_type, route_method, route_path_pattern,
              entity_type, entity_id, reason, status, approval_required, approved_by_user_id, approved_at,
              rejected_by_user_id, rejected_at, reject_reason, executed_at, created_at, updated_at
       FROM process_explorer_ops_requests
       WHERE ${where.join(' AND ')}
       ORDER BY id DESC
       LIMIT ${limit}`,
      params
    );
    return res.json({ requests: rows || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load safe operation requests.' });
  }
});

// POST /api/admin/process-logs/ops/request
router.post('/ops/request', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });

    const envName = sqlEnvironment();
    const {
      action_type,
      route_method = 'POST',
      route_path_pattern = '',
      entity_type = null,
      entity_id = null,
      reason = '',
      request_payload = {},
      confirmation_text = '',
    } = req.body || {};

    const action = normalizeOpsAction(action_type);
    if (!action) return res.status(400).json({ error: 'action_type must be one of retry, reprocess, rollback.' });
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 10) {
      return res.status(400).json({ error: 'Reason is mandatory and must be at least 10 characters.' });
    }
    const expectedConfirmation = opsConfirmationText(envName);
    if (String(confirmation_text || '').trim().toUpperCase() !== expectedConfirmation) {
      return res.status(400).json({ error: `confirmation_text must be exactly "${expectedConfirmation}".` });
    }

    const requiresApproval = action === 'rollback' || envName === 'prod';
    const [result] = await pool.execute(
      `INSERT INTO process_explorer_ops_requests
       (org_id, requested_by_user_id, requested_by_role, action_type, route_method, route_path_pattern,
        entity_type, entity_id, reason, request_payload, status, approval_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId || 0,
        req.user.userId || 0,
        String(req.user.role || 'admin'),
        action,
        String(route_method || 'POST').toUpperCase(),
        normalizeRoutePath(route_path_pattern || ''),
        entity_type ? String(entity_type).slice(0, 100) : null,
        entity_id ? String(entity_id).slice(0, 255) : null,
        cleanReason.slice(0, 1000),
        JSON.stringify(request_payload || {}),
        requiresApproval ? 'pending_approval_l1' : 'approved',
        requiresApproval ? 1 : 0,
      ]
    );

    if (!requiresApproval) {
      await pool.execute(
        `UPDATE process_explorer_ops_requests
         SET approved_by_user_id = ?, approved_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [req.user.userId || 0, result?.insertId || 0]
      );
      const [[createdRow]] = await pool.execute(
        `SELECT * FROM process_explorer_ops_requests WHERE id = ? LIMIT 1`,
        [result?.insertId || 0]
      );
      if (createdRow) {
        await finalizeOpsExecution(createdRow, req.user.userId || 0);
      }
    }

    await logOpsEvent({
      req,
      statusCode: 201,
      eventType: 'ops_request_created',
      summary: `Safe ops request ${action} created`,
      payload: { request_id: result?.insertId || null, action_type: action, requires_approval: requiresApproval },
    });

    return res.status(201).json({
      ok: true,
      request_id: result?.insertId || null,
      status: requiresApproval ? 'pending_approval_l1' : 'executed',
      approval_required: requiresApproval,
      expected_confirmation_text: expectedConfirmation,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create safe operation request.' });
  }
});

// POST /api/admin/process-logs/ops/requests/:id/approve
router.post('/ops/requests/:id/approve', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Valid request id is required.' });
    const envName = sqlEnvironment();
    const expectedConfirmation = opsConfirmationText(envName);
    const confirmationText = String(req.body?.confirmation_text || '').trim().toUpperCase();
    if (confirmationText !== expectedConfirmation) {
      return res.status(400).json({ error: `confirmation_text must be exactly "${expectedConfirmation}".` });
    }

    const [[row]] = await pool.execute(
      `SELECT * FROM process_explorer_ops_requests WHERE id = ? AND org_id = ? LIMIT 1`,
      [id, req.user.orgId || 0]
    );
    if (!row) return res.status(404).json({ error: 'Request not found.' });
    if (!['pending_approval_l1', 'pending_approval_l2', 'pending', 'pending_approval'].includes(String(row.status || ''))) {
      return res.status(400).json({ error: `Request cannot be approved from status ${row.status}.` });
    }
    const isRollback = String(row.action_type || '').toLowerCase() === 'rollback';
    const needsTwoLevel = isRollback || envName === 'prod';
    const firstApprover = Number(row.approved_by_user_id || 0);

    if (needsTwoLevel && String(row.status || '') === 'pending_approval_l1') {
      await pool.execute(
        `UPDATE process_explorer_ops_requests
         SET status = 'pending_approval_l2',
             approved_by_user_id = ?,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [req.user.userId || 0, id]
      );
      await logOpsEvent({
        req,
        statusCode: 200,
        eventType: 'ops_request_approved_l1',
        summary: `Safe ops request L1 approved: ${row.action_type}`,
        payload: { request_id: id, action_type: row.action_type },
      });
      return res.json({ ok: true, status: 'pending_approval_l2', request_id: id });
    }

    if (needsTwoLevel && String(row.status || '') === 'pending_approval_l2' && firstApprover && firstApprover === Number(req.user.userId || 0)) {
      return res.status(400).json({ error: 'Second-level approval must be done by a different superadmin user.' });
    }

    await pool.execute(
      `UPDATE process_explorer_ops_requests
       SET status = 'approved',
           updated_at = NOW()
       WHERE id = ?`,
      [id]
    );
    const [[approvedRow]] = await pool.execute(
      `SELECT * FROM process_explorer_ops_requests WHERE id = ? LIMIT 1`,
      [id]
    );
    const executionResult = approvedRow
      ? await finalizeOpsExecution(approvedRow, req.user.userId || 0)
      : { ok: false, message: 'Request approved but execution row missing.' };

    await logOpsEvent({
      req,
      statusCode: 200,
      eventType: 'ops_request_approved',
      summary: `Safe ops request approved: ${row.action_type}`,
      payload: { request_id: id, action_type: row.action_type, execution_result: executionResult },
    });

    return res.json({ ok: true, status: 'executed', request_id: id, execution_result: executionResult });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to approve request.' });
  }
});

// POST /api/admin/process-logs/ops/requests/:id/reject
router.post('/ops/requests/:id/reject', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Valid request id is required.' });
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ error: 'Reject reason must be at least 5 characters.' });

    const [[row]] = await pool.execute(
      `SELECT * FROM process_explorer_ops_requests WHERE id = ? AND org_id = ? LIMIT 1`,
      [id, req.user.orgId || 0]
    );
    if (!row) return res.status(404).json({ error: 'Request not found.' });
    if (!['pending_approval_l1', 'pending_approval_l2', 'pending', 'pending_approval'].includes(String(row.status || ''))) {
      return res.status(400).json({ error: `Request cannot be rejected from status ${row.status}.` });
    }

    await pool.execute(
      `UPDATE process_explorer_ops_requests
       SET status = 'rejected',
           rejected_by_user_id = ?,
           rejected_at = NOW(),
           reject_reason = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [req.user.userId || 0, reason.slice(0, 1000), id]
    );

    await logOpsEvent({
      req,
      statusCode: 200,
      eventType: 'ops_request_rejected',
      summary: `Safe ops request rejected: ${row.action_type}`,
      payload: { request_id: id, action_type: row.action_type, reject_reason: reason },
    });
    await emitSuperadminAlert('service_error_threshold', {
      severity: 'medium',
      title: 'Safe operation request rejected',
      message: `Safe operation request #${id} was rejected.`,
      metadata: {
        requestId: id,
        actionType: row.action_type,
        rejectedBy: req.user.email,
        rejectReason: reason,
      },
      linkUrl: '/process-explorer',
    });

    return res.json({ ok: true, status: 'rejected', request_id: id });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject request.' });
  }
});

// GET /api/admin/process-logs/ops/metrics
router.get('/ops/metrics', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const [statusRows] = await pool.execute(
      `SELECT status, COUNT(*) AS total
       FROM process_explorer_ops_requests
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY status`,
      [req.user.orgId || 0]
    );
    const [actionRows] = await pool.execute(
      `SELECT action_type, COUNT(*) AS total
       FROM process_explorer_ops_requests
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY action_type`,
      [req.user.orgId || 0]
    );
    const [executionRows] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS executed,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
       FROM process_explorer_ops_requests
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [req.user.orgId || 0]
    );
    return res.json({
      status_breakdown: statusRows || [],
      action_breakdown: actionRows || [],
      totals: executionRows?.[0] || { total: 0, executed: 0, rejected: 0 },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load safe operation metrics.' });
  }
});

// GET /api/admin/process-logs/ops/analytics
router.get('/ops/analytics', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const [dailyRows] = await pool.execute(
      `SELECT DATE(created_at) AS day,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS executed,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN status LIKE 'pending%' THEN 1 ELSE 0 END) AS pending
       FROM process_explorer_ops_requests
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`,
      [req.user.orgId || 0]
    );
    const [latencyRows] = await pool.execute(
      `SELECT action_type,
              AVG(
                TIMESTAMPDIFF(SECOND, created_at, COALESCE(executed_at, rejected_at, NOW()))
              ) AS avg_resolution_seconds
       FROM process_explorer_ops_requests
       WHERE org_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY action_type
       ORDER BY action_type ASC`,
      [req.user.orgId || 0]
    );
    return res.json({
      daily: dailyRows || [],
      resolution_by_action: latencyRows || [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load safe operation analytics.' });
  }
});

// GET /api/admin/process-logs/ops/requests/:id/snapshots
router.get('/ops/requests/:id/snapshots', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'Valid request id is required.' });
    const [[owner]] = await pool.execute(
      `SELECT id FROM process_explorer_ops_requests WHERE id = ? AND org_id = ? LIMIT 1`,
      [id, req.user.orgId || 0]
    );
    if (!owner) return res.status(404).json({ error: 'Request not found.' });
    const [rows] = await pool.execute(
      `SELECT id, snapshot_phase, table_name, row_count, sampled_rows_json, created_at
       FROM process_explorer_ops_snapshots
       WHERE ops_request_id = ?
       ORDER BY id ASC`,
      [id]
    );
    return res.json({ snapshots: rows || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load snapshots.' });
  }
});

// GET /api/admin/process-logs
router.get('/', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) {
      return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    }

    const {
      module,
      method,
      event_type,
      status,
      range = 'all',
      window_min,
      search,
      limit = 200,
      offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];

    if (!cfg.fullView) {
      conditions.push('org_id = ?');
      params.push(cfg.orgId);
    } else if (req.query.org_id) {
      conditions.push('org_id = ?');
      params.push(Number(req.query.org_id));
    }

    if (module && module !== 'all') { conditions.push('source_module = ?'); params.push(module); }
    if (method && method !== 'all') { conditions.push('method = ?'); params.push(String(method).toUpperCase()); }
    if (event_type && event_type !== 'all') { conditions.push('event_type = ?'); params.push(String(event_type).toLowerCase()); }
    if (search) {
      conditions.push('(path LIKE ? OR path_pattern LIKE ? OR source_module LIKE ? OR summary LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status === 'success') conditions.push('status_code < 400');
    if (status === 'error') conditions.push('status_code >= 400');

    const windowMins = Math.max(1, Math.min(60, parseInt(window_min, 10) || 0));
    if (windowMins > 0) {
      conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)');
      params.push(windowMins);
    }

    if (range === 'today') conditions.push('DATE(created_at) = DATE(NOW())');
    if (range === '7d') conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    if (range === '30d') conditions.push('created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 200));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    const [rows] = await pool.execute(
      `SELECT id, org_id, source_module, method, path, path_pattern, status_code, duration_ms,
              event_type, entity_type, entity_id, summary, request_payload, error_message, created_at
       FROM mims_process_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    const filteredRows = rows.filter((row) => isAllowedTelemetryRow(row));
    const logs = filteredRows.map((row) => {
      let payload = null;
      try {
        payload = row.request_payload ? JSON.parse(row.request_payload) : null;
      } catch (_) {
        payload = row.request_payload || null;
      }
      const route = findCatalogRoute(row.method, row.path_pattern || row.path);

      return {
        ...row,
        path_pattern: normalizeRoutePath(row.path_pattern || row.path || ''),
        route_file: route?.route_file || null,
        request_payload: cfg.fullView ? payload : maskSensitive(payload),
      };
    });

    const moduleCountMap = new Map();
    for (const row of logs) {
      const key = String(row.source_module || 'Core');
      moduleCountMap.set(key, (moduleCountMap.get(key) || 0) + 1);
    }
    const moduleRows = Array.from(moduleCountMap.entries())
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => String(a.module).localeCompare(String(b.module)));

    return res.json({
      logs,
      total: logs.length,
      modules: moduleRows,
      config: cfg,
      fetched_window_min: windowMins > 0 ? windowMins : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load Process Explorer logs.' });
  }
});

// GET /api/admin/process-logs/library
router.get('/library', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) {
      return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    }

    const conditions = [];
    const params = [];
    if (!cfg.fullView) {
      conditions.push('org_id = ?');
      params.push(cfg.orgId);
    } else if (req.query.org_id) {
      conditions.push('org_id = ?');
      params.push(Number(req.query.org_id));
    }
    conditions.push(`event_type IN ('create','update','delete','job_success','job_failed','schema_create_table','schema_add_column','schema_alter_column','schema_drop_column','schema_drop_table')`);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT source_module, method, path_pattern, event_type, entity_type,
              COUNT(*) AS event_count, MAX(created_at) AS last_seen
       FROM mims_process_logs
       ${where}
       GROUP BY source_module, method, path_pattern, event_type, entity_type
       ORDER BY last_seen DESC
       LIMIT 5000`,
      params
    );

    const catalogRows = getRouteServiceCatalog();
    const merged = new Map();

    for (const item of catalogRows) {
      const key = `${item.method} ${item.path_pattern} ${item.event_type}`;
      merged.set(key, {
        source_module: item.source_module,
        method: item.method,
        path_pattern: item.path_pattern,
        event_type: item.event_type,
        entity_type: item.entity_type,
        route_file: item.route_file || null,
        event_count: 0,
        last_seen: null,
        coverage_source: 'catalog',
      });
    }

    for (const row of (rows || [])) {
      if (!isAllowedTelemetryRow(row)) continue;
      const key = `${row.method} ${row.path_pattern} ${row.event_type}`;
      const existing = merged.get(key);
      if (existing) {
        existing.event_count = Number(row.event_count || 0);
        existing.last_seen = row.last_seen || null;
        existing.coverage_source = existing.event_count > 0 ? 'catalog+logs' : 'catalog';
        if (!existing.route_file && row.route_file) existing.route_file = row.route_file;
      } else {
        // Ignore logs-only rows so legacy/non-MIMS noise never appears in Flow Library.
      }
    }

    const flows = Array.from(merged.values()).sort((a, b) => {
      const aCount = Number(a.event_count || 0);
      const bCount = Number(b.event_count || 0);
      if (bCount !== aCount) return bCount - aCount;
      const aSeen = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const bSeen = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      if (bSeen !== aSeen) return bSeen - aSeen;
      const sm = String(a.source_module || '').localeCompare(String(b.source_module || ''));
      if (sm !== 0) return sm;
      const pm = String(a.path_pattern || '').localeCompare(String(b.path_pattern || ''));
      if (pm !== 0) return pm;
      return String(a.method || '').localeCompare(String(b.method || ''));
    });

    return res.json({
      flows,
      config: cfg,
      coverage: {
        catalog_count: catalogRows.length,
        logged_count: (rows || []).length,
        merged_count: flows.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load Flow Library data.' });
  }
});

// POST /api/admin/process-logs/refresh — explicit user-triggered refresh marker
router.post('/refresh', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });
    return res.json({ ok: true, refreshedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: 'Refresh failed.' });
  }
});

// DELETE /api/admin/process-logs/purge?days=30
router.delete('/purge', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const cfg = await getExplorerConfig(req);
    if (!cfg.allowed) return res.status(403).json({ error: 'Process Explorer is disabled for your organisation.' });

    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || cfg.retentionDays || 30));
    const [result] = await pool.execute(
      'DELETE FROM mims_process_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [days]
    );

    return res.json({ ok: true, deleted: result?.affectedRows || 0, days });
  } catch (err) {
    return res.status(500).json({ error: 'Purge failed.' });
  }
});

module.exports = {
  router,
};
