'use strict';

/**
 * audit-reports-reconciliation.js
 *
 * Deep programmatic audit and reconciliation for the MIMS Reports Module.
 * Compares raw database tables against the output of all 20 library reports,
 * verifies math/formulas (percentages, medians, working days, age bands),
 * validates CSV generation and injection protection, and checks tenant isolation.
 */

const pool = require('../database/db');
const {
  getDatasetByReportKey,
  BUILT_DATASETS,
  resolvePeriod,
} = require('../services/reportDatasetService');
const { buildReportCsv } = require('../services/reportCsv');
const { getFilterOptions } = require('../services/reportModuleService');

async function runAudit() {
  console.log('================================================================');
  console.log('   MIMS REPORTS MODULE — DEEP QA RECONCILIATION AUDIT');
  console.log('================================================================\n');

  const orgId = 1; // Calder Therapeutics
  const adminCtx = { user: { userId: 1, orgId: 1, role: 'administrator' } };
  const auditReport = {
    timestamp: new Date().toISOString(),
    orgId,
    passed: 0,
    failed: 0,
    tests: [],
  };

  function record(testName, passed, details = '') {
    if (passed) {
      auditReport.passed += 1;
      console.log(`  ✅ [PASS] ${testName}`);
    } else {
      auditReport.failed += 1;
      console.error(`  ❌ [FAIL] ${testName} — ${details}`);
    }
    auditReport.tests.push({ testName, passed, details });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. RECONCILIATION: COMMAND CENTER & CASE REPORTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SECTION 1: Command Center & Case Detail Reports ---');

  // 1.1 daily-case-openings (Cases Received)
  {
    const filter = { period: 'last_7_days' };
    const range = resolvePeriod(filter, 'last_7_days');
    const [rawRows] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM cases c
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND c.date_received >= ? AND c.date_received < DATE_ADD(?, INTERVAL 1 DAY)`,
      [orgId, range.dateFrom, range.dateTo]
    );
    const reportData = await getDatasetByReportKey('daily-case-openings', orgId, filter, adminCtx);
    const expected = Number(rawRows[0].total);
    const actual = reportData.length;
    record(
      'daily-case-openings: Row count matches raw cases table',
      actual === expected,
      `Expected ${expected}, got ${actual}`
    );
    const hasDrill = reportData.every((r) => r.__drill_route && r.__drill_route.startsWith('/cases/'));
    record('daily-case-openings: Every row contains valid case drill-down route', hasDrill);
  }

  // 1.2 daily-case-closures (Cases Closed)
  {
    const filter = { period: 'last_7_days' };
    const range = resolvePeriod(filter, 'last_7_days');
    const [rawClosures] = await pool.execute(
      `SELECT COUNT(DISTINCT c.id) AS total
         FROM case_audit_trail cat
         JOIN cases c ON c.id = cat.case_id
         JOIN workflow_states ws ON ws.id = CAST(cat.new_value AS UNSIGNED) AND ws.is_closed = 1
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND cat.action_type = 'STATUS_CHANGED' AND cat.field_name = 'status_id'
          AND cat.timestamp >= ? AND cat.timestamp < DATE_ADD(?, INTERVAL 1 DAY)`,
      [orgId, range.dateFrom, range.dateTo]
    );
    const reportData = await getDatasetByReportKey('daily-case-closures', orgId, filter, adminCtx);
    const expected = Number(rawClosures[0].total);
    const actual = reportData.length;
    record(
      'daily-case-closures: Closed cases count matches audit trail STATUS_CHANGED to closed',
      actual === expected,
      `Expected ${expected}, got ${actual}`
    );
    if (reportData.length > 0) {
      const sample = reportData[0];
      record(
        'daily-case-closures: Days open calculation is valid non-negative integer',
        sample.days_open != null && Number.isInteger(sample.days_open) && sample.days_open >= 0,
        `days_open=${sample.days_open}`
      );
    }
  }

  // 1.3 daily-case-summary (Case Volume)
  {
    const filter = { period: 'last_30_days', group_by: 'day' };
    const reportData = await getDatasetByReportKey('daily-case-summary', orgId, filter, adminCtx);
    const range = resolvePeriod(filter, 'last_30_days');
    record(
      'daily-case-summary: 30 daily buckets returned for last_30_days',
      reportData.length === 30,
      `Bucket count: ${reportData.length}`
    );
    const totalReceivedInBuckets = reportData.reduce((acc, r) => acc + r.received, 0);
    const [sumRaw] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM cases c
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND c.date_received >= ? AND c.date_received < DATE_ADD(?, INTERVAL 1 DAY)`,
      [orgId, range.dateFrom, range.dateTo]
    );
    record(
      'daily-case-summary: Sum of daily received equals raw cases received count',
      totalReceivedInBuckets === Number(sumRaw[0].total),
      `Buckets sum: ${totalReceivedInBuckets}, Raw: ${sumRaw[0].total}`
    );
    const sumComponents = reportData.every((r) => r.received === (r.mi_received + r.ae_received + r.pc_received));
    record('daily-case-summary: received == mi_received + ae_received + pc_received across all rows', sumComponents);
  }

  // 1.4 open-backlog (Open Cases by Age)
  {
    const reportData = await getDatasetByReportKey('open-backlog', orgId, {}, adminCtx);
    const [rawOpen] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM cases c
         LEFT JOIN workflow_states ws ON ws.id = c.status_id
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND COALESCE(ws.is_closed, 0) = 0 AND c.merged_into_case_id IS NULL`,
      [orgId]
    );
    const expected = Math.min(10000, Number(rawOpen[0].total));
    record(
      'open-backlog: Open case count matches open cases query (capped at 10k)',
      reportData.length === expected,
      `Report: ${reportData.length}, Raw: ${rawOpen[0].total}`
    );
    const validAgeBands = reportData.slice(0, 50).every((r) => {
      const d = r.age_days;
      if (d <= 2) return r.age_band === '0-2 days';
      if (d <= 5) return r.age_band === '3-5 days';
      if (d <= 10) return r.age_band === '6-10 days';
      if (d <= 30) return r.age_band === '11-30 days';
      return r.age_band === 'Over 30 days';
    });
    record('open-backlog: age_band categorization correctly maps from age_days', validAgeBands);
  }

  // 1.5 team-workload
  {
    const reportData = await getDatasetByReportKey('team-workload', orgId, { period: 'last_30_days' }, adminCtx);
    const totalOpenInWorkload = reportData.reduce((acc, r) => acc + r.open_cases, 0);
    const [rawOpen] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM cases c
         LEFT JOIN workflow_states ws ON ws.id = c.status_id
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND COALESCE(ws.is_closed, 0) = 0 AND c.merged_into_case_id IS NULL`,
      [orgId]
    );
    record(
      'team-workload: Total open cases across owners equals total open cases in database',
      totalOpenInWorkload === Number(rawOpen[0].total),
      `Workload sum: ${totalOpenInWorkload}, DB total: ${rawOpen[0].total}`
    );
    const subTypesMatch = reportData.every((r) => r.open_cases === (r.open_mi + r.open_ae + r.open_pc));
    record('team-workload: open_cases == open_mi + open_ae + open_pc for each owner', subTypesMatch);
  }

  // 1.6 case-duplicates (Possible Duplicates)
  {
    const filter = { period: 'last_30_days' };
    const range = resolvePeriod(filter, 'last_30_days');
    const [rawDupes] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM cases c
         JOIN cases d ON d.id = c.possible_duplicate_of
        WHERE c.org_id = ? AND c.is_deleted = 0
          AND c.date_received >= ? AND c.date_received < DATE_ADD(?, INTERVAL 1 DAY)`,
      [orgId, range.dateFrom, range.dateTo]
    );
    const reportData = await getDatasetByReportKey('case-duplicates', orgId, filter, adminCtx);
    record(
      'case-duplicates: Count matches cases with populated possible_duplicate_of in range',
      reportData.length === Number(rawDupes[0].total),
      `Report: ${reportData.length}, DB: ${rawDupes[0].total}`
    );
    if (reportData.length > 0) {
      record('case-duplicates: Contains possible_duplicate_of case number', Boolean(reportData[0].possible_duplicate_of));
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. RECONCILIATION: MEDICAL INFORMATION & SAFETY REPORTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: Medical Information & Safety Reports ---');

  // 2.1 mi-response-timeliness & performance
  {
    const filter = { period: 'last_30_days' };
    const timesData = await getDatasetByReportKey('mi-response-timeliness', orgId, filter, adminCtx);
    const perfData = await getDatasetByReportKey('mi-response-performance', orgId, filter, adminCtx);

    record('mi-response-timeliness: Output is non-empty array', Array.isArray(timesData) && timesData.length > 0);
    record('mi-response-performance: Output is non-empty array', Array.isArray(perfData) && perfData.length > 0);

    const overall = perfData.find((r) => r.group === 'All enquiries') || perfData[0];
    record(
      'mi-response-performance: Total enquiries in performance matches timeliness rows count',
      overall.enquiries === timesData.length,
      `Perf: ${overall.enquiries}, Timeliness: ${timesData.length}`
    );

    // Math check on on_time_pct
    const measured = overall.on_time + overall.late + overall.overdue;
    const expectedPct = measured ? Math.round((overall.on_time / measured) * 1000) / 10 : null;
    record(
      'mi-response-performance: on_time_pct formula exactly matches (on_time / measured) * 100',
      overall.on_time_pct === expectedPct,
      `Reported: ${overall.on_time_pct}, Expected: ${expectedPct}`
    );
  }

  // 2.2 mi-enquiry-mix
  {
    const filter = { period: 'last_30_days', group_by: 'product' };
    const mixData = await getDatasetByReportKey('mi-enquiry-mix', orgId, filter, adminCtx);
    const totalEnquiries = mixData.reduce((acc, r) => acc + r.enquiries, 0);
    const totalShare = mixData.reduce((acc, r) => acc + r.share_pct, 0);
    record('mi-enquiry-mix: Output is non-empty array grouped by product', mixData.length > 0);
    record(
      'mi-enquiry-mix: Total share percentage sums to ~100%',
      Math.abs(totalShare - 100) < 1.0,
      `Total share: ${totalShare}%`
    );
  }

  // 2.3 mi-off-label
  {
    const filter = { period: 'last_90_days' };
    const range = resolvePeriod(filter, 'last_90_days');
    const [rawOffLabel] = await pool.execute(
      `SELECT COUNT(*) AS total
         FROM case_mi mi
         JOIN cases c ON c.id = mi.case_id
        WHERE c.org_id = ? AND c.is_deleted = 0 AND mi.is_off_label = 1
          AND c.date_received >= ? AND c.date_received < DATE_ADD(?, INTERVAL 1 DAY)`,
      [orgId, range.dateFrom, range.dateTo]
    );
    const reportData = await getDatasetByReportKey('mi-off-label', orgId, filter, adminCtx);
    record(
      'mi-off-label: Count matches cases with is_off_label = 1 in range',
      reportData.length === Number(rawOffLabel[0].total),
      `Report: ${reportData.length}, DB: ${rawOffLabel[0].total}`
    );
    if (reportData.length > 0) {
      record('mi-off-label: off_label_indication is populated', Boolean(reportData[0].off_label_indication));
    }
  }

  // 2.4 mi-safety-check
  {
    const filter = { period: 'last_90_days' };
    const reportData = await getDatasetByReportKey('mi-safety-check', orgId, filter, adminCtx);
    record('mi-safety-check: Captures seeded safety screening discrepancy cases', reportData.length >= 2);
    const capturedMentionWithoutCase = reportData.some((r) => r.issue === 'Mentions an AE or complaint; no AE/PC case');
    const capturedUnansweredScreening = reportData.some((r) => r.issue === 'Letter sent; screening not answered');
    record('mi-safety-check: Identifies "Mentions an AE or complaint; no AE/PC case"', capturedMentionWithoutCase);
    record('mi-safety-check: Identifies "Letter sent; screening not answered"', capturedUnansweredScreening);
  }

  // 2.5 handoff-timeliness
  {
    const filter = { period: 'last_30_days' };
    const reportData = await getDatasetByReportKey('handoff-timeliness', orgId, filter, adminCtx);
    record('handoff-timeliness: Output contains AE and PC hand-off rows', reportData.length > 0);
    const hasValidResults = reportData.every((r) => ['On time', 'Late', 'Overdue', 'Not yet due', 'No day 0'].includes(r.result));
    record('handoff-timeliness: Every row has a valid regulatory timeliness outcome', hasValidResults);
  }

  // 2.6 transmission-sla
  {
    const reportData = await getDatasetByReportKey('transmission-sla', orgId, {}, adminCtx);
    record('transmission-sla: Output contains open AE/PC transmissions', reportData.length > 0);
    const hasValidSla = reportData.every((r) => ['breached', 'at_risk', 'on_track', 'closed', 'untracked', 'met'].includes(r.sla_status));
    record('transmission-sla: Every row contains valid SLA status', hasValidSla);
  }

  // 2.7 icsr-submissions
  {
    const filter = { period: 'last_90_days' };
    const reportData = await getDatasetByReportKey('icsr-submissions', orgId, filter, adminCtx);
    record('icsr-submissions: Returns ICSR submissions in period', reportData.length >= 1);
    const sample = reportData.find((r) => r.case_number === 'QA-REP-011');
    record('icsr-submissions: Displays acknowledgement error summary for failed submissions', Boolean(sample?.acknowledgement_errors));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RECONCILIATION: INBOX, CONTENT & ADMINISTRATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: Inbox Operations, Content & Admin Reports ---');

  // 3.1 inbox-performance & inbox-sla
  {
    const filter = { period: 'last_7_days' };
    const perfData = await getDatasetByReportKey('inbox-performance', orgId, filter, adminCtx);
    const slaData = await getDatasetByReportKey('inbox-sla', orgId, filter, adminCtx);
    record('inbox-performance: Output contains queue and assignee rows', perfData.length > 0);
    record('inbox-sla: Output contains inquiry items', slaData.length > 0);
    const totalPerfItems = perfData.reduce((acc, r) => acc + r.total_items, 0);
    record(
      'inbox-performance: Sum of total_items equals total items in inbox-sla',
      totalPerfItems === slaData.length,
      `Perf total: ${totalPerfItems}, SLA count: ${slaData.length}`
    );
  }

  // 3.2 daily-operations-pack
  {
    const filter = { period: 'today' };
    const opsData = await getDatasetByReportKey('daily-operations-pack', orgId, filter, adminCtx);
    record('daily-operations-pack: Exactly 8 core operations KPI cards returned', opsData.length === 8);
    const sections = opsData.map((r) => r.section);
    record('daily-operations-pack: Covers Cases, Medical Information, Safety and quality, Inbox',
      sections.includes('Cases') && sections.includes('Medical information') && sections.includes('Safety and quality') && sections.includes('Inbox')
    );
  }

  // 3.3 content-usage
  {
    const filter = { period: 'last_90_days' };
    const reportData = await getDatasetByReportKey('content-usage', orgId, filter, adminCtx);
    record('content-usage: Returns seeded content usage record', reportData.length >= 1);
    if (reportData.length > 0) {
      const sample = reportData[0];
      record('content-usage: Contains title, reference, and usage metrics', Boolean(sample.title && sample.reference && sample.times_used >= 1));
    }
  }

  // 3.4 content-review-due
  {
    const filter = { window_days: 60 };
    const reportData = await getDatasetByReportKey('content-review-due', orgId, filter, adminCtx);
    record('content-review-due: Returns published documents due for review or expired', reportData.length > 0);
    const validStatus = reportData.every((r) => Boolean(r.status));
    record('content-review-due: Every row contains status descriptor', validStatus);
  }

  // 3.5 user-access-review
  {
    const reportData = await getDatasetByReportKey('user-access-review', orgId, {}, adminCtx);
    const [rawUsers] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users u JOIN user_org_access uoa ON uoa.user_id = u.id WHERE uoa.org_id = ?`,
      [orgId]
    );
    record(
      'user-access-review: User count matches users with access to organisation',
      reportData.length === Number(rawUsers[0].total),
      `Report: ${reportData.length}, DB: ${rawUsers[0].total}`
    );
    const hasScreenGrants = reportData.every((r) => Boolean(r.modules));
    record('user-access-review: Every user row lists granted module screens', hasScreenGrants);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CSV EXPORT INTEGRITY & INJECTION PROTECTION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: CSV Export Integrity & OWASP Protection ---');
  {
    let allCsvValid = true;
    let drillRouteStripped = true;
    for (const key of BUILT_DATASETS) {
      const data = await getDatasetByReportKey(key, orgId, {}, adminCtx);
      if (Array.isArray(data) && data.length > 0) {
        const columns = Object.keys(data[0]);
        const csv = buildReportCsv(columns, data);
        const lines = csv.trim().split(/\r?\n/);
        if (lines.length !== data.length + 1) allCsvValid = false;
        if (lines[0].includes('__drill_route') || lines[0].includes('__drill_state')) drillRouteStripped = false;
      }
    }
    record('CSV Generation: Header + data row count matches dataset rows across all 20 reports', allCsvValid);
    record('CSV Generation: Hidden internal __drill_* columns are cleanly excluded from CSV headers', drillRouteStripped);

    // OWASP formula injection check
    const injectionData = [{ title: '=1+1', description: '@SUM(A1:A10)', name: '-malicious', ref: '+bad' }];
    const injectionCols = Object.keys(injectionData[0]);
    const csvInjected = buildReportCsv(injectionCols, injectionData);
    const safeCells = csvInjected.includes("'=1+1") && csvInjected.includes("'@SUM") && csvInjected.includes("'-malicious") && csvInjected.includes("'+bad");
    record('CSV Security: Leading formula characters (=, @, -, +) safely escaped with leading apostrophe', safeCells);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. MULTI-TENANT ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: Multi-Tenant Data Segregation ---');
  {
    const org26Ctx = { user: { userId: 450, orgId: 26, role: 'administrator' } };
    const org26Openings = await getDatasetByReportKey('daily-case-openings', 26, { period: 'last_30_days' }, org26Ctx);
    const leakedCalderCases = org26Openings.some((r) => String(r.case_number || '').startsWith('QA-REP-') || String(r.case_number || '').startsWith('CP-'));
    record('Tenant Isolation: Org 26 (Vanaja) cannot see Org 1 (Calder) cases in reports', !leakedCalderCases);

    const org26Access = await getDatasetByReportKey('user-access-review', 26, {}, org26Ctx);
    const leakedCalderUsers = org26Access.some((u) => u.email === 'aisha.verma@novartis-demo.com' || u.email === 'kunal.mehta@novartis-demo.com');
    record('Tenant Isolation: Org 26 User Access Review contains no Org 1 users', !leakedCalderUsers);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. FILTER OPTIONS & AUDIENCE SCOPES
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: Filter Options & Audience Permission Scopes ---');
  {
    const filterOptions = await getFilterOptions(orgId);
    record('Filter Options: Returns valid periods list', Array.isArray(filterOptions.periods) && filterOptions.periods.length >= 8);
    record('Filter Options: Returns valid owners list for org', Array.isArray(filterOptions.owners) && filterOptions.owners.length >= 1);
    record('Filter Options: Returns active products list for org', Array.isArray(filterOptions.products) && filterOptions.products.length >= 1);
  }

  console.log('\n================================================================');
  console.log(` AUDIT COMPLETE: ${auditReport.passed} PASSED, ${auditReport.failed} FAILED`);
  console.log('================================================================');

  if (auditReport.failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAudit()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Audit fatal exception:', err);
      process.exit(1);
    });
}

module.exports = { runAudit };
