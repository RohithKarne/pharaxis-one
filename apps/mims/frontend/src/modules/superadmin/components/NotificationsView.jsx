import { useState, useEffect, useCallback } from 'react'
import { guardedFetch } from '../utils/guardedFetch'
import { confirm } from '../../../shared/utils/confirm'

export default function NotificationsView({ H, flash }) {
  const [rows, setRows] = useState([])
  const [unread, setUnread] = useState(0)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const load = useCallback(async () => {
    const res = await guardedFetch('/api/superadmin/notifications?limit=100', { headers: H })
    const data = await res.json()
    setRows(data.notifications || [])
    setUnread(data.unread || 0)
    setSelectedIds(new Set())
  }, [H.Authorization]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function markRead(id) {
    const res = await guardedFetch(`/api/superadmin/notifications/${id}/read`, { method: 'POST', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update notification.', 'error')
    load()
  }

  async function deleteNotification(id) {
    if (!await confirm('Delete this notification?')) return
    const res = await guardedFetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete notification.', 'error')
    flash('Notification deleted.')
    load()
  }

  async function clearAllRead() {
    if (!await confirm('Delete all read notifications?')) return
    const res = await guardedFetch('/api/superadmin/notifications/read', { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to clear read notifications.', 'error')
    flash(data.message || 'All read notifications cleared.')
    load()
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    if (!await confirm(`Delete ${ids.length} selected notification(s)?`)) return
    for (const id of ids) {
      await guardedFetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
    }
    flash(`${ids.length} notification${ids.length !== 1 ? 's' : ''} deleted.`)
    load()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>Notifications</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unread} unread</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedIds.size > 0 && (
            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={deleteSelected}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={clearAllRead}>
            Clear All Read
          </button>
        </div>
      </div>
      <div className="card-body">
        {!rows.length && <div style={{ color: 'var(--text-muted)' }}>No notifications yet.</div>}
        {rows.map(row => (
          <div key={row.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(row.id)}
                onChange={() => toggleSelect(row.id)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: row.is_read ? 500 : 700 }}>{row.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{row.message || 'No message'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{row.created_at}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!row.is_read && (
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => markRead(row.id)}>Mark Read</button>
              )}
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '4px 10px', color: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => deleteNotification(row.id)}
                title="Delete"
              >✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
