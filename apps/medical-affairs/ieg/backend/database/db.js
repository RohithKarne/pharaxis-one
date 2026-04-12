const fs = require('fs/promises')
const path = require('path')
const mysql = require('mysql2/promise')

const connectionString =
  process.env.DATABASE_URL || 'mysql://devuser:devpass@127.0.0.1:3306/pharaxis_ieg_dev'

function parseMysqlConnection(urlString) {
  const url = new URL(urlString)
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use mysql:// for IEG backend')
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: (url.pathname || '').replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    typeCast: (field, next) => {
      if (field.type === 'JSON') {
        const raw = field.string('utf8')
        if (raw === null) return null
        try {
          return JSON.parse(raw)
        } catch (_error) {
          return raw
        }
      }
      return next()
    }
  }
}

const pool = mysql.createPool(parseMysqlConnection(connectionString))

function sanitizeParamValue(value) {
  if (value === undefined) return null
  if (value === null) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Date) return value
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

function transformSqlDialect(sql) {
  let next = String(sql || '')

  // PostgreSQL casts -> raw expressions
  next = next.replace(/::[a-zA-Z_][a-zA-Z0-9_\[\]]*/g, '')

  // PostgreSQL case-insensitive operator
  next = next.replace(/\bILIKE\b/g, 'LIKE')

  // JSON merge in PG style: data = data || $1 -> MySQL JSON_MERGE_PATCH
  next = next.replace(
    /(\b[a-zA-Z_][a-zA-Z0-9_]*\b)\s*=\s*\1\s*\|\|\s*(\$\d+)/g,
    (_match, columnName, placeholder) => `${columnName} = JSON_MERGE_PATCH(COALESCE(${columnName}, JSON_OBJECT()), ${placeholder})`
  )

  // INSERT ... ON CONFLICT DO NOTHING -> INSERT IGNORE
  if (/^\s*INSERT\s+/i.test(next) && /ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i.test(next)) {
    next = next.replace(/^\s*INSERT/i, 'INSERT IGNORE')
    next = next.replace(/ON\s+CONFLICT[\s\S]*DO\s+NOTHING/i, '')
  }

  // INSERT ... ON CONFLICT (...) DO UPDATE SET ... -> ON DUPLICATE KEY UPDATE ...
  const upsertMatch = next.match(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+)/i)
  if (upsertMatch) {
    const setClause = upsertMatch[1]
      .replace(/EXCLUDED\.([a-zA-Z_][a-zA-Z0-9_]*)/g, 'VALUES($1)')
      .trim()
    next = next.replace(
      /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+[\s\S]+/i,
      `ON DUPLICATE KEY UPDATE ${setClause}`
    )
  }

  return next
}

function bindPgParamsToMysql(sql, params = []) {
  const boundValues = []
  const convertedSql = sql.replace(/\$([0-9]+)/g, (_match, group) => {
    const index = Number(group) - 1
    boundValues.push(sanitizeParamValue(params[index]))
    return '?'
  })
  return { sql: convertedSql, params: boundValues }
}

async function executeSql(executor, text, params = []) {
  const rawSql = String(text || '').trim()
  const returningMatch = rawSql.match(/\bRETURNING\s+([\s\S]+)$/i)
  const hasReturning = Boolean(returningMatch)
  const returningClause = returningMatch ? returningMatch[1].trim() : '*'
  const sqlWithoutReturning = hasReturning
    ? rawSql.replace(/\bRETURNING\s+[\s\S]+$/i, '')
    : rawSql
  const transformedSql = transformSqlDialect(sqlWithoutReturning)
  const { sql, params: mysqlParams } = bindPgParamsToMysql(transformedSql, params)

  const [result] = await executor.query(sql, mysqlParams)

  if (!hasReturning) {
    if (Array.isArray(result)) return { rows: result }
    return { rows: [] }
  }

  if (/^\s*INSERT\s+/i.test(sqlWithoutReturning)) {
    const tableMatch = sqlWithoutReturning.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i)
    const tableName = tableMatch ? tableMatch[1] : null

    if (tableName && result && result.insertId) {
      const selectColumns = returningClause === '*' ? '*' : returningClause
      const [rows] = await executor.query(
        `SELECT ${selectColumns} FROM ${tableName} WHERE id = ?`,
        [result.insertId]
      )
      return { rows: Array.isArray(rows) ? rows : [] }
    }
    return { rows: [] }
  }

  if (/^\s*UPDATE\s+/i.test(sqlWithoutReturning)) {
    const tableMatch = sqlWithoutReturning.match(/UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+SET/i)
    const whereMatch = sqlWithoutReturning.match(/\bWHERE\b([\s\S]*)$/i)
    if (!tableMatch || !whereMatch) {
      return { rows: [] }
    }

    const whereSqlTransformed = transformSqlDialect(whereMatch[1])
    const boundWhere = bindPgParamsToMysql(whereSqlTransformed, params)
    const selectColumns = returningClause === '*' ? '*' : returningClause
    const [rows] = await executor.query(
      `SELECT ${selectColumns} FROM ${tableMatch[1]} WHERE ${boundWhere.sql}`,
      boundWhere.params
    )
    return { rows: Array.isArray(rows) ? rows : [] }
  }

  return { rows: [] }
}

async function query(text, params = []) {
  return executeSql(pool, text, params)
}

async function withTransaction(handler) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const txClient = {
      query: (text, params = []) => executeSql(conn, text, params)
    }
    const result = await handler(txClient)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function initializeDatabase() {
  const { rows } = await query(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name LIKE 'ieg_%'
    `
  )
  const count = Number(rows[0]?.count || 0)
  if (count === 0) {
    const schemaPath = path.join(__dirname, 'schema.mysql.sql')
    const sql = await fs.readFile(schemaPath, 'utf8')
    await pool.query(sql)
  }

  // Sprint 2 additive schema (idempotent CREATE TABLE IF NOT EXISTS)
  const sprint2SchemaPath = path.join(__dirname, 'schema.mysql.sprint2.sql')
  try {
    const sprint2Sql = await fs.readFile(sprint2SchemaPath, 'utf8')
    if (String(sprint2Sql || '').trim()) {
      await pool.query(sprint2Sql)
    }
  } catch (_error) {
    // Optional file for incremental schema additions.
  }

  // Audit log hardening — DB-level immutability triggers
  // Created programmatically (DELIMITER syntax not supported by mysql2 pool)
  try {
    await pool.query('DROP TRIGGER IF EXISTS trg_ieg_audit_log_no_update')
    await pool.query('DROP TRIGGER IF EXISTS trg_ieg_audit_log_no_delete')
    await pool.query(`
      CREATE TRIGGER trg_ieg_audit_log_no_update
      BEFORE UPDATE ON ieg_audit_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'ieg_audit_log is immutable: UPDATE operations are not permitted';
      END
    `)
    await pool.query(`
      CREATE TRIGGER trg_ieg_audit_log_no_delete
      BEFORE DELETE ON ieg_audit_log
      FOR EACH ROW
      BEGIN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'ieg_audit_log is immutable: DELETE operations are not permitted';
      END
    `)
  } catch (_error) {
    // Non-fatal: DB user may lack TRIGGER privilege.
    // Immutability is also enforced at application layer.
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  initializeDatabase
}
