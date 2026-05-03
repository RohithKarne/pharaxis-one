import { useEffect, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const DEFAULT_FORM = {
  name: '',
  connector_type: 'veeva_vault',
  base_url: '',
  auth_type: 'none',
  auth_value: ''
}

export default function AdminIntegrationsPage() {
  const token = getOrgToken()
  const [connectors, setConnectors] = useState([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const connectorSummary = connectors.reduce((summary, connector) => {
    summary.total += 1
    if (connector.status === 'active') summary.active += 1
    if (String(connector.last_test_status || '').toLowerCase() === 'pass') summary.healthy += 1
    if (String(connector.last_test_status || '').toLowerCase() === 'fail') summary.failing += 1
    if (!connector.last_test_status || connector.status !== 'active') summary.needs_attention += 1
    return summary
  }, {
    total: 0,
    active: 0,
    healthy: 0,
    failing: 0,
    needs_attention: 0
  })

  async function loadConnectors() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const rows = await apiJson('/api/admin/integrations/connectors', {
        headers: authHeaders(token)
      })
      setConnectors(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConnectors()
  }, [])

  async function createConnector(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await apiJson('/api/admin/integrations/connectors', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(form)
      })
      setForm(DEFAULT_FORM)
      setSuccess('Integration connector created.')
      await loadConnectors()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleConnectorStatus(connector) {
    setError('')
    setSuccess('')
    try {
      await apiJson(`/api/admin/integrations/connectors/${connector.id}`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status: connector.status === 'active' ? 'inactive' : 'active'
        })
      })
      setSuccess(`Connector "${connector.name}" is now ${connector.status === 'active' ? 'inactive' : 'active'}.`)
      await loadConnectors()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function testConnector(connector) {
    setTestingId(connector.id)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/admin/integrations/connectors/${connector.id}/test`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      setSuccess(`Connector test ${payload.test_status}: ${payload.test_message}`)
      await loadConnectors()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Integrations</h1>
          <p className="brand-subtitle">Connector registry for Veeva Vault-style downstream integrations and health checks</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-4">
          <AdminTabs active="integrations" />
          <h3>Create Connector</h3>
          <form className="auth-form users-create-form" onSubmit={createConnector}>
            <div className="form-field">
              <label htmlFor="connector-name">Name</label>
              <input
                id="connector-name"
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="connector-type">Type</label>
              <select
                id="connector-type"
                value={form.connector_type}
                onChange={event => setForm({ ...form, connector_type: event.target.value })}
              >
                <option value="veeva_vault">Veeva Vault</option>
                <option value="mims">MIMS</option>
                <option value="crm">CRM</option>
                <option value="safety">Safety</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="connector-url">Base URL</label>
              <input
                id="connector-url"
                value={form.base_url}
                onChange={event => setForm({ ...form, base_url: event.target.value })}
                placeholder="https://example.com/health"
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="connector-auth-type">Auth Type</label>
              <select
                id="connector-auth-type"
                value={form.auth_type}
                onChange={event => setForm({ ...form, auth_type: event.target.value })}
              >
                <option value="none">None</option>
                <option value="api_key">API Key</option>
                <option value="basic">Basic</option>
                <option value="oauth2">OAuth2</option>
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="connector-auth-value">Auth Value</label>
              <input
                id="connector-auth-value"
                value={form.auth_value}
                onChange={event => setForm({ ...form, auth_value: event.target.value })}
                placeholder="Optional secret/token"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Creating...' : 'Create Connector'}
            </button>
          </form>
        </section>

        <section className="panel span-8">
          <h3>Connector Registry</h3>
          <p className="panel-note">Track status, test results, and authentication profile for each integration endpoint.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="panel-note">Loading connectors...</p> : null}

          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Total</span><strong>{connectorSummary.total}</strong></article>
            <article className="stat-card-mini"><span>Active</span><strong>{connectorSummary.active}</strong></article>
            <article className="stat-card-mini"><span>Healthy</span><strong>{connectorSummary.healthy}</strong></article>
            <article className="stat-card-mini"><span>Failing</span><strong>{connectorSummary.failing}</strong></article>
            <article className="stat-card-mini"><span>Needs Attention</span><strong>{connectorSummary.needs_attention}</strong></article>
          </div>

          {!loading && connectors.length ? (
            <ul className="simple-list">
              {connectors
                .filter(connector => connector.status !== 'active' || String(connector.last_test_status || '').toLowerCase() !== 'pass')
                .slice(0, 4)
                .map(connector => (
                  <li key={`attention-${connector.id}`}>
                    <span>
                      {connector.name} needs attention
                    </span>
                    <strong>{connector.status === 'active' ? connector.last_test_status || 'untested' : 'inactive'}</strong>
                  </li>
                ))}
              {!connectors.filter(connector => connector.status !== 'active' || String(connector.last_test_status || '').toLowerCase() !== 'pass').length ? (
                <li>
                  <span>All active connectors are currently passing their latest test.</span>
                  <strong>Healthy</strong>
                </li>
              ) : null}
            </ul>
          ) : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Base URL</th>
                    <th>Auth</th>
                    <th>Status</th>
                    <th>Last Test</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {connectors.map(connector => (
                    <tr key={connector.id}>
                      <td>{connector.name}</td>
                      <td>{connector.connector_type}</td>
                      <td>{connector.base_url}</td>
                      <td>
                        <div>{connector.auth_type}</div>
                        <div className="panel-note">{connector.auth_value_masked || '-'}</div>
                      </td>
                      <td>
                        <span className={connector.status === 'active' ? 'status-chip success' : 'status-chip pending'}>
                          {connector.status}
                        </span>
                      </td>
                      <td>
                        <div>{connector.last_test_status || 'unknown'}</div>
                        <div className="panel-note">{connector.last_test_message || '-'}</div>
                      </td>
                      <td>
                        <div className="taxonomy-actions">
                          <button className="btn-secondary" onClick={() => toggleConnectorStatus(connector)}>
                            {connector.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => testConnector(connector)}
                            disabled={connector.status !== 'active' || testingId === connector.id}
                          >
                            {testingId === connector.id ? 'Testing...' : 'Test'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!connectors.length ? (
                    <tr>
                      <td colSpan={7} className="users-empty">No integration connectors configured.</td>
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
