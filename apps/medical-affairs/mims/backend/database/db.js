'use strict';
/**
 * db.js — MySQL connection pool + migration runner
 *
 * Creates the pool and runs all migrations in order on startup.
 * Schema lives in database/migrations/001_*.js … 015_*.js
 * Exports `pool` and `initPromise` (server.js awaits before accepting requests).
 */

const mysql  = require('mysql2/promise');
const { runMigrations } = require('./migrationRunner');

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
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',
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
  process.exit(1);
});

module.exports = pool;
module.exports.initPromise = initPromise;
