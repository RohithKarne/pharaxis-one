import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

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
    pending_tasks: 0,
    unread: 0
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [markingAll, setMarkingAll] = useState(false)

  function summarize(notificationRows, payloadSummary = null) {
    return {
      total: Number(payloadSummary?.total ?? notificationRows.length),
      overdue: Number(payloadSummary?.overdue ?? notificationRows.filter(row => row.notification_type === 'overdue').length),
      due_soon: Number(payloadSummary?.due_soon ?? notificationRows.filter(row => row.notification_type === 'due_soon').length),
      pending_tasks: Number(
        payloadSummary?.pending_tasks ?? notificationRows.filter(row => row.task_status === 'pending').length
      ),
      unread: notificationRows.filter(row => !row.read_at).length
    }
  }

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
      const nextRows = payload.results || []
      setRows(nextRows)
      setSummary(summarize(nextRows, payload.summary))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function markNotificationRead(id) {
    setUpdatingId(id)
    setError('')
    try {
      await apiJson(`/api/workflows/notifications/${id}/read`, {
        method: 'PATCH',
        headers: authHeaders(token)
      })
      const nextRows = rows.map(row => (
        Number(row.id) === Number(id) && !row.read_at
          ? { ...row, read_at: new Date().toISOString() }
          : row
      ))
      setRows(nextRows)
      setSummary(summarize(nextRows, summary))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    setError('')
    try {
      await apiJson('/api/workflows/notifications/read-all', {
        method: 'PATCH',
        headers: authHeaders(token)
      })
      const timestamp = new Date().toISOString()
      const nextRows = rows.map(row => (row.read_at ? row : { ...row, read_at: timestamp }))
      setRows(nextRows)
      setSummary(summarize(nextRows, summary))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setMarkingAll(false)
    }
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Workforce / Notifications"
          title="Notification Center"
          note="Track due-soon and overdue reminders mapped to your assigned tasks."
          statusLabel="Live Feed"
          dateLabel={`${summary.total} alerts`}
        />

        <section className="panel span-12">
          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Total</span><strong>{summary.total}</strong></article>
            <article className="stat-card-mini"><span>Overdue</span><strong>{summary.overdue}</strong></article>
            <article className="stat-card-mini"><span>Due Soon</span><strong>{summary.due_soon}</strong></article>
            <article className="stat-card-mini"><span>Pending Tasks</span><strong>{summary.pending_tasks}</strong></article>
            <article className="stat-card-mini"><span>Unread</span><strong>{summary.unread || 0}</strong></article>
          </div>
          <div className="detail-actions">
            <button className="btn-secondary" type="button" onClick={loadNotifications}>Refresh</button>
            <button className="btn-secondary" type="button" onClick={markAllRead} disabled={markingAll || !rows.length}>
              {markingAll ? 'Marking...' : 'Mark All Read'}
            </button>
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
                    <th>Read State</th>
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
                      <td>
                        <span className={item.read_at ? 'status-chip success' : 'status-chip pending'}>
                          {item.read_at ? 'Read' : 'Unread'}
                        </span>
                      </td>
                      <td>{item.message}</td>
                      <td>
                        <div className="detail-actions">
                          {!item.read_at ? (
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => markNotificationRead(item.id)}
                              disabled={updatingId === item.id}
                            >
                              {updatingId === item.id ? 'Updating...' : 'Mark Read'}
                            </button>
                          ) : null}
                          <Link className="btn-secondary link-button" to="/vault/tasks">
                            Open Task Inbox
                          </Link>
                          <Link className="btn-secondary link-button" to={`/vault/content/${item.content_id}`}>
                            Open Document
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={9} className="users-empty">No notifications found.</td>
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
