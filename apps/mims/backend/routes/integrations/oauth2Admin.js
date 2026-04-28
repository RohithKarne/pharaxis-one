'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { getToken, revokeToken } = require('../../services/oauth2Service');

const router = express.Router();

router.post('/integrations/oauth2/token', authenticate, async (req, res) => {
  try {
    const { integrationType } = req.body;
    await getToken(req.user.orgId, integrationType);
    return res.json({ success: true, message: 'Token retrieved successfully' });
  } catch (err) {
    const status = (err.message || '').includes('No integration config') ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

router.delete('/integrations/oauth2/token', authenticate, async (req, res) => {
  try {
    const { integrationType } = req.body;
    await revokeToken(req.user.orgId, integrationType);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
