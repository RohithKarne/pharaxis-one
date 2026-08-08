/**
 * Portal Feedback — /api/portal/feedback
 * S5-1: Floating feedback widget submissions
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');
const log = require('../../utils/logger');

// POST /api/portal/feedback/:clientCode
router.post('/:clientCode', authenticatePortal, async (req, res) => {
  try {
    const { clientCode } = req.params;
    const { rating, message, page_url } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5.' });
    }
    if (message && message.length > 1000) {
      return res.status(400).json({ error: 'Message must be 1000 characters or less.' });
    }

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    await pool.execute(`
      INSERT INTO cp_feedback (client_id, user_id, rating, message, page_url)
      VALUES (?, ?, ?, ?, ?)
    `, [client.id, req.portalUser?.userId || null, Number(rating), message?.trim() || null, page_url || null]);

    res.status(201).json({ ok: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    log.error('portal.feedback.error', { err, route: 'POST /:clientCode', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
