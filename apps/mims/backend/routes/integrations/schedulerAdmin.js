'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { getJobStatus } = require('../../services/scheduler');

const router = express.Router();

router.get('/scheduler/jobs', authenticate, (_req, res) => {
  try {
    return res.json({ jobs: getJobStatus() });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch scheduler jobs' });
  }
});

module.exports = router;

