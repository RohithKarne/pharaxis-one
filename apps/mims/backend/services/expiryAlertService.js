'use strict';

const pool = require('../database/db');
const nodemailer = require('nodemailer');

async function getSmtpConfig() {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    return rows.reduce((acc, r) => { acc[r.config_key] = r.config_value; return acc; }, {});
  } catch (_) { return {}; }
}

async function getAdminEmails(orgId) {
  try {
    const [rows] = await pool.execute(
      "SELECT DISTINCT u.email FROM users u JOIN user_org_access uoa ON uoa.user_id = u.id WHERE uoa.org_id = ? AND u.role IN ('admin', 'superadmin') AND u.is_active = 1",
      [orgId]
    );
    return rows.map(r => r.email).filter(Boolean);
  } catch (_) { return []; }
}

async function sendExpiryEmail(recipients, subject, body) {
  if (!recipients.length) return;
  const config = await getSmtpConfig();
  if (!config.smtp_host || !config.smtp_username || !config.smtp_password) return;
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: parseInt(config.smtp_port || '587', 10),
      secure: (config.smtp_encryption || '') === 'SSL/TLS',
      auth: { user: config.smtp_username, pass: config.smtp_password },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: `"MIMS Platform" <${config.smtp_from_email || config.smtp_username}>`,
      to: recipients.join(', '),
      subject,
      text: body,
    });
  } catch (err) {
    console.error('[expiryAlertService] Email send failed:', err.message);
  }
}

async function runExpiryAlerts() {
  try {
    const DAYS_AHEAD = 7;

    const [docs] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.expiry_date, fo.org_id
       FROM cm_documents d
       JOIN cm_folders fo ON fo.id = d.folder_id
       WHERE d.expiry_date IS NOT NULL
         AND d.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND d.status NOT IN ('Archived', 'Draft')`,
      [DAYS_AHEAD]
    );

    const [faqs] = await pool.execute(
      `SELECT f.id, f.question, f.expiry_date, fo.org_id
       FROM cm_faqs f
       JOIN cm_folders fo ON fo.id = f.folder_id
       WHERE f.expiry_date IS NOT NULL
         AND f.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND f.status NOT IN ('Archived', 'Draft')`,
      [DAYS_AHEAD]
    );

    const byOrg = {};
    for (const doc of docs) {
      if (!byOrg[doc.org_id]) byOrg[doc.org_id] = { docs: [], faqs: [] };
      byOrg[doc.org_id].docs.push(doc);
    }
    for (const faq of faqs) {
      if (!byOrg[faq.org_id]) byOrg[faq.org_id] = { docs: [], faqs: [] };
      byOrg[faq.org_id].faqs.push(faq);
    }

    for (const [orgId, items] of Object.entries(byOrg)) {
      const total = items.docs.length + items.faqs.length;
      if (total === 0) continue;

      try {
        await pool.execute(
          `INSERT INTO notifications (org_id, type, title, message, created_at)
           VALUES (?, 'expiry_alert', ?, ?, NOW())`,
          [
            orgId,
            `Content Expiry Alert — ${total} item(s) expiring within ${DAYS_AHEAD} days`,
            JSON.stringify({ docs: items.docs.map(d => ({ id: d.id, name: d.name, expiry_date: d.expiry_date })), faqs: items.faqs.map(f => ({ id: f.id, question: f.question, expiry_date: f.expiry_date })) }),
          ]
        );
      } catch (_) { /* notifications table may not have org_id — silently skip */ }

      const recipients = await getAdminEmails(parseInt(orgId, 10));
      const docLines = items.docs.map(d => `  - [DOC] ${d.name} (${d.doc_id}) — expires ${d.expiry_date}`).join('\n');
      const faqLines = items.faqs.map(f => `  - [FAQ] ${f.question.slice(0, 80)} — expires ${f.expiry_date}`).join('\n');
      const body = `MIMS Content Expiry Alert\n\nThe following content items are expiring within ${DAYS_AHEAD} days:\n\n${docLines}\n${faqLines}\n\nPlease review and renew or archive these items in your Admin Console > Content Management.\n\nThis is an automated alert from MIMS Platform.`;

      await sendExpiryEmail(
        recipients,
        `[MIMS] Content Expiry Alert — ${total} item(s) expiring soon`,
        body
      );

      console.log(`[expiryAlertService] Org ${orgId}: alerted ${total} expiring items, emailed ${recipients.length} admins`);
    }
  } catch (err) {
    console.error('[expiryAlertService] runExpiryAlerts failed:', err.message);
  }
}

module.exports = { runExpiryAlerts };
