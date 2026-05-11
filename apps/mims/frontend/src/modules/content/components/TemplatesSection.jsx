import { useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import toast from '../../../shared/utils/toast'
import StatusBadge from './StatusBadge'
import RichTextEditor from './RichTextEditor'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function TemplateDrawer({ template, token, folders, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!template?.id
  const [form, setForm] = useState({
    type: template?.type || 'Response',
    name: template?.name || '',
    subject: template?.subject || '',
    body: template?.body || '',
    status: template?.status || 'Active',
    folder_id: template?.folder_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')
  const [caseResults, setCaseResults] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [caseSearching, setCaseSearching] = useState(false)

  useEffect(() => {
    if (caseSearch.trim().length < 2) { setCaseResults([]); return }
    const timer = setTimeout(async () => {
      setCaseSearching(true)
      try {
        const r = await httpFetch(`/api/cm/templates/case-search?q=${encodeURIComponent(caseSearch)}`, { headers: authHeaders })
        if (r.ok) setCaseResults((await r.json()).cases || [])
      } catch { /* silent */ }
      setCaseSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [caseSearch]) // eslint-disable-line

  async function handleSave() {
    if (!form.name.trim()) return toast.warn('Template name is required.')
    if (!form.body || form.body === '<p></p>') return toast.warn('Body is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/templates/${template.id}` : '/api/cm/templates'
      const method = isEdit ? 'PUT' : 'POST'
      const payload = { ...form, folder_id: form.folder_id ? Number(form.folder_id) : null }
      const res = await httpFetch(url, { method, headers: authHeaders, body: JSON.stringify(payload) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); toast.error(d.error || 'Save failed.') }
    } catch { toast.error('Network error.') }
    setSaving(false)
  }

  async function handlePreview() {
    if (!template?.id) return toast.warn('Save the template first before previewing.')
    setPreviewLoading(true)
    try {
      const res = await httpFetch(`/api/cm/templates/${template.id}/render`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ case_id: selectedCase ? selectedCase.id : null }),
      })
      const d = await res.json()
      if (res.ok) setPreview(d)
      else toast.error(d.error || 'Preview failed.')
    } catch { toast.error('Network error.') }
    setPreviewLoading(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${template.name}` : 'New Template'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>×</button>
        </div>
        <div className="cm-drawer-body">
          <div className="cm-form-group">
            <label className="cm-form-label">Template Type <span className="required">*</span></label>
            <select className="cm-form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option>Response</option>
              <option>Transmission</option>
              <option>Correspondence</option>
              <option>Email</option>
              <option>Acknowledgment</option>
            </select>
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Folder</label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— No folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Template Name <span className="required">*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter template name" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Subject</label>
            <input className="cm-form-input" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email or document subject" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Body <span className="required">*</span></label>
            <RichTextEditor value={form.body} onChange={v => setForm(p => ({ ...p, body: v }))} />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Status</label>
            <div style={{ display: 'flex', gap: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="tstatus" value="Active" checked={form.status === 'Active'} onChange={() => setForm(p => ({ ...p, status: 'Active' }))} />
                Active
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="tstatus" value="Inactive" checked={form.status === 'Inactive'} onChange={() => setForm(p => ({ ...p, status: 'Inactive' }))} />
                Inactive
              </label>
            </div>
          </div>
        </div>
        {isEdit && (
          <div style={{ padding: '0 24px 16px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '12px 0 8px', fontWeight: 600 }}>MERGE FIELD PREVIEW</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
              Supported fields: {'{{case_number}} {{case_type}} {{patient_name}} {{patient_email}} {{product_name}} {{agent_name}} {{org_name}} {{date}}'}
            </p>
            <div style={{ marginBottom: 8 }}>
              <div style={{ position: 'relative' }}>
                <input
                  className="cm-form-input"
                  placeholder={selectedCase ? `Case: ${selectedCase.case_number}` : 'Search case by number or patient name…'}
                  value={selectedCase ? '' : caseSearch}
                  onChange={e => { setSelectedCase(null); setCaseSearch(e.target.value) }}
                  style={{ width: '100%' }}
                />
                {selectedCase && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, padding: '4px 8px', background: 'var(--primary-light, #f0f4ff)', borderRadius: 4, fontSize: 12 }}>
                    <span><strong>{selectedCase.case_number}</strong>{selectedCase.patient_name ? ` — ${selectedCase.patient_name}` : ''}</span>
                    <button onClick={() => { setSelectedCase(null); setCaseSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>✕</button>
                  </div>
                )}
                {!selectedCase && caseSearch.length >= 2 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 4, zIndex: 10, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}>
                    {caseSearching ? (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Searching…</div>
                    ) : caseResults.length === 0 ? (
                      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No cases found.</div>
                    ) : caseResults.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCase(c); setCaseSearch(''); setCaseResults([]) }}
                        style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light, #f0f4ff)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontWeight: 600 }}>{c.case_number}</span>
                        {c.patient_name && <span style={{ color: 'var(--text-muted)' }}>{c.patient_name}</span>}
                        {c.case_type && <span style={{ color: 'var(--text-muted)' }}>({c.case_type})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="cm-btn cm-btn-secondary" onClick={handlePreview} disabled={previewLoading}>
                {previewLoading ? 'Rendering…' : 'Preview with Case Data'}
              </button>
              {preview && <button className="cm-btn cm-btn-secondary" onClick={() => setPreview(null)}>✕ Clear</button>}
            </div>
            {preview && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, background: 'var(--surface-raised)', fontSize: 13 }}>
                {preview.rendered_subject && (
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Subject: {preview.rendered_subject}</p>
                )}
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.rendered_body || '') }} />
              </div>
            )}
          </div>
        )}
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </>
  )
}

export default function TemplatesSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: '', status: '', folder_id: '' })
  const [folders, setFolders] = useState([])
  const [showDrawer, setShowDrawer] = useState(false)
  const [editTemplate, setEditTemplate] = useState(null)

  useEffect(() => {
    httpFetch('/api/cm/folders', { headers: authHeaders })
      .then(r => r.json())
      .then(d => setFolders(d.folders || []))
      .catch(() => {})
  }, [token]) // eslint-disable-line

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await httpFetch(`/api/cm/templates?${params}`, { headers: authHeaders })
      if (res.ok) setTemplates((await res.json()).templates || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function toggleStatus(t) {
    const newStatus = t.status === 'Active' ? 'Inactive' : 'Active'
    try {
      const res = await httpFetch(`/api/cm/templates/${t.id}/status`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) load()
      else { const d = await res.json(); toast.error(d.error || 'Failed to update status.') }
    } catch { toast.error('Network error.') }
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Templates</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditTemplate(null); setShowDrawer(true) }}>+ New Template</button>
      </div>
      <div className="cm-filters">
        <select className="cm-form-select" style={{ width: 180 }} value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
          <option value="">All Types</option>
          <option>Response</option>
          <option>Transmission</option>
          <option>Correspondence</option>
          <option>Email</option>
          <option>Acknowledgment</option>
        </select>
        <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <select className="cm-form-select" style={{ width: 180 }} value={filters.folder_id} onChange={e => setFilters(p => ({ ...p, folder_id: e.target.value }))}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button className="cm-btn cm-btn-secondary" onClick={load}>Filter</button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📝</div><p>No templates found. Create your first template!</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Folder</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td>{t.type}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{folders.find(f => f.id === t.folder_id)?.name || '—'}</td>
                <td style={{ color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || '—'}</td>
                <td><StatusBadge status={t.status || 'Active'} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="cm-action-btns">
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditTemplate(t); setShowDrawer(true) }}>Edit</button>
                    <button className={`cm-btn cm-btn-sm ${t.status === 'Active' ? 'cm-btn-danger' : 'cm-btn-primary'}`} onClick={() => toggleStatus(t)}>
                      {t.status === 'Active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showDrawer && (
        <TemplateDrawer template={editTemplate} token={token} folders={folders} onClose={() => { setShowDrawer(false); setEditTemplate(null) }} onSaved={load} />
      )}
    </div>
  )
}
