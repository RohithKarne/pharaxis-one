'use strict';

/**
 * richFields.js — Theme 1 surface (Wave 3).
 *
 * Endpoints (mounted at /api):
 *   GET    /rich-fields/types                          — supported value_type list
 *   GET    /rich-fields?entity_type=&entity_id=        — all rich values for an entity
 *   GET    /rich-fields/:entity_type/:entity_id/:section/:field
 *   PUT    /rich-fields/:entity_type/:entity_id/:section/:field
 *          body { value_type, value }
 *   DELETE /rich-fields/:entity_type/:entity_id/:section/:field
 *
 * Gated by cf.theme1_rich_fields. Off → 403 on writes; GETs return empty.
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const flags = require('../../services/featureFlagsService');
const rich  = require('../../services/richFieldsService');

const FLAG = 'cf.theme1_rich_fields';

router.get('/rich-fields/types', authenticate, (_req, res) => {
  res.json({ types: rich.TYPES });
});

router.get('/rich-fields', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id required' });
    }
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, values: [] });
    const values = await rich.list({
      orgId: req.user.orgId, entityType: entity_type, entityId: Number(entity_id),
    });
    res.json({ enabled: true, values });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/rich-fields/:entity_type/:entity_id/:section/:field', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, value: null });
    const v = await rich.get({
      orgId: req.user.orgId,
      entityType: req.params.entity_type,
      entityId:   Number(req.params.entity_id),
      section:    req.params.section,
      field:      req.params.field,
    });
    res.json({ enabled: true, value: v });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/rich-fields/:entity_type/:entity_id/:section/:field', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.status(403).json({ error: 'Rich field types not enabled for this tenant.' });
    const { value_type, value } = req.body || {};
    if (!value_type) return res.status(400).json({ error: 'value_type required' });
    const cleaned = await rich.set({
      orgId: req.user.orgId,
      entityType: req.params.entity_type,
      entityId:   Number(req.params.entity_id),
      section:    req.params.section,
      field:      req.params.field,
      valueType:  value_type,
      value,
      userId:     req.user.userId,
    });
    res.json({ ok: true, value: cleaned });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/rich-fields/:entity_type/:entity_id/:section/:field', authenticate, async (req, res) => {
  try {
    await rich.remove({
      orgId: req.user.orgId,
      entityType: req.params.entity_type,
      entityId:   Number(req.params.entity_id),
      section:    req.params.section,
      field:      req.params.field,
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
