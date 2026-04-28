'use strict';
/**
 * cmExpiryAlertService.js — CM Document Expiry Alert Runner
 * Runs daily — checks cm_documents with expiry_date set.
 * Sends email alerts to document subscribers + org defaults when expiry threshold is hit.
 */
const pool = require('../database/db');
const nodemailer = require('nodemailer');

async function runCmExpiryAlerts() {
  try {
    // Get all active published/approved documents and FAQs with expiry dates
    const [docs] = await pool.execute(`
      SELECT d.id, d.doc_id, d.name, d.expiry_date, d.alert_days, d.alert_email_account_id,
             d.owner_user_id, NULL AS org_id,
             f.org_id AS folder_org_id, 'document' AS content_type
      FROM cm_documents d
      JOIN cm_folders f ON f.id = d.folder_id
      WHERE d.status IN ('Published', 'Approved')
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date > NOW()
      UNION ALL
      SELECT fq.id, NULL AS doc_id, fq.question AS name, fq.expiry_date,
             NULL AS alert_days, NULL AS alert_email_account_id,
             fq.created_by AS owner_user_id, NULL AS org_id,
             fo.org_id AS folder_org_id, 'faq' AS content_type
      FROM cm_faqs fq
      JOIN cm_folders fo ON fo.id = fq.folder_id
      WHERE fq.status IN ('Published', 'Approved')
        AND fq.expiry_date IS NOT NULL
        AND fq.expiry_date > NOW()
    `);

    for (const doc of docs) {
      const orgId = doc.org_id || doc.folder_org_id;
      const expiryDate = new Date(doc.expiry_date);
      const today = new Date();
      const daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

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

      // Get SMTP account — per-doc first, then org default
      let emailAccountId = doc.alert_email_account_id;
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
      if (!emailAccountId) continue;

      const [[emailAccount]] = await pool.execute(
        'SELECT * FROM email_accounts WHERE id = ? AND is_active = 1',
        [emailAccountId]
      );
      if (!emailAccount) continue;

      // Send alerts
      const transporter = nodemailer.createTransport({
        host: emailAccount.smtp_host,
        port: emailAccount.smtp_port || 587,
        secure: emailAccount.smtp_port === 465,
        auth: { user: emailAccount.username, pass: emailAccount.password },
      });

      const uniqueSubs = [...new Map(subs.map(s => [s.email, s])).values()];
      for (const sub of uniqueSubs) {
        try {
          await transporter.sendMail({
            from: `"MIMS Alerts" <${emailAccount.email_address || emailAccount.username}>`,
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
async function runCmPreExpiryReminders() {
  const intervals = [90, 60, 30];
  let totalSent = 0;
  try {
    for (const days of intervals) {
      const [docs] = await pool.execute(
        `SELECT d.id, d.doc_id, d.name, d.expiry_date, d.expiry_alert_recipients,
                COALESCE(d.owner_user_id, d.created_by) AS owner_id
         FROM cm_documents d
         WHERE d.status = 'Published'
           AND d.expiry_date IS NOT NULL
           AND DATEDIFF(d.expiry_date, CURDATE()) = ?`,
        [days]
      );
      for (const doc of docs) {
        // Notify document owner via in-app notification
        if (doc.owner_id) {
          await pool.execute(
            `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
             VALUES (?, 'cm_expiry', ?, ?, '/content', ?)`,
            [
              doc.owner_id,
              `Document Expiring in ${days} Days`,
              `"${doc.name}" is set to expire on ${doc.expiry_date}. Please review and renew.`,
              JSON.stringify({ doc_id: doc.id, doc_code: doc.doc_id, days_remaining: days }),
            ]
          ).catch(() => {});
        }
        // Queue custom email recipients from expiry_alert_recipients JSON column
        if (doc.expiry_alert_recipients) {
          let recipients = [];
          try {
            recipients = typeof doc.expiry_alert_recipients === 'string'
              ? JSON.parse(doc.expiry_alert_recipients)
              : doc.expiry_alert_recipients;
          } catch (_) {}
          for (const email of (Array.isArray(recipients) ? recipients : [])) {
            await pool.execute(
              `INSERT INTO service_logs (source, service_type, description, details, status)
               VALUES ('cmExpiryAlert', 'expiry_reminder', ?, ?, 'queued')`,
              [
                `Expiry reminder for doc ${doc.doc_id} to ${email} (${days}d)`,
                JSON.stringify({ doc_id: doc.id, email, days, expiry_date: doc.expiry_date }),
              ]
            ).catch(() => {});
          }
        }
        totalSent++;
      }
    }
  } catch (err) {
    console.error('[CM Pre-Expiry Reminder] Error:', err.message);
  }
  return { totalSent };
}

module.exports = { runCmExpiryAlerts, runCmPreExpiryReminders };
