'use strict';
/**
 * cmExpiryAlertService.js — CM Document Expiry Alert Runner
 * Runs daily — checks cm_documents with expiry_date set.
 * Sends email alerts to document subscribers + org defaults when expiry threshold is hit.
 */
const pool = require('../database/db');
const mailer = require('../utils/mailer');
const { decryptMailboxSecret } = require('./mailboxCrypto');

// The mailbox an expiry email goes out from: the document's own, else the org default.
async function alertMailbox(docEmailAccountId, orgId) {
  let emailAccountId = docEmailAccountId;
  if (!emailAccountId && orgId) {
    const [[orgEmailSetting]] = await pool.execute(
      `SELECT setting_value FROM cm_org_settings WHERE org_id = ? AND setting_key = 'default_alert_email_account_id'`,
      [orgId]
    );
    if (orgEmailSetting?.setting_value) {
      emailAccountId = typeof orgEmailSetting.setting_value === 'string'
        ? JSON.parse(orgEmailSetting.setting_value)
        : orgEmailSetting.setting_value;
    }
  }
  if (!emailAccountId) return null;
  const [[emailAccount]] = await pool.execute(
    'SELECT * FROM email_accounts WHERE id = ? AND is_active = 1',
    [emailAccountId]
  );
  return emailAccount || null;
}

function alertTransport(emailAccount) {
  return mailer.createTransport('alert', {
    host: emailAccount.smtp_host,
    port: emailAccount.smtp_port || 587,
    // MIPM-65: use the mailbox's own Encryption setting, as every other sender
    // does; guessing from the port hung on an SSL/TLS mailbox not on 465.
    secure: emailAccount.smtp_encryption === 'SSL/TLS',
    requireTLS: emailAccount.smtp_encryption === 'STARTTLS',
    // MIPM-65: the mailbox keeps these as smtp_username / smtp_password (encrypted)
    // and from_email. The names read here before do not exist, so no alert could sign in.
    auth: { user: emailAccount.smtp_username, pass: decryptMailboxSecret(emailAccount.smtp_password) },
  });
}

async function runCmExpiryAlerts() {
  try {
    // Get all active published/approved documents and FAQs with expiry dates
    const [docs] = await pool.execute(`
      SELECT d.id, d.doc_id, d.name, d.expiry_date, d.alert_days, d.alert_email_account_id,
             d.owner_user_id, NULL AS org_id,
             f.org_id AS folder_org_id, 'document' AS content_type,
             DATEDIFF(d.expiry_date, CURDATE()) AS days_left
      FROM cm_documents d
      JOIN cm_folders f ON f.id = d.folder_id
      WHERE d.status IN ('Published', 'Approved')
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date > NOW()
      UNION ALL
      SELECT fq.id, NULL AS doc_id, fq.question AS name, fq.expiry_date,
             NULL AS alert_days, NULL AS alert_email_account_id,
             fq.created_by AS owner_user_id, NULL AS org_id,
             fo.org_id AS folder_org_id, 'faq' AS content_type,
             DATEDIFF(fq.expiry_date, CURDATE()) AS days_left
      FROM cm_faqs fq
      JOIN cm_folders fo ON fo.id = fq.folder_id
      WHERE fq.status IN ('Published', 'Approved')
        AND fq.expiry_date IS NOT NULL
        AND fq.expiry_date > NOW()
    `);

    for (const doc of docs) {
      const orgId = doc.org_id || doc.folder_org_id;
      const expiryDate = new Date(doc.expiry_date);
      // Date-only day difference computed in SQL (DATEDIFF) — avoids time-of-day
      // drift that made the "N days before" alert miss its intended day.
      const daysLeft = Number(doc.days_left);

      // Determine which alert days to check: per-doc config OR org default, always include 1
      let alertDays = [1];
      if (doc.alert_days) {
        const parsed = typeof doc.alert_days === 'string' ? JSON.parse(doc.alert_days) : doc.alert_days;
        alertDays = [...new Set([1, ...parsed])];
      } else if (orgId) {
        const [[orgSetting]] = await pool.execute(
          `SELECT setting_value FROM cm_org_settings WHERE org_id = ? AND setting_key = 'default_alert_days'`,
          [orgId]
        );
        if (orgSetting?.setting_value) {
          const parsed = typeof orgSetting.setting_value === 'string' ? JSON.parse(orgSetting.setting_value) : orgSetting.setting_value;
          alertDays = [...new Set([1, ...(Array.isArray(parsed) ? parsed : [])])];
        }
      }

      if (!alertDays.includes(daysLeft)) continue;

      // Get subscribers for this document
      const [subs] = await pool.execute(
        `SELECT u.email, u.name FROM cm_document_alert_subs s
         JOIN users u ON u.id = s.user_id WHERE s.document_id = ?`,
        [doc.id]
      );

      // Also get org-level default subscriber roles
      if (orgId) {
        const [[orgSubsSetting]] = await pool.execute(
          `SELECT setting_value FROM cm_org_settings WHERE org_id = ? AND setting_key = 'default_alert_roles'`,
          [orgId]
        );
        if (orgSubsSetting?.setting_value) {
          const roles = typeof orgSubsSetting.setting_value === 'string'
            ? JSON.parse(orgSubsSetting.setting_value)
            : orgSubsSetting.setting_value;
          if (Array.isArray(roles) && roles.length > 0) {
            const [roleUsers] = await pool.execute(
              `SELECT DISTINCT u.email, u.name FROM users u
               JOIN user_org_access uoa ON uoa.user_id = u.id
               WHERE uoa.org_id = ? AND u.role IN (${roles.map(() => '?').join(',')}) AND u.is_active = 1`,
              [orgId, ...roles]
            );
            subs.push(...roleUsers);
          }
        }
      }

      if (subs.length === 0) continue;

      const emailAccount = await alertMailbox(doc.alert_email_account_id, orgId);
      if (!emailAccount) continue;

      // Send alerts
      const transporter = alertTransport(emailAccount);

      const uniqueSubs = [...new Map(subs.map(s => [s.email, s])).values()];
      for (const sub of uniqueSubs) {
        try {
          await transporter.sendMail({
            from: `"MIMS Alerts" <${emailAccount.from_email || emailAccount.smtp_username}>`,
            to: sub.email,
            subject: `⚠️ ${doc.content_type === 'faq' ? 'FAQ' : 'Document'} Expiry Alert — ${doc.name} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            html: `
              <p>Hello ${sub.name || sub.email},</p>
              <p>This is an automated alert from MIMS Content Management.</p>
              <p><strong>${doc.name}</strong>${doc.doc_id ? ` (${doc.doc_id})` : ''} is set to expire in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> on <strong>${expiryDate.toDateString()}</strong>.</p>
              <p>Please review and take appropriate action before the expiry date.</p>
              <br/>
              <p style="color:#888;font-size:12px;">This is an automated message from MIMS. Do not reply.</p>
            `,
          });
        } catch (emailErr) {
          console.error(`[CM Expiry Alert] Failed to send to ${sub.email}:`, emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[CM Expiry Alert] Error:', err.message);
    throw err;
  }
}

// ── CM-E5: Pre-expiry reminders (30/60/90 days) ──────────────────────────────
// MIPM-65: run daily by the scheduler (cm-pre-expiry-reminders). The owner gets an
// in-app notice; the document's expiry_alert_recipients get an email from the
// document's alert mailbox. Before, nothing called this, and the "emails" were
// service-log rows marked queued that nothing ever sent. A failure is now logged
// and fails the job, instead of being swallowed.
async function runCmPreExpiryReminders() {
  const intervals = [90, 60, 30];
  let totalSent = 0;
  const failures = [];
  const logFailure = async (doc, what, err) => {
    failures.push(`${doc.doc_id || doc.id}: ${what}`);
    console.error(`[CM Pre-Expiry Reminder] ${doc.doc_id || doc.id}: ${what}`, err?.message || '');
    await pool.execute(
      `INSERT INTO service_logs (source, service_type, description, details, status)
       VALUES ('cmExpiryAlert', 'expiry_reminder', ?, ?, 'failed')`,
      [`Expiry reminder for doc ${doc.doc_id || doc.id} failed: ${what}`, JSON.stringify({ doc_id: doc.id, error: err?.message || null })]
    ).catch(() => {});
  };
  for (const days of intervals) {
    const [docs] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.expiry_date, d.expiry_alert_recipients, d.alert_email_account_id,
              COALESCE(d.owner_user_id, d.created_by) AS owner_id, f.org_id AS folder_org_id
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       WHERE d.status = 'Published'
         AND d.expiry_date IS NOT NULL
         AND DATEDIFF(d.expiry_date, CURDATE()) = ?`,
      [days]
    );
    for (const doc of docs) {
      const expires = new Date(doc.expiry_date).toDateString();
      if (doc.owner_id) {
        try {
          await pool.execute(
            `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
             VALUES (?, 'cm_expiry', ?, ?, '/content', ?)`,
            [
              doc.owner_id,
              `Document Expiring in ${days} Days`,
              `"${doc.name}" is set to expire on ${expires}. Please review and renew.`,
              JSON.stringify({ doc_id: doc.id, doc_code: doc.doc_id, days_remaining: days }),
            ]
          );
        } catch (err) { await logFailure(doc, 'in-app notice not saved', err); }
      }
      let recipients = [];
      try {
        const raw = doc.expiry_alert_recipients;
        recipients = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
      } catch (err) { await logFailure(doc, 'recipient list unreadable', err); }
      recipients = (Array.isArray(recipients) ? recipients : []).filter(Boolean);
      if (recipients.length) {
        const emailAccount = await alertMailbox(doc.alert_email_account_id, doc.folder_org_id);
        if (!emailAccount) {
          await logFailure(doc, 'no active alert mailbox for this document or its organisation');
        } else {
          const transporter = alertTransport(emailAccount);
          for (const email of recipients) {
            try {
              await transporter.sendMail({
                from: `"MIMS Alerts" <${emailAccount.from_email || emailAccount.smtp_username}>`,
                to: email,
                subject: `Reminder — ${doc.name} expires in ${days} days`,
                html: `
                  <p>This is an automated reminder from MIMS Content Management.</p>
                  <p><strong>${doc.name}</strong>${doc.doc_id ? ` (${doc.doc_id})` : ''} expires in <strong>${days} days</strong>, on <strong>${expires}</strong>.</p>
                  <p>Please review and renew it before then.</p>
                  <br/>
                  <p style="color:#888;font-size:12px;">This is an automated message from MIMS. Do not reply.</p>
                `,
              });
            } catch (err) { await logFailure(doc, `email to ${email} not sent`, err); }
          }
        }
      }
      totalSent++;
    }
  }
  if (failures.length) throw new Error(`Pre-expiry reminders: ${failures.length} failed — ${failures.join('; ')}`);
  return { totalSent };
}

module.exports = { runCmExpiryAlerts, runCmPreExpiryReminders };
