'use strict';
/**
 * db.js — MySQL connection pool + migration runner
 *
 * Creates the pool and runs all migrations in order on startup.
 * Schema lives in database/migrations/001_*.js … 015_*.js
 * Exports `pool` and `initPromise` (server.js awaits before accepting requests).
 */

const mysql  = require('mysql2/promise');
const path   = require('path');
const fs     = require('fs');
const { runMigrations } = require('./migrationRunner');

function loadLocalEnvFile() {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath) || process.env.NODE_ENV === 'production') return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key.startsWith('MYSQL_')) process.env[key] = value;
  }
}

loadLocalEnvFile();

const isProd        = process.env.NODE_ENV === 'production';
const MYSQL_HOST     = process.env.MYSQL_HOST     || 'localhost';
const MYSQL_PORT     = parseInt(process.env.MYSQL_PORT || '3306', 10);
const MYSQL_USER     = process.env.MYSQL_USER     || 'mims_user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

if (isProd) {
  if (!MYSQL_USER)     throw new Error('MYSQL_USER is required in production.');
  if (!MYSQL_PASSWORD) throw new Error('MYSQL_PASSWORD is required in production.');
  if (!MYSQL_DATABASE) throw new Error('MYSQL_DATABASE is required in production.');
}

const pool = mysql.createPool({
  host:               MYSQL_HOST,
  port:               MYSQL_PORT,
  user:               MYSQL_USER,
  password:           MYSQL_PASSWORD,
  database:           MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit:    parseInt(process.env.MYSQL_POOL_SIZE || '20', 10),
  queueLimit:         0,
  connectTimeout:     parseInt(process.env.MYSQL_CONNECT_TIMEOUT_MS || '10000', 10),
  charset:            'utf8mb4',
  timezone:           '+00:00',
});

// Enforce STRICT mode (+ UTC) on every pooled connection so over-length pharma
// text or bad dates cannot be silently truncated / zero-filled, regardless of
// the production server's global sql_mode default. (Audit finding C-11.)
pool.on('connection', (conn) => {
  conn.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION', time_zone = '+00:00'");
});

async function initializeDatabase() {
  const conn = await pool.getConnection();
  try {
    await runMigrations(conn, MYSQL_DATABASE);
    console.log('✅ Database initialized — tables ready');
  } finally {
    conn.release();
  }
}

const initPromise = initializeDatabase().catch(err => {
  console.error('❌ Database initialization failed:', err.message);
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    throw err;
  }
  process.exit(1);
});

module.exports = pool;
module.exports.initPromise = initPromise;
