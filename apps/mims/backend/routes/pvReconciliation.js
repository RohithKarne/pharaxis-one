'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { runReconciliation, getReconciliationHistory } = require('../services/safetyReconciliationService');

router.get('/pv/reconciliation', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const current = await runReconciliation({ orgId, userId: req.user.userId });
    const history = await getReconciliationHistory({ orgId });
    res.json({ current, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pv/reconciliation/run', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const result = await runReconciliation({ orgId, userId: req.user.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
