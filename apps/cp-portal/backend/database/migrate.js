const fs = require('fs')
const path = require('path')
const { pool } = require('./db')

const migrationsDir = path.resolve(__dirname, './migrations')

function checksum(content) {
  let hash = 0
  for (let i = 0; i < content.length; i += 1) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function splitSql(content) {
  return content
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean)
}

async function ensureMigrationTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cp_schema_migrations (
      id INT NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL UNIQUE,
      checksum VARCHAR(64) NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function runMigrations({ logger = console } = {}) {
  await ensureMigrationTable()
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort()

  let appliedCount = 0
  for (const file of files) {
    // Checked per file rather than from one snapshot taken before the loop: the
    // 0000 baseline records 0002-0012 as applied while it runs, and a snapshot
    // taken beforehand would not contain those rows, so those migrations would
    // run anyway on a fresh database and fail on duplicate columns.
    const [[alreadyApplied]] = await pool.query(
      'SELECT 1 AS applied FROM cp_schema_migrations WHERE filename = ? LIMIT 1',
      [file]
    )
    if (alreadyApplied) {
      if (logger?.log) logger.log(`skip ${file}`)
      continue
    }

    const fullPath = path.join(migrationsDir, file)
    const content = fs.readFileSync(fullPath, 'utf8')
    const statements = splitSql(content)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const statement of statements) {
        await connection.query(statement)
      }
      await connection.query(
        'INSERT INTO cp_schema_migrations (filename, checksum) VALUES (?, ?)',
        [file, checksum(content)]
      )
      await connection.commit()
      appliedCount += 1
      if (logger?.log) logger.log(`applied ${file}`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  if (logger?.log) {
    logger.log(`CP Portal migrations complete. Applied ${appliedCount} new file(s).`)
  }
  return { appliedCount }
}

module.exports = { runMigrations }
