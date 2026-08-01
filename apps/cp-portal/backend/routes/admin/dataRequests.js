/**
 * Admin Data Requests — /api/admin/data-requests  (CP-63)
 * Queue of GDPR data-subject requests (export history + erasure requests) with
 * admin fulfillment. Erasure runs the retention-aware anonymization engine.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const { eraseUser } = require('../../services/dataSubject');

// GET /api/admin/data-requests/:clientId — the queue (pending first, newest first)
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, portal_user_id, request_type, status, requester_email, requester_name, notes,
              requested_at, fulfilled_at, fulfilled_by
         FROM cp_data_requests
        WHERE client_id = ?
        ORDER BY (status = 'pending') DESC, requested_at DESC
        LIMIT 200`,
      [req.params.clientId]
    );
    res.json({ requests: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/data-requests/:clientId/:requestId/fulfill — run the erasure
// (retention-aware) for a pending erasure request and mark it fulfilled.
router.post('/:clientId/:requestId/fulfill', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId, requestId } = req.params;
    const [[reqRow]] = await pool.execute(
      `SELECT * FROM cp_data_requests WHERE id = ? AND client_id = ?`, [requestId, clientId]);
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: `Request is already ${reqRow.status}.` });
    if (reqRow.request_type !== 'erasure') return res.status(400).json({ error: 'Only erasure requests are fulfilled here.' });
    if (!reqRow.portal_user_id) return res.status(400).json({ error: 'Request has no linked user.' });

    const summary = await eraseUser(reqRow.portal_user_id, Number(clientId));
    const notes = `Deleted: ${summary.deleted.join(', ') || 'none'} | Retained: ${summary.retained.join(', ') || 'none'} | Anonymized: ${summary.anonymized.join(', ')}`;

    await pool.execute(
      `UPDATE cp_data_requests SET status = 'fulfilled', fulfilled_at = NOW(), fulfilled_by = ?, notes = ? WHERE id = ?`,
      [req.admin?.name || req.admin?.email || 'admin', notes, requestId]);
    await audit(req.admin, clientId, 'ERASURE_FULFILLED', 'portal_user', reqRow.portal_user_id, summary);

    res.json({ status: 'fulfilled', summary });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/data-requests/:clientId/:requestId/reject — decline (e.g. cannot verify identity)
router.post('/:clientId/:requestId/reject', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId, requestId } = req.params;
    const [[reqRow]] = await pool.execute(
      `SELECT status, portal_user_id FROM cp_data_requests WHERE id = ? AND client_id = ?`, [requestId, clientId]);
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: `Request is already ${reqRow.status}.` });

    await pool.execute(
      `UPDATE cp_data_requests SET status = 'rejected', fulfilled_at = NOW(), fulfilled_by = ?, notes = ? WHERE id = ?`,
      [req.admin?.name || req.admin?.email || 'admin', String(req.body?.reason || 'Rejected by admin').slice(0, 500), requestId]);
    await audit(req.admin, clientId, 'ERASURE_REJECTED', 'portal_user', reqRow.portal_user_id, { reason: req.body?.reason || null });

    res.json({ status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
