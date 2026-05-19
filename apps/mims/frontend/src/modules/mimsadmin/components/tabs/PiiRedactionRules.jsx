import { useEffect, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const blank = { ha_code: '', field_path: '', action: 'redact', mask_pattern: '', generalization: '' }
export default function PiiRedactionRules() {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(blank)
  async function load() { const res = await httpFetch('/api/admin/pii-redaction-rules', { headers }); const data = await res.json(); setRows(data.rows || []) }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function save(e) { e.preventDefault(); const res = await httpFetch('/api/admin/pii-redaction-rules', { method: 'POST', headers, body: JSON.stringify(form) }); if (res.ok) { setForm(blank); load() } }
  async function remove(id) { const res = await httpFetch(`/api/admin/pii-redaction-rules/${id}`, { method: 'DELETE', headers }); if (res.ok) load() }
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return <div className="ma-page"><div className="ma-page-header"><div><h1>PII Redaction Rules</h1><p>Controls what reporter/patient PII is removed before E2B XML submission.</p></div></div><form className="ma-card" onSubmit={save} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 140px 160px 160px auto', gap: 10, alignItems: 'end' }}><label>HA Code<input value={form.ha_code} onChange={e => set('ha_code', e.target.value)} placeholder="Global" /></label><label>Field Path<input value={form.field_path} onChange={e => set('field_path', e.target.value)} placeholder="reporter.given_name" required /></label><label>Action<select value={form.action} onChange={e => set('action', e.target.value)}><option>redact</option><option>mask</option><option>generalize</option><option>drop</option></select></label><label>Mask<input value={form.mask_pattern} onChange={e => set('mask_pattern', e.target.value)} /></label><label>Generalization<input value={form.generalization} onChange={e => set('generalization', e.target.value)} placeholder="year / first3" /></label><button className="ma-primary">Add Rule</button></form><div className="ma-card"><table className="ma-table"><thead><tr><th>HA</th><th>Field</th><th>Action</th><th>Mask</th><th>Generalization</th><th></th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.ha_code || 'GLOBAL'}</td><td>{r.field_path}</td><td>{r.action}</td><td>{r.mask_pattern || '-'}</td><td>{r.generalization || '-'}</td><td><button onClick={() => remove(r.id)}>Delete</button></td></tr>)}</tbody></table></div></div>
}
