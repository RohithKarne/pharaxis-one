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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/notifications?limit=100`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load notifications.')
      const items = Array.isArray(data.notifications) ? data.notifications : []
      setRows(items)
      setUnread(Number(data.unread || 0))
    } catch (err) {
      setRows([])
      setUnread(0)
      setError(err.message || 'Failed to load notifications.')
    } finally {
      setLoading(false)
    }
  }, [headers, token])

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
          </div>
          <div className="mims-notif-header-actions">
            <button className="mims-notif-markall" onClick={markAllRead} disabled={rows.length === 0 || unread === 0}>
              Mark all read
            </button>
            <button className="mims-notif-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="mims-notif-body">
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
                {!n.is_read && <span className="mims-notif-dot" />}
              </div>
              <div className="mims-notif-text">{n.message || 'No message.'}</div>
              <div className="mims-notif-meta">
                <span>{(n.category || 'general').toUpperCase()}</span>
                <span>{formatWhen(n.created_at)}</span>
              </div>
              <div className="mims-notif-actions">
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
