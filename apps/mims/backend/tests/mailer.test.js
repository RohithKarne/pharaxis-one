'use strict';
// Rohith, 2026-09-05: MIMS alert and warning mail must stop reaching him. Login
// codes (2FA, password reset) and case replies to contacts stay on — narrowed on
// his instruction the same day.
//
// utils/mailer.js is the one gate every outbound email passes through. Each caller
// declares what kind of mail it is. Alerts are blocked; operational mail sends.
//
// These tests do NOT mock nodemailer. An earlier version did, and the mock bound
// on a warm node_modules but not on CI's fresh install, so five assertions saw a
// real transport and reported zero calls. Asserting the returned object instead
// removes the whole class of problem and tests the thing that actually matters:
// what the caller is handed. Building a transport opens no connection —
// nodemailer connects on send — so this is safe with a fake host.

const mailer = require('../utils/mailer');
const { execSync } = require('child_process');

const SMTP = { host: 'smtp.example.com', port: 587 };
const BACKEND = `${__dirname}/..`;

// A real nodemailer transport carries its own inner transporter and a long list
// of Mail methods. The blocked stub is a bare object with three functions.
function isRealTransport(t) {
  return Boolean(t && t.transporter) && typeof t.sendMail === 'function';
}

function grepBackend(pattern) {
  return execSync(
    `grep -rn ${JSON.stringify(pattern)} --exclude-dir=node_modules --exclude-dir=tests . || true`,
    { cwd: BACKEND, encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean);
}

beforeEach(() => {
  delete process.env.MIMS_ALERT_EMAIL;
});

describe('alert mail is off', () => {
  test('no real SMTP transport is built for an alert', () => {
    expect(isRealTransport(mailer.createTransport('alert', SMTP))).toBe(false);
  });

  test('sending an alert fails loudly instead of reporting success', async () => {
    const transport = mailer.createTransport('alert', SMTP);
    await expect(
      transport.sendMail({ to: 'someone@gmail.com', subject: 'Expiry alert' })
    ).rejects.toThrow(/Alert email is disabled/);
  });

  test('mail with no declared kind is treated as an alert and blocked', async () => {
    const transport = mailer.createTransport();
    expect(isRealTransport(transport)).toBe(false);
    await expect(transport.sendMail({ to: 'x@y.com' })).rejects.toThrow(/Alert email is disabled/);
  });

  test.each(['on', 'true', '1'])('alerts resume on MIMS_ALERT_EMAIL=%s', (value) => {
    process.env.MIMS_ALERT_EMAIL = value;
    expect(isRealTransport(mailer.createTransport('alert', SMTP))).toBe(true);
  });
});

describe('operational mail keeps working', () => {
  test('builds a real transport for login codes and case replies', () => {
    expect(isRealTransport(mailer.createTransport('operational', SMTP))).toBe(true);
  });

  test('is unaffected by the alert switch', () => {
    process.env.MIMS_ALERT_EMAIL = 'off';
    expect(isRealTransport(mailer.createTransport('operational', SMTP))).toBe(true);
  });
});

describe('every sender is routed and classified', () => {
  test('nothing reaches nodemailer directly', () => {
    const offenders = grepBackend('nodemailer.createTransport')
      .filter((line) => !line.startsWith('./utils/mailer.js:'));
    expect(offenders).toEqual([]);
  });

  test('every call site declares its kind', () => {
    const undeclared = grepBackend('mailer.createTransport(')
      .filter((line) => !line.startsWith('./utils/mailer.js:'))
      .filter((line) => !/'(alert|operational)'/.test(line));
    expect(undeclared).toEqual([]);
  });

  // The classification is the whole point of the change, so it is asserted rather
  // than left to whoever edits these files next.
  test.each([
    ['./services/alertService.js', 'alert'],
    ['./services/cmExpiryAlertService.js', 'alert'],
    ['./services/twoFactorService.js', 'operational'],
    ['./services/emailWorker.js', 'operational'],
    ['./services/emailCaseImportService.js', 'operational'],
    ['./routes/inbox.js', 'operational'],
  ])('%s sends as %s', (file, kind) => {
    const sites = grepBackend('mailer.createTransport(').filter((l) => l.startsWith(`${file}:`));
    expect(sites.length).toBeGreaterThan(0);
    sites.forEach((line) => expect(line).toContain(`'${kind}'`));
  });
});
