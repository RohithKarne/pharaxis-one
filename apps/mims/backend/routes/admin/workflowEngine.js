'use strict';

const express = require('express');
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { validateDefinition } = require('../../services/workflow/definitionValidator');
const { traceGraph } = require('../../services/workflow/executionEngine');
const { fireWorkflowEvent } = require('../../services/workflow/eventHookService');

const router = express.Router();
const guard = [authenticate, requireRole('admin', 'superadmin')];

function scope(req, alias = 'wd') {
  return req.user.role === 'superadmin' ? { sql: '1=1', params: [] } : { sql: `${alias}.org_id = ?`, params: [req.user.orgId] };
}

async function audit(req, action, entity, entityId, details) {
  await pool.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.userId, req.user.email, action, entity, entityId || null, JSON.stringify(details || {})]
  ).catch(() => {});
}

router.get('/workflow-definitions', ...guard, async (req, res) => {
  try {
    const s = scope(req, 'wd');
    const [rows] = await pool.execute(`SELECT * FROM workflow_definitions wd WHERE ${s.sql} ORDER BY updated_at DESC`, s.params);
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/workflow-definitions', ...guard, async (req, res) => {
  try {
    const graph = req.body.graph_json || { nodes: [], edges: [] };
    const validation = validateDefinition(graph);
    if (!validation.valid) return res.status(422).json(validation);
    const orgId = req.body.org_id || req.user.orgId;
    const [result] = await pool.execute(
      `INSERT INTO workflow_definitions (org_id, name, scope, graph_json, version, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, 1, 'draft', ?, ?)`,
      [orgId, req.body.name || 'Untitled Workflow', req.body.scope || 'case', JSON.stringify(graph), req.user.userId, req.user.userId]
    );
    await audit(req, 'CREATE', 'workflow_definition', result.insertId, { name: req.body.name });
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/workflow-definitions/:id', ...guard, async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT * FROM workflow_definitions WHERE id=? LIMIT 1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Workflow definition not found.' });
    if (existing.status === 'published') return res.status(409).json({ error: 'Published definitions are immutable. Create a new version instead.' });
    const graph = req.body.graph_json || JSON.parse(existing.graph_json || '{}');
    const validation = validateDefinition(graph);
    if (!validation.valid) return res.status(422).json(validation);
    await pool.execute(
      'UPDATE workflow_definitions SET name=?, scope=?, graph_json=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [req.body.name || existing.name, req.body.scope || existing.scope, JSON.stringify(graph), req.user.userId, req.params.id]
    );
    await audit(req, 'UPDATE', 'workflow_definition', req.params.id, {});
    res.json({ id: Number(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/workflow-definitions/:id', ...guard, async (req, res) => {
  try {
    await pool.execute('UPDATE workflow_definitions SET status="archived", updated_by=? WHERE id=?', [req.user.userId, req.params.id]);
    await audit(req, 'ARCHIVE', 'workflow_definition', req.params.id, {});
    res.json({ archived: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/workflow-definitions/:id/publish', ...guard, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM workflow_definitions WHERE id=? LIMIT 1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Workflow definition not found.' });
    const validation = validateDefinition(JSON.parse(row.graph_json || '{}'));
    if (!validation.valid) return res.status(422).json(validation);
    await pool.execute('UPDATE workflow_definitions SET status="published", published_at=CURRENT_TIMESTAMP, published_by=?, updated_by=? WHERE id=?', [req.user.userId, req.user.userId, req.params.id]);
    await audit(req, 'PUBLISH', 'workflow_definition', req.params.id, {});
    res.json({ status: 'published' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/workflow-definitions/:id/hooks', ...guard, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM workflow_definitions WHERE id=? LIMIT 1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Workflow definition not found.' });
    const [result] = await pool.execute(
      `INSERT INTO workflow_event_hooks (definition_id, org_id, event_name, entity_type, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, row.org_id, req.body.event_name || 'case.created', req.body.entity_type || 'case', req.body.is_active === false ? 0 : 1]
    );
    await audit(req, 'CREATE', 'workflow_event_hook', result.insertId, { definition_id: Number(req.params.id), event_name: req.body.event_name });
    res.status(201).json({ id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/workflow-definitions/:id/simulate', ...guard, async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM workflow_definitions WHERE id=? LIMIT 1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Workflow definition not found.' });
    const trace = traceGraph(JSON.parse(row.graph_json || '{}'), req.body.entity_data || {});
    await audit(req, 'SIMULATE', 'workflow_definition', req.params.id, { trace_length: trace.length });
    res.json({ trace });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/workflow-instances', ...guard, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM workflow_instances ORDER BY started_at DESC LIMIT 200');
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/workflow-instances/:id/timeline', ...guard, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM workflow_executions WHERE instance_id=? ORDER BY created_at ASC', [req.params.id]);
    res.json({ timeline: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/workflow-events/fire', ...guard, async (req, res) => {
  try {
    const instances = await fireWorkflowEvent({
      orgId: req.body.org_id || req.user.orgId,
      eventName: req.body.event_name,
      entityType: req.body.entity_type || 'case',
      entityId: req.body.entity_id,
      entityData: req.body.entity_data || {},
    });
    await audit(req, 'FIRE', 'workflow_event', req.body.entity_id || null, { event_name: req.body.event_name, instances: instances.length });
    res.json({ instances });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
