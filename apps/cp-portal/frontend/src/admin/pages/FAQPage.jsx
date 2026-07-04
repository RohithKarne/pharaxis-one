import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const EMPTY = { question: '', answer: '', category: '', sort_order: 0, is_published: true }

export default function FAQPage() {
  const { clientId }          = useParams()
  const [faqs, setFaqs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/faq/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      setFaqs(d.faqs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  function openCreate() { setEditItem(null); setForm(EMPTY); setError(''); setShowForm(true) }
  function openEdit(f)  { setEditItem(f); setForm({ question: f.question, answer: f.answer, category: f.category || '', sort_order: f.sort_order || 0, is_published: !!f.is_published }); setError(''); setShowForm(true) }

  async function handleSubmit(e) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const url    = editItem ? `/api/admin/faq/${clientId}/${editItem.id}` : `/api/admin/faq/${clientId}`
      const method = editItem ? 'PUT' : 'POST'
      const payload = { ...form, sort_order: form.sort_order === '' ? 0 : Number(form.sort_order) }
      const res    = await fetch(url, { method, headers: adminHeaders(), body: JSON.stringify(payload) })
      const d      = await res.json()
      if (!res.ok) { setError(d.error || 'Save failed.'); setSaving(false); return }
      setShowForm(false); load()
    } catch { setError('Network error.') }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this FAQ item?')) return
    await fetch(`/api/admin/faq/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    load()
  }

  const grouped = faqs.reduce((acc, f) => {
    const cat = f.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  if (loading) return <AdminLayout><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="cp-section-header">
        <h2>FAQ</h2>
        <button className="cp-btn cp-btn-primary" onClick={openCreate}>+ Add FAQ Item</button>
      </div>

      {showForm && (
        <div className="cp-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="cp-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>{editItem ? 'Edit FAQ Item' : 'New FAQ Item'}</span>
              <button className="cp-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="cp-modal-body">
              <div className="cp-field">
                <label>Question *</label>
                <input required value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="e.g. How do I submit a medical inquiry?" />
              </div>
              <div className="cp-field">
                <label>Answer *</label>
                <textarea required rows={5} value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} placeholder="Provide a clear, helpful answer…" />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Category</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Submissions, Account…" />
                </div>
                <div className="cp-field">
                  <label>Sort Order</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value === '' ? '' : Number(e.target.value) }))} />
                </div>
              </div>
              <div className="cp-field">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
                  Published (visible on portal)
                </label>
              </div>
              {error && <div className="cp-error">{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Item'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {faqs.length === 0 ? (
        <div className="cp-empty"><p>No FAQ items yet. Add your first one.</p></div>
      ) : (
        Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="cp-card" style={{ marginBottom: 16 }}>
            <div className="cp-card-title">{cat}</div>
            {items.map(f => (
              <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--cp-border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', marginBottom: 4 }}>{f.question}</div>
                  <div style={{ fontSize: 13, color: '#6B7280', whiteSpace: 'pre-wrap' }}>{f.answer}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {!f.is_published && <span style={{ fontSize: 11, background: '#F3F4F6', color: '#9CA3AF', padding: '2px 6px', borderRadius: 10 }}>Draft</span>}
                  <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(f)}>Edit</button>
                  <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ color: '#DC2626' }} onClick={() => handleDelete(f.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </AdminLayout>
  )
}
