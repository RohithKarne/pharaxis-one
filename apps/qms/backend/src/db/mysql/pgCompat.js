/**
 * pgCompat.js — present a mysql2 connection through the `pg` client interface.
 *
 * Phase 2 of the PostgreSQL -> MySQL migration. 351 call sites across the routes
 * and services do:
 *
 *     const { rows } = await client.query('... WHERE id = $1', [id]);
 *
 * Both halves of that are Postgres-shaped: `$n` placeholders, and a result
 * object with `.rows`. mysql2 uses `?` and returns `[rows, fields]`.
 *
 * Rewriting 351 call sites by hand would be a very large diff for a purely
 * mechanical difference, and every hand-edit is a chance to renumber a parameter
 * wrongly. This adapter does the mechanical part in one reviewable place so the
 * call sites keep working unchanged, leaving only the genuinely non-mechanical
 * translations (RETURNING, ON CONFLICT, casts) as real work.
 *
 * WHAT THIS DOES NOT DO — deliberately:
 *   - RETURNING: MySQL has no equivalent. Not shimmable; each site needs a real
 *     fix (generate the id in the app, then SELECT it back).
 *   - ON CONFLICT: the MySQL form names the columns to update, so the rewrite
 *     is query-specific.
 *   - :: casts, now(), FILTER (WHERE ...), split_part(): each needs judgement.
 * Those are tracked by tests/mysql-dialect-audit.mjs and must be fixed at the
 * call site, not hidden here. An adapter that silently patched them would make
 * the audit read clean while the semantics quietly drifted.
 */

/**
 * Rewrite Postgres `$n` placeholders to mysql2 `?`, reordering the parameter
 * array to match occurrence order.
 *
 * The subtle part: Postgres lets one placeholder appear many times —
 *   WHERE (source_id = $1 OR target_id = $1) AND org_id = $2
 * takes 2 parameters. mysql2's `?` is strictly positional, so that same query
 * needs 3, with the first value repeated. QMS really does have queries of this
 * shape (the qms_trace_links lookups), so getting this wrong would bind the
 * wrong value rather than fail loudly.
 */
/**
 * Serialise a bound value the way node-postgres did.
 *
 * pg automatically JSON-encodes a plain object or array bound to a json/jsonb
 * column. mysql2 does NOT: an object arrives as the string "[object Object]",
 * which MySQL rejects with
 *   Invalid JSON text: "Invalid value." at position 1
 * and an array is expanded into a comma-separated value list, which silently
 * corrupts the column or throws "Column count doesn't match value count".
 *
 * Both failures are driver mechanics, not query semantics, so they belong here
 * rather than in the ~50 call sites that pass a payload object. Handling it in
 * one place also means a new call site cannot reintroduce the bug.
 *
 * Date and Buffer are deliberately passed through — mysql2 serialises those
 * itself, and JSON-encoding a Date would write a quoted string into a DATETIME.
 */
function toBindValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function toMysqlSql(sql, params = []) {
  const outParams = [];
  const text = sql.replace(/\$(\d+)/g, (_match, digits) => {
    const index = Number(digits) - 1;
    if (index < 0 || index >= params.length) {
      throw new Error(
        `pgCompat: query references $${digits} but only ${params.length} parameter(s) were supplied`
      );
    }
    outParams.push(toBindValue(params[index]));
    return '?';
  });
  return { text, values: outParams };
}

/**
 * Wrap a mysql2 connection so it answers `.query(sql, params)` with a
 * pg-shaped `{ rows, rowCount }`.
 *
 * For INSERT/UPDATE/DELETE, mysql2 returns an OkPacket rather than rows;
 * rowCount is taken from affectedRows so the many `if (result.rowCount === 0)`
 * guards in the routes keep working.
 */
export function asPgClient(connection) {
  return {
    async query(sql, params = []) {
      const { text, values } = toMysqlSql(sql, params);
      const [result] = await connection.query(text, values);

      if (Array.isArray(result)) {
        return { rows: result, rowCount: result.length };
      }

      return {
        rows: [],
        rowCount: result?.affectedRows ?? 0,
        insertId: result?.insertId
      };
    },

    release() {
      if (typeof connection.release === 'function') connection.release();
    },

    get raw() {
      return connection;
    }
  };
}
