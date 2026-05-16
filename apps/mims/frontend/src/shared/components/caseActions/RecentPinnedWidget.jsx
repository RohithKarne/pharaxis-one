/**
 * RecentPinnedWidget — Theme 8 (Wave 4) two-tab list for Recent + Pinned cases.
 *
 * Drop into a dashboard or sidebar. Click a row → caller's onOpen(caseId).
 *
 * Props:
 *   onOpen  — (caseId) => void
 *   limit?  — recent rows to fetch (default 15)
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function RecentPinnedWidget({ onOpen, limit = 15 }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme8_smart_actions')
  const [tab, setTab] = useState('recent')
  const [recent, setRecent] = useState([])
  const [pinned, setPinned] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        httpFetch(`/api/cases/recent?limit=${limit}`, { headers: { Authorization: `Bearer ${token}` } }),
        httpFetch(`/api/cases/pinned`,                  { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const d1 = await r1.json(); const d2 = await r2.json()
      setRecent(d1.recent || []); setPinned(d2.pinned || [])
    } catch { /* tolerate */ } finally { setLoading(false) }
  }, [token, limit])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  async function togglePin(caseId) {
    await httpFetch(`/api/cases/${caseId}/pin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    })
    load()
  }

  if (!enabled) return null
  const list = tab === 'recent' ? recent : pinned

  return (
    <div style={{ background: 'var(--surface,#fff)', border: '1px solid var(--border)',
      borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <Tab active={tab === 'recent'} onClick={() => setTab('recent')} label={`Recent (${recent.length})`} />
        <Tab active={tab === 'pinned'} onClick={() => setTab('pinned')} label={`Pinned (${pinned.length})`} />
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {loading && <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
        {!loading && list.length === 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            {tab === 'recent' ? 'No recent cases yet.' : 'No pinned cases. Pin from any case detail page.'}
          </div>
        )}
        {!loading && list.map(item => {
          const cid = item.case_id
          const isPinned = pinned.some(p => p.case_id === cid)
          return (
            <div key={cid} style={{
              padding: '8px 12px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => onOpen?.(cid)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Case #{cid}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {tab === 'recent'
                    ? `Last opened ${timeAgo(item.last_seen_at)}`
                    : (item.note || `Pinned ${timeAgo(item.pinned_at)}`)}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); togglePin(cid) }} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 16, color: isPinned ? '#c08300' : 'var(--text-muted)',
              }} title={isPinned ? 'Unpin' : 'Pin'}>
                {isPinned ? '📌' : '📍'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Tab({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? 'var(--surface,#fff)' : 'var(--surface-alt,#fafafa)',
      border: 'none', borderBottom: `2px solid ${active ? 'var(--accent,#1a4f9c)' : 'transparent'}`,
      color: active ? 'var(--accent,#1a4f9c)' : 'var(--text-secondary)',
    }}>{label}</button>
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
