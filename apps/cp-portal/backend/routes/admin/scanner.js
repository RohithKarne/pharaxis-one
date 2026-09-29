'use strict';

/**
 * Admin Scanner status — /api/admin/scanner
 * CPPM-44: tells the admin screens whether the virus scanner is running and how old
 * its virus list is, so a stopped scanner is noticed on screen instead of from a pile
 * of held attachments.
 */

const express = require('express');
const router  = express.Router();
const { authenticateAdmin } = require('../../middleware/auth');
const { scannerStatus } = require('../../utils/virusScan');

// GET /api/admin/scanner
router.get('/', authenticateAdmin, async (_req, res) => {
  res.json(await scannerStatus());
});

module.exports = router;
