'use strict';

const pool = require('../database/db');

async function parseEmirEmail(orgId, emailData) {
  const [rows] = await pool.query(
    'SELECT id, sender_whitelist, enabled FROM org_emir_config WHERE org_id = ? AND enabled = 1 LIMIT 1',
    [orgId]
  );

  if (!rows || rows.length === 0) {
    throw new Error('EMIR not configured for org ' + orgId);
  }

  const config = rows[0];
  let whitelist = config.sender_whitelist;

  if (typeof whitelist === 'string') {
    whitelist = JSON.parse(whitelist);
  }

  if (Array.isArray(whitelist) && whitelist.length > 0) {
    if (!whitelist.includes(emailData.from)) {
      throw new Error('Sender not whitelisted: ' + emailData.from);
    }
  }

  const referenceNumber = 'EMIR-' + orgId + '-' + Date.now();

  const [result] = await pool.query(
    "INSERT INTO emir_requests (org_id, reference_number, from_email, subject, body_raw, status, received_at) VALUES (?, ?, ?, ?, ?, 'received', NOW())",
    [orgId, referenceNumber, emailData.from, emailData.subject, emailData.body]
  );

  const emirRequestId = result.insertId;

  if (emailData.attachments && emailData.attachments.length > 0) {
    for (const att of emailData.attachments) {
      await pool.query(
        'INSERT INTO emir_attachments (emir_request_id, filename, mimetype, size_bytes) VALUES (?, ?, ?, ?)',
        [emirRequestId, att.filename, att.mimetype, att.buffer ? att.buffer.length : 0]
      );
    }
  }

  return {
    emirRequestId,
    referenceNumber,
    attachmentCount: emailData.attachments ? emailData.attachments.length : 0,
  };
}

async function getEmirRequest(emirRequestId) {
  const [rows] = await pool.query(
    'SELECT r.*, a.filename, a.mimetype, a.size_bytes FROM emir_requests r LEFT JOIN emir_attachments a ON a.emir_request_id = r.id WHERE r.id = ?',
    [emirRequestId]
  );

  return { request: rows[0] || null };
}

module.exports = { parseEmirEmail, getEmirRequest };
