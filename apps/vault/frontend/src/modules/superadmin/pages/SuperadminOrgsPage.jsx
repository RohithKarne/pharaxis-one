import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SuperadminTabs from '../components/SuperadminTabs'
import { apiJson, authHeaders, getSuperadminToken } from '../../common/utils/session'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

export default function SuperadminOrgsPage() {
  const token = getSuperadminToken()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    slug: '',
    doc_number_prefix: '',
    storage_quota_mb: '10240'
  })

  async function loadOrgs() {
    if (!token) {
      setError('Superadmin session missing. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const rows = await apiJson('/api/superadmin/orgs', {
        headers: authHeaders(token)
      })
      setOrgs(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrgs()
  }, [])

  async function createOrg(event) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await apiJson('/api/superadmin/orgs', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...form,
          storage_quota_mb: Number(form.storage_quota_mb || 10240)
        })
      })
      setForm({ name: '', slug: '', doc_number_prefix: '', storage_quota_mb: '10240' })
      await loadOrgs()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(org) {
    setError('')
    try {
      await apiJson(`/api/superadmin/orgs/${org.id}/status`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status: org.status === 'active' ? 'inactive' : 'active'
        })
      })
      await loadOrgs()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Organization Management</h1>
          <p className="brand-subtitle">Provision and govern tenant organizations</p>
        </div>
        <span className="topbar-pill">Pharaxis Internal</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <SuperadminTabs active="orgs" />
          <h3>Create Organization</h3>
          <form className="auth-form users-create-form" onSubmit={createOrg}>
            <div className="form-field">
              <label htmlFor="org-name">Name</label>
              <input
                id="org-name"
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="org-slug">Slug</label>
              <input
                id="org-slug"
                value={form.slug}
                onChange={event => setForm({ ...form, slug: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="org-prefix">Doc Prefix</label>
              <input
                id="org-prefix"
                value={form.doc_number_prefix}
                onChange={event => setForm({ ...form, doc_number_prefix: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="org-quota">Storage Quota (MB)</label>
              <input
                id="org-quota"
                type="number"
                min={1024}
                value={form.storage_quota_mb}
                onChange={event => setForm({ ...form, storage_quota_mb: event.target.value })}
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Organization'}
            </button>
          </form>
        </section>

        <section className="panel span-8">
          <h3>Organizations</h3>
          <p className="panel-note">User count and storage are shown for each tenant.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading organizations...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Slug</th>
                    <th>Status</th>
                    <th>Users</th>
                    <th>Storage</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map(org => (
                    <tr key={org.id}>
                      <td>{org.name}</td>
                      <td>{org.slug}</td>
                      <td>
                        <span className={org.status === 'active' ? 'status-chip success' : 'status-chip pending'}>
                          {org.status}
                        </span>
                      </td>
                      <td>{org.user_count}</td>
                      <td>{(Number(org.storage_used_kb || 0) / 1024).toFixed(2)} MB</td>
                      <td>{formatDate(org.created_at)}</td>
                      <td className="detail-actions">
                        <Link className="btn-secondary link-button" to={`/control-tower/orgs/${org.id}`}>
                          View Users
                        </Link>
                        <button className="btn-secondary" onClick={() => toggleStatus(org)}>
                          {org.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!orgs.length ? (
                    <tr>
                      <td colSpan={7} className="users-empty">No organizations found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
