'use strict';

/**
 * Migration 107 — indexes for the server-side inbox list.
 *
 * Locked by Rohith 2026-09-23: GET /api/inbox returns one page, filtered, sorted and
 * counted in the database, instead of the newest 500 rows filtered in the browser.
 * At 482k rows the table had no index on org_id, so a tenant's tab counts took a
 * second, and the hero numbers (open work, unassigned, my queue, SLA risk) needed a
 * row read for every open inquiry — about 0.9s on a 128MB buffer pool.
 *
 * Two scope indexes carry the columns those counts read, so they are answered from
 * the index alone (measured: tab counts 0.05s, hero numbers 0.03–0.05s, page 0.00s).
 * received_at stays the poller's 'YYYY-MM-DD HH:MM:SS' text: that format sorts
 * chronologically as a string, so the index orders the page without STR_TO_DATE.
 * The third index answers "which queue names exist in this tenant" in one lookup
 * per queue instead of a scan of every row.
 *
 * Each ADD INDEX is skipped only when the index already exists (ER_DUP_KEYNAME);
 * any other failure stops startup so a missing index cannot go unnoticed.
 */

const INDEXES = [
  ['idx_inquiries_org_status_received',
    '(org_id, status, received_at, assigned_to, first_touched_at, first_response_at, created_at)'],
  ['idx_inquiries_status_received',
    '(status, received_at, assigned_to, first_touched_at, first_response_at, created_at)'],
  ['idx_inquiries_org_queue', '(org_id, queue_name)'],
];

async function up(conn) {
  for (const [name, columns] of INDEXES) {
    try {
      await conn.execute(`ALTER TABLE inquiries ADD INDEX ${name} ${columns}`);
    } catch (err) {
      if (err && err.code === 'ER_DUP_KEYNAME') continue; // already applied
      throw err;
    }
  }
}

module.exports = { up };
