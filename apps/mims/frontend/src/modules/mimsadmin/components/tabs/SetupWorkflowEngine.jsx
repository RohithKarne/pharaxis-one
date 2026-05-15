import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch'

const NODE_TYPES = ['start', 'status', 'condition', 'action', 'wait', 'approval', 'end']

const defaultGraph = {
  nodes: [
    { id: 'start', type: 'start', data: { label: 'Case Created' } },
    { id: 'critical', type: 'condition', data: { label: 'Severity Critical', condition: { field: 'severity', op: '=', value: 'Critical' } } },
    { id: 'assign', type: 'action', data: { label: 'Assign Safety Director', action: { type: 'assign_user', role: 'Safety Director' }, sla: { deadline_hours: 24, on_breach_action: { type: 'notify', role: 'VP Safety' } } } },
    { id: 'end', type: 'end', data: { label: 'End' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'critical' },
    { id: 'e2', source: 'critical', target: 'assign', data: { condition: { field: 'severity', op: '=', value: 'Critical' } } },
    { id: 'e3', source: 'assign', target: 'end' },
  ],
}

function normalizeGraph(value) {
  if (!value || typeof value !== 'object') return defaultGraph
  return {
    nodes: Array.isArray(value.nodes) && value.nodes.length ? value.nodes : defaultGraph.nodes,
    edges: Array.isArray(value.edges) ? value.edges : [],
  }
}

export default function SetupWorkflowEngine() {
  const { token } = useAuth()
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [name, setName] = useState('Critical Case Escalation')
  const [graph, setGraph] = useState(defaultGraph)
  const [selectedId, setSelectedId] = useState('start')
  const [defs, setDefs] = useState([])
  const [trace, setTrace] = useState([])
  const [msg, setMsg] = useState('')
  const [hook, setHook] = useState('case.created')

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) || graph.nodes[0]
  const json = JSON.stringify(graph, null, 2)

  async function load() {
    const r = await httpFetch('/api/admin/workflow-definitions', { headers })
    const d = await r.json().catch(() => ({ rows: [] }))
    setDefs(d.rows || [])
  }
  useEffect(() => { load() }, [])

  function addNode(type) {
    const id = `${type}_${Date.now().toString(36)}`
    setGraph((current) => ({
      ...current,
      nodes: [...current.nodes, { id, type, data: { label: `${type[0].toUpperCase()}${type.slice(1)} Node` } }],
    }))
    setSelectedId(id)
  }

  function updateSelected(patch) {
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node),
    }))
  }

  function connectTo(target) {
    if (!selectedNode?.id || !target || selectedNode.id === target) return
    const id = `e_${selectedNode.id}_${target}_${Date.now().toString(36)}`
    setGraph((current) => ({ ...current, edges: [...current.edges, { id, source: selectedNode.id, target }] }))
  }

  function removeEdge(edgeId) {
    setGraph((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== edgeId) }))
  }

  async function save() {
    const res = await httpFetch('/api/admin/workflow-definitions', { method: 'POST', headers, body: JSON.stringify({ name, scope: 'case', graph_json: graph }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Saved workflow #${d.id}` : JSON.stringify(d))
    load()
  }

  async function simulate(id) {
    const res = await httpFetch(`/api/admin/workflow-definitions/${id}/simulate`, { method: 'POST', headers, body: JSON.stringify({ entity_data: { severity: 'Critical', priority: 'High' } }) })
    const d = await res.json().catch(() => ({ trace: [] }))
    setTrace(d.trace || [])
  }

  async function publish(id) {
    await httpFetch(`/api/admin/workflow-definitions/${id}/publish`, { method: 'POST', headers })
    load()
  }

  async function registerHook(definitionId) {
    const res = await httpFetch(`/api/admin/workflow-definitions/${definitionId}/hooks`, { method: 'POST', headers, body: JSON.stringify({ event_name: hook, entity_type: 'case' }) })
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Hook active for ${hook}` : JSON.stringify(d))
  }

  function importJson(value) {
    try {
      setGraph(normalizeGraph(JSON.parse(value)))
      setMsg('Graph JSON imported.')
    } catch (err) {
      setMsg(`Invalid graph JSON: ${err.message}`)
    }
  }

  return (
    <div className="ma-workflow-engine">
      <h1>Workflow Engine</h1>
      <p>Build tenant workflow graphs, simulate paths, publish immutable versions, then bind the workflow to live case events.</p>
      <div className="ma-workflow-grid">
        <section className="ma-flow-palette">
          <h3>Palette</h3>
          {NODE_TYPES.map((type) => <button key={type} type="button" onClick={() => addNode(type)}>+ {type}</button>)}
          <label>Definition name<input value={name} onChange={e => setName(e.target.value)} /></label>
          <button type="button" onClick={save}>Save Draft</button>
        </section>

        <section className="ma-flow-canvas">
          <h3>Canvas</h3>
          <div className="ma-flow-board">
            {graph.nodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={`ma-flow-node ${selectedNode?.id === node.id ? 'selected' : ''} ${node.type}`}
                style={{ transform: `translate(${(index % 3) * 32}px, ${Math.floor(index / 3) * 8}px)` }}
                onClick={() => setSelectedId(node.id)}
              >
                <span>{node.type}</span>
                <strong>{node.data?.label || node.id}</strong>
              </button>
            ))}
          </div>
          <h4>Edges</h4>
          <div className="ma-flow-edges">
            {graph.edges.map((edge) => (
              <div key={edge.id}>
                <span>{edge.source}{' -> '}{edge.target}</span>
                <button type="button" onClick={() => removeEdge(edge.id)}>Remove</button>
              </div>
            ))}
          </div>
          <details><summary>Advanced JSON</summary><textarea defaultValue={json} rows={12} onBlur={e => importJson(e.target.value)} /></details>
        </section>

        <section className="ma-flow-inspector">
          <h3>Inspector</h3>
          {selectedNode && (
            <>
              <label>Node label<input value={selectedNode.data?.label || ''} onChange={e => updateSelected({ label: e.target.value })} /></label>
              <label>Condition field<input value={selectedNode.data?.condition?.field || ''} onChange={e => updateSelected({ condition: { ...(selectedNode.data?.condition || {}), field: e.target.value } })} /></label>
              <label>Condition op<select value={selectedNode.data?.condition?.op || '='} onChange={e => updateSelected({ condition: { ...(selectedNode.data?.condition || {}), op: e.target.value } })}><option>=</option><option>!=</option><option>&gt;</option><option>&gt;=</option><option>&lt;</option><option>&lt;=</option><option>IN</option><option>NOT_IN</option><option>EMPTY</option><option>NOT_EMPTY</option><option>REGEX</option></select></label>
              <label>Condition value<input value={selectedNode.data?.condition?.value || ''} onChange={e => updateSelected({ condition: { ...(selectedNode.data?.condition || {}), value: e.target.value } })} /></label>
              <label>Action type<input value={selectedNode.data?.action?.type || ''} onChange={e => updateSelected({ action: { ...(selectedNode.data?.action || {}), type: e.target.value } })} /></label>
              <label>SLA hours<input type="number" value={selectedNode.data?.sla?.deadline_hours || ''} onChange={e => updateSelected({ sla: { ...(selectedNode.data?.sla || {}), deadline_hours: Number(e.target.value || 0) } })} /></label>
              <label>Connect selected node to<select onChange={e => connectTo(e.target.value)} value=""><option value="">Choose target</option>{graph.nodes.filter(n => n.id !== selectedNode.id).map(n => <option key={n.id} value={n.id}>{n.data?.label || n.id}</option>)}</select></label>
            </>
          )}
          <h3>Definitions</h3>
          <label>Live event hook<select value={hook} onChange={e => setHook(e.target.value)}><option>case.created</option><option>case.status_changed</option><option>case.updated</option></select></label>
          {defs.map(d => <div key={d.id} className="ma-workflow-row"><b>{d.name}</b><span>{d.status}</span><button onClick={() => simulate(d.id)}>Test</button><button onClick={() => publish(d.id)}>Publish</button><button onClick={() => registerHook(d.id)}>Hook</button></div>)}
          <pre>{JSON.stringify(trace, null, 2)}</pre>
        </section>
      </div>
      {msg && <p>{msg}</p>}
    </div>
  )
}
