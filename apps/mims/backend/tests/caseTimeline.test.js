'use strict';

/**
 * caseTimelineService regression suite.
 *
 * Why this exists: getTimeline() returned an empty array for EVERY case, for as
 * long as the drift existed, because
 *   (a) every sub-query bound LIMIT as a placeholder, which mysql2's prepared
 *       statement path rejects with ER_WRONG_ARGUMENTS, and
 *   (b) the case_audit_trail and case_comments queries named columns that do not
 *       exist in the deployed schema,
 * and the service's blanket `catch { return [] }` hid all of it. The case
 * timeline and the audit-trail drawer showed "No timeline events found" on every
 * case and nothing ever failed loudly.
 *
 * These tests assert real rows come back AND that no source failed silently, so
 * the next schema change breaks a test instead of quietly emptying the audit view.
 */

const pool = require('../database/db');
const { getTimeline } = require('../services/caseTimelineService');

const ORG_ID = 1;
const MARKER = 'TIMELINE_TEST_MARKER';

let caseId;
let userId;

beforeAll(async () => {
  // db.js kicks off an async initialization on require. Without waiting for it,
  // afterAll can close the pool mid-init and the suite dies with
  // "Can't add new command when connection is in closed state".
  await pool.initPromise;
  const [users] = await pool.query('SELECT id FROM users WHERE org_id = ? LIMIT 1', [ORG_ID]);
  if (!users.length) throw new Error(`No user in org ${ORG_ID} — cannot seed the timeline fixture.`);
  userId = users[0].id;

  const [statuses] = await pool.query('SELECT id FROM workflow_states LIMIT 1');
  const statusId = statuses[0]?.id ?? null;

  const [caseRes] = await pool.query(
    `INSERT INTO cases (org_id, site_id, case_type, status_id, priority, intake_channel,
                        date_received, date_of_intake, description, created_by)
     VALUES (?, 1, 'MI', ?, 'normal', 'manual', CURDATE(), NOW(), ?, ?)`,
    [ORG_ID, statusId, `${MARKER} case`, userId]
  );
  caseId = caseRes.insertId;

  await pool.query(
    `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp)
     VALUES (?, ?, 'Timeline Fixture', 'STATUS_CHANGED', 'status', 'New', 'In Review', NOW())`,
    [caseId, userId]
  );

  await pool.query(
    'INSERT INTO case_comments (case_id, user_id, comment, created_at) VALUES (?, ?, ?, NOW())',
    [caseId, userId, `${MARKER} a comment on the case`]
  );
});

afterAll(async () => {
  if (caseId) {
    await pool.query('DELETE FROM case_comments WHERE case_id = ?', [caseId]);
    await pool.query('DELETE FROM case_audit_trail WHERE case_id = ?', [caseId]);
    await pool.query('DELETE FROM cases WHERE id = ?', [caseId]);
  }
  await pool.end();
});

describe('caseTimelineService.getTimeline', () => {
  test('returns audit-trail events with the real actor name', async () => {
    const events = await getTimeline({ orgId: ORG_ID, caseId, limit: 50 });
    const audit = events.find(e => e.type === 'case_audit');

    expect(audit).toBeDefined();
    expect(audit.title).toBe('STATUS_CHANGED');
    // Regression: the actor came back null while the query joined on a
    // non-existent `changed_by` column.
    expect(audit.actor).toBeTruthy();
    expect(audit.detail).toMatchObject({ field: 'status', old: 'New', new: 'In Review' });
  });

  test('returns comment events from the deployed case_comments shape', async () => {
    const events = await getTimeline({ orgId: ORG_ID, caseId, limit: 50 });
    const comment = events.find(e => e.type === 'comment');

    expect(comment).toBeDefined();
    expect(comment.detail.body).toContain(MARKER);
  });

  test('works without an explicit limit — the default must not break the query', async () => {
    // The bound `LIMIT ?` failed for every call regardless of limit; the route
    // passes req.query.limit, which is undefined when the caller omits it.
    const events = await getTimeline({ orgId: ORG_ID, caseId });
    expect(events.length).toBeGreaterThan(0);
  });

  test('no timeline source fails silently', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await getTimeline({ orgId: ORG_ID, caseId, limit: 50 });

    const failures = spy.mock.calls
      .map(args => String(args[0]))
      .filter(msg => msg.includes('caseTimelineService'));
    spy.mockRestore();

    expect(failures).toEqual([]);
  });

  test('does not leak another org\'s case chronology', async () => {
    const events = await getTimeline({ orgId: ORG_ID + 9999, caseId, limit: 50 });
    expect(events).toEqual([]);
  });

  test('orders events newest-first', async () => {
    const events = await getTimeline({ orgId: ORG_ID, caseId, limit: 50 });
    const times = events.map(e => new Date(e.ts).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });
});
