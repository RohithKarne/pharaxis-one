'use strict';

const pool = require('../../database/db');
const { progress } = require('./executionEngine');

async function fireWorkflowEvent({ orgId, eventName, entityType = 'case', entityId, entityData = {} }) {
  const [hooks] = await pool.execute(
    `SELECT h.*, d.graph_json
       FROM workflow_event_hooks h JOIN workflow_definitions d ON d.id = h.definition_id
      WHERE h.org_id = ? AND h.event_name = ? AND h.entity_type = ? AND h.is_active = 1 AND d.status = 'published'`,
    [orgId, eventName, entityType]
  );
  const instances = [];
  for (const hook of hooks) {
    const [result] = await pool.execute(
      `INSERT INTO workflow_instances (definition_id, entity_type, entity_id, current_node_id, status, context_json)
       VALUES (?, ?, ?, 'start', 'running', ?)`,
      [hook.definition_id, entityType, entityId, JSON.stringify(entityData || {})]
    );
    const trace = await progress(result.insertId, { event_name: eventName, entity_data: entityData });
    instances.push({ instance_id: result.insertId, definition_id: hook.definition_id, trace });
  }
  return instances;
}

module.exports = { fireWorkflowEvent };
