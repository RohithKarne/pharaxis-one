'use strict';

const pool = require('../database/db');
const { emitProcessEvent } = require('./processExplorerService');

let timer = null;

async function fetchSchemaMap() {
  const [rows] = await pool.execute(
    `SELECT table_name, column_name, column_type, is_nullable, column_key
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
     ORDER BY table_name, ordinal_position`
  );
  const map = {};
  for (const row of rows) {
    const t = row.table_name;
    if (!map[t]) map[t] = [];
    map[t].push({
      name: row.column_name,
      type: row.column_type,
      nullable: row.is_nullable,
      key: row.column_key,
    });
  }
  return map;
}

function diffSchemas(prev, next) {
  const events = [];
  const prevTables = new Set(Object.keys(prev));
  const nextTables = new Set(Object.keys(next));

  for (const table of nextTables) {
    if (!prevTables.has(table)) {
      events.push({ eventType: 'schema_create_table', entityType: 'table', entityId: table, summary: `Table created: ${table}`, payload: { table, columns: next[table] } });
      continue;
    }
    const prevCols = new Map((prev[table] || []).map(c => [c.name, c]));
    const nextCols = new Map((next[table] || []).map(c => [c.name, c]));
    for (const [name, col] of nextCols.entries()) {
      if (!prevCols.has(name)) {
        events.push({ eventType: 'schema_add_column', entityType: 'column', entityId: `${table}.${name}`, summary: `Column added: ${table}.${name}`, payload: { table, column: col } });
        continue;
      }
      const before = JSON.stringify(prevCols.get(name));
      const after = JSON.stringify(col);
      if (before !== after) {
        events.push({
          eventType: 'schema_alter_column',
          entityType: 'column',
          entityId: `${table}.${name}`,
          summary: `Column altered: ${table}.${name}`,
          payload: { table, before: prevCols.get(name), after: col },
        });
      }
    }
    for (const [name, col] of prevCols.entries()) {
      if (!nextCols.has(name)) {
        events.push({ eventType: 'schema_drop_column', entityType: 'column', entityId: `${table}.${name}`, summary: `Column removed: ${table}.${name}`, payload: { table, column: col } });
      }
    }
  }

  for (const table of prevTables) {
    if (!nextTables.has(table)) {
      events.push({ eventType: 'schema_drop_table', entityType: 'table', entityId: table, summary: `Table removed: ${table}`, payload: { table } });
    }
  }
  return events;
}

async function runSchemaScan() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS mims_schema_snapshots (
      id BIGINT NOT NULL AUTO_INCREMENT,
      snapshot_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_schema_snapshots_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  const current = await fetchSchemaMap();
  const [[latest]] = await pool.execute(
    'SELECT id, snapshot_json FROM mims_schema_snapshots ORDER BY id DESC LIMIT 1'
  );

  if (!latest?.snapshot_json) {
    await pool.execute(
      'INSERT INTO mims_schema_snapshots (snapshot_json) VALUES (?)',
      [JSON.stringify(current)]
    );
    await emitProcessEvent({
      sourceModule: 'Schema Tracker',
      method: 'SCHEMA',
      path: '/schema/bootstrap',
      statusCode: 200,
      durationMs: 0,
      eventType: 'schema_snapshot',
      entityType: 'schema',
      entityId: 'bootstrap',
      summary: 'Schema tracker initialized baseline snapshot.',
      payload: { tables: Object.keys(current).length },
    });
    return;
  }

  let previous = {};
  try { previous = JSON.parse(latest.snapshot_json); } catch (_) { previous = {}; }

  const changes = diffSchemas(previous, current);
  for (const change of changes) {
    await emitProcessEvent({
      sourceModule: 'Schema Tracker',
      method: 'SCHEMA',
      path: `/schema/${change.entityId}`,
      statusCode: 200,
      durationMs: 0,
      eventType: change.eventType,
      entityType: change.entityType,
      entityId: change.entityId,
      summary: change.summary,
      payload: change.payload,
    });
  }

  await pool.execute(
    'INSERT INTO mims_schema_snapshots (snapshot_json) VALUES (?)',
    [JSON.stringify(current)]
  );
}

function startSchemaTracker() {
  if (timer) return;
  runSchemaScan().catch(() => {});
  timer = setInterval(() => { runSchemaScan().catch(() => {}); }, 5 * 60 * 1000);
}

function stopSchemaTracker() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

module.exports = { startSchemaTracker, stopSchemaTracker };
