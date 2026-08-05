'use strict';

/**
 * PAUD-4 item 4 — migration count-back.
 *
 * The importer counted rows but nothing could verify the count, because imported
 * cases carried no link to the job that created them. These tests cover the
 * comparison itself: given what the job claimed and what is actually in the
 * database, does the reconciliation say the right thing?
 *
 * The rule that matters: a reconciliation must FAIL loudly on a mismatch. A
 * report that only ever says "ok" is not evidence.
 */

const { buildReconciliation } = require('../services/caseImportReconciliationService');

describe('case import reconciliation', () => {
  test('balances when every claimed row is present and accounted for', () => {
    const r = buildReconciliation({
      totalRows: 100, importedRows: 97, failedRows: 3, actualRows: 97,
    });

    expect(r.balanced).toBe(true);
    expect(r.status).toBe('balanced');
    expect(r.discrepancy).toBe(0);
    expect(r.unaccounted).toBe(0);
  });

  test('fails when fewer cases are in the database than the job claimed', () => {
    const r = buildReconciliation({
      totalRows: 100, importedRows: 97, failedRows: 3, actualRows: 90,
    });

    expect(r.balanced).toBe(false);
    expect(r.status).toBe('missing_records');
    expect(r.discrepancy).toBe(-7);
  });

  test('fails when MORE cases are present than claimed — a double-run is not a pass', () => {
    const r = buildReconciliation({
      totalRows: 100, importedRows: 97, failedRows: 3, actualRows: 104,
    });

    expect(r.balanced).toBe(false);
    expect(r.status).toBe('unexpected_records');
    expect(r.discrepancy).toBe(7);
  });

  test('fails when imported + failed does not add up to the rows received', () => {
    const r = buildReconciliation({
      totalRows: 100, importedRows: 90, failedRows: 3, actualRows: 90,
    });

    expect(r.balanced).toBe(false);
    expect(r.status).toBe('row_count_mismatch');
    expect(r.unaccounted).toBe(7);
  });

  test('an empty import balances rather than dividing by zero', () => {
    const r = buildReconciliation({
      totalRows: 0, importedRows: 0, failedRows: 0, actualRows: 0,
    });
    expect(r.balanced).toBe(true);
  });

  test('treats missing counters as zero rather than producing NaN', () => {
    const r = buildReconciliation({ actualRows: 0 });
    expect(r.balanced).toBe(true);
    expect(Number.isNaN(r.discrepancy)).toBe(false);
  });
});
