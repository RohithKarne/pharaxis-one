/**
 * MentionsInbox — Theme 5 (Wave 4) dashboard widget.
 *
 * Shows unread @-mentions for the current user. Click → mark seen + navigate to case.
 *
 * Props:
 *   onOpen?    — (mention) => void
 *   limit?     — fetch limit (default 25)
 *   unreadOnly?— default true
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function MentionsInbox({ onOpen, limit = 25, unreadOnly = true }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme5_realtime_collab')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/mentions/me?limit=${limit}${unreadOnly ? '&unread=1' : ''}`
      const r = await httpFetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json()
      setItems(d.mentions || [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [token, limit, unreadOnly])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  async function open(m) {
    await httpFetch(`/api/mentions/${m.id}/seen`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    })
    load()
    onOpen?.(m)
  }

  if (!enabled) return null
  return (
    <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>@-Mentions {items.length > 0 && (
          <span style={{
            marginLeft: 6, padding: '0 7px', borderRadius: 9,
            background: '#b91c1c', color: '#fff', fontSize: 10,
          }}>{items.length}</span>
        )}</strong>
        <button onClick={load} style={{ background: 'transparent', border: 'none',
          fontSize: 11, color: 'var(--accent,#1a4f9c)', cursor: 'pointer', fontWeight: 600 }}>↻</button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 14, color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
        {!loading && items.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            🎉 You're caught up.
          </div>
        )}
        {!loading && items.map(m => (
          <div key={m.id} onClick={() => open(m)} style={{
            padding: '8px 14px', borderBottom: '1px solid var(--border)',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
              <strong>{m.mentioned_by_name || `User ${m.mentioned_by_user_id}`}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {timeAgo(m.created_at)}
              </span>
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              on case #{m.case_id}: <em>{(m.body_md || '').slice(0, 80)}{m.body_md?.length > 80 ? '…' : ''}</em>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000); if (m < 1) return 'just now'
  const h = Math.floor(m / 60); if (m < 60) return `${m}m ago`
  const d = Math.floor(h / 24); if (h < 24) return `${h}h ago`
  return `${d}d ago`
}
