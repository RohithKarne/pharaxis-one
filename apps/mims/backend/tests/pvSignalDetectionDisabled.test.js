'use strict';

/**
 * MIMS-46 Option B — automatic PRR/ROR signal detection is disabled.
 *
 * Decided by Rohith 2026-07-30 on Sowmya's recommendation. The calculation ran
 * with hardcoded comparators (b=5, c=3, d=30), which reduces to ror = 2a against
 * a threshold of ror >= 2 — so every product/reaction pair with at least one
 * case was flagged. The flag carried no information.
 *
 * These tests exist to stop it coming back on quietly. Re-enabling detection is
 * a clinical decision that requires a real comparator dataset, so any change
 * that makes `runSignalDetection` write rows again must break a test and force
 * that conversation.
 */

const pool = require('../database/db');
const svc = require('../services/pv/signalDetectionService');
const { computePrRor } = require('../services/pv/signalDetection');

const ORG_ID = 1;

beforeAll(async () => { await pool.initPromise; });
afterAll(async () => { await pool.end(); });

describe('signal detection is disabled', () => {
  test('exposes an explicit disabled flag', () => {
    expect(svc.SIGNAL_DETECTION_ENABLED).toBe(false);
  });

  test('runSignalDetection reports disabled and creates nothing', async () => {
    const result = await svc.runSignalDetection(ORG_ID);
    expect(result.enabled).toBe(false);
    expect(result.statistically_validated).toBe(false);
    expect(result.created).toEqual([]);
    expect(result.reason).toMatch(/not a valid pharmacovigilance signal/i);
  });

  test('running it does not write a single review row', async () => {
    const [before] = await pool.query('SELECT COUNT(*) n FROM pv_signal_reviews');
    await svc.runSignalDetection(ORG_ID);
    await svc.runSignalDetection(ORG_ID);
    const [after] = await pool.query('SELECT COUNT(*) n FROM pv_signal_reviews');
    expect(after[0].n).toBe(before[0].n);
  });

  test('does not throw — disabled is a product state, not a fault', async () => {
    await expect(svc.runSignalDetection(ORG_ID)).resolves.toBeDefined();
  });
});

describe('stored rows are never presentable as valid signals', () => {
  test('every existing row is marked not statistically validated', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) n FROM pv_signal_reviews WHERE is_statistically_validated = 1'
    );
    expect(rows[0].n).toBe(0);
  });

  test('existing rows carry a validation note explaining why', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) n FROM pv_signal_reviews WHERE validation_note IS NULL'
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('the defect this was disabled for', () => {
  // Documents the reason in executable form, so the rationale cannot drift away
  // from the code.
  test('hardcoded comparators flag every non-zero case count', () => {
    for (const a of [1, 2, 5, 10, 100]) {
      expect(computePrRor({ a, b: 5, c: 3, d: 30 }).review_required).toBe(true);
    }
  });

  test('ror collapses to exactly 2a under those comparators', () => {
    for (const a of [1, 3, 7, 25]) {
      expect(computePrRor({ a, b: 5, c: 3, d: 30 }).ror).toBe(2 * a);
    }
  });
});
