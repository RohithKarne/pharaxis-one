'use strict';

const path = require('path');

try {
  process.loadEnvFile(process.env.MIMS_ENV_FILE || path.join(__dirname, '..', '.env'));
} catch (_) {
  // Best-effort; the app runtime may already have env loaded.
}

const { getRuntimeHealth } = require('../services/runtimeHealthService');

(async () => {
  const health = await getRuntimeHealth();
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
  if (health.status === 'failed') process.exitCode = 1;
})().catch((err) => {
  process.stderr.write(`${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
