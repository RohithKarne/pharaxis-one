import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function NotificationsPage() {
  const token = getOrgToken()
  const [summary, setSummary] = useState({
    total: 0,
    overdue: 0,
    due_soon: 0,
    pending_tasks: 0
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadNotifications() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson('/api/workflows/notifications/my?limit=100', {
        headers: authHeaders(token)
      })
      setSummary(payload.summary || { total: 0, overdue: 0, due_soon: 0, pending_tasks: 0 })
      setRows(payload.results || [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Workforce / Notifications</p>
            <h2 className="workspace-hero-title">Notification Center</h2>
            <p className="panel-note">Track due-soon and overdue reminders mapped to your assigned tasks.</p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Live Feed</span>
            <span className="workspace-hero-date">{summary.total} alerts</span>
          </div>
        </section>

        <section className="panel span-12">
          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Total</span><strong>{summary.total}</strong></article>
            <article className="stat-card-mini"><span>Overdue</span><strong>{summary.overdue}</strong></article>
            <article className="stat-card-mini"><span>Due Soon</span><strong>{summary.due_soon}</strong></article>
            <article className="stat-card-mini"><span>Pending Tasks</span><strong>{summary.pending_tasks}</strong></article>
          </div>
          <div className="detail-actions">
            <button className="btn-secondary" type="button" onClick={loadNotifications}>Refresh</button>
            <Link className="btn-secondary link-button" to="/vault/tasks">Open My Tasks</Link>
          </div>
        </section>

        <section className="panel span-12">
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading notification feed...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Type</th>
                    <th>Task</th>
                    <th>Document</th>
                    <th>Due At</th>
                    <th>Task Status</th>
                    <th>Message</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.created_at)}</td>
                      <td>{item.notification_type}</td>
                      <td>#{item.workflow_task_id}</td>
                      <td>
                        <strong>{item.doc_number || '-'}</strong>
                        <div className="panel-note">{item.title || '-'}</div>
                      </td>
                      <td>{formatDateTime(item.due_at)}</td>
                      <td>{item.task_status || '-'}</td>
                      <td>{item.message}</td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${item.content_id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={8} className="users-empty">No notifications found.</td>
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
