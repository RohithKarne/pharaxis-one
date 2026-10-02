'use strict';

/**
 * aeTaskOwnership.js — what happens to the safety tasks a person holds when they can
 * no longer hold any (CPPM-6).
 *
 * A reviewer who is not an admin cannot take a task somebody else holds. So if the
 * holder's account is switched off, or made view-only, their open tasks would sit
 * there with a name on them and nobody working them — the dropped work that holding
 * a task was built to prevent. They go back to the queue instead, each with its own
 * audit line saying why, in the same transaction as the account change (CPPM-53).
 */
const { auditWithin } = require('./audit');

async function releaseTasksHeldBy(conn, actor, user, reason) {
  const [held] = await conn.execute(
    `SELECT id, client_id FROM cp_ae_review_tasks WHERE owner_id = ? AND status = 'open' FOR UPDATE`,
    [user.id]
  );
  for (const task of held) {
    await conn.execute(
      `UPDATE cp_ae_review_tasks SET owner_id = NULL, owner_since = NULL WHERE id = ? AND owner_id = ? AND status = 'open'`,
      [task.id, user.id]
    );
    await auditWithin(conn, actor, task.client_id, 'AE_TASK_RELEASED', 'ae_review_task', task.id,
      { from_id: user.id, from: user.name, reason });
  }
  return held.length;
}

module.exports = { releaseTasksHeldBy };
