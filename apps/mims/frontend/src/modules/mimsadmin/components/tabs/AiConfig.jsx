import { useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch'

export default function AiConfig() {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [form, setForm] = useState({ provider_key: 'openai', model_name: 'gpt-4o-mini', daily_token_budget: 100000, enabled: false, allow_phi_external: false })
  const [usage, setUsage] = useState([])
  const [msg, setMsg] = useState('')

  async function save(e) {
    e.preventDefault()
    const res = await httpFetch('/api/admin/ai-config', { method: 'POST', headers, body: JSON.stringify(form) })
    const data = await res.json().catch(() => ({}))
    setMsg(res.ok ? 'AI configuration saved.' : data.error || 'Save failed')
  }
  async function loadUsage() {
    const res = await httpFetch('/api/admin/ai/usage', { headers })
    const data = await res.json().catch(() => ({ rows: [] }))
    setUsage(data.rows || [])
  }

  return (
    <div className="ma-ai-config">
      <h1>AI Configuration</h1>
      <p>Configure provider, model, budget, and PHI boundary. External providers stay disabled unless PHI export is explicitly allowed.</p>
      <form onSubmit={save} className="ma-ai-card">
        <label>Provider<select value={form.provider_key} onChange={e => setForm(f => ({ ...f, provider_key: e.target.value }))}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="azure_openai">Azure OpenAI</option><option value="on_prem">On-prem</option></select></label>
        <label>Model<input value={form.model_name} onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))} /></label>
        <label>Endpoint<input value={form.api_endpoint || ''} onChange={e => setForm(f => ({ ...f, api_endpoint: e.target.value }))} /></label>
        <label>API Key<input type="password" value={form.api_key || ''} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} /></label>
        <label>Daily Token Budget<input type="number" value={form.daily_token_budget} onChange={e => setForm(f => ({ ...f, daily_token_budget: Number(e.target.value) }))} /></label>
        <label><input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} /> Enable provider</label>
        <label><input type="checkbox" checked={form.allow_phi_external} onChange={e => setForm(f => ({ ...f, allow_phi_external: e.target.checked }))} /> Allow PHI to leave org</label>
        <button type="submit">Save AI Configuration</button>
      </form>
      {msg && <p>{msg}</p>}
      <button type="button" onClick={loadUsage}>Load Usage</button>
      <pre>{JSON.stringify(usage, null, 2)}</pre>
    </div>
  )
}
