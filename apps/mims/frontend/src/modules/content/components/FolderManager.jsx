import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import StatusBadge from './StatusBadge'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function FolderManager({ show, onClose, token }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [folders, setFolders] = useState([])
  const [products, setProducts] = useState([])
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editFolder, setEditFolder] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', product_id: '', site_id: '', description: '', status: 'Active' })
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
        httpFetch('/api/cm/folders', { headers: authHeaders }),
        httpFetch('/api/admin/products-full', { headers: authHeaders }),
        httpFetch('/api/admin/sites', { headers: authHeaders }),
      ])
      if (fRes.ok) setFolders((await fRes.json()).folders || [])
      if (pRes.ok) setProducts((await pRes.json()).products || [])
      if (sRes.ok) setSites((await sRes.json()).sites || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token]) // eslint-disable-line

  async function loadPermissions(folderId) {
    setPermLoading(true)
    try {
      const [permRes, sgRes] = await Promise.all([
        httpFetch(`/api/cm/folders/${folderId}/permissions`, { headers: authHeaders }),
        httpFetch('/api/admin/security-groups', { headers: authHeaders }),
      ])
      if (permRes.ok) setPermissions((await permRes.json()).permissions || [])
      if (sgRes.ok) setSecGroups((await sgRes.json()).groups || [])
    } catch { /* silent */ }
    setPermLoading(false)
  }

  async function handleAddPermission() {
    if (!permGroupId) return
    try {
      const res = await httpFetch(`/api/cm/folders/${permFolder.id}/permissions`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ group_id: Number(permGroupId), permission_level: permLevel }),
      })
      if (res.ok) { setPermGroupId(''); loadPermissions(permFolder.id) }
      else { const d = await res.json(); toast.error(d.error || 'Failed to add permission.') }
    } catch { toast.error('Network error.') }
  }

  async function handleRemovePermission(groupId) {
    if (!confirm('Remove this permission?')) return
    try {
      const res = await httpFetch(`/api/cm/folders/${permFolder.id}/permissions/${groupId}`, { method: 'DELETE', headers: authHeaders })
      if (res.ok) loadPermissions(permFolder.id)
    } catch { toast.error('Network error.') }
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
    if (!form.name.trim()) return toast.warn('Folder name is required.')
    setSaving(true)
    try {
      const url = editFolder ? `/api/cm/folders/${editFolder.id}` : '/api/cm/folders'
      const method = editFolder ? 'PUT' : 'POST'
      const res = await httpFetch(url, { method, headers: authHeaders, body: JSON.stringify(form) })
      if (res.ok) { setShowForm(false); load() }
      else { const d = await res.json(); toast.error(d.error || 'Save failed.') }
    } catch { toast.error('Network error.') }
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

    {permFolder && (
      <div className="cm-modal-overlay" onClick={() => setPermFolder(null)}>
        <div className="cm-modal" style={{ width: 560, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="cm-modal-title" style={{ margin: 0 }}>Permissions — {permFolder.name}</h3>
            <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPermFolder(null)}>Close</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Control which security groups can access this folder and at what level.</p>

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
