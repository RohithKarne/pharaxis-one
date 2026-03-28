import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

// ─── Rich Text Editor ────────────────────────────────────────────────────────

function RichTextEditor({ value, onChange, placeholder }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'cm-editor-prosemirror' },
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value]) // eslint-disable-line

  if (!editor) return null

  return (
    <div className="cm-editor-wrapper">
      <div className="cm-editor-toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'active' : ''} title="Bold">B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'active' : ''} title="Italic"><em>I</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'active' : ''} title="Underline"><u>U</u></button>
        <span className="cm-toolbar-sep">|</span>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'active' : ''}>H1</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}>H3</button>
        <span className="cm-toolbar-sep">|</span>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'active' : ''}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'active' : ''}>1. List</button>
      </div>
      <EditorContent editor={editor} className="cm-editor-content" />
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    Draft: 'draft',
    Pending: 'pending',
    'Under Review': 'review',
    Approved: 'approved',
    Published: 'published',
    Archived: 'archived',
    Active: 'approved',
    Inactive: 'archived',
  }
  const cls = map[status] || 'draft'
  return <span className={`cm-status-badge cm-status-${cls}`}>{status}</span>
}

// ─── Folder Manager ───────────────────────────────────────────────────────────

function FolderManager({ show, onClose, token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [folders, setFolders] = useState([])
  const [products, setProducts] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editFolder, setEditFolder] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', product_id: '', site_id: '', description: '', status: 'Active' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fRes, pRes, sRes] = await Promise.all([
        fetch('/api/cm/folders', { headers: authHeaders }),
        fetch('/api/admin/products-full', { headers: authHeaders }),
        fetch('/api/admin/sites', { headers: authHeaders }),
      ])
      if (fRes.ok) setFolders((await fRes.json()).folders || [])
      if (pRes.ok) setProducts((await pRes.json()).products || [])
      if (sRes.ok) setSites((await sRes.json()).sites || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token]) // eslint-disable-line

  useEffect(() => { if (show) load() }, [show, load])

  function openAdd() {
    setEditFolder(null)
    setForm({ name: '', product_id: '', site_id: '', description: '', status: 'Active' })
    setShowForm(true)
  }

  function openEdit(f) {
    setEditFolder(f)
    setForm({ name: f.name, product_id: f.product_id || '', site_id: f.site_id || '', description: f.description || '', status: f.status || 'Active' })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Folder name is required.')
    setSaving(true)
    try {
      const url = editFolder ? `/api/cm/folders/${editFolder.id}` : '/api/cm/folders'
      const method = editFolder ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(form) })
      if (res.ok) { setShowForm(false); load() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  if (!show) return null

  return (
    <div className="cm-modal-overlay" onClick={onClose}>
      <div className="cm-modal" style={{ width: 700, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 className="cm-modal-title" style={{ margin: 0 }}>Manage Folders</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={openAdd}>+ Add Folder</button>
            <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {showForm && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>{editFolder ? 'Edit Folder' : 'New Folder'}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Name <span className="required">*</span></label>
                <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Folder name" />
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Status</label>
                <select className="cm-form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Product</label>
                <select className="cm-form-select" value={form.product_id} onChange={e => setForm(p => ({ ...p, product_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Site</label>
                <select className="cm-form-select" value={form.site_id} onChange={e => setForm(p => ({ ...p, site_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="cm-form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                <label className="cm-form-label">Description</label>
                <textarea className="cm-form-textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Loading folders…</p>
        ) : folders.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📁</div><p>No folders yet. Create one above.</p></div>
        ) : (
          <table className="cm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Product</th>
                <th>Site</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {folders.map(f => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>{f.name}</td>
                  <td>{f.product_name || '—'}</td>
                  <td>{f.site_name || '—'}</td>
                  <td><StatusBadge status={f.status || 'Active'} /></td>
                  <td>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => openEdit(f)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Check-In Confirm Modal ───────────────────────────────────────────────────

function CheckInModal({ item, onClose, onConfirm, loading }) {
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

// ─── Initiate Review Modal ────────────────────────────────────────────────────

function InitiateReviewModal({ doc, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ title: '', planned_end_date: '', non_amendable: false, reviewers: [], description: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users', { headers: authHeaders })
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
    if (!form.title.trim()) return alert('Review title is required.')
    if (!form.planned_end_date) return alert('Planned end date is required.')
    if (!form.reviewers.length) return alert('Select at least one reviewer.')
    setLoading(true)
    try {
      const res = await fetch(`/api/cm/documents/${doc.id}/initiate-review`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Failed to initiate review.') }
    } catch { alert('Network error.') }
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

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return alert('Password is required.')
    if (!form.reason.trim()) return alert('Reason is required.')
    setLoading(true)
    try {
      const res = await fetch(`/api/cm/documents/${doc.id}/approve`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Approval failed.') }
    } catch { alert('Network error.') }
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

// ─── Publish Modal ────────────────────────────────────────────────────────────

function PublishModal({ doc, user, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ password: '', org_version: '', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.password) return alert('Password is required.')
    if (!form.reason.trim()) return alert('Reason is required.')
    setLoading(true)
    try {
      const res = await fetch(`/api/cm/documents/${doc.id}/publish`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Publish failed.') }
    } catch { alert('Network error.') }
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

// ─── Review Status Modal ──────────────────────────────────────────────────────

function ReviewStatusModal({ review, token, onClose, onDone }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [form, setForm] = useState({ status: 'Ongoing', reason: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!form.reason.trim()) return alert('Reason is required.')
    setLoading(true)
    try {
      const res = await fetch(`/api/cm/reviews/${review.id}/reviewer-status`, {
        method: 'PUT', headers: authHeaders, body: JSON.stringify(form)
      })
      if (res.ok) { onDone(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Failed to update status.') }
    } catch { alert('Network error.') }
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

// ─── Document Drawer ──────────────────────────────────────────────────────────

function DocumentDrawer({ doc, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!doc?.id
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    folder_id: doc?.folder_id || '',
    doc_type: doc?.doc_type || 'SRD',
    name: doc?.name || '',
    content_type: 'online',
    content: doc?.content || '',
    expiry_date: doc?.expiry_date || '',
    activation_date: doc?.activation_date || '',
    language: doc?.language || 'English',
    search_tags: doc?.search_tags || '',
    product_specific: doc?.product_specific || false,
    site_specific: doc?.site_specific || false,
    usage_instructions: doc?.usage_instructions || '',
  })
  const [file, setFile] = useState(null)
  const [contentTab, setContentTab] = useState('online')
  const [attrOpen, setAttrOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleFile(e) {
    const f = e.target.files[0]
    if (f) { setFile(f); setContentTab('file') }
  }

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.name.trim()) return alert('Document name is required.')
    setSaving(true)
    try {
      let body
      let headers
      if (contentTab === 'file' && file) {
        const fd = new FormData()
        Object.entries(form).forEach(([k, v]) => fd.append(k, v))
        fd.append('file', file)
        if (checkIn) fd.append('check_in', '1')
        headers = { Authorization: `Bearer ${token}` }
        body = fd
      } else {
        headers = authHeaders
        body = JSON.stringify({ ...form, check_in: checkIn })
      }

      const url = isEdit ? `/api/cm/documents/${doc.id}` : '/api/cm/documents'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers, body })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${doc.name}` : 'New Document'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>×</button>
        </div>
        <div className="cm-drawer-body">
          {/* Basic Info */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Basic Info</h4>
            <div className="cm-form-group">
              <label className="cm-form-label">Folder <span className="required">*</span></label>
              <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
                <option value="">— Select Folder —</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="cm-form-group">
              <label className="cm-form-label">Document Type <span className="required">*</span></label>
              <select className="cm-form-select" value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))}>
                <option>SRD</option>
                <option>Enclosure</option>
                <option>Information Document</option>
                <option>Internal Document</option>
              </select>
            </div>
            <div className="cm-form-group">
              <label className="cm-form-label">Document Name <span className="required">*</span></label>
              <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter document name" />
            </div>
            <div className="cm-form-group">
              <label className="cm-form-label">Document ID</label>
              <input className="cm-form-input" value={isEdit ? doc.doc_id || '—' : 'Auto'} readOnly style={{ background: 'var(--bg)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Content */}
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Content</h4>
            <div className="cm-sub-tabs" style={{ marginBottom: 12 }}>
              <div className={`cm-sub-tab ${contentTab === 'online' ? 'active' : ''}`} onClick={() => setContentTab('online')}>Online Authoring</div>
              <div className={`cm-sub-tab ${contentTab === 'file' ? 'active' : ''}`} onClick={() => setContentTab('file')}>File Upload</div>
            </div>
            {contentTab === 'online' ? (
              <RichTextEditor value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} placeholder="Write document content here…" />
            ) : (
              <div>
                <div className="cm-upload-zone" onClick={() => fileInputRef.current?.click()}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: 14 }}>Click to browse or drag & drop</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Accepted: PDF, DOC, DOCX, TXT</div>
                </div>
                <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={handleFile} />
                {file && (
                  <div className="cm-uploaded-file">
                    <span>📄</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{file.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB</span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} onClick={() => setFile(null)}>×</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Attributes */}
          <div style={{ marginBottom: 8 }}>
            <div onClick={() => setAttrOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>Attributes</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{attrOpen ? '▲' : '▼'}</span>
            </div>
            {attrOpen && (
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Expiry Date</label>
                    <input type="date" className="cm-form-input" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Activation Date</label>
                    <input type="date" className="cm-form-input" value={form.activation_date} onChange={e => setForm(p => ({ ...p, activation_date: e.target.value }))} />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Language</label>
                    <select className="cm-form-select" value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}>
                      <option>English</option><option>French</option><option>German</option><option>Spanish</option><option>Japanese</option><option>Chinese</option>
                    </select>
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Search Tags</label>
                    <input className="cm-form-input" value={form.search_tags} onChange={e => setForm(p => ({ ...p, search_tags: e.target.value }))} placeholder="Comma-separated tags" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.product_specific} onChange={e => setForm(p => ({ ...p, product_specific: e.target.checked }))} />
                    Product Specific
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.site_specific} onChange={e => setForm(p => ({ ...p, site_specific: e.target.checked }))} />
                    Site Specific
                  </label>
                </div>
                <div className="cm-form-group" style={{ marginTop: 12 }}>
                  <label className="cm-form-label">Usage Instructions</label>
                  <textarea className="cm-form-textarea" value={form.usage_instructions} onChange={e => setForm(p => ({ ...p, usage_instructions: e.target.value }))} rows={2} />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
        </div>
      </div>
    </>
  )
}

// ─── Documents Section ────────────────────────────────────────────────────────

function DocumentsSection({ token, user }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [subTab, setSubTab] = useState('all')
  const [docs, setDocs] = useState([])
  const [reviews, setReviews] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', doc_type: '', status: '', search: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  // Drawer & modal state
  const [showDrawer, setShowDrawer] = useState(false)
  const [editDoc, setEditDoc] = useState(null)
  const [checkInDoc, setCheckInDoc] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [reviewDoc, setReviewDoc] = useState(null)
  const [approveDoc, setApproveDoc] = useState(null)
  const [publishDoc, setPublishDoc] = useState(null)
  const [reviewStatusItem, setReviewStatusItem] = useState(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
      const res = await fetch(`/api/cm/documents?${params}`, { headers: authHeaders })
      if (res.ok) {
        const d = await res.json()
        setDocs(Array.isArray(d) ? d : d.documents || [])
        setTotal(d.total || 0)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters, page]) // eslint-disable-line

  const loadReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/cm/reviews', { headers: authHeaders })
      if (res.ok) setReviews((await res.json()).reviews || [])
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/cm/folders', { headers: authHeaders })
      if (res.ok) setFolders((await res.json()).folders || [])
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { if (subTab === 'all') loadDocs() }, [loadDocs, subTab])
  useEffect(() => { if (subTab === 'reviews') loadReviews() }, [loadReviews, subTab])

  async function handleCheckOut(doc) {
    try {
      const res = await fetch(`/api/cm/documents/${doc.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadDocs()
      else { const d = await res.json(); alert(d.error || 'Check out failed.') }
    } catch { alert('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await fetch(`/api/cm/documents/${checkInDoc.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInDoc(null); loadDocs() }
      else { const d = await res.json(); alert(d.error || 'Check in failed.') }
    } catch { alert('Network error.') }
    setCheckInLoading(false)
  }

  async function handleArchive(doc) {
    if (!confirm(`Archive "${doc.name}"? This action cannot be undone.`)) return
    try {
      const res = await fetch(`/api/cm/documents/${doc.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadDocs()
      else { const d = await res.json(); alert(d.error || 'Archive failed.') }
    } catch { alert('Network error.') }
  }

  function getDocActions(doc) {
    const btns = []
    const s = doc.status
    if (s === 'Draft') {
      btns.push(<button key="edit" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="co" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(doc)}>Check Out</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setCheckInDoc(doc)}>Check In</button>)
    } else if (s === 'Pending') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="ir" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setReviewDoc(doc)}>Initiate Review</button>)
    } else if (s === 'Under Review') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="approve" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(doc)}>Approve</button>)
    } else if (s === 'Approved') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="pub" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setPublishDoc(doc)}>Publish</button>)
    } else if (s === 'Published') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="arch" className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(doc)}>Archive</button>)
    } else if (s === 'Archived') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
    }
    return <div className="cm-action-btns">{btns}</div>
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Documents</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditDoc(null); setShowDrawer(true) }}>+ New Document</button>
      </div>

      {/* Sub-tabs */}
      <div className="cm-sub-tabs">
        <div className={`cm-sub-tab ${subTab === 'all' ? 'active' : ''}`} onClick={() => setSubTab('all')}>All Documents</div>
        <div className={`cm-sub-tab ${subTab === 'reviews' ? 'active' : ''}`} onClick={() => setSubTab('reviews')}>
          My Review Tasks {reviews.length > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{reviews.length}</span>}
        </div>
      </div>

      {subTab === 'all' && (
        <>
          {/* Filters */}
          <div className="cm-filters">
            <select className="cm-form-select" style={{ width: 160 }} value={filters.folder_id} onChange={e => { setFilters(p => ({ ...p, folder_id: e.target.value })); setPage(1) }}>
              <option value="">All Folders</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select className="cm-form-select" style={{ width: 180 }} value={filters.doc_type} onChange={e => { setFilters(p => ({ ...p, doc_type: e.target.value })); setPage(1) }}>
              <option value="">All Types</option>
              <option>SRD</option><option>Enclosure</option><option>Information Document</option><option>Internal Document</option>
            </select>
            <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setPage(1) }}>
              <option value="">All Statuses</option>
              <option>Draft</option><option>Pending</option><option>Under Review</option><option>Approved</option><option>Published</option><option>Archived</option>
            </select>
            <input className="cm-form-input" style={{ width: 220 }} placeholder="Search documents…" value={filters.search} onChange={e => { setFilters(p => ({ ...p, search: e.target.value })); setPage(1) }} />
            <button className="cm-btn cm-btn-secondary" onClick={loadDocs}>Filter</button>
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading documents…</p>
          ) : docs.length === 0 ? (
            <div className="cm-empty"><div className="cm-empty-icon">📄</div><p>No documents found. Create your first one!</p></div>
          ) : (
            <>
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Doc ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Folder</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Checked Out By</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                      <td style={{ fontWeight: 500, maxWidth: 200 }}>{d.name}</td>
                      <td>{d.doc_type}</td>
                      <td>{d.folder_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.version || '1.0'}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.checked_out_by_name || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
                      <td>{getDocActions(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
                  <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                  <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {subTab === 'reviews' && (
        reviews.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">✅</div><p>No review tasks assigned to you.</p></div>
        ) : (
          <table className="cm-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Review Title</th>
                <th>Planned End Date</th>
                <th>My Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.document_name}</td>
                  <td>{r.title}</td>
                  <td style={{ fontSize: 12 }}>{r.planned_end_date ? new Date(r.planned_end_date).toLocaleDateString() : '—'}</td>
                  <td><StatusBadge status={r.my_status || 'Ongoing'} /></td>
                  <td>
                    <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setReviewStatusItem(r)}>Open Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Drawer */}
      {showDrawer && (
        <DocumentDrawer
          doc={editDoc}
          folders={folders}
          token={token}
          onClose={() => { setShowDrawer(false); setEditDoc(null) }}
          onSaved={loadDocs}
        />
      )}

      {/* Modals */}
      {checkInDoc && (
        <CheckInModal item={checkInDoc} onClose={() => setCheckInDoc(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
      {reviewDoc && (
        <InitiateReviewModal doc={reviewDoc} token={token} onClose={() => setReviewDoc(null)} onDone={loadDocs} />
      )}
      {approveDoc && (
        <ApproveModal doc={approveDoc} user={user} token={token} onClose={() => setApproveDoc(null)} onDone={loadDocs} />
      )}
      {publishDoc && (
        <PublishModal doc={publishDoc} user={user} token={token} onClose={() => setPublishDoc(null)} onDone={loadDocs} />
      )}
      {reviewStatusItem && (
        <ReviewStatusModal review={reviewStatusItem} token={token} onClose={() => setReviewStatusItem(null)} onDone={loadReviews} />
      )}
    </div>
  )
}

// ─── FAQ Drawer ───────────────────────────────────────────────────────────────

function FAQDrawer({ faq, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!faq?.id
  const [form, setForm] = useState({
    folder_id: faq?.folder_id || '',
    category: faq?.category || '',
    approval_required: faq?.approval_required !== false,
    question: faq?.question || '',
    answer: faq?.answer || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.question.trim()) return alert('Question is required.')
    if (!form.answer || form.answer === '<p></p>') return alert('Answer is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/faqs/${faq.id}` : '/api/cm/faqs'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify({ ...form, check_in: checkIn }) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${faq.question?.slice(0, 40)}…` : 'New FAQ'}</span>
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
          <div className="cm-form-group">
            <label className="cm-form-label">Category</label>
            <input className="cm-form-input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Dosage, Side Effects…" />
          </div>
          <div className="cm-form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={form.approval_required} onChange={e => setForm(p => ({ ...p, approval_required: e.target.checked }))} />
              Approval Required
            </label>
            {!form.approval_required && (
              <p style={{ fontSize: 12, color: 'var(--info)', marginTop: 6, padding: '6px 10px', background: '#e8f0fb', borderRadius: 4 }}>
                Note: This FAQ will be published immediately on Check-In.
              </p>
            )}
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Question <span className="required">*</span></label>
            <textarea className="cm-form-textarea" value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} rows={3} placeholder="Enter the question…" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Answer <span className="required">*</span></label>
            <RichTextEditor value={form.answer} onChange={v => setForm(p => ({ ...p, answer: v }))} />
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
        </div>
      </div>
    </>
  )
}

// ─── FAQs Section ─────────────────────────────────────────────────────────────

function FAQsSection({ token, user }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [faqs, setFaqs] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', status: '', category: '', search: '' })
  const [showDrawer, setShowDrawer] = useState(false)
  const [editFaq, setEditFaq] = useState(null)
  const [checkInFaq, setCheckInFaq] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)

  const loadFaqs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const [fRes, folRes] = await Promise.all([
        fetch(`/api/cm/faqs?${params}`, { headers: authHeaders }),
        fetch('/api/cm/folders', { headers: authHeaders }),
      ])
      if (fRes.ok) setFaqs((await fRes.json()).faqs || [])
      if (folRes.ok) setFolders((await folRes.json()).folders || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters]) // eslint-disable-line

  useEffect(() => { loadFaqs() }, [loadFaqs])

  async function handleCheckOut(faq) {
    try {
      const res = await fetch(`/api/cm/faqs/${faq.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadFaqs()
      else { const d = await res.json(); alert(d.error || 'Check out failed.') }
    } catch { alert('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await fetch(`/api/cm/faqs/${checkInFaq.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInFaq(null); loadFaqs() }
      else { const d = await res.json(); alert(d.error || 'Check in failed.') }
    } catch { alert('Network error.') }
    setCheckInLoading(false)
  }

  async function handleApprove(faq) {
    try {
      const res = await fetch(`/api/cm/faqs/${faq.id}/approve`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadFaqs()
      else { const d = await res.json(); alert(d.error || 'Approve failed.') }
    } catch { alert('Network error.') }
  }

  async function handlePublish(faq) {
    try {
      const res = await fetch(`/api/cm/faqs/${faq.id}/publish`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadFaqs()
      else { const d = await res.json(); alert(d.error || 'Publish failed.') }
    } catch { alert('Network error.') }
  }

  function getFaqActions(faq) {
    const s = faq.status
    const btns = []
    if (s === 'Draft') {
      btns.push(<button key="e" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="co" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(faq)}>Check Out</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setCheckInFaq(faq)}>Check In</button>)
    } else if (s === 'Pending') {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="ap" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => handleApprove(faq)}>Approve</button>)
    } else if (s === 'Approved') {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="pub" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => handlePublish(faq)}>Publish</button>)
    } else {
      btns.push(<button key="v" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditFaq(faq); setShowDrawer(true) }}>View</button>)
    }
    return <div className="cm-action-btns">{btns}</div>
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">FAQs</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditFaq(null); setShowDrawer(true) }}>+ New FAQ</button>
      </div>
      <div className="cm-filters">
        <select className="cm-form-select" style={{ width: 160 }} value={filters.folder_id} onChange={e => setFilters(p => ({ ...p, folder_id: e.target.value }))}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Draft</option><option>Pending</option><option>Approved</option><option>Published</option><option>Archived</option>
        </select>
        <input className="cm-form-input" style={{ width: 160 }} placeholder="Category…" value={filters.category} onChange={e => setFilters(p => ({ ...p, category: e.target.value }))} />
        <input className="cm-form-input" style={{ width: 200 }} placeholder="Search FAQs…" value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
        <button className="cm-btn cm-btn-secondary" onClick={loadFaqs}>Filter</button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading FAQs…</p>
      ) : faqs.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">❓</div><p>No FAQs found. Create your first one!</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Category</th>
              <th>Folder</th>
              <th>Version</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {faqs.map((f, i) => (
              <tr key={f.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{i + 1}</td>
                <td style={{ maxWidth: 300 }}>{f.question?.length > 60 ? f.question.slice(0, 60) + '…' : f.question}</td>
                <td>{f.category || '—'}</td>
                <td>{f.folder_name || '—'}</td>
                <td style={{ textAlign: 'center' }}>{f.version || '1.0'}</td>
                <td><StatusBadge status={f.status} /></td>
                <td>{getFaqActions(f)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showDrawer && (
        <FAQDrawer faq={editFaq} folders={folders} token={token} onClose={() => { setShowDrawer(false); setEditFaq(null) }} onSaved={loadFaqs} />
      )}
      {checkInFaq && (
        <CheckInModal item={checkInFaq} onClose={() => setCheckInFaq(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
    </div>
  )
}

// ─── Merge Report Drawer ──────────────────────────────────────────────────────

function MergeReportDrawer({ report, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!report?.id
  const [form, setForm] = useState({
    folder_id: report?.folder_id || '',
    name: report?.name || '',
    content: report?.content || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.name.trim()) return alert('Name is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/merge-reports/${report.id}` : '/api/cm/merge-reports'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify({ ...form, check_in: checkIn }) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${report.name}` : 'New Merge Report'}</span>
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
          <div className="cm-form-group">
            <label className="cm-form-label">Name <span className="required">*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Merge report name" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Content</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Use merge fields like {'{{patient_name}}'}, {'{{product_name}}'}, {'{{case_id}}'}.</p>
            <RichTextEditor value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} />
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
        </div>
      </div>
    </>
  )
}

// ─── Merge Reports Section ────────────────────────────────────────────────────

function MergeReportsSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [reports, setReports] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [editReport, setEditReport] = useState(null)
  const [checkInReport, setCheckInReport] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, fRes] = await Promise.all([
        fetch('/api/cm/merge-reports', { headers: authHeaders }),
        fetch('/api/cm/folders', { headers: authHeaders }),
      ])
      if (rRes.ok) setReports((await rRes.json()).reports || [])
      if (fRes.ok) setFolders((await fRes.json()).folders || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function handleCheckOut(r) {
    try {
      const res = await fetch(`/api/cm/merge-reports/${r.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); alert(d.error || 'Check out failed.') }
    } catch { alert('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await fetch(`/api/cm/merge-reports/${checkInReport.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInReport(null); load() }
      else { const d = await res.json(); alert(d.error || 'Check in failed.') }
    } catch { alert('Network error.') }
    setCheckInLoading(false)
  }

  async function handleArchive(r) {
    if (!confirm(`Archive "${r.name}"?`)) return
    try {
      const res = await fetch(`/api/cm/merge-reports/${r.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); alert(d.error || 'Archive failed.') }
    } catch { alert('Network error.') }
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Merge Reports</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditReport(null); setShowDrawer(true) }}>+ New Merge Report</button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading merge reports…</p>
      ) : reports.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📋</div><p>No merge reports yet. Create one to get started!</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Folder</th>
              <th>Version</th>
              <th>Status</th>
              <th>Checked Out</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td>{r.folder_name || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.version || '1.0'}</td>
                <td><StatusBadge status={r.status || 'Draft'} /></td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.checked_out_by_name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="cm-action-btns">
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditReport(r); setShowDrawer(true) }}>Edit</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(r)}>Check Out</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setCheckInReport(r)}>Check In</button>
                    <button className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(r)}>Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showDrawer && (
        <MergeReportDrawer report={editReport} folders={folders} token={token} onClose={() => { setShowDrawer(false); setEditReport(null) }} onSaved={load} />
      )}
      {checkInReport && (
        <CheckInModal item={checkInReport} onClose={() => setCheckInReport(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
    </div>
  )
}

// ─── Template Drawer ──────────────────────────────────────────────────────────

function TemplateDrawer({ template, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!template?.id
  const [form, setForm] = useState({
    type: template?.type || 'Response',
    name: template?.name || '',
    subject: template?.subject || '',
    body: template?.body || '',
    status: template?.status || 'Active',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.name.trim()) return alert('Template name is required.')
    if (!form.body || form.body === '<p></p>') return alert('Body is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/templates/${template.id}` : '/api/cm/templates'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify(form) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
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
              <option>Email</option>
              <option>Acknowledgment</option>
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
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </>
  )
}

// ─── Templates Section ────────────────────────────────────────────────────────

function TemplatesSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: '', status: '' })
  const [showDrawer, setShowDrawer] = useState(false)
  const [editTemplate, setEditTemplate] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
      const res = await fetch(`/api/cm/templates?${params}`, { headers: authHeaders })
      if (res.ok) setTemplates((await res.json()).templates || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function toggleStatus(t) {
    const newStatus = t.status === 'Active' ? 'Inactive' : 'Active'
    try {
      const res = await fetch(`/api/cm/templates/${t.id}/status`, {
        method: 'PATCH', headers: authHeaders, body: JSON.stringify({ status: newStatus })
      })
      if (res.ok) load()
      else { const d = await res.json(); alert(d.error || 'Failed to update status.') }
    } catch { alert('Network error.') }
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
          <option>Email</option>
          <option>Acknowledgment</option>
        </select>
        <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Active</option>
          <option>Inactive</option>
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
        <TemplateDrawer template={editTemplate} token={token} onClose={() => { setShowDrawer(false); setEditTemplate(null) }} onSaved={load} />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { user, token } = useAuth()
  const [activeTab, setActiveTab] = useState('documents')
  const [showFolders, setShowFolders] = useState(false)

  const tabs = [
    { key: 'documents', label: 'Documents' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'merge-reports', label: 'Merge Reports' },
    { key: 'templates', label: 'Templates' },
  ]

  return (
    <MIMSLayout>
      <div className="cm-page">
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Content Management</h2>
          <button className="cm-folder-btn" onClick={() => setShowFolders(true)}>📁 Manage Folders</button>
        </div>

        {/* Top Tabs */}
        <div className="cm-top-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`cm-top-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section Content */}
        <div className="cm-content">
          {activeTab === 'documents' && <DocumentsSection token={token} user={user} />}
          {activeTab === 'faqs' && <FAQsSection token={token} user={user} />}
          {activeTab === 'merge-reports' && <MergeReportsSection token={token} />}
          {activeTab === 'templates' && <TemplatesSection token={token} />}
        </div>

        {/* Folder Manager */}
        {showFolders && (
          <FolderManager show={showFolders} onClose={() => setShowFolders(false)} token={token} />
        )}
      </div>
    </MIMSLayout>
  )
}
