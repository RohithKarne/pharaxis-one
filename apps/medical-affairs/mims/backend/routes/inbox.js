/**
 * routes/inbox.js — Inbox Route
 * Returns real IMAP-ingested inquiries from DB only. No seed/dummy data.
 */

const express = require('express');
const fs = require('fs');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../database/db');
const {
  hydrateInquiryRows,
  getInquiryHistory,
  getInquiryRecommendations,
  toMySqlDateTime,
} = require('../services/inboxGovernanceService');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details || {})]
    );
  } catch (_) {
    // audit is best-effort; do not block inbox updates
  }
}

function buildInboxOrgScope(req, alias = 'i') {
  const params = [];
  let where = '';
  if (req.user.role !== 'superadmin') {
    where = `WHERE ${alias}.org_id = ?`;
    params.push(req.user.orgId);
  }
  return { where, params };
}

function textContains(haystack, needle) {
  const left = String(haystack || '').trim().toLowerCase();
  const right = String(needle || '').trim().toLowerCase();
  if (!right) return true;
  return left.includes(right);
}

async function loadRoutingRulesForOrg(orgId) {
  if (!orgId) return [];
  const [rows] = await pool.execute(
    `SELECT id, org_id, name, priority, is_active, sender_contains, recipient_contains, subject_contains, body_contains,
            queue_name, assign_to_user_id, routing_note
     FROM inbox_routing_rules
     WHERE org_id = ? AND is_active = 1
     ORDER BY priority ASC, id ASC`,
    [orgId]
  );
  return rows || [];
}

function matchRoutingRule(rule, row) {
  if (!rule) return false;
  if (!textContains(row.sender, rule.sender_contains)) return false;
  if (!textContains(row.recipient, rule.recipient_contains)) return false;
  if (!textContains(row.subject, rule.subject_contains)) return false;
  if (!textContains(row.body, rule.body_contains)) return false;
  return true;
}

async function applyRoutingRules(req, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];
  const orgIds = [...new Set(rows.map((row) => Number(row.org_id || 0)).filter(Boolean))];
  if (orgIds.length === 0) return rows;

  const rulesByOrg = new Map();
  for (const orgId of orgIds) {
    rulesByOrg.set(orgId, await loadRoutingRulesForOrg(orgId));
  }

  const userIds = [];
  for (const rules of rulesByOrg.values()) {
    for (const rule of rules) {
      if (rule.assign_to_user_id) userIds.push(Number(rule.assign_to_user_id));
    }
  }
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const usersById = new Map();
  if (uniqueUserIds.length > 0) {
    const placeholders = uniqueUserIds.map(() => '?').join(',');
    const [users] = await pool.execute(
      `SELECT id, name FROM users WHERE id IN (${placeholders})`,
      uniqueUserIds
    );
    for (const user of users || []) usersById.set(Number(user.id), user.name || null);
  }

  const updates = [];
  const nextRows = rows.map((row) => {
    const rules = rulesByOrg.get(Number(row.org_id || 0)) || [];
    const matched = rules.find((rule) => matchRoutingRule(rule, row));
    if (!matched) return row;

    const nextQueue = matched.queue_name || row.queue_name || null;
    const nextAssignee = matched.assign_to_user_id
      ? (usersById.get(Number(matched.assign_to_user_id)) || row.assigned_to || null)
      : (row.assigned_to || null);
    const nextReason = matched.routing_note
      ? String(matched.routing_note)
      : `Auto-routed by rule "${matched.name}"`;

    if (nextQueue !== row.queue_name || nextAssignee !== row.assigned_to || nextReason !== row.routing_reason) {
      updates.push({
        id: row.id,
        queue_name: nextQueue,
        assigned_to: nextAssignee,
        routing_reason: nextReason,
      });
    }

    return {
      ...row,
      queue_name: nextQueue,
      assigned_to: nextAssignee,
      routing_reason: nextReason,
      routing_rule_id: matched.id,
    };
  });

  for (const update of updates) {
    await pool.execute(
      `UPDATE inquiries
       SET queue_name = ?, assigned_to = ?, routing_reason = ?
       WHERE id = ?`,
      [update.queue_name, update.assigned_to, update.routing_reason, update.id]
    );
  }

  return nextRows;
}

async function loadInboxRows(req, limit = 500) {
  const { where, params } = buildInboxOrgScope(req, 'i');
  const [rows] = await pool.execute(`
    SELECT
      i.id,
      i.org_id,
      i.sender,
      i.recipient,
      i.subject,
      i.body,
      i.received_at,
      i.status,
      i.is_locked,
      i.locked_by,
      i.color,
      i.attachments_count,
      i.source_tag,
      i.is_read,
      i.assigned_to,
      i.priority,
      i.due_date,
      i.case_id,
      i.created_at,
      i.triage_state,
      i.queue_name,
      COALESCE(i.mailbox_name, ea.account_name) AS mailbox_name,
      i.snoozed_until,
      i.first_touched_at,
      i.first_response_at,
      i.first_touch_alerted_at,
      i.response_alerted_at,
      i.last_action_at,
      i.closed_at,
      i.routing_reason,
      i.exception_reason
    FROM inquiries i
    LEFT JOIN email_accounts ea ON ea.id = i.email_account_id
    ${where}
    ORDER BY COALESCE(STR_TO_DATE(i.received_at, '%Y-%m-%d %H:%i:%s'), i.created_at) DESC, i.created_at DESC
    LIMIT ${Number(limit) || 500}
  `, params);

  const routed = await applyRoutingRules(req, rows || []);
  return hydrateInquiryRows(routed || []).map((row) => ({
    ...row,
    is_locked: !!row.is_locked,
    is_read: !!row.is_read,
    attachments_count: Number(row.attachments_count || 0),
    source_tag: row.source_tag || 'Email',
    assigned_to: row.assigned_to || null,
    priority: row.priority || null,
    due_date: row.due_date || null,
    case_id: row.case_id || null,
  }));
}

// GET /api/inbox — returns persisted inquiries from DB (real emails only)
router.get('/', authenticate, async (req, res) => {
  try {
    const inquiries = await loadInboxRows(req, 500);
    res.json({ source: 'db', inquiries, total: inquiries.length });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// F1 FIX — GET /api/inbox/summary — SQL COUNT aggregates + 5-min TTL cache (no limit-500 row-fetch)
const _summaryCache = new Map();
const SUMMARY_TTL_MS = 5 * 60 * 1000;

router.get('/summary', authenticate, async (req, res) => {
  const cacheKey = `summary:${req.user.orgId || req.user.userId}`;
  const cached = _summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SUMMARY_TTL_MS) return res.json(cached.data);

  try {
    const { where, params } = buildInboxOrgScope(req, 'i');
    const baseWhere = `${where} AND i.status != 'outbox'`;

    // Aggregate counts — no row fetch, no limit
    const [[agg]] = await pool.execute(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN i.assigned_to IS NULL THEN 1 ELSE 0 END) AS unassigned,
        SUM(CASE WHEN i.snoozed_until IS NOT NULL AND i.snoozed_until > NOW() THEN 1 ELSE 0 END) AS snoozed,
        SUM(CASE WHEN i.exception_reason IS NOT NULL AND i.exception_reason != '' THEN 1 ELSE 0 END) AS exceptions,
        SUM(CASE WHEN i.first_touched_at IS NULL AND i.received_at IS NOT NULL
                      AND TIMESTAMPDIFF(HOUR, COALESCE(STR_TO_DATE(i.received_at,'%Y-%m-%d %H:%i:%s'), i.created_at), NOW()) > 24
                 THEN 1 ELSE 0 END) AS first_touch_breached,
        SUM(CASE WHEN i.first_touched_at IS NOT NULL AND i.first_response_at IS NULL
                      AND TIMESTAMPDIFF(HOUR, COALESCE(STR_TO_DATE(i.received_at,'%Y-%m-%d %H:%i:%s'), i.created_at), NOW()) > 48
                 THEN 1 ELSE 0 END) AS response_breached
      FROM inquiries i
      ${baseWhere}
    `, params);

    // Triage breakdown
    const [triageRows] = await pool.execute(`
      SELECT i.triage_state, COUNT(*) AS cnt FROM inquiries i
      ${baseWhere} GROUP BY i.triage_state
    `, params);

    // Queue breakdown
    const [queueRows] = await pool.execute(`
      SELECT i.queue_name, COUNT(*) AS cnt FROM inquiries i
      ${baseWhere} GROUP BY i.queue_name
    `, params);

    const triage = {};
    triageRows.forEach(r => { if (r.triage_state) triage[r.triage_state] = Number(r.cnt); });
    const queue = {};
    queueRows.forEach(r => { if (r.queue_name) queue[r.queue_name] = Number(r.cnt); });

    const data = {
      total:               Number(agg.total || 0),
      unassigned:          Number(agg.unassigned || 0),
      snoozed:             Number(agg.snoozed || 0),
      exceptions:          Number(agg.exceptions || 0),
      first_touch_breached:Number(agg.first_touch_breached || 0),
      response_breached:   Number(agg.response_breached || 0),
      triage,
      queue,
    };

    _summaryCache.set(cacheKey, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/case/:caseId/correspondence — full case communication timeline
router.get('/case/:caseId/correspondence', authenticate, async (req, res) => {
  try {
    const caseId = Number(req.params.caseId);
    if (!caseId) return res.status(400).json({ error: 'Invalid case id.' });

    const [[caseRow]] = await pool.execute(
      'SELECT id, org_id, case_number, case_type FROM cases WHERE id = ?',
      [caseId]
    );
    if (!caseRow) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role !== 'superadmin' && Number(caseRow.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, sender, recipient, subject, body, received_at, status, source_tag,
              attachments_count, is_read, assigned_to, priority, due_date, original_inquiry_id
       FROM inquiries
       WHERE case_id = ?
       ORDER BY received_at DESC, created_at DESC, id DESC`,
      [caseId]
    );

    res.json({
      case: {
        id: caseRow.id,
        case_number: caseRow.case_number || null,
        case_type: caseRow.case_type || null,
      },
      items: rows || [],
      total: rows.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/users — list active users for assign dropdown (F1)
router.get('/users', authenticate, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'superadmin') {
      [rows] = await pool.execute(
        `SELECT id, name, email, role FROM users WHERE is_active = 1 ORDER BY name ASC`
      );
    } else {
      [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.name, u.email, u.role
         FROM users u
         INNER JOIN user_org_access uoa ON uoa.user_id = u.id
         WHERE u.is_active = 1 AND uoa.org_id = ? AND uoa.is_active = 1
         ORDER BY u.name ASC`,
        [req.user.orgId]
      );
    }
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/inbox/templates — list active reply templates (F3)
router.get('/templates', authenticate, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, subject, body FROM reply_templates WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ templates: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/inbox/templates — create reply template
router.post('/templates', authenticate, async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'name and body are required.' });
    const [result] = await pool.execute(
      `INSERT INTO reply_templates (name, subject, body, created_by) VALUES (?, ?, ?, ?)`,
      [name, subject || null, body, req.user?.userId || null]
    );
    res.json({ id: result.insertId, message: 'Template created.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PATCH /api/inbox/templates/:tid — update reply template
router.patch('/templates/:tid', authenticate, async (req, res) => {
  try {
    const { tid } = req.params;
    const { name, subject, body, is_active } = req.body;
    const updates = [], params = [];
    if (name !== undefined)      { updates.push('name = ?');      params.push(name); }
    if (subject !== undefined)   { updates.push('subject = ?');   params.push(subject); }
    if (body !== undefined)      { updates.push('body = ?');       params.push(body); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(tid);
    await pool.execute(`UPDATE reply_templates SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/inbox/templates/:tid — soft-delete reply template
router.delete('/templates/:tid', authenticate, async (req, res) => {
  try {
    await pool.execute(`UPDATE reply_templates SET is_active = 0 WHERE id = ?`, [req.params.tid]);
    res.json({ message: 'Deleted.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/inbox/fetch — trigger immediate IMAP ingest for all active inbound accounts
router.post('/fetch', authenticate, async (req, res) => {
  try {
    const { ingestAccount } = require('../services/emailPoller');
    const { logService } = require('../services/serviceLogger');
    const [accounts] = await pool.execute(`
      SELECT * FROM email_accounts
      WHERE is_active = 1 AND direction IN ('Inbound', 'Both')
        AND imap_host IS NOT NULL AND imap_port IS NOT NULL
        AND imap_username IS NOT NULL AND imap_password IS NOT NULL
    `);

    let totalIngested = 0;
    for (const account of accounts) {
      const runStartedAt = new Date().toISOString();
      try {
        const sinceDt = account.last_ingest_at
          ? new Date(account.last_ingest_at)
          : new Date(Date.now() - (account.initial_fetch_days || 7) * 24 * 60 * 60 * 1000);
        const n = await ingestAccount(account, sinceDt);
        const runEndedAt = new Date().toISOString();
        const runEndedAtDb = toMySqlDateTime(runEndedAt);
        await pool.execute(
          `UPDATE email_accounts SET last_ingest_at = ? WHERE id = ?`,
          [runEndedAtDb, account.id]
        );
        totalIngested += n;
        logService({
          source: 'Email Accounts',
          service_type: 'IMAP',
          description: `Manual fetch triggered for "${account.account_name}" — ${n} new email${n !== 1 ? 's' : ''} ingested`,
          status: 'success',
          details: {
            task_name: 'Email Import',
            trigger: 'manual',
            account_id: account.id,
            account_name: account.account_name,
            start_at: runStartedAt,
            end_at: runEndedAt,
            total_count: n,
            error_count: 0,
            warning_count: 0,
            current_count: n,
            last_activity_at: runEndedAt,
            last_poll_at: runEndedAt,
          },
        });
      } catch (_) {
        const runEndedAt = new Date().toISOString();
        logService({
          source: 'Email Accounts',
          service_type: 'IMAP',
          description: `Manual fetch failed for "${account.account_name}"`,
          status: 'failed',
          details: {
            task_name: 'Email Import',
            trigger: 'manual',
            account_id: account.id,
            account_name: account.account_name,
            start_at: runStartedAt,
            end_at: runEndedAt,
            total_count: 0,
            error_count: 1,
            warning_count: 0,
            current_count: 0,
            last_activity_at: runEndedAt,
            last_poll_at: runEndedAt,
          },
        });
      }
    }

    res.json({ ingested: totalIngested });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Fetch failed.' });
  }
});

// POST /api/inbox/bulk-update — apply operational updates across multiple inbox items
router.post('/bulk-update', authenticate, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((value) => Number(value)).filter(Boolean) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'ids are required.' });

    const allowedFields = ['status', 'assigned_to', 'priority', 'due_date', 'triage_state', 'queue_name', 'snoozed_until', 'closed_at'];
    const updates = [];
    const params = [];

    for (const key of allowedFields) {
      if (req.body?.[key] === undefined) continue;
      updates.push(`${key} = ?`);
      params.push(req.body[key] || null);
    }

    if (req.body?.first_touched_at !== undefined) {
      updates.push('first_touched_at = ?');
      params.push(req.body.first_touched_at ? toMySqlDateTime(req.body.first_touched_at) : null);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    updates.push('last_action_at = NOW()');

    const { where, params: scopeParams } = buildInboxOrgScope(req, 'inquiries');
    const scopedWhere = where ? `AND ${where.replace('WHERE ', '')}` : '';
    const placeholders = ids.map(() => '?').join(', ');

    await pool.execute(
      `UPDATE inquiries
       SET ${updates.join(', ')}
       WHERE id IN (${placeholders}) ${scopedWhere}`,
      [...params, ...ids, ...scopeParams]
    );

    audit(req.user?.userId || null, req.user?.email || 'unknown', 'BULK_UPDATE', 'inquiry', 0, {
      ids,
      fields: allowedFields.reduce((acc, key) => {
        if (req.body?.[key] !== undefined) acc[key] = req.body[key];
        return acc;
      }, {}),
    });

    res.json({ message: 'Bulk update applied.', updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/routing-rules — configurable auto-routing rules engine
router.get('/routing-rules', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = req.user.role === 'superadmin'
      ? Number(req.query.org_id || req.user.orgId || 0)
      : Number(req.user.orgId || 0);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });

    const [rows] = await pool.execute(
      `SELECT rr.*, u.name AS assign_to_user_name
       FROM inbox_routing_rules rr
       LEFT JOIN users u ON u.id = rr.assign_to_user_id
       WHERE rr.org_id = ?
       ORDER BY rr.priority ASC, rr.id ASC`,
      [orgId]
    );
    res.json({ rules: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/inbox/routing-rules — create routing rule
router.post('/routing-rules', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const orgId = req.user.role === 'superadmin'
      ? Number(req.body?.org_id || req.user.orgId || 0)
      : Number(req.user.orgId || 0);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const name = String(req.body?.name || '').trim();
    const queueName = String(req.body?.queue_name || '').trim();
    if (!name || !queueName) return res.status(400).json({ error: 'name and queue_name are required.' });

    const [result] = await pool.execute(
      `INSERT INTO inbox_routing_rules
         (org_id, name, priority, is_active, sender_contains, recipient_contains, subject_contains, body_contains, queue_name, assign_to_user_id, routing_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        name,
        Number(req.body?.priority || 100),
        req.body?.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0),
        req.body?.sender_contains ? String(req.body.sender_contains).trim() : null,
        req.body?.recipient_contains ? String(req.body.recipient_contains).trim() : null,
        req.body?.subject_contains ? String(req.body.subject_contains).trim() : null,
        req.body?.body_contains ? String(req.body.body_contains).trim() : null,
        queueName,
        req.body?.assign_to_user_id ? Number(req.body.assign_to_user_id) : null,
        req.body?.routing_note ? String(req.body.routing_note).trim() : null,
        req.user.userId || null,
      ]
    );
    res.status(201).json({ id: result.insertId, message: 'Routing rule created.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/inbox/routing-rules/:id — update routing rule
router.put('/routing-rules/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute('SELECT * FROM inbox_routing_rules WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Routing rule not found.' });
    if (req.user.role !== 'superadmin' && Number(existing.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await pool.execute(
      `UPDATE inbox_routing_rules
       SET name = ?, priority = ?, is_active = ?, sender_contains = ?, recipient_contains = ?, subject_contains = ?, body_contains = ?,
           queue_name = ?, assign_to_user_id = ?, routing_note = ?
       WHERE id = ?`,
      [
        req.body?.name ? String(req.body.name).trim() : existing.name,
        req.body?.priority === undefined ? Number(existing.priority || 100) : Number(req.body.priority || 100),
        req.body?.is_active === undefined ? Number(existing.is_active || 0) : (req.body.is_active ? 1 : 0),
        req.body?.sender_contains === undefined ? existing.sender_contains : (req.body.sender_contains ? String(req.body.sender_contains).trim() : null),
        req.body?.recipient_contains === undefined ? existing.recipient_contains : (req.body.recipient_contains ? String(req.body.recipient_contains).trim() : null),
        req.body?.subject_contains === undefined ? existing.subject_contains : (req.body.subject_contains ? String(req.body.subject_contains).trim() : null),
        req.body?.body_contains === undefined ? existing.body_contains : (req.body.body_contains ? String(req.body.body_contains).trim() : null),
        req.body?.queue_name ? String(req.body.queue_name).trim() : existing.queue_name,
        req.body?.assign_to_user_id === undefined ? (existing.assign_to_user_id || null) : (req.body.assign_to_user_id ? Number(req.body.assign_to_user_id) : null),
        req.body?.routing_note === undefined ? existing.routing_note : (req.body.routing_note ? String(req.body.routing_note).trim() : null),
        id,
      ]
    );
    res.json({ message: 'Routing rule updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/inbox/routing-rules/:id — remove routing rule
router.delete('/routing-rules/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute('SELECT id, org_id FROM inbox_routing_rules WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Routing rule not found.' });
    if (req.user.role !== 'superadmin' && Number(existing.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    await pool.execute('DELETE FROM inbox_routing_rules WHERE id = ?', [id]);
    res.json({ message: 'Routing rule deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/:id/history — sender/contact history with linked cases
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const scopedOrgId = req.user.role === 'superadmin' ? null : Number(req.user.orgId);
    const history = await getInquiryHistory(scopedOrgId, Number(req.params.id));
    if (!history) return res.status(404).json({ error: 'Inquiry not found.' });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/:id/recommendations — recommended case linking actions
router.get('/:id/recommendations', authenticate, async (req, res) => {
  try {
    const scopedOrgId = req.user.role === 'superadmin' ? null : Number(req.user.orgId);
    const recommendations = await getInquiryRecommendations(scopedOrgId, Number(req.params.id));
    if (recommendations == null) return res.status(404).json({ error: 'Inquiry not found.' });
    res.json({ recommendations });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/inbox/:id/notes — list internal notes for an inquiry (F5)
router.get('/:id/notes', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, user_name, note, created_at FROM inquiry_notes
       WHERE inquiry_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ notes: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/inbox/:id/notes — add internal note (F5)
router.post('/:id/notes', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'note is required.' });
    const [[inquiry]] = await pool.execute('SELECT id FROM inquiries WHERE id = ?', [id]);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
    let authorName = req.user?.email || 'Unknown';
    if (req.user?.userId) {
      const [[authorRow]] = await pool.execute('SELECT name FROM users WHERE id = ?', [req.user.userId]);
      if (authorRow) authorName = authorRow.name;
    }
    const createdAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await pool.execute(
      `INSERT INTO inquiry_notes (inquiry_id, user_id, user_name, note, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, req.user?.userId || null, authorName, note.trim(), createdAt]
    );
    audit(req.user?.userId || null, req.user?.email || 'unknown', 'NOTE', 'inquiry', Number(id), { note: note.trim() });
    res.json({ message: 'Note added.', note: { user_name: authorName, note: note.trim(), created_at: createdAt } });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/inbox/:id/thread — get reply/forward thread for an inquiry (F12)
router.get('/:id/thread', authenticate, async (req, res) => {
  try {
    const [[baseInquiry]] = await pool.execute(
      `SELECT id, org_id, original_inquiry_id
       FROM inquiries
       WHERE id = ?`,
      [req.params.id]
    );
    if (!baseInquiry) return res.status(404).json({ error: 'Inquiry not found.' });
    if (req.user.role !== 'superadmin' && Number(baseInquiry.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const rootId = Number(baseInquiry.original_inquiry_id || baseInquiry.id);
    const [rows] = await pool.execute(
      `SELECT id, sender, recipient, subject, body, received_at, status, source_tag, original_inquiry_id
       FROM inquiries
       WHERE id = ? OR original_inquiry_id = ?
       ORDER BY COALESCE(STR_TO_DATE(received_at, '%Y-%m-%d %H:%i:%s'), created_at) ASC, id ASC`,
      [rootId, rootId]
    );
    res.json({ root_id: rootId, thread: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/inbox/:id/attachments — list attachments for an inquiry
router.get('/:id/attachments', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, filename, mime_type, size_bytes FROM inquiry_attachments
       WHERE inquiry_id = ? ORDER BY id ASC`,
      [req.params.id]
    );
    res.json({ attachments: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/inbox/attachments/:aid/download — stream attachment file
router.get('/attachments/:aid/download', authenticate, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT filename, mime_type, storage_path FROM inquiry_attachments WHERE id = ?`,
      [req.params.aid]
    );
    if (!row) return res.status(404).json({ error: 'Attachment not found.' });
    if (!fs.existsSync(row.storage_path)) return res.status(404).json({ error: 'File not found on server.' });

    res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
    fs.createReadStream(row.storage_path).pipe(res);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// Helper: resolve the best outbound SMTP account for a given recipient address
async function getOutboundAccount(recipientEmail) {
  const rawEmail = recipientEmail
    ? (recipientEmail.match(/<([^>]+)>/) || [null, recipientEmail])[1].trim()
    : null;

  if (rawEmail) {
    const [[match]] = await pool.execute(`
      SELECT * FROM email_accounts
      WHERE is_active = 1
        AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
        AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
        AND mailbox_email = ?
      LIMIT 1
    `, [rawEmail]);
    if (match) return match;
  }

  const [[def]] = await pool.execute(`
    SELECT * FROM email_accounts
    WHERE is_active = 1
      AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
      AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
      AND is_default_outbound = 1
    LIMIT 1
  `);
  if (def) return def;

  const [[any]] = await pool.execute(`
    SELECT * FROM email_accounts
    WHERE is_active = 1
      AND smtp_host IS NOT NULL AND smtp_port IS NOT NULL
      AND smtp_username IS NOT NULL AND smtp_password IS NOT NULL
    LIMIT 1
  `);
  return any || null;
}

async function sendViaSmtp(account, { from, to, subject, text }) {
  const nodemailer = require('nodemailer');
  const secure = account.smtp_encryption === 'SSL/TLS';
  const requireTLS = account.smtp_encryption === 'STARTTLS';
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure,
    requireTLS,
    auth: { user: account.smtp_username, pass: account.smtp_password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });
  await transporter.sendMail({ from, to, subject, text });
}

async function insertSentItem({ from, to, subject, body, sourceTag, originalId, caseId }) {
  const sentAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await pool.execute(
    `INSERT INTO inquiries (sender, recipient, subject, body, received_at, status, attachments_count, source_tag, is_locked, locked_by, color, original_inquiry_id, case_id)
     VALUES (?, ?, ?, ?, ?, 'outbox', 0, ?, 0, null, null, ?, ?)`,
    [from, to, subject, body, sentAt, sourceTag, originalId || null, caseId || null]
  );
}

// POST /api/inbox/:id/reply — send reply via SMTP, move inquiry to processed, log to Sent
router.post('/:id/reply', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required.' });

    const [[inquiry]] = await pool.execute('SELECT id, recipient, case_id FROM inquiries WHERE id = ?', [id]);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

    const account = await getOutboundAccount(inquiry.recipient);
    if (!account) return res.status(400).json({ error: 'No outbound SMTP account configured.' });

    const fromAddr = account.from_email || account.smtp_username;
    const fromLabel = account.display_name || account.account_name;
    try {
      await sendViaSmtp(account, { from: `"${fromLabel}" <${fromAddr}>`, to, subject, text: body });
    } catch (err) {
      return res.status(502).json({ error: `Failed to send: ${err.message}` });
    }

    await pool.execute(
      `UPDATE inquiries
       SET status = 'processed',
           triage_state = CASE
             WHEN case_id IS NULL THEN 'closed'
             WHEN COALESCE(triage_state, '') = '' THEN 'linked'
             ELSE triage_state
           END,
           first_response_at = COALESCE(first_response_at, NOW()),
           closed_at = COALESCE(closed_at, NOW()),
           last_action_at = NOW()
       WHERE id = ?`,
      [id]
    );
    await insertSentItem({ from: fromAddr, to, subject, body, sourceTag: 'Sent Reply', originalId: Number(id), caseId: inquiry.case_id || null });
    audit(req.user?.userId || null, req.user?.email || 'unknown', 'REPLY', 'inquiry', Number(id), { to, subject });
    res.json({ message: 'Reply sent. Inquiry moved to Processed.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/inbox/:id/forward — send forward via SMTP (status unchanged), log to Sent
router.post('/:id/forward', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, and body are required.' });

    const [[inquiry]] = await pool.execute('SELECT id, recipient, case_id FROM inquiries WHERE id = ?', [id]);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });

    const account = await getOutboundAccount(inquiry.recipient);
    if (!account) return res.status(400).json({ error: 'No outbound SMTP account configured.' });

    const fromAddr = account.from_email || account.smtp_username;
    const fromLabel = account.display_name || account.account_name;
    try {
      await sendViaSmtp(account, { from: `"${fromLabel}" <${fromAddr}>`, to, subject, text: body });
    } catch (err) {
      return res.status(502).json({ error: `Failed to send: ${err.message}` });
    }

    await pool.execute(
      `UPDATE inquiries
       SET first_touched_at = COALESCE(first_touched_at, NOW()),
           triage_state = CASE WHEN COALESCE(triage_state, '') = '' OR triage_state = 'new' THEN 'in_review' ELSE triage_state END,
           last_action_at = NOW()
       WHERE id = ?`,
      [id]
    );
    await insertSentItem({ from: fromAddr, to, subject, body, sourceTag: 'Sent Forward', originalId: Number(id), caseId: inquiry.case_id || null });
    audit(req.user?.userId || null, req.user?.email || 'unknown', 'FORWARD', 'inquiry', Number(id), { to, subject });
    res.json({ message: 'Email forwarded.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PATCH /api/inbox/:id — update status, lock state, or color (DB-backed inquiries only)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      is_locked,
      locked_by,
      color,
      is_read,
      assigned_to,
      priority,
      due_date,
      case_id,
      triage_state,
      queue_name,
      snoozed_until,
      first_touched_at,
      first_response_at,
      closed_at,
      routing_reason,
      exception_reason,
    } = req.body;

    const [[row]] = await pool.execute(
      `SELECT id, org_id, status, is_locked, locked_by, color, is_read, assigned_to, priority, due_date, case_id,
              triage_state, queue_name, snoozed_until, first_touched_at, first_response_at, closed_at, routing_reason, exception_reason
       FROM inquiries
       WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Inquiry not found.' });
    if (req.user.role !== 'superadmin' && Number(row.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updates = [];
    const params = [];

    if (status !== undefined)      { updates.push('status = ?');      params.push(status); }
    if (is_locked !== undefined)   { updates.push('is_locked = ?');   params.push(is_locked ? 1 : 0); }
    if (locked_by !== undefined)   { updates.push('locked_by = ?');   params.push(locked_by || null); }
    if (color !== undefined)       { updates.push('color = ?');       params.push(color || null); }
    if (is_read !== undefined)     { updates.push('is_read = ?');     params.push(is_read ? 1 : 0); }
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to || null); }
    if (priority !== undefined)    { updates.push('priority = ?');    params.push(priority || null); }
    if (due_date !== undefined)    { updates.push('due_date = ?');    params.push(due_date || null); }
    if (triage_state !== undefined) { updates.push('triage_state = ?'); params.push(triage_state || null); }
    if (queue_name !== undefined)   { updates.push('queue_name = ?'); params.push(queue_name || null); }
    if (snoozed_until !== undefined) { updates.push('snoozed_until = ?'); params.push(snoozed_until ? toMySqlDateTime(snoozed_until) : null); }
    if (first_touched_at !== undefined) { updates.push('first_touched_at = ?'); params.push(first_touched_at ? toMySqlDateTime(first_touched_at) : null); }
    if (first_response_at !== undefined) { updates.push('first_response_at = ?'); params.push(first_response_at ? toMySqlDateTime(first_response_at) : null); }
    if (closed_at !== undefined) { updates.push('closed_at = ?'); params.push(closed_at ? toMySqlDateTime(closed_at) : null); }
    if (routing_reason !== undefined) { updates.push('routing_reason = ?'); params.push(routing_reason || null); }
    if (exception_reason !== undefined) { updates.push('exception_reason = ?'); params.push(exception_reason || null); }
    if (case_id !== undefined) {
      if (case_id) {
        const [[caseRow]] = await pool.execute('SELECT id, org_id FROM cases WHERE id = ?', [case_id]);
        if (!caseRow) return res.status(404).json({ error: 'Case not found.' });
        if (req.user.role !== 'superadmin' && Number(caseRow.org_id) !== Number(req.user.orgId)) {
          return res.status(403).json({ error: 'Cannot link inquiry to a case outside your organisation.' });
        }
      }
      updates.push('case_id = ?'); params.push(case_id || null);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    if (is_read === true && !row.first_touched_at && first_touched_at === undefined) {
      updates.push('first_touched_at = COALESCE(first_touched_at, NOW())');
    }
    updates.push('last_action_at = NOW()');

    params.push(id);
    await pool.execute(`UPDATE inquiries SET ${updates.join(', ')} WHERE id = ?`, params);
    const after = {
      status: status !== undefined ? status : row.status,
      is_locked: is_locked !== undefined ? (is_locked ? 1 : 0) : row.is_locked,
      locked_by: locked_by !== undefined ? (locked_by || null) : row.locked_by,
      color: color !== undefined ? (color || null) : row.color,
      assigned_to: assigned_to !== undefined ? (assigned_to || null) : row.assigned_to,
      priority: priority !== undefined ? (priority || null) : row.priority,
      due_date: due_date !== undefined ? (due_date || null) : row.due_date,
      case_id: case_id !== undefined ? (case_id || null) : row.case_id,
      triage_state: triage_state !== undefined ? (triage_state || null) : row.triage_state,
      queue_name: queue_name !== undefined ? (queue_name || null) : row.queue_name,
      snoozed_until: snoozed_until !== undefined ? (snoozed_until || null) : row.snoozed_until,
      first_touched_at: first_touched_at !== undefined ? (first_touched_at || null) : row.first_touched_at,
      first_response_at: first_response_at !== undefined ? (first_response_at || null) : row.first_response_at,
      closed_at: closed_at !== undefined ? (closed_at || null) : row.closed_at,
      routing_reason: routing_reason !== undefined ? (routing_reason || null) : row.routing_reason,
      exception_reason: exception_reason !== undefined ? (exception_reason || null) : row.exception_reason,
    };
    audit(req.user?.userId || null, req.user?.email || 'unknown', 'UPDATE', 'inquiry', Number(id), {
      from: {
        status: row.status, is_locked: row.is_locked, locked_by: row.locked_by,
        color: row.color, assigned_to: row.assigned_to, priority: row.priority, due_date: row.due_date, case_id: row.case_id,
        triage_state: row.triage_state, queue_name: row.queue_name, snoozed_until: row.snoozed_until,
        first_touched_at: row.first_touched_at, first_response_at: row.first_response_at, closed_at: row.closed_at,
        routing_reason: row.routing_reason, exception_reason: row.exception_reason,
      },
      to: after,
    });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/inbox/:id/link-case — link inquiry to a case and move to processed
router.post('/:id/link-case', authenticate, async (req, res) => {
  try {
    const inquiryId = Number(req.params.id);
    const caseId = Number(req.body?.case_id);
    const linkMode = req.body?.link_mode === 'converted' ? 'converted' : 'linked';
    if (!caseId) return res.status(400).json({ error: 'case_id is required.' });

    const [[inquiry]] = await pool.execute(
      'SELECT id, org_id, status, case_id FROM inquiries WHERE id = ?',
      [inquiryId]
    );
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
    if (req.user.role !== 'superadmin' && Number(inquiry.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [[caseRow]] = await pool.execute(
      'SELECT id, org_id, case_number, case_type FROM cases WHERE id = ?',
      [caseId]
    );
    if (!caseRow) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role !== 'superadmin' && Number(caseRow.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Cannot link inquiry to a case outside your organisation.' });
    }

    await pool.execute(
      `UPDATE inquiries
       SET case_id = ?,
           status = 'processed',
           triage_state = ?,
           first_touched_at = COALESCE(first_touched_at, NOW()),
           closed_at = CASE WHEN ? = 'converted' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
           last_action_at = NOW()
       WHERE id = ?`,
      [caseId, linkMode, linkMode, inquiryId]
    );

    audit(req.user?.userId || null, req.user?.email || 'unknown', 'LINK_CASE', 'inquiry', inquiryId, {
      from: { status: inquiry.status, case_id: inquiry.case_id || null },
      to: { status: 'processed', case_id: caseId, triage_state: linkMode },
      linked_case: { id: caseRow.id, case_number: caseRow.case_number || null, case_type: caseRow.case_type || null },
    });

    res.json({
      message: 'Inquiry linked to case.',
      case: {
        id: caseRow.id,
        case_number: caseRow.case_number || null,
        case_type: caseRow.case_type || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
