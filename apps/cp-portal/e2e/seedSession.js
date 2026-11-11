import fs from 'node:fs';
import path from 'node:path';

// Who the portal session specs sign in as. backend/tests/seed-e2e.js creates
// the user on a `_test` database and writes this file.
const SEED_FILE = path.resolve(__dirname, '.e2e-seed.json');

export function seededHcp() {
  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch {
    throw new Error(`No ${SEED_FILE}. Run backend/tests/seed-e2e.js against the test database first.`);
  }
  return {
    clientCode: seed.clientCode,
    session: { userId: seed.hcp.userId, clientId: seed.clientId, email: seed.hcp.email, name: 'Sarah Chen', user_type: 'hcp', tv: 0 },
  };
}
