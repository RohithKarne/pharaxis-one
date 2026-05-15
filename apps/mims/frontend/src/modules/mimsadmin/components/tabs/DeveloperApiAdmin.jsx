import { useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch'

export default function DeveloperApiAdmin() {
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [form, setForm] = useState({ name: 'Sandbox Integration Client', scopes: 'cases:read,cases:write,picklists:read,webhooks:write,admin:read,graphql:read' })
  const [client, setClient] = useState(null)

  async function createClient(e) {
    e.preventDefault()
    const res = await httpFetch('/api/admin/api-clients', { method: 'POST', headers, body: JSON.stringify({ name: form.name, scopes: form.scopes.split(',').map(s => s.trim()).filter(Boolean), rate_limit_per_min: 60 }) })
    setClient(await res.json().catch(() => null))
  }

  return (
    <div className="ma-ai-config">
      <h1>Developer API Clients</h1>
      <p>Create OAuth2 client credentials for external integrations and sandbox API testing.</p>
      <form className="ma-ai-card" onSubmit={createClient}>
        <label>Client Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
        <label>Scopes<input value={form.scopes} onChange={e => setForm(f => ({ ...f, scopes: e.target.value }))} /></label>
        <button type="submit">Create Client</button>
      </form>
      {client && <pre>{JSON.stringify(client, null, 2)}</pre>}
    </div>
  )
}
