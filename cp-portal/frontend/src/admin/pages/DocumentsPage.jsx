import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const VISIBLE_TO_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']

const EMPTY_UPLOAD = {
  title: '',
  category: '',
  doc_type: 'smpc',
  visible_to: [],
  source: 'manual',
  is_active: true,
}

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { clientId }                  = useParams()
  const [docs, setDocs]               = useState([])
  const [categories, setCategories]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [showUpload, setShowUpload]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [form, setForm]               = useState(EMPTY_UPLOAD)
  const [fileInput, setFileInput]     = useState(null)
  const [newCategory, setNewCategory] = useState('')
  const [editDoc, setEditDoc]         = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm]       = useState({})

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const [docsRes, catsRes] = await Promise.all([
        fetch(`/api/admin/documents/${clientId}`, { headers: adminHeaders() }),
        fetch(`/api/admin/documents/${clientId}/categories`, { headers: adminHeaders() }),
      ])
      const docsData = await docsRes.json()
      const catsData = await catsRes.json()
      setDocs(docsData.docs || [])
      setCategories(catsData.categories || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function addCategory(e) {
    e.preventDefault()
    if (!newCategory.trim()) return
    await fetch(`/api/admin/documents/${clientId}/categories`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ name: newCategory.trim() }),
    })
    setNewCategory('')
    load()
  }

  async function deleteCategory(id) {
    if (!confirm('Remove this category?')) return
    await fetch(`/api/admin/documents/${clientId}/categories/${id}`, {
      method: 'DELETE', headers: adminHeaders(),
    })
    load()
  }

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })) }

  function toggleVisibleTo(tt) {
    setForm(f => {
      const current = f.visible_to || []
      return {
        ...f,
        visible_to: current.includes(tt) ? current.filter(x => x !== tt) : [...current, tt],
      }
    })
  }

  async function handleUpload(e) {
    e.preventDefault()
    setUploadError(''); setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', form.title)
      fd.append('category', form.category)
      fd.append('doc_type', form.doc_type)
      fd.append('visible_to', JSON.stringify(form.visible_to))
      fd.append('source', form.source)
      fd.append('is_active', form.is_active ? '1' : '0')
      if (fileInput) fd.append('file', fileInput)

      const res = await fetch(`/api/admin/documents/${clientId}`, {
        method: 'POST',
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) { setUploadError(data.error || 'Upload failed.'); setSaving(false); return }
      setShowUpload(false)
      setForm(EMPTY_UPLOAD)
      setFileInput(null)
      load()
    } catch {
      setUploadError('Network error.')
    }
    setSaving(false)
  }

  function openEdit(doc) {
    setEditDoc(doc)
    setEditForm({
      is_active: !!doc.is_active,
      visible_to: doc.visible_to ? (Array.isArray(doc.visible_to) ? doc.visible_to : JSON.parse(doc.visible_to)) : [],
    })
    setShowEditModal(true)
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/documents/${clientId}/${editDoc.id}`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify(editForm),
    })
    setShowEditModal(false)
    setSaving(false)
    load()
  }

  function visibleSummary(doc) {
    const vt = doc.visible_to ? (Array.isArray(doc.visible_to) ? doc.visible_to : JSON.parse(doc.visible_to)) : []
    return vt.length ? vt.join(', ') : 'All'
  }

  if (loading) return <AdminLayout title="Document Library"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Document Library">

      {/* Categories */}
      <div className="cp-card">
        <div className="cp-card-title">Categories</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {categories.map(cat => (
            <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F3F4F6', borderRadius: 6, padding: '4px 10px', fontSize: 13 }}>
              {cat.name}
              <button type="button" className="cp-link-btn" style={{ fontSize: 11, color: '#DC2626' }} onClick={() => deleteCategory(cat.id)}>✕</button>
            </span>
          ))}
        </div>
        <form onSubmit={addCategory} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ padding: '6px 10px', border: '1px solid var(--cp-border)', borderRadius: 4, fontSize: 13, width: 200 }}
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="New category name…"
          />
          <button type="submit" className="cp-btn cp-btn-sm cp-btn-primary">Add</button>
        </form>
      </div>

      {/* Documents */}
      <div className="cp-section-header">
        <h2>Documents</h2>
        <button className="cp-btn cp-btn-primary" onClick={() => { setShowUpload(true); setUploadError('') }}>+ Upload Document</button>
      </div>

      {showUpload && (
        <div className="cp-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="cp-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Upload Document</span>
              <button className="cp-modal-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload} className="cp-modal-body">
              <div className="cp-field">
                <label>Title *</label>
                <input required value={form.title} onChange={e => setField('title', e.target.value)} />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setField('category', e.target.value)}>
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="cp-field">
                  <label>Document Type</label>
                  <select value={form.doc_type} onChange={e => setField('doc_type', e.target.value)}>
                    <option value="smpc">SmPC</option>
                    <option value="pil">PIL</option>
                    <option value="ifu">IFU</option>
                    <option value="clinical_summary">Clinical Summary</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="cp-field">
                <label>File (.pdf, .docx)</label>
                <input type="file" accept=".pdf,.docx" onChange={e => setFileInput(e.target.files[0] || null)} />
              </div>
              <div className="cp-field">
                <label>Visible To (empty = all)</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {VISIBLE_TO_TYPES.map(tt => (
                    <label key={tt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <input type="checkbox" checked={(form.visible_to || []).includes(tt)} onChange={() => toggleVisibleTo(tt)} />
                      {tt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Source</label>
                  <select value={form.source} onChange={e => setField('source', e.target.value)}>
                    <option value="manual">Manual</option>
                    <option value="mims">MIMS</option>
                  </select>
                </div>
                <div className="cp-field" style={{ justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} />
                    Active
                  </label>
                </div>
              </div>
              {uploadError && <div className="cp-error">{uploadError}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Uploading…' : 'Upload'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowUpload(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editDoc && (
        <div className="cp-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="cp-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Edit Document</span>
              <button className="cp-modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEdit} className="cp-modal-body">
              <div className="cp-field">
                <label>Visible To (empty = all)</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {VISIBLE_TO_TYPES.map(tt => (
                    <label key={tt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={(editForm.visible_to || []).includes(tt)}
                        onChange={() => setEditForm(f => {
                          const curr = f.visible_to || []
                          return { ...f, visible_to: curr.includes(tt) ? curr.filter(x => x !== tt) : [...curr, tt] }
                        })}
                      />
                      {tt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="cp-field" style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowEditModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="cp-empty"><p>No documents uploaded yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Type</th>
                <th>File</th>
                <th>Size</th>
                <th>Visible To</th>
                <th>Source</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.category || '—'}</td>
                  <td>
                    <span className="cp-badge" style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                      {d.doc_type}
                    </span>
                  </td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name || '—'}</td>
                  <td>{formatFileSize(d.file_size)}</td>
                  <td>{visibleSummary(d)}</td>
                  <td>{d.source || 'manual'}</td>
                  <td>{d.is_active ? '✓' : '—'}</td>
                  <td>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(d)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
