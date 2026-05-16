'use strict';

/**
 * fieldHistory.js — read endpoint for field-level audit history.
 *
 * Wave 0 piece #2 surface. Theme 2's field-history popover and Theme 9's
 * audit drill-down both call this. Writes happen inline from case edit
 * handlers via services/fieldHistoryService.record(...).
 *
 * GET /api/field-history?entity_type=&entity_id=&field=&limit=
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const fieldHistory = require('../../services/fieldHistoryService');

router.get('/field-history', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, field, limit } = req.query || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id required' });
    }
    const rows = await fieldHistory.list({
      entityType: entity_type,
      entityId:   entity_id,
      field:      field || null,
      limit:      limit ? Number(limit) : 100,
    });
    res.json({ history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
