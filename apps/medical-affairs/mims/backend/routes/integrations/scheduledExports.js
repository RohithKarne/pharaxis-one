'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const {
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  deleteExportConfig,
} = require('../../services/scheduledExportService');

const router = express.Router();

router.get('/admin/exports/scheduled', authenticate, async (req, res) => {
  try {
    const configs = await getExportConfigs(req.user.orgId);
    return res.json({ configs });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch scheduled exports' });
  }
});

router.post('/admin/exports/scheduled', authenticate, async (req, res) => {
  try {
    const id = await createExportConfig(req.user.orgId, req.user.userId, req.body);
    return res.json({ id, message: 'Created' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to create scheduled export' });
  }
});

router.put('/admin/exports/scheduled/:id', authenticate, async (req, res) => {
  try {
    await updateExportConfig(req.params.id, req.user.orgId, req.body);
    return res.json({ message: 'Updated' });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to update scheduled export' });
  }
});

router.delete('/admin/exports/scheduled/:id', authenticate, async (req, res) => {
  try {
    await deleteExportConfig(req.params.id, req.user.orgId);
    return res.json({ message: 'Deleted' });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Failed to delete scheduled export' });
  }
});

module.exports = router;
