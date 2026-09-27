'use strict';

/**
 * dpprScheduler.js — DPPR daily enforcement engine
 *
 * Runs at 02:00 UTC every day via node-cron — only when ENABLE_SCHEDULED_DPPR=true.
 * Can also be triggered manually via POST /api/admin/dppr/run-now.
 *
 * For each org's active rules:
 *   1. Find records older than retention_days matching domain + contact_type + consent_type
 *   2. Leave out records under an active legal hold (legal_holds, migration 110)
 *   3. Apply action: Anonymize (replace PII text) | Delete (NULL out fields)
 *   4. Log results to dppr_execution_log, including how many were skipped for hold
 */

const cron = require('node-cron');
const pool = require('../database/db');

const ANON_MARKER = '[ANONYMIZED]';

// True when an active legal hold names the case in caseIdCol. It references only
// the updated table's own columns, so the same text works in the SELECT that
// finds targets and in the UPDATE — a hold placed mid-run still wins.
function caseHeldSql(caseIdCol) {
  return `EXISTS (SELECT 1 FROM legal_holds lh WHERE lh.released_at IS NULL
                  AND lh.entity_type = 'case' AND lh.entity_id = ${caseIdCol})`;
}

// Maps domain key → { table, dateField, piiFields, buildWhere, fromSql, heldSql, updateTable }
const DOMAIN_HANDLERS = {
  contact_pii: {
    table:       'case_contacts',
    dateField:   'case_contacts.created_at',
    piiFields:   ['first_name', 'last_name', 'email', 'phone', 'address'],
    buildWhere: (rule) => {
      const parts = [
        `DATEDIFF(NOW(), case_contacts.created_at) >= ${parseInt(rule.retention_days, 10)}`,
        `c.org_id = ${parseInt(rule.org_id, 10)}`,
      ];
      if (rule.contact_type && rule.contact_type !== 'all') {
        parts.push(`case_contacts.contact_type = '${rule.contact_type.replace(/'/g, '')}'`);
      }
      return parts.join(' AND ');
    },
    fromSql: `FROM case_contacts
              JOIN cases c ON c.id = case_contacts.case_id`,
    heldSql:     caseHeldSql('case_contacts.case_id'),
    updateTable: 'case_contacts',
  },

  case_narrative: {
    table:     'cases',
    dateField: 'cases.created_at',
    piiFields: ['description', 'internal_notes'],
    buildWhere: (rule) => [
      `DATEDIFF(NOW(), cases.created_at) >= ${parseInt(rule.retention_days, 10)}`,
      `cases.org_id = ${parseInt(rule.org_id, 10)}`,
    ].join(' AND '),
    fromSql:     'FROM cases',
    heldSql:     caseHeldSql('cases.id'),
    updateTable: 'cases',
  },

  medical_data: {
    table:     'case_ae_patient_info',
    dateField: 'case_ae_patient_info.created_at',
    piiFields: ['patient_dob', 'patient_gender', 'patient_age', 'patient_weight', 'patient_height', 'ethnicity'],
    buildWhere: (rule) => [
      `DATEDIFF(NOW(), case_ae_patient_info.created_at) >= ${parseInt(rule.retention_days, 10)}`,
      `c.org_id = ${parseInt(rule.org_id, 10)}`,
    ].join(' AND '),
    fromSql: `FROM case_ae_patient_info
              JOIN cases c ON c.id = case_ae_patient_info.case_id`,
    heldSql:     caseHeldSql('case_ae_patient_info.case_id'),
    updateTable: 'case_ae_patient_info',
  },

  reporter_info: {
    table:     'case_reporter',
    dateField: 'case_reporter.created_at',
    piiFields: ['reporter_name', 'reporter_email', 'reporter_phone', 'reporter_address', 'institution'],
    buildWhere: (rule) => [
      `DATEDIFF(NOW(), case_reporter.created_at) >= ${parseInt(rule.retention_days, 10)}`,
      `c.org_id = ${parseInt(rule.org_id, 10)}`,
    ].join(' AND '),
    fromSql: `FROM case_reporter
              JOIN cases c ON c.id = case_reporter.case_id`,
    heldSql:     caseHeldSql('case_reporter.case_id'),
    updateTable: 'case_reporter',
  },

  patient_demographics: {
    table:     'case_patient',
    dateField: 'case_patient.created_at',
    piiFields: ['patient_name', 'patient_dob', 'patient_address', 'patient_email', 'patient_phone'],
    buildWhere: (rule) => [
      `DATEDIFF(NOW(), case_patient.created_at) >= ${parseInt(rule.retention_days, 10)}`,
      `c.org_id = ${parseInt(rule.org_id, 10)}`,
    ].join(' AND '),
    fromSql: `FROM case_patient
              JOIN cases c ON c.id = case_patient.case_id`,
    heldSql:     caseHeldSql('case_patient.case_id'),
    updateTable: 'case_patient',
  },

  inquiry_content: {
    table:     'inquiries',
    dateField: 'inquiries.created_at',
    piiFields: ['body', 'sender_name', 'sender_email', 'subject'],
    buildWhere: (rule) => [
      `DATEDIFF(NOW(), inquiries.created_at) >= ${parseInt(rule.retention_days, 10)}`,
      `inquiries.org_id = ${parseInt(rule.org_id, 10)}`,
    ].join(' AND '),
    fromSql:     'FROM inquiries',
    // held when the inquiry itself is held, or the case it is linked to is
    heldSql: `(EXISTS (SELECT 1 FROM legal_holds lh WHERE lh.released_at IS NULL
                       AND lh.entity_type = 'inquiry' AND lh.entity_id = inquiries.id)
               OR ${caseHeldSql('inquiries.case_id')})`,
    updateTable: 'inquiries',
  },
};

/**
 * Apply DPPR rules for a single org.
 * Returns array of per-rule result objects.
 */
async function applyDpprRules(orgId, triggeredBy = 'scheduler', triggeredByUserId = null) {
  const [rules] = await pool.execute(
    'SELECT * FROM dppr_rules WHERE org_id = ? AND is_active = 1 ORDER BY domain ASC',
    [orgId]
  );

  const results = [];

  for (const rule of rules) {
    if (rule.action === 'None') {
      // Passive rule — log with 0 records affected
      const [logResult] = await pool.execute(
        `INSERT INTO dppr_execution_log
           (org_id, rule_id, triggered_by, records_scanned, records_affected, action_taken, status)
         VALUES (?, ?, ?, 0, 0, 'None', 'success')`,
        [orgId, rule.id, triggeredBy]
      );
      results.push({ rule_id: rule.id, rule_name: rule.rule_name, domain: rule.domain,
                     action: 'None', scanned: 0, affected: 0, status: 'success' });
      continue;
    }

    const handler = DOMAIN_HANDLERS[rule.domain];
    if (!handler) {
      results.push({ rule_id: rule.id, domain: rule.domain, status: 'skipped',
                     reason: 'No handler for domain' });
      continue;
    }

    const start = Date.now();
    let scanned = 0, affected = 0, skippedHold = 0, status = 'success', errorMsg = null;

    try {
      const whereClause = handler.buildWhere(rule);
      const [targets] = await pool.execute(
        `SELECT ${handler.updateTable}.id, ${handler.heldSql} AS held ${handler.fromSql} WHERE ${whereClause}`, []
      );
      scanned = targets.length;
      const ids = targets.filter(r => !Number(r.held)).map(r => r.id);
      skippedHold = scanned - ids.length;

      if (ids.length > 0) {
        const idPlaceholders = ids.map(() => '?').join(',');
        const notHeld = `AND NOT ${handler.heldSql}`;

        if (rule.action === 'Anonymize') {
          const setClause = handler.piiFields
            .map(f => `${f} = CASE WHEN ${f} IS NOT NULL THEN '${ANON_MARKER}' ELSE NULL END`)
            .join(', ');
          const [upd] = await pool.execute(
            `UPDATE ${handler.updateTable} SET ${setClause}, updated_at = NOW() WHERE id IN (${idPlaceholders}) ${notHeld}`,
            ids
          );
          affected = upd.affectedRows;

        } else if (rule.action === 'Delete') {
          const setClause = handler.piiFields.map(f => `${f} = NULL`).join(', ');
          const [upd] = await pool.execute(
            `UPDATE ${handler.updateTable} SET ${setClause}, updated_at = NOW() WHERE id IN (${idPlaceholders}) ${notHeld}`,
            ids
          );
          affected = upd.affectedRows;
        }
      }
    } catch (err) {
      status   = 'failed';
      errorMsg = err.message;
      console.error(`[DPPR] Rule ${rule.id} (${rule.domain}) failed:`, err.message);
    }

    const duration = Date.now() - start;
    await pool.execute(
      `INSERT INTO dppr_execution_log
         (org_id, rule_id, triggered_by, records_scanned, records_affected,
          records_skipped_legal_hold, action_taken, status, error_message, duration_ms,
          run_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId, rule.id, triggeredBy, scanned, affected,
        skippedHold, rule.action, status, errorMsg, duration,
        JSON.stringify({ rule_name: rule.rule_name, domain: rule.domain,
                         contact_type: rule.contact_type, consent_type: rule.consent_type }),
      ]
    );

    results.push({
      rule_id: rule.id, rule_name: rule.rule_name, domain: rule.domain,
      action: rule.action, scanned, affected, skipped_legal_hold: skippedHold,
      status, duration_ms: duration,
    });
  }

  return results;
}

/**
 * Run DPPR for all active orgs (scheduler entry point).
 */
async function runScheduledDppr() {
  console.log('[DPPR] Scheduled run starting...');
  try {
    const [orgs] = await pool.execute(
      'SELECT id FROM organisations WHERE is_active = 1'
    );
    let skippedHold = 0;
    for (const org of orgs) {
      const results = await applyDpprRules(org.id, 'scheduler', null);
      skippedHold += results.reduce((n, r) => n + (r.skipped_legal_hold || 0), 0);
    }
    console.log(`[DPPR] Scheduled run complete — ${orgs.length} org(s) processed, ${skippedHold} record(s) skipped for legal hold.`);
  } catch (err) {
    console.error('[DPPR] Scheduled run failed:', err.message);
  }
}

// ── Scheduled enforcement — off unless ENABLE_SCHEDULED_DPPR=true ────────────
// Suspended 2026-08-03 on Rohith Karne's instruction (DCI-5) because
// applyDpprRules() destroyed PII with no legal-hold interlock. The interlock now
// exists (legal_holds, migration 110): every run, scheduled or manual, leaves
// held records untouched and logs how many it skipped.
//
// The daily run stays OFF by default. It registers only when the deployment sets
// ENABLE_SCHEDULED_DPPR=true — a decision for Rohith Karne, not a default.
// The manual path (POST /api/admin/dppr/run-now) works either way.
function isScheduledDpprEnabled() {
  return process.env.ENABLE_SCHEDULED_DPPR === 'true';
}

function startDpprScheduler() {
  if (!isScheduledDpprEnabled()) {
    console.log('[DPPR] Scheduled enforcement OFF — set ENABLE_SCHEDULED_DPPR=true to run daily at 02:00 UTC. Manual Run Now still works.');
    return;
  }
  cron.schedule('0 2 * * *', runScheduledDppr, { timezone: 'UTC' });
  console.log('[DPPR] Scheduler registered — daily 02:00 UTC; records under legal hold are skipped.');
}

module.exports = { startDpprScheduler, applyDpprRules, caseHeldSql, isScheduledDpprEnabled };
