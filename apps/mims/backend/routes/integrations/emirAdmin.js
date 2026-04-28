'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

router.get('/superadmin/emir-config', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT e.*, o.name as org_name FROM org_emir_config e JOIN organisations o ON e.org_id = o.id ORDER BY o.name'
    );
    res.json({ configs: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/superadmin/emir-config', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { org_id, inbound_email, sender_whitelist, ack_template, enabled } = req.body;
    const senderWhitelistValue = Array.isArray(sender_whitelist)
      ? JSON.stringify(sender_whitelist)
      : sender_whitelist;

    const [result] = await pool.query(
      'INSERT INTO org_emir_config (org_id, inbound_email, sender_whitelist, ack_template, enabled) VALUES (?, ?, ?, ?, ?)',
      [org_id, inbound_email, senderWhitelistValue, ack_template, enabled]
    );

    res.json({ id: result.insertId, message: 'EMIR config created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/superadmin/emir-config/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { inbound_email, sender_whitelist, ack_template, enabled } = req.body;
    const senderWhitelistValue = Array.isArray(sender_whitelist)
      ? JSON.stringify(sender_whitelist)
      : sender_whitelist;

    await pool.query(
      'UPDATE org_emir_config SET inbound_email=?, sender_whitelist=?, ack_template=?, enabled=? WHERE id=?',
      [inbound_email, senderWhitelistValue, ack_template, enabled, req.params.id]
    );

    res.json({ message: 'Updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/superadmin/emir-config/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM org_emir_config WHERE id=?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
