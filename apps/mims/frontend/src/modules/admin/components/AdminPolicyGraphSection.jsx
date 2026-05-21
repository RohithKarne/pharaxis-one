import { useCallback, useEffect, useMemo, useState } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function safeParseJson(label, raw) {
  const text = String(raw || '').trim()
  if (!text) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: `${label} must be valid JSON.` }
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function prettyJson(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function parseMySqlDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    const [date, time] = raw.split(' ')
    return new Date(`${date}T${time}Z`)
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function fmtDate(value) {
  const date = parseMySqlDate(value)
  if (!date) return value || '—'
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function statusTag(active) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 10,
        background: active ? '#e6f4ee' : '#fde8e8',
        color: active ? '#007a5a' : '#a12622',
      }}
    >
      {active ? 'ACTIVE' : 'INACTIVE'}
    </span>
  )
}

function modalBackdropStyle() {
  return {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.35)',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  }
}

export default function AdminPolicyGraphSection({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [logs, setLogs] = useState([])
  const [logsLimit, setLogsLimit] = useState(50)
  const [logsLoading, setLogsLoading] = useState(false)
  const [loadingRules, setLoadingRules] = useState(false)

  const [creatingNode, setCreatingNode] = useState(false)
  const [creatingEdge, setCreatingEdge] = useState(false)
  const [updatingNode, setUpdatingNode] = useState(false)
  const [updatingEdge, setUpdatingEdge] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const [selectedLog, setSelectedLog] = useState(null)
  const [nodeEditor, setNodeEditor] = useState(null)
  const [edgeEditor, setEdgeEditor] = useState(null)

  const [nodeForm, setNodeForm] = useState({
    node_scope: 'actor',
    node_key: '',
    match_json: '{\n  "role": "admin"\n}',
    is_active: true,
  })
  const [edgeForm, setEdgeForm] = useState({
    from_node_id: '',
    to_node_id: '',
    relation_type: 'applies_to',
    effect: 'allow',
    priority: 100,
    condition_json: '{\n  "action": ["view"]\n}',
    is_active: true,
  })
  const [evalForm, setEvalForm] = useState({
    action: 'view',
    actor: '{\n  "role": "admin"\n}',
    content: '{\n  "type": "faq",\n  "category": "Safety",\n  "id": 101\n}',
    context: '{\n  "country": "IN"\n}',
  })
  const [evalResult, setEvalResult] = useState(null)

  const orgIdNum = useMemo(() => {
    const parsed = Number.parseInt(orgId, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  }, [orgId])

  const actorNodes = useMemo(() => nodes.filter((node) => node.node_scope === 'actor'), [nodes])
  const contentNodes = useMemo(() => nodes.filter((node) => node.node_scope === 'content'), [nodes])

  const withOrg = useCallback((path) => {
    if (!orgIdNum) return path
    return `${path}${path.includes('?') ? '&' : '?'}org_id=${orgIdNum}`
  }, [orgIdNum])

  const loadOrgs = useCallback(async () => {
    try {
      const res = await httpFetch('/api/admin/orgs', { headers: H })
      if (!res.ok) return
      const body = await res.json()
      const nextOrgs = toArray(body.orgs).length > 0 ? toArray(body.orgs) : toArray(body.organisations)
      setOrgs(nextOrgs)
      if (!orgId && nextOrgs.length > 0) setOrgId(String(nextOrgs[0].id))
    } catch {
      // Silent fallback
    }
  }, [H, orgId])

  const loadRules = useCallback(async () => {
    setLoadingRules(true)
    try {
      const [nodesRes, edgesRes] = await Promise.all([
        httpFetch(withOrg('/api/admin/policy/nodes'), { headers: H }),
        httpFetch(withOrg('/api/admin/policy/edges'), { headers: H }),
      ])
      const nodesBody = await nodesRes.json().catch(() => ({}))
      const edgesBody = await edgesRes.json().catch(() => ({}))
      if (!nodesRes.ok) throw new Error(nodesBody.error || 'Failed to load policy nodes.')
      if (!edgesRes.ok) throw new Error(edgesBody.error || 'Failed to load policy edges.')
      setNodes(toArray(nodesBody.nodes))
      setEdges(toArray(edgesBody.edges))
    } catch (err) {
      flash(err.message || 'Failed to load policy graph data.', 'error')
    } finally {
      setLoadingRules(false)
    }
  }, [H, flash, withOrg])

  const loadDecisionLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await httpFetch(withOrg(`/api/admin/policy/decision-logs?limit=${logsLimit}`), { headers: H })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to load decision logs.')
      setLogs(toArray(body.logs))
    } catch (err) {
      flash(err.message || 'Failed to load decision logs.', 'error')
    } finally {
      setLogsLoading(false)
    }
  }, [H, flash, logsLimit, withOrg])

  useEffect(() => {
    loadOrgs()
  }, [loadOrgs])

  useEffect(() => {
    loadRules()
    loadDecisionLogs()
  }, [loadRules, loadDecisionLogs])

  async function handleCreateNode() {
    const key = nodeForm.node_key.trim()
    if (!key) return flash('Node key is required.', 'error')

    const parsed = safeParseJson('Node match_json', nodeForm.match_json)
    if (!parsed.ok) return flash(parsed.error, 'error')

    setCreatingNode(true)
    try {
      const payload = {
        node_scope: nodeForm.node_scope,
        node_key: key,
        match_json: parsed.value,
        is_active: nodeForm.is_active,
      }
      if (orgIdNum) payload.org_id = orgIdNum

      const res = await httpFetch('/api/admin/policy/nodes', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to create node.')

      setNodeForm((prev) => ({ ...prev, node_key: '' }))
      flash('Policy node created.')
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to create node.', 'error')
    } finally {
      setCreatingNode(false)
    }
  }

  async function handleCreateEdge() {
    const fromNodeId = Number.parseInt(edgeForm.from_node_id, 10)
    const toNodeId = Number.parseInt(edgeForm.to_node_id, 10)
    if (!Number.isInteger(fromNodeId) || !Number.isInteger(toNodeId)) {
      return flash('From node and To node are required.', 'error')
    }

    const parsed = safeParseJson('Edge condition_json', edgeForm.condition_json)
    if (!parsed.ok) return flash(parsed.error, 'error')

    setCreatingEdge(true)
    try {
      const payload = {
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        relation_type: edgeForm.relation_type.trim() || 'applies_to',
        effect: edgeForm.effect,
        priority: Number(edgeForm.priority) || 100,
        condition_json: parsed.value,
        is_active: edgeForm.is_active,
      }
      if (orgIdNum) payload.org_id = orgIdNum

      const res = await httpFetch('/api/admin/policy/edges', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to create edge.')

      setEdgeForm((prev) => ({ ...prev, from_node_id: '', to_node_id: '' }))
      flash('Policy edge created.')
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to create edge.', 'error')
    } finally {
      setCreatingEdge(false)
    }
  }

  function openNodeEditor(node) {
    setNodeEditor({
      id: node.id,
      node_scope: node.node_scope,
      node_key: node.node_key,
      match_json: prettyJson(node.match_json),
      is_active: !!node.is_active,
    })
  }

  function openEdgeEditor(edge) {
    setEdgeEditor({
      id: edge.id,
      from_node_id: String(edge.from_node_id),
      to_node_id: String(edge.to_node_id),
      relation_type: edge.relation_type || 'applies_to',
      effect: edge.effect || 'allow',
      priority: edge.priority ?? 100,
      condition_json: prettyJson(edge.condition_json),
      is_active: !!edge.is_active,
    })
  }

  async function saveNodeEditor() {
    if (!nodeEditor) return
    const key = String(nodeEditor.node_key || '').trim()
    if (!key) return flash('Node key cannot be empty.', 'error')

    const parsed = safeParseJson('Node match_json', nodeEditor.match_json)
    if (!parsed.ok) return flash(parsed.error, 'error')

    setUpdatingNode(true)
    try {
      const payload = {
        node_key: key,
        match_json: parsed.value,
        is_active: !!nodeEditor.is_active,
      }
      if (orgIdNum) payload.org_id = orgIdNum

      const res = await httpFetch(`/api/admin/policy/nodes/${nodeEditor.id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to update node.')

      flash('Policy node updated.')
      setNodeEditor(null)
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to update node.', 'error')
    } finally {
      setUpdatingNode(false)
    }
  }

  async function toggleNodeActive(node) {
    const payload = { is_active: !node.is_active }
    if (orgIdNum) payload.org_id = orgIdNum

    try {
      const res = await httpFetch(`/api/admin/policy/nodes/${node.id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to update node status.')
      flash(`Node ${node.is_active ? 'deactivated' : 'activated'}.`)
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to update node status.', 'error')
    }
  }

  async function deleteNode(node) {
    if (!await confirm(`Delete node "${node.node_key}"?`)) return

    try {
      const res = await httpFetch(withOrg(`/api/admin/policy/nodes/${node.id}`), {
        method: 'DELETE',
        headers: H,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to delete node.')
      flash('Policy node deleted.')
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to delete node.', 'error')
    }
  }

  async function saveEdgeEditor() {
    if (!edgeEditor) return

    const fromNodeId = Number.parseInt(edgeEditor.from_node_id, 10)
    const toNodeId = Number.parseInt(edgeEditor.to_node_id, 10)
    if (!Number.isInteger(fromNodeId) || !Number.isInteger(toNodeId)) {
      return flash('From node and To node are required.', 'error')
    }

    const parsed = safeParseJson('Edge condition_json', edgeEditor.condition_json)
    if (!parsed.ok) return flash(parsed.error, 'error')

    setUpdatingEdge(true)
    try {
      const payload = {
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        relation_type: String(edgeEditor.relation_type || '').trim() || 'applies_to',
        effect: edgeEditor.effect,
        priority: Number(edgeEditor.priority) || 100,
        condition_json: parsed.value,
        is_active: !!edgeEditor.is_active,
      }
      if (orgIdNum) payload.org_id = orgIdNum

      const res = await httpFetch(`/api/admin/policy/edges/${edgeEditor.id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to update edge.')

      flash('Policy edge updated.')
      setEdgeEditor(null)
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to update edge.', 'error')
    } finally {
      setUpdatingEdge(false)
    }
  }

  async function toggleEdgeActive(edge) {
    const payload = { is_active: !edge.is_active }
    if (orgIdNum) payload.org_id = orgIdNum

    try {
      const res = await httpFetch(`/api/admin/policy/edges/${edge.id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to update edge status.')
      flash(`Edge ${edge.is_active ? 'deactivated' : 'activated'}.`)
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to update edge status.', 'error')
    }
  }

  async function deleteEdge(edge) {
    if (!await confirm(`Delete edge #${edge.id} (${edge.from_key} → ${edge.to_key})?`)) return

    try {
      const res = await httpFetch(withOrg(`/api/admin/policy/edges/${edge.id}`), {
        method: 'DELETE',
        headers: H,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to delete edge.')
      flash('Policy edge deleted.')
      await loadRules()
    } catch (err) {
      flash(err.message || 'Failed to delete edge.', 'error')
    }
  }

  async function handleEvaluate() {
    const actor = safeParseJson('Actor payload', evalForm.actor)
    const content = safeParseJson('Content payload', evalForm.content)
    const context = safeParseJson('Context payload', evalForm.context)
    if (!actor.ok) return flash(actor.error, 'error')
    if (!content.ok) return flash(content.error, 'error')
    if (!context.ok) return flash(context.error, 'error')

    setEvaluating(true)
    try {
      const payload = {
        action: String(evalForm.action || 'view').trim() || 'view',
        actor: actor.value,
        content: content.value,
        context: context.value,
      }
      if (orgIdNum) payload.org_id = orgIdNum

      const res = await httpFetch('/api/admin/policy/evaluate', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Policy evaluation failed.')

      setEvalResult(body)
      await loadDecisionLogs()
      flash('Policy evaluation complete.')
    } catch (err) {
      setEvalResult(null)
      flash(err.message || 'Policy evaluation failed.', 'error')
    } finally {
      setEvaluating(false)
    }
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>Policy Graph Engine</h3>
          <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
            Build actor-to-content policy rules, run runtime evaluation, inspect explain trail.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, minWidth: 220, background: 'var(--surface)', color: 'var(--text-primary)' }}
          >
            <option value="">Use token organisation scope</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={loadRules} disabled={loadingRules}>Refresh Rules</button>
          <button className="btn btn-outline" onClick={loadDecisionLogs} disabled={logsLoading}>Refresh Logs</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nodes</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{nodes.length}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Edges</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{edges.length}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Decision Logs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{logs.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div className="card" style={{ padding: 14 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-primary)' }}>Create Policy Node</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            <select className="form-control" value={nodeForm.node_scope} onChange={(e) => setNodeForm((prev) => ({ ...prev, node_scope: e.target.value }))}>
              <option value="actor">actor</option>
              <option value="content">content</option>
              <option value="context">context</option>
            </select>
            <input
              className="form-control"
              placeholder="node_key (example: actor_admin)"
              value={nodeForm.node_key}
              onChange={(e) => setNodeForm((prev) => ({ ...prev, node_key: e.target.value }))}
            />
            <textarea
              className="form-control"
              rows={6}
              value={nodeForm.match_json}
              onChange={(e) => setNodeForm((prev) => ({ ...prev, match_json: e.target.value }))}
            />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={nodeForm.is_active} onChange={(e) => setNodeForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
              Active
            </label>
            <button className="btn btn-primary" onClick={handleCreateNode} disabled={creatingNode}>
              {creatingNode ? 'Creating…' : 'Create Node'}
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-primary)' }}>Create Policy Edge</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            <select className="form-control" value={edgeForm.from_node_id} onChange={(e) => setEdgeForm((prev) => ({ ...prev, from_node_id: e.target.value }))}>
              <option value="">From Actor Node</option>
              {actorNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id} · {node.node_key}</option>
              ))}
            </select>
            <select className="form-control" value={edgeForm.to_node_id} onChange={(e) => setEdgeForm((prev) => ({ ...prev, to_node_id: e.target.value }))}>
              <option value="">To Content Node</option>
              {contentNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.id} · {node.node_key}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <input className="form-control" placeholder="relation_type" value={edgeForm.relation_type} onChange={(e) => setEdgeForm((prev) => ({ ...prev, relation_type: e.target.value }))} />
              <select className="form-control" value={edgeForm.effect} onChange={(e) => setEdgeForm((prev) => ({ ...prev, effect: e.target.value }))}>
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </select>
              <input className="form-control" type="number" value={edgeForm.priority} onChange={(e) => setEdgeForm((prev) => ({ ...prev, priority: e.target.value }))} />
            </div>
            <textarea className="form-control" rows={6} value={edgeForm.condition_json} onChange={(e) => setEdgeForm((prev) => ({ ...prev, condition_json: e.target.value }))} />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={edgeForm.is_active} onChange={(e) => setEdgeForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
              Active
            </label>
            <button className="btn btn-primary" onClick={handleCreateEdge} disabled={creatingEdge}>
              {creatingEdge ? 'Creating…' : 'Create Edge'}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Policy Graph Snapshot</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>ID</th>
                <th>Key / Link</th>
                <th>Rule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingRules && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Loading policy graph…</td></tr>
              )}
              {!loadingRules && nodes.length === 0 && edges.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No nodes or edges yet.</td></tr>
              )}
              {nodes.map((node) => (
                <tr key={`node-${node.id}`}>
                  <td>Node</td>
                  <td>{node.id}</td>
                  <td>{node.node_scope} · {node.node_key}</td>
                  <td><pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap' }}>{prettyJson(node.match_json)}</pre></td>
                  <td>{statusTag(!!node.is_active)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline" style={{ fontSize: 11, marginRight: 6 }} onClick={() => openNodeEditor(node)}>Edit</button>
                    <button className="btn btn-outline" style={{ fontSize: 11, marginRight: 6 }} onClick={() => toggleNodeActive(node)}>{node.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => deleteNode(node)}>Delete</button>
                  </td>
                </tr>
              ))}
              {edges.map((edge) => (
                <tr key={`edge-${edge.id}`}>
                  <td>Edge</td>
                  <td>{edge.id}</td>
                  <td>{edge.from_key} → {edge.to_key}</td>
                  <td>
                    effect={edge.effect}, priority={edge.priority}
                    <pre style={{ margin: '6px 0 0', fontSize: 11, whiteSpace: 'pre-wrap' }}>{prettyJson(edge.condition_json)}</pre>
                  </td>
                  <td>{statusTag(!!edge.is_active)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline" style={{ fontSize: 11, marginRight: 6 }} onClick={() => openEdgeEditor(edge)}>Edit</button>
                    <button className="btn btn-outline" style={{ fontSize: 11, marginRight: 6 }} onClick={() => toggleEdgeActive(edge)}>{edge.is_active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn btn-danger" style={{ fontSize: 11 }} onClick={() => deleteEdge(edge)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Evaluate Policy</h3>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Action</label>
              <input className="form-control" value={evalForm.action} onChange={(e) => setEvalForm((prev) => ({ ...prev, action: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }}>Actor JSON</label>
              <textarea className="form-control" rows={5} value={evalForm.actor} onChange={(e) => setEvalForm((prev) => ({ ...prev, actor: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }}>Content JSON</label>
              <textarea className="form-control" rows={5} value={evalForm.content} onChange={(e) => setEvalForm((prev) => ({ ...prev, content: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', paddingTop: 8 }}>Context JSON</label>
              <textarea className="form-control" rows={4} value={evalForm.context} onChange={(e) => setEvalForm((prev) => ({ ...prev, context: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleEvaluate} disabled={evaluating}>
                {evaluating ? 'Evaluating…' : 'Evaluate'}
              </button>
            </div>
          </div>

          {evalResult && (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: evalResult.decision === 'allow' ? '#007a5a' : '#d72c0d' }}>
                  Decision: {String(evalResult.decision || '').toUpperCase()}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Latency: {evalResult.latency_ms ?? '—'} ms</span>
              </div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{prettyJson(evalResult.reason)}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Decision Logs</h3>
          <select className="form-control" style={{ maxWidth: 110 }} value={logsLimit} onChange={(e) => setLogsLimit(Number(e.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Content</th>
                <th>Result</th>
                <th>Latency</th>
                <th>Explain</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Loading decision logs…</td></tr>
              )}
              {!logsLoading && logs.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No decision logs yet.</td></tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(log.created_at)}</td>
                  <td>{log.action}</td>
                  <td>{log.content_type || '—'} #{log.content_id || '—'}</td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: log.result === 'allow' ? '#e6f4ee' : '#fde8e8',
                      color: log.result === 'allow' ? '#007a5a' : '#a12622',
                      fontWeight: 700,
                    }}>
                      {String(log.result || '').toUpperCase()}
                    </span>
                  </td>
                  <td>{log.latency_ms ?? '—'} ms</td>
                  <td><button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => setSelectedLog(log)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nodeEditor && (
        <div style={modalBackdropStyle()} onClick={() => setNodeEditor(null)}>
          <div style={{ width: '100%', maxWidth: 620, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>Edit Node #{nodeEditor.id}</h4>
              <button className="btn btn-outline" onClick={() => setNodeEditor(null)}>Close</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <input className="form-control" value={nodeEditor.node_scope} disabled />
              <input className="form-control" value={nodeEditor.node_key} onChange={(e) => setNodeEditor((prev) => ({ ...prev, node_key: e.target.value }))} />
              <textarea className="form-control" rows={8} value={nodeEditor.match_json} onChange={(e) => setNodeEditor((prev) => ({ ...prev, match_json: e.target.value }))} />
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={nodeEditor.is_active} onChange={(e) => setNodeEditor((prev) => ({ ...prev, is_active: e.target.checked }))} />
                Active
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setNodeEditor(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveNodeEditor} disabled={updatingNode}>{updatingNode ? 'Saving…' : 'Save Node'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {edgeEditor && (
        <div style={modalBackdropStyle()} onClick={() => setEdgeEditor(null)}>
          <div style={{ width: '100%', maxWidth: 760, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>Edit Edge #{edgeEditor.id}</h4>
              <button className="btn btn-outline" onClick={() => setEdgeEditor(null)}>Close</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select className="form-control" value={edgeEditor.from_node_id} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, from_node_id: e.target.value }))}>
                  <option value="">From Actor Node</option>
                  {actorNodes.map((node) => <option key={node.id} value={node.id}>{node.id} · {node.node_key}</option>)}
                </select>
                <select className="form-control" value={edgeEditor.to_node_id} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, to_node_id: e.target.value }))}>
                  <option value="">To Content Node</option>
                  {contentNodes.map((node) => <option key={node.id} value={node.id}>{node.id} · {node.node_key}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input className="form-control" value={edgeEditor.relation_type} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, relation_type: e.target.value }))} />
                <select className="form-control" value={edgeEditor.effect} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, effect: e.target.value }))}>
                  <option value="allow">allow</option>
                  <option value="deny">deny</option>
                </select>
                <input className="form-control" type="number" value={edgeEditor.priority} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, priority: e.target.value }))} />
              </div>
              <textarea className="form-control" rows={8} value={edgeEditor.condition_json} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, condition_json: e.target.value }))} />
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={edgeEditor.is_active} onChange={(e) => setEdgeEditor((prev) => ({ ...prev, is_active: e.target.checked }))} />
                Active
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setEdgeEditor(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEdgeEditor} disabled={updatingEdge}>{updatingEdge ? 'Saving…' : 'Save Edge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <div style={modalBackdropStyle()} onClick={() => setSelectedLog(null)}>
          <div style={{ width: '100%', maxWidth: 820, maxHeight: '85vh', overflow: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h4 style={{ margin: 0 }}>Decision Explain — Log #{selectedLog.id}</h4>
              <button className="btn btn-outline" onClick={() => setSelectedLog(null)}>Close</button>
            </div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <div><strong>Date:</strong> {fmtDate(selectedLog.created_at)}</div>
              <div><strong>Result:</strong> {selectedLog.result}</div>
              <div><strong>Action:</strong> {selectedLog.action}</div>
              <div><strong>Content:</strong> {selectedLog.content_type || '—'} #{selectedLog.content_id || '—'}</div>
              <div><strong>Latency:</strong> {selectedLog.latency_ms ?? '—'} ms</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>Reason JSON</strong>
              <pre style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {prettyJson(selectedLog.reason_json)}
              </pre>
            </div>
            <div>
              <strong>Request JSON</strong>
              <pre style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {prettyJson(selectedLog.request_json)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
