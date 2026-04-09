'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const {
  sendCaseToMir,
  testMirConnection,
  getMirSyncLog,
} = require('../../services/mirService');

router.post('/admin/integrations/mir/test-connection', authenticate, async (req, res) => {
  try {
    const result = await testMirConnection(req.user.orgId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/admin/integrations/mir/send-case/:caseId', authenticate, async (req, res) => {
  try {
    const result = await sendCaseToMir(req.user.orgId, req.params.caseId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/admin/integrations/mir/sync-log', authenticate, async (req, res) => {
  try {
    const logs = await getMirSyncLog(req.user.orgId);
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
