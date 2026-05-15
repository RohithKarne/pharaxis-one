'use strict';

function validateDefinition(graph = {}) {
  const errors = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  if (!nodes.some(n => n.type === 'start')) errors.push({ path: 'nodes', message: 'Workflow requires a start node.' });
  if (!nodes.some(n => n.type === 'end')) errors.push({ path: 'nodes', message: 'Workflow requires an end node.' });
  const ids = new Set(nodes.map(n => String(n.id)));
  for (const edge of edges) {
    if (!ids.has(String(edge.source))) errors.push({ path: `edges.${edge.id || ''}`, message: `Missing source node ${edge.source}` });
    if (!ids.has(String(edge.target))) errors.push({ path: `edges.${edge.id || ''}`, message: `Missing target node ${edge.target}` });
  }
  if (hasCycle(nodes, edges)) errors.push({ path: 'edges', message: 'Workflow contains a cycle. Infinite loops are not allowed.' });
  return { valid: errors.length === 0, errors };
}

function hasCycle(nodes, edges) {
  const graph = new Map(nodes.map(n => [String(n.id), []]));
  for (const e of edges) graph.get(String(e.source))?.push(String(e.target));
  const visiting = new Set();
  const visited = new Set();
  function dfs(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) if (dfs(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return nodes.some(n => dfs(String(n.id)));
}

module.exports = { validateDefinition, hasCycle };
