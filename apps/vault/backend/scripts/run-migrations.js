const fs = require('fs')
const path = require('path')
const { pool } = require('../database/db')
const migrationsDir = path.resolve(__dirname, '../database/migrations')
async function ensureMigrationTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS vault_schema_migrations (id INT NOT NULL AUTO_INCREMENT, filename VARCHAR(255) NOT NULL UNIQUE, checksum VARCHAR(64) NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
}
function checksum(content) { let hash = 0; for (let i = 0; i < content.length; i += 1) hash = ((hash << 5) - hash + content.charCodeAt(i)) >>> 0; return hash.toString(16).padStart(8, '0') }
function splitSql(content) { return content.split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean) }
async function run() {
  await ensureMigrationTable()
  const [rows] = await pool.query('SELECT filename FROM vault_schema_migrations')
  const applied = new Set(rows.map(row => row.filename))
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort()
  let appliedCount = 0
  for (const file of files) {
    if (applied.has(file)) { console.log(`skip ${file}`); continue }
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      for (const statement of splitSql(content)) await connection.query(statement)
      await connection.query('INSERT INTO vault_schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum(content)])
      await connection.commit()
      appliedCount += 1
      console.log(`applied ${file}`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }
  console.log(`Vault migrations complete. Applied ${appliedCount} new file(s).`)
}
run().catch(error => { console.error('Vault migration failed:', error); process.exitCode = 1 }).finally(async () => { await pool.end() })
