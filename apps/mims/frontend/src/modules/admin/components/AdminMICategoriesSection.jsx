import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'

export default function AdminMICategoriesSection({ H }) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/mi-categories', { headers: H })
      if (res.ok) setCategories((await res.json()).categories || [])
    } catch { /* silent */ }
    setLoading(false)
  }, []) // eslint-disable-line

  useEffect(() => { load() }, [load])

  function openAdd() {
    setEditing(null)
    setForm({ name: '', description: '', sort_order: 0 })
    setError('')
    setShowForm(true)
  }

  function openEdit(cat) {
    setEditing(cat)
    setForm({ name: cat.name, description: cat.description || '', sort_order: cat.sort_order || 0 })
    setError('')
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const url = editing ? `/api/admin/mi-categories/${editing.id}` : '/api/admin/mi-categories'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setShowForm(false); load() }
      else { const d = await res.json(); setError(d.error || 'Save failed.') }
    } catch { setError('Network error.') }
    setSaving(false)
  }

  async function handleToggle(cat) {
    try {
      await fetch(`/api/admin/mi-categories/${cat.id}`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cat, is_active: cat.is_active ? 0 : 1 }),
      })
      load()
    } catch { /* silent */ }
  }

  async function handleDelete(cat) {
    if (!await confirm(`Delete "${cat.name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/mi-categories/${cat.id}`, { method: 'DELETE', headers: H })
      if (res.ok) load()
      else { const d = await res.json(); toast.error(d.error || 'Delete failed.') }
    } catch { toast.error('Network error.') }
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>MI Categories</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Configure Medical Information categories used in document creation and case forms.
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          + Add Category
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700 }}>{editing ? 'Edit Category' : 'New Category'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Name *</label>
              <input
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Oncology"
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Description</label>
              <input
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Sort Order</label>
              <input
                type="number"
                style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                value={form.sort_order}
                onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '7px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Add'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '7px 14px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</p>
      ) : categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
          No MI categories yet. Add your first one to start classifying documents.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>NAME</th>
              <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>DESCRIPTION</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>ORDER</th>
              <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>STATUS</th>
              <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>{cat.name}</td>
                <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{cat.description || '—'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{cat.sort_order}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: cat.is_active ? '#e6f4ee' : '#f5f5f5',
                    color: cat.is_active ? '#007a5a' : '#888',
                  }}>
                    {cat.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(cat)} style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>Edit</button>
                    <button onClick={() => handleToggle(cat)} style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: cat.is_active ? 'var(--text-muted)' : 'var(--primary)' }}>
                      {cat.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(cat)} style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--danger)' }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
