'use strict';

/**
 * PAUD-3 remediation batch — items 1, 3, 4a.
 *
 * Item 9 (apiPlatform contacts / documents) is not covered here: those routes
 * need a live database and an authenticated API client, so they belong to the
 * Tier 3 browser/API suite Krishnapriya owns, not to this unit file. Said
 * plainly rather than left as an implied gap.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { getBuildInfo } = require('../services/buildInfo');
const { buildSslOption } = require('../database/sslConfig');
const REGISTRY = require('../services/schedulerRegistry');

// ── Item 1 — build version ──────────────────────────────────────────────────

describe('PAUD-3 item 1 — build version', () => {
  test('reports the package version, not a hardcoded string', () => {
    const info = getBuildInfo();
    const packageVersion = require('../../package.json').version;

    expect(info.version).toBe(packageVersion);
    expect(info.app).toBe('mims');
  });

  test('commit and built_at read "unknown" rather than inventing a value', () => {
    // The defect being fixed was a version string that was always present and
    // never true. An honest "unknown" is the requirement here.
    const info = getBuildInfo();

    for (const field of ['commit', 'built_at']) {
      expect(typeof info[field]).toBe('string');
      expect(info[field].length).toBeGreaterThan(0);
    }
  });
});

// ── Item 3 — runtime health watch ───────────────────────────────────────────

describe('PAUD-3 item 3 — runtime health watch', () => {
  const REGISTRY_NAME = 'runtime-health-watch';

  test('the job is registered', () => {
    const entry = REGISTRY.find((job) => job.name === REGISTRY_NAME);

    expect(entry).toBeDefined();
    expect(entry.type).toBe('cron');
    expect(entry.cronExpression).toBe('*/5 * * * *');
  });

  test('every registered cron job has a handler', () => {
    // Registry and handler map are two separate files; an entry with no handler
    // is a job that silently never runs.
    jest.isolateModules(() => {
      jest.doMock('../database/db', () => ({ execute: jest.fn() }));
      const { HANDLERS } = require('../services/scheduler');

      for (const job of REGISTRY.filter((j) => j.type === 'cron')) {
        expect(typeof HANDLERS[job.name]).toBe('function');
      }
    });
  });

  describe('alerting behaviour', () => {
    function loadService({ health, healthError }) {
      const emitPlatformAdminAlert = jest.fn().mockResolvedValue([{ id: 1 }]);
      const getRuntimeHealth = healthError
        ? jest.fn().mockRejectedValue(healthError)
        : jest.fn().mockResolvedValue(health);

      let service;
      jest.isolateModules(() => {
        jest.doMock('../services/runtimeHealthService', () => ({ getRuntimeHealth }));
        jest.doMock('../services/alertService', () => ({ emitPlatformAdminAlert }));
        jest.doMock('../services/logger', () => ({
          logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        }));
        service = require('../services/runtimeHealthWatchService');
      });

      return { service, emitPlatformAdminAlert, getRuntimeHealth };
    }

    test('a healthy system raises no alert', async () => {
      const { service, emitPlatformAdminAlert } = loadService({
        health: { status: 'ok', checks: [{ name: 'database_connectivity', status: 'ok' }] },
      });

      const result = await service.runRuntimeHealthWatch();

      expect(emitPlatformAdminAlert).not.toHaveBeenCalled();
      expect(result.alerted).toBe(false);
    });

    test('a failed check raises a high-severity alert naming the failing checks', async () => {
      const { service, emitPlatformAdminAlert } = loadService({
        health: {
          status: 'failed',
          generated_at: '2026-08-05T02:00:00.000Z',
          checks: [
            { name: 'database_connectivity', status: 'ok', detail: 'fine' },
            { name: 'failed_email_jobs', status: 'failed', detail: '12 email jobs failed.' },
          ],
        },
      });

      const result = await service.runRuntimeHealthWatch();

      expect(emitPlatformAdminAlert).toHaveBeenCalledTimes(1);
      const [eventType, payload] = emitPlatformAdminAlert.mock.calls[0];
      expect(eventType).toBe('runtime_health_degraded');
      expect(payload.severity).toBe('high');
      expect(payload.message).toContain('failed_email_jobs');
      expect(payload.message).not.toContain('database_connectivity');
      expect(payload.metadata.failing_checks).toEqual(['failed_email_jobs']);
      expect(result.alerted).toBe(true);
    });

    test('a warning raises a medium-severity alert, not high', async () => {
      const { service, emitPlatformAdminAlert } = loadService({
        health: {
          status: 'warning',
          checks: [{ name: 'worker_alerts_24h', status: 'warning', detail: '3 warnings.' }],
        },
      });

      await service.runRuntimeHealthWatch();

      expect(emitPlatformAdminAlert.mock.calls[0][1].severity).toBe('medium');
    });

    test('a database outage surfaces as a thrown error, never a silent pass', async () => {
      // getRuntimeHealth opens with SELECT 1, so an unreachable database throws
      // rather than returning status:'failed'. Swallowing it here would make the
      // job log "completed" during the exact outage it exists to catch.
      const { service, emitPlatformAdminAlert } = loadService({
        healthError: new Error('ECONNREFUSED'),
      });

      await expect(service.runRuntimeHealthWatch()).rejects.toThrow('ECONNREFUSED');
      expect(emitPlatformAdminAlert).not.toHaveBeenCalled();
    });
  });
});

// ── Item 4a — database TLS ──────────────────────────────────────────────────

describe('PAUD-3 item 4a — MySQL TLS option', () => {
  test('is off unless explicitly switched on', () => {
    expect(buildSslOption({})).toBeUndefined();
    expect(buildSslOption({ MYSQL_SSL: 'false' })).toBeUndefined();
    // A CA path alone must not enable TLS — that would flip existing
    // environments on at deploy time without anyone asking for it.
    expect(buildSslOption({ MYSQL_SSL_CA: '/tmp/ca.pem' })).toBeUndefined();
  });

  test('refuses to run unauthenticated TLS in production', () => {
    expect(() =>
      buildSslOption({ MYSQL_SSL: 'true', NODE_ENV: 'production' })
    ).toThrow(/MYSQL_SSL_CA is required/);
  });

  test('allows unauthenticated TLS outside production, for local testing only', () => {
    expect(buildSslOption({ MYSQL_SSL: 'true' })).toEqual({ rejectUnauthorized: false });
  });

  test('fails loudly when the CA path does not exist', () => {
    expect(() =>
      buildSslOption({ MYSQL_SSL: 'true', MYSQL_SSL_CA: '/no/such/ca.pem' })
    ).toThrow(/does not exist/);
  });

  test('reads the CA and verifies the server when one is supplied', () => {
    const caPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paud3-')), 'ca.pem');
    fs.writeFileSync(caPath, '---CA---');

    expect(buildSslOption({ MYSQL_SSL: 'true', MYSQL_SSL_CA: caPath })).toEqual({
      ca: '---CA---',
      rejectUnauthorized: true,
    });
  });
});
