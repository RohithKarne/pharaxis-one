import { useEffect, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const ROLE_OPTIONS = ['admin', 'author', 'reviewer', 'approver', 'viewer']

export default function AdminSecurityPage() {
  const token = getOrgToken()
  const [loading, setLoading] = useState(true)
  const [savingAuth, setSavingAuth] = useState(false)
  const [savingRbac, setSavingRbac] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [authPolicy, setAuthPolicy] = useState({
    mfa_mode: 'off',
    session_hours: 8,
    sso_enabled: false,
    sso_provider: '',
    sso_entrypoint: '',
    sso_entity_id: ''
  })
  const [rbacPolicy, setRbacPolicy] = useState({
    version: 1,
    action_role_matrix: {}
  })

  async function loadData() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [authPayload, rbacPayload] = await Promise.all([
        apiJson('/api/admin/security/auth-policy', { headers: authHeaders(token) }),
        apiJson('/api/workflows/admin/rbac-policy', { headers: authHeaders(token) })
      ])
      setAuthPolicy(authPayload)
      setRbacPolicy(rbacPayload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function saveAuthPolicy(event) {
    event.preventDefault()
    setSavingAuth(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson('/api/admin/security/auth-policy', {
        method: 'PUT',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(authPolicy)
      })
      setAuthPolicy(payload)
      setSuccess('Authentication policy saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingAuth(false)
    }
  }

  function toggleRole(action, role) {
    const existing = Array.isArray(rbacPolicy.action_role_matrix?.[action])
      ? rbacPolicy.action_role_matrix[action]
      : []
    const nextRoles = existing.includes(role)
      ? existing.filter(item => item !== role)
      : [...existing, role]

    setRbacPolicy({
      ...rbacPolicy,
      action_role_matrix: {
        ...rbacPolicy.action_role_matrix,
        [action]: nextRoles
      }
    })
  }

  async function saveRbacPolicy() {
    setSavingRbac(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson('/api/workflows/admin/rbac-policy', {
        method: 'PUT',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action_role_matrix: rbacPolicy.action_role_matrix
        })
      })
      setRbacPolicy({
        ...rbacPolicy,
        ...payload
      })
      setSuccess('Workflow RBAC policy saved.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingRbac(false)
    }
  }

  const actionKeys = Object.keys(rbacPolicy.action_role_matrix || {})

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Security</h1>
          <p className="brand-subtitle">SSO/MFA readiness and workflow permission governance</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <AdminTabs active="security" />
          <h3>Authentication Policy</h3>
          <form className="auth-form users-create-form" onSubmit={saveAuthPolicy}>
            <div className="form-field">
              <label htmlFor="mfa-mode">MFA Mode</label>
              <select
                id="mfa-mode"
                value={authPolicy.mfa_mode}
                onChange={event => setAuthPolicy({ ...authPolicy, mfa_mode: event.target.value })}
              >
                <option value="off">Off</option>
                <option value="optional">Optional</option>
                <option value="required">Required</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="session-hours">Session Hours</label>
              <input
                id="session-hours"
                type="number"
                min="1"
                max="24"
                value={authPolicy.session_hours}
                onChange={event => setAuthPolicy({ ...authPolicy, session_hours: Number(event.target.value) })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="sso-enabled">SSO Enabled</label>
              <select
                id="sso-enabled"
                value={authPolicy.sso_enabled ? 'yes' : 'no'}
                onChange={event => setAuthPolicy({ ...authPolicy, sso_enabled: event.target.value === 'yes' })}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="sso-provider">SSO Provider</label>
              <input
                id="sso-provider"
                value={authPolicy.sso_provider || ''}
                onChange={event => setAuthPolicy({ ...authPolicy, sso_provider: event.target.value })}
                placeholder="Azure AD / Okta / Ping"
              />
            </div>
            <div className="form-field">
              <label htmlFor="sso-entrypoint">SSO Entrypoint</label>
              <input
                id="sso-entrypoint"
                value={authPolicy.sso_entrypoint || ''}
                onChange={event => setAuthPolicy({ ...authPolicy, sso_entrypoint: event.target.value })}
                placeholder="https://idp.example.com/sso"
              />
            </div>
            <div className="form-field">
              <label htmlFor="sso-entity-id">SSO Entity ID</label>
              <input
                id="sso-entity-id"
                value={authPolicy.sso_entity_id || ''}
                onChange={event => setAuthPolicy({ ...authPolicy, sso_entity_id: event.target.value })}
                placeholder="urn:company:vault"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={savingAuth}>
              {savingAuth ? 'Saving...' : 'Save Auth Policy'}
            </button>
          </form>
        </section>

        <section className="panel span-8">
          <h3>Workflow RBAC Matrix</h3>
          <p className="panel-note">Policy version: {rbacPolicy.version || 1}. Disable risky actions by role before production launch.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="panel-note">Loading security policy...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    {ROLE_OPTIONS.map(role => (
                      <th key={role}>{role}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actionKeys.map(action => (
                    <tr key={action}>
                      <td className="cell-mono">{action}</td>
                      {ROLE_OPTIONS.map(role => {
                        const checked = (rbacPolicy.action_role_matrix?.[action] || []).includes(role)
                        return (
                          <td key={`${action}-${role}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRole(action, role)}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {!actionKeys.length ? (
                    <tr>
                      <td colSpan={ROLE_OPTIONS.length + 1} className="users-empty">No RBAC actions found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="taxonomy-actions" style={{ marginTop: 12 }}>
            <button className="btn-primary" onClick={saveRbacPolicy} disabled={savingRbac || loading}>
              {savingRbac ? 'Saving...' : 'Save RBAC Policy'}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
