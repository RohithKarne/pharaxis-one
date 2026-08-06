'use strict';
/**
 * services/runtimeHealthWatchService.js — pushes runtime health out instead of
 * waiting for someone to open a screen.
 *
 * PAUD-3 item 3. getRuntimeHealth() only ran when an admin opened the
 * observability page, so a 2am failure sat unseen until a user reported it.
 * This runs it on a cron and raises a platform-admin alert when it degrades.
 *
 * KNOWN LIMIT — a total database outage cannot self-report through this path.
 * getRuntimeHealth() opens with a `SELECT 1`, and emitPlatformAdminAlert() reads
 * its rules from the same database. If MySQL is unreachable, the failure is
 * logged to stdout and nothing else. Catching the outage that matters most needs
 * a monitor outside this process; that is not in this change.
 */

const { getRuntimeHealth } = require('./runtimeHealthService');
const { emitPlatformAdminAlert } = require('./alertService');
const { logger } = require('./logger');

const EVENT_TYPE = 'runtime_health_degraded';

function describe(check) {
  return `${check.name}: ${check.detail || check.status}`;
}

async function runRuntimeHealthWatch() {
  let health;
  try {
    health = await getRuntimeHealth();
  } catch (err) {
    // Almost always the database being unreachable — see KNOWN LIMIT above.
    logger.error(
      { job: 'runtime-health-watch', error: err?.message || String(err) },
      'Runtime health check could not run; no alert could be raised'
    );
    throw err;
  }

  if (health.status === 'ok') {
    return { status: 'ok', alerted: false, failing: [] };
  }

  const failing = (health.checks || []).filter((check) => check.status !== 'ok');
  const events = await emitPlatformAdminAlert(EVENT_TYPE, {
    severity: health.status === 'failed' ? 'high' : 'medium',
    title: `MIMS runtime health is ${health.status}`,
    message: failing.map(describe).join('\n') || 'Runtime health reported a non-ok status.',
    linkUrl: '/mims-admin?standalone=1',
    metadata: {
      status: health.status,
      generated_at: health.generated_at,
      failing_checks: failing.map((check) => check.name),
    },
  });

  logger.warn(
    {
      job: 'runtime-health-watch',
      status: health.status,
      failing: failing.map((check) => check.name),
      alert_events: events.length,
    },
    'Runtime health degraded'
  );

  return { status: health.status, alerted: events.length > 0, failing: failing.map((c) => c.name) };
}

module.exports = { runRuntimeHealthWatch, EVENT_TYPE };
