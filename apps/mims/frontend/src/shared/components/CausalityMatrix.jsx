import { useEffect, useState } from 'react'
import { httpFetch } from '../api/httpFetch.js'

const CATS = ['certain','probable','possible','unlikely','conditional','unassessable']

export default function CausalityMatrix({ caseId, headers }) {
  const [data, setData] = useState({ drugs: [], reactions: [], cells: {} })
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ company: 'possible', reporter: 'possible', narrative: '' })
  async function load() { const res = await httpFetch(`/api/cases/${caseId}/causality`, { headers }); setData(await res.json()) }
  useEffect(() => { if (caseId) load() }, [caseId]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!editing) return
    for (const assessor of ['company', 'reporter']) {
      await httpFetch(`/api/cases/${caseId}/causality`, { method: 'POST', headers, body: JSON.stringify({ drug_id: editing.drug.id, ae_event_id: editing.event.id, assessor, category: form[assessor], narrative: form.narrative }) })
    }
    setEditing(null); load()
  }
  return <div className="cf-causality-matrix">
    <h3>Causality Matrix</h3>
    <div className="cf-matrix-scroll"><table><thead><tr><th>Reaction \ Drug</th>{data.drugs.map(d => <th key={d.id}>{d.drug_name_verbatim || d.product_name || `Drug #${d.id}`}</th>)}</tr></thead><tbody>
      {data.reactions.map(e => <tr key={e.id}><th>{e.event_description || `Event #${e.id}`}</th>{data.drugs.map(d => { const cell = data.cells?.[`${d.id}_${e.id}`] || {}; return <td key={d.id}><button type="button" onClick={() => { setEditing({ drug: d, event: e }); setForm({ company: cell.company?.category || 'possible', reporter: cell.reporter?.category || 'possible', narrative: cell.company?.narrative || '' }) }}><span className="company">C: {cell.company?.category || '—'}</span><span className="reporter">R: {cell.reporter?.category || '—'}</span></button></td> })}</tr>)}
    </tbody></table></div>
    {editing && <div className="cf-modal-lite"><div><h4>{editing.event.event_description} × {editing.drug.drug_name_verbatim}</h4><label>Company<select value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))}>{CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>Reporter<select value={form.reporter} onChange={e => setForm(p => ({ ...p, reporter: e.target.value }))}>{CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></label><label>Narrative<textarea value={form.narrative} onChange={e => setForm(p => ({ ...p, narrative: e.target.value }))} /></label><button onClick={save}>Save</button><button onClick={() => setEditing(null)}>Cancel</button></div></div>}
  </div>
}
