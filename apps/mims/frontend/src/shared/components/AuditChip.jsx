/**
 * AuditChip.jsx — small "Last modified by X · Yh ago" chip with click-to-history.
 *
 * Usage:
 *   <AuditChip entity="user" entityId={user.id}
 *              updatedBy={user.updated_by_name} updatedAt={user.updated_at} />
 *
 * On click: opens a small modal showing the last 5 audit entries for
 * (entity, entityId), pulled from /api/admin/audit-trail.
 *
 * CSS namespace: ma-audit-chip-
 */

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

function timeAgo(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)        return `${diff}s ago`
  if (diff < 3600)      return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800)    return `${Math.floor(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

export default function AuditChip({ entity, entityId, updatedBy, updatedAt }) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState([])
  const [err, setErr]   = useState('')

  async function openHistory() {
    setOpen(true); setBusy(true); setErr(''); setRows([])
    try {
      const H = { Authorization: `Bearer ${token}` }
      const r = await httpFetch(
        `/api/admin/audit-logs?entity=${encodeURIComponent(entity)}&entity_id=${encodeURIComponent(entityId)}&page_size=10`,
        { headers: H }
      )
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Could not load audit history.'); return }
      setRows(d.logs || d.items || d.audit_logs || [])
    } catch { setErr('Network error.') }
    finally { setBusy(false) }
  }

  if (!updatedAt) {
    return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={openHistory}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && openHistory()}
        title={`Updated ${updatedBy ? 'by ' + updatedBy + ' ' : ''}at ${new Date(updatedAt).toLocaleString()}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px', borderRadius: 10,
          background: 'var(--surface-alt, #f1f5f9)', color: 'var(--text-secondary)',
          fontSize: 11, fontWeight: 500, cursor: 'pointer', userSelect: 'none',
          border: '1px solid var(--border)',
        }}
      >
        {updatedBy ? <span style={{ fontWeight: 600 }}>{updatedBy}</span> : <span style={{ fontStyle: 'italic' }}>unknown</span>}
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{timeAgo(updatedAt)}</span>
      </span>

      {open && (
        <div
          onClick={e => e.target === e.currentTarget && setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: 520, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Recent changes — {entity} #{entityId}
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 18px' }}>
              {busy && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>}
              {!busy && err && <div style={{ color: 'var(--error,#c00)', fontSize: 13 }}>{err}</div>}
              {!busy && !err && rows.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No audit entries yet.</div>}
              {!busy && rows.map((row, i) => (
                <div key={row.id || i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {row.action || 'Updated'} · <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{row.user_name || row.user_email || row.userId || 'system'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                  </div>
                  {row.details && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                      {typeof row.details === 'string' ? row.details : JSON.stringify(row.details).slice(0, 240)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
