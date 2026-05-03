'use strict';

const express = require('express');

const { authenticate } = require('../middleware/auth');
const {
  deactivateMobilePushDevice,
  listMobilePushDevicesForUser,
  upsertMobilePushDevice,
} = require('../services/mobilePushService');

const router = express.Router();

router.post('/push/register', authenticate, async (req, res) => {
  try {
    const device = await upsertMobilePushDevice(req.user.userId, req.user.orgId, {
      pushToken: req.body?.pushToken,
      platform: req.body?.platform,
      deviceLabel: req.body?.deviceLabel,
      appBuild: req.body?.appBuild,
      provider: req.body?.provider || 'expo',
    });
    return res.status(201).json({ success: true, device });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not register push device.' });
  }
});

router.post('/push/unregister', authenticate, async (req, res) => {
  try {
    const affected = await deactivateMobilePushDevice(req.user.userId, req.body?.pushToken);
    return res.json({ success: true, affected });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Could not unregister push device.' });
  }
});

router.get('/push/devices', authenticate, async (req, res) => {
  try {
    const devices = await listMobilePushDevicesForUser(req.user.userId);
    return res.json({ devices });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Could not load push devices.' });
  }
});

module.exports = router;
