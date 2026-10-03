/**
 * Admin Area Tags — /api/admin/area-tags (CPPM-122)
 *
 * Tags a news post, document or event with one of the client's therapeutic areas,
 * or clears the tag. Kept out of the news and document save routes on purpose: those
 * carry approval and re-approval rules, and an area tag changes who sees an item in
 * "For you", not what the item says.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit, changesBetween } = require('../../utils/audit');
const log = require('../../utils/logger');

const KINDS = { news: 'cp_news_posts', document: 'cp_documents', event: 'cp_events' };

// PUT /api/admin/area-tags/:clientId/:kind/:id  { therapeutic_area_id: number | null }
router.put('/:clientId/:kind/:id', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const table = KINDS[req.params.kind];
    if (!table) return res.status(400).json({ error: 'Unknown kind of content.' });
    const raw = req.body?.therapeutic_area_id;
    const areaId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (areaId !== null) {
      const [[ta]] = await pool.execute('SELECT id FROM cp_therapeutic_areas WHERE id = ? AND client_id = ?', [areaId, req.params.clientId]);
      if (!ta) return res.status(400).json({ error: 'That therapeutic area does not belong to this portal.' });
    }
    const [[before]] = await pool.execute(`SELECT therapeutic_area_id FROM ${table} WHERE id = ? AND client_id = ?`, [req.params.id, req.params.clientId]);
    if (!before) return res.status(404).json({ error: 'Not found.' });
    await pool.execute(`UPDATE ${table} SET therapeutic_area_id = ? WHERE id = ? AND client_id = ?`, [areaId, req.params.id, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'UPDATE', req.params.kind, Number(req.params.id),
      { changes: changesBetween(before, { therapeutic_area_id: areaId }, ['therapeutic_area_id']) });
    res.json({ ok: true, therapeutic_area_id: areaId });
  } catch (err) {
    log.error('admin.areaTags.error', { err, route: 'PUT /:clientId/:kind/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
