import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

const VISIBLE_TO_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']

// S4-8: approval statuses added
const ALL_docStatuses    = ['draft', 'review', 'approved', 'published', 'scheduled', 'archived']
const WRITER_docStatuses = ['draft', 'review']  // content_manager can only set these

const EMPTY_UPLOAD = {
  title: '',
  category: '',
  doc_type: 'smpc',
  visible_to: [],
  source: 'manual',
  status: 'draft',
  version: '',
  expires_at: '',
  publish_at: '',
  is_active: true,
}

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const { clientId }                  = useParams()
  const { canWrite, canPublish, canApprove } = useAdminAuth()
  // S4-8: role-aware status options
  const docStatuses = canPublish ? ALL_docStatuses : WRITER_docStatuses
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
  const [expiringDocs, setExpiringDocs] = useState([])
  const [alertMsg, setAlertMsg]         = useState(null)
  const [sendingAlert, setSendingAlert] = useState(false)
  const [selectedIds, setSelectedIds]   = useState([])

  useEffect(() => { load() }, [clientId])

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelectedIds(prev => prev.length === docs.length ? [] : docs.map(d => d.id))
  }

  async function bulkAction(action) {
    if (!selectedIds.length) return
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${selectedIds.length} document(s)?`)) return
    await fetch(`/api/admin/documents/${clientId}/bulk`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ids: selectedIds, action }),
    })
    load()
  }

  async function load() {
    setLoading(true)
    setSelectedIds([])
    try {
      const [docsRes, catsRes, expiringRes] = await Promise.all([
        fetch(`/api/admin/documents/${clientId}`, { headers: adminHeaders() }),
        fetch(`/api/admin/documents/${clientId}/categories`, { headers: adminHeaders() }),
        fetch(`/api/admin/documents/${clientId}/expiring`, { headers: adminHeaders() }),
      ])
      const docsData     = await docsRes.json()
      const catsData     = await catsRes.json()
      const expiringData = await expiringRes.json()
      setDocs(docsData.documents || [])
      setCategories(catsData.categories || [])
      setExpiringDocs(expiringData.expiring || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function sendExpiryAlert() {
    setSendingAlert(true)
    setAlertMsg(null)
    try {
      const res = await fetch(`/api/admin/documents/${clientId}/expiry-alerts/send`, {
        method: 'POST', headers: adminHeaders(),
      })
      const d = await res.json()
      setAlertMsg({ type: res.ok ? 'success' : 'error', text: d.message || d.error })
    } catch {
      setAlertMsg({ type: 'error', text: 'Network error sending alert.' })
    }
    setSendingAlert(false)
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
      fd.append('status', form.status)
      fd.append('version', form.version || '')
      fd.append('expires_at', form.expires_at || '')
      fd.append('publish_at', form.publish_at || '')
      fd.append('is_active', form.is_active ? '1' : '0')
      if (fileInput) fd.append('file', fileInput)

      const res = await fetch(`/api/admin/documents/${clientId}`, {
        method: 'POST',
        body: fd, // multipart upload; auth rides the session cookie, browser sets Content-Type
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
      visible_to: doc.visible_to_json ? (Array.isArray(doc.visible_to_json) ? doc.visible_to_json : JSON.parse(doc.visible_to_json)) : [],
      status: doc.status || 'published',
      version: doc.version || '',
      expires_at: doc.expires_at ? doc.expires_at.slice(0, 10) : '',
      publish_at: doc.publish_at ? doc.publish_at.slice(0, 16) : '',
    })
    setShowEditModal(true)
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/documents/${clientId}/${editDoc.id}`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ ...editForm, publish_at: editForm.publish_at || null }),
    })
    setShowEditModal(false)
    setSaving(false)
    load()
  }

  // S4-8: quick status change without opening modal
  async function quickDocAction(doc, newStatus) {
    await fetch(`/api/admin/documents/${clientId}/${doc.id}`, {
      method: 'PUT',
      headers: adminHeaders(),
      body: JSON.stringify({ status: newStatus }),
    })
    load()
  }

  function visibleSummary(doc) {
    const vt = doc.visible_to_json ? (Array.isArray(doc.visible_to_json) ? doc.visible_to_json : JSON.parse(doc.visible_to_json)) : []
    return vt.length ? vt.join(', ') : 'All'
  }

  if (loading) return <AdminLayout title="Document Library"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Document Library">

      {/* S5-14: Expiry alert banner */}
      {expiringDocs.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 8,
          background: '#FEF3C7', border: '1px solid #FDE68A',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#92400E', flex: 1 }}>
            <strong>⚠ {expiringDocs.length} document{expiringDocs.length > 1 ? 's' : ''}</strong>
            {' '}
            {expiringDocs.filter(d => d.expires_at.slice(0,10) < new Date().toISOString().slice(0,10)).length > 0
              ? `(${expiringDocs.filter(d => d.expires_at.slice(0,10) < new Date().toISOString().slice(0,10)).length} expired)`
              : ''
            }
            {' '}require attention within the next 30 days.
          </span>
          {alertMsg && (
            <span style={{ fontSize: 12, color: alertMsg.type === 'success' ? '#16A34A' : '#DC2626', fontWeight: 500 }}>
              {alertMsg.type === 'success' ? '✓ ' : '✗ '}{alertMsg.text}
            </span>
          )}
          <button
            className="cp-btn cp-btn-sm"
            style={{ background: '#D97706', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
            onClick={sendExpiryAlert}
            disabled={sendingAlert}
          >
            {sendingAlert ? 'Sending…' : 'Send Email Alert'}
          </button>
        </div>
      )}

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
        {canWrite && <button className="cp-btn cp-btn-primary" onClick={() => { setShowUpload(true); setUploadError('') }}>+ Upload Document</button>}
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
                  <label>Status</label>
                  <select value={form.status} onChange={e => setField('status', e.target.value)}>
                    {docStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="cp-field">
                  <label>Version</label>
                  <input value={form.version} onChange={e => setField('version', e.target.value)} placeholder="e.g. v1.0" />
                </div>
              </div>
              <div className="cp-field">
                <label>Expiry Date (optional)</label>
                <input type="date" value={form.expires_at} onChange={e => setField('expires_at', e.target.value)} />
              </div>
              {(form.status === 'draft' || form.status === 'scheduled') && (
                <div className="cp-field">
                  <label>Schedule Publish At</label>
                  <input
                    type="datetime-local"
                    value={form.publish_at}
                    onChange={e => setField('publish_at', e.target.value)}
                  />
                  <span style={{ fontSize: 11, color: '#6B7280', marginTop: 4, display: 'block' }}>
                    {form.status === 'scheduled' ? 'Will auto-publish at this date/time' : 'Leave blank to publish immediately when status changes to Published'}
                  </span>
                </div>
              )}
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
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Status</label>
                  <select value={editForm.status || 'published'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {docStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="cp-field">
                  <label>Version</label>
                  <input value={editForm.version || ''} onChange={e => setEditForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. v1.2" />
                </div>
              </div>
              <div className="cp-field">
                <label>Expiry Date (optional)</label>
                <input type="date" value={editForm.expires_at || ''} onChange={e => setEditForm(f => ({ ...f, expires_at: e.target.value }))} />
              </div>
              {(editForm.status === 'draft' || editForm.status === 'scheduled' || !editForm.status) && (
                <div className="cp-field">
                  <label>Schedule Publish At</label>
                  <input
                    type="datetime-local"
                    value={editForm.publish_at || ''}
                    onChange={e => setEditForm(f => ({ ...f, publish_at: e.target.value }))}
                  />
                  <span style={{ fontSize: 11, color: '#6B7280', marginTop: 4, display: 'block' }}>
                    {editForm.status === 'scheduled' ? 'Will auto-publish at this date/time' : 'Leave blank to publish immediately when status changes to Published'}
                  </span>
                </div>
              )}
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

      {/* S5-11: Bulk action bar */}
      {canPublish && selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
          <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 500 }}>{selectedIds.length} selected</span>
          <button className="cp-btn cp-btn-sm" style={{ background: '#16A34A', color: '#fff', border: 'none' }} onClick={() => bulkAction('publish')}>Publish</button>
          <button className="cp-btn cp-btn-sm" style={{ background: '#6B7280', color: '#fff', border: 'none' }} onClick={() => bulkAction('archive')}>Archive</button>
          <button className="cp-btn cp-btn-sm" style={{ background: '#DC2626', color: '#fff', border: 'none' }} onClick={() => bulkAction('delete')}>Delete</button>
          <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="cp-empty"><p>No documents uploaded yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                {canPublish && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selectedIds.length === docs.length && docs.length > 0} onChange={toggleSelectAll} aria-label="Select all" />
                  </th>
                )}
                <th>Title</th>
                <th>Category</th>
                <th>Type</th>
                <th>Status</th>
                <th>Version</th>
                <th>Expiry</th>
                <th>Size</th>
                <th>Downloads</th>
                <th>Visible To</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ background: selectedIds.includes(d.id) ? '#EFF6FF' : undefined }}>
                  {canPublish && (
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} aria-label={`Select ${d.title}`} />
                    </td>
                  )}
                  <td>{d.title}</td>
                  <td>{d.category || '—'}</td>
                  <td>
                    <span className="cp-badge" style={{ background: '#F3F4F6', color: '#374151', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                      {d.doc_type}
                    </span>
                  </td>
                  <td>
                    <span className="cp-badge" style={{
                      background: d.status === 'published' ? '#DCFCE7' : d.status === 'archived' ? '#F3F4F6' : d.status === 'review' ? '#FEF3C7' : d.status === 'approved' ? '#CCFBF1' : d.status === 'scheduled' ? '#DBEAFE' : '#F3F4F6',
                      color:      d.status === 'published' ? '#16A34A' : d.status === 'archived' ? '#9CA3AF' : d.status === 'review' ? '#D97706' : d.status === 'approved' ? '#0D9488' : d.status === 'scheduled' ? '#2563EB' : '#6B7280',
                      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    }}>{d.status || 'draft'}</span>
                  </td>
                  <td>{d.version || '—'}</td>
                  <td style={{ color: d.expires_at && new Date(d.expires_at) < new Date() ? '#DC2626' : undefined }}>
                    {d.expires_at ? d.expires_at.slice(0, 10) : '—'}
                  </td>
                  <td>{formatFileSize(d.file_size)}</td>
                  <td>{d.download_count || 0}</td>
                  <td>{visibleSummary(d)}</td>
                  <td>{d.is_active ? '✓' : '—'}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canWrite && <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(d)}>Edit</button>}
                    {canWrite && d.status === 'draft' && (
                      <button className="cp-btn cp-btn-sm" style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }} onClick={() => quickDocAction(d, 'review')}>Submit for Review</button>
                    )}
                    {canApprove && d.status === 'review' && (
                      <>
                        <button className="cp-btn cp-btn-sm" style={{ background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }} onClick={() => quickDocAction(d, 'approved')}>Approve</button>
                        <button className="cp-btn cp-btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => quickDocAction(d, 'draft')}>Reject</button>
                      </>
                    )}
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
