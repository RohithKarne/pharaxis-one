/**
 * zeroLossReport — CPPM-159: one page per client and month that accounts for every
 * report the portal received (Rohith, 27 Oct 2026, B3 and decision 7).
 *
 * The proof that nothing was lost used to be spread over Sync Health, the monthly
 * comparison file and the audit trail. build() gathers it: what was received, what
 * is in MIMS with a receipt, delivery time, the comparisons with MIMS, files and
 * added information, bridge alerts, Other requests, and what the report does not
 * cover. Figures are as they stand when the report is made, for reports submitted
 * in that month (UTC). Nothing in it depends on the hour it is made, so the same
 * facts always give the same fingerprint.
 *
 * The fingerprint is a SHA-256 of the report's contents (not of when or by whom it
 * was made), written to the audit trail each time the report is made, so a printed
 * copy can be checked against it later. It is not an electronic signature, and the
 * report says so (Saad, compliance: MIPM-126 was a file that called itself signed).
 */
const crypto = require('crypto');
const { pool } = require('../database/db');
const { monthFigures } = require('./deliveryTarget');

const TYPE_LABEL = { medical_inquiry: 'Medical inquiries', adverse_event: 'Side-effect reports', product_complaint: 'Product complaints' };
const KIND_LABEL = {
  job_late: 'A bridge job stopped', return_path_late: 'Updates from MIMS stopped', connection_down: 'The portal could not reach MIMS',
  delivery_late: 'A report missed its delivery target', sync_gave_up: 'A report did not reach MIMS after six tries',
  sync_refused: 'MIMS refused a report', sync_unpreparable: 'A report could not be prepared for MIMS',
  receipt_mismatch: 'MIMS held a different version', reconcile_different: 'MIMS held a different version',
  reconcile_many_missing: 'Many reports missing in MIMS at once', file_held: 'A file was held unscanned',
  other_waiting: 'An Other request waited too long', safety_task_waiting: 'A safety task waited too long',
};
const ref = id => `CP-${String(id).padStart(6, '0')}`;

function monthName(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

async function build(clientId, month) {
  const from = `${month}-01`;
  const [[client]] = await pool.execute('SELECT id, name FROM cp_clients WHERE id = ?', [clientId]);
  const [[integ]] = await pool.execute('SELECT MIN(created_at) AS since FROM cp_integration_config WHERE client_id = ?', [clientId]);

  const [subs] = await pool.execute(
    `SELECT id, submission_type, status, external_ref, mims_case_number, sync_key, sync_error,
            DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i') AS submitted
       FROM cp_submissions
      WHERE client_id = ? AND submission_type IN ('medical_inquiry', 'adverse_event', 'product_complaint')
        AND submitted_at >= ? AND submitted_at < ? + INTERVAL 1 MONTH
        ${integ?.since ? 'AND submitted_at >= ?' : 'AND 1 = 0'}
      ORDER BY id`, integ?.since ? [clientId, from, from, integ.since] : [clientId, from, from]);
  const inMims = s => s.external_ref && ['synced', 'closed'].includes(s.status);
  const byType = Object.keys(TYPE_LABEL).map(t => {
    const list = subs.filter(s => s.submission_type === t);
    return { type: t, label: TYPE_LABEL[t], received: list.length, in_mims: list.filter(inMims).length };
  });
  const notInMims = subs.filter(s => !inMims(s)).map(s => ({
    reference: ref(s.id), type: TYPE_LABEL[s.submission_type], status: s.status, submitted: s.submitted, last_error: s.sync_error || null,
  }));

  const [runs] = await pool.execute(
    `SELECT scope, COUNT(*) AS runs, SUM(error IS NOT NULL) AS failed, COALESCE(SUM(checked), 0) AS checked,
            COALESCE(SUM(missing), 0) AS missing, COALESCE(SUM(different), 0) AS different, COALESCE(SUM(resent), 0) AS resent
       FROM cp_mims_reconciliations WHERE client_id = ? AND started_at >= ? AND started_at < ? + INTERVAL 1 MONTH
      GROUP BY scope ORDER BY scope`, [clientId, from, from]);
  const notCovered = subs.filter(s => inMims(s) && !s.sync_key).map(s => ref(s.id));

  const ids = subs.map(s => s.id);
  const inList = ids.length ? `IN (${ids.map(() => '?').join(',')})` : 'IN (NULL)';
  const [[files]] = await pool.execute(
    `SELECT COUNT(*) AS total, SUM(forward_status = 'forwarded') AS delivered, SUM(scan_status = 'pending') AS held,
            SUM(scan_status NOT IN ('clean', 'pending')) AS blocked
       FROM cp_submission_attachments WHERE submission_id ${inList}`, ids);
  const [[followups]] = await pool.execute(
    `SELECT COUNT(*) AS total, SUM(forward_status = 'forwarded') AS delivered FROM cp_submission_followups WHERE submission_id ${inList}`, ids);

  const [alertRows] = await pool.execute(
    `SELECT kind, COUNT(*) AS raised, SUM(resolved_at IS NOT NULL) AS closed
       FROM cp_admin_alerts WHERE client_id = ? AND created_at >= ? AND created_at < ? + INTERVAL 1 MONTH
      GROUP BY kind ORDER BY raised DESC`, [clientId, from, from]);

  const [others] = await pool.execute(
    `SELECT s.id, s.status,
            EXISTS (SELECT 1 FROM cp_submission_answers a WHERE a.submission_id = s.id AND a.status = 'sent') AS answered
       FROM cp_submissions s WHERE s.client_id = ? AND s.submission_type = 'other_inquiry'
        AND s.submitted_at >= ? AND s.submitted_at < ? + INTERVAL 1 MONTH`, [clientId, from, from]);
  const [[oldestOpen]] = await pool.execute(
    `SELECT s.id, DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i') AS submitted FROM cp_submissions s
      WHERE s.client_id = ? AND s.submission_type = 'other_inquiry' AND s.status <> 'closed'
        AND NOT EXISTS (SELECT 1 FROM cp_submission_answers a WHERE a.submission_id = s.id AND a.status = 'sent')
      ORDER BY s.submitted_at ASC LIMIT 1`, [clientId]);

  const received = subs.length;
  const verdict = received === 0
    ? { state: 'none', text: `No reports for MIMS were received in ${monthName(month)}. There is nothing to account for, so this report makes no zero-loss claim.` }
    : notInMims.length === 0
      ? { state: 'zero_loss', text: `Every report received in ${monthName(month)} is in MIMS: ${received} of ${received}.` }
      : { state: 'open', text: `${notInMims.length} of ${received} reports received in ${monthName(month)} ${notInMims.length === 1 ? 'is' : 'are'} not in MIMS yet: ${notInMims.map(n => n.reference).join(', ')}.` };

  const delivery = await monthFigures(clientId, month);
  const content = {
    client: { id: client?.id ?? Number(clientId), name: client?.name || null },
    month, month_name: monthName(month), connected_since: integ?.since ? new Date(integ.since).toISOString().slice(0, 10) : null,
    verdict,
    received: { total: received, by_type: byType, not_in_mims: notInMims },
    delivery: { target_minutes: delivery.target_minutes, serious_target_minutes: delivery.serious_target_minutes,
      all: delivery.all, serious: delivery.serious, missed: delivery.missed.map(m => m.reference) },
    comparisons: { runs: runs.map(r => ({ scope: r.scope, runs: Number(r.runs), failed: Number(r.failed), checked: Number(r.checked),
      missing: Number(r.missing), different: Number(r.different), resent: Number(r.resent) })), not_covered: notCovered },
    files: { total: Number(files.total), delivered: Number(files.delivered || 0), held: Number(files.held || 0), blocked: Number(files.blocked || 0) },
    followups: { total: Number(followups.total), delivered: Number(followups.delivered || 0) },
    alerts: alertRows.map(a => ({ kind: a.kind, label: KIND_LABEL[a.kind] || a.kind, raised: Number(a.raised), closed: Number(a.closed) })),
    other_requests: {
      received: others.length, answered: others.filter(o => Number(o.answered)).length,
      closed_unanswered: others.filter(o => !Number(o.answered) && o.status === 'closed').length,
      open: others.filter(o => !Number(o.answered) && o.status !== 'closed').length,
      oldest_open: oldestOpen ? { reference: ref(oldestOpen.id), submitted: oldestOpen.submitted } : null,
    },
    not_covered: [
      `Reports submitted before this portal was connected to MIMS${integ?.since ? ` (${new Date(integ.since).toISOString().slice(0, 10)})` : ''}.`,
      'Other requests: they are not sent to MIMS by design, and are counted on their own in section 6.',
      'What MIMS did with a report after it arrived. That is on MIMS\'s Inquiry Ledger.',
      'Earlier states: each figure is as it stands when this report is made, and the bridge jobs\' history is not kept, only their latest run.',
      'Reports received by MIMS from other channels (email, by hand).',
    ],
  };
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return { ...content, fingerprint };
}

/** The same report as a PDF, for printing or handing over. */
function renderPdf(report, generated, stream) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: `Zero-Loss Report — ${report.client.name} — ${report.month_name}` } });
  doc.pipe(stream);
  const h = t => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor('#111').text(t).moveDown(0.2).font('Helvetica').fontSize(10).fillColor('#222');
  const line = t => doc.text(t, { paragraphGap: 2 });

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111').text('Zero-Loss Report');
  doc.font('Helvetica').fontSize(11).fillColor('#444').text(`${report.client.name} · reports submitted in ${report.month_name}`);
  doc.moveDown(0.6);
  const tone = { zero_loss: '#166534', open: '#991b1b', none: '#475569' }[report.verdict.state];
  doc.font('Helvetica-Bold').fontSize(12).fillColor(tone).text(report.verdict.text);

  h('1. Reports received and in MIMS');
  for (const t of report.received.by_type) line(`${t.label}: ${t.received} received, ${t.in_mims} in MIMS with a receipt.`);
  if (report.received.not_in_mims.length) {
    line('Not in MIMS yet:');
    for (const n of report.received.not_in_mims) line(`  ${n.reference} (${n.type}), submitted ${n.submitted} UTC${n.last_error ? ` — ${n.last_error}` : ''}`);
  }

  h('2. Delivery time');
  const d = report.delivery;
  line(`Target: in MIMS within ${d.target_minutes} minutes; ${d.serious_target_minutes} for a side effect reported as serious.`);
  line(`All reports: ${d.all.delivered} delivered, ${d.all.within_target} within target${d.all.delivered ? `, median ${Math.round(d.all.median_seconds / 60)} min, slowest ${Math.round(d.all.slowest_seconds / 60)} min` : ''}.`);
  line(`Serious side effects: ${d.serious.delivered} delivered, ${d.serious.within_target} within target.`);
  if (d.missed.length) line(`Missed the target: ${d.missed.join(', ')}.`);

  h('3. Comparisons with MIMS');
  if (!report.comparisons.runs.length) line('None ran this month.');
  for (const r of report.comparisons.runs) {
    line(`${r.scope === 'ae' ? 'Side-effect reports, hourly' : 'All reports, nightly'}: ${r.runs} runs (${r.failed} could not finish), ${r.checked} report checks, ${r.missing} found missing (${r.resent} sent again), ${r.different} different.`);
  }
  if (report.comparisons.not_covered.length) line(`Not covered by the comparison (no key yet): ${report.comparisons.not_covered.join(', ')}.`);

  h('4. Files and added information');
  line(`Files: ${report.files.total} sent with these reports, ${report.files.delivered} on their MIMS case, ${report.files.held} held unscanned, ${report.files.blocked} blocked by the virus check.`);
  line(`Added information: ${report.followups.total} items, ${report.followups.delivered} on their MIMS case.`);

  h('5. Alerts raised this month');
  if (!report.alerts.length) line('None.');
  for (const a of report.alerts) line(`${a.label}: ${a.raised} raised, ${a.closed} closed.`);

  h('6. Other requests (portal only)');
  const o = report.other_requests;
  line(`${o.received} received, ${o.answered} answered, ${o.closed_unanswered} closed without an answer, ${o.open} still open.`);
  line(o.oldest_open ? `Oldest still open, of any month: ${o.oldest_open.reference}, submitted ${o.oldest_open.submitted} UTC.` : 'No Other request is waiting for an answer.');

  h('7. What this report does not cover');
  for (const n of report.not_covered) line(`• ${n}`);

  doc.moveDown(1).fontSize(8).fillColor('#555');
  line(`Made ${generated.at} UTC by ${generated.by}. Fingerprint (SHA-256 of the contents above): ${report.fingerprint}`);
  line('The fingerprint is recorded in the portal\'s audit trail each time this report is made, so this copy can be checked against it. It is not an electronic signature.');
  doc.end();
}

module.exports = { build, renderPdf, monthName };
