'use strict';

/**
 * Migration 140 — what a connected portal needs to follow its own cases (bridge row 4).
 *
 * WHY
 * CP Portal closed a person's request when the linked MIMS case was closed. It found
 * out by asking MIMS about each case one at a time — only ever the oldest 100 open
 * ones per client, so request 101 onwards never closed — and decided "closed" by
 * whether the state's NAME started with "Closed", which an organisation can rename.
 * A reopened case never reopened on the portal either.
 *
 * WHAT
 * 1. workflow_states.is_closed — a fixed marker for "a case in this state is
 *    finished", set by an admin and kept when a state is renamed. Filled from the
 *    name for existing states: the whole word closed / complete(d) / cancel(led)
 *    anywhere in it ("Case Closed" yes, "Incomplete" no). MIMS's own closed-case
 *    rules read this marker from now on instead of each guessing from the name.
 * 2. cases.source_api_client_id — which API connection created the case, so the
 *    connection can ask "what changed among MY cases since …" in one call. Filled for
 *    existing portal cases where the organisation has exactly one API connection that
 *    may create cases; anywhere else it stays empty (we do not guess between two).
 *    The fill does not touch updated_at.
 *
 * Idempotent: columns and index are added only when missing; fills only empty values.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'workflow_states', 'is_closed'))) {
    await conn.execute('ALTER TABLE workflow_states ADD COLUMN is_closed TINYINT(1) NOT NULL DEFAULT 0');
    await conn.execute(
      "UPDATE workflow_states SET is_closed = 1 WHERE LOWER(name) REGEXP '\\\\b(closed|complete|completed|cancel|cancelled|canceled)\\\\b'");
  }

  if (!(await columnExists(conn, 'cases', 'source_api_client_id'))) {
    await conn.execute(
      `ALTER TABLE cases ADD COLUMN source_api_client_id INT NULL,
         ADD KEY idx_cases_source_changes (source_api_client_id, updated_at, id)`);
  }

  const [orgs] = await conn.execute(
    `SELECT org_id, MIN(id) AS client_id FROM api_clients
      WHERE status = 'active' AND JSON_CONTAINS(scopes, '"cases:write"')
      GROUP BY org_id HAVING COUNT(*) = 1`);
  for (const o of orgs) {
    await conn.execute(
      `UPDATE cases SET source_api_client_id = ?, updated_at = updated_at
        WHERE org_id = ? AND intake_channel = 'Portal' AND source_api_client_id IS NULL`,
      [o.client_id, o.org_id]);
  }
}

module.exports = { up };
