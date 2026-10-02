import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// Bridge row 2: what needs this client's team, and who is told by email.
export default function AlertsPanel({ clientId, onOpenAlerts }) {
  const { admin, hasRole } = useAdminAuth()
  const canResolve = admin && admin.role !== 'viewer'
  const canEditSettings = hasRole('superadmin', 'admin')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ integration_emails: '', safety_emails: '', safety_wait_hours: 4 })
  const [saveMsg, setSaveMsg] = useState('')

  async function load() {
    try {
      const res = await fetch(`/api/admin/alerts/${clientId}`, { headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || `Could not load alerts (error ${res.status}).`); return }
      setError('')
      setData(d)
      onOpenAlerts?.(d.open || [])
      setForm(d.settings)
    } catch { setError('Could not load alerts — network error.') }
  }
  useEffect(() => { load() }, [clientId])

  async function resolve(id) {
    const res = await fetch(`/api/admin/alerts/${clientId}/${id}/resolve`, { method: 'POST', headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Could not mark it resolved.'); return }
    load()
  }

  async function save(e) {
    e.preventDefault()
    setSaveMsg('')
    const res = await fetch(`/api/admin/alerts/${clientId}/settings`, {
      method: 'PUT', headers: adminHeaders(),
      body: JSON.stringify({ ...form, safety_wait_hours: Number(form.safety_wait_hours) }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setSaveMsg(d.error || 'Could not save.'); return }
    setEditing(false)
    setSaveMsg('Saved.')
    load()
  }

  if (!data && !error) return null
  const open = data?.open || []

  return (
    <div className="cp-card" style={{ marginBottom: 20 }} data-testid="alerts-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Alerts {open.length ? `(${open.length} open)` : ''}</h3>
        {canEditSettings && !editing && data && (
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => { setEditing(true); setSaveMsg('') }}>Who is told</button>
        )}
      </div>
      {error && <div className="cp-error" style={{ marginTop: 8 }}>{error}</div>}

      {data && !open.length && <p style={{ color: '#6b7280', margin: '8px 0 0' }}>Nothing needs your attention.</p>}
      {open.map(a => (
        <div key={a.id} style={{ borderLeft: `4px solid ${a.audience === 'safety' ? '#b91c1c' : '#d97706'}`, padding: '8px 12px', margin: '10px 0', background: '#fafafa' }}>
          <div style={{ fontWeight: 600 }}>{a.title}</div>
          {a.body && <div style={{ fontSize: 13, marginTop: 4 }}>{a.body}</div>}
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {new Date(a.created_at).toLocaleString()} · {a.audience === 'safety' ? 'Safety' : 'Integration'} ·{' '}
            {a.emailed_to ? `emailed to ${a.emailed_to}` : 'nobody was emailed — set who is told'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {a.link_path && <Link className="cp-btn cp-btn-sm cp-btn-outline" to={a.link_path}>Open</Link>}
            {canResolve && <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => resolve(a.id)}>Mark resolved</button>}
          </div>
        </div>
      ))}

      {data && !editing && (
        <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0' }}>
          Integration alerts go to {data.sends_to.integration.join(', ') || 'nobody'}.{' '}
          Safety alerts go to {data.sends_to.safety.join(', ') || 'nobody'}; a safety task waiting more than {data.settings.safety_wait_hours} hour{data.settings.safety_wait_hours === 1 ? '' : 's'} is flagged.
        </p>
      )}
      {saveMsg && !editing && <div style={{ fontSize: 13, marginTop: 6 }}>{saveMsg}</div>}

      {editing && (
        <form onSubmit={save} style={{ marginTop: 12 }}>
          <div className="cp-field">
            <label>Integration alerts — email addresses (leave empty for this client's admins)</label>
            <input value={form.integration_emails} onChange={e => setForm(f => ({ ...f, integration_emails: e.target.value }))} placeholder="ops@example.com, it@example.com" />
          </div>
          <div className="cp-field">
            <label>Safety alerts — email addresses (leave empty for admins and safety reviewers)</label>
            <input value={form.safety_emails} onChange={e => setForm(f => ({ ...f, safety_emails: e.target.value }))} placeholder="safety@example.com" />
          </div>
          <div className="cp-field" style={{ maxWidth: 260 }}>
            <label>Flag a safety task that has waited this many hours</label>
            <input type="number" min={1} max={72} value={form.safety_wait_hours} onChange={e => setForm(f => ({ ...f, safety_wait_hours: e.target.value }))} />
          </div>
          {saveMsg && <div className="cp-error" style={{ marginBottom: 8 }}>{saveMsg}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="cp-btn cp-btn-primary">Save</button>
            <button type="button" className="cp-btn cp-btn-outline" onClick={() => { setEditing(false); setForm(data.settings); setSaveMsg('') }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
