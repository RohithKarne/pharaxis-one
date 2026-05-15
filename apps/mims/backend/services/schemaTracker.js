'use strict';

const pool = require('../database/db');
const { emitProcessEvent } = require('./processExplorerService');

let timer = null;
const MAX_SCHEMA_SNAPSHOTS = parseInt(process.env.MIMS_SCHEMA_SNAPSHOT_RETENTION || '100', 10);

async function fetchSchemaMap() {
  const [rows] = await pool.execute(
    `SELECT table_name AS tableName,
            column_name AS columnName,
            column_type AS columnType,
            is_nullable AS isNullable,
            column_key AS columnKey
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
     ORDER BY table_name, ordinal_position`
  );
  const map = {};
  for (const row of rows) {
    const t = row.tableName;
    if (!map[t]) map[t] = [];
    map[t].push({
      name: row.columnName,
      type: row.columnType,
      nullable: row.isNullable,
      key: row.columnKey,
    });
  }
  return map;
}

function isValidSchemaMap(schemaMap) {
  if (!schemaMap || typeof schemaMap !== 'object' || Array.isArray(schemaMap)) return false;
  const tables = Object.keys(schemaMap);
  if (tables.length === 0 || tables.includes('undefined')) return false;
  return tables.every(table => Array.isArray(schemaMap[table]));
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

  await pool.execute(
    `DELETE FROM mims_schema_snapshots
      WHERE snapshot_json LIKE '{\\"undefined\\":%'`
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
  if (!isValidSchemaMap(previous)) previous = {};

  const changes = diffSchemas(previous, current);
  if (changes.length === 0) {
    await pruneOldSnapshots();
    return;
  }

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
  await pruneOldSnapshots();
}

async function pruneOldSnapshots() {
  if (!Number.isFinite(MAX_SCHEMA_SNAPSHOTS) || MAX_SCHEMA_SNAPSHOTS <= 0) return;
  const retention = Math.max(1, Math.floor(MAX_SCHEMA_SNAPSHOTS));
  await pool.execute(
    `DELETE FROM mims_schema_snapshots
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id
          FROM mims_schema_snapshots
          ORDER BY id DESC
          LIMIT ${retention}
        ) retained
      )`
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

module.exports = { startSchemaTracker, stopSchemaTracker, runSchemaScan };
