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
    // Get all active published/approved documents with expiry dates and alert config
    const [docs] = await pool.execute(`
      SELECT d.id, d.doc_id, d.name, d.expiry_date, d.alert_days, d.alert_email_account_id,
             d.owner_user_id, d.org_id,
             f.org_id AS folder_org_id
      FROM cm_documents d
      JOIN cm_folders f ON f.id = d.folder_id
      WHERE d.status IN ('Published', 'Approved')
        AND d.expiry_date IS NOT NULL
        AND d.expiry_date > NOW()
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
            subject: `⚠️ Document Expiry Alert — ${doc.name} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            html: `
              <p>Hello ${sub.name || sub.email},</p>
              <p>This is an automated alert from MIMS Content Management.</p>
              <p><strong>${doc.name}</strong> (${doc.doc_id}) is set to expire in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong> on <strong>${expiryDate.toDateString()}</strong>.</p>
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

module.exports = { runCmExpiryAlerts };
