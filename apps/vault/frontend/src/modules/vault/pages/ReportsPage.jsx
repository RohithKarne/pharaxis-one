import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, lifecycleBadgeClass } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

function numberValue(value) {
  const n = Number(value || 0)
  return Number.isNaN(n) ? 0 : n
}

export default function ReportsPage() {
  const token = getOrgToken()
  const [summary, setSummary] = useState(null)
  const [contentStatus, setContentStatus] = useState([])
  const [workflowSla, setWorkflowSla] = useState([])
  const [expiryForecast, setExpiryForecast] = useState([])
  const [userActivity, setUserActivity] = useState([])
  const [channelDistribution, setChannelDistribution] = useState([])
  const [presets, setPresets] = useState([])
  const [presetName, setPresetName] = useState('')
  const [presetReportKey, setPresetReportKey] = useState('content-status')
  const [presetFrequency, setPresetFrequency] = useState('none')
  const [presetRecipients, setPresetRecipients] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadReports() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [
        summaryData,
        statusData,
        workflowData,
        expiryData,
        activityData,
        channelData,
        presetData
      ] = await Promise.all([
        apiJson('/api/reports/summary', { headers: authHeaders(token) }),
        apiJson('/api/reports/content-status', { headers: authHeaders(token) }),
        apiJson('/api/reports/workflow-sla', { headers: authHeaders(token) }),
        apiJson('/api/reports/expiry-forecast', { headers: authHeaders(token) }),
        apiJson('/api/reports/user-activity', { headers: authHeaders(token) }),
        apiJson('/api/reports/channel-distribution', { headers: authHeaders(token) }),
        apiJson('/api/reports/presets', { headers: authHeaders(token) })
      ])
      setSummary(summaryData)
      setContentStatus(Array.isArray(statusData) ? statusData : [])
      setWorkflowSla(Array.isArray(workflowData) ? workflowData : [])
      setExpiryForecast(Array.isArray(expiryData) ? expiryData : [])
      setUserActivity(Array.isArray(activityData) ? activityData : [])
      setChannelDistribution(Array.isArray(channelData) ? channelData : [])
      setPresets(Array.isArray(presetData) ? presetData : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  const contentSummary = summary?.content || {}
  const workflowSummary = summary?.workflow || {}
  const expirySummary = summary?.expiry || {}
  const distributionSummary = summary?.distribution || {}

  async function savePreset(event) {
    event.preventDefault()
    if (!presetName.trim()) {
      setError('Preset name is required.')
      return
    }

    setError('')
    setSuccess('')
    try {
      await apiJson('/api/reports/presets', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: presetName.trim(),
          report_key: presetReportKey,
          schedule_frequency: presetFrequency,
          schedule_recipients: presetRecipients.trim() || null,
          filters: {}
        })
      })
      setPresetName('')
      setPresetRecipients('')
      setSuccess('Report preset saved.')
      await loadReports()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function exportLink(reportKey) {
    return `/api/reports/export/${reportKey}.csv`
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Intelligence / Reports"
          title="Analytics & Reporting"
          note="Operational reports for lifecycle status, workflow SLA, expiry risk, user activity, and channel distribution."
          statusLabel="Admin Reports"
          actions={<button className="btn-secondary" type="button" onClick={loadReports}>Refresh</button>}
        />

        {error ? (
          <section className="panel span-12">
            <div className="auth-error">{error}</div>
          </section>
        ) : null}
        {success ? (
          <section className="panel span-12">
            <div className="panel-note-card">{success}</div>
          </section>
        ) : null}

        <section className="stat-card">
          <div className="stat-label">Documents</div>
          <h2 className="stat-value">{loading ? '—' : numberValue(contentSummary.total)}</h2>
        </section>

        <section className="panel span-12">
          <div className="folder-header">
            <div>
              <h3>Exports & Saved Reports</h3>
              <p className="panel-note">Export CSV evidence or save a reusable report preset with optional schedule metadata.</p>
            </div>
            <div className="detail-actions">
              <a className="btn-secondary link-button" href={exportLink('content-status')}>Content CSV</a>
              <a className="btn-secondary link-button" href={exportLink('workflow-sla')}>Workflow CSV</a>
              <a className="btn-secondary link-button" href={exportLink('expiry-forecast')}>Expiry CSV</a>
              <a className="btn-secondary link-button" href={exportLink('user-activity')}>Activity CSV</a>
              <a className="btn-secondary link-button" href={exportLink('channel-distribution')}>Channel CSV</a>
            </div>
          </div>
          <form className="auth-form upload-version-form" onSubmit={savePreset}>
            <div className="upload-grid">
              <div className="form-field">
                <label htmlFor="preset-name">Preset Name</label>
                <input id="preset-name" value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="Weekly expiry review" />
              </div>
              <div className="form-field">
                <label htmlFor="preset-report">Report</label>
                <select id="preset-report" value={presetReportKey} onChange={event => setPresetReportKey(event.target.value)}>
                  <option value="content-status">Content Status</option>
                  <option value="workflow-sla">Workflow SLA</option>
                  <option value="expiry-forecast">Expiry Forecast</option>
                  <option value="user-activity">User Activity</option>
                  <option value="channel-distribution">Channel Distribution</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="preset-frequency">Schedule</label>
                <select id="preset-frequency" value={presetFrequency} onChange={event => setPresetFrequency(event.target.value)}>
                  <option value="none">No Schedule</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="preset-recipients">Recipients</label>
                <input id="preset-recipients" value={presetRecipients} onChange={event => setPresetRecipients(event.target.value)} placeholder="quality@example.com" />
              </div>
            </div>
            <button className="btn-secondary" type="submit">Save Preset</button>
          </form>
          <ul className="simple-list">
            {presets.map(preset => (
              <li key={preset.id}>
                <span>{preset.name}</span>
                <strong>{preset.report_key} · {preset.schedule_frequency}</strong>
              </li>
            ))}
            {!presets.length ? <li>No saved report presets yet.</li> : null}
          </ul>
        </section>
        <section className="stat-card">
          <div className="stat-label">Active Workflows</div>
          <h2 className="stat-value">{loading ? '—' : numberValue(workflowSummary.active)}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Expiring in 30 Days</div>
          <h2 className="stat-value">{loading ? '—' : numberValue(expirySummary.expiring_30)}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Distribution Events</div>
          <h2 className="stat-value">{loading ? '—' : numberValue(distributionSummary.total_events)}</h2>
        </section>

        <section className="panel span-6">
          <h3>Content Status by Type</h3>
          <p className="panel-note">Shows lifecycle distribution across configured content types.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Lifecycle</th>
                  <th>Type</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {contentStatus.map((row, index) => (
                  <tr key={`${row.lifecycle_state}-${row.content_type_name}-${index}`}>
                    <td><span className={lifecycleBadgeClass(row.lifecycle_state)}>{row.lifecycle_state}</span></td>
                    <td>{row.content_type_name || 'Unclassified'}</td>
                    <td>{row.total}</td>
                  </tr>
                ))}
                {!contentStatus.length ? (
                  <tr>
                    <td colSpan={3} className="users-empty">No content status data yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6">
          <h3>Channel Distribution</h3>
          <p className="panel-note">Tracks publishing activity by channel so admins know where content went.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Withdrawn</th>
                  <th>Last Event</th>
                </tr>
              </thead>
              <tbody>
                {channelDistribution.map(row => (
                  <tr key={row.channel_id}>
                    <td>{row.app_name}</td>
                    <td>{row.channel_status}</td>
                    <td>{numberValue(row.sent)}</td>
                    <td>{numberValue(row.failed)}</td>
                    <td>{numberValue(row.withdrawn)}</td>
                    <td>{formatDate(row.last_event_at)}</td>
                  </tr>
                ))}
                {!channelDistribution.length ? (
                  <tr>
                    <td colSpan={6} className="users-empty">No channels configured yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-12">
          <h3>Workflow SLA Report</h3>
          <p className="panel-note">Review duration, pending tasks, and overdue work by document workflow.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Elapsed Hours</th>
                  <th>Tasks</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {workflowSla.map(row => (
                  <tr key={row.id}>
                    <td>{row.doc_number}</td>
                    <td>{row.title}</td>
                    <td>{row.status}</td>
                    <td>{row.elapsed_hours}</td>
                    <td>{row.task_count}</td>
                    <td>{numberValue(row.pending_tasks)}</td>
                    <td>{numberValue(row.overdue_tasks)}</td>
                    <td>{formatDate(row.started_at)}</td>
                  </tr>
                ))}
                {!workflowSla.length ? (
                  <tr>
                    <td colSpan={8} className="users-empty">No workflow SLA data yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6">
          <h3>Expiry Forecast</h3>
          <p className="panel-note">Near-term expiry exposure ordered by due date.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Title</th>
                  <th>Expiry</th>
                  <th>Days</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {expiryForecast.slice(0, 25).map(row => (
                  <tr key={row.id}>
                    <td><Link to={`/vault/content/${row.id}`}>{row.doc_number}</Link></td>
                    <td>{row.title}</td>
                    <td>{formatDate(row.expiry_date)}</td>
                    <td>{row.days_remaining}</td>
                    <td>{row.owner_name || '-'}</td>
                  </tr>
                ))}
                {!expiryForecast.length ? (
                  <tr>
                    <td colSpan={5} className="users-empty">No expiry dates recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6">
          <h3>User Activity</h3>
          <p className="panel-note">Audit activity by user for operational accountability.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Events</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {userActivity.map(row => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.role}</td>
                    <td>{row.audit_events}</td>
                    <td>{formatDate(row.last_activity_at)}</td>
                  </tr>
                ))}
                {!userActivity.length ? (
                  <tr>
                    <td colSpan={4} className="users-empty">No user activity found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
