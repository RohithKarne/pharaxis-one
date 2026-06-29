import { useState, useEffect, useCallback } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// WP8 — Inbox routing-rules admin UI. The backend (GET/POST/PUT/DELETE
// /api/inbox/routing-rules) and the auto-routing engine already existed; this is the
// missing configuration screen so customers can manage triage rules themselves.

const EMPTY = {
  name: '', priority: 100, is_active: 1,
  sender_contains: '', recipient_contains: '', subject_contains: '', body_contains: '',
  queue_name: '', assign_to_user_id: '', routing_note: '',
}

export default function AdminRoutingRulesPanel({ H }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [edit, setEdit] = useState(null)        // null = no form open; object = creating/editing
  const [flash, setFlash] = useState(null)
  const [saving, setSaving] = useState(false)

  const showFlash = (text, type = 'ok') => { setFlash({ text, type }); setTimeout(() => setFlash(null), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpFetch('/api/inbox/routing-rules', { headers: H })
      if (!res.ok) { showFlash('Failed to load routing rules', 'error'); setRules([]); return }
      const d = await res.json()
      setRules(Array.isArray(d) ? d : (d.rules || []))
    } catch { showFlash('Failed to load routing rules', 'error'); setRules([]) }
    finally { setLoading(false) }
  }, [H])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!edit?.name?.trim() || !edit?.queue_name?.trim()) { showFlash('Name and target queue are required', 'error'); return }
    setSaving(true)
    try {
      const isEdit = !!edit.id
      const path = isEdit ? `/api/inbox/routing-rules/${edit.id}` : '/api/inbox/routing-rules'
      const body = {
        name: edit.name.trim(),
        priority: Number(edit.priority) || 100,
        is_active: edit.is_active ? 1 : 0,
        sender_contains: edit.sender_contains?.trim() || null,
        recipient_contains: edit.recipient_contains?.trim() || null,
        subject_contains: edit.subject_contains?.trim() || null,
        body_contains: edit.body_contains?.trim() || null,
        queue_name: edit.queue_name.trim(),
        assign_to_user_id: edit.assign_to_user_id ? Number(edit.assign_to_user_id) : null,
        routing_note: edit.routing_note?.trim() || null,
      }
      const res = await httpFetch(path, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showFlash(d.error || 'Save failed', 'error'); return }
      showFlash(isEdit ? 'Rule updated' : 'Rule created')
      setEdit(null)
      load()
    } catch { showFlash('Save failed', 'error') }
    finally { setSaving(false) }
  }

  async function toggleActive(rule) {
    try {
      const res = await httpFetch(`/api/inbox/routing-rules/${rule.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ ...rule, is_active: rule.is_active ? 0 : 1 }),
      })
      if (!res.ok) { showFlash('Failed to update', 'error'); return }
      load()
    } catch { showFlash('Failed to update', 'error') }
  }

  async function del(id) {
    if (!window.confirm('Delete this routing rule?')) return
    try {
      const res = await httpFetch(`/api/inbox/routing-rules/${id}`, { method: 'DELETE', headers: H })
      if (!res.ok) { showFlash('Delete failed', 'error'); return }
      showFlash('Rule deleted')
      load()
    } catch { showFlash('Delete failed', 'error') }
  }

  const inp = { width: '100%', padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
  const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }
  const field = (key, label, ph) => (
    <div>
      <label style={lbl}>{label}</label>
      <input style={inp} placeholder={ph} value={edit[key] ?? ''} onChange={e => setEdit({ ...edit, [key]: e.target.value })} />
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <h2 style={{ marginBottom: 4 }}>Inbox Routing Rules</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
        Auto-route incoming email to a queue (and optionally an owner) when it matches the conditions below.
        Rules are evaluated by ascending priority — the first matching rule wins.
      </p>

      {flash && (
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13,
          background: flash.type === 'error' ? '#fee2e2' : '#dcfce7',
          color: flash.type === 'error' ? '#b91c1c' : '#166534' }}>{flash.text}</div>
      )}

      {!edit && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setEdit({ ...EMPTY })}>
          + New Routing Rule
        </button>
      )}

      {edit && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 20, background: 'var(--surface-2, #f8fafc)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12 }}>{edit.id ? 'Edit Rule' : 'New Rule'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12, marginBottom: 12 }}>
            {field('name', 'Rule name *', 'e.g. Safety mailbox → PV queue')}
            <div>
              <label style={lbl}>Priority</label>
              <input style={inp} type="number" value={edit.priority} onChange={e => setEdit({ ...edit, priority: e.target.value })} />
            </div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '4px 0 8px' }}>MATCH WHEN (all provided conditions match)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {field('sender_contains', 'Sender contains', 'e.g. @safety.acme.com')}
            {field('recipient_contains', 'Recipient contains', 'e.g. pv@')}
            {field('subject_contains', 'Subject contains', 'e.g. adverse event')}
            {field('body_contains', 'Body contains', 'e.g. side effect')}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '4px 0 8px' }}>THEN ROUTE TO</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {field('queue_name', 'Target queue *', 'e.g. PV Intake')}
            {field('assign_to_user_id', 'Assign to user id (optional)', 'numeric user id')}
          </div>
          {field('routing_note', 'Routing note (optional)', 'shown on routed items')}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={!!edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })} />
              Active
            </label>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Rule'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : rules.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No routing rules defined yet. Incoming email is not auto-routed until a rule is created.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
              <th style={{ padding: '8px 6px' }}>Pri</th>
              <th style={{ padding: '8px 6px' }}>Name</th>
              <th style={{ padding: '8px 6px' }}>Match</th>
              <th style={{ padding: '8px 6px' }}>→ Queue</th>
              <th style={{ padding: '8px 6px' }}>Owner</th>
              <th style={{ padding: '8px 6px' }}>Active</th>
              <th style={{ padding: '8px 6px' }}></th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => {
              const match = [
                r.sender_contains && `from~"${r.sender_contains}"`,
                r.recipient_contains && `to~"${r.recipient_contains}"`,
                r.subject_contains && `subj~"${r.subject_contains}"`,
                r.body_contains && `body~"${r.body_contains}"`,
              ].filter(Boolean).join(' & ') || '(any)'
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 6px' }}>{r.priority}</td>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '8px 6px', color: 'var(--text-muted)', fontSize: 12 }}>{match}</td>
                  <td style={{ padding: '8px 6px' }}>{r.queue_name}</td>
                  <td style={{ padding: '8px 6px' }}>{r.assign_to_user_name || (r.assign_to_user_id ? `#${r.assign_to_user_id}` : '—')}</td>
                  <td style={{ padding: '8px 6px' }}>
                    <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', background: r.is_active ? '#dcfce7' : '#f1f5f9', color: r.is_active ? '#166534' : '#64748b', border: 'none', borderRadius: 10 }} onClick={() => toggleActive(r)}>
                      {r.is_active ? 'Active' : 'Off'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px', marginRight: 6 }} onClick={() => setEdit({ ...r })}>Edit</button>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => del(r.id)}>Delete</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
