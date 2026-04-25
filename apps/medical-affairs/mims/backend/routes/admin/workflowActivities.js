'use strict';

/**
 * admin/workflowActivities.js — Workflow Activity Triggers API (F-12)
 * Manages named case activities and their if-activity-then-action trigger rules.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

function scopedOrgId(req, explicitOrgId = null) {
  return isSuperadmin(req) ? (explicitOrgId || null) : req.user.orgId;
}

async function getScopedActivity(req, activityId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT * FROM workflow_activities WHERE id = ?'
      : 'SELECT * FROM workflow_activities WHERE id = ? AND org_id = ?',
    isSuperadmin(req) ? [activityId] : [activityId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedTrigger(req, triggerId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? `SELECT t.*, a.org_id
         FROM workflow_activity_triggers t
         JOIN workflow_activities a ON a.id = t.activity_id
         WHERE t.id = ?`
      : `SELECT t.*, a.org_id
         FROM workflow_activity_triggers t
         JOIN workflow_activities a ON a.id = t.activity_id
         WHERE t.id = ? AND a.org_id = ?`,
    isSuperadmin(req) ? [triggerId] : [triggerId, req.user.orgId]
  );
  return rows[0] || null;
}

async function isTargetStateInScope(req, targetStateId) {
  if (!targetStateId) return true;
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT id FROM workflow_states WHERE id = ?'
      : 'SELECT id FROM workflow_states WHERE id = ? AND (org_id = ? OR org_id IS NULL)',
    isSuperadmin(req) ? [targetStateId] : [targetStateId, req.user.orgId]
  );
  return !!rows[0];
}

// ─── WORKFLOW ACTIVITIES ──────────────────────────────────────────────────────

// GET /api/admin/workflow-activities — list all activities
router.get('/workflow-activities', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [activities] = await pool.execute(
      `SELECT * FROM workflow_activities
       ${isSuperadmin(req) ? '' : 'WHERE org_id = ?'}
       ORDER BY id`,
      isSuperadmin(req) ? [] : [req.user.orgId]
    );
    res.json({ activities });
  } catch (err) {
    console.error('GET /workflow-activities error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/workflow-activities — create activity
router.post('/workflow-activities', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { name, description, org_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });

    const orgId = scopedOrgId(req, org_id);
    const [result] = await pool.execute(
      'INSERT INTO workflow_activities (name, description, org_id) VALUES (?, ?, ?)',
      [name.trim(), description || null, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'workflow_activity', result.insertId, { name });
    const [[created]] = await pool.execute('SELECT * FROM workflow_activities WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Activity created.', activity: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Activity name already exists.' });
    console.error('POST /workflow-activities error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/workflow-activities/:id — update activity
router.put('/workflow-activities/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScopedActivity(req, id);
    if (!existing) return res.status(404).json({ error: 'Activity not found.' });

    const { name, description, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });

    await pool.execute(
      'UPDATE workflow_activities SET name = ?, description = ?, is_active = ? WHERE id = ?',
      [name.trim(), description || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'workflow_activity', Number(id), { name });
    res.json({ message: 'Activity updated.' });
  } catch (err) {
    console.error('PUT /workflow-activities/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── WORKFLOW ACTIVITY TRIGGERS ───────────────────────────────────────────────

// GET /api/admin/workflow-activity-triggers — list all triggers (with activity + state names)
router.get('/workflow-activity-triggers', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [triggers] = await pool.execute(`
      SELECT t.*, a.name AS activity_name, ws.name AS target_state_name
      FROM workflow_activity_triggers t
      LEFT JOIN workflow_activities a ON t.activity_id = a.id
      LEFT JOIN workflow_states ws ON t.target_state_id = ws.id
      ${isSuperadmin(req) ? '' : 'WHERE a.org_id = ?'}
      ORDER BY a.name, t.trigger_type
    `, isSuperadmin(req) ? [] : [req.user.orgId]);
    res.json({ triggers });
  } catch (err) {
    console.error('GET /workflow-activity-triggers error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/workflow-activity-triggers — create trigger
router.post('/workflow-activity-triggers', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { activity_id, trigger_type, target_state_id, alert_rule, assign_to } = req.body;
    if (!activity_id || !trigger_type) {
      return res.status(400).json({ error: 'activity_id and trigger_type are required.' });
    }
    const activity = await getScopedActivity(req, activity_id);
    if (!activity) return res.status(404).json({ error: 'Activity not found for active organisation.' });
    if (!await isTargetStateInScope(req, target_state_id)) {
      return res.status(404).json({ error: 'Target workflow state not found for active organisation.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO workflow_activity_triggers (activity_id, trigger_type, target_state_id, alert_rule, assign_to)
       VALUES (?, ?, ?, ?, ?)`,
      [activity_id, trigger_type, target_state_id || null, alert_rule || null, assign_to || null]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'workflow_activity_trigger', result.insertId, { activity_id, trigger_type });
    const [[created]] = await pool.execute(`
      SELECT t.*, a.name AS activity_name, ws.name AS target_state_name
      FROM workflow_activity_triggers t
      LEFT JOIN workflow_activities a ON t.activity_id = a.id
      LEFT JOIN workflow_states ws ON t.target_state_id = ws.id
      WHERE t.id = ?
      ${isSuperadmin(req) ? '' : 'AND a.org_id = ?'}
    `, isSuperadmin(req) ? [result.insertId] : [result.insertId, req.user.orgId]);
    res.status(201).json({ message: 'Trigger created.', trigger: created });
  } catch (err) {
    console.error('POST /workflow-activity-triggers error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/workflow-activity-triggers/:id — update trigger
router.put('/workflow-activity-triggers/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScopedTrigger(req, id);
    if (!existing) return res.status(404).json({ error: 'Trigger not found.' });

    const { activity_id, trigger_type, target_state_id, alert_rule, assign_to, is_active } = req.body;
    if (!activity_id || !trigger_type) {
      return res.status(400).json({ error: 'activity_id and trigger_type are required.' });
    }
    const activity = await getScopedActivity(req, activity_id);
    if (!activity) return res.status(404).json({ error: 'Activity not found for active organisation.' });
    if (!await isTargetStateInScope(req, target_state_id)) {
      return res.status(404).json({ error: 'Target workflow state not found for active organisation.' });
    }

    await pool.execute(
      `UPDATE workflow_activity_triggers SET activity_id = ?, trigger_type = ?, target_state_id = ?,
         alert_rule = ?, assign_to = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
      [activity_id, trigger_type, target_state_id || null, alert_rule || null, assign_to || null,
       is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'workflow_activity_trigger', Number(id), { activity_id, trigger_type });
    res.json({ message: 'Trigger updated.' });
  } catch (err) {
    console.error('PUT /workflow-activity-triggers/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/workflow-activity-triggers/:id — delete trigger
router.delete('/workflow-activity-triggers/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getScopedTrigger(req, id);
    if (!existing) return res.status(404).json({ error: 'Trigger not found.' });

    await pool.execute('DELETE FROM workflow_activity_triggers WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'workflow_activity_trigger', Number(id), {});
    res.json({ message: 'Trigger deleted.' });
  } catch (err) {
    console.error('DELETE /workflow-activity-triggers/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
