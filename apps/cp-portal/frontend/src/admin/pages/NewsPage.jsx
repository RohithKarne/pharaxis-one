import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

const TARGET_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']

const EMPTY_FORM = {
  title: '',
  body_html: '',
  category: '',
  publish_at: '',
  target_types: [],
  status: 'draft',
  is_pinned: false,
}

export default function NewsPage() {
  const { clientId }              = useParams()
  const { canWrite, canPublish, canApprove } = useAdminAuth()
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editPost, setEditPost]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [error, setError]         = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    setSelectedIds([])
    try {
      const res = await fetch(`/api/admin/news/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      setPosts(d.posts || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelectedIds(prev => prev.length === posts.length ? [] : posts.map(p => p.id))
  }

  async function bulkAction(action) {
    if (!selectedIds.length) return
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${selectedIds.length} post(s)?`)) return
    setError('')
    try {
      const res = await fetch(`/api/admin/news/${clientId}/bulk`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ ids: selectedIds, action }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Bulk ${action} failed (error ${res.status}).`); return }
    } catch {
      setError('Network error — please try again.')
      return
    }
    load()
  }

  function openCreate() {
    setEditPost(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  function openEdit(post) {
    setEditPost(post)
    setForm({
      title:        post.title || '',
      body_html:    post.body_html || '',
      category:     post.category || '',
      publish_at:   post.publish_at ? post.publish_at.slice(0, 16) : '',
      target_types: post.target_types_json ? (Array.isArray(post.target_types_json) ? post.target_types_json : JSON.parse(post.target_types_json)) : [],
      status:       post.status || 'draft',
      is_pinned:    !!post.is_pinned,
    })
    setError('')
    setShowForm(true)
  }

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })) }

  function toggleTargetType(tt) {
    setForm(f => {
      const current = f.target_types || []
      return {
        ...f,
        target_types: current.includes(tt) ? current.filter(x => x !== tt) : [...current, tt],
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      const url    = editPost
        ? `/api/admin/news/${clientId}/${editPost.id}`
        : `/api/admin/news/${clientId}`
      const method = editPost ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: adminHeaders(),
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); setSaving(false); return }
      setShowForm(false)
      load()
    } catch {
      setError('Network error.')
    }
    setSaving(false)
  }

  async function handleArchive(post) {
    if (!confirm(`Archive "${post.title}"?`)) return
    setError('')
    try {
      const res = await fetch(`/api/admin/news/${clientId}/${post.id}`, {
        method: 'DELETE', headers: adminHeaders(),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Archive failed (error ${res.status}).`); return }
    } catch {
      setError('Network error — please try again.')
      return
    }
    load()
  }

  // S4-8: quick status change without opening modal
  async function quickAction(post, newStatus) {
    setError('')
    try {
      const res = await fetch(`/api/admin/news/${clientId}/${post.id}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ ...post, target_types: post.target_types_json ? JSON.parse(post.target_types_json) : [], status: newStatus }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Status change failed (error ${res.status}).`); return }
    } catch {
      setError('Network error — please try again.')
      return
    }
    load()
  }

  function statusBadgeStyle(status) {
    if (status === 'published') return { background: '#DCFCE7', color: '#16A34A' }
    if (status === 'draft')     return { background: '#F3F4F6', color: '#6B7280' }
    if (status === 'scheduled') return { background: '#DBEAFE', color: '#2563EB' }
    if (status === 'archived')  return { background: '#F3F4F6', color: '#9CA3AF', opacity: 0.7 }
    if (status === 'review')    return { background: '#FEF3C7', color: '#D97706' }   // S4-8
    if (status === 'approved')  return { background: '#CCFBF1', color: '#0D9488' }   // S4-8
    return {}
  }

  function targetSummary(post) {
    const raw = post.target_types_json || post.target_types
    const tt = raw ? (Array.isArray(raw) ? raw : JSON.parse(raw)) : []
    return tt.length ? tt.join(', ') : 'All'
  }

  if (loading) return <AdminLayout title="News & Announcements"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="News & Announcements">
      <div className="cp-section-header">
        <h2>News & Announcements</h2>
        {canWrite && <button className="cp-btn cp-btn-primary" onClick={openCreate}>+ New Post</button>}
      </div>

      {error && !showForm && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}

      {showForm && (
        <div className="cp-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="cp-modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>{editPost ? 'Edit Post' : 'New Post'}</span>
              <button className="cp-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="cp-modal-body">
              <div className="cp-field">
                <label>Title *</label>
                <input required value={form.title} onChange={e => setField('title', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Content (HTML supported)</label>
                <textarea rows={6} value={form.body_html} onChange={e => setField('body_html', e.target.value)} />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Category / Tag</label>
                  <input value={form.category} onChange={e => setField('category', e.target.value)} placeholder="e.g. Product Update" />
                </div>
                <div className="cp-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setField('status', e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="review">In Review</option>
                    {canPublish && <option value="approved">Approved</option>}
                    {canPublish && <option value="scheduled">Scheduled</option>}
                    {canPublish && <option value="published">Published</option>}
                    {canPublish && <option value="archived">Archived</option>}
                  </select>
                </div>
              </div>
              <div className="cp-field">
                <label>Publish At</label>
                <input type="datetime-local" value={form.publish_at} onChange={e => setField('publish_at', e.target.value)} />
              </div>
              <div className="cp-field">
                <label>Target Types (empty = all)</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {TARGET_TYPES.map(tt => (
                    <label key={tt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <input type="checkbox" checked={(form.target_types || []).includes(tt)} onChange={() => toggleTargetType(tt)} />
                      {tt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="cp-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={!!form.is_pinned} onChange={e => setField('is_pinned', e.target.checked)} />
                  Pin to top (shows above other posts in portal)
                </label>
              </div>
              {error && <div className="cp-error">{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : (editPost ? 'Save Changes' : 'Create Post')}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
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
          <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ marginLeft: 'auto' }} onClick={() => setSelectedIds([])}>Clear</button>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="cp-empty"><p>No posts yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                {canPublish && (
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selectedIds.length === posts.length && posts.length > 0} onChange={toggleSelectAll} aria-label="Select all" />
                  </th>
                )}
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Pinned</th>
                <th>Targets</th>
                <th>Publish At</th>
                <th>Views</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id} style={{ background: selectedIds.includes(p.id) ? '#EFF6FF' : undefined }}>
                  {canPublish && (
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Select ${p.title}`} />
                    </td>
                  )}
                  <td>{p.title}</td>
                  <td>{p.category || '—'}</td>
                  <td>
                    <span className="cp-badge" style={{ ...statusBadgeStyle(p.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                      {p.status}
                    </span>
                  </td>
                  <td>{p.is_pinned ? '📌' : '—'}</td>
                  <td>{targetSummary(p)}</td>
                  <td>{p.publish_at ? p.publish_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{p.view_count || 0}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {canWrite && <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(p)}>Edit</button>}
                    {canWrite && p.status === 'draft' && (
                      <button className="cp-btn cp-btn-sm" style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }} onClick={() => quickAction(p, 'review')}>Submit for Review</button>
                    )}
                    {canApprove && p.status === 'review' && (
                      <>
                        <button className="cp-btn cp-btn-sm" style={{ background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }} onClick={() => quickAction(p, 'approved')}>Approve</button>
                        <button className="cp-btn cp-btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => quickAction(p, 'draft')}>Reject</button>
                      </>
                    )}
                    {canPublish && <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => handleArchive(p)}>Archive</button>}
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
