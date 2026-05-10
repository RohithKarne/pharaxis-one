import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SuperadminTabs from '../components/SuperadminTabs'
import SuperadminTopbar from '../components/SuperadminTopbar'
import { apiJson, authHeaders, getSuperadminToken } from '../../common/utils/session'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function SuperadminOrgDetailPage() {
  const { id } = useParams()
  const token = getSuperadminToken()
  const [payload, setPayload] = useState(null)
  const [hardening, setHardening] = useState(null)
  const [hardeningForm, setHardeningForm] = useState({
    superadmin_policy_pack: 'regulated_enterprise',
    superadmin_license_tier: 'enterprise',
    superadmin_seat_limit: '250',
    superadmin_session_timeout_min: '480',
    superadmin_enforce_mfa: true,
    superadmin_release_channel: 'stable'
  })
  const [loading, setLoading] = useState(true)
  const [savingHardening, setSavingHardening] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'viewer' })

  async function loadOrgUsers() {
    if (!token) {
      setError('Superadmin session missing. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [usersPayload, hardeningPayload] = await Promise.all([
        apiJson(`/api/superadmin/orgs/${id}/users`, {
          headers: authHeaders(token)
        }),
        apiJson(`/api/superadmin/orgs/${id}/hardening`, {
          headers: authHeaders(token)
        })
      ])
      setPayload(usersPayload)
      setHardening(hardeningPayload)
      if (hardeningPayload?.policy) {
        setHardeningForm({
          superadmin_policy_pack: hardeningPayload.policy.superadmin_policy_pack || 'regulated_enterprise',
          superadmin_license_tier: hardeningPayload.policy.superadmin_license_tier || 'enterprise',
          superadmin_seat_limit: String(hardeningPayload.policy.superadmin_seat_limit || 250),
          superadmin_session_timeout_min: String(hardeningPayload.policy.superadmin_session_timeout_min || 480),
          superadmin_enforce_mfa: Boolean(hardeningPayload.policy.superadmin_enforce_mfa),
          superadmin_release_channel: hardeningPayload.policy.superadmin_release_channel || 'stable'
        })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function createUser(event) {
    event.preventDefault()
    setCreatingUser(true)
    setError('')
    setSuccess('')
    try {
      await apiJson(`/api/superadmin/orgs/${id}/users`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(userForm)
      })
      setSuccess(`User "${userForm.name}" created successfully.`)
      setUserForm({ name: '', email: '', password: '', role: 'viewer' })
      setShowCreateUser(false)
      await loadOrgUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreatingUser(false)
    }
  }

  async function saveHardeningPolicy(event) {
    event.preventDefault()
    setSavingHardening(true)
    setError('')
    setSuccess('')
    try {
      await apiJson(`/api/superadmin/orgs/${id}/hardening`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...hardeningForm,
          superadmin_seat_limit: Number(hardeningForm.superadmin_seat_limit || 250),
          superadmin_session_timeout_min: Number(hardeningForm.superadmin_session_timeout_min || 480)
        })
      })
      setSuccess('Hardening policy saved.')
      await loadOrgUsers()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingHardening(false)
    }
  }

  useEffect(() => {
    loadOrgUsers()
  }, [id])

  return (
    <div className="app-shell">
      <SuperadminTopbar
        title="Organization Users"
        subtitle="Role and status drill-down for selected tenant"
      />

      <main className="dashboard-grid">
        <section className="panel span-12">
          <SuperadminTabs active="orgs" />
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to="/orgs">
              Back to Organizations
            </Link>
            <Link className="btn-primary link-button" to={`/orgs/${id}/domain`}>
              Manage Custom URL
            </Link>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="panel-note">Loading organization users...</p> : null}
        </section>

        {!loading && hardening ? (
          <section className="panel span-4">
            <h3>Hardening Policy</h3>
            <p className="panel-note">
              Active users: {hardening.seats?.active_users || 0} / Seat limit: {hardening.policy?.superadmin_seat_limit || 0}
            </p>
            <form className="auth-form users-create-form" onSubmit={saveHardeningPolicy}>
              <div className="form-field">
                <label htmlFor="hardening-policy-pack">Policy Pack</label>
                <input
                  id="hardening-policy-pack"
                  value={hardeningForm.superadmin_policy_pack}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_policy_pack: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="hardening-license-tier">License Tier</label>
                <input
                  id="hardening-license-tier"
                  value={hardeningForm.superadmin_license_tier}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_license_tier: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="hardening-seat-limit">Seat Limit</label>
                <input
                  id="hardening-seat-limit"
                  type="number"
                  min={1}
                  value={hardeningForm.superadmin_seat_limit}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_seat_limit: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="hardening-session-timeout">Session Timeout (min)</label>
                <input
                  id="hardening-session-timeout"
                  type="number"
                  min={30}
                  value={hardeningForm.superadmin_session_timeout_min}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_session_timeout_min: event.target.value })}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="hardening-release-channel">Release Channel</label>
                <select
                  id="hardening-release-channel"
                  value={hardeningForm.superadmin_release_channel}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_release_channel: event.target.value })}
                >
                  <option value="stable">Stable</option>
                  <option value="preview">Preview</option>
                </select>
              </div>
              <label className="status-toggle">
                <input
                  type="checkbox"
                  checked={hardeningForm.superadmin_enforce_mfa}
                  onChange={event => setHardeningForm({ ...hardeningForm, superadmin_enforce_mfa: event.target.checked })}
                />
                <span>Enforce MFA</span>
              </label>
              <button className="btn-primary" type="submit" disabled={savingHardening}>
                {savingHardening ? 'Saving...' : 'Save Hardening'}
              </button>
            </form>
          </section>
        ) : null}

        {!loading && payload ? (
          <section className="panel span-8">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>{payload.org?.name} ({payload.org?.slug})</h3>
                <p className="panel-note" style={{ marginTop: 4 }}>Status: {payload.org?.status}</p>
              </div>
              <button
                className="btn-primary"
                onClick={() => setShowCreateUser(v => !v)}
              >
                {showCreateUser ? 'Cancel' : '+ Add User'}
              </button>
            </div>

            {showCreateUser ? (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem 1.25rem', margin: '1rem 0' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Create New User</h4>
                <form className="auth-form users-create-form" onSubmit={createUser}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-field">
                      <label>Full Name</label>
                      <input
                        value={userForm.name}
                        onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                        placeholder="Jane Smith"
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={userForm.email}
                        onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                        placeholder="jane@viatris.com"
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Password</label>
                      <input
                        type="password"
                        value={userForm.password}
                        onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                        placeholder="Temporary password"
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Role</label>
                      <select
                        value={userForm.role}
                        onChange={e => setUserForm({ ...userForm, role: e.target.value })}
                      >
                        <option value="admin">Admin</option>
                        <option value="author">Author</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="approver">Approver</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button className="btn-primary" type="submit" disabled={creatingUser}>
                      {creatingUser ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.users || []).map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className={Number(user.is_active) === 1 ? 'status-chip success' : 'status-chip pending'}>
                          {Number(user.is_active) === 1 ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>{formatDate(user.last_login_at)}</td>
                    </tr>
                  ))}
                  {!payload.users?.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No users found for this organization.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
