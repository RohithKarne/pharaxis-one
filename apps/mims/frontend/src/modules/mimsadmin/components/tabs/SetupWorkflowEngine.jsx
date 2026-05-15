import { useEffect, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch'

const defaultGraph = {
  nodes: [
    { id: 'start', type: 'start', data: { label: 'Case Created' } },
    { id: 'critical', type: 'condition', data: { label: 'Severity Critical' } },
    { id: 'assign', type: 'action', data: { label: 'Assign Safety Director' } },
    { id: 'end', type: 'end', data: { label: 'End' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'critical' },
    { id: 'e2', source: 'critical', target: 'assign', data: { condition: { field: 'severity', op: '=', value: 'Critical' } } },
    { id: 'e3', source: 'assign', target: 'end' },
  ],
}

export default function SetupWorkflowEngine() {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [name, setName] = useState('Critical Case Escalation')
  const [graph, setGraph] = useState(JSON.stringify(defaultGraph, null, 2))
  const [defs, setDefs] = useState([])
  const [trace, setTrace] = useState([])
  const [msg, setMsg] = useState('')

  async function load() { const r = await httpFetch('/api/admin/workflow-definitions', { headers }); const d = await r.json().catch(() => ({ rows: [] })); setDefs(d.rows || []) }
  useEffect(() => { load() }, [])
  async function save() {
    const res = await httpFetch('/api/admin/workflow-definitions', { method: 'POST', headers, body: JSON.stringify({ name, scope: 'case', graph_json: JSON.parse(graph) }) })
    const d = await res.json().catch(() => ({})); setMsg(res.ok ? `Saved workflow #${d.id}` : JSON.stringify(d)); load()
  }
  async function simulate(id) {
    const res = await httpFetch(`/api/admin/workflow-definitions/${id}/simulate`, { method: 'POST', headers, body: JSON.stringify({ entity_data: { severity: 'Critical' } }) })
    const d = await res.json().catch(() => ({ trace: [] })); setTrace(d.trace || [])
  }
  async function publish(id) { await httpFetch(`/api/admin/workflow-definitions/${id}/publish`, { method: 'POST', headers }); load() }

  return (
    <div className="ma-workflow-engine">
      <h1>Workflow Engine</h1><p>Build tenant workflow graphs, simulate paths, then publish immutable versions.</p>
      <div className="ma-workflow-grid"><section><h3>Palette</h3><p>Start · Status Change · Condition · Action · Wait · Approval Gate · End</p></section><section><label>Name<input value={name} onChange={e => setName(e.target.value)} /></label><textarea value={graph} onChange={e => setGraph(e.target.value)} rows={18} /><button onClick={save}>Save Draft</button></section><section><h3>Definitions</h3>{defs.map(d => <div key={d.id} className="ma-workflow-row"><b>{d.name}</b><span>{d.status}</span><button onClick={() => simulate(d.id)}>Test</button><button onClick={() => publish(d.id)}>Publish</button></div>)}<pre>{JSON.stringify(trace, null, 2)}</pre></section></div>
      {msg && <p>{msg}</p>}
    </div>
  )
}
