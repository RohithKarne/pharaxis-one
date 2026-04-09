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
  const queries = [
    // Org API key config — one active row per org
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

    // Usage log — every query recorded
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

    // Prompt templates — Phase 2, schema defined now
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

  for (const query of queries) {
    await pool.execute(query)
  }

  console.log('AI-Agent database initialized')
}

module.exports = { pool, initializeDatabase }
