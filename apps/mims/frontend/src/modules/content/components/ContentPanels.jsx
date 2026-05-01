import toast from '../../../shared/utils/toast'
import { useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const RELATION_TYPES = ['Supports', 'Supersedes', 'Translated From', 'Referenced By']

export function AssociatedDocsPanel({ docId, token }) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [relations, setRelations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [relationType, setRelationType] = useState('Supports')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [adding, setAdding] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${docId}/relations`, { headers: H })
      if (res.ok) setRelations((await res.json()).relations || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [docId, token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function doSearch(q) {
    setSearch(q)
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await httpFetch(`/api/cm/documents?search=${encodeURIComponent(q)}&limit=10`, { headers: H })
      if (res.ok) {
        const data = await res.json()
        const docs = (data.documents || []).filter(d => d.id !== docId)
        setSearchResults(docs)
      }
    } catch { /* silent */ }
    setSearching(false)
  }

  async function handleAdd() {
    if (!selectedDoc) return
    setAdding(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${docId}/relations`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ related_doc_id: selectedDoc.id, relation_type: relationType }),
      })
      if (res.ok) { setShowSearch(false); setSelectedDoc(null); setSearch(''); setSearchResults([]); load() }
      else { const d = await res.json(); toast.error(d.error || 'Failed to link.') }
    } catch { toast.error('Network error.') }
    setAdding(false)
  }

  async function handleRemove(relId) {
    if (!await confirm('Remove this linked document?')) return
    try {
      await httpFetch(`/api/cm/documents/${docId}/relations/${relId}`, { method: 'DELETE', headers: H })
      load()
    } catch { toast.error('Network error.') }
  }

  return (
    <div style={{ padding: '4px 0', maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>Associated Documents</h4>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Linked documents appear automatically on the case form when this document is used in a response.</p>
        </div>
        <button onClick={() => setShowSearch(s => !s)} style={{ padding: '6px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Link Document
        </button>
      </div>

      {showSearch && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search Document</label>
              <input
                className="cm-form-input" style={{ margin: 0 }}
                value={search} onChange={e => doSearch(e.target.value)}
                placeholder="Type to search by name..."
                autoFocus
              />
              {searchResults.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, background: 'var(--surface)', maxHeight: 180, overflowY: 'auto' }}>
                  {searchResults.map(d => (
                    <div key={d.id} onClick={() => { setSelectedDoc(d); setSearch(d.name); setSearchResults([]) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 13, background: selectedDoc?.id === d.id ? 'var(--primary-light, #f0ebff)' : 'transparent' }}>
                      <strong>{d.name}</strong> <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.doc_id} · {d.status}</span>
                    </div>
                  ))}
                </div>
              )}
              {searching && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Searching…</p>}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Relation Type</label>
              <select className="cm-form-select" style={{ margin: 0 }} value={relationType} onChange={e => setRelationType(e.target.value)}>
                {RELATION_TYPES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={!selectedDoc || adding} style={{ padding: '6px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {adding ? 'Linking…' : 'Link'}
            </button>
            <button onClick={() => { setShowSearch(false); setSelectedDoc(null); setSearch(''); setSearchResults([]) }} style={{ padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 30 }}>Loading…</p>
      ) : relations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 20px', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          No associated documents yet. Link one above.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>DOCUMENT</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>RELATION</th>
              <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>STATUS</th>
              <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {relations.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.doc_id} · v{r.version_major}.{r.version_minor}</div>
                </td>
                <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.relation_type}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: r.status === 'Published' ? '#e6f4ee' : '#f5f5f5', color: r.status === 'Published' ? '#007a5a' : '#888' }}>{r.status}</span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <button onClick={() => handleRemove(r.id)} style={{ padding: '3px 9px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--danger)' }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function VersionDiffPanel({ docId, token }) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [v1, setV1] = useState('')
  const [v2, setV2] = useState('')
  const [diff, setDiff] = useState(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  useEffect(() => {
    setLoading(true)
    httpFetch(`/api/cm/documents/${docId}/versions?limit=20`, { headers: H })
      .then(r => r.ok ? r.json() : { versions: [] })
      .then(d => setVersions(d.versions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [docId]) // eslint-disable-line

  async function fetchDiff() {
    if (!v1 || !v2) return
    if (v1 === v2) { setDiffError('Select two different versions.'); return }
    setDiffError(''); setDiffLoading(true); setDiff(null)
    try {
      const res = await httpFetch(`/api/cm/documents/${docId}/version-diff?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`, { headers: H })
      if (res.ok) { const d = await res.json(); setDiff(d) }
      else { const d = await res.json(); setDiffError(d.error || 'Failed to load diff.') }
    } catch { setDiffError('Network error.') }
    setDiffLoading(false)
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Loading versions…</p>

  return (
    <div>
      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Version Comparison</h4>
      {versions.length < 2 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>At least 2 versions required for comparison. Save and check-in the document to create versions.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Version A</label>
              <select className="cm-form-select" style={{ width: 160 }} value={v1} onChange={e => setV1(e.target.value)}>
                <option value="">— select —</option>
                {versions.map(v => <option key={v.id} value={v.id}>{v.version} — {v.status} ({v.created_at ? new Date(v.created_at).toLocaleDateString() : ''})</option>)}
              </select>
            </div>
            <span style={{ marginTop: 16, color: 'var(--text-muted)' }}>vs</span>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Version B</label>
              <select className="cm-form-select" style={{ width: 160 }} value={v2} onChange={e => setV2(e.target.value)}>
                <option value="">— select —</option>
                {versions.map(v => <option key={v.id} value={v.id}>{v.version} — {v.status} ({v.created_at ? new Date(v.created_at).toLocaleDateString() : ''})</option>)}
              </select>
            </div>
            <button className="cm-btn cm-btn-primary cm-btn-sm" style={{ marginTop: 16 }} onClick={fetchDiff} disabled={!v1 || !v2 || diffLoading}>
              {diffLoading ? 'Loading…' : 'Compare'}
            </button>
          </div>
          {diffError && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{diffError}</p>}
          {diff && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              {[{ label: `Version A — ${diff.version_a?.version || ''}`, data: diff.version_a }, { label: `Version B — ${diff.version_b?.version || ''}`, data: diff.version_b }].map(({ label, data }) => (
                <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</div>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Status: <strong>{data?.status || '—'}</strong> &nbsp;|&nbsp; Author: <strong>{data?.author_name || '—'}</strong>
                    </div>
                    {data?.notes && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', fontStyle: 'italic' }}>{data.notes}</p>}
                    {data?.content_snapshot ? (
                      <div style={{ maxHeight: 300, overflowY: 'auto', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: 10 }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.content_snapshot || '') }} />
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No content snapshot stored for this version.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function VersionAlertsPanel({ docId, token }) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [config, setConfig] = useState({ alert_days: [], alert_email_account_id: '' })
  const [subscribers, setSubscribers] = useState([])
  const [emailAccounts, setEmailAccounts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newDay, setNewDay] = useState('')
  const [addingUser, setAddingUser] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, emailRes, usersRes] = await Promise.all([
        httpFetch(`/api/cm/documents/${docId}/alert-config`, { headers: H }),
        httpFetch('/api/admin/email-accounts', { headers: H }),
        httpFetch('/api/users', { headers: H }),
      ])
      if (cfgRes.ok) {
        const d = await cfgRes.json()
        setConfig({ alert_days: d.alert_days || [], alert_email_account_id: d.alert_email_account_id || '' })
        setSubscribers(d.subscribers || [])
      }
      if (emailRes.ok) setEmailAccounts((await emailRes.json()).accounts || [])
      if (usersRes.ok) setUsers(await usersRes.json())
    } catch { /* silent */ }
    setLoading(false)
  }, [docId, token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  function addDay() {
    const d = Number(newDay)
    if (!d || d < 1) return
    if (config.alert_days.includes(d)) return
    setConfig(p => ({ ...p, alert_days: [...p.alert_days, d].sort((a, b) => a - b) }))
    setNewDay('')
  }

  function removeDay(d) {
    setConfig(p => ({ ...p, alert_days: p.alert_days.filter(x => x !== d) }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${docId}/alert-config`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ alert_days: config.alert_days, alert_email_account_id: config.alert_email_account_id || null }),
      })
      if (!res.ok) { const d = await res.json(); toast.error(d.error || 'Save failed.') }
    } catch { toast.error('Network error.') }
    setSaving(false)
  }

  async function addSubscriber() {
    if (!selectedUser) return
    setAddingUser(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${docId}/alert-subs`, {
        method: 'POST', headers: H, body: JSON.stringify({ user_id: Number(selectedUser) }),
      })
      if (res.ok) { setSelectedUser(''); load() }
      else { const d = await res.json(); toast.error(d.error || 'Failed.') }
    } catch { toast.error('Network error.') }
    setAddingUser(false)
  }

  async function removeSub(subId) {
    try {
      await httpFetch(`/api/cm/documents/${docId}/alert-subs/${subId}`, { method: 'DELETE', headers: H })
      load()
    } catch { toast.error('Network error.') }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</p>

  const subscribedIds = new Set(subscribers.map(s => s.user_id))

  return (
    <div style={{ padding: '4px 0', maxWidth: 700 }}>
      <div className="cm-form-group">
        <label className="cm-form-label">Alert Days Before Expiry</label>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>Configure how many days before expiry to send alerts. Day 1 always fires regardless.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {(config.alert_days || []).length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No custom days set — only the mandatory 1-day alert will fire.</span>
          )}
          {(config.alert_days || []).map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'var(--primary-light, #f0ebff)', border: '1px solid var(--primary)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
              {d} day{d !== 1 ? 's' : ''}
              <button onClick={() => removeDay(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="number" min="1" className="cm-form-input" style={{ margin: 0, width: 100 }} placeholder="Days" value={newDay} onChange={e => setNewDay(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDay()} />
          <button onClick={addDay} style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', fontSize: 13 }}>+ Add</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {[7, 14, 30, 60, 90].map(preset => (
            <button key={preset} onClick={() => { if (!config.alert_days.includes(preset)) setConfig(p => ({ ...p, alert_days: [...p.alert_days, preset].sort((a,b)=>a-b) })) }}
              style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 20, background: config.alert_days.includes(preset) ? 'var(--border)' : 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              {preset}d
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Quick presets</span>
        </div>
      </div>

      <div className="cm-form-group">
        <label className="cm-form-label">Alert Email Account (SMTP)</label>
        <select className="cm-form-select" value={config.alert_email_account_id || ''} onChange={e => setConfig(p => ({ ...p, alert_email_account_id: e.target.value }))}>
          <option value="">— Use org default —</option>
          {emailAccounts.map(ea => (
            <option key={ea.id} value={ea.id}>{ea.name || ea.email_address} ({ea.smtp_host})</option>
          ))}
        </select>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>If not set, the org-level default SMTP account will be used (configured in CM Settings → Alerts).</p>
      </div>

      <button onClick={handleSave} disabled={saving} style={{ padding: '7px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 24 }}>
        {saving ? 'Saving…' : 'Save Alert Config'}
      </button>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700 }}>Alert Subscribers</h4>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>These users will receive email alerts when expiry thresholds are hit.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select className="cm-form-select" style={{ margin: 0, flex: 1 }} value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">— Select a user —</option>
            {users.filter(u => !subscribedIds.has(u.id)).map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
          <button onClick={addSubscriber} disabled={!selectedUser || addingUser} style={{ padding: '6px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {addingUser ? 'Adding…' : '+ Add'}
          </button>
        </div>
        {subscribers.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No subscribers yet. Add users above to notify them on expiry alerts.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subscribers.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{s.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{s.email}</span>
                </div>
                <button onClick={() => removeSub(s.id)} style={{ padding: '3px 9px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--danger)' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
