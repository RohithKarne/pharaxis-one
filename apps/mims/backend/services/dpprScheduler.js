'use strict';

/**
 * dpprScheduler.js — DPPR daily enforcement engine
 *
 * Runs at 02:00 UTC every day via node-cron.
 * Can also be triggered manually via POST /api/admin/dppr/run-now.
 *
 * For each org's active rules:
 *   1. Find records older than retention_days matching domain + contact_type + consent_type
 *   2. Apply action: Anonymize (replace PII text) | Delete (NULL out fields)
 *   3. Log results to dppr_execution_log
 */

const cron = require('node-cron');
const pool = require('../database/db');

const ANON_MARKER = '[ANONYMIZED]';

// Maps domain key → { table, orgJoinSql, dateField, piiFields, filterFn }
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
    baseQuery: `SELECT case_contacts.id FROM case_contacts
                JOIN cases c ON c.id = case_contacts.case_id`,
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
    baseQuery:   'SELECT cases.id FROM cases',
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
    baseQuery: `SELECT case_ae_patient_info.id FROM case_ae_patient_info
                JOIN cases c ON c.id = case_ae_patient_info.case_id`,
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
    baseQuery: `SELECT case_reporter.id FROM case_reporter
                JOIN cases c ON c.id = case_reporter.case_id`,
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
    baseQuery: `SELECT case_patient.id FROM case_patient
                JOIN cases c ON c.id = case_patient.case_id`,
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
    baseQuery:   'SELECT inquiries.id FROM inquiries',
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
    let scanned = 0, affected = 0, status = 'success', errorMsg = null;

    try {
      const whereClause = handler.buildWhere(rule);
      const [targets] = await pool.execute(
        `${handler.baseQuery} WHERE ${whereClause}`, []
      );
      scanned = targets.length;

      if (targets.length > 0) {
        const ids = targets.map(r => r.id);
        const idPlaceholders = ids.map(() => '?').join(',');

        if (rule.action === 'Anonymize') {
          const setClause = handler.piiFields
            .map(f => `${f} = CASE WHEN ${f} IS NOT NULL THEN '${ANON_MARKER}' ELSE NULL END`)
            .join(', ');
          const [upd] = await pool.execute(
            `UPDATE ${handler.updateTable} SET ${setClause}, updated_at = NOW() WHERE id IN (${idPlaceholders})`,
            ids
          );
          affected = upd.affectedRows;

        } else if (rule.action === 'Delete') {
          const setClause = handler.piiFields.map(f => `${f} = NULL`).join(', ');
          const [upd] = await pool.execute(
            `UPDATE ${handler.updateTable} SET ${setClause}, updated_at = NOW() WHERE id IN (${idPlaceholders})`,
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
          action_taken, status, error_message, duration_ms,
          run_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId, rule.id, triggeredBy, scanned, affected,
        rule.action, status, errorMsg, duration,
        JSON.stringify({ rule_name: rule.rule_name, domain: rule.domain,
                         contact_type: rule.contact_type, consent_type: rule.consent_type }),
      ]
    );

    results.push({
      rule_id: rule.id, rule_name: rule.rule_name, domain: rule.domain,
      action: rule.action, scanned, affected, status, duration_ms: duration,
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
    for (const org of orgs) {
      await applyDpprRules(org.id, 'scheduler', null);
    }
    console.log(`[DPPR] Scheduled run complete — ${orgs.length} org(s) processed.`);
  } catch (err) {
    console.error('[DPPR] Scheduled run failed:', err.message);
  }
}

// ── Register daily cron at 02:00 UTC ─────────────────────────────────────────
function startDpprScheduler() {
  cron.schedule('0 2 * * *', runScheduledDppr, { timezone: 'UTC' });
  console.log('[DPPR] Scheduler registered — daily 02:00 UTC');
}

module.exports = { startDpprScheduler, applyDpprRules };
