/**
 * Portal Feedback — /api/portal/feedback
 * S5-1: Floating feedback widget submissions
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticatePortal } = require('../../middleware/auth');

// POST /api/portal/feedback/:clientCode
router.post('/:clientCode', authenticatePortal, (req, res) => {
  const { clientCode } = req.params;
  const { rating, message, page_url } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'rating must be between 1 and 5.' });
  }
  if (message && message.length > 1000) {
    return res.status(400).json({ error: 'Message must be 1000 characters or less.' });
  }

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  db.prepare(`
    INSERT INTO cp_feedback (client_id, user_id, rating, message, page_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(client.id, req.portalUser?.userId || null, Number(rating), message?.trim() || null, page_url || null);

  res.status(201).json({ ok: true, message: 'Thank you for your feedback!' });
});

module.exports = router;
