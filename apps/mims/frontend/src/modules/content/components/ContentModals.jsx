import { useState, useEffect } from 'react'
import toast from '../../../shared/utils/toast'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export function CheckInModal({ item, onClose, onConfirm, loading }) {
  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Check In Document</h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Check in <strong>"{item?.name || item?.question || item?.title}"</strong>?<br />
          This will move it to <strong>Pending</strong> status.
        </p>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={onConfirm} disabled={loading}>{loading ? 'Checking in…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

export function InitiateReviewModal({ doc, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ title: '', planned_end_date: '', non_amendable: false, reviewers: [], description: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    httpFetch('/api/admin/users', { headers: authHeaders })
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(Array.isArray(d) ? d : d.users || []))
      .catch(() => {})
  }, []) // eslint-disable-line

  function toggleReviewer(id) {
    setForm(p => ({
      ...p,
      reviewers: p.reviewers.includes(id) ? p.reviewers.filter(r => r !== id) : [...p.reviewers, id]
    }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) return toast.warn('Review title is required.')
    if (!form.planned_end_date) return toast.warn('Planned end date is required.')
    if (!form.reviewers.length) return toast.warn('Select at least one reviewer.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/initiate-review`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Failed to initiate review.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 560 }}>
        <h3 className="cm-modal-title">Initiate Review — {doc.name}</h3>
        <div className="cm-form-group">
          <label className="cm-form-label">Review Title <span className="required">*</span></label>
          <input className="cm-form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Planned End Date <span className="required">*</span></label>
          <input type="date" className="cm-form-input" value={form.planned_end_date} onChange={e => setForm(p => ({ ...p, planned_end_date: e.target.value }))} />
        </div>
        <div className="cm-form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.non_amendable} onChange={e => setForm(p => ({ ...p, non_amendable: e.target.checked }))} />
            Non-Amendable
          </label>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reviewers <span className="required">*</span></label>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 160, overflowY: 'auto', padding: 8 }}>
            {users.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading users…</p> : users.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={form.reviewers.includes(u.id)} onChange={() => toggleReviewer(u.id)} />
                {u.name} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({u.email})</span>
              </label>
            ))}
          </div>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Description</label>
          <textarea className="cm-form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Starting…' : 'Start Review'}</button>
        </div>
      </div>
    </div>
  )
}

export function ApproveModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return toast.warn('Password is required.')
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/approve`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Approval failed.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Approve Document</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Approving: <strong>{doc.name}</strong></p>
        <div className="cm-form-group">
          <label className="cm-form-label">User ID</label>
          <input className="cm-form-input" value={user?.email || user?.username || ''} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Password <span className="required">*</span></label>
          <input type="password" className="cm-form-input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your password" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason for Approval <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="State the reason for approval…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Approving…' : 'Approve'}</button>
        </div>
      </div>
    </div>
  )
}

export function PublishModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', org_version: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return toast.warn('Password is required.')
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/publish`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Publish failed.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Publish Document</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Publishing: <strong>{doc.name}</strong></p>
        <div className="cm-form-group">
          <label className="cm-form-label">User ID</label>
          <input className="cm-form-input" value={user?.email || user?.username || ''} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Password <span className="required">*</span></label>
          <input type="password" className="cm-form-input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your password" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">System Version</label>
          <input className="cm-form-input" value={doc.version || '1.0'} readOnly style={{ background: 'var(--bg)' }} />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Org Version</label>
          <input className="cm-form-input" value={form.org_version} onChange={e => setForm(p => ({ ...p, org_version: e.target.value }))} placeholder="Optional (e.g. v2.1-CORP)" />
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason for Publishing <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="State the reason for publishing…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>
    </div>
  )
}

export function ReviewStatusModal({ review, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ status: 'Ongoing', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.reason.trim()) return toast.warn('Reason is required.')
    setLoading(true)
    try {
      const res = await httpFetch(`/api/cm/reviews/${review.id}/reviewer-status`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Failed to update status.') }
    } catch { toast.error('Network error.') }
    setLoading(false)
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal">
        <h3 className="cm-modal-title">Update Review Status</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{review.document_name} — {review.title}</p>
        <div className="cm-form-group">
          <label className="cm-form-label">Status <span className="required">*</span></label>
          <select className="cm-form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
            <option>Ongoing</option>
            <option>Accepted</option>
            <option>Accepted with Changes</option>
            <option>Declined</option>
            <option>Rejected</option>
          </select>
        </div>
        <div className="cm-form-group">
          <label className="cm-form-label">Reason <span className="required">*</span></label>
          <textarea className="cm-form-textarea" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Provide your reason…" />
        </div>
        <div className="cm-modal-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSubmit} disabled={loading}>{loading ? 'Submitting…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}

// ── #9 / #14 / #22: Version History Modal (documents and templates) ──────────
export function VersionHistoryModal({ entityType, entityId, entityName, token, onClose }) {
  const authHeaders = { Authorization: `Bearer ${token}` }
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = entityType === 'template'
      ? `/api/cm/templates/${entityId}/versions`
      : `/api/cm/documents/${entityId}/versions`
    httpFetch(url, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setVersions(d.versions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [entityId, entityType]) // eslint-disable-line

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 620 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="cm-modal-title" style={{ margin: 0 }}>Version History — {entityName}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</p>
        ) : versions.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No version history yet.</p>
        ) : (
          <div style={{ maxHeight: 440, overflowY: 'auto' }}>
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Author</th>
                  <th>Notes</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {versions.map(v => (
                  <tr key={v.id}>
                    <td><strong>v{v.version}</strong></td>
                    <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--primary-light,#f0f4ff)', color: 'var(--primary)' }}>{v.status}</span></td>
                    <td style={{ fontSize: 12 }}>{v.author_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>{v.notes || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cm-modal-footer" style={{ marginTop: 16 }}>
          <button className="cm-btn cm-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── #16: Content Usage Analytics Modal ───────────────────────────────────────
export function ContentUsageModal({ contentType, contentId, contentName, token, onClose }) {
  const authHeaders = { Authorization: `Bearer ${token}` }
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    httpFetch(`/api/cm/content-usage/${contentType}/${contentId}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [contentType, contentId]) // eslint-disable-line

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="cm-modal-title" style={{ margin: 0 }}>Usage Analytics — {contentName}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</p>
        ) : !data ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No usage data found.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {[
                { label: 'Total Uses', value: data.total ?? (data.usage || []).length },
                { label: 'Unique Cases', value: new Set((data.usage || []).map(u => u.case_id)).size },
                { label: 'Last Used', value: (data.usage || [])[0]?.used_at ? new Date((data.usage || [])[0].used_at).toLocaleDateString() : '—' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: 12, background: 'var(--surface-raised)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {(data.usage || []).length > 0 && (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <table className="cm-table">
                  <thead><tr><th>Case</th><th>Used At</th><th>Agent</th></tr></thead>
                  <tbody>
                    {(data.usage || []).map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{u.case_number || u.case_id || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.used_at ? new Date(u.used_at).toLocaleDateString() : '—'}</td>
                        <td style={{ fontSize: 12 }}>{u.used_by_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div className="cm-modal-footer" style={{ marginTop: 16 }}>
          <button className="cm-btn cm-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── #20: Module Usage Modal (upgrade from toast) ──────────────────────────────
export function ModuleUsageModal({ module: mod, token, onClose }) {
  const authHeaders = { Authorization: `Bearer ${token}` }
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    httpFetch(`/api/cm/documents/module-usage/${mod.id}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setDocs(d.linked_documents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [mod.id]) // eslint-disable-line

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="cm-modal-title" style={{ margin: 0 }}>Module Usage — {mod.name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</p>
        ) : docs.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>This module is not linked to any documents.</p>
        ) : (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>Used in {docs.length} document{docs.length !== 1 ? 's' : ''}:</p>
            <table className="cm-table">
              <thead><tr><th>Document</th><th>Type</th><th>Status</th><th>Version</th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td style={{ fontSize: 12 }}>{d.doc_type || '—'}</td>
                    <td style={{ fontSize: 12 }}>{d.status || '—'}</td>
                    <td style={{ fontSize: 12 }}>v{d.version_major ?? 1}.{d.version_minor ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cm-modal-footer" style={{ marginTop: 16 }}>
          <button className="cm-btn cm-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── #6: Document Relations Modal ──────────────────────────────────────────────
export function DocumentRelationsModal({ doc, token, onClose }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const authHeadersGet = { Authorization: `Bearer ${token}` }
  const [relations, setRelations] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    httpFetch(`/api/cm/documents/${doc.id}/relations`, { headers: authHeadersGet })
      .then(r => r.json())
      .then(d => setRelations(d.relations || d.related || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [doc.id]) // eslint-disable-line

  useEffect(() => {
    if (search.trim().length < 2) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await httpFetch(`/api/cm/documents?search=${encodeURIComponent(search)}&limit=20`, { headers: authHeadersGet })
        const d = await r.json()
        setSearchResults((d.documents || []).filter(x => x.id !== doc.id))
      } catch { /* silent */ }
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line

  async function linkDoc(related) {
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/relations`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ related_document_id: related.id })
      })
      if (res.ok) {
        setRelations(p => [...p, related])
        setSearch('')
        setSearchResults([])
        toast.success(`Linked: ${related.name}`)
      } else { const d = await res.json(); toast.error(d.error || 'Link failed.') }
    } catch { toast.error('Network error.') }
  }

  async function removeRelation(relatedId) {
    try {
      await httpFetch(`/api/cm/documents/${doc.id}/relations/${relatedId}`, { method: 'DELETE', headers: authHeadersGet })
      setRelations(p => p.filter(r => r.id !== relatedId))
    } catch { toast.error('Network error.') }
  }

  return (
    <div className="cm-modal-overlay">
      <div className="cm-modal" style={{ width: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 className="cm-modal-title" style={{ margin: 0 }}>Document Relations — {doc.name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>×</button>
        </div>
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <input className="cm-form-input" placeholder="Search documents to link…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          {(searching || searchResults.length > 0) && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
              {searching ? (
                <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Searching…</div>
              ) : searchResults.map(r => (
                <div key={r.id}
                  onClick={() => linkDoc(r)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light,#f0f4ff)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>Loading…</p>
        ) : relations.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 13 }}>No related documents. Search above to link one.</p>
        ) : (
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {relations.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{r.status}</span>
                </div>
                <button onClick={() => removeRelation(r.id)} className="cm-btn cm-btn-danger cm-btn-sm">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="cm-modal-footer" style={{ marginTop: 16 }}>
          <button className="cm-btn cm-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
