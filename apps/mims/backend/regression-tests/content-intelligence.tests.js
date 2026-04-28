'use strict';

const { uniqueName } = require('./helpers');

module.exports = [
  {
    name: 'GET /api/admin/evidence-chain/rules returns rule list',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/evidence-chain/rules', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.rules),
        details: `Status: ${res.status}, count: ${res.body?.rules?.length ?? 0}`,
      };
    },
  },
  {
    name: 'POST /api/admin/evidence-chain/rules creates evidence rule',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const payload = {
        rule_name: uniqueName('Regression Evidence Rule'),
        applies_to: 'template',
        mode_scope: 'response',
        check_type: 'min_content_length',
        check_config: { min: 20 },
        severity: 'warning',
        priority: 310,
        is_active: true,
      };
      const res = await makeRequest('POST', '/api/admin/evidence-chain/rules', payload, token);
      return {
        pass: res.status === 201 && Number(res.body?.id || 0) > 0,
        details: `Status: ${res.status}, id: ${res.body?.id || 'n/a'}`,
      };
    },
  },
  {
    name: 'PUT /api/admin/evidence-chain/rules/:id updates evidence rule',
    module: 'Content Intelligence',
    covers: ['PUT /api/admin/evidence-chain/rules/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/admin/evidence-chain/rules', {
        rule_name: uniqueName('Regression Evidence Rule Update'),
        applies_to: 'template',
        mode_scope: 'response',
        check_type: 'min_content_length',
        check_config: { min: 10 },
        severity: 'warning',
        priority: 320,
      }, token);
      const ruleId = Number(create.body?.id || 0);
      if (create.status !== 201 || !ruleId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/admin/evidence-chain/rules/${ruleId}`, {
        rule_name: `${create.body?.rule_name || 'Evidence Rule'} Updated`,
        applies_to: 'template',
        mode_scope: 'response',
        check_type: 'min_content_length',
        check_config: { min: 25 },
        severity: 'warning',
        priority: 321,
        is_active: true,
      }, token);
      return {
        pass: update.status === 200 && Number(update.body?.id || 0) === ruleId,
        details: `Status: ${update.status}, id: ${ruleId}`,
      };
    },
  },
  {
    name: 'POST /api/admin/evidence-chain/compile validates missing content identifiers',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/evidence-chain/compile', {
        content_type: 'template',
        mode: 'response',
      }, token);
      return {
        pass: res.status === 400,
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/admin/evidence-chain/runs returns run list',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/evidence-chain/runs?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.runs),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'POST /api/admin/contradiction-radar/scan runs scan',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/contradiction-radar/scan', {
        limit: 10,
        include_non_published: true,
      }, token);
      return {
        pass: res.status === 200 && typeof res.body?.generated_findings === 'number',
        details: `Status: ${res.status}, findings: ${res.body?.generated_findings ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/admin/contradiction-radar/findings returns findings',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/contradiction-radar/findings?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.findings),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'PUT /api/admin/contradiction-radar/findings/:id/status rejects missing finding',
    module: 'Content Intelligence',
    covers: ['PUT /api/admin/contradiction-radar/findings/:id/status'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('PUT', '/api/admin/contradiction-radar/findings/999999999/status', {
        status: 'acknowledged',
        resolution_note: 'Regression missing row check',
      }, token);
      return {
        pass: res.status === 404,
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'POST /api/admin/digital-twin/simulate returns simulation payload',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/digital-twin/simulate', {
        scenario_name: uniqueName('Regression Scenario'),
        changes: [{ type: 'template-status-change', template_id: 1 }],
        context: { release_window: 'qa' },
      }, token);
      return {
        pass: res.status === 200 && Number(res.body?.run_id || 0) > 0,
        details: `Status: ${res.status}, run: ${res.body?.run_id || 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/admin/digital-twin/runs returns simulation runs',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/digital-twin/runs?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.runs),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/admin/adaptive-risk/rules returns adaptive rules',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/adaptive-risk/rules', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.rules),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'POST /api/admin/adaptive-risk/rules creates adaptive rule',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const payload = {
        rule_name: uniqueName('Regression Adaptive Rule'),
        min_score: 10,
        max_score: 20,
        decision_action: 'manager_review',
        escalation_role: 'manager',
        sla_hours: 12,
        priority: 410,
        is_active: true,
      };
      const res = await makeRequest('POST', '/api/admin/adaptive-risk/rules', payload, token);
      return {
        pass: res.status === 201 && Number(res.body?.id || 0) > 0,
        details: `Status: ${res.status}, id: ${res.body?.id || 'n/a'}`,
      };
    },
  },
  {
    name: 'PUT /api/admin/adaptive-risk/rules/:id updates adaptive rule',
    module: 'Content Intelligence',
    covers: ['PUT /api/admin/adaptive-risk/rules/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/admin/adaptive-risk/rules', {
        rule_name: uniqueName('Regression Adaptive Rule Update'),
        min_score: 21,
        max_score: 30,
        decision_action: 'manager_review',
        escalation_role: 'manager',
        sla_hours: 8,
        priority: 420,
      }, token);
      const ruleId = Number(create.body?.id || 0);
      if (create.status !== 201 || !ruleId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/admin/adaptive-risk/rules/${ruleId}`, {
        rule_name: `${create.body?.rule_name || 'Adaptive Rule'} Updated`,
        min_score: 21,
        max_score: 35,
        decision_action: 'medical_review',
        escalation_role: 'medical',
        sla_hours: 6,
        priority: 421,
        is_active: true,
      }, token);
      return {
        pass: update.status === 200 && Number(update.body?.id || 0) === ruleId,
        details: `Status: ${update.status}, id: ${ruleId}`,
      };
    },
  },
  {
    name: 'POST /api/admin/adaptive-risk/evaluate returns decision',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/adaptive-risk/evaluate', {
        context_type: 'release',
        context: {
          contradiction_count: 1,
          open_findings: 0,
          evidence_blocks: 0,
          sla_breach_risk: 4,
        },
      }, token);
      return {
        pass: res.status === 200 && Number(res.body?.decision_id || 0) > 0,
        details: `Status: ${res.status}, decision: ${res.body?.decision_id || 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/admin/adaptive-risk/decisions returns decisions list',
    module: 'Content Intelligence',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/adaptive-risk/decisions?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.decisions),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/admin/policy/nodes returns policy nodes',
    module: 'Policy Graph',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/policy/nodes?active_only=0', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.nodes),
        details: `Status: ${res.status}, count: ${res.body?.count ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/admin/policy/edges returns policy edges',
    module: 'Policy Graph',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/policy/edges?active_only=0', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.edges),
        details: `Status: ${res.status}, count: ${res.body?.count ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'Policy graph CRUD flow creates evaluates and deletes scoped nodes and edge',
    module: 'Policy Graph',
    covers: [
      'POST /api/admin/policy/nodes',
      'PUT /api/admin/policy/nodes/:id',
      'DELETE /api/admin/policy/nodes/:id',
      'POST /api/admin/policy/edges',
      'PUT /api/admin/policy/edges/:id',
      'DELETE /api/admin/policy/edges/:id',
      'POST /api/admin/policy/evaluate',
    ],
    run: async ({ makeRequest, token }) => {
      const actorKey = uniqueName('regression-actor').toLowerCase();
      const contentKey = uniqueName('regression-content').toLowerCase();

      const actorCreate = await makeRequest('POST', '/api/admin/policy/nodes', {
        node_scope: 'actor',
        node_key: actorKey,
        match_json: { role: 'admin' },
      }, token);
      const actorId = Number(actorCreate.body?.id || 0);
      if (actorCreate.status !== 201 || !actorId) {
        return { pass: false, details: `actor create: ${actorCreate.status}` };
      }

      const contentCreate = await makeRequest('POST', '/api/admin/policy/nodes', {
        node_scope: 'content',
        node_key: contentKey,
        match_json: { type: 'template', category: 'regression' },
      }, token);
      const contentId = Number(contentCreate.body?.id || 0);
      if (contentCreate.status !== 201 || !contentId) {
        await makeRequest('DELETE', `/api/admin/policy/nodes/${actorId}`, null, token);
        return { pass: false, details: `content create: ${contentCreate.status}` };
      }

      const actorUpdate = await makeRequest('PUT', `/api/admin/policy/nodes/${actorId}`, {
        node_key: `${actorKey}-updated`,
        match_json: { role: 'admin' },
        is_active: true,
      }, token);
      if (actorUpdate.status !== 200) {
        await makeRequest('DELETE', `/api/admin/policy/nodes/${contentId}`, null, token);
        await makeRequest('DELETE', `/api/admin/policy/nodes/${actorId}`, null, token);
        return { pass: false, details: `actor update: ${actorUpdate.status}` };
      }

      const edgeCreate = await makeRequest('POST', '/api/admin/policy/edges', {
        from_node_id: actorId,
        to_node_id: contentId,
        relation_type: 'applies_to',
        effect: 'allow',
        priority: 10,
        condition_json: { action: 'view' },
      }, token);
      const edgeId = Number(edgeCreate.body?.id || 0);
      if (edgeCreate.status !== 201 || !edgeId) {
        await makeRequest('DELETE', `/api/admin/policy/nodes/${contentId}`, null, token);
        await makeRequest('DELETE', `/api/admin/policy/nodes/${actorId}`, null, token);
        return { pass: false, details: `edge create: ${edgeCreate.status}` };
      }

      const edgeUpdate = await makeRequest('PUT', `/api/admin/policy/edges/${edgeId}`, {
        from_node_id: actorId,
        to_node_id: contentId,
        relation_type: 'applies_to',
        effect: 'allow',
        priority: 5,
        condition_json: { action: 'view' },
        is_active: true,
      }, token);

      const evaluate = await makeRequest('POST', '/api/admin/policy/evaluate', {
        action: 'view',
        actor: { role: 'admin' },
        content: { type: 'template', category: 'regression' },
        context: { source: 'regression' },
      }, token);

      const deleteEdge = await makeRequest('DELETE', `/api/admin/policy/edges/${edgeId}`, null, token);
      const deleteContent = await makeRequest('DELETE', `/api/admin/policy/nodes/${contentId}`, null, token);
      const deleteActor = await makeRequest('DELETE', `/api/admin/policy/nodes/${actorId}`, null, token);

      const pass = (
        edgeUpdate.status === 200 &&
        evaluate.status === 200 &&
        evaluate.body?.decision === 'allow' &&
        deleteEdge.status === 200 &&
        deleteContent.status === 200 &&
        deleteActor.status === 200
      );

      return {
        pass,
        details: `edgeUpdate=${edgeUpdate.status}, evaluate=${evaluate.status}, deleteEdge=${deleteEdge.status}`,
      };
    },
  },
  {
    name: 'GET /api/admin/policy/decision-logs returns policy decision logs',
    module: 'Policy Graph',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/policy/decision-logs?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.logs),
        details: `Status: ${res.status}, count: ${res.body?.count ?? 'n/a'}`,
      };
    },
  },
];
