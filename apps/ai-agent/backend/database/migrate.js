require('dotenv').config()
const { pool } = require('./db')

const MIGRATIONS = [
  {
    id: '0001_initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS ai_agent_org_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        org_id INT NOT NULL,
        provider ENUM('openai','claude','gemini') NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        is_active TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_org_config (org_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ai_agent_usage_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        org_id INT NOT NULL,
        app_source ENUM('cp_portal','mims','vault','qms','safety','external') NOT NULL,
        query_type VARCHAR(100) NOT NULL,
        tokens_in INT DEFAULT 0,
        tokens_out INT DEFAULT 0,
        provider ENUM('openai','claude','gemini') NOT NULL,
        response_latency_ms INT DEFAULT 0,
        status ENUM('success','failed','timeout') DEFAULT 'success',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS ai_agent_prompt_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        app_source ENUM('cp_portal','mims','vault','qms','safety','external') NOT NULL,
        query_type VARCHAR(100) NOT NULL,
        template_body TEXT NOT NULL,
        version INT DEFAULT 1,
        is_active TINYINT(1) DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ]
  }
]

async function ensureMigrationTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ai_agent_schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_key VARCHAR(128) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function runMigrations({ logger = console } = {}) {
  await ensureMigrationTable()
  const [rows] = await pool.execute('SELECT migration_key FROM ai_agent_schema_migrations')
  const applied = new Set(rows.map(row => row.migration_key))

  let appliedCount = 0
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      if (logger?.log) logger.log(`skip ${migration.id}`)
      continue
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const statement of migration.statements) {
        await connection.execute(statement)
      }
      await connection.execute(
        'INSERT INTO ai_agent_schema_migrations (migration_key) VALUES (?)',
        [migration.id]
      )
      await connection.commit()
      appliedCount += 1
      if (logger?.log) logger.log(`applied ${migration.id}`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  if (logger?.log) logger.log(`AI-Agent migrations complete. Applied ${appliedCount} migration(s).`)
  return { appliedCount }
}

if (require.main === module) {
  runMigrations()
    .catch(error => {
      console.error('AI-Agent migration failed:', error)
      process.exitCode = 1
    })
    .finally(async () => {
      await pool.end()
    })
}

module.exports = { runMigrations }
