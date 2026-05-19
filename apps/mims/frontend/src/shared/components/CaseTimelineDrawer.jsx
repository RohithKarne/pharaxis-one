/**
 * CaseTimelineDrawer — Sprint 2 #13.
 *
 * Right-side drawer rendering the unified case chronology. Reads from
 * /api/cases/:caseId/timeline which aggregates audit_logs + field_value_history
 * + esign_events + comments + mentions + state timings + ICSR submissions/ACKs
 * + transmissions + field actions + CAPA.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

const TYPE_COLORS = {
  audit:           { bg: '#dbeafe', fg: '#1e40af', icon: '📋' },
  case_audit:      { bg: '#dcfce7', fg: '#166534', icon: '✓' },
  field_change:    { bg: '#fef3c7', fg: '#92400e', icon: '✎' },
  esign:           { bg: '#ede9fe', fg: '#5b21b6', icon: '🔏' },
  comment:         { bg: '#e0f2fe', fg: '#075985', icon: '💬' },
  mention:         { bg: '#fce7f3', fg: '#9d174d', icon: '@' },
  state_enter:     { bg: '#f1f5f9', fg: '#475569', icon: '→' },
  icsr_initiated:  { bg: '#fef9c3', fg: '#854d0e', icon: '📨' },
  ack1:            { bg: '#dcfce7', fg: '#15803d', icon: '①' },
  ack2:            { bg: '#dcfce7', fg: '#15803d', icon: '②' },
  ack3:            { bg: '#dcfce7', fg: '#15803d', icon: '③' },
  transmission:    { bg: '#fee2e2', fg: '#991b1b', icon: '🚀' },
  field_action:    { bg: '#fee2e2', fg: '#7a1313', icon: '⚠' },
  capa:            { bg: '#fde68a', fg: '#78350f', icon: '🔧' },
}

export default function CaseTimelineDrawer({ caseId, open, onClose }) {
  const { token } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')

  const load = useCallback(async () => {
    if (!caseId || !open) return
    setLoading(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/timeline?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setEvents(d.events || [])
    } catch { setEvents([]) } finally { setLoading(false) }
  }, [caseId, open, token])

  useEffect(() => { load() }, [load])

  if (!open) return null

  const filtered = filterType ? events.filter(e => e.type === filterType) : events
  const types = [...new Set(events.map(e => e.type))]

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.4)', zIndex: 9990,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', height: '100%',
        background: 'var(--surface,#fff)', boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: 15 }}>Case Timeline</strong>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Case #{caseId} · {events.length} events
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterType('')} style={chipBtn(filterType === '')}>All</button>
          {types.map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={chipBtn(filterType === t)}>
              {(TYPE_COLORS[t]?.icon || '·')} {t}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 30 }}>
              No events.
            </div>
          )}
          {filtered.map((e, i) => {
            const c = TYPE_COLORS[e.type] || { bg: '#f1f5f9', fg: '#475569', icon: '·' }
            return (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{
                  flexShrink: 0, width: 28, height: 28, borderRadius: 14,
                  background: c.bg, color: c.fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                }}>{c.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <strong>{e.title}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {timeAgo(e.ts)}
                    </span>
                  </div>
                  {e.actor && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      by {e.actor}
                    </div>
                  )}
                  {e.detail && (
                    <div style={{
                      marginTop: 4, fontSize: 11, fontFamily: 'monospace',
                      color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word', maxHeight: 80, overflow: 'hidden',
                    }}>
                      {fmtDetail(e.detail)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function chipBtn(active) {
  return {
    padding: '3px 8px', borderRadius: 10, fontSize: 11, cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--accent,#1a4f9c)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
  }
}
function fmtDetail(d) {
  if (typeof d === 'string') return d.slice(0, 200)
  try {
    const s = JSON.stringify(d, null, 0)
    return s.length > 200 ? s.slice(0, 200) + '…' : s
  } catch { return String(d).slice(0, 200) }
}
function timeAgo(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000); if (m < 1) return 'just now'
  const h = Math.floor(m / 60); if (m < 60) return `${m}m ago`
  const d = Math.floor(h / 24); if (h < 24) return `${h}h ago`
  return `${d}d ago`
}
