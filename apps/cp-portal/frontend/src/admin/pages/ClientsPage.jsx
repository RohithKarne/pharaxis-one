import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import { apiJson } from '../../shared/api/client'
import { clientPortalUrl } from '../../shared/utils/portalUrl'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ name: '', code: '', description: '', contact_name: '', contact_email: '' })
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [copiedCode, setCopiedCode] = useState('')
  const navigate = useNavigate()

  async function copyPortalUrl(code) {
    try {
      await navigator.clipboard.writeText(clientPortalUrl(code))
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(''), 1500)
    } catch { /* clipboard blocked — link is still openable */ }
  }

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    try {
      const data = await apiJson('/api/admin/clients', { headers: adminHeaders() })
      setClients(data.clients || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    setError('')
    if (clients.some(c => c.code?.toLowerCase() === form.code?.toLowerCase())) {
      setError('Client code already exists. Please choose a unique code.')
      return
    }
    setSaving(true)
    try {
      const data = await apiJson('/api/admin/clients', { method: 'POST', headers: adminHeaders(), body: form })
      setShowAdd(false)
      setForm({ name: '', code: '', description: '', contact_name: '', contact_email: '' })
      await loadClients()
      navigate(`/admin/clients/${data.id}`)
    } catch (requestError) {
      setError(requestError.message || 'Failed to create client.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id, current) {
    try {
      await apiJson(`/api/admin/clients/${id}`, { method: 'PATCH', headers: adminHeaders(), body: { is_active: !current } })
      loadClients()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <AdminLayout title="Clients">
      <div className="cp-section-header">
        <h2>All Clients</h2>
        <button className="cp-btn cp-btn-primary" onClick={() => setShowAdd(true)}>+ Add Client</button>
      </div>

      {showAdd && (
        <div className="cp-modal-overlay" onClick={() => !saving && setShowAdd(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Add New Client</span>
              <button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form onSubmit={handleAdd} className="cp-modal-body" autoComplete="off">
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Company Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Ardelyx Medical" />
                </div>
                <div className="cp-field">
                  <label>Client Code *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s/g, '-') }))} required placeholder="e.g. ardelyx" />
                  <small>Used in portal URL. Lowercase, no spaces.</small>
                </div>
              </div>
              <div className="cp-field">
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Contact Name</label>
                  <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div className="cp-field">
                  <label>Contact Email</label>
                  <input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
              </div>
              {error && <div className="cp-error">{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Client'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && (
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="cp-search-input"
        />
      )}

      {loading ? <div className="cp-loading">Loading…</div> : (
        <table className="cp-table">
          <thead>
            <tr><th>Name</th><th>Code</th><th>Portal URL</th><th>Contact</th><th>Submissions</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {clients.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.code?.toLowerCase().includes(search.toLowerCase())).map(c => (
              <tr key={c.id}>
                <td><button className="cp-link-btn" onClick={() => navigate(`/admin/clients/${c.id}`)}>{c.name}</button></td>
                <td><code>{c.code}</code></td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <a href={clientPortalUrl(c.code)} target="_blank" rel="noopener noreferrer" className="cp-link-btn" title={clientPortalUrl(c.code)}>Open ↗</a>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => copyPortalUrl(c.code)}>
                      {copiedCode === c.code ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </td>
                <td>{c.contact_email || '—'}</td>
                <td>{c.submission_count || 0}</td>
                <td><span className={`cp-badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="cp-btn cp-btn-sm" onClick={() => navigate(`/admin/clients/${c.id}`)}>Configure</button>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(c.id, c.is_active)}>
                      {c.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  )
}
