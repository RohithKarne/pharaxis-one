'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { syncCaseToCrm, testCrmConnection, getCrmSyncLog } = require('../../services/crmService');

router.post('/admin/integrations/crm/test-connection', authenticate, async (req, res) => {
  try {
    const result = await testCrmConnection(req.user.orgId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/admin/integrations/crm/sync-case/:caseId', authenticate, async (req, res) => {
  try {
    const result = await syncCaseToCrm(req.user.orgId, req.params.caseId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/admin/integrations/crm/sync-log', authenticate, async (req, res) => {
  try {
    const logs = await getCrmSyncLog(req.user.orgId);
    return res.json({ logs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
