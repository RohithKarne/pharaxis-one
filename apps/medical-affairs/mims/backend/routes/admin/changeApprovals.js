'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// POST /api/admin/change-approvals — submit a change for approval
router.post('/change-approvals', authenticate, requireOrg, async (req, res) => {
  try {
    const { entity, entity_id, field_name, current_value, proposed_value, reason } = req.body;
    if (!entity || !field_name || proposed_value === undefined) {
      return res.status(400).json({ error: 'entity, field_name and proposed_value are required.' });
    }
    const [result] = await pool.execute(
      `INSERT INTO change_approval_requests (org_id, requester_id, entity, entity_id, field_name, current_value, proposed_value, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.orgId, req.user.userId, entity, entity_id || null, field_name, current_value || null, proposed_value, reason || null]
    );
    res.status(201).json({ id: result.insertId, status: 'pending' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/change-approvals — list requests (admin/superadmin sees all for org)
router.get('/change-approvals', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const [rows] = await pool.execute(
      `SELECT car.*, u.name AS requester_name, u.email AS requester_email
       FROM change_approval_requests car
       JOIN users u ON u.id = car.requester_id
       WHERE car.org_id = ? AND car.status = ?
       ORDER BY car.created_at DESC`,
      [req.user.orgId, status]
    );
    res.json({ requests: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/change-approvals/my-requests — list own requests
router.get('/change-approvals/my-requests', authenticate, requireOrg, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM change_approval_requests WHERE requester_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ requests: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/change-approvals/:id/approve
router.put('/change-approvals/:id/approve', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    await pool.execute(
      `UPDATE change_approval_requests SET status = 'approved', approver_id = ?, resolved_at = NOW() WHERE id = ? AND org_id = ?`,
      [req.user.userId, req.params.id, req.user.orgId]
    );
    await audit(req.user.userId, req.user.email, 'APPROVE', 'change_approval_request', req.params.id, {});
    res.json({ message: 'Request approved.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/change-approvals/:id/reject
router.put('/change-approvals/:id/reject', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { rejection_note } = req.body;
    await pool.execute(
      `UPDATE change_approval_requests SET status = 'rejected', approver_id = ?, rejection_note = ?, resolved_at = NOW() WHERE id = ? AND org_id = ?`,
      [req.user.userId, rejection_note || null, req.params.id, req.user.orgId]
    );
    await audit(req.user.userId, req.user.email, 'REJECT', 'change_approval_request', req.params.id, { rejection_note });
    res.json({ message: 'Request rejected.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
