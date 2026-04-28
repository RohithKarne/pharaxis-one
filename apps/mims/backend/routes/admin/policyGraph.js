'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

function isSuperadmin(req) {
  return req.user?.role === 'superadmin';
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function resolveScopedOrgId(req, providedOrgId) {
  if (!isSuperadmin(req)) {
    return parsePositiveInt(req.user?.orgId);
  }
  return parsePositiveInt(providedOrgId);
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function getByPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((acc, part) => (acc === null || acc === undefined ? undefined : acc[part]), obj);
}

function valuesEqual(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  if (typeof expected === 'number') return Number(actual) === expected;
  if (typeof expected === 'boolean') return Boolean(actual) === expected;
  if (typeof expected === 'string') return String(actual) === expected;
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function matchRule(rule, payload) {
  if (!rule || typeof rule !== 'object') return true;
  for (const [rawKey, expected] of Object.entries(rule)) {
    const actual = getByPath(payload, rawKey);

    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
        const exists = actual !== undefined && actual !== null;
        if (Boolean(expected.$exists) !== exists) return false;
        continue;
      }
      if (Array.isArray(expected.$in)) {
        const allowed = expected.$in.map((item) => String(item));
        if (!allowed.includes(String(actual))) return false;
        continue;
      }
    }

    if (Array.isArray(expected)) {
      if (!expected.map((item) => String(item)).includes(String(actual))) return false;
      continue;
    }

    if (!valuesEqual(actual, expected)) return false;
  }
  return true;
}

async function writeAudit(req, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user?.userId || null,
        req.user?.email || 'system',
        action,
        entity,
        entityId || null,
        JSON.stringify(details || {}),
      ]
    );
  } catch (_) {
    // Audit is best-effort.
  }
}

async function loadScopedNodes(orgId) {
  const [rows] = await pool.execute(
    `SELECT id, node_scope, node_key, match_json, is_active, created_at, updated_at
     FROM policy_nodes
     WHERE org_id = ?
     ORDER BY node_scope, node_key`,
    [orgId]
  );
  return rows.map((row) => ({
    ...row,
    match_json: parseJson(row.match_json, {}),
  }));
}

function normalizeNodeScope(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['actor', 'content', 'context'].includes(normalized) ? normalized : null;
}

function normalizeEffect(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['allow', 'deny'].includes(normalized) ? normalized : null;
}

async function getNodeById(orgId, nodeId) {
  const [rows] = await pool.execute(
    `SELECT id, org_id, node_scope, node_key, match_json, is_active
     FROM policy_nodes
     WHERE org_id = ? AND id = ?
     LIMIT 1`,
    [orgId, nodeId]
  );
  return rows[0] || null;
}

async function validateEdgeNodePair(orgId, fromNodeId, toNodeId) {
  const [rows] = await pool.execute(
    `SELECT id, node_scope
     FROM policy_nodes
     WHERE org_id = ? AND id IN (?, ?)`,
    [orgId, fromNodeId, toNodeId]
  );
  if (rows.length !== 2) {
    return { ok: false, error: 'Both nodes must exist in same org scope.' };
  }

  const fromNode = rows.find((row) => row.id === fromNodeId);
  const toNode = rows.find((row) => row.id === toNodeId);
  if (!fromNode || !toNode) {
    return { ok: false, error: 'Invalid node references.' };
  }
  if (fromNode.node_scope !== 'actor' || toNode.node_scope !== 'content') {
    return { ok: false, error: 'Edge must link actor node to content node for v1 evaluator.' };
  }
  return { ok: true };
}

router.get('/policy/nodes', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const nodeScope = req.query.node_scope ? normalizeNodeScope(req.query.node_scope) : null;
    if (req.query.node_scope && !nodeScope) {
      return res.status(400).json({ error: 'node_scope must be actor, content, or context.' });
    }

    const activeOnly = req.query.active_only !== '0';
    let sql = `
      SELECT id, org_id, node_scope, node_key, match_json, is_active, created_by, updated_by, created_at, updated_at
      FROM policy_nodes
      WHERE org_id = ?
    `;
    const params = [scopedOrgId];
    if (nodeScope) {
      sql += ' AND node_scope = ?';
      params.push(nodeScope);
    }
    if (activeOnly) {
      sql += ' AND is_active = 1';
    }
    sql += ' ORDER BY node_scope, node_key';

    const [rows] = await pool.execute(sql, params);
    const nodes = rows.map((row) => ({ ...row, match_json: parseJson(row.match_json, {}) }));
    res.json({ org_id: scopedOrgId, count: nodes.length, nodes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policy nodes.' });
  }
});

router.post('/policy/nodes', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const nodeScope = normalizeNodeScope(req.body.node_scope);
    if (!nodeScope) return res.status(400).json({ error: 'node_scope must be actor, content, or context.' });

    const nodeKey = String(req.body.node_key || '').trim();
    if (!nodeKey) return res.status(400).json({ error: 'node_key is required.' });

    const matchJson = req.body.match_json && typeof req.body.match_json === 'object'
      ? req.body.match_json
      : {};

    const isActive = req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0);
    const [result] = await pool.execute(
      `INSERT INTO policy_nodes (org_id, node_scope, node_key, match_json, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        scopedOrgId,
        nodeScope,
        nodeKey,
        JSON.stringify(matchJson),
        isActive,
        req.user.userId,
        req.user.userId,
      ]
    );

    await writeAudit(req, 'CREATE', 'policy_node', result.insertId, {
      org_id: scopedOrgId,
      node_scope: nodeScope,
      node_key: nodeKey,
    });

    res.status(201).json({
      id: result.insertId,
      org_id: scopedOrgId,
      node_scope: nodeScope,
      node_key: nodeKey,
      match_json: matchJson,
      is_active: isActive,
    });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Policy node already exists for this org/scope/key.' });
    }
    res.status(500).json({ error: 'Failed to create policy node.' });
  }
});

router.put('/policy/nodes/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id ?? req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const nodeId = parsePositiveInt(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'Valid node id is required.' });

    const existing = await getNodeById(scopedOrgId, nodeId);
    if (!existing) return res.status(404).json({ error: 'Policy node not found.' });

    if (req.body.node_scope && String(req.body.node_scope).trim() !== existing.node_scope) {
      return res.status(400).json({ error: 'node_scope is immutable. Create new node if scope must change.' });
    }

    const nodeKey = req.body.node_key !== undefined
      ? String(req.body.node_key || '').trim()
      : existing.node_key;
    if (!nodeKey) return res.status(400).json({ error: 'node_key cannot be empty.' });

    const matchJson = req.body.match_json && typeof req.body.match_json === 'object'
      ? req.body.match_json
      : parseJson(existing.match_json, {});

    const isActive = req.body.is_active === undefined
      ? (existing.is_active ? 1 : 0)
      : (req.body.is_active ? 1 : 0);

    await pool.execute(
      `UPDATE policy_nodes
       SET node_key = ?, match_json = ?, is_active = ?, updated_by = ?, updated_at = NOW()
       WHERE org_id = ? AND id = ?`,
      [nodeKey, JSON.stringify(matchJson), isActive, req.user.userId, scopedOrgId, nodeId]
    );

    await writeAudit(req, 'UPDATE', 'policy_node', nodeId, {
      org_id: scopedOrgId,
      node_key: nodeKey,
      is_active: isActive,
    });

    res.json({
      id: nodeId,
      org_id: scopedOrgId,
      node_scope: existing.node_scope,
      node_key: nodeKey,
      match_json: matchJson,
      is_active: isActive,
    });
  } catch (err) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Policy node key already exists in this scope.' });
    }
    res.status(500).json({ error: 'Failed to update policy node.' });
  }
});

router.delete('/policy/nodes/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const nodeId = parsePositiveInt(req.params.id);
    if (!nodeId) return res.status(400).json({ error: 'Valid node id is required.' });

    const existing = await getNodeById(scopedOrgId, nodeId);
    if (!existing) return res.status(404).json({ error: 'Policy node not found.' });

    const [[edgeUsage]] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM policy_edges
       WHERE org_id = ? AND (from_node_id = ? OR to_node_id = ?)`,
      [scopedOrgId, nodeId, nodeId]
    );
    if (Number(edgeUsage?.cnt || 0) > 0) {
      return res.status(409).json({ error: 'Node is linked to edges. Remove linked edges first.' });
    }

    await pool.execute(
      `DELETE FROM policy_nodes
       WHERE org_id = ? AND id = ?`,
      [scopedOrgId, nodeId]
    );

    await writeAudit(req, 'DELETE', 'policy_node', nodeId, {
      org_id: scopedOrgId,
      node_scope: existing.node_scope,
      node_key: existing.node_key,
    });

    res.json({ message: 'Policy node deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete policy node.' });
  }
});

router.get('/policy/edges', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const activeOnly = req.query.active_only !== '0';
    let sql = `
      SELECT
        e.id, e.org_id, e.from_node_id, e.to_node_id, e.relation_type, e.effect, e.priority,
        e.condition_json, e.is_active, e.created_by, e.updated_by, e.created_at, e.updated_at,
        fn.node_scope AS from_scope, fn.node_key AS from_key,
        tn.node_scope AS to_scope, tn.node_key AS to_key
      FROM policy_edges e
      LEFT JOIN policy_nodes fn ON fn.id = e.from_node_id
      LEFT JOIN policy_nodes tn ON tn.id = e.to_node_id
      WHERE e.org_id = ?
    `;
    const params = [scopedOrgId];
    if (activeOnly) {
      sql += ' AND e.is_active = 1';
    }
    sql += ' ORDER BY e.priority ASC, e.id ASC';

    const [rows] = await pool.execute(sql, params);
    const edges = rows.map((row) => ({
      ...row,
      condition_json: parseJson(row.condition_json, {}),
    }));
    res.json({ org_id: scopedOrgId, count: edges.length, edges });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policy edges.' });
  }
});

router.post('/policy/edges', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const fromNodeId = parsePositiveInt(req.body.from_node_id);
    const toNodeId = parsePositiveInt(req.body.to_node_id);
    if (!fromNodeId || !toNodeId) {
      return res.status(400).json({ error: 'from_node_id and to_node_id are required integers.' });
    }

    const effect = normalizeEffect(req.body.effect) || 'allow';
    const relationType = String(req.body.relation_type || 'applies_to').trim().slice(0, 60);
    const priority = Number.isFinite(Number(req.body.priority)) ? Number(req.body.priority) : 100;
    const conditionJson = req.body.condition_json && typeof req.body.condition_json === 'object'
      ? req.body.condition_json
      : {};
    const isActive = req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0);

    const pairValidation = await validateEdgeNodePair(scopedOrgId, fromNodeId, toNodeId);
    if (!pairValidation.ok) {
      return res.status(400).json({ error: pairValidation.error });
    }

    const [result] = await pool.execute(
      `INSERT INTO policy_edges
       (org_id, from_node_id, to_node_id, relation_type, effect, priority, condition_json, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopedOrgId,
        fromNodeId,
        toNodeId,
        relationType || 'applies_to',
        effect,
        priority,
        JSON.stringify(conditionJson),
        isActive,
        req.user.userId,
        req.user.userId,
      ]
    );

    await writeAudit(req, 'CREATE', 'policy_edge', result.insertId, {
      org_id: scopedOrgId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      effect,
      priority,
    });

    res.status(201).json({
      id: result.insertId,
      org_id: scopedOrgId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      relation_type: relationType || 'applies_to',
      effect,
      priority,
      condition_json: conditionJson,
      is_active: isActive,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create policy edge.' });
  }
});

router.put('/policy/edges/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id ?? req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const edgeId = parsePositiveInt(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'Valid edge id is required.' });

    const [existingRows] = await pool.execute(
      `SELECT id, from_node_id, to_node_id, relation_type, effect, priority, condition_json, is_active
       FROM policy_edges
       WHERE org_id = ? AND id = ?
       LIMIT 1`,
      [scopedOrgId, edgeId]
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Policy edge not found.' });

    const fromNodeId = req.body.from_node_id !== undefined
      ? parsePositiveInt(req.body.from_node_id)
      : existing.from_node_id;
    const toNodeId = req.body.to_node_id !== undefined
      ? parsePositiveInt(req.body.to_node_id)
      : existing.to_node_id;
    if (!fromNodeId || !toNodeId) {
      return res.status(400).json({ error: 'from_node_id and to_node_id are required integers.' });
    }

    const pairValidation = await validateEdgeNodePair(scopedOrgId, fromNodeId, toNodeId);
    if (!pairValidation.ok) {
      return res.status(400).json({ error: pairValidation.error });
    }

    const relationType = req.body.relation_type !== undefined
      ? String(req.body.relation_type || '').trim().slice(0, 60) || 'applies_to'
      : existing.relation_type;
    const effect = req.body.effect !== undefined
      ? normalizeEffect(req.body.effect)
      : existing.effect;
    if (!effect) return res.status(400).json({ error: 'effect must be allow or deny.' });

    const priority = req.body.priority !== undefined
      ? Number(req.body.priority)
      : existing.priority;
    if (!Number.isFinite(priority)) return res.status(400).json({ error: 'priority must be numeric.' });

    const conditionJson = req.body.condition_json && typeof req.body.condition_json === 'object'
      ? req.body.condition_json
      : parseJson(existing.condition_json, {});

    const isActive = req.body.is_active === undefined
      ? (existing.is_active ? 1 : 0)
      : (req.body.is_active ? 1 : 0);

    await pool.execute(
      `UPDATE policy_edges
       SET from_node_id = ?, to_node_id = ?, relation_type = ?, effect = ?, priority = ?, condition_json = ?,
           is_active = ?, updated_by = ?, updated_at = NOW()
       WHERE org_id = ? AND id = ?`,
      [
        fromNodeId,
        toNodeId,
        relationType,
        effect,
        priority,
        JSON.stringify(conditionJson),
        isActive,
        req.user.userId,
        scopedOrgId,
        edgeId,
      ]
    );

    await writeAudit(req, 'UPDATE', 'policy_edge', edgeId, {
      org_id: scopedOrgId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      effect,
      priority,
      is_active: isActive,
    });

    res.json({
      id: edgeId,
      org_id: scopedOrgId,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      relation_type: relationType,
      effect,
      priority,
      condition_json: conditionJson,
      is_active: isActive,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update policy edge.' });
  }
});

router.delete('/policy/edges/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const edgeId = parsePositiveInt(req.params.id);
    if (!edgeId) return res.status(400).json({ error: 'Valid edge id is required.' });

    const [existingRows] = await pool.execute(
      `SELECT id, from_node_id, to_node_id, effect, priority
       FROM policy_edges
       WHERE org_id = ? AND id = ?
       LIMIT 1`,
      [scopedOrgId, edgeId]
    );
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Policy edge not found.' });

    await pool.execute(
      `DELETE FROM policy_edges
       WHERE org_id = ? AND id = ?`,
      [scopedOrgId, edgeId]
    );

    await writeAudit(req, 'DELETE', 'policy_edge', edgeId, {
      org_id: scopedOrgId,
      from_node_id: existing.from_node_id,
      to_node_id: existing.to_node_id,
      effect: existing.effect,
      priority: existing.priority,
    });

    res.json({ message: 'Policy edge deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete policy edge.' });
  }
});

router.post('/policy/evaluate', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  const startedAt = Date.now();
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const action = String(req.body.action || 'view').trim().toLowerCase();
    const actor = req.body.actor && typeof req.body.actor === 'object' ? req.body.actor : {};
    const content = req.body.content && typeof req.body.content === 'object' ? req.body.content : {};
    const context = req.body.context && typeof req.body.context === 'object' ? req.body.context : {};

    const [nodes, edgeRows] = await Promise.all([
      loadScopedNodes(scopedOrgId),
      pool.execute(
        `SELECT id, from_node_id, to_node_id, relation_type, effect, priority, condition_json
         FROM policy_edges
         WHERE org_id = ? AND is_active = 1
         ORDER BY priority ASC, id ASC`,
        [scopedOrgId]
      ).then(([rows]) => rows),
    ]);

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const matched = [];

    for (const edge of edgeRows) {
      const fromNode = nodeById.get(edge.from_node_id);
      const toNode = nodeById.get(edge.to_node_id);
      if (!fromNode || !toNode || fromNode.node_scope !== 'actor' || toNode.node_scope !== 'content') {
        continue;
      }

      const edgeCondition = parseJson(edge.condition_json, {});
      const actorMatched = matchRule(fromNode.match_json, actor);
      const contentMatched = matchRule(toNode.match_json, content);
      const conditionMatched = matchRule(edgeCondition, { action, actor, content, context });

      if (actorMatched && contentMatched && conditionMatched) {
        matched.push({
          edge_id: edge.id,
          effect: edge.effect,
          relation_type: edge.relation_type,
          priority: edge.priority,
        });
      }
    }

    const denyMatch = matched.find((item) => item.effect === 'deny');
    const allowMatch = matched.find((item) => item.effect === 'allow');

    let decision = 'deny';
    let reasonCode = 'NO_RULE_MATCH';
    if (denyMatch) {
      decision = 'deny';
      reasonCode = 'MATCHED_DENY_RULE';
    } else if (allowMatch) {
      decision = 'allow';
      reasonCode = 'MATCHED_ALLOW_RULE';
    }

    const latency = Date.now() - startedAt;
    const reason = {
      code: reasonCode,
      matched_edge_ids: matched.map((item) => item.edge_id),
      matched,
    };

    await pool.execute(
      `INSERT INTO policy_decision_logs
       (org_id, actor_user_id, action, content_type, content_id, result, matched_edge_ids, reason_json, request_json, latency_ms, evaluated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopedOrgId,
        parsePositiveInt(actor.user_id) || null,
        action,
        content.type ? String(content.type) : null,
        parsePositiveInt(content.id),
        decision,
        JSON.stringify(reason.matched_edge_ids),
        JSON.stringify(reason),
        JSON.stringify({ action, actor, content, context }),
        latency,
        req.user.userId,
      ]
    );

    res.json({
      org_id: scopedOrgId,
      decision,
      reason,
      latency_ms: latency,
    });
  } catch (err) {
    const latency = Date.now() - startedAt;
    res.status(500).json({
      error: 'Policy evaluation failed.',
      latency_ms: latency,
    });
  }
});

router.get('/policy/decision-logs', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 50;

    const [rows] = await pool.execute(
      `SELECT
         id, org_id, actor_user_id, action, content_type, content_id, result,
         matched_edge_ids, reason_json, request_json, latency_ms, evaluated_by, created_at
       FROM policy_decision_logs
       WHERE org_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      [scopedOrgId]
    );

    const logs = rows.map((row) => ({
      ...row,
      matched_edge_ids: parseJson(row.matched_edge_ids, []),
      reason_json: parseJson(row.reason_json, {}),
      request_json: parseJson(row.request_json, {}),
    }));
    res.json({ org_id: scopedOrgId, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch policy decision logs.' });
  }
});

module.exports = router;
