import dotenv from 'dotenv';

dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET'];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`[qms-backend] Missing required environment variable: ${name}`);
  }
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3145),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
  CORS_ALLOW_ALL: String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true',
  CORS_ALLOWED_ORIGINS: String(process.env.CORS_ALLOWED_ORIGINS || ''),
  KEYCLOAK_JWKS_URI: process.env.KEYCLOAK_JWKS_URI || '',
  KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER || '',
  KEYCLOAK_AUDIENCE: process.env.KEYCLOAK_AUDIENCE || ''
};
