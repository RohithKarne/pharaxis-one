import { useEffect, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../../vault/components/VaultPageHeader'

export default function ContentChannelsPage() {
  const token = getOrgToken()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    app_name: '',
    webhook_url: ''
  })

  async function loadChannels() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const rows = await apiJson('/api/admin/channels', { headers: authHeaders(token) })
      setChannels(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadChannels()
  }, [])

  async function createChannel(event) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await apiJson('/api/admin/channels', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(form)
      })
      setForm({ app_name: '', webhook_url: '' })
      await loadChannels()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreating(false)
    }
  }

  async function toggleStatus(channel) {
    setError('')
    try {
      await apiJson(`/api/admin/channels/${channel.id}`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          status: channel.status === 'active' ? 'inactive' : 'active'
        })
      })
      await loadChannels()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Administration / Channels"
          title="Content Channels"
          note="Downstream app integrations and API key issuance."
          statusLabel="Admin Console"
        />
        <section className="panel span-4">
          <AdminTabs active="channels" />
          <h3>Create Channel</h3>
          <form className="auth-form users-create-form" onSubmit={createChannel}>
            <div className="form-field">
              <label htmlFor="channel-name">App Name</label>
              <input
                id="channel-name"
                value={form.app_name}
                onChange={event => setForm({ ...form, app_name: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="channel-webhook">Webhook URL</label>
              <input
                id="channel-webhook"
                value={form.webhook_url}
                onChange={event => setForm({ ...form, webhook_url: event.target.value })}
                placeholder="https://example.com/webhook"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Channel'}
            </button>
          </form>
        </section>

        <section className="panel span-8">
          <h3>Registered Channels</h3>
          <p className="panel-note">Manage status and visibility of external content consumers.</p>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading channels...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Webhook</th>
                    <th>API Key</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(channel => (
                    <tr key={channel.id}>
                      <td>{channel.app_name}</td>
                      <td>{channel.webhook_url || '-'}</td>
                      <td className="cell-mono">{channel.api_key}</td>
                      <td>
                        <span className={channel.status === 'active' ? 'status-chip success' : 'status-chip pending'}>
                          {channel.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn-secondary" onClick={() => toggleStatus(channel)}>
                          {channel.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!channels.length ? (
                    <tr>
                      <td colSpan={5} className="users-empty">No channels configured.</td>
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
