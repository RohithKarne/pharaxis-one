import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const API = '/api'

function formatWhen(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

export default function NotificationOverlay({ open, onClose }) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [rows, setRows] = useState([])
  const [unread, setUnread] = useState(0)
  const [ackPending, setAckPending] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [ackOnly, setAckOnly] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (severityFilter) params.set('severity', severityFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (unreadOnly) params.set('unread_only', 'true')
      if (ackOnly) params.set('ack_required_only', 'true')
      const res = await fetch(`${API}/notifications?${params.toString()}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load notifications.')
      const items = Array.isArray(data.notifications) ? data.notifications : []
      setRows(items)
      setUnread(Number(data.unread || 0))
      setAckPending(Number(data.ack_pending || 0))
    } catch (err) {
      setRows([])
      setUnread(0)
      setAckPending(0)
      setError(err.message || 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }, [ackOnly, categoryFilter, headers, severityFilter, token, unreadOnly])

  useEffect(() => {
    if (!open) return
    loadNotifications()
  }, [open, loadNotifications])

  async function markRead(id) {
    try {
      const res = await fetch(`${API}/notifications/${id}/read`, { method: 'POST', headers })
      if (!res.ok) return
      setRows(prev => prev.map(n => (n.id === id ? { ...n, is_read: 1, read_at: n.read_at || new Date().toISOString() } : n)))
      setUnread(prev => Math.max(0, prev - 1))
    } catch (_) {
      // no-op
    }
  }

  async function markAllRead() {
    try {
      const res = await fetch(`${API}/notifications/read-all`, { method: 'POST', headers })
      if (!res.ok) return
      setRows(prev => prev.map(n => ({ ...n, is_read: 1, read_at: n.read_at || new Date().toISOString() })))
      setUnread(0)
    } catch (_) {
      // no-op
    }
  }

  async function acknowledge(id) {
    try {
      const res = await fetch(`${API}/notifications/${id}/acknowledge`, { method: 'POST', headers })
      if (!res.ok) return
      setRows(prev => prev.map((n) => (
        n.id === id
          ? {
              ...n,
              is_read: 1,
              read_at: n.read_at || new Date().toISOString(),
              acknowledged_at: n.acknowledged_at || new Date().toISOString(),
            }
          : n
      )))
      setUnread(prev => Math.max(0, prev - 1))
      setAckPending(prev => Math.max(0, prev - 1))
    } catch (_) {
      // no-op
    }
  }

  async function handleOpen(notification) {
    if (!notification.is_read) {
      await markRead(notification.id)
    }
    if (notification.link_url) {
      if (notification.link_url.startsWith('http://') || notification.link_url.startsWith('https://')) {
        window.open(notification.link_url, '_blank', 'noopener,noreferrer')
      } else {
        navigate(notification.link_url)
        onClose()
      }
    }
  }

  if (!open) return null

  return (
    <>
      <div className="mims-overlay-backdrop" onClick={onClose} />

      <div className="mims-notif-panel">
        <div className="mims-notif-header">
          <div className="mims-notif-header-titlewrap">
            <span className="mims-notif-title">Notifications</span>
            <span className="mims-notif-unread-pill">{unread} unread</span>
            <span className="mims-notif-ack-pill">{ackPending} ack pending</span>
          </div>
          <div className="mims-notif-header-actions">
            <button className="mims-notif-markall" onClick={markAllRead} disabled={rows.length === 0 || unread === 0}>
              Mark all read
            </button>
            <button className="mims-notif-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="mims-notif-body">
          <div className="mims-notif-filters">
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              <option value="case_status">Case Status</option>
              <option value="case_reassignment">Case Assignment</option>
              <option value="dedup_assist">Duplicate Assist</option>
              <option value="mi_response">MI Response</option>
              <option value="ae_transmission">AE Transmission</option>
              <option value="pc_transmission">PC Transmission</option>
              <option value="transmission_sla">Transmission SLA</option>
              <option value="scheduled_report">Scheduled Report</option>
            </select>
            <label>
              <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <label>
              <input type="checkbox" checked={ackOnly} onChange={(e) => setAckOnly(e.target.checked)} />
              Ack required
            </label>
          </div>
          {loading && <div className="mims-notif-empty">Loading notifications…</div>}
          {!loading && error && <div className="mims-notif-error">{error}</div>}
          {!loading && !error && rows.length === 0 && (
            <div className="mims-notif-empty">
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔔</div>
              <div>No notifications yet.</div>
            </div>
          )}

          {!loading && !error && rows.map((n) => (
            <div
              key={n.id}
              className={`mims-notif-item ${n.is_read ? 'read' : 'unread'}`}
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(n)}
              onKeyDown={e => { if (e.key === 'Enter') handleOpen(n) }}
            >
              <div className="mims-notif-item-top">
                <div className="mims-notif-case-id">{n.title}</div>
                <span className={`mims-notif-severity ${String(n.severity || 'info').toLowerCase()}`}>{String(n.severity || 'info').toUpperCase()}</span>
                {!n.is_read && <span className="mims-notif-dot" />}
              </div>
              <div className="mims-notif-text">{n.message || 'No message.'}</div>
              <div className="mims-notif-meta">
                <span>{(n.category || 'general').toUpperCase()}</span>
                <span>{formatWhen(n.created_at)}</span>
              </div>
              <div className="mims-notif-actions">
                {n.requires_acknowledgement && !n.acknowledged_at && (
                  <button
                    className="mims-notif-action-btn critical"
                    onClick={e => { e.stopPropagation(); acknowledge(n.id) }}
                  >
                    Acknowledge
                  </button>
                )}
                {!n.is_read && (
                  <button
                    className="mims-notif-action-btn"
                    onClick={e => { e.stopPropagation(); markRead(n.id) }}
                  >
                    Mark read
                  </button>
                )}
                {n.link_url && <span className="mims-notif-linkhint">Open →</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
