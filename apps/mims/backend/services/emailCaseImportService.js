'use strict';

/**
 * emailCaseImportService.js — Email Case Import engine (Epic MIMS-29)
 *
 * The bridge from email-received to case-created-and-assigned. Called by
 * emailPoller for accounts flagged `is_case_intake` after the inquiry row is
 * ingested. Implements the locked decisions of confirmed feature #1:
 *
 *  - Confidence-gated auto-creation; everything uncertain → Inbox "needs
 *    review" — no bounce-back, nothing dropped (decisions #1, #21).
 *  - Asymmetric AE rule: possible-AE emails never auto-file as MI (#2).
 *  - Primary type by regulation priority + secondary tag (#7).
 *  - Platform floor + org-defined intake fields; reporter fields auto-map
 *    only when org-defined and present (#9, #10, #22).
 *  - AE awareness date = email received timestamp (#17 — GVP Module VI).
 *  - New "Email Intake" workflow state (#13) with SLA escalation to leads.
 *  - Workload-weighted round-robin assignment to `agent` role users (#4).
 *  - Thread/duplicate follow-ups attach to the existing case (#5).
 *  - Neutral acknowledgment — no case number, no case data, no medical
 *    advice; missing-fields variant lists field names only (#15, #21).
 *  - Immutable source record + audit entries for every automated action (#11).
 *  - AI never populates seriousness/causality — hints only (#20).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pool = require('../database/db');
const { logger } = require('./logger');
const { classifyEmail } = require('./emailCaseClassifierService');
const { assignCaseNumberWithConnection } = require('./orgBootstrapService');
const { createNotification, createNotifications } = require('./notificationCenterService');
const { emitDataSync } = require('./appRealtimeService');
const { decryptMailboxSecret } = require('./mailboxCrypto');

const SYSTEM_ACTOR = 'Email Case Import';

// Columns an intake field definition is allowed to map onto. Anything outside
// this allowlist is ignored at write time — admin config can never become a
// column-injection vector.
const REPORTER_FIELD_ALLOWLIST = new Set([
  'first_name', 'last_name', 'email', 'phone', 'country', 'organisation', 'reporter_type',
]);
const CASE_FIELD_ALLOWLIST = new Set(['description', 'priority']);

const DEFAULT_ACK_TEMPLATE =
  'Thank you for contacting us. We have received your message and it is being reviewed by our team. ' +
  'Your reference for this submission is {{reference}}. ' +
  'If we need any additional information, we will contact you at this address.';

const DEFAULT_ACK_MISSING_TEMPLATE =
  'Thank you for contacting us. We have received your message and it is being reviewed by our team. ' +
  'Your reference for this submission is {{reference}}. ' +
  'To help us process your request, please reply including the following information: {{missing_fields}}.';

function toMySqlDateTime(input) {
  const dt = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().replace('T', ' ').substring(0, 19);
  return dt.toISOString().replace('T', ' ').substring(0, 19);
}

function extractEmailAddress(raw) {
  const s = String(raw || '');
  const angled = s.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : s).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function stripReplyPrefixes(subject) {
  return String(subject || '').replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').trim().toLowerCase();
}

// ── Config + field definitions ──────────────────────────────────────────────

const CONFIG_DEFAULTS = {
  is_enabled: 0,
  confidence_threshold: 0.85,
  assignment_rule: 'round_robin_workload',
  enable_mi: 1,
  enable_ae: 1,
  enable_pc: 1,
  ack_enabled: 1,
  ack_template: null,
  ack_missing_fields_template: null,
  sla_hours: 24,
  alert_recipients: 'agent_lead',
};

async function getConfig(orgId) {
  const [[row]] = await pool.execute(
    'SELECT * FROM email_case_import_config WHERE org_id = ? LIMIT 1',
    [orgId]
  );
  const cfg = { ...CONFIG_DEFAULTS, ...(row || {}) };
  cfg.confidence_threshold = Number(cfg.confidence_threshold);
  cfg.sla_hours = Number(cfg.sla_hours);
  return cfg;
}

async function getIntakeFieldDefs(orgId) {
  const [rows] = await pool.execute(
    `SELECT id, org_id, field_key, label, aliases, target_entity, target_field,
            is_required, sort_order, is_active
       FROM intake_field_definitions
      WHERE org_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC`,
    [orgId]
  );
  return rows;
}

async function resolveEmailIntakeStateId(conn, orgId) {
  // Org-specific state wins over the global (org_id NULL) seed.
  const [[state]] = await conn.execute(
    `SELECT id FROM workflow_states
      WHERE name = 'Email Intake' AND is_active = 1 AND (org_id = ? OR org_id IS NULL)
      ORDER BY org_id IS NULL ASC LIMIT 1`,
    [orgId]
  );
  if (state?.id) return state.id;
  await conn.execute(
    `INSERT INTO workflow_states (name, org_id, is_active) VALUES ('Email Intake', NULL, 1)`
  );
  const [[created]] = await conn.execute(
    `SELECT id FROM workflow_states WHERE name = 'Email Intake' ORDER BY id ASC LIMIT 1`
  );
  return created?.id || null;
}

// ── Audit helper ────────────────────────────────────────────────────────────

async function audit(action, entity, entityId, details) {
  await pool.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
     VALUES (NULL, ?, ?, ?, ?, ?)`,
    [SYSTEM_ACTOR, action, entity, entityId, JSON.stringify(details || {})]
  ).catch(() => {});
}

// ── Follow-up / thread handling (MIMS-36, decision #5) ──────────────────────

async function findExistingCaseForThread({ orgId, inReplyTo, references, sender, subject }) {
  const refIds = []
    .concat(inReplyTo || [])
    .concat(references || [])
    .map((r) => String(r).trim())
    .filter(Boolean);

  if (refIds.length) {
    const placeholders = refIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT case_id, message_id FROM email_case_sources
        WHERE org_id = ? AND message_id IN (${placeholders})
        ORDER BY id DESC LIMIT 1`,
      [orgId, ...refIds]
    );
    if (rows[0]?.case_id) return { caseId: rows[0].case_id, matchedBy: 'thread_header' };
  }

  // Fallback: same sender replying on the same (Re:-stripped) subject.
  const senderEmail = extractEmailAddress(sender);
  const cleanSubject = stripReplyPrefixes(subject);
  if (senderEmail && cleanSubject) {
    const [rows] = await pool.execute(
      `SELECT case_id, sender, subject FROM email_case_sources
        WHERE org_id = ? AND sender LIKE ? ORDER BY id DESC LIMIT 25`,
      [orgId, `%${senderEmail}%`]
    );
    const hit = rows.find((r) => stripReplyPrefixes(r.subject) === cleanSubject);
    if (hit?.case_id) return { caseId: hit.caseId || hit.case_id, matchedBy: 'sender_subject' };
  }
  return null;
}

async function attachFollowUp({ inquiry, caseId, matchedBy, parsed }) {
  const receivedAt = toMySqlDateTime(parsed?.receivedAt || inquiry.received_at || new Date());

  await pool.execute(
    `INSERT INTO email_case_sources
       (org_id, case_id, inquiry_id, kind, message_id, sender, recipient, subject, body, received_at, content_sha256)
     VALUES (?, ?, ?, 'followup', ?, ?, ?, ?, ?, ?, ?)`,
    [inquiry.org_id, caseId, inquiry.id, parsed?.messageId || inquiry.message_id || null,
     inquiry.sender, inquiry.recipient, inquiry.subject, inquiry.body, receivedAt,
     crypto.createHash('sha256').update(String(inquiry.body || '')).digest('hex')]
  );

  await pool.execute(
    `INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, NULL, ?)`,
    [caseId, `Follow-up email received from ${inquiry.sender || 'unknown sender'} — attached automatically (matched by ${matchedBy}). Subject: ${String(inquiry.subject || '').slice(0, 300)}`]
  ).catch(() => {});

  await pool.execute(
    `UPDATE cases SET follow_up_received_date = COALESCE(follow_up_received_date, ?) WHERE id = ?`,
    [receivedAt, caseId]
  ).catch(() => {});

  await pool.execute(
    `UPDATE inquiries
        SET case_id = ?, status = 'processed', triage_state = 'linked',
            routing_reason = ?, first_touched_at = COALESCE(first_touched_at, NOW()), last_action_at = NOW()
      WHERE id = ?`,
    [caseId, `auto: follow-up attached to existing case (${matchedBy})`, inquiry.id]
  );

  const [[caseRow]] = await pool.execute(
    'SELECT id, case_number, case_owner_id, org_id FROM cases WHERE id = ?', [caseId]
  );
  if (caseRow?.case_owner_id) {
    await createNotification(caseRow.case_owner_id, {
      category: 'case',
      title: `Follow-up email on ${caseRow.case_number || `Case ${caseId}`}`,
      message: `A follow-up email from ${inquiry.sender || 'the reporter'} was attached automatically.`,
      linkUrl: `/cases/${caseId}`,
      severity: 'info',
      eventKey: `eci_followup_${inquiry.id}`,
    }).catch(() => {});
  }

  await audit('EMAIL_CASE_FOLLOWUP_ATTACHED', 'case', caseId, {
    inquiry_id: inquiry.id, matched_by: matchedBy, sender: inquiry.sender,
  });
  emitDataSync({
    orgIds: [Number(inquiry.org_id || 0)],
    domains: ['inbox', 'cases', 'dashboard'],
    reason: 'eci.followup_attached',
    payload: { inquiryId: inquiry.id, caseId },
  });
  return { action: 'followup_attached', caseId, matchedBy };
}

// ── Assignment (MIMS-35, decision #4) ───────────────────────────────────────

async function pickAssignee(conn, orgId) {
  // Workload-weighted round-robin: active `agent` users in the org, ordered by
  // open (non-closed, non-deleted) case count, then least-recently-assigned.
  // Correlated subqueries, NOT joins — two one-to-many joins on `cases` in one
  // GROUP BY fan out into a per-user cartesian product on large case tables.
  const [agents] = await conn.execute(
    `SELECT u.id,
            (SELECT COUNT(*) FROM cases c
              WHERE c.case_owner_id = u.id AND c.is_deleted = 0
                AND c.status_id NOT IN (SELECT id FROM workflow_states WHERE name = 'Closed')) AS open_cases,
            (SELECT MAX(c2.created_at) FROM cases c2
              WHERE c2.case_owner_id = u.id AND c2.intake_channel = 'email') AS last_assigned_at
       FROM users u
      WHERE u.org_id = ? AND u.role = 'agent' AND (u.is_active = 1 OR u.is_active IS NULL)
      ORDER BY open_cases ASC, last_assigned_at IS NULL DESC, last_assigned_at ASC, u.id ASC
      LIMIT 1`,
    [orgId]
  );
  return agents[0]?.id || null;
}

// ── Acknowledgment (MIMS-37, decisions #15/#21) ─────────────────────────────

async function resolveOutboundAccount(account, orgId) {
  if (account?.smtp_host && account?.smtp_port && account?.smtp_username) return account;
  const [[fallback]] = await pool.execute(
    `SELECT * FROM email_accounts
      WHERE org_id = ? AND is_active = 1 AND smtp_host IS NOT NULL
        AND smtp_port IS NOT NULL AND smtp_username IS NOT NULL
      ORDER BY is_default_outbound DESC, id ASC LIMIT 1`,
    [orgId]
  );
  return fallback || null;
}

/**
 * Send the neutral acknowledgment. Content constraints (Vasu/Sowmya): no case
 * number, no case data, no echo of sender content, no medical advice. The
 * reference token is random — deliberately NOT the case number.
 */
async function sendAcknowledgment({ account, config, orgId, toEmail, variant, missingFieldLabels }) {
  if (!config.ack_enabled) return { sent: false, reason: 'ack_disabled' };
  const recipient = extractEmailAddress(toEmail);
  if (!recipient) return { sent: false, reason: 'no_valid_recipient' };

  const outbound = await resolveOutboundAccount(account, orgId);
  if (!outbound) {
    logger.warn({ org_id: orgId }, 'ECI: no outbound SMTP account — acknowledgment skipped');
    return { sent: false, reason: 'no_smtp_account' };
  }

  const reference = `EMI-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const template = variant === 'missing_fields'
    ? (config.ack_missing_fields_template || DEFAULT_ACK_MISSING_TEMPLATE)
    : (config.ack_template || DEFAULT_ACK_TEMPLATE);
  const body = template
    .replace(/\{\{reference\}\}/g, reference)
    .replace(/\{\{missing_fields\}\}/g, (missingFieldLabels || []).join(', ') || 'the requested details');

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: outbound.smtp_host,
    port: Number(outbound.smtp_port),
    secure: Number(outbound.smtp_port) === 465,
    auth: {
      user: outbound.smtp_username,
      pass: decryptMailboxSecret(outbound.smtp_password),
    },
    // F20 posture: TLS verification on by default; insecure only via explicit flag.
    tls: { rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS === 'true' ? false : true },
  });

  try {
    await transporter.sendMail({
      from: `"${outbound.display_name || outbound.account_name || 'Medical Information'}" <${outbound.from_email || outbound.smtp_username}>`,
      to: recipient,
      subject: 'We have received your message',
      text: body,
    });
    return { sent: true, reference };
  } catch (err) {
    logger.warn({ org_id: orgId, error: String(err?.message || err).slice(0, 200) }, 'ECI: acknowledgment send failed');
    return { sent: false, reason: 'smtp_error' };
  }
}

// ── Needs-review path ───────────────────────────────────────────────────────

async function routeToReview({ inquiry, account, config, verdict, reasons }) {
  const reasonText = `auto: needs review — ${reasons.join('; ')}`;
  const isPossibleAe = verdict?.possibleAe || false;

  await pool.execute(
    `UPDATE inquiries
        SET triage_state = 'needs_review',
            routing_reason = ?,
            priority = CASE WHEN ? THEN 'high' ELSE priority END,
            last_action_at = NOW()
      WHERE id = ?`,
    [reasonText.slice(0, 500), isPossibleAe || (verdict?.seriousHints || []).length > 0, inquiry.id]
  );

  // Possible AE must reach human eyes fast — alert the org leads (admins).
  if (isPossibleAe) {
    const [admins] = await pool.execute(
      `SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND (is_active = 1 OR is_active IS NULL)`,
      [inquiry.org_id]
    );
    await createNotifications(admins.map((a) => a.id), {
      category: 'inbox',
      title: 'Possible AE email needs review',
      message: `An inbound email was flagged "possible adverse event" and requires human review (Inbox #${inquiry.id}).`,
      linkUrl: `/inbox`,
      severity: 'warning',
      eventKey: `eci_possible_ae_${inquiry.id}`,
    }).catch(() => {});
  }

  const missingLabels = await labelsForMissing(inquiry.org_id, verdict?.missingRequired || []);
  const ack = await sendAcknowledgment({
    account, config, orgId: inquiry.org_id,
    toEmail: inquiry.sender,
    variant: (verdict?.missingRequired || []).length ? 'missing_fields' : 'standard',
    missingFieldLabels: missingLabels,
  });

  await audit('EMAIL_CASE_NEEDS_REVIEW', 'inquiry', inquiry.id, {
    reasons, possible_ae: isPossibleAe, confidence: verdict?.confidence ?? null,
    missing_required: verdict?.missingRequired || [], ack,
  });
  emitDataSync({
    orgIds: [Number(inquiry.org_id || 0)],
    domains: ['inbox', 'dashboard'],
    reason: 'eci.needs_review',
    payload: { inquiryId: inquiry.id },
  });
  return { action: 'needs_review', reasons, possibleAe: isPossibleAe, ack };
}

async function labelsForMissing(orgId, missingKeys) {
  if (!missingKeys?.length) return [];
  const defs = await getIntakeFieldDefs(orgId);
  return missingKeys.map((k) => defs.find((d) => d.field_key === k)?.label || k.replace(/_/g, ' '));
}

// ── Auto-create path (MIMS-34) ──────────────────────────────────────────────

async function createCaseFromInquiry({ inquiry, account, config, verdict, defs, parsed }) {
  const receivedAt = parsed?.receivedAt || inquiry.received_at || new Date();
  const receivedTs = toMySqlDateTime(receivedAt);
  const receivedDate = receivedTs.substring(0, 10);

  const conn = await pool.getConnection();
  let caseId = null;
  let caseNumber = null;
  let assigneeId = null;
  try {
    await conn.beginTransaction();

    const statusId = await resolveEmailIntakeStateId(conn, inquiry.org_id);
    const [[defSite]] = await conn.execute(
      'SELECT id FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC LIMIT 1',
      [inquiry.org_id]
    );

    // Mapped case-level fields (allowlisted).
    let description = String(inquiry.body || '').slice(0, 20000);
    for (const def of defs) {
      if (def.target_entity === 'case' && CASE_FIELD_ALLOWLIST.has(def.target_field)
          && verdict.extracted[def.field_key] && def.target_field === 'description') {
        description = `${verdict.extracted[def.field_key]}\n\n---\nOriginal email body:\n${description}`.slice(0, 20000);
      }
    }

    // Platform floor (decision #9) + AE awareness clock (decision #17):
    // awareness_date is the email's received timestamp for AE — the org became
    // "aware" the moment the email hit the mailbox, not at case creation.
    const [result] = await conn.execute(
      `INSERT INTO cases
         (org_id, site_id, case_type, secondary_case_type, intake_channel,
          date_received, awareness_date, date_of_intake, description, status_id, created_by)
       VALUES (?, ?, ?, ?, 'email', ?, ?, NOW(), ?, ?, NULL)`,
      [inquiry.org_id, defSite?.id || null, verdict.caseType, verdict.secondaryCaseType,
       receivedDate, verdict.caseType === 'AE' ? receivedTs : null, description, statusId]
    );
    caseId = result.insertId;

    caseNumber = await assignCaseNumberWithConnection(conn, {
      id: caseId, org_id: inquiry.org_id, case_type: verdict.caseType, case_number: null,
    });

    // Reporter auto-map (decision #10): only org-defined reporter fields that
    // were actually present in the email; everything else stays empty.
    const reporterValues = {};
    for (const def of defs) {
      if (def.target_entity === 'reporter' && REPORTER_FIELD_ALLOWLIST.has(def.target_field)
          && verdict.extracted[def.field_key] != null) {
        reporterValues[def.target_field] = verdict.extracted[def.field_key];
      }
    }
    if (Object.keys(reporterValues).length) {
      const cols = Object.keys(reporterValues);
      await conn.execute(
        `INSERT INTO case_reporter (case_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        [caseId, ...cols.map((c) => String(reporterValues[c]).slice(0, 255))]
      );
    }

    // AE skeleton so the AE tab renders. Seriousness/causality fields stay at
    // their NULL defaults — the AI never populates assessments (decision #20).
    if (verdict.caseType === 'AE') {
      const [v] = await conn.execute(
        'INSERT INTO case_ae_versions (case_id, version_number, created_by) VALUES (?, 1, NULL)',
        [caseId]
      );
      await conn.execute(
        'INSERT INTO case_ae_events (version_id, event_description, outcome) VALUES (?, ?, ?)',
        [v.insertId, String(inquiry.body || inquiry.subject || 'Reported by email').slice(0, 2000), 'unknown']
      ).catch(() => {});
    }

    // Assignment (decision #4).
    assigneeId = await pickAssignee(conn, inquiry.org_id);
    if (assigneeId) {
      await conn.execute('UPDATE cases SET case_owner_id = ? WHERE id = ?', [assigneeId, caseId]);
    }

    // Immutable source record (decision #11). The raw .eml is persisted
    // read-only on disk; this row is never updated or deleted.
    let emlPath = null;
    if (parsed?.source) {
      try {
        const baseDir = path.join(__dirname, '..', 'storage', 'email_case_sources', String(inquiry.org_id));
        await fs.promises.mkdir(baseDir, { recursive: true });
        emlPath = path.join(baseDir, `case-${caseId}-inquiry-${inquiry.id}.eml`);
        await fs.promises.writeFile(emlPath, parsed.source, { mode: 0o444 });
      } catch (e) {
        logger.warn({ case_id: caseId, error: String(e?.message || e).slice(0, 160) }, 'ECI: .eml persist failed');
        emlPath = null;
      }
    }
    await conn.execute(
      `INSERT INTO email_case_sources
         (org_id, case_id, inquiry_id, kind, message_id, sender, recipient, subject, body, received_at, eml_path, content_sha256, extraction)
       VALUES (?, ?, ?, 'original', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inquiry.org_id, caseId, inquiry.id, parsed?.messageId || inquiry.message_id || null,
       inquiry.sender, inquiry.recipient, inquiry.subject, inquiry.body, receivedTs, emlPath,
       crypto.createHash('sha256').update(String(inquiry.body || '')).digest('hex'),
       JSON.stringify({
         model: verdict.model, confidence: verdict.confidence,
         case_type: verdict.caseType, secondary_case_type: verdict.secondaryCaseType,
         extracted: verdict.extracted, serious_hints: verdict.seriousHints,
         evidence_scores: {
           ae: verdict.evidence.ae.score, pc: verdict.evidence.pc.score,
           mi: verdict.evidence.mi.score, junk: verdict.evidence.junk.score,
         },
       })]
    );

    // Visible AI-assisted label (decision #1) + clinical hints (decision #20).
    const hintText = verdict.seriousHints.length
      ? ` Possible-serious hints for reviewer (NOT an assessment): ${verdict.seriousHints.join(', ')}.`
      : '';
    await conn.execute(
      `INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, NULL, ?)`,
      [caseId,
       `Created from email — AI-assisted (confidence ${verdict.confidence}). ` +
       `Classified as ${verdict.caseType}${verdict.secondaryCaseType ? ` (secondary: ${verdict.secondaryCaseType})` : ''}. ` +
       `Extracted fields: ${Object.keys(verdict.extracted).length ? JSON.stringify(verdict.extracted) : 'none'}.` +
       hintText + ' Agent verification required.']
    );

    await conn.execute(
      `UPDATE inquiries
          SET case_id = ?, status = 'processed', triage_state = 'converted',
              routing_reason = 'auto: email case import',
              first_touched_at = COALESCE(first_touched_at, NOW()), last_action_at = NOW()
        WHERE id = ?`,
      [caseId, inquiry.id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }

  // ── Post-commit side effects (best-effort) ────────────────────────────────
  await audit('EMAIL_CASE_AUTO_CREATED', 'case', caseId, {
    inquiry_id: inquiry.id, case_number: caseNumber, case_type: verdict.caseType,
    secondary_case_type: verdict.secondaryCaseType, confidence: verdict.confidence,
    assigned_to: assigneeId, awareness_date: verdict.caseType === 'AE' ? receivedTs : null,
  });
  if (assigneeId) {
    await audit('EMAIL_CASE_AUTO_ASSIGNED', 'case', caseId, { assigned_to: assigneeId, rule: config.assignment_rule });
  }

  // Alerts (decision #14): assigned agent + org leads.
  const notifyIds = new Set();
  if (assigneeId) notifyIds.add(assigneeId);
  if (config.alert_recipients !== 'agent_only') {
    const [admins] = await pool.execute(
      `SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND (is_active = 1 OR is_active IS NULL)`,
      [inquiry.org_id]
    );
    admins.forEach((a) => notifyIds.add(a.id));
  }
  await createNotifications([...notifyIds], {
    category: 'case',
    title: `Email case created: ${caseNumber || `Case ${caseId}`}`,
    message: assigneeId
      ? `A new ${verdict.caseType} case was auto-created from email and assigned. AI-assisted — verification required.`
      : `A new ${verdict.caseType} case was auto-created from email. No active agent was available — it is UNASSIGNED and needs an owner.`,
    linkUrl: `/cases/${caseId}`,
    severity: assigneeId ? 'info' : 'warning',
    eventKey: `eci_created_${caseId}`,
  }).catch(() => {});

  const ack = await sendAcknowledgment({
    account, config, orgId: inquiry.org_id, toEmail: inquiry.sender, variant: 'standard',
  });

  emitDataSync({
    orgIds: [Number(inquiry.org_id || 0)],
    domains: ['inbox', 'cases', 'dashboard'],
    reason: 'eci.case_created',
    payload: { inquiryId: inquiry.id, caseId },
  });

  return { action: 'case_created', caseId, caseNumber, caseType: verdict.caseType, assigneeId, ack };
}

// ── Main entry (called by emailPoller for is_case_intake accounts) ──────────

async function processInquiry({ inquiryId, account, parsed = {} }) {
  const [[inquiry]] = await pool.execute('SELECT * FROM inquiries WHERE id = ? LIMIT 1', [inquiryId]);
  if (!inquiry) return { action: 'skipped', reason: 'inquiry_not_found' };
  if (!inquiry.org_id) return { action: 'skipped', reason: 'no_org' };
  if (inquiry.case_id) return { action: 'skipped', reason: 'already_linked' };

  const config = await getConfig(inquiry.org_id);
  if (!config.is_enabled) return { action: 'skipped', reason: 'disabled' };

  // Follow-up/thread → attach to existing case, never a second case (#5).
  const thread = await findExistingCaseForThread({
    orgId: inquiry.org_id,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    sender: inquiry.sender,
    subject: inquiry.subject,
  });
  if (thread) return attachFollowUp({ inquiry, caseId: thread.caseId, matchedBy: thread.matchedBy, parsed });

  const defs = await getIntakeFieldDefs(inquiry.org_id);
  const verdict = classifyEmail({ subject: inquiry.subject, body: inquiry.body, fieldDefs: defs });

  // Junk: never auto-cased AND never dropped — stays in the Inbox (#16).
  if (verdict.isJunk) {
    await pool.execute(
      `UPDATE inquiries SET routing_reason = 'auto: junk suspected — left in inbox' WHERE id = ?`,
      [inquiry.id]
    );
    await audit('EMAIL_CASE_JUNK_SUSPECTED', 'inquiry', inquiry.id, { evidence: verdict.evidence.junk });
    return { action: 'junk_left_in_inbox' };
  }

  const reasons = [];
  if (verdict.possibleAe) reasons.push('possible AE — asymmetric rule forces human review');
  if (verdict.confidence < config.confidence_threshold) reasons.push(`confidence ${verdict.confidence} below threshold ${config.confidence_threshold}`);
  if (verdict.missingRequired.length) reasons.push(`missing required intake fields: ${verdict.missingRequired.join(', ')}`);
  const typeEnabled = { MI: config.enable_mi, AE: config.enable_ae, PC: config.enable_pc }[verdict.caseType];
  if (!typeEnabled) reasons.push(`case type ${verdict.caseType} disabled for auto-creation`);

  if (reasons.length) return routeToReview({ inquiry, account, config, verdict, reasons });

  return createCaseFromInquiry({ inquiry, account, config, verdict, defs, parsed });
}

// ── SLA escalation job (MIMS-38, decision #13) ──────────────────────────────

// "1 business day" default: the deadline skips Saturday/Sunday.
function addBusinessHours(start, hours) {
  const d = new Date(start);
  let remaining = Number(hours) || 24;
  while (remaining > 0) {
    d.setHours(d.getHours() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}

async function runSlaSweep() {
  const [configs] = await pool.execute(
    `SELECT * FROM email_case_import_config WHERE is_enabled = 1`
  );
  let escalated = 0;
  for (const cfg of configs) {
    const [candidates] = await pool.execute(
      `SELECT c.id, c.case_number, c.created_at, c.org_id
         FROM cases c
         JOIN workflow_states ws ON ws.id = c.status_id AND ws.name = 'Email Intake'
        WHERE c.org_id = ? AND c.is_deleted = 0 AND c.intake_channel = 'email'
          AND c.escalated_at IS NULL
          AND c.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
      [cfg.org_id, Number(cfg.sla_hours) || 24]
    );
    for (const c of candidates) {
      const deadline = addBusinessHours(c.created_at, Number(cfg.sla_hours) || 24);
      if (new Date() < deadline) continue; // weekend-adjusted deadline not reached yet
      await pool.execute(
        `UPDATE cases SET escalated_at = NOW(), escalation_level = 1,
                escalation_reason = ? WHERE id = ? AND escalated_at IS NULL`,
        [`Email Intake SLA breach — unreviewed for over ${cfg.sla_hours} business hours`, c.id]
      );
      const [admins] = await pool.execute(
        `SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND (is_active = 1 OR is_active IS NULL)`,
        [c.org_id]
      );
      await createNotifications(admins.map((a) => a.id), {
        category: 'case',
        title: `SLA breach: ${c.case_number || `Case ${c.id}`} unreviewed`,
        message: `An email-intake case has sat unreviewed past the ${cfg.sla_hours} business-hour window and was escalated.`,
        linkUrl: `/cases/${c.id}`,
        severity: 'warning',
        eventKey: `eci_sla_${c.id}`,
      }).catch(() => {});
      await audit('EMAIL_CASE_SLA_ESCALATED', 'case', c.id, { sla_hours: cfg.sla_hours });
      escalated += 1;
    }
  }
  return escalated;
}

let _slaTask = null;
function startSlaScheduler() {
  if (_slaTask) return _slaTask;
  const cron = require('node-cron');
  _slaTask = cron.schedule('*/15 * * * *', () => {
    runSlaSweep().catch((err) => {
      logger.warn({ error: String(err?.message || err).slice(0, 200) }, 'ECI: SLA sweep failed');
    });
  });
  logger.info('Email Case Import SLA scheduler started (every 15 min)');
  return _slaTask;
}

function stopSlaScheduler() {
  if (_slaTask) { _slaTask.stop(); _slaTask = null; }
}

module.exports = {
  processInquiry,
  getConfig,
  getIntakeFieldDefs,
  runSlaSweep,
  startSlaScheduler,
  stopSlaScheduler,
  // exported for tests
  addBusinessHours,
  REPORTER_FIELD_ALLOWLIST,
  CASE_FIELD_ALLOWLIST,
  CONFIG_DEFAULTS,
};
