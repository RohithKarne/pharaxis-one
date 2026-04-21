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

function parseMaybeJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

function normalizeSelectedModules(value) {
  let parsed = value
  for (let i = 0; i < 2; i += 1) {
    parsed = parseMaybeJson(parsed, parsed)
    if (typeof parsed !== 'string') break
  }
  if (!Array.isArray(parsed)) return []
  const normalized = parsed
    .map(id => Number(id))
    .filter(id => Number.isInteger(id) && id > 0)
  return Array.from(new Set(normalized))
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
  // CM-E8: Folder permissions panel state
  const [permFolder, setPermFolder] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [secGroups, setSecGroups] = useState([])
  const [permLoading, setPermLoading] = useState(false)
  const [permGroupId, setPermGroupId] = useState('')
  const [permLevel, setPermLevel] = useState('read')

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

  // CM-E8: Load folder permissions + security groups
  async function loadPermissions(folderId) {
    setPermLoading(true)
    try {
      const [permRes, sgRes] = await Promise.all([
        fetch(`/api/cm/folders/${folderId}/permissions`, { headers: authHeaders }),
        fetch('/api/admin/security-groups', { headers: authHeaders }),
      ])
      if (permRes.ok) setPermissions((await permRes.json()).permissions || [])
      if (sgRes.ok) setSecGroups((await sgRes.json()).groups || [])
    } catch { /* silent */ }
    setPermLoading(false)
  }

  async function handleAddPermission() {
    if (!permGroupId) return
    try {
      const res = await fetch(`/api/cm/folders/${permFolder.id}/permissions`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ group_id: Number(permGroupId), permission_level: permLevel }),
      })
      if (res.ok) { setPermGroupId(''); loadPermissions(permFolder.id) }
      else { const d = await res.json(); alert(d.error || 'Failed to add permission.') }
    } catch { alert('Network error.') }
  }

  async function handleRemovePermission(groupId) {
    if (!confirm('Remove this permission?')) return
    try {
      const res = await fetch(`/api/cm/folders/${permFolder.id}/permissions/${groupId}`, { method: 'DELETE', headers: authHeaders })
      if (res.ok) loadPermissions(permFolder.id)
    } catch { alert('Network error.') }
  }

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
    <>
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
                  {products.map(p => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
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
                    <div className="cm-action-btns">
                      <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => openEdit(f)}>Edit</button>
                      <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setPermFolder(f); loadPermissions(f.id) }}>🔒 Permissions</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>

    {/* CM-E8: Folder Permissions Panel */}
    {permFolder && (
      <div className="cm-modal-overlay" onClick={() => setPermFolder(null)}>
        <div className="cm-modal" style={{ width: 560, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="cm-modal-title" style={{ margin: 0 }}>Permissions — {permFolder.name}</h3>
            <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPermFolder(null)}>Close</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Control which security groups can access this folder and at what level.</p>

          {/* Add permission */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <select className="cm-form-select" style={{ flex: 1 }} value={permGroupId} onChange={e => setPermGroupId(e.target.value)}>
              <option value="">— Select security group —</option>
              {secGroups.filter(sg => !permissions.some(p => p.group_id === sg.id)).map(sg => (
                <option key={sg.id} value={sg.id}>{sg.name}</option>
              ))}
            </select>
            <select className="cm-form-select" style={{ width: 100 }} value={permLevel} onChange={e => setPermLevel(e.target.value)}>
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="manage">Manage</option>
            </select>
            <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={handleAddPermission} disabled={!permGroupId}>+ Add</button>
          </div>

          {permLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>Loading…</p>
          ) : permissions.length === 0 ? (
            <div className="cm-empty" style={{ padding: 20 }}><p>No group permissions set. All users with folder access can read.</p></div>
          ) : (
            <table className="cm-table">
              <thead><tr><th>Security Group</th><th>Permission Level</th><th></th></tr></thead>
              <tbody>
                {permissions.map(p => (
                  <tr key={p.group_id}>
                    <td style={{ fontWeight: 500 }}>{p.group_name}</td>
                    <td><span style={{ textTransform: 'capitalize', fontSize: 12, padding: '2px 8px', borderRadius: 10, background: p.permission_level === 'manage' ? '#e8f5e9' : p.permission_level === 'write' ? '#fff8e1' : 'var(--bg)', color: p.permission_level === 'manage' ? '#2e7d32' : p.permission_level === 'write' ? '#856404' : 'var(--text-secondary)' }}>{p.permission_level}</span></td>
                    <td><button className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleRemovePermission(p.group_id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )}
    </>
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

function DocumentCreationScreen({ doc, token, onClose, onSaved }) {
  const isEdit = !!doc?.id
  const fileInputRef = useRef(null)
  const attachmentsInputRef = useRef(null)

  const [form, setForm] = useState({
    folder_id: doc?.folder_id || '',
    doc_type: doc?.doc_type || 'SRD',
    name: doc?.name || '',
    response_doc_type: doc?.response_doc_type || 'File',
    standard_response_text: doc?.standard_response_text || '',
    publish_as_pdf: doc?.publish_as_pdf ? true : false,
    send_as_pdf: doc?.send_as_pdf ? true : false,
    selected_modules: normalizeSelectedModules(doc?.selected_modules),
    content_html: doc?.content_html || '',
    expiry_date: doc?.expiry_date ? doc.expiry_date.slice(0, 10) : '',
    activation_date: doc?.activation_date ? doc.activation_date.slice(0, 10) : '',
    expiry_alert_recipients: doc?.expiry_alert_recipients ? (typeof doc.expiry_alert_recipients === 'string' ? JSON.parse(doc.expiry_alert_recipients) : doc.expiry_alert_recipients) : [],
    language: doc?.language || 'en',
    search_tags: doc?.search_tags || '',
    mi_category_id: doc?.mi_category_id || '',
    document_category: doc?.document_category || '',
    version_notes: doc?.version_notes || '',
    review_cycle_days: doc?.review_cycle_days || '',
    regulatory_ref: doc?.regulatory_ref || '',
    custom_attributes: doc?.custom_attributes ? (typeof doc.custom_attributes === 'string' ? JSON.parse(doc.custom_attributes) : doc.custom_attributes) : [],
    bump_type: 'minor',
    is_product_specific: doc?.is_product_specific ? true : false,
    is_site_specific: doc?.is_site_specific ? true : false,
    usage_instructions: doc?.usage_instructions || '',
  })

  const [activeTab, setActiveTab] = useState('general')
  const [contentMode, setContentMode] = useState('upload')
  const [file, setFile] = useState(null)
  const [sourceAttachments, setSourceAttachments] = useState([])
  const [saving, setSaving] = useState(false)
  const [availableModules, setAvailableModules] = useState([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [moduleSearch, setModuleSearch] = useState('')
  const [folders, setFolders] = useState([])
  const [miCategories, setMiCategories] = useState([])
  const [docCategories, setDocCategories] = useState([])

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  useEffect(() => {
    fetch('/api/cm/folders', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { folders: [] })
      .then(d => setFolders(d.folders || []))
      .catch(() => setFolders([]))
    fetch('/api/admin/mi-categories', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setMiCategories((d.categories || []).filter(c => c.is_active)))
      .catch(() => setMiCategories([]))
    fetch('/api/cm/picklists?field_type=document_category&active_only=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { picklists: [] })
      .then(d => setDocCategories(d.picklists || []))
      .catch(() => setDocCategories([]))
  }, [token])

  useEffect(() => {
    if (form.response_doc_type === 'Module') {
      setModulesLoading(true)
      fetch('/api/cm/modules?status=Published&include_expired=false', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setAvailableModules(d.modules || []))
        .catch(() => setAvailableModules([]))
        .finally(() => setModulesLoading(false))
    } else {
      setModuleSearch('')
    }
  }, [form.response_doc_type, token])

  function handleFile(e) {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  function handleAttachments(e) {
    const files = Array.from(e.target.files)
    setSourceAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }

  function removeAttachment(idx) {
    setSourceAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  function addModule(moduleId) {
    const targetId = Number(moduleId)
    setForm(p => {
      const existing = normalizeSelectedModules(p.selected_modules)
      if (existing.includes(targetId)) return p
      return { ...p, selected_modules: [...existing, targetId] }
    })
  }

  function removeModule(moduleId) {
    const targetId = Number(moduleId)
    setForm(p => ({
      ...p,
      selected_modules: normalizeSelectedModules(p.selected_modules).filter(id => id !== targetId)
    }))
  }

  function moveModule(moduleId, direction) {
    const targetId = Number(moduleId)
    setForm(p => {
      const arr = normalizeSelectedModules(p.selected_modules)
      const idx = arr.indexOf(targetId)
      if (idx === -1) return p
      const newArr = [...arr]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= newArr.length) return p
      ;[newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]]
      return { ...p, selected_modules: newArr }
    })
  }

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.name.trim()) return alert('Document name is required.')
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'selected_modules') fd.append(k, JSON.stringify(v))
        else if (v !== null && v !== undefined) fd.append(k, v)
      })
      if (file) fd.append('file', file)
      sourceAttachments.forEach(f => fd.append('source_attachments', f))
      if (checkIn) fd.append('check_in', '1')
      const url = isEdit ? `/api/cm/documents/${doc.id}` : '/api/cm/documents'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const data = await res.json()
        // Save & Check-In: after save, call checkin on the document
        if (checkIn) {
          const docId = isEdit ? doc.id : data.id
          const ciRes = await fetch(`/api/cm/documents/${docId}/checkin`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: 'Checked in on creation' }),
          })
          if (!ciRes.ok) {
            const ciErr = await ciRes.json()
            alert(`Saved but check-in failed: ${ciErr.error || 'Unknown error'}`)
          }
        }
        onSaved(); onClose()
      }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  const TABS = [
    { key: 'general', label: 'General Attributes' },
    { key: 'other', label: 'Other Attributes' },
    { key: 'associated', label: 'Associated Documents' },
    { key: 'usage', label: 'Usage Instructions' },
    { key: 'versions', label: 'Version Alerts' },
  ]
  const filteredModules = availableModules.filter((m) => {
    if (!moduleSearch.trim()) return true
    const q = moduleSearch.trim().toLowerCase()
    return (
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.module_id || '').toLowerCase().includes(q) ||
      String(m.folder_name || '').toLowerCase().includes(q) ||
      String(m.search_tags || '').toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ position: 'fixed', top: 86, left: 0, right: 0, bottom: 0, zIndex: 500, background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {isEdit ? `Edit Document — ${doc.name}` : 'New Document'}
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

        {/* ── Row 1 — Basic Info ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', gap: 16, marginBottom: 24, alignItems: 'end' }}>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Folder <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— Select Folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document Type <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="cm-form-select" value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))}>
              <option>SRD</option>
              <option>Enclosure</option>
              <option>Information Document</option>
              <option>Internal Document</option>
            </select>
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter document name" />
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document ID</label>
            <input className="cm-form-input" value={isEdit ? doc.doc_id || '—' : 'Auto'} readOnly style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'default' }} />
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20, gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
                color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── General Attributes Tab ── */}
        {activeTab === 'general' && (
          <div style={{ maxWidth: 1000 }}>

            {/* Row A — Response Doc Type + icons + Standard Response Text + MI Category */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>

              {/* Response Document Type */}
              <div className="cm-form-group" style={{ margin: 0, minWidth: 160 }}>
                <label className="cm-form-label">Response Doc Type</label>
                <select
                  className="cm-form-select"
                  value={form.response_doc_type}
                  onChange={e => setForm(p => ({ ...p, response_doc_type: e.target.value, selected_modules: [] }))}
                >
                  <option value="File">File</option>
                  <option value="Module">Module</option>
                </select>
              </div>

              {/* Upload + Author icons — compact, inline */}
              {form.response_doc_type === 'File' && (
                <div style={{ display: 'flex', gap: 6, paddingTop: 20 }}>
                  <div
                    onClick={() => { setContentMode('upload'); fileInputRef.current?.click() }}
                    title="Upload File"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 54, height: 50, border: `2px dashed ${contentMode === 'upload' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer', background: contentMode === 'upload' ? 'var(--primary-light, #eef2ff)' : 'var(--bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📎</span>
                    <span style={{ fontSize: 9, marginTop: 2, color: 'var(--text-secondary)', fontWeight: 500 }}>Upload</span>
                  </div>
                  <div
                    onClick={() => setContentMode('online')}
                    title="Author Online"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 54, height: 50, border: `2px dashed ${contentMode === 'online' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer', background: contentMode === 'online' ? 'var(--primary-light, #eef2ff)' : 'var(--bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>✏️</span>
                    <span style={{ fontSize: 9, marginTop: 2, color: 'var(--text-secondary)', fontWeight: 500 }}>Author</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={handleFile} />
                </div>
              )}

              {/* File chip — shown when file selected */}
              {form.response_doc_type === 'File' && file && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, marginTop: 20 }}>
                  <span>📄</span><span>{file.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(file.size / 1024).toFixed(0)} KB</span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14 }} onClick={() => setFile(null)}>×</button>
                </div>
              )}

              {/* Standard Response Text — beside icons */}
              <div className="cm-form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                <label className="cm-form-label">Standard Response / Cover Letter</label>
                <textarea
                  className="cm-form-input"
                  rows={3}
                  value={form.standard_response_text}
                  onChange={e => setForm(p => ({ ...p, standard_response_text: e.target.value }))}
                  placeholder="Enter standard response or cover letter text…"
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                />
              </div>

              {/* MI Category — beside standard response */}
              <div className="cm-form-group" style={{ margin: 0, minWidth: 180 }}>
                <label className="cm-form-label">MI Category</label>
                <select className="cm-form-select" value={form.mi_category_id} onChange={e => setForm(p => ({ ...p, mi_category_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {miCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {miCategories.length === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Configure in Admin Console.</p>
                )}
              </div>
            </div>

            {/* Online Editor */}
            {form.response_doc_type === 'File' && contentMode === 'online' && (
              <div style={{ marginBottom: 16 }}>
                <RichTextEditor value={form.content_html} onChange={v => setForm(p => ({ ...p, content_html: v }))} placeholder="Write document content here…" />
              </div>
            )}

            {/* PDF Checkboxes */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input type="checkbox" checked={form.publish_as_pdf} onChange={e => setForm(p => ({ ...p, publish_as_pdf: e.target.checked }))} />
                Publish as PDF
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input type="checkbox" checked={form.send_as_pdf} onChange={e => setForm(p => ({ ...p, send_as_pdf: e.target.checked }))} />
                Send as PDF
              </label>
            </div>

            {/* MODULE picker */}
            {form.response_doc_type === 'Module' && (() => {
              const selectedIds = normalizeSelectedModules(form.selected_modules)
              const selectedModules = selectedIds.map(id => availableModules.find(m => Number(m.id) === id)).filter(Boolean)
              const unselectedModules = availableModules.filter(m => !selectedIds.includes(Number(m.id)))
              const filtered = unselectedModules.filter(m => {
                if (!moduleSearch.trim()) return true
                const q = moduleSearch.trim().toLowerCase()
                return (
                  String(m.name || '').toLowerCase().includes(q) ||
                  String(m.module_id || '').toLowerCase().includes(q) ||
                  String(m.folder_name || '').toLowerCase().includes(q) ||
                  String(m.search_tags || '').toLowerCase().includes(q)
                )
              })
              return (
                <div style={{ marginBottom: 16 }}>
                  <label className="cm-form-label">Module Sequence</label>

                  {/* Selected — ordered list */}
                  {selectedModules.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '6px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Selected — {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''} in order
                      </div>
                      {selectedModules.map((m, idx) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < selectedModules.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--primary-light, #eef2ff)' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 20, textAlign: 'center' }}>{idx + 1}</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                            {m.name}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{m.module_id || `MOD-${m.id}`}</span>
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.folder_name || '—'}</span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" onClick={() => moveModule(m.id, 'up')} disabled={idx === 0} style={{ padding: '2px 6px', fontSize: 12, cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.35 : 1, border: '1px solid var(--border)', borderRadius: 4, background: 'white' }} title="Move up">↑</button>
                            <button type="button" onClick={() => moveModule(m.id, 'down')} disabled={idx === selectedModules.length - 1} style={{ padding: '2px 6px', fontSize: 12, cursor: idx === selectedModules.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === selectedModules.length - 1 ? 0.35 : 1, border: '1px solid var(--border)', borderRadius: 4, background: 'white' }} title="Move down">↓</button>
                            <button type="button" onClick={() => removeModule(m.id)} style={{ padding: '2px 6px', fontSize: 12, cursor: 'pointer', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff5f5', color: '#dc2626' }} title="Remove">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Available — search + add */}
                  <input
                    className="cm-form-input"
                    placeholder="Search published modules to add…"
                    value={moduleSearch}
                    onChange={e => setModuleSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  {modulesLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading modules…</p>}
                  {!modulesLoading && availableModules.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                      No published modules available. Create and publish modules in the Modular Documents tab first.
                    </div>
                  )}
                  {!modulesLoading && availableModules.length > 0 && unselectedModules.length === 0 && !moduleSearch && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                      All available modules have been added.
                    </div>
                  )}
                  {!modulesLoading && filtered.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '6px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Available modules
                      </div>
                      {filtered.map((m, idx) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                            {m.name}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{m.module_id || `MOD-${m.id}`}</span>
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.folder_name || '—'}</span>
                          <button type="button" onClick={() => addModule(m.id)} style={{ padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: '1px solid var(--primary, #4f46e5)', borderRadius: 4, background: 'white', color: 'var(--primary, #4f46e5)', fontWeight: 600 }}>+ Add</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!modulesLoading && moduleSearch && filtered.length === 0 && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                      No modules match your search.
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Row B — Search Tags | Document Category | Activation Date | Expiry Date */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Search Tags</label>
                <input
                  className="cm-form-input"
                  value={form.search_tags}
                  onChange={e => setForm(p => ({ ...p, search_tags: e.target.value }))}
                  placeholder="safety, dosing, paediatric…"
                />
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Document Category</label>
                <select className="cm-form-select" value={form.document_category} onChange={e => setForm(p => ({ ...p, document_category: e.target.value }))}>
                  <option value="">— Select —</option>
                  {docCategories.length > 0
                    ? docCategories.map(c => <option key={c.id} value={c.value}>{c.label || c.value}</option>)
                    : ['Clinical', 'Regulatory', 'Safety', 'Scientific', 'Patient Information', 'Internal'].map(v => <option key={v} value={v}>{v}</option>)
                  }
                </select>
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Activation Date</label>
                <input type="date" className="cm-form-input" value={form.activation_date} onChange={e => setForm(p => ({ ...p, activation_date: e.target.value }))} />
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Expiry Date</label>
                <input type="date" className="cm-form-input" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
              </div>
            </div>

            {/* CM-E5: Expiry Alert Recipients */}
            {form.expiry_date && (
              <div className="cm-form-group" style={{ marginBottom: 12 }}>
                <label className="cm-form-label">Additional Expiry Alert Recipients</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', minHeight: 38 }}>
                  {(form.expiry_alert_recipients || []).map((email, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-light, #eef2ff)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                      {email}
                      <button type="button" onClick={() => setForm(p => ({ ...p, expiry_alert_recipients: p.expiry_alert_recipients.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                  <input
                    className="cm-form-input"
                    style={{ flex: 1, minWidth: 180, border: 'none', background: 'transparent', padding: '2px 4px' }}
                    placeholder="Add email and press Enter or comma…"
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const val = e.target.value.trim().replace(/,$/, '')
                        if (val && val.includes('@')) {
                          setForm(p => ({ ...p, expiry_alert_recipients: [...(p.expiry_alert_recipients || []), val] }))
                          e.target.value = ''
                        }
                      }
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>These recipients will receive 30/60/90-day pre-expiry reminder notifications.</span>
              </div>
            )}

            {/* Source Attachments */}
            <div className="cm-form-group" style={{ marginBottom: 8 }}>
              <label className="cm-form-label">Source Attachments</label>
              <div
                onClick={() => attachmentsInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)', borderRadius: 8, padding: '16px 20px', cursor: 'pointer',
                  background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 12,
                  color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10,
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>📁</span>
                <span>Click to attach source files <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(multiple allowed — PDF, DOC, DOCX, XLS, XLSX, TXT)</span></span>
              </div>
              <input
                ref={attachmentsInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                style={{ display: 'none' }}
                onChange={handleAttachments}
              />
              {sourceAttachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sourceAttachments.map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
                      <span>📄</span>
                      <span style={{ flex: 1 }}>{f.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16 }} onClick={() => removeAttachment(idx)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Other Attributes Tab ── */}
        {activeTab === 'other' && (
          <div style={{ padding: '4px 0', maxWidth: 800 }}>
            {/* Owner Lock Info */}
            {doc && doc.owner_user_id && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔒</span>
                <span>This document is <strong>locked</strong> to its owner. Only the owner can publish or release it.</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Version Bump — only show on re-versioning (version_major > 1) */}
              {doc && doc.version_major > 1 && (
                <div className="cm-form-group">
                  <label className="cm-form-label">Version Bump *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['minor', 'major'].map(bt => (
                      <label key={bt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: `1px solid ${form.bump_type === bt ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, background: form.bump_type === bt ? 'var(--primary-light, #f0ebff)' : 'var(--surface)' }}>
                        <input type="radio" name="bump_type" value={bt} checked={form.bump_type === bt} onChange={() => setForm(p => ({ ...p, bump_type: bt }))} style={{ margin: 0 }} />
                        {bt === 'minor' ? 'Minor (1.x)' : 'Major (x.0)'}
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Minor = small update, Major = significant new version</p>
                </div>
              )}

              {/* Version Notes */}
              <div className="cm-form-group">
                <label className="cm-form-label">Version Notes</label>
                <input className="cm-form-input" value={form.version_notes || ''} onChange={e => setForm(p => ({ ...p, version_notes: e.target.value }))} placeholder="What changed in this version?" />
              </div>

              {/* Review Cycle */}
              <div className="cm-form-group">
                <label className="cm-form-label">Review Cycle</label>
                <select className="cm-form-select" value={form.review_cycle_days || ''} onChange={e => setForm(p => ({ ...p, review_cycle_days: e.target.value }))}>
                  <option value="">— Select —</option>
                  {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>

              {/* Regulatory Ref */}
              <div className="cm-form-group">
                <label className="cm-form-label">Regulatory Reference #</label>
                <input className="cm-form-input" value={form.regulatory_ref || ''} onChange={e => setForm(p => ({ ...p, regulatory_ref: e.target.value }))} placeholder="e.g. EMA/2024/001" />
              </div>
            </div>

            {/* Custom Attributes */}
            <div className="cm-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="cm-form-label" style={{ margin: 0 }}>Custom Attributes</label>
                <button type="button" onClick={() => setForm(p => ({ ...p, custom_attributes: [...(p.custom_attributes || []), { key: '', value: '' }] }))}
                  style={{ fontSize: 12, padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--primary)' }}>
                  + Add Attribute
                </button>
              </div>
              {(form.custom_attributes || []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No custom attributes. Click "+ Add Attribute" to add org-specific metadata.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(form.custom_attributes || []).map((attr, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: 8, alignItems: 'center' }}>
                      <input className="cm-form-input" style={{ margin: 0 }} placeholder="Key" value={attr.key} onChange={e => setForm(p => { const a = [...p.custom_attributes]; a[idx] = { ...a[idx], key: e.target.value }; return { ...p, custom_attributes: a }; })} />
                      <input className="cm-form-input" style={{ margin: 0 }} placeholder="Value" value={attr.value} onChange={e => setForm(p => { const a = [...p.custom_attributes]; a[idx] = { ...a[idx], value: e.target.value }; return { ...p, custom_attributes: a }; })} />
                      <button type="button" onClick={() => setForm(p => ({ ...p, custom_attributes: p.custom_attributes.filter((_, i) => i !== idx) }))}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Associated Documents Tab ── */}
        {activeTab === 'associated' && doc && (
          <AssociatedDocsPanel docId={doc.id} token={token} />
        )}
        {activeTab === 'associated' && !doc && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Save the document first to link associated documents.
          </div>
        )}

        {/* ── Usage Instructions Tab ── */}
        {activeTab === 'usage' && (
          <div style={{ padding: '4px 0', maxWidth: 800 }}>
            <div className="cm-form-group">
              <label className="cm-form-label">Usage Instructions</label>
              <RichTextEditor value={form.usage_instructions || ''} onChange={v => setForm(p => ({ ...p, usage_instructions: v }))} placeholder="How to use this document — intended audience, approved use cases, what NOT to do..." />
            </div>
          </div>
        )}

        {/* ── Version Alerts Tab ── */}
        {activeTab === 'versions' && doc && (
          <>
            <VersionDiffPanel docId={doc.id} token={token} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 24 }}>
              <VersionAlertsPanel docId={doc.id} token={token} />
            </div>
          </>
        )}
        {activeTab === 'versions' && !doc && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Save the document first to configure version alerts.
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
        <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
      </div>
    </div>
  )
}

// ─── CM-E3: Review Row with Mode Toggle ─────────────────────────────────────

function ReviewRowWithMode({ r, authHeaders, onOpen }) {
  const [mode, setMode] = useState(r.review_mode || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Load current review mode config
    fetch(`/api/cm/reviews/${r.review_id || r.id}/config`, { headers: authHeaders })
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d?.config?.review_mode) setMode(d.config.review_mode) })
      .catch(() => {})
  }, [r.id]) // eslint-disable-line

  async function toggleMode(newMode) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/cm/reviews/${r.review_id || r.id}/config`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify({ review_mode: newMode }),
      })
      if (res.ok) setMode(newMode)
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{r.document_name}</td>
      <td>{r.title}</td>
      <td style={{ fontSize: 12 }}>{r.planned_end_date ? new Date(r.planned_end_date).toLocaleDateString() : '—'}</td>
      <td><StatusBadge status={r.my_status || 'Ongoing'} /></td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          {['sequential', 'parallel'].map(m => (
            <button key={m} className={`cm-btn cm-btn-sm ${mode === m ? 'cm-btn-primary' : 'cm-btn-secondary'}`}
              style={{ textTransform: 'capitalize', opacity: saving ? 0.6 : 1 }}
              onClick={() => toggleMode(m)} disabled={saving}>
              {m === 'sequential' ? '⬇ Seq' : '⇉ Par'}
            </button>
          ))}
        </div>
      </td>
      <td>
        <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={onOpen}>Open Review</button>
      </td>
    </tr>
  )
}

// ─── Documents Section ────────────────────────────────────────────────────────

function DocumentsSection({ token, user }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [subTab, setSubTab] = useState('all')
  const [checkedInDocs, setCheckedInDocs] = useState([])
  const [checkedOutDocs, setCheckedOutDocs] = useState([])
  const [docs, setDocs] = useState([])
  const [reviews, setReviews] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', doc_type: '', status: '', search: '' })
  // CM-E1: Full-text search
  const [ftQuery, setFtQuery] = useState('')
  const [ftResults, setFtResults] = useState(null)
  const [ftSearching, setFtSearching] = useState(false)
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

  const loadCheckedIn = useCallback(async () => {
    try {
      const res = await fetch('/api/cm/documents?status=Pending', { headers: authHeaders })
      if (res.ok) { const d = await res.json(); setCheckedInDocs(d.documents || []) }
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadCheckedOut = useCallback(async () => {
    try {
      const res = await fetch('/api/cm/documents?status=CheckedOut', { headers: authHeaders })
      if (res.ok) { const d = await res.json(); setCheckedOutDocs(d.documents || []) }
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { if (subTab === 'all') loadDocs() }, [loadDocs, subTab])
  useEffect(() => { if (subTab === 'reviews') loadReviews() }, [loadReviews, subTab])
  useEffect(() => { if (subTab === 'checkedin') loadCheckedIn() }, [loadCheckedIn, subTab])
  useEffect(() => { if (subTab === 'checkedout') loadCheckedOut() }, [loadCheckedOut, subTab])

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
      btns.push(<button key="ci" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(doc)}>Check In</button>)
    } else if (s === 'CheckedOut') {
      if (doc.checked_out_by_name) {
        btns.push(<span key="who" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>by {doc.checked_out_by_name}</span>)
      }
      btns.push(<button key="edit" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(doc)}>Check In</button>)
    } else if (s === 'Pending') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="ir" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setReviewDoc(doc)}>Initiate Review</button>)
      btns.push(<button key="approve" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(doc)}>Approve</button>)
    } else if (s === 'Under Review') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="approve" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(doc)}>Approve</button>)
    } else if (s === 'Approved') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="pub" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setPublishDoc(doc)}>Publish</button>)
    } else if (s === 'Published') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="co" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(doc)}>Check Out</button>)
      btns.push(<button key="arch" className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(doc)}>Archive</button>)
    } else if (s === 'Archived') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
    }
    return <div className="cm-action-btns">{btns}</div>
  }

  const totalPages = Math.ceil(total / LIMIT)

  if (showDrawer) {
    return (
      <>
        <DocumentCreationScreen
          doc={editDoc}
          token={token}
          onClose={() => { setShowDrawer(false); setEditDoc(null) }}
          onSaved={loadDocs}
        />
        {checkInDoc && <CheckInModal item={checkInDoc} onClose={() => setCheckInDoc(null)} onConfirm={handleCheckIn} loading={checkInLoading} />}
      </>
    )
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Documents</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditDoc(null); setShowDrawer(true) }}>+ New Document</button>
      </div>

      {/* Sub-tabs */}
      <div className="cm-sub-tabs">
        <div className={`cm-sub-tab ${subTab === 'all' ? 'active' : ''}`} onClick={() => setSubTab('all')}>All Documents</div>
        <div className={`cm-sub-tab ${subTab === 'checkedin' ? 'active' : ''}`} onClick={() => setSubTab('checkedin')}>
          Checked In {checkedInDocs.length > 0 && <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{checkedInDocs.length}</span>}
        </div>
        <div className={`cm-sub-tab ${subTab === 'checkedout' ? 'active' : ''}`} onClick={() => setSubTab('checkedout')}>
          Checked Out {checkedOutDocs.length > 0 && <span style={{ background: 'var(--warning, #f59e0b)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{checkedOutDocs.length}</span>}
        </div>
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
          {/* CM-E1: Full-text content search */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input className="cm-form-input" style={{ width: 300 }} placeholder="🔍 Full-text content search…" value={ftQuery}
              onChange={e => { setFtQuery(e.target.value); if (!e.target.value) setFtResults(null) }}
              onKeyDown={async e => {
                if (e.key === 'Enter' && ftQuery.trim().length >= 2) {
                  setFtSearching(true)
                  try {
                    const res = await fetch(`/api/cm/documents/search?q=${encodeURIComponent(ftQuery)}`, { headers: authHeaders })
                    if (res.ok) { const d = await res.json(); setFtResults(d.documents || []) }
                  } catch { /* silent */ } finally { setFtSearching(false) }
                }
              }} />
            <button className="cm-btn cm-btn-secondary" disabled={ftSearching || ftQuery.trim().length < 2} onClick={async () => {
              setFtSearching(true)
              try {
                const res = await fetch(`/api/cm/documents/search?q=${encodeURIComponent(ftQuery)}`, { headers: authHeaders })
                if (res.ok) { const d = await res.json(); setFtResults(d.documents || []) }
              } catch { /* silent */ } finally { setFtSearching(false) }
            }}>{ftSearching ? 'Searching…' : 'Search Content'}</button>
            {ftResults !== null && <button className="cm-btn cm-btn-secondary" onClick={() => { setFtResults(null); setFtQuery('') }}>✕ Clear</button>}
          </div>
          {ftResults !== null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {ftResults.length} content match{ftResults.length !== 1 ? 'es' : ''} for "{ftQuery}"
              </div>
              {ftResults.length === 0 ? (
                <div className="cm-empty"><p>No documents matched that query in their content.</p></div>
              ) : (
                <table className="cm-table">
                  <thead><tr><th>Doc ID</th><th>Name</th><th>Status</th><th>Version</th><th>Actions</th></tr></thead>
                  <tbody>
                    {ftResults.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{d.name}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td>{d.version_major || 1}.{d.version_minor || 0}</td>
                        <td><button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

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

      {subTab === 'checkedin' && (
        checkedInDocs.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📥</div><p>No documents currently checked in (Pending review).</p></div>
        ) : (
          <table className="cm-table">
            <thead><tr><th>Doc ID</th><th>Name</th><th>Type</th><th>Folder</th><th>Version</th><th>Last Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {checkedInDocs.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{d.name}</td>
                  <td>{d.doc_type}</td>
                  <td>{d.folder_name || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{d.version_major}.{d.version_minor}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="cm-action-btns">
                      <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>View</button>
                      <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(d)}>Approve</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {subTab === 'checkedout' && (
        checkedOutDocs.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📤</div><p>No documents currently checked out.</p></div>
        ) : (
          <table className="cm-table">
            <thead><tr><th>Doc ID</th><th>Name</th><th>Type</th><th>Folder</th><th>Version</th><th>Checked Out By</th><th>Checked Out At</th><th>Auto-releases At</th><th>Actions</th></tr></thead>
            <tbody>
              {checkedOutDocs.map(d => {
                const expiresAt = d.checkout_expires_at ? new Date(d.checkout_expires_at) : null
                const isExpiringSoon = expiresAt && (expiresAt - Date.now()) < 2 * 60 * 60 * 1000 // within 2h
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td>{d.doc_type}</td>
                    <td>{d.folder_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{d.version_major}.{d.version_minor}</td>
                    <td style={{ fontSize: 13 }}>{d.checked_out_by_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.checked_out_at ? new Date(d.checked_out_at).toLocaleDateString() : '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {expiresAt ? (
                        <span style={{ color: isExpiringSoon ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isExpiringSoon ? 600 : 400 }}>
                          {isExpiringSoon ? '⚠ ' : ''}auto-releases {expiresAt.toLocaleString()}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div className="cm-action-btns">
                        <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>Edit</button>
                        <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(d)}>Check In</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
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
                <th>Review Mode</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <ReviewRowWithMode key={r.id} r={r} authHeaders={authHeaders} onOpen={() => setReviewStatusItem(r)} />
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Full Screen Document Creation / Edit */}
      {showDrawer && (
        <DocumentCreationScreen
          doc={editDoc}
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

// ─── Modular Documents ───────────────────────────────────────────────────────

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
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.name.trim()) return alert('Module name is required.')
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
        alert(d.error || 'Save failed.')
      }
    } catch {
      alert('Network error.')
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

function ModulesSection({ token }) {
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
    if (!confirm(`Archive module "${moduleDoc.name}"? Linked documents using this module will also be archived.`)) return
    try {
      const res = await fetch(`/api/cm/modules/${moduleDoc.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) {
        const d = await res.json()
        if (d.archived_linked_documents > 0) {
          alert(`Module archived. ${d.archived_linked_documents} linked document(s) were auto-archived.`)
        }
        loadModules()
      } else {
        const d = await res.json()
        alert(d.error || 'Archive failed.')
      }
    } catch {
      alert('Network error.')
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
                    {/* CM-E7: Module usage report */}
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={async () => {
                      try {
                        const res = await fetch(`/api/cm/documents/module-usage/${m.id}`, { headers: authHeaders })
                        if (res.ok) {
                          const d = await res.json()
                          const names = d.linked_documents.map(doc => `• ${doc.name} (${doc.status})`).join('\n') || 'No documents linked.'
                          alert(`Module "${m.name}" — Used in ${d.count} document(s):\n\n${names}`)
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
  // CM-E6: Bulk tags + view count
  const [selectedFaqIds, setSelectedFaqIds] = useState([])
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [showBulkTag, setShowBulkTag] = useState(false)

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
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedFaqIds.length > 0 && (
            <button className="cm-btn cm-btn-secondary" onClick={() => setShowBulkTag(true)}>
              🏷 Bulk Tag ({selectedFaqIds.length})
            </button>
          )}
          <button className="cm-btn cm-btn-primary" onClick={() => { setEditFaq(null); setShowDrawer(true) }}>+ New FAQ</button>
        </div>
      </div>
      {/* CM-E6: Bulk Tag Modal */}
      {showBulkTag && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 28, maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px' }}>Bulk Tag — {selectedFaqIds.length} FAQs</h3>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Tags (comma-separated)</label>
            <input className="cm-form-input" value={bulkTagInput} onChange={e => setBulkTagInput(e.target.value)} placeholder="e.g. safety, dosage, oncology" />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="cm-btn cm-btn-secondary" onClick={() => { setShowBulkTag(false); setBulkTagInput('') }}>Cancel</button>
              <button className="cm-btn cm-btn-primary" onClick={async () => {
                const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean)
                const res = await fetch('/api/cm/faqs/bulk-tags', { method: 'PATCH', headers: authHeaders, body: JSON.stringify({ ids: selectedFaqIds, tags }) })
                if (res.ok) { loadFaqs(); setSelectedFaqIds([]); setShowBulkTag(false); setBulkTagInput('') }
                else alert('Bulk tag failed.')
              }}>Apply Tags</button>
            </div>
          </div>
        </div>
      )}
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
              <th><input type="checkbox" checked={faqs.length > 0 && faqs.every(f => selectedFaqIds.includes(f.id))} onChange={e => setSelectedFaqIds(e.target.checked ? faqs.map(f => f.id) : [])} /></th>
              <th>Question</th>
              <th>Category</th>
              <th>Folder</th>
              <th>Views</th>
              <th>Version</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {faqs.map((f, i) => (
              <tr key={f.id}>
                <td><input type="checkbox" checked={selectedFaqIds.includes(f.id)} onChange={e => setSelectedFaqIds(prev => e.target.checked ? [...new Set([...prev, f.id])] : prev.filter(id => id !== f.id))} /></td>
                <td style={{ maxWidth: 300 }} onClick={() => fetch(`/api/cm/faqs/${f.id}/view`, { method: 'POST', headers: authHeaders }).catch(() => {})}>
                  {f.question?.length > 60 ? f.question.slice(0, 60) + '…' : f.question}
                </td>
                <td>{f.category || '—'}</td>
                <td>{f.folder_name || '—'}</td>
                <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{f.view_count || 0}</td>
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
                    {/* CM-E10: Schedule */}
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={async () => {
                      const cron = prompt('Set schedule (cron expression):\ne.g. "0 9 * * 1" = every Monday 9am\nLeave blank to remove schedule:')
                      if (cron === null) return
                      const emails = prompt('Email recipients (comma-separated, leave blank for none):') || ''
                      const res = await fetch(`/api/cm/merge-reports/${r.id}/schedule`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ cron_expression: cron, email_recipients: emails.split(',').map(e => e.trim()).filter(Boolean), is_active: !!cron }) })
                      if (res.ok) alert(cron ? 'Schedule saved.' : 'Schedule removed.') ; else alert('Schedule save failed.')
                    }}>⏱ Schedule</button>
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

// ─── Browse Content (Agent View) ─────────────────────────────────────────────

function BrowseSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}` }
  const [contentType, setContentType] = useState('documents')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  // CM-E9: Bookmarks
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState([])
  const authHeadersJson = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function loadBookmarks() {
    try {
      const res = await fetch('/api/cm/folders/bookmarks', { headers: authHeaders })
      if (res.ok) setBookmarks((await res.json()).bookmarks || [])
    } catch { /* silent */ }
  }

  async function toggleBookmark(item) {
    const entityType = contentType === 'documents' ? 'document' : 'faq'
    const existing = bookmarks.find(b => b.entity_type === entityType && b.entity_id === item.id)
    if (existing) {
      await fetch(`/api/cm/folders/bookmarks/${existing.id}`, { method: 'DELETE', headers: authHeaders }).catch(() => {})
    } else {
      await fetch('/api/cm/folders/bookmarks', { method: 'POST', headers: authHeadersJson, body: JSON.stringify({ entity_type: entityType, entity_id: item.id }) }).catch(() => {})
    }
    loadBookmarks()
  }

  useEffect(() => { loadBookmarks() }, [token]) // eslint-disable-line

  useEffect(() => {
    setSelectedItem(null)
    setItems([])
    setLoading(true)
    const endpoint = contentType === 'documents'
      ? `/api/cm/documents?status=Published&search=${encodeURIComponent(search)}&limit=50`
      : `/api/cm/faqs?status=Published&search=${encodeURIComponent(search)}&limit=50`
    fetch(endpoint, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setItems(d.documents || d.faqs || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [contentType, search])

  async function openItem(item) {
    setDetailLoading(true)
    setSelectedItem({ ...item, _loading: true })
    const endpoint = contentType === 'documents'
      ? `/api/cm/documents/${item.id}`
      : `/api/cm/faqs/${item.id}`
    const r = await fetch(endpoint, { headers: authHeaders }).then(x => x.json()).catch(() => item)
    setSelectedItem(r.document || r.faq || r)
    setDetailLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: selectedItem ? 340 : '100%', flexShrink: 0, borderRight: selectedItem ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[{ key: 'documents', label: 'Documents' }, { key: 'faqs', label: 'FAQs' }].map(t => (
              <button key={t.key}
                onClick={() => { setContentType(t.key); setShowBookmarks(false) }}
                style={{ padding: '6px 14px', border: 'none', background: contentType === t.key && !showBookmarks ? 'var(--primary)' : '#fff', color: contentType === t.key && !showBookmarks ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: contentType === t.key && !showBookmarks ? 600 : 400 }}
              >{t.label}</button>
            ))}
            {/* CM-E9: Bookmarks toggle */}
            <button onClick={() => { setShowBookmarks(b => !b); if (!showBookmarks) loadBookmarks() }}
              style={{ padding: '6px 14px', border: 'none', background: showBookmarks ? 'var(--warning, #f59e0b)' : '#fff', color: showBookmarks ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: showBookmarks ? 600 : 400 }}>
              ★ Bookmarks {bookmarks.length > 0 && `(${bookmarks.length})`}
            </button>
          </div>
          <input
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
            placeholder="Search published content…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {showBookmarks ? (
            bookmarks.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No bookmarks yet. Click ★ next to any item to bookmark it.</div>
            ) : bookmarks.map(b => (
              <div key={b.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>[{b.entity_type}]</span>
                  <span style={{ fontWeight: 500 }}>{b.entity_name || `ID ${b.entity_id}`}</span>
                </div>
                <button onClick={async () => { await fetch(`/api/cm/folders/bookmarks/${b.id}`, { method: 'DELETE', headers: authHeaders }); loadBookmarks() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--warning, #f59e0b)' }}>★</button>
              </div>
            ))
          ) : loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No published {contentType} found.</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8, background: selectedItem && selectedItem.id === item.id ? 'var(--primary-light, #f0f4ff)' : 'transparent' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openItem(item)}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{item.title || item.question || '(Untitled)'}</div>
                {contentType === 'documents' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {item.doc_type && <span style={{ marginRight: 8 }}>{item.doc_type}</span>}
                    {item.folder_name && <span>📁 {item.folder_name}</span>}
                  </div>
                )}
                {contentType === 'faqs' && item.tags && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tags: {item.tags}</div>
                )}
                {item.expiry_date && (
                  <div style={{ fontSize: 11, color: new Date(item.expiry_date) < new Date() ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
                    Expires: {new Date(item.expiry_date).toLocaleDateString()}
                  </div>
                )}
                </div>
                {/* CM-E9: Bookmark star */}
                <button onClick={e => { e.stopPropagation(); toggleBookmark(item) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: bookmarks.find(b => b.entity_id === item.id) ? 'var(--warning, #f59e0b)' : 'var(--border)', flexShrink: 0, alignSelf: 'center' }}>
                  {bookmarks.find(b => b.entity_id === item.id) ? '★' : '☆'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {selectedItem && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{selectedItem.title || selectedItem.question || '(Untitled)'}</h3>
            <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {detailLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
            ) : (
              <>
                {contentType === 'documents' && (
                  <>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                      {selectedItem.doc_type && <span><strong>Type:</strong> {selectedItem.doc_type}</span>}
                      {selectedItem.status && <span><strong>Status:</strong> {selectedItem.status}</span>}
                      {selectedItem.version_major != null && <span><strong>Version:</strong> v{selectedItem.version_major}.{selectedItem.version_minor ?? 0}</span>}
                      {selectedItem.expiry_date && <span><strong>Expires:</strong> {new Date(selectedItem.expiry_date).toLocaleDateString()}</span>}
                    </div>
                    {selectedItem.description && (
                      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{selectedItem.description}</div>
                    )}
                    {selectedItem.content && (
                      <div dangerouslySetInnerHTML={{ __html: selectedItem.content }} style={{ lineHeight: 1.7, fontSize: 14 }} />
                    )}
                    {selectedItem.file_path && (
                      <div style={{ marginTop: 20 }}>
                        <a href={`/api/cm/documents/${selectedItem.id}/download`} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                          Download File
                        </a>
                      </div>
                    )}
                  </>
                )}
                {contentType === 'faqs' && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Question</h4>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{selectedItem.question}</p>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Answer</h4>
                      <div dangerouslySetInnerHTML={{ __html: selectedItem.answer }} style={{ lineHeight: 1.7, fontSize: 14 }} />
                    </div>
                    {selectedItem.tags && (
                      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                        <strong>Tags:</strong> {selectedItem.tags}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Associated Docs Panel ────────────────────────────────────────────────────

const RELATION_TYPES = ['Supports', 'Supersedes', 'Translated From', 'Referenced By']

function AssociatedDocsPanel({ docId, token }) {
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
      const res = await fetch(`/api/cm/documents/${docId}/relations`, { headers: H })
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
      const res = await fetch(`/api/cm/documents?search=${encodeURIComponent(q)}&limit=10`, { headers: H })
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
      const res = await fetch(`/api/cm/documents/${docId}/relations`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ related_doc_id: selectedDoc.id, relation_type: relationType }),
      })
      if (res.ok) { setShowSearch(false); setSelectedDoc(null); setSearch(''); setSearchResults([]); load() }
      else { const d = await res.json(); alert(d.error || 'Failed to link.') }
    } catch { alert('Network error.') }
    setAdding(false)
  }

  async function handleRemove(relId) {
    if (!window.confirm('Remove this linked document?')) return
    try {
      await fetch(`/api/cm/documents/${docId}/relations/${relId}`, { method: 'DELETE', headers: H })
      load()
    } catch { alert('Network error.') }
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

// ─── Version Alerts Panel ─────────────────────────────────────────────────────

// ─── CM-E2: Version Diff Panel ────────────────────────────────────────────────

function VersionDiffPanel({ docId, token }) {
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
    fetch(`/api/cm/documents/${docId}/versions?limit=20`, { headers: H })
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
      const res = await fetch(`/api/cm/documents/${docId}/version-diff?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`, { headers: H })
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
                        dangerouslySetInnerHTML={{ __html: data.content_snapshot }} />
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

function VersionAlertsPanel({ docId, token }) {
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
        fetch(`/api/cm/documents/${docId}/alert-config`, { headers: H }),
        fetch('/api/admin/email-accounts', { headers: H }),
        fetch('/api/users', { headers: H }),
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
      const res = await fetch(`/api/cm/documents/${docId}/alert-config`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ alert_days: config.alert_days, alert_email_account_id: config.alert_email_account_id || null }),
      })
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
    setSaving(false)
  }

  async function addSubscriber() {
    if (!selectedUser) return
    setAddingUser(true)
    try {
      const res = await fetch(`/api/cm/documents/${docId}/alert-subs`, {
        method: 'POST', headers: H, body: JSON.stringify({ user_id: Number(selectedUser) }),
      })
      if (res.ok) { setSelectedUser(''); load() }
      else { const d = await res.json(); alert(d.error || 'Failed.') }
    } catch { alert('Network error.') }
    setAddingUser(false)
  }

  async function removeSub(subId) {
    try {
      await fetch(`/api/cm/documents/${docId}/alert-subs/${subId}`, { method: 'DELETE', headers: H })
      load()
    } catch { alert('Network error.') }
  }

  if (loading) return <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</p>

  const subscribedIds = new Set(subscribers.map(s => s.user_id))

  return (
    <div style={{ padding: '4px 0', maxWidth: 700 }}>
      {/* Alert Days */}
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

      {/* SMTP Email Account */}
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

      {/* Subscribers */}
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

// ─── CM Org Alerts Settings ───────────────────────────────────────────────────

function CMOrgAlertsSettings({ token }) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [settings, setSettings] = useState({})
  const [emailAccounts, setEmailAccounts] = useState([])
  const [users, setUsers] = useState([])
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

      {/* Default Alert Days */}
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

      {/* Default SMTP Account */}
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

      {/* Default Alert Roles */}
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

// ─── CM Settings Section ──────────────────────────────────────────────────────

const CM_FIELD_TYPES = [
  { key: 'document_category', label: 'Document Category' },
  { key: 'content_type', label: 'Content Type' },
  { key: 'language', label: 'Language' },
  { key: 'audience', label: 'Audience' },
  { key: 'therapeutic_area', label: 'Therapeutic Area' },
]

function CMSettingsSection({ token }) {
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

      {/* Settings sub-tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 24 }}>
        {[{ key: 'picklists', label: 'Picklists' }, { key: 'alerts', label: 'Alert Defaults' }].map(st => (
          <button key={st.key} onClick={() => setSettingsTab(st.key)}
            style={{ padding: '8px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${settingsTab === st.key ? 'var(--primary)' : 'transparent'}`, marginBottom: -2, cursor: 'pointer', fontSize: 13, fontWeight: settingsTab === st.key ? 700 : 500, color: settingsTab === st.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
            {st.label}
          </button>
        ))}
      </div>

      {settingsTab === 'picklists' && (<>
      {/* Field Type Selector */}
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

      {/* Section header */}
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

      {/* Inline Form */}
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

      {/* Table */}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { user, token } = useAuth()
  const [activeTab, setActiveTab] = useState('documents')
  const [showFolders, setShowFolders] = useState(false)

  const tabs = [
    { key: 'documents', label: 'Documents' },
    { key: 'modules', label: 'Modular Documents' },
    { key: 'faqs', label: 'FAQs' },
    { key: 'merge-reports', label: 'Merge Reports' },
    { key: 'templates', label: 'Templates' },
    { key: 'browse', label: 'Browse Content' },
    { key: 'settings', label: '⚙ Settings' },
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
          {activeTab === 'modules' && <ModulesSection token={token} />}
          {activeTab === 'faqs' && <FAQsSection token={token} user={user} />}
          {activeTab === 'merge-reports' && <MergeReportsSection token={token} />}
          {activeTab === 'templates' && <TemplatesSection token={token} />}
          {activeTab === 'browse' && <BrowseSection token={token} />}
          {activeTab === 'settings' && <CMSettingsSection token={token} />}
        </div>

        {/* Folder Manager */}
        {showFolders && (
          <FolderManager show={showFolders} onClose={() => setShowFolders(false)} token={token} />
        )}
      </div>
    </MIMSLayout>
  )
}
