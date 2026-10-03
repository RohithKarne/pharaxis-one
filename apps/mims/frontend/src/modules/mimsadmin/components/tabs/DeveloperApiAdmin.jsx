import { useEffect, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch'

// Bridge row 6: the systems connected to this organisation (CP Portal and others) —
// what each may do, where its cases land, how its calls are going, and switching one
// off. The page used to only create a client, pre-filled with permissions the API
// rejects ("Invalid scope(s)"), and could not list, adjust or switch anything off.
export default function DeveloperApiAdmin() {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({ name: '', scopes: ['cases:read', 'cases:write'] })
  const [created, setCreated] = useState(null)

  async function load() {
    const res = await httpFetch('/api/admin/api-clients', { headers })
    const d = await res.json().catch(() => ({}))
    // The API platform is off unless the server sets ENABLE_API_PLATFORM; its routes
    // then do not exist and the page said only "API route not found" (MIPM-147).
    if (res.status === 404) { setError('API connections are switched off on this MIMS server. A platform administrator turns them on in the server settings (ENABLE_API_PLATFORM).'); return }
    if (!res.ok) { setError(d.error || 'Could not load API connections.'); return }
    setError(''); setData(d)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function createClient(e) {
    e.preventDefault()
    setMsg('')
    const res = await httpFetch('/api/admin/api-clients', { method: 'POST', headers, body: JSON.stringify({ name: form.name, scopes: form.scopes, rate_limit_per_min: 60 }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error || 'Could not create the connection.'); return }
    setCreated(d); setForm({ name: '', scopes: ['cases:read', 'cases:write'] }); load()
  }

  async function save(client, changes) {
    setMsg('')
    const body = { default_site_id: client.default_site_id || null, initial_status_id: client.initial_status_id || null, status: client.status, ...changes }
    const res = await httpFetch(`/api/admin/api-clients/${client.id}`, { method: 'PUT', headers, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(d.error || 'Could not save.'); return }
    setMsg(`Saved "${client.name}".`); load()
  }

  return (
    <div className="ma-ai-config">
      <h1>API connections</h1>
      <p>Systems allowed to send cases into this organisation, such as a CP Portal. Each case they send lands in the site and status set here.</p>
      {error && <div className="cp-error" style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}
      {msg && <div style={{ marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      {data && (
        <table className="admin-table" style={{ width: '100%', marginBottom: 24 }}>
          <thead>
            <tr><th>Name</th><th>Can</th><th>New cases land in</th><th>Starting status</th><th>Last 24 h</th><th>Cases sent</th><th /></tr>
          </thead>
          <tbody>
            {data.clients.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 16 }}>No connections yet.</td></tr>}
            {data.clients.map(c => (
              <tr key={c.id} style={{ opacity: c.status === 'active' ? 1 : 0.55 }}>
                <td><strong>{c.name}</strong><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.client_id}</div></td>
                <td style={{ fontSize: 12 }}>{c.scopes.join(', ')}</td>
                <td>
                  <select value={c.default_site_id || ''} disabled={c.status !== 'active'} onChange={e => save(c, { default_site_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">First site{data.sites[0] ? ` (${data.sites[0].name})` : ''}</option>
                    {data.sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td>
                  <select value={c.initial_status_id || ''} disabled={c.status !== 'active'} onChange={e => save(c, { initial_status_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">"New"</option>
                    {data.states.filter(s => !s.is_closed).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
                <td style={{ fontSize: 12 }}>
                  {c.calls_24h} calls, {c.failures_24h} failed
                  {c.last_failure && <div style={{ color: '#b91c1c' }} title={c.last_failure}>last failure: {c.last_failure.slice(0, 48)}</div>}
                  <div style={{ color: 'var(--text-muted)' }}>{c.last_call_at ? `last call ${new Date(c.last_call_at).toLocaleString()}` : 'no calls yet'}</div>
                </td>
                <td>{c.cases_created}</td>
                <td>
                  {c.status === 'active'
                    ? <button className="btn btn-outline" onClick={() => save(c, { status: 'revoked' })}>Switch off</button>
                    : <button className="btn btn-outline" onClick={() => save(c, { status: 'active' })}>Switch on</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="ma-ai-card" onSubmit={createClient}>
        <h3 style={{ marginTop: 0 }}>Add a connection</h3>
        <label>Name<input value={form.name} required onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Calder CP Portal" /></label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0' }}>
          {(data?.allowed_scopes || []).map(sc => (
            <label key={sc} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.scopes.includes(sc)}
                onChange={e => setForm(f => ({ ...f, scopes: e.target.checked ? [...f.scopes, sc] : f.scopes.filter(x => x !== sc) }))} />
              {sc}
            </label>
          ))}
        </div>
        <button type="submit" disabled={!form.name.trim() || !form.scopes.length}>Create connection</button>
      </form>
      {created && (
        <div className="ma-ai-card" style={{ marginTop: 12 }}>
          <strong>Copy these now — the secret is shown only once.</strong>
          <div>Client ID: <code>{created.client_id}</code></div>
          <div>Client secret: <code>{created.client_secret}</code></div>
        </div>
      )}
    </div>
  )
}
