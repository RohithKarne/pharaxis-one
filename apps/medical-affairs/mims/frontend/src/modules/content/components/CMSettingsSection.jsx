import { useState, useEffect, useCallback } from 'react'

const CM_FIELD_TYPES = [
  { key: 'document_category', label: 'Document Category' },
  { key: 'content_type', label: 'Content Type' },
  { key: 'language', label: 'Language' },
  { key: 'audience', label: 'Audience' },
  { key: 'therapeutic_area', label: 'Therapeutic Area' },
]

function CMOrgAlertsSettings({ token }) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [settings, setSettings] = useState({})
  const [emailAccounts, setEmailAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [newDay, setNewDay] = useState('')
  const [alertDays, setAlertDays] = useState([])
  const [defaultEmail, setDefaultEmail] = useState('')
  const [defaultRoles, setDefaultRoles] = useState([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [sRes, eRes] = await Promise.all([
          fetch('/api/cm/settings', { headers: H }),
          fetch('/api/admin/email-accounts', { headers: H }),
        ])
        if (sRes.ok) {
          const d = await sRes.json()
          const s = d.settings || {}
          setSettings(s)
          setAlertDays(Array.isArray(s.default_alert_days) ? s.default_alert_days : [])
          setDefaultEmail(s.default_alert_email_account_id || '')
          setDefaultRoles(Array.isArray(s.default_alert_roles) ? s.default_alert_roles : [])
        }
        if (eRes.ok) setEmailAccounts((await eRes.json()).accounts || [])
      } catch { /* silent */ }
      setLoading(false)
    }
    load()
  }, [token]) // eslint-disable-line

  async function saveSetting(key, value) {
    setSaving(p => ({ ...p, [key]: true }))
    try {
      await fetch('/api/cm/settings', { method: 'PUT', headers: H, body: JSON.stringify({ setting_key: key, setting_value: value }) })
    } catch { alert('Network error.') }
    setSaving(p => ({ ...p, [key]: false }))
  }

  function addDay() {
    const d = Number(newDay)
    if (!d || d < 1 || alertDays.includes(d)) return
    const updated = [...alertDays, d].sort((a, b) => a - b)
    setAlertDays(updated)
    setNewDay('')
    saveSetting('default_alert_days', updated)
  }

  function removeDay(d) {
    const updated = alertDays.filter(x => x !== d)
    setAlertDays(updated)
    saveSetting('default_alert_days', updated)
  }

  const ALL_ROLES = ['admin', 'manager', 'agent', 'reviewer']

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</p>

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 700 }}>Org-Level Alert Defaults</h4>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>These defaults apply to all documents that don't have per-document alert configuration set.</p>
      </div>

      <div className="cm-form-group">
        <label className="cm-form-label">Default Alert Days Before Expiry</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {alertDays.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No default days — only the mandatory 1-day alert fires.</span>}
          {alertDays.map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--primary-light, #f0ebff)', border: '1px solid var(--primary)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
              {d}d
              <button onClick={() => removeDay(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 14, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="number" min="1" className="cm-form-input" style={{ margin: 0, width: 100 }} placeholder="Days" value={newDay} onChange={e => setNewDay(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDay()} />
          <button onClick={addDay} style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[7, 14, 30, 60, 90].map(preset => (
            <button key={preset} onClick={() => { if (!alertDays.includes(preset)) { const u = [...alertDays, preset].sort((a,b)=>a-b); setAlertDays(u); saveSetting('default_alert_days', u) } }}
              style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 20, background: alertDays.includes(preset) ? 'var(--border)' : 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              {preset}d
            </button>
          ))}
        </div>
      </div>

      <div className="cm-form-group">
        <label className="cm-form-label">Default Alert Email Account (SMTP)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="cm-form-select" style={{ margin: 0, flex: 1 }} value={defaultEmail} onChange={e => setDefaultEmail(e.target.value)}>
            <option value="">— None —</option>
            {emailAccounts.map(ea => <option key={ea.id} value={ea.id}>{ea.name || ea.email_address} ({ea.smtp_host})</option>)}
          </select>
          <button onClick={() => saveSetting('default_alert_email_account_id', defaultEmail || null)} disabled={saving.default_alert_email_account_id}
            style={{ padding: '6px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {saving.default_alert_email_account_id ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="cm-form-group">
        <label className="cm-form-label">Default Alert Roles</label>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>Users with these roles in the org will receive alerts for documents without specific subscribers.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          {ALL_ROLES.map(role => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={defaultRoles.includes(role)}
                onChange={e => {
                  const updated = e.target.checked ? [...defaultRoles, role] : defaultRoles.filter(r => r !== role)
                  setDefaultRoles(updated)
                }}
              />
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </label>
          ))}
        </div>
        <button onClick={() => saveSetting('default_alert_roles', defaultRoles)} disabled={saving.default_alert_roles}
          style={{ padding: '6px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          {saving.default_alert_roles ? 'Saving…' : 'Save Roles'}
        </button>
      </div>
    </div>
  )
}

export default function CMSettingsSection({ token }) {
  const [activeField, setActiveField] = useState('document_category')
  const [picklists, setPicklists] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ value: '', label: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const loadPicklists = useCallback(async (fieldType) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cm/picklists?field_type=${fieldType}`, { headers: H })
      if (res.ok) setPicklists((await res.json()).picklists || [])
      else setPicklists([])
    } catch { setPicklists([]) }
    setLoading(false)
  }, [token]) // eslint-disable-line

  useEffect(() => { loadPicklists(activeField) }, [activeField, loadPicklists])

  function openAdd() {
    setEditing(null)
    setForm({ value: '', label: '', sort_order: picklists.length })
    setError('')
    setShowForm(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({ value: item.value, label: item.label, sort_order: item.sort_order ?? 0 })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.value.trim()) { setError('Value is required.'); return }
    setSaving(true); setError('')
    try {
      const url = editing ? `/api/cm/picklists/${editing.id}` : '/api/cm/picklists'
      const method = editing ? 'PUT' : 'POST'
      const body = { ...form, field_type: activeField }
      const res = await fetch(url, { method, headers: H, body: JSON.stringify(body) })
      if (res.ok) { setShowForm(false); loadPicklists(activeField) }
      else { const d = await res.json(); setError(d.error || 'Save failed.') }
    } catch { setError('Network error.') }
    setSaving(false)
  }

  async function handleToggle(item) {
    try {
      await fetch(`/api/cm/picklists/${item.id}`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ ...item, is_active: item.is_active ? 0 : 1 }),
      })
      loadPicklists(activeField)
    } catch { /* silent */ }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.label}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/cm/picklists/${item.id}`, { method: 'DELETE', headers: H })
      if (res.ok) loadPicklists(activeField)
      else { const d = await res.json(); alert(d.error || 'Delete failed.') }
    } catch { alert('Network error.') }
  }

  const currentFieldLabel = CM_FIELD_TYPES.find(f => f.key === activeField)?.label || activeField

  const [settingsTab, setSettingsTab] = useState('picklists')

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Content Management Settings</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Manage CM-specific picklists, org-level alert defaults, and other configurations.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 24 }}>
        {[{ key: 'picklists', label: 'Picklists' }, { key: 'alerts', label: 'Alert Defaults' }].map(st => (
          <button key={st.key} onClick={() => setSettingsTab(st.key)}
            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${settingsTab === st.key ? 'var(--primary)' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', fontSize: 13, fontWeight: settingsTab === st.key ? 700 : 500, color: settingsTab === st.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
            {st.label}
          </button>
        ))}
      </div>

      {settingsTab === 'picklists' && (<>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CM_FIELD_TYPES.map(ft => (
          <button
            key={ft.key}
            onClick={() => { setActiveField(ft.key); setShowForm(false) }}
            style={{
              padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
              background: activeField === ft.key ? 'var(--primary)' : 'var(--surface)',
              color: activeField === ft.key ? '#fff' : 'var(--text-secondary)',
              borderColor: activeField === ft.key ? 'var(--primary)' : 'var(--border)',
            }}
          >
            {ft.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{currentFieldLabel} Values</h4>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>These values appear in the "{currentFieldLabel}" dropdown in document creation.</p>
        </div>
        <button
          onClick={openAdd}
          style={{ padding: '7px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          + Add Value
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <h5 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700 }}>{editing ? 'Edit Value' : `New ${currentFieldLabel} Value`}</h5>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Value * <span style={{ textTransform: 'none', fontWeight: 400 }}>(stored)</span></label>
              <input
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.value}
                onChange={e => setForm(p => ({ ...p, value: e.target.value, label: p.label || e.target.value }))}
                placeholder="e.g. Clinical"
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Display Label</label>
              <input
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Clinical Documents"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Order</label>
              <input
                type="number"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.sort_order}
                onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 8px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{ padding: '6px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</p>
      ) : picklists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          No values yet for <strong>{currentFieldLabel}</strong>. Add your first one above.
          <br />
          <span style={{ fontSize: 12, marginTop: 4, display: 'block' }}>Until you add values here, the document creation form will show default hardcoded options.</span>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>VALUE</th>
              <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>DISPLAY LABEL</th>
              <th style={{ textAlign: 'center', padding: '7px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>ORDER</th>
              <th style={{ textAlign: 'center', padding: '7px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>STATUS</th>
              <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {picklists.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 10px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{item.value}</td>
                <td style={{ padding: '9px 10px', color: 'var(--text-primary)' }}>{item.label}</td>
                <td style={{ padding: '9px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>{item.sort_order}</td>
                <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: item.is_active ? '#e6f4ee' : '#f5f5f5',
                    color: item.is_active ? '#007a5a' : '#888',
                  }}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(item)} style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>Edit</button>
                    <button onClick={() => handleToggle(item)} style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: item.is_active ? 'var(--text-muted)' : 'var(--primary)' }}>
                      {item.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(item)} style={{ padding: '3px 9px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--danger)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </>)}

      {settingsTab === 'alerts' && (
        <CMOrgAlertsSettings token={token} />
      )}
    </div>
  )
}
