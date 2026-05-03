import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const STEP_BLUEPRINT = [
  { key: 'users', label: 'Step 1: Users & Roles', path: '/admin/users' },
  { key: 'taxonomy', label: 'Step 2: Taxonomy Model', path: '/admin/taxonomy' },
  { key: 'lifecycle', label: 'Step 3: Lifecycle Rules', path: '/admin/lifecycle' },
  { key: 'security', label: 'Step 4: Security Policy', path: '/admin/security' },
  { key: 'integrations', label: 'Step 5: Integrations', path: '/admin/integrations' },
  { key: 'workflows', label: 'Step 6: Workflow Templates', path: '/admin/workflows' }
]

export default function AdminSetupWizardPage() {
  const token = getOrgToken()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState({
    users: { done: false, detail: 'No users found.' },
    taxonomy: { done: false, detail: 'No taxonomy types found.' },
    lifecycle: { done: false, detail: 'No lifecycle transitions found.' },
    security: { done: false, detail: 'Security policy not configured.' },
    integrations: { done: false, detail: 'No integration connectors found.' },
    workflows: { done: false, detail: 'No workflow templates found.' }
  })

  async function loadWizardStatus() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [users, types, authPolicy, connectors, templates] = await Promise.all([
        apiJson('/api/users', { headers: authHeaders(token) }),
        apiJson('/api/taxonomy/types', { headers: authHeaders(token) }),
        apiJson('/api/admin/security/auth-policy', { headers: authHeaders(token) }),
        apiJson('/api/admin/integrations/connectors', { headers: authHeaders(token) }),
        apiJson('/api/workflows/templates', { headers: authHeaders(token) })
      ])

      const transitionResults = await Promise.all(
        (types || []).map(type => apiJson(`/api/lifecycle/transitions/${type.id}`, { headers: authHeaders(token) }))
      )
      const transitionCount = transitionResults.reduce((total, rows) => total + (rows?.length || 0), 0)

      setStatus({
        users: {
          done: (users || []).length > 0,
          detail: `${(users || []).length} users`
        },
        taxonomy: {
          done: (types || []).length > 0,
          detail: `${(types || []).length} content types`
        },
        lifecycle: {
          done: transitionCount > 0,
          detail: `${transitionCount} transition rules`
        },
        security: {
          done: String(authPolicy?.mfa_mode || 'off') !== 'off' || Boolean(authPolicy?.sso_enabled),
          detail: `MFA: ${authPolicy?.mfa_mode || 'off'} | SSO: ${authPolicy?.sso_enabled ? 'on' : 'off'}`
        },
        integrations: {
          done: (connectors || []).length > 0,
          detail: `${(connectors || []).length} connectors`
        },
        workflows: {
          done: (templates || []).length > 0,
          detail: `${(templates || []).length} templates`
        }
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWizardStatus()
  }, [])

  const summary = useMemo(() => {
    const total = STEP_BLUEPRINT.length
    const completed = STEP_BLUEPRINT.filter(step => status[step.key]?.done).length
    return { total, completed, pending: total - completed }
  }, [status])

  const nextPendingStep = useMemo(
    () => STEP_BLUEPRINT.find(step => !status[step.key]?.done) || null,
    [status]
  )

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Platform / Setup Wizard</p>
            <h2 className="workspace-hero-title">Configuration Wizard</h2>
            <p className="panel-note">Run all foundation setup in the correct order and track completion.</p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Guided Mode</span>
            <span className="workspace-hero-date">{summary.completed}/{summary.total} complete</span>
          </div>
        </section>

        <section className="panel span-12">
          <AdminTabs active="wizard" />
          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Total Steps</span><strong>{summary.total}</strong></article>
            <article className="stat-card-mini"><span>Completed</span><strong>{summary.completed}</strong></article>
            <article className="stat-card-mini"><span>Pending</span><strong>{summary.pending}</strong></article>
          </div>
          <div className="signal-grid">
            <article className="config-group-card">
              <h4>Recommended Next Step</h4>
              <p className="panel-note">
                {nextPendingStep
                  ? `${nextPendingStep.label} should be completed next so users do not enter a half-configured workflow.`
                  : 'Core setup is complete. You can now move into content creation and operational review.'}
              </p>
              {nextPendingStep ? (
                <div className="detail-actions">
                  <Link className="btn-secondary link-button" to={nextPendingStep.path}>Open Next Step</Link>
                </div>
              ) : null}
            </article>
            <article className="config-group-card">
              <h4>User Clarity Rule</h4>
              <p className="panel-note">Finish Users, Taxonomy, and Lifecycle before asking authors or reviewers to work in Vault.</p>
            </article>
          </div>
          <div className="detail-actions">
            <button className="btn-secondary" type="button" onClick={loadWizardStatus}>Refresh Status</button>
            <Link className="btn-secondary link-button" to="/admin">Back to Console</Link>
          </div>
        </section>

        <section className="panel span-12">
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Evaluating setup readiness...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Status</th>
                    <th>Validation</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {STEP_BLUEPRINT.map(step => (
                    <tr key={step.key}>
                      <td>{step.label}</td>
                      <td>
                        <span className={status[step.key]?.done ? 'status-chip success' : 'status-chip pending'}>
                          {status[step.key]?.done ? 'Complete' : 'Pending'}
                        </span>
                      </td>
                      <td>{status[step.key]?.detail || '-'}</td>
                      <td>
                        <Link className="btn-secondary link-button" to={step.path}>Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
