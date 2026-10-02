'use strict';
/**
 * utils/mailer.js — the single gate every outbound MIMS email passes through.
 *
 * Set by Rohith 2026-09-05: MIMS is not to send him warning or alert mail.
 * Narrowed the same day — login codes and case replies stay on, alerts only go off.
 *
 * Each caller declares what kind of mail it is:
 *
 *   'alert'        warnings, expiry notices, SLA escalations, platform alerts.
 *                  OFF unless MIMS_ALERT_EMAIL is set to on/true/1.
 *   'operational'  mail a person is waiting for — login and password-reset codes,
 *                  replies to a contact on a case, acknowledgements, and the
 *                  manual "send test email" buttons. Always sends.
 *
 * A caller that declares nothing is treated as an alert and blocked. New senders
 * therefore stay quiet until someone decides which they are, rather than silently
 * reaching Rohith's inbox.
 *
 * A blocked send THROWS rather than resolving quietly. Callers already catch a
 * send failure and write it to the audit trail; resolving silently would record
 * "Sent" for mail that never left the machine, which is a false record in a
 * regulated system. Same reason verify() throws: a Test SMTP button that reports
 * success without testing anything is worse than one that fails.
 */
const nodemailer = require('nodemailer');
const { smtpWithRequiredTls } = require('./mailSecurity');

const OFF_MESSAGE =
  'Alert email is disabled (MIMS_ALERT_EMAIL is not on). No mail was sent.';

function alertEmailEnabled() {
  const raw = String(process.env.MIMS_ALERT_EMAIL || '').trim().toLowerCase();
  return raw === 'on' || raw === 'true' || raw === '1';
}

function blockedTransport() {
  return {
    async sendMail(message) {
      console.warn(
        '[MIMS Mail] ALERT BLOCKED — to=%s subject=%s',
        message?.to || '(none)',
        message?.subject || '(none)'
      );
      throw new Error(OFF_MESSAGE);
    },
    async verify() {
      throw new Error(OFF_MESSAGE);
    },
    close() {},
  };
}

function createTransport(kind, options) {
  const isOperational = kind === 'operational';
  // MIPM-63: every sender comes through here, so this is where "never in the clear" is held.
  if (isOperational || alertEmailEnabled()) return nodemailer.createTransport(smtpWithRequiredTls(options));
  return blockedTransport();
}

module.exports = { createTransport, alertEmailEnabled, OFF_MESSAGE };
