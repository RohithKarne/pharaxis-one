'use strict';

/**
 * inquiryLedger — MIPM-223: every open inquiry, from every channel, by how long it
 * has waited (Rohith, 27 Oct 2026, B2 and decisions 2 and 5).
 *
 * MIMS takes inquiries from connected portals, by email and by hand, and no screen
 * showed them all by age: one nobody picked up was found by chance. Each open case
 * is in one stage:
 *   waiting for an owner     — nobody owns it
 *   with an owner            — owned, not yet answered or handed off
 *   answered or handed off   — an answer went out (MI) or a hand-off to the safety /
 *                              quality system started (AE / PC); waiting to close
 * and carries a light from its age (since MIMS received it) against LIMITS. Answered
 * cases carry none. Closed and deleted cases are not in the Ledger.
 *
 * sweep() runs on the scheduler: a case newly red gets one in-app notice — its
 * owner, or the case supervisors when nobody owns it — and alert email through the
 * MIMS alert-mail switch (off unless MIMS_ALERT_EMAIL is on, Rohith 2026-09-05).
 * More than SUMMARY_OVER new reds for one organisation in one sweep send one summary
 * instead. Each (case, stage) is told once, recorded in inquiry_ledger_alerts.
 */

const pool = require('../database/db');
const { createNotifications } = require('./notificationCenterService');
const { getCaseSupervisors } = require('./intakeAlertService');
const { logger } = require('./logger');

// Minutes. A serious side effect is an AE case MIMS raised to high or urgent priority
// (a portal report of seriousness does that on arrival, bridge plan P2).
const LIMITS = {
  waiting_owner: { amber: 4 * 60, red: 8 * 60 },
  waiting_owner_serious: { amber: 60, red: 2 * 60 },
  with_owner: { amber: 3 * 24 * 60, red: 5 * 24 * 60 },
};
const SUMMARY_OVER = 20;
const PAGE_SIZE = 50;

const SERIOUS = "(c.case_type = 'AE' AND c.priority IN ('high', 'urgent'))";
const ANSWERED = `(EXISTS (SELECT 1 FROM case_mi_responses r WHERE r.case_id = c.id AND r.response_status = 'SENT' AND r.voided_at IS NULL)
  OR EXISTS (SELECT 1 FROM case_ae_transmissions t WHERE t.case_id = c.id)
  OR EXISTS (SELECT 1 FROM case_pc_transmissions p WHERE p.case_id = c.id))`;
const STAGE = `CASE WHEN ${ANSWERED} THEN 'answered' WHEN c.case_owner_id IS NULL THEN 'waiting_owner' ELSE 'with_owner' END`;
const AGE = 'TIMESTAMPDIFF(MINUTE, c.created_at, NOW())';
const LIGHT = `CASE
  WHEN x.stage = 'answered' THEN 'none'
  WHEN x.stage = 'waiting_owner' AND x.serious = 1 THEN CASE WHEN x.age_minutes >= ${LIMITS.waiting_owner_serious.red} THEN 'red' WHEN x.age_minutes >= ${LIMITS.waiting_owner_serious.amber} THEN 'amber' ELSE 'green' END
  WHEN x.stage = 'waiting_owner' THEN CASE WHEN x.age_minutes >= ${LIMITS.waiting_owner.red} THEN 'red' WHEN x.age_minutes >= ${LIMITS.waiting_owner.amber} THEN 'amber' ELSE 'green' END
  ELSE CASE WHEN x.age_minutes >= ${LIMITS.with_owner.red} THEN 'red' WHEN x.age_minutes >= ${LIMITS.with_owner.amber} THEN 'amber' ELSE 'green' END
END`;
const CHANNEL = `CASE WHEN c.source_api_client_id IS NOT NULL OR LOWER(c.intake_channel) = 'portal' THEN 'portal'
  WHEN LOWER(c.intake_channel) = 'email' THEN 'email'
  WHEN LOWER(c.intake_channel) = 'manual' THEN 'hand' ELSE 'other' END`;
const CHANNEL_LABEL = { portal: 'Connected portal', email: 'Email', hand: 'Entered by hand', other: 'Other' };

// Every open case of the organisation, with its stage, light and channel. `where`
// narrows the inner list (e.g. own cases); params follow orgId.
function openCasesSql(where = '') {
  return `SELECT x.*, ${LIGHT} AS light FROM (
      SELECT c.id, c.case_number, c.case_type, c.priority, c.case_owner_id, c.created_at, c.source_api_client_id,
             ${SERIOUS} AS serious, ${STAGE} AS stage, ${AGE} AS age_minutes, ${CHANNEL} AS channel
        FROM cases c
        LEFT JOIN workflow_states ws ON ws.id = c.status_id
       WHERE c.org_id = ? AND c.is_deleted = 0 AND COALESCE(ws.is_closed, 0) = 0 ${where}
    ) x`;
}

/** The Ledger for one reader: tiles, and one page of rows (reddest and oldest first). */
async function ledger({ orgId, ownUserId = null, channel = null, stage = null, light = null, page = 1 }) {
  const ownWhere = ownUserId ? 'AND (c.case_owner_id = ? OR c.created_by = ?)' : '';
  const ownParams = ownUserId ? [ownUserId, ownUserId] : [];
  const base = openCasesSql(ownWhere);

  const [[tiles]] = await pool.execute(
    `SELECT COUNT(*) AS open_total,
            COALESCE(SUM(stage = 'waiting_owner'), 0) AS waiting_owner, COALESCE(SUM(stage = 'with_owner'), 0) AS with_owner,
            COALESCE(SUM(stage = 'answered'), 0) AS answered,
            COALESCE(SUM(light = 'amber'), 0) AS amber, COALESCE(SUM(light = 'red'), 0) AS red
       FROM (${base}) l`, [orgId, ...ownParams]);
  const [received] = await pool.execute(
    `SELECT ${CHANNEL} AS channel, COUNT(*) AS n FROM cases c
      WHERE c.org_id = ? AND c.is_deleted = 0 AND c.created_at >= NOW() - INTERVAL 1 DAY ${ownWhere}
      GROUP BY channel`, [orgId, ...ownParams]);

  const filters = [];
  const fParams = [];
  if (channel && CHANNEL_LABEL[channel]) { filters.push('l.channel = ?'); fParams.push(channel); }
  if (stage && ['waiting_owner', 'with_owner', 'answered'].includes(stage)) { filters.push('l.stage = ?'); fParams.push(stage); }
  if (light && ['red', 'amber', 'green', 'none'].includes(light)) { filters.push('l.light = ?'); fParams.push(light); }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const p = Math.max(1, parseInt(page, 10) || 1);
  const total = filters.length
    ? (await pool.execute(`SELECT COUNT(*) AS total FROM (${base}) l ${where}`, [orgId, ...ownParams, ...fParams]))[0][0].total
    : tiles.open_total;
  const [rows] = await pool.execute(
    `SELECT l.*, u.name AS owner_name, a.name AS source_name
       FROM (${base}) l
       LEFT JOIN users u ON u.id = l.case_owner_id
       LEFT JOIN api_clients a ON a.id = l.source_api_client_id
       ${where}
      ORDER BY FIELD(l.light, 'red', 'amber', 'green', 'none'), l.age_minutes DESC, l.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${(p - 1) * PAGE_SIZE}`, [orgId, ...ownParams, ...fParams]);

  return {
    limits: LIMITS,
    tiles: {
      open_total: Number(tiles.open_total), waiting_owner: Number(tiles.waiting_owner), with_owner: Number(tiles.with_owner),
      answered: Number(tiles.answered), amber: Number(tiles.amber), red: Number(tiles.red),
      received_24h: Object.keys(CHANNEL_LABEL).map(k => ({ channel: k, label: CHANNEL_LABEL[k], n: Number(received.find(r => r.channel === k)?.n || 0) })),
    },
    rows: rows.map(r => ({
      id: r.id, case_number: r.case_number, case_type: r.case_type, serious: !!Number(r.serious),
      channel: r.channel, channel_label: r.channel === 'portal' && r.source_name ? r.source_name : CHANNEL_LABEL[r.channel],
      stage: r.stage, light: r.light, age_minutes: Number(r.age_minutes), received_at: r.created_at,
      owner_name: r.owner_name || null,
    })),
    total: Number(total), page: p, page_size: PAGE_SIZE,
    own_only: !!ownUserId,
  };
}

function describeAge(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 120) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}

const STAGE_TEXT = { waiting_owner: 'is waiting for an owner', with_owner: 'has had no answer or hand-off' };

async function emailUsers(userIds, title, message, linkUrl) {
  if (!userIds.length) return;
  try {
    const [users] = await pool.execute(`SELECT email FROM users WHERE id IN (${userIds.map(() => '?').join(',')}) AND email LIKE '%@%'`, userIds);
    const { sendAlertEmail } = require('./alertService');
    // A full link, as the sign-in email builds it: a bare path does not open from an inbox.
    const link = `${(process.env.MIMS_FRONTEND_BASE_URL || '').replace(/\/$/, '')}${linkUrl}`;
    const out = await sendAlertEmail({ recipients: users.map(u => u.email), title, message: `${message}\n\nOpen it here (sign-in required): ${link}`, metadata: { link } });
    if (out.status !== 'sent') logger.info({ status: out.status, error: out.error }, 'inquiry ledger: alert email not sent');
  } catch (err) {
    logger.warn({ err: err.message }, 'inquiry ledger: alert email failed');
  }
}

/** Scheduler sweep: tell people about cases that have newly turned red. */
async function sweep() {
  const [orgs] = await pool.execute('SELECT id FROM organisations');
  let told = 0;
  for (const { id: orgId } of orgs) {
    try {
      const [reds] = await pool.execute(
        `SELECT l.* FROM (${openCasesSql()}) l
          WHERE l.light = 'red' AND NOT EXISTS (SELECT 1 FROM inquiry_ledger_alerts a WHERE a.case_id = l.id AND a.stage = l.stage)
          ORDER BY l.age_minutes DESC`, [orgId]);
      if (!reds.length) continue;
      const supervisors = await getCaseSupervisors(orgId);
      if (reds.length > SUMMARY_OVER) {
        const title = `${reds.length} inquiries are past their limit`;
        const message = `${reds.filter(r => r.stage === 'waiting_owner').length} are waiting for an owner and ${reds.filter(r => r.stage === 'with_owner').length} have had no answer or hand-off. The Inquiry Ledger lists them, reddest first.`;
        await createNotifications(supervisors, {
          category: 'inquiry_ledger', severity: 'warning', title, message, linkUrl: '/inquiry-ledger?light=red',
          metadata: { org_id: orgId, count: reds.length }, eventKey: `ledger-summary:${orgId}:${Date.now()}`,
        });
        await emailUsers(supervisors, title, message, '/inquiry-ledger?light=red');
        told += supervisors.length;
      } else {
        for (const c of reds) {
          const to = c.stage === 'with_owner' && c.case_owner_id ? [c.case_owner_id] : supervisors;
          const what = Number(c.serious) ? 'Serious side effect' : { MI: 'Medical inquiry', AE: 'Side-effect report', PC: 'Product complaint' }[c.case_type] || 'Case';
          const title = `${what} ${c.case_number || `#${c.id}`} ${STAGE_TEXT[c.stage]} after ${describeAge(c.age_minutes)}`;
          const message = c.stage === 'waiting_owner'
            ? 'Nobody owns this case. Open it to assign an owner.'
            : 'You own this case and it has had no answer or hand-off yet.';
          await createNotifications(to, {
            category: 'inquiry_ledger', severity: Number(c.serious) ? 'critical' : 'warning', title, message,
            linkUrl: `/cases/${c.id}`, metadata: { case_id: c.id, stage: c.stage }, eventKey: `ledger-red:${c.id}:${c.stage}`,
            // As the intake notice does for a serious report (bridge feature F2): it stays until someone acknowledges it.
            requiresAcknowledgement: !!Number(c.serious),
          });
          await emailUsers(to, title, message, `/cases/${c.id}`);
          told += to.length;
        }
      }
      // Recorded whether told one by one or in the summary, so nobody is told twice.
      for (let i = 0; i < reds.length; i += 500) {
        const chunk = reds.slice(i, i + 500);
        await pool.query(
          `INSERT IGNORE INTO inquiry_ledger_alerts (case_id, stage, org_id, summary) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}`,
          chunk.flatMap(c => [c.id, c.stage, orgId, reds.length > SUMMARY_OVER ? 1 : 0]));
      }
    } catch (err) {
      logger.error({ err, org_id: orgId }, 'inquiry ledger sweep failed for organisation');
    }
  }
  return told;
}

module.exports = { ledger, sweep, LIMITS, SUMMARY_OVER };
