const fs = require('fs/promises')
const path = require('path')
const mysql = require('mysql2/promise')

const connectionString =
  process.env.DATABASE_URL || 'mysql://devuser:devpass@127.0.0.1:3306/pharaxis_publications_dev'

function parseMysqlConnection(urlString) {
  const url = new URL(urlString)
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use mysql:// for Publications backend')
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

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

async function withTransaction(handler) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const client = {
      query: async (sql, params = []) => {
        const [rows] = await conn.query(sql, params)
        return rows
      }
    }

    const result = await handler(client)
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
  const schemaPath = path.join(__dirname, 'schema.mysql.sql')
  const sql = await fs.readFile(schemaPath, 'utf8')
  await pool.query(sql)

  async function ensureColumn({ tableName, columnName, alterSql }) {
    const [rows] = await pool.query(
      `
        SELECT COUNT(*) AS count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
      `,
      [tableName, columnName]
    )
    const hasColumn = Number(rows?.[0]?.count || 0) > 0
    if (!hasColumn) {
      await pool.query(alterSql)
    }
  }

  // Additive compatibility changes for existing local DBs.
  await ensureColumn({
    tableName: 'pub_milestones',
    columnName: 'overdue_notified_at',
    alterSql: `
      ALTER TABLE pub_milestones
      ADD COLUMN overdue_notified_at DATETIME(6) NULL
    `
  })

  await ensureColumn({
    tableName: 'pub_notifications',
    columnName: 'read_at',
    alterSql: `
      ALTER TABLE pub_notifications
      ADD COLUMN read_at DATETIME(6) NULL
    `
  })
}

module.exports = {
  pool,
  query,
  withTransaction,
  initializeDatabase
}
