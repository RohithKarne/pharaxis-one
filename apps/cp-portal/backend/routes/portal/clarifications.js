'use strict';

const express = require('express');
const router = express.Router();
const { safeFetch } = require('../../utils/networkGuard');

const MIMS_BASE_URL = process.env.MIMS_API_URL || 'http://localhost:3000/api';

router.get('/:token', async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 16) return res.status(400).json({ error: 'Invalid or missing token.' });

  try {
    const mimsUrl = `${MIMS_BASE_URL}/bridge/clarifications/${encodeURIComponent(token)}`;
    const r = await safeFetch(mimsUrl, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(5000) });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (_) {
    // The question lives in MIMS; CP Portal holds no copy, so there is nothing to fall back to.
    return res.status(503).json({ error: 'Medical Affairs bridge is currently unreachable. Please try again later.' });
  }
});

router.post('/:token/reply', async (req, res) => {
  const { token } = req.params;
  const { answer, reporter_name } = req.body || {};
  if (!answer || answer.trim().length < 5) {
    return res.status(400).json({ error: 'Please enter your clinical response (minimum 5 characters).' });
  }

  try {
    const mimsUrl = `${MIMS_BASE_URL}/bridge/clarifications/${encodeURIComponent(token)}/reply`;
    const r = await safeFetch(mimsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: answer.trim(), reporter_name }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json().catch(() => ({}));
    return res.status(r.status).json(data);
  } catch (_) {
    // The answer must be written in MIMS; CP Portal cannot record it on MIMS's behalf.
    return res.status(503).json({ error: 'Could not record your clarification. Please try again.' });
  }
});

module.exports = router;
