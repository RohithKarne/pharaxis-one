import dotenv from 'dotenv';

dotenv.config();

// DATABASE_URL is no longer required: the application runs on MySQL after the
// cutover. It is still read when present, because the migration tooling
// (src/db/mysql/copyFromPostgres.js) and the parity gates
// (tests/mysql-schema-check.mjs, tests/tenant-scope-audit.mjs) compare against
// the PostgreSQL database. A deployment that has no Postgres at all must still
// boot, so requiring it here would be wrong.
const required = ['JWT_SECRET'];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`[qms-backend] Missing required environment variable: ${name}`);
  }
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3145),

  // MySQL — the application database.
  MYSQL_HOST: process.env.MYSQL_HOST || '127.0.0.1',
  MYSQL_PORT: Number(process.env.MYSQL_PORT || 3306),
  MYSQL_USER: process.env.MYSQL_USER || 'devuser',
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'pharaxis_qms_dev',

  // PostgreSQL — migration tooling and parity gates only, not the app.
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ALLOW_ALL: String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true',
  CORS_ALLOWED_ORIGINS: String(process.env.CORS_ALLOWED_ORIGINS || ''),
  KEYCLOAK_JWKS_URI: process.env.KEYCLOAK_JWKS_URI || '',
  KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER || '',
  KEYCLOAK_AUDIENCE: process.env.KEYCLOAK_AUDIENCE || ''
};
