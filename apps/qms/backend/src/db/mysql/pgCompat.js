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
export function toMysqlSql(sql, params = []) {
  const outParams = [];
  const text = sql.replace(/\$(\d+)/g, (_match, digits) => {
    const index = Number(digits) - 1;
    if (index < 0 || index >= params.length) {
      throw new Error(
        `pgCompat: query references $${digits} but only ${params.length} parameter(s) were supplied`
      );
    }
    outParams.push(params[index]);
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
