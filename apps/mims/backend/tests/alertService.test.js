'use strict';
// PAUD-3 item 3: emitPlatformAdminAlert recorded in_app_status = 'sent' whenever
// the in_app channel was enabled, even when createNotificationsForPlatformAdmins
// wrote zero rows because no active platform admin user exists. The alert reached
// nobody while the events table reported success.

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }), { virtual: true });

const mockExecute = jest.fn();
jest.mock('../database/db', () => ({ execute: (...args) => mockExecute(...args) }));

const mockWarn = jest.fn();
jest.mock('../services/logger', () => ({ logger: { warn: (...args) => mockWarn(...args) } }));

const { emitPlatformAdminAlert, warnOnUnreachableAlertRules } = require('../services/alertService');

const RULE = {
  id: 4,
  name: 'Mailbox Failure',
  event_type: 'mailbox_failure',
  severity: 'high',
  channels: 'in_app',
  recipient_emails: '',
  threshold_value: 1,
  window_minutes: 15,
  cooldown_minutes: 0,
  is_active: 1,
};

// Minimal stand-in for the queries emitPlatformAdminAlert runs for an in_app-only
// rule. Returns the recorded calls so assertions can read what was written.
function stubDatabase(activePlatformAdmins) {
  const calls = [];
  mockExecute.mockImplementation(async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO platform_admin_alert_events')) return [{ insertId: 77 }];
    if (sql.includes('UPDATE platform_admin_alert_events')) return [{}];
    if (sql.includes('FROM platform_admin_alert_rules')) return [[RULE]];
    if (sql.includes('FROM users u')) return [activePlatformAdmins];
    if (sql.includes('INSERT INTO notifications')) return [{ insertId: 1 }];
    throw new Error(`unexpected SQL in test stub: ${sql}`);
  });
  return calls;
}

const statusUpdate = calls => calls.find(c => c.sql.includes('SET email_status = ?, in_app_status = ?'));
const notificationInserts = calls => calls.filter(c => c.sql.includes('INSERT INTO notifications'));
const metadataUpdate = calls => calls.find(c => c.sql.includes('SET metadata = ?'));

// Stub for the boot-time reachability check: active rules, then the admin count.
function stubActiveRules(rules, activePlatformAdmins = []) {
  mockExecute.mockImplementation(async (sql) => {
    if (sql.includes('FROM platform_admin_alert_rules')) return [rules];
    if (sql.includes('FROM users u')) return [activePlatformAdmins];
    throw new Error(`unexpected SQL in test stub: ${sql}`);
  });
}

beforeEach(() => {
  mockExecute.mockReset();
  mockWarn.mockReset();
});

describe('emitPlatformAdminAlert in-app delivery status', () => {
  test('records skipped, not sent, when there is no active platform admin to notify', async () => {
    const calls = stubDatabase([]);

    const [event] = await emitPlatformAdminAlert('mailbox_failure', { title: 'Mailbox down' });

    expect(notificationInserts(calls)).toHaveLength(0);
    expect(statusUpdate(calls).params[1]).toBe('skipped');
    expect(event.inAppStatus).toBe('skipped');
  });

  test('records why in-app delivery was skipped', async () => {
    const calls = stubDatabase([]);

    await emitPlatformAdminAlert('mailbox_failure', { title: 'Mailbox down' });

    expect(JSON.parse(metadataUpdate(calls).params[0]).inAppError)
      .toBe('No active platform admin users to notify.');
  });

  test('still records sent when a notification actually lands', async () => {
    const calls = stubDatabase([{ id: 9, email: 'ops@example.com', name: 'Ops' }]);

    const [event] = await emitPlatformAdminAlert('mailbox_failure', { title: 'Mailbox down' });

    expect(notificationInserts(calls)).toHaveLength(1);
    expect(statusUpdate(calls).params[1]).toBe('sent');
    expect(event.inAppStatus).toBe('sent');
    expect(metadataUpdate(calls)).toBeUndefined();
  });
});

describe('warnOnUnreachableAlertRules', () => {
  test('flags an active rule with no recipient emails and no active platform admin', async () => {
    stubActiveRules([{ ...RULE, channels: 'email,in_app', recipient_emails: '' }], []);

    const unreachable = await warnOnUnreachableAlertRules();

    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].reasons).toEqual([
      'no recipient emails configured',
      'no active platform admin users',
    ]);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][1]).toContain('can reach nobody');
  });

  test('gives the reason for the channels the rule actually uses', async () => {
    stubActiveRules([{ ...RULE, channels: 'in_app', recipient_emails: '' }], []);

    const [unreachable] = await warnOnUnreachableAlertRules();

    expect(unreachable.reasons).toEqual(['no active platform admin users']);
  });

  test('stays quiet when one channel can reach someone', async () => {
    stubActiveRules(
      [
        { ...RULE, id: 1, channels: 'email,in_app', recipient_emails: 'ops@example.com' },
        { ...RULE, id: 2, channels: 'in_app', recipient_emails: '' },
      ],
      [{ id: 9, email: 'ops@example.com', name: 'Ops' }]
    );

    expect(await warnOnUnreachableAlertRules()).toEqual([]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  test('does not query users when no rule is active', async () => {
    stubActiveRules([]);

    expect(await warnOnUnreachableAlertRules()).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
