'use strict';

const pool = require('../../database/db');

async function checkSlaTimers(now = new Date()) {
  const [rows] = await pool.execute(
    `SELECT * FROM workflow_sla_timers WHERE fired = 0 AND deadline <= ? ORDER BY deadline ASC LIMIT 100`,
    [now]
  );
  for (const row of rows) {
    await pool.execute('UPDATE workflow_sla_timers SET fired = 1 WHERE id = ?', [row.id]);
    await pool.execute(
      `INSERT INTO workflow_executions (instance_id, node_id, action, details) VALUES (?, ?, 'timer_fired', ?)`,
      [row.instance_id, row.node_id, JSON.stringify({ timer_id: row.id, action_on_breach: row.action_on_breach })]
    );
  }
  return rows.length;
}

module.exports = { checkSlaTimers };
