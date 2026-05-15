'use strict';

const pool = require('../../database/db');
const { compare } = require('./ruleEvaluator');
const { executeAction } = require('./actionExecutors');

function traceGraph(graph = {}, entityData = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const byId = new Map(nodes.map(n => [String(n.id), n]));
  let node = nodes.find(n => n.type === 'start') || nodes[0];
  const trace = [];
  const visited = new Set();
  while (node && !visited.has(String(node.id)) && trace.length < 100) {
    visited.add(String(node.id));
    trace.push({ node_id: node.id, node_type: node.type, action: 'entered', label: node.data?.label || node.label || node.type });
    if (node.type === 'end') break;
    const outgoing = edges.filter(e => String(e.source) === String(node.id));
    let chosen = outgoing[0];
    for (const edge of outgoing) {
      const condition = edge.data?.condition || edge.condition;
      const passed = condition ? compare(condition, entityData) : true;
      trace.push({ node_id: node.id, action: 'condition_evaluated', edge_id: edge.id, passed, condition });
      if (passed) { chosen = edge; break; }
    }
    node = chosen ? byId.get(String(chosen.target)) : null;
  }
  return trace;
}

async function progress(instanceId, event = {}) {
  const [[instance]] = await pool.execute('SELECT * FROM workflow_instances WHERE id = ? LIMIT 1', [instanceId]);
  if (!instance) throw new Error('Workflow instance not found');
  const [[definition]] = await pool.execute('SELECT * FROM workflow_definitions WHERE id = ? LIMIT 1', [instance.definition_id]);
  const graph = JSON.parse(definition.graph_json || '{}');
  const context = typeof instance.context_json === 'string' ? JSON.parse(instance.context_json || '{}') : (instance.context_json || {});
  const trace = traceGraph(graph, { ...context, ...event.entity_data });
  for (const item of trace) {
    await pool.execute(
      `INSERT INTO workflow_executions (instance_id, node_id, action, details) VALUES (?, ?, ?, ?)`,
      [instanceId, item.node_id || null, item.action || 'entered', JSON.stringify(item)]
    );
    if (item.action === 'entered') await executeAction(item, { instance, event });
  }
  const last = trace[trace.length - 1];
  await pool.execute('UPDATE workflow_instances SET current_node_id = ?, status = ? WHERE id = ?', [last?.node_id || instance.current_node_id, last?.node_type === 'end' ? 'completed' : 'running', instanceId]);
  return trace;
}

module.exports = { traceGraph, progress };
