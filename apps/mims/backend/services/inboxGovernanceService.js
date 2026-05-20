'use strict';

const pool = require('../database/db');
const { createNotifications } = require('./notificationCenterService');

const FIRST_TOUCH_SLA_HOURS = Number(process.env.INBOX_FIRST_TOUCH_SLA_HOURS || 2);
const RESPONSE_SLA_HOURS = Number(process.env.INBOX_RESPONSE_SLA_HOURS || 24);
const ALERT_LEAD_MINUTES = Number(process.env.INBOX_SLA_ALERT_LEAD_MINUTES || 30);

function parseInquiryDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.includes('T')
    ? raw
    : raw.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toMySqlDateTime(value) {
  const dt = parseInquiryDate(value) || new Date();
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

function addHours(date, hours) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function parseEmail(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function extractCaseHint(text) {
  const match = String(text || '').match(/\b[A-Za-z]{1,6}-\d{2,}\b/);
  return match ? match[0].trim() : '';
}

function deriveQueueName(row) {
  if (row.queue_name) return row.queue_name;
  const recipient = normalizeText(row.recipient);
  const mailboxName = normalizeText(row.mailbox_name);
  const combined = `${normalizeText(row.subject)} ${normalizeText(row.body)}`;

  if (recipient.includes('safety') || mailboxName.includes('safety') || combined.includes('adverse event')) {
    return 'Safety';
  }
  if (recipient.includes('quality') || mailboxName.includes('quality') || combined.includes('complaint')) {
    return 'Quality';
  }
  if (recipient.includes('regulatory') || mailboxName.includes('regulatory')) {
    return 'Regulatory';
  }
  if (row.case_id) return 'Linked Cases';
  return 'Medical Information';
}

function deriveRoutingReason(row, queueName) {
  if (row.routing_reason) return row.routing_reason;
  const recipient = parseEmail(row.recipient);
  if (recipient) return `Auto-routed from mailbox ${recipient} to ${queueName}`;
  return `Auto-routed using subject and sender heuristics to ${queueName}`;
}

function deriveExceptionReason(row) {
  if (row.exception_reason) return row.exception_reason;
  if (!String(row.sender || '').trim()) return 'Missing sender';
  if (!String(row.subject || '').trim()) return 'Missing subject';
  if (!String(row.body || '').trim() && Number(row.attachments_count || 0) === 0) {
    return 'Missing body and attachments';
  }
  return null;
}

function deriveTriageState(row) {
  if (row.triage_state) return row.triage_state;
  if (row.closed_at || row.status === 'outbox') return 'closed';
  if (row.status === 'non_processed') return 'no_action';
  if (row.case_id && row.status === 'processed') return 'linked';
  if (row.status === 'pending') return 'in_review';
  return 'new';
}

function computeSlaStatus(dueAt, completedAt, now = new Date()) {
  if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) return 'untracked';
  if (completedAt instanceof Date && !Number.isNaN(completedAt.getTime())) {
    return completedAt.getTime() > dueAt.getTime() ? 'breached' : 'met';
  }
  if (dueAt.getTime() <= now.getTime()) return 'breached';
  if ((dueAt.getTime() - now.getTime()) <= ALERT_LEAD_MINUTES * 60 * 1000) return 'at_risk';
  return 'on_track';
}

function toIsoOrNull(value) {
  const dt = parseInquiryDate(value);
  return dt ? dt.toISOString() : null;
}

function serializeInquiryOperational(row, now = new Date()) {
  const receivedAt = parseInquiryDate(row.received_at) || parseInquiryDate(row.created_at) || new Date();
  const firstTouchedAt = parseInquiryDate(row.first_touched_at);
  const firstResponseAt = parseInquiryDate(row.first_response_at);
  const snoozedUntil = parseInquiryDate(row.snoozed_until);
  const closedAt = parseInquiryDate(row.closed_at);
  const triageState = deriveTriageState(row);
  const queueName = deriveQueueName(row);
  const firstTouchDueAt = addHours(receivedAt, FIRST_TOUCH_SLA_HOURS);
  const responseDueAt = addHours(firstTouchedAt || receivedAt, RESPONSE_SLA_HOURS);
  const exceptionReason = deriveExceptionReason(row);

  return {
    ...row,
    triage_state: triageState,
    queue_name: queueName,
    mailbox_name: row.mailbox_name || row.recipient || null,
    snoozed_until: toIsoOrNull(snoozedUntil),
    first_touched_at: toIsoOrNull(firstTouchedAt),
    first_response_at: toIsoOrNull(firstResponseAt),
    last_action_at: toIsoOrNull(row.last_action_at),
    closed_at: toIsoOrNull(closedAt),
    routing_reason: deriveRoutingReason(row, queueName),
    exception_reason: exceptionReason,
    first_touch_due_at: toIsoOrNull(firstTouchDueAt),
    response_due_at: toIsoOrNull(responseDueAt),
    first_touch_sla_status: computeSlaStatus(firstTouchDueAt, firstTouchedAt, now),
    response_sla_status: computeSlaStatus(responseDueAt, firstResponseAt, now),
    age_hours: Math.max(0, Math.round((now.getTime() - receivedAt.getTime()) / (60 * 60 * 1000))),
    is_snoozed: snoozedUntil instanceof Date && snoozedUntil.getTime() > now.getTime(),
  };
}

function hydrateInquiryRows(rows, now = new Date()) {
  return (rows || []).map((row) => serializeInquiryOperational(row, now));
}

async function getInquiryHistory(orgId, inquiryId) {
  const historyWhere = orgId ? 'id = ? AND org_id = ?' : 'id = ?';
  const historyParams = orgId ? [inquiryId, orgId] : [inquiryId];
  const [[inquiry]] = await pool.execute(
    `SELECT id, org_id, sender, subject, case_id
     FROM inquiries
     WHERE ${historyWhere}`,
    historyParams
  );
  if (!inquiry) return null;

  const senderEmail = parseEmail(inquiry.sender);

  const [recentThreads] = await pool.execute(
    `SELECT id, subject, status, triage_state, case_id, received_at
     FROM inquiries
     WHERE org_id = ?
       AND LOWER(TRIM(COALESCE(sender, ''))) = ?
       AND id <> ?
     ORDER BY COALESCE(STR_TO_DATE(received_at, '%Y-%m-%d %H:%i:%s'), created_at) DESC, id DESC
     LIMIT 8`,
    [orgId, senderEmail, inquiryId]
  );

  const [linkedCases] = await pool.execute(
    `SELECT DISTINCT
        c.id,
        c.case_number,
        c.case_type,
        ws.name AS status_name,
        c.updated_at
     FROM cases c
     LEFT JOIN workflow_states ws ON ws.id = c.status_id
     LEFT JOIN case_reporter cr ON cr.case_id = c.id
     LEFT JOIN inquiries iq ON iq.case_id = c.id
     WHERE c.org_id = ?
       AND c.is_deleted = 0
       AND (
         LOWER(TRIM(COALESCE(cr.email, ''))) = ?
         OR LOWER(TRIM(COALESCE(iq.sender, ''))) = ?
       )
     ORDER BY c.updated_at DESC, c.id DESC
     LIMIT 6`,
    [orgId, senderEmail, senderEmail]
  );

  return {
    sender_email: senderEmail,
    previous_inquiries: recentThreads,
    linked_cases: linkedCases,
    previous_inquiry_count: recentThreads.length,
    linked_case_count: linkedCases.length,
  };
}

async function getInquiryRecommendations(orgId, inquiryId) {
  const recWhere = orgId ? 'id = ? AND org_id = ?' : 'id = ?';
  const recParams = orgId ? [inquiryId, orgId] : [inquiryId];
  const [[inquiry]] = await pool.execute(
    `SELECT id, org_id, sender, subject, body, case_id
     FROM inquiries
     WHERE ${recWhere}`,
    recParams
  );
  if (!inquiry) return null;

  const senderEmail = parseEmail(inquiry.sender);
  const caseHint = extractCaseHint(`${inquiry.subject || ''} ${inquiry.body || ''}`);
  const subjectLike = `%${String(inquiry.subject || '').trim().slice(0, 80)}%`;

  const [rows] = await pool.execute(
    `SELECT
        c.id,
        c.case_number,
        c.case_type,
        ws.name AS status_name,
        c.updated_at,
        MAX(CASE WHEN LOWER(TRIM(COALESCE(cr.email, ''))) = ? THEN 1 ELSE 0 END) AS reporter_match,
        MAX(CASE WHEN LOWER(TRIM(COALESCE(iq.sender, ''))) = ? THEN 1 ELSE 0 END) AS sender_match,
        MAX(CASE WHEN ? <> '' AND c.case_number = ? THEN 1 ELSE 0 END) AS case_number_match,
        MAX(CASE WHEN ? <> '%%' AND COALESCE(c.description, '') LIKE ? THEN 1 ELSE 0 END) AS description_match
     FROM cases c
     LEFT JOIN workflow_states ws ON ws.id = c.status_id
     LEFT JOIN case_reporter cr ON cr.case_id = c.id
     LEFT JOIN inquiries iq ON iq.case_id = c.id
     WHERE c.org_id = ?
       AND c.is_deleted = 0
       AND (
         LOWER(TRIM(COALESCE(cr.email, ''))) = ?
         OR LOWER(TRIM(COALESCE(iq.sender, ''))) = ?
         OR (? <> '' AND c.case_number = ?)
         OR (? <> '%%' AND COALESCE(c.description, '') LIKE ?)
       )
     GROUP BY c.id, c.case_number, c.case_type, ws.name, c.updated_at
     ORDER BY
       case_number_match DESC,
       reporter_match DESC,
       sender_match DESC,
       description_match DESC,
       c.updated_at DESC,
       c.id DESC
     LIMIT 6`,
    [
      senderEmail,
      senderEmail,
      caseHint,
      caseHint,
      subjectLike,
      subjectLike,
      orgId,
      senderEmail,
      senderEmail,
      caseHint,
      caseHint,
      subjectLike,
      subjectLike,
    ]
  );

  return (rows || []).map((row) => {
    let recommendation = 'Review before creating new case';
    if (Number(row.case_number_match || 0) > 0) recommendation = 'Append to exact matched case';
    else if (Number(row.reporter_match || 0) > 0 || Number(row.sender_match || 0) > 0) recommendation = 'Link to related existing case';

    return {
      ...row,
      recommendation,
      confidence: Number(row.case_number_match || 0) > 0 ? 'high' : (Number(row.reporter_match || 0) > 0 || Number(row.sender_match || 0) > 0 ? 'medium' : 'low'),
    };
  });
}

async function resolveAssignedUserIds(orgId, assignedTo, fallbackCaseOwnerId = null) {
  const ids = [];
  const assignee = String(assignedTo || '').trim();
  if (assignee) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN user_org_access uoa ON uoa.user_id = u.id
       WHERE u.is_active = 1
         AND u.name = ?
         AND (uoa.org_id = ? OR u.role = 'platform_admin')`,
      [assignee, orgId]
    );
    rows.forEach((row) => ids.push(Number(row.id)));
  }
  if (fallbackCaseOwnerId) ids.push(Number(fallbackCaseOwnerId));
  return [...new Set(ids.filter(Boolean))];
}

async function refreshInboxOperationalAlerts(now = new Date()) {
  // H1 FIX: exclude snoozed inquiries so SLA alerts are suppressed during the snooze window
  const [rows] = await pool.execute(
    `SELECT
       iq.*,
       ea.account_name AS mailbox_name,
       c.case_owner_id
     FROM inquiries iq
     LEFT JOIN email_accounts ea ON ea.id = iq.email_account_id
     LEFT JOIN cases c ON c.id = iq.case_id
     WHERE iq.status <> 'outbox'
       AND iq.org_id IS NOT NULL
       AND (iq.snoozed_until IS NULL OR iq.snoozed_until <= NOW())
     ORDER BY iq.id ASC`
  );

  const hydrated = hydrateInquiryRows(rows, now);
  for (const inquiry of hydrated) {
    // Belt-and-suspenders: skip if hydrated row is still marked snoozed
    if (inquiry.is_snoozed) continue;
    if (['linked', 'converted', 'no_action', 'closed'].includes(String(inquiry.triage_state || '').toLowerCase())) {
      continue;
    }

    const assigneeIds = await resolveAssignedUserIds(inquiry.org_id, inquiry.assigned_to, inquiry.case_owner_id || null);
    if (assigneeIds.length === 0) continue;

    if (!inquiry.first_touched_at && inquiry.first_touch_sla_status === 'breached' && !inquiry.first_touch_alerted_at) {
      await createNotifications(assigneeIds, {
        category: 'inbox_sla',
        severity: 'warning',
        title: `Inbox first-touch SLA breached: ${inquiry.subject || `Inquiry #${inquiry.id}`}`,
        message: `Inquiry from ${inquiry.sender || 'unknown sender'} has not been touched within ${FIRST_TOUCH_SLA_HOURS} hours.`,
        linkUrl: '/inbox',
        metadata: { inquiry_id: inquiry.id, sla_type: 'first_touch' },
        eventKey: `inbox-first-touch-${inquiry.id}`,
      });
      await pool.execute(
        'UPDATE inquiries SET first_touch_alerted_at = ? WHERE id = ? AND first_touch_alerted_at IS NULL',
        [toMySqlDateTime(now), inquiry.id]
      );
    }

    if (inquiry.first_touched_at && !inquiry.first_response_at && inquiry.response_sla_status === 'breached' && !inquiry.response_alerted_at) {
      await createNotifications(assigneeIds, {
        category: 'inbox_sla',
        severity: 'critical',
        title: `Inbox response SLA breached: ${inquiry.subject || `Inquiry #${inquiry.id}`}`,
        message: `Inquiry from ${inquiry.sender || 'unknown sender'} has not received a response within ${RESPONSE_SLA_HOURS} hours.`,
        linkUrl: '/inbox',
        metadata: { inquiry_id: inquiry.id, sla_type: 'response' },
        eventKey: `inbox-response-${inquiry.id}`,
        requiresAcknowledgement: true,
      });
      await pool.execute(
        'UPDATE inquiries SET response_alerted_at = ? WHERE id = ? AND response_alerted_at IS NULL',
        [toMySqlDateTime(now), inquiry.id]
      );
    }
  }
}

module.exports = {
  FIRST_TOUCH_SLA_HOURS,
  RESPONSE_SLA_HOURS,
  parseInquiryDate,
  toMySqlDateTime,
  computeSlaStatus,
  serializeInquiryOperational,
  hydrateInquiryRows,
  getInquiryHistory,
  getInquiryRecommendations,
  refreshInboxOperationalAlerts,
};
