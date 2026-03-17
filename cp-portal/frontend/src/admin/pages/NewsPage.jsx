import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const TARGET_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']

const EMPTY_FORM = {
  title: '',
  body_html: '',
  category: '',
  publish_at: '',
  target_types: [],
  status: 'draft',
}

export default function NewsPage() {
  const { clientId }              = useParams()
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editPost, setEditPost]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [error, setError]         = useState('')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/news/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      setPosts(d.posts || [])
    } catch { /* ignore */ }
    setLoading(false)
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
      target_types: post.target_types ? (Array.isArray(post.target_types) ? post.target_types : JSON.parse(post.target_types)) : [],
      status:       post.status || 'draft',
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
    await fetch(`/api/admin/news/${clientId}/${post.id}`, {
      method: 'DELETE', headers: adminHeaders(),
    })
    load()
  }

  function statusBadgeStyle(status) {
    if (status === 'published') return { background: '#DCFCE7', color: '#16A34A' }
    if (status === 'draft')     return { background: '#F3F4F6', color: '#6B7280' }
    if (status === 'scheduled') return { background: '#DBEAFE', color: '#2563EB' }
    if (status === 'archived')  return { background: '#F3F4F6', color: '#9CA3AF', opacity: 0.7 }
    return {}
  }

  function targetSummary(post) {
    const tt = post.target_types ? (Array.isArray(post.target_types) ? post.target_types : JSON.parse(post.target_types)) : []
    return tt.length ? tt.join(', ') : 'All'
  }

  if (loading) return <AdminLayout title="News & Announcements"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="News & Announcements">
      <div className="cp-section-header">
        <h2>News & Announcements</h2>
        <button className="cp-btn cp-btn-primary" onClick={openCreate}>+ New Post</button>
      </div>

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
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
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
              {error && <div className="cp-error">{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : editPost ? 'Save Changes' : 'Create Post'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <div className="cp-empty"><p>No posts yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Targets</th>
                <th>Publish At</th>
                <th>Views</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>{p.category || '—'}</td>
                  <td>
                    <span className="cp-badge" style={{ ...statusBadgeStyle(p.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                      {p.status}
                    </span>
                  </td>
                  <td>{targetSummary(p)}</td>
                  <td>{p.publish_at ? p.publish_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{p.view_count || 0}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(p)}>Edit</button>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => handleArchive(p)}>Archive</button>
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
