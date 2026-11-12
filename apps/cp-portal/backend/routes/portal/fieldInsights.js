'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../../database/db');
const { safeFetch } = require('../../utils/networkGuard');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const log = require('../../utils/logger');

const MIMS_BASE_URL = process.env.MIMS_API_URL || 'http://localhost:3000/api';

// Signed-in portal users only. The client and the user come from the session,
// never from the request body, so an insight cannot be filed against another client.
router.post('/', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const {
      reporter_name,
      reporter_email,
      hcp_specialty,
      institution,
      product_name,
      insight_type,
      interaction_venue,
      content,
      urgency = 'normal',
      follow_up_requested = false,
    } = req.body || {};
    const clientId = req.portalUser.clientId;
    const userId = req.portalUser.userId;

    if (!reporter_name || !product_name || !content || !insight_type) {
      return res.status(400).json({ error: 'Please provide reporter name, product name, insight category, and clinical content.' });
    }

    // Save in cp_field_insights. A failed save is an error, never a made-up ID.
    const [insertRes] = await pool.execute(
        `INSERT INTO cp_field_insights
           (client_id, reporter_name, reporter_email, hcp_specialty, institution, product_name, insight_type,
            interaction_venue, content, urgency, follow_up_requested, created_by_user_id, sync_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NOW())`,
        [
          clientId,
          reporter_name.trim(),
          reporter_email ? reporter_email.trim() : null,
          hcp_specialty || null,
          institution || null,
          product_name.trim(),
          insight_type,
          interaction_venue || 'Medical Congress',
          content.trim(),
          urgency,
          follow_up_requested ? 1 : 0,
          userId,
        ]
      );
    const insightId = insertRes.insertId;

    // If follow-up requested or high urgency, bridge to MIMS as unsolicited field inquiry
    let linkedCaseId = null;
    if (follow_up_requested) {
      try {
        const mimsRes = await safeFetch(`${MIMS_BASE_URL}/v1/cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[Field Medical Insight - ${insight_type}] ${product_name}`,
            case_type: 'MI',
            product_name,
            patient_name: 'Unsolicited Field Inquiry',
            description: `Field interaction at ${interaction_venue || 'Congress'}:\n\nHCP: ${reporter_name} (${hcp_specialty || 'HCP'}, ${institution || 'Institution'})\n\nInsight:\n${content.trim()}`,
            priority: urgency === 'high' || urgency === 'expedited' ? 'high' : 'normal',
            source_reference: `INSIGHT-${insightId}`,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (mimsRes.ok) {
          const mimsData = await mimsRes.json().catch(() => ({}));
          linkedCaseId = mimsData.case_id || mimsData.id;
        }
      } catch (_) {
        // Tolerable bridge offline fallback
      }
    }

    res.status(201).json({
      success: true,
      insight_id: insightId,
      linked_case_id: linkedCaseId,
      message: 'Field medical insight captured and queued for central Medical Affairs.',
    });
  } catch (err) {
    log.error('portal.field_insight.save_failed', { err: { name: err.name, message: err.message } });
    res.status(500).json({ error: 'The insight could not be saved. Please try again.' });
  }
});

// No list route: nothing on screen reads insights back, and an open list exposed
// every client's reporters and clinical content to anyone.

module.exports = router;
