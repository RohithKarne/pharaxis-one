import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

let pool;

export function getDbPool() {
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL });
  }
  return pool;
}
