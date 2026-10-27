/**
 * deliveryTarget — CPPM-158: every report reaches MIMS within 15 minutes, a side
 * effect the reporter marked serious within 5 (Rohith, 27 Oct 2026, decision 3).
 *
 * A report still not in MIMS at twice its target raises one alert, which closes when
 * the report arrives. Before, a report raised nothing until six tries had failed or
 * MIMS refused it, so a slow report, or one stuck before its first try, waited
 * unseen. The sweep runs on the scheduled-work job, not the sending job, so a
 * stopped sender is still caught.
 *
 * monthFigures() measures the month: how many arrived within target, the median
 * and the slowest, serious reports separately. A report's delivery is its first
 * recorded arrival in MIMS; a later re-send does not reset it.
 */
const { pool } = require('../database/db');
const { raiseAlert, clearAlerts } = require('./adminAlerts');
const log = require('../utils/logger');

const TARGET_MINUTES = 15;
const SERIOUS_TARGET_MINUTES = 5;
const ALERT_AT = 2; // times the target
const MIMS_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint'];
const TYPE_LABEL = { medical_inquiry: 'Medical inquiry', adverse_event: 'Side-effect report', product_complaint: 'Product complaint' };

// The same words MIMS reads the reporter's seriousness answer with (apiPlatform.js,
// bridge plan P2), so the portal and MIMS agree on which reports are serious.
const SERIOUSNESS_WORDS = [/death|died|fatal/i, /life[\s-]*threat/i, /hospital/i, /disab|incapacit/i, /congenital|birth defect/i, /^other\b|medically important/i];

function isReportedSerious(submissionType, formData) {
  if (submissionType !== 'adverse_event') return false;
  let data = formData;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return false; } }
  const raw = data && (data.seriousness ?? data.seriousness_criteria ?? data.serious);
  if (raw == null) return false;
  const answers = (Array.isArray(raw) ? raw : String(raw).split(/[\n,;]+/)).map(s => String(s).trim()).filter(Boolean);
  return answers.some(a => SERIOUSNESS_WORDS.some(re => re.test(a)));
}

function targetMinutes(serious) {
  return serious ? SERIOUS_TARGET_MINUTES : TARGET_MINUTES;
}

const ref = id => `CP-${String(id).padStart(6, '0')}`;

/** Scheduler sweep: reports past twice their target and still not in MIMS. */
async function sweepLateDeliveries() {
  try {
    const [rows] = await pool.execute(
      `SELECT s.id, s.client_id, s.submission_type, s.form_data, s.status, s.sync_attempts, s.sync_error,
              TIMESTAMPDIFF(MINUTE, s.submitted_at, NOW()) AS age_minutes
         FROM cp_submissions s
         JOIN cp_integration_config i ON i.client_id = s.client_id AND i.is_active = 1
        WHERE s.status IN ('submitted', 'pending_sync', 'failed_sync')
          AND s.submission_type IN ('medical_inquiry', 'adverse_event', 'product_complaint')
          AND s.submitted_at >= i.created_at
          AND s.submitted_at < NOW() - INTERVAL ${SERIOUS_TARGET_MINUTES * ALERT_AT} MINUTE
        ORDER BY s.id ASC LIMIT 200`);
    let raised = 0;
    for (const s of rows) {
      const serious = isReportedSerious(s.submission_type, s.form_data);
      const target = targetMinutes(serious);
      if (Number(s.age_minutes) < target * ALERT_AT) continue;
      const what = serious ? 'Serious side-effect report' : TYPE_LABEL[s.submission_type];
      const id = await raiseAlert(s.client_id, {
        kind: 'delivery_late', audience: serious ? 'safety' : 'integration',
        title: `${what} ${ref(s.id)} is not in MIMS after ${s.age_minutes} minutes`,
        body: `The target is ${target} minutes${serious ? ' for a side effect reported as serious' : ''}. ${s.sync_attempts ? `It has been tried ${s.sync_attempts} time${s.sync_attempts === 1 ? '' : 's'}${s.sync_error ? `; the last answer was: ${String(s.sync_error).slice(0, 300).replace(/[.\s]+$/, '')}` : ''}.` : 'It has not been tried yet.'} Sync Health shows it and can send it again; this alert closes when it reaches MIMS.`,
        linkPath: `/admin/clients/${s.client_id}/sync-health`,
        relatedType: 'submission', relatedId: s.id, dedupeKey: `late:${s.id}`,
      });
      if (id) raised++;
    }
    // A report that arrived, or was closed by hand, clears its alert here too, in case
    // the path that delivered it did not.
    const [open] = await pool.execute(
      `SELECT a.client_id, a.dedupe_key FROM cp_admin_alerts a JOIN cp_submissions s ON s.id = a.related_id
        WHERE a.kind = 'delivery_late' AND a.resolved_at IS NULL AND s.status IN ('synced', 'closed')`);
    for (const a of open) await clearAlerts(a.client_id, a.dedupe_key, 'system: the report reached MIMS');
    return raised;
  } catch (err) {
    log.error('delivery_target.sweep_failed', { err });
    return 0;
  }
}

function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function summarise(list) {
  const secs = list.filter(r => r.delivery_seconds != null).map(r => Number(r.delivery_seconds));
  return {
    received: list.length,
    delivered: secs.length,
    within_target: list.filter(r => r.delivery_seconds != null && Number(r.delivery_seconds) <= r.target_minutes * 60).length,
    median_seconds: median(secs),
    slowest_seconds: secs.length ? Math.max(...secs) : null,
  };
}

/**
 * Delivery time for the reports submitted in one month (YYYY-MM, UTC), for one client:
 * all reports and serious ones, plus the reports that missed the target.
 */
async function monthFigures(clientId, month) {
  const [rows] = await pool.execute(
    `SELECT s.id, s.submission_type, s.form_data, s.submitted_at,
            TIMESTAMPDIFF(SECOND, s.submitted_at,
              CASE WHEN e.first_synced IS NULL THEN s.synced_at
                   WHEN s.synced_at IS NULL THEN e.first_synced
                   ELSE LEAST(e.first_synced, s.synced_at) END) AS delivery_seconds
       FROM cp_submissions s
       JOIN (SELECT client_id, MIN(created_at) AS created_at FROM cp_integration_config GROUP BY client_id) i ON i.client_id = s.client_id
       LEFT JOIN (SELECT submission_id, MIN(created_at) AS first_synced FROM cp_submission_status_events
                   WHERE status = 'synced' GROUP BY submission_id) e ON e.submission_id = s.id
      WHERE s.client_id = ? AND s.submission_type IN ('medical_inquiry', 'adverse_event', 'product_complaint')
        AND s.submitted_at >= i.created_at
        AND s.submitted_at >= ? AND s.submitted_at < ? + INTERVAL 1 MONTH
      ORDER BY s.id`,
    [clientId, `${month}-01`, `${month}-01`]);
  const list = rows.map(r => {
    const serious = isReportedSerious(r.submission_type, r.form_data);
    return { id: r.id, reference: ref(r.id), submission_type: r.submission_type, serious, target_minutes: targetMinutes(serious),
      submitted_at: r.submitted_at, delivery_seconds: r.delivery_seconds == null ? null : Math.max(0, Number(r.delivery_seconds)) };
  });
  return {
    month, target_minutes: TARGET_MINUTES, serious_target_minutes: SERIOUS_TARGET_MINUTES,
    all: summarise(list),
    serious: summarise(list.filter(r => r.serious)),
    missed: list.filter(r => r.delivery_seconds == null || r.delivery_seconds > r.target_minutes * 60)
      .map(({ id, reference, submission_type, serious, target_minutes, submitted_at, delivery_seconds }) =>
        ({ id, reference, submission_type, serious, target_minutes, submitted_at, delivery_seconds })),
  };
}

module.exports = { sweepLateDeliveries, monthFigures, isReportedSerious, TARGET_MINUTES, SERIOUS_TARGET_MINUTES, MIMS_TYPES };
