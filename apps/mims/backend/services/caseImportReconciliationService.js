'use strict';

/**
 * caseImportReconciliationService.js — count-back for a case import job.
 *
 * PAUD-4 item 4 (approved by Rohith 2026-08-03). Pure: the caller supplies the
 * counts, this decides whether the import can be evidenced as complete. No
 * database dependency, so the rule is testable on its own.
 */

/**
 * Compares what a job claimed against what is actually in `cases` for that job.
 *
 * Deliberately fails on a surplus as well as a shortfall: an importer re-run that
 * doubled the data is a migration failure, not a success. A reconciliation that
 * can only ever say "ok" is not evidence.
 */
function buildReconciliation({ totalRows = 0, importedRows = 0, failedRows = 0, actualRows = 0 } = {}) {
  const total    = Number(totalRows)    || 0;
  const imported = Number(importedRows) || 0;
  const failed   = Number(failedRows)   || 0;
  const actual   = Number(actualRows)   || 0;

  const discrepancy = actual - imported;           // database vs what the job claimed
  const unaccounted = total - (imported + failed); // rows received but never resolved

  let status = 'balanced';
  if (unaccounted !== 0)    status = 'row_count_mismatch';
  else if (discrepancy < 0) status = 'missing_records';
  else if (discrepancy > 0) status = 'unexpected_records';

  return {
    status,
    balanced: status === 'balanced',
    rows_received: total,
    rows_claimed_imported: imported,
    rows_rejected: failed,
    rows_present_in_database: actual,
    discrepancy,
    unaccounted,
  };
}

module.exports = { buildReconciliation };
