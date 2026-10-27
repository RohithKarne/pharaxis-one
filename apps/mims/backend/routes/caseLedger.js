'use strict';
/**
 * GET /api/cases/ledger — MIPM-223, the Inquiry Ledger: every open case from every
 * channel, its stage, age and light (services/inquiryLedger.js).
 *
 * Mounted before routes/cases.js so "ledger" is not read as a case id. The case
 * access check in front of every case path (middleware/caseAccess.js) has already
 * required the Cases module and View cases; a reader whose View cases is "own" sees
 * only the cases they own or created, as on the case list.
 */
const express = require('express');
const router = express.Router();
const { authenticate, requireOrg, requireScopedCapability } = require('../middleware/auth');
const { ledger } = require('../services/inquiryLedger');
const { logger } = require('../services/logger');

router.get('/cases/ledger', authenticate, requireOrg, requireScopedCapability('case.view'), async (req, res) => {
  try {
    const own = req.activityScope?.['case.view'] === 'own';
    res.json(await ledger({
      orgId: req.user.orgId, ownUserId: own ? req.user.userId : null,
      channel: req.query.channel || null, stage: req.query.stage || null, light: req.query.light || null, page: req.query.page,
    }));
  } catch (err) {
    logger.error({ err, route: 'GET /api/cases/ledger', user_id: req.user?.userId }, 'Inquiry Ledger failed');
    res.status(500).json({ error: 'Could not load the Inquiry Ledger.' });
  }
});

module.exports = router;
