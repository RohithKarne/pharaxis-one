/**
 * Portal Saved Items — /api/portal/saved
 * S4-1: Authenticated bookmark/save functionality for portal users
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');

// GET /api/portal/saved?clientCode=xxx
router.get('/', authenticatePortal, requirePortalAuth, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const items = db.prepare(`
    SELECT id, item_type, item_id, created_at FROM cp_saved_items
    WHERE portal_user_id = ? AND client_id = ?
    ORDER BY created_at DESC
  `).all(req.portalUser.id, client.id);

  // Enrich with item details
  const enriched = items.map(item => {
    if (item.item_type === 'news') {
      const post = db.prepare('SELECT id, title, category, publish_at FROM cp_news_posts WHERE id = ?').get(item.item_id);
      return { ...item, detail: post || null };
    }
    if (item.item_type === 'document') {
      const doc = db.prepare('SELECT id, title, category, doc_type FROM cp_documents WHERE id = ?').get(item.item_id);
      return { ...item, detail: doc || null };
    }
    return { ...item, detail: null };
  });

  // Filter out items whose referenced content no longer exists
  res.json({ saved: enriched.filter(item => item.detail !== null) });
});

// POST /api/portal/saved — save an item
router.post('/', authenticatePortal, requirePortalAuth, (req, res) => {
  const { clientCode, item_type, item_id } = req.body;
  if (!clientCode || !item_type || !item_id) return res.status(400).json({ error: 'clientCode, item_type and item_id required.' });
  if (!['news', 'document'].includes(item_type)) return res.status(400).json({ error: 'item_type must be news or document.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  try {
    db.prepare(`INSERT INTO cp_saved_items (portal_user_id, client_id, item_type, item_id) VALUES (?, ?, ?, ?)`
    ).run(req.portalUser.id, client.id, item_type, item_id);
    res.json({ saved: true });
  } catch {
    res.status(409).json({ error: 'Already saved.' });
  }
});

// DELETE /api/portal/saved — unsave by item_type + item_id
router.delete('/', authenticatePortal, requirePortalAuth, (req, res) => {
  const { clientCode, item_type, item_id } = req.body;
  if (!clientCode || !item_type || !item_id) return res.status(400).json({ error: 'clientCode, item_type and item_id required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  db.prepare('DELETE FROM cp_saved_items WHERE portal_user_id = ? AND client_id = ? AND item_type = ? AND item_id = ?'
  ).run(req.portalUser.id, client.id, item_type, item_id);
  res.json({ saved: false });
});

module.exports = router;
