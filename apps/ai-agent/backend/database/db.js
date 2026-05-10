require('dotenv').config()
const mysql = require('mysql2/promise')

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: process.env.MYSQL_DATABASE || 'pharaxis_ai_agent_dev',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
})

async function initializeDatabase() {
  console.warn('initializeDatabase() is deprecated. Use database/migrate.js (runMigrations) instead.')
}

module.exports = { pool, initializeDatabase }
