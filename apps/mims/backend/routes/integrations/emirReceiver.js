'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { parseEmirEmail } = require('../../services/emirParser');

router.post('/admin/emir/receive', authenticate, async (req, res) => {
  try {
    const orgId = req.body.org_id || req.user.orgId;
    const emailData = {
      from: req.body.from_email,
      subject: req.body.subject,
      body: req.body.body,
      attachments: req.body.attachments || [],
    };

    const parsed = await parseEmirEmail(orgId, emailData);

    await pool.query(
      "INSERT INTO emir_audit_log (emir_request_id, event_type, event_data, created_at) VALUES (?, 'received', ?, NOW())",
      [
        parsed.emirRequestId,
        JSON.stringify({ from: emailData.from, subject: emailData.subject }),
      ]
    );

    const [configRows] = await pool.query(
      'SELECT ack_template FROM org_emir_config WHERE org_id = ? LIMIT 1',
      [orgId]
    );
    const ackTemplate = configRows[0] ? configRows[0].ack_template : null;
    const ackMessage = ackTemplate || ('Your MI request ' + parsed.referenceNumber + ' has been received and is being processed.');

    await pool.query(
      "UPDATE emir_requests SET ack_sent_at = NOW(), status = 'acknowledged' WHERE id = ?",
      [parsed.emirRequestId]
    );

    await pool.query(
      "INSERT INTO emir_audit_log (emir_request_id, event_type, event_data, created_at) VALUES (?, 'ack_sent', ?, NOW())",
      [parsed.emirRequestId, JSON.stringify({ ack_message: ackMessage })]
    );

    const [siteRows] = await pool.query('SELECT id FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1', [orgId]);
    const siteId = siteRows[0]?.id || 1;

    const [caseResult] = await pool.query(
      "INSERT INTO cases (org_id, site_id, case_type, status_id, priority, created_by, is_deleted, created_at) VALUES (?, ?, 'MI', 1, 'normal', ?, 0, NOW())",
      [orgId, siteId, req.user.userId]
    );
    const caseId = caseResult.insertId;

    await pool.query(
      "UPDATE emir_requests SET case_id = ?, status = 'case_created' WHERE id = ?",
      [caseId, parsed.emirRequestId]
    );

    await pool.query(
      "INSERT INTO emir_audit_log (emir_request_id, event_type, event_data, created_at) VALUES (?, 'case_created', ?, NOW())",
      [parsed.emirRequestId, JSON.stringify({ case_id: caseId })]
    );

    return res.json({
      message: 'EMIR request processed',
      reference_number: parsed.referenceNumber,
      case_id: caseId,
      ack_message: ackMessage,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get(['/admin/platform/emir/requests', '/admin/platform/emir/requests'], authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    let query = 'SELECT r.*, o.name as org_name FROM emir_requests r JOIN organisations o ON r.org_id = o.id';
    const params = [];

    if (req.query.org_id) {
      query += ' WHERE r.org_id = ?';
      params.push(req.query.org_id);
    }

    query += ' ORDER BY r.received_at DESC LIMIT 100';
    const [rows] = await pool.query(query, params);

    return res.json({ requests: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get(['/admin/platform/emir/requests/:id/audit', '/admin/platform/emir/requests/:id/audit'], authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM emir_audit_log WHERE emir_request_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );
    return res.json({ audit: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
