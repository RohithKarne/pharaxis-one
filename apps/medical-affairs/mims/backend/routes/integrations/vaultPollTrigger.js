'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../../middleware/auth');
const { pollVaultForOrg } = require('../../services/vaultPoller');

router.get('/superadmin/vault/poll-now/:org_id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const result = await pollVaultForOrg(parseInt(req.params.org_id, 10));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
