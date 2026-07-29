'use strict';

/**
 * AE/PC handoff endpoints — the Transmission screen's backend.
 *
 * The handoff lives on its own screen, after the case is saved (locked with
 * Rohith 2026-07-28). These routes serve that screen: what the payload will
 * look like, whether the case is allowed to leave, where it can go, and what
 * has already been sent.
 */

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const handoff = require('../services/caseHandoffService');

// Same org gate as caseValidity: a case id alone must never be enough to read
// or transmit another tenant's case.
async function orgForCase(caseId, req) {
  const [[row]] = await pool.execute(
    'SELECT org_id, case_type FROM cases WHERE id = ? AND is_deleted = 0 LIMIT 1',
    [caseId]
  );
  if (!row) return null;
  if (!hasGlobalAdminScope(req.user) && Number(row.org_id) !== Number(req.user.orgId)) return null;
  return row;
}

router.get('/cases/:caseId/handoff', authenticate, async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const caseId = Number(req.params.caseId);
    const orgId = owner.org_id;

    const [built, readiness, targets, history] = await Promise.all([
      handoff.buildPayload({ orgId, caseId }),
      handoff.assessReadiness({ orgId, caseId, caseType: owner.case_type }),
      handoff.listTargets({ orgId }),
      handoff.listTransmissions({ caseId }),
    ]);

    if (!built) return res.status(404).json({ error: 'Case not found.' });

    res.json({
      case_type: owner.case_type,
      eligible: ['AE', 'PC'].includes(owner.case_type),
      payload_version: handoff.PAYLOAD_VERSION,
      readiness,
      payload: built.payload,
      targets: targets.map(t => ({ id: t.id, type: t.integration_type, endpoint: t.endpoint_url })),
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cases/:caseId/handoff/transmit', authenticate, async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const result = await handoff.transmit({
      orgId: owner.org_id,
      caseId: Number(req.params.caseId),
      userId: req.user.userId || req.user.id || null,
      userName: req.user.name || req.user.email || 'System',
      targetSystem: req.body?.target_system,
    });

    return res.status(result.status).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
