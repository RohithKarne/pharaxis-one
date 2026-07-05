'use strict';

/**
 * detect-demoted-ae-seriousness.js — C-08 data reconciliation.
 *
 * BACKGROUND
 * ----------
 * A prior defect in PUT /cases/ae/events recomputed `is_serious` purely from the
 * eight ICH seriousness criteria, ignoring a standalone `is_serious` flag. An event
 * flagged serious WITHOUT a specific criterion (a valid E2B state) was therefore
 * silently demoted to non-serious on any later edit. The code defect is fixed
 * (finding C-08); this script finds events in EXISTING data that may already have
 * been demoted, so a qualified reviewer can correct them.
 *
 * IMPORTANT — regulated data
 * --------------------------
 * The pre-edit value of `is_serious` was never written to the audit trail, so a
 * "serious-by-standalone-flag, no-criteria" demotion is NOT automatically
 * recoverable. This script therefore REPORTS suspect events for human review and
 * NEVER mutates data unless run with --apply, and even then only corrects the one
 * unambiguous, safe class (a criterion is set but is_serious=0).
 *
 * USAGE
 *   node backend/scripts/detect-demoted-ae-seriousness.js            # report only (safe)
 *   node backend/scripts/detect-demoted-ae-seriousness.js --apply    # + fix Class B only
 *
 * Exit code 0 always on a clean run; 2 on error.
 */

const pool = require('../database/db');

const APPLY = process.argv.includes('--apply');

const SERIOUS_TEXT = /(?<!non[- ]?)(?<!not )serious|life[- ]?threat|fatal|death|hospitali|disab|congenital/i;

async function main() {
  await pool.initPromise;

  // Class A — fatal outcome but not flagged serious. A death is always serious.
  const [classA] = await pool.query(
    `SELECT e.id AS event_id, e.version_id, v.case_id, e.outcome, e.seriousness
       FROM case_ae_events e
       JOIN case_ae_versions v ON v.id = e.version_id
      WHERE e.is_serious = 0 AND e.outcome = 'fatal'
      ORDER BY v.case_id, e.id`);

  // Class B — a specific ICH criterion is set but is_serious=0. Unambiguous
  // inconsistency; the corrected logic would set is_serious=1. Safe to auto-fix.
  const [classB] = await pool.query(
    `SELECT e.id AS event_id, e.version_id, v.case_id
       FROM case_ae_events e
       JOIN case_ae_versions v ON v.id = e.version_id
      WHERE e.is_serious = 0 AND (
            e.is_death = 1 OR e.is_life_threatening = 1 OR e.is_hospitalization = 1
         OR e.is_disability = 1 OR e.is_congenital_anomaly = 1 OR e.is_other_medically_important = 1
         OR e.is_required_intervention = 1 OR e.is_lab_abnormality = 1)
      ORDER BY v.case_id, e.id`);

  // Class C — free-text seriousness column reads as serious but is_serious=0 and
  // no criterion is set. NOT auto-correctable — needs a clinician's judgement.
  const [classCraw] = await pool.query(
    `SELECT e.id AS event_id, e.version_id, v.case_id, e.seriousness, e.outcome
       FROM case_ae_events e
       JOIN case_ae_versions v ON v.id = e.version_id
      WHERE e.is_serious = 0 AND e.outcome <> 'fatal'
        AND e.is_death = 0 AND e.is_life_threatening = 0 AND e.is_hospitalization = 0
        AND e.is_disability = 0 AND e.is_congenital_anomaly = 0 AND e.is_other_medically_important = 0
        AND e.is_required_intervention = 0 AND e.is_lab_abnormality = 0
        AND e.seriousness IS NOT NULL AND e.seriousness <> ''
      ORDER BY v.case_id, e.id`);
  const classC = classCraw.filter(r => SERIOUS_TEXT.test(String(r.seriousness || '')));

  console.log('=== C-08 AE seriousness reconciliation ===');
  console.log(`Class A (fatal but is_serious=0)          : ${classA.length}  [review + correct]`);
  console.log(`Class B (criterion set but is_serious=0)  : ${classB.length}  [safe auto-fix]`);
  console.log(`Class C (text says serious, no criterion) : ${classC.length}  [clinician review only]`);

  const show = (label, rows) => {
    if (!rows.length) return;
    console.log(`\n-- ${label} --`);
    for (const r of rows) {
      console.log(`   case ${r.case_id}  version ${r.version_id}  event ${r.event_id}` +
        (r.outcome ? `  outcome=${r.outcome}` : '') +
        (r.seriousness ? `  seriousness=${JSON.stringify(String(r.seriousness).slice(0, 80))}` : ''));
    }
  };
  show('Class A', classA);
  show('Class B', classB);
  show('Class C (human review — NOT auto-corrected)', classC);

  if (APPLY && classB.length) {
    const ids = classB.map(r => r.event_id);
    const [res] = await pool.query(
      `UPDATE case_ae_events SET is_serious = 1 WHERE id IN (?) AND is_serious = 0`, [ids]);
    console.log(`\n[--apply] Class B corrected: ${res.affectedRows} event(s) set is_serious=1.`);
    console.log('         Class A and Class C are intentionally left for human review.');
  } else if (classB.length) {
    console.log('\nRun with --apply to auto-correct Class B only. Class A and C always need review.');
  }

  await pool.end();
  process.exit(0);
}

main().catch(err => { console.error('detect-demoted-ae-seriousness error:', err.message); process.exit(2); });
