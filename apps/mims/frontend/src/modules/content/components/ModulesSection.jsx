import { useState, useEffect, useCallback, useRef } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import StatusBadge from './StatusBadge'
import RichTextEditor from './RichTextEditor'

function ModuleDrawer({ moduleDoc, folders, token, onClose, onSaved }) {
  const isEdit = !!moduleDoc?.id
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [contentMode, setContentMode] = useState(moduleDoc?.content_html ? 'online' : 'upload')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    folder_id: moduleDoc?.folder_id || '',
    module_type: moduleDoc?.module_type || 'SRD',
    name: moduleDoc?.name || '',
    status: moduleDoc?.status || 'Draft',
    content_html: moduleDoc?.content_html || '',
    activation_date: moduleDoc?.activation_date ? moduleDoc.activation_date.slice(0, 10) : '',
    expiry_date: moduleDoc?.expiry_date ? moduleDoc.expiry_date.slice(0, 10) : '',
    language: moduleDoc?.language || 'en',
    search_tags: moduleDoc?.search_tags || '',
    usage_instructions: moduleDoc?.usage_instructions || '',
    document_category: moduleDoc?.document_category || '',
    standard_response_text: moduleDoc?.standard_response_text || '',
    publish_as_pdf: !!moduleDoc?.publish_as_pdf,
    send_as_pdf: !!moduleDoc?.send_as_pdf,
  })

  async function handleSave() {
    if (!form.folder_id) return toast.warn('Folder is required.')
    if (!form.name.trim()) return toast.warn('Module name is required.')
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== null && v !== undefined) fd.append(k, v)
      })
      if (file) fd.append('file', file)

      const url = isEdit ? `/api/cm/modules/${moduleDoc.id}` : '/api/cm/modules'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        onSaved()
        onClose()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Save failed.')
      }
    } catch {
      toast.error('Network error.')
    }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit Module — ${moduleDoc.name}` : 'New Modular Document'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>×</button>
        </div>
        <div className="cm-drawer-body">
          <div className="cm-form-group">
            <label className="cm-form-label">Folder <span className="required">*</span></label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— Select Folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="cm-form-group">
              <label className="cm-form-label">Module Type</label>
              <select className="cm-form-select" value={form.module_type} onChange={e => setForm(p => ({ ...p, module_type: e.target.value }))}>
                <option>SRD</option>
                <option>Enclosure</option>
                <option>Information Document</option>
                <option>Internal Document</option>
              </select>
            </div>
            <div className="cm-form-group">
              <label className="cm-form-label">Status</label>
              <select className="cm-form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option>Draft</option>
                <option>Pending</option>
                <option>Under Review</option>
                <option>Approved</option>
                <option>Published</option>
                <option>Archived</option>
              </select>
            </div>
          </div>

          <div className="cm-form-group">
            <label className="cm-form-label">Module Name <span className="required">*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter module name" />
          </div>

          <div className="cm-form-group">
            <label className="cm-form-label">Response Text</label>
            <textarea className="cm-form-textarea" rows={2} value={form.standard_response_text} onChange={e => setForm(p => ({ ...p, standard_response_text: e.target.value }))} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" className={`cm-btn cm-btn-sm ${contentMode === 'upload' ? 'cm-btn-primary' : 'cm-btn-secondary'}`} onClick={() => { setContentMode('upload'); fileInputRef.current?.click() }}>Upload File</button>
            <button type="button" className={`cm-btn cm-btn-sm ${contentMode === 'online' ? 'cm-btn-primary' : 'cm-btn-secondary'}`} onClick={() => setContentMode('online')}>Author Online</button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>

          {contentMode === 'upload' && (
            <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
              {file ? `Selected: ${file.name}` : (moduleDoc?.file_name ? `Existing file: ${moduleDoc.file_name}` : 'No file selected')}
            </div>
          )}
          {contentMode === 'online' && (
            <div className="cm-form-group">
              <label className="cm-form-label">Module Content</label>
              <RichTextEditor value={form.content_html} onChange={v => setForm(p => ({ ...p, content_html: v }))} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="cm-form-group">
              <label className="cm-form-label">Activation Date</label>
              <input type="date" className="cm-form-input" value={form.activation_date} onChange={e => setForm(p => ({ ...p, activation_date: e.target.value }))} />
            </div>
            <div className="cm-form-group">
              <label className="cm-form-label">Expiry Date</label>
              <input type="date" className="cm-form-input" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
          </div>

          <div className="cm-form-group">
            <label className="cm-form-label">Search Tags</label>
            <input className="cm-form-input" value={form.search_tags} onChange={e => setForm(p => ({ ...p, search_tags: e.target.value }))} placeholder="comma-separated tags" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Usage Instructions</label>
            <textarea className="cm-form-textarea" rows={2} value={form.usage_instructions} onChange={e => setForm(p => ({ ...p, usage_instructions: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.publish_as_pdf} onChange={e => setForm(p => ({ ...p, publish_as_pdf: e.target.checked }))} />
              Publish as PDF
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={form.send_as_pdf} onChange={e => setForm(p => ({ ...p, send_as_pdf: e.target.checked }))} />
              Send as PDF
            </label>
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Update Module' : 'Create Module')}</button>
        </div>
      </div>
    </>
  )
}

export default function ModulesSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [modules, setModules] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', status: '', search: '' })
  const [showDrawer, setShowDrawer] = useState(false)
  const [editModule, setEditModule] = useState(null)

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/cm/folders', { headers: authHeaders })
      if (res.ok) setFolders((await res.json()).folders || [])
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadModules = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/cm/modules?${params}`, { headers: authHeaders })
      if (res.ok) setModules((await res.json()).modules || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters]) // eslint-disable-line

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { loadModules() }, [loadModules])

  async function handleArchive(moduleDoc) {
    if (!await confirm(`Archive module "${moduleDoc.name}"? Linked documents using this module will also be archived.`)) return
    try {
      const res = await fetch(`/api/cm/modules/${moduleDoc.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) {
        const d = await res.json()
        if (d.archived_linked_documents > 0) {
          toast.info(`Module archived. ${d.archived_linked_documents} linked document(s) were auto-archived.`)
        }
        loadModules()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Archive failed.')
      }
    } catch {
      toast.error('Network error.')
    }
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Modular Documents</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditModule(null); setShowDrawer(true) }}>+ New Module</button>
      </div>

      <div className="cm-filters">
        <select className="cm-form-select" style={{ width: 180 }} value={filters.folder_id} onChange={e => setFilters(p => ({ ...p, folder_id: e.target.value }))}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="cm-form-select" style={{ width: 180 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Draft</option>
          <option>Pending</option>
          <option>Under Review</option>
          <option>Approved</option>
          <option>Published</option>
          <option>Archived</option>
        </select>
        <input className="cm-form-input" style={{ width: 250 }} value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search by module name, ID, tags…" />
        <button className="cm-btn cm-btn-secondary" onClick={loadModules}>Filter</button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading modules…</p>
      ) : modules.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">🧩</div><p>No modular documents yet. Create your first module.</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th>Module ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Folder</th>
              <th>Version</th>
              <th>Status</th>
              <th>Expiry</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {modules.map(m => (
              <tr key={m.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{m.module_id || `MOD-${m.id}`}</td>
                <td style={{ fontWeight: 500 }}>{m.name}</td>
                <td>{m.module_type || 'SRD'}</td>
                <td>{m.folder_name || '—'}</td>
                <td style={{ textAlign: 'center' }}>{m.version_major || 1}.{m.version_minor || 0}</td>
                <td><StatusBadge status={m.status} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.expiry_date ? new Date(m.expiry_date).toLocaleDateString() : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.updated_at ? new Date(m.updated_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="cm-action-btns">
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditModule(m); setShowDrawer(true) }}>Edit</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={async () => {
                      try {
                        const res = await fetch(`/api/cm/documents/module-usage/${m.id}`, { headers: authHeaders })
                        if (res.ok) {
                          const d = await res.json()
                          const names = d.linked_documents.map(doc => `• ${doc.name} (${doc.status})`).join('\n') || 'No documents linked.'
                          toast.info(`Module "${m.name}" — Used in ${d.count} document(s):\n\n${names}`)
                        }
                      } catch { /* silent */ }
                    }}>Usage</button>
                    {m.status !== 'Archived' && (
                      <button className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(m)}>Archive</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showDrawer && (
        <ModuleDrawer
          moduleDoc={editModule}
          folders={folders}
          token={token}
          onClose={() => { setShowDrawer(false); setEditModule(null) }}
          onSaved={loadModules}
        />
      )}
    </div>
  )
}
