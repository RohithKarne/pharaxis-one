/**
 * AdminUATPanel.jsx — UAT QA Dashboard for Bala
 *
 * Tabs:
 *  - Bug Reports   (qa_feedback table)
 *  - Feature Requests (feature_requests table)
 *
 * Bala can: view, update status, assign, add notes, upvote features
 * Owned by: Saad (Frontend)
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { isAdminUser } from '../../../shared/utils/adminScope.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

// ── API helpers ───────────────────────────────────────────────────────────────

function useToken() {
  const { token } = useAuth()
  return token || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '')
}

async function apiFetch(url, token, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`) }
  return res.json()
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const tabBtn = (active) => ({
  padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
  borderRadius: '6px 6px 0 0', marginRight: 4,
  background: active ? 'var(--surface, #fff)' : 'transparent',
  color: active ? 'var(--primary, #3b82f6)' : 'var(--text-secondary, #64748b)',
  borderBottom: active ? '2px solid var(--primary, #3b82f6)' : '2px solid transparent',
})

const pill = (color, bg) => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: 20,
  fontSize: 11, fontWeight: 700, color, background: bg, letterSpacing: '0.03em',
})

const SEVERITY_STYLE = {
  critical: pill('#fff', '#e01e5a'),
  broken:   pill('#fff', '#e07b1e'),
  wrong:    pill('#92400e', '#fef3c7'),
  minor:    pill('#065f46', '#d1fae5'),
}

const STATUS_STYLE = {
  new:           pill('#1e3a5f', '#dbeafe'),
  investigating: pill('#7c3aed', '#ede9fe'),
  confirmed:     pill('#92400e', '#fef3c7'),
  fixed:         pill('#065f46', '#d1fae5'),
  verified:      pill('#fff', '#10b981'),
  closed:        pill('#64748b', '#f1f5f9'),
  'under-review': pill('#7c3aed', '#ede9fe'),
  planned:       pill('#1e3a5f', '#dbeafe'),
  'in-progress': pill('#92400e', '#fef3c7'),
  shipped:       pill('#fff', '#10b981'),
  declined:      pill('#fff', '#94a3b8'),
}

function StatusPill({ value }) {
  const s = STATUS_STYLE[value] || pill('#64748b', '#f1f5f9')
  return <span style={s}>{value?.replace(/-/g, ' ')}</span>
}

function SeverityPill({ value }) {
  const s = SEVERITY_STYLE[value] || pill('#64748b', '#f1f5f9')
  return <span style={s}>{value}</span>
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }) {
  if (!stats) return null
  const { bugs, features } = stats
  const cards = [
    { label: 'Open Bugs',      value: (bugs?.new_count || 0) + (bugs?.investigating_count || 0), color: '#e01e5a' },
    { label: 'Confirmed',      value: bugs?.confirmed_count || 0,  color: '#e07b1e' },
    { label: 'Critical Bugs',  value: bugs?.critical_count || 0,   color: '#7c3aed' },
    { label: 'New Features',   value: features?.new_count || 0,    color: '#3b82f6' },
    { label: 'Planned',        value: features?.planned_count || 0, color: '#10b981' },
  ]
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {cards.map(c => (
        <div key={c.label} style={{
          background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 10, padding: '12px 20px', minWidth: 110, textAlign: 'center',
          borderTop: `3px solid ${c.color}`,
        }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Bug Reports Tab ───────────────────────────────────────────────────────────

function BugReportsTab({ token }) {
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [editForm, setEditForm] = useState({})
  const [filter, setFilter]     = useState({ status: '', severity: '', search: '' })
  const [page, setPage]         = useState(1)
  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE, ...filter }).toString()
      const data = await apiFetch(`/api/qa/feedback?${params}`, token)
      setRows(data.rows || [])
      setTotal(data.total || 0)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, page, filter])

  useEffect(() => { load() }, [load])

  function openDetail(row) {
    setSelected(row)
    setEditForm({ status: row.status, assigned_to: row.assigned_to || '', dev_notes: row.dev_notes || '' })
  }

  async function saveDetail() {
    setSaving(true)
    try {
      await apiFetch(`/api/qa/feedback/${selected.id}`, token, {
        method: 'PATCH', body: JSON.stringify(editForm),
      })
      setSelected(null)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ padding: '7px 12px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, minWidth: 200 }}
          placeholder="Search description / email / page…"
          value={filter.search}
          onChange={e => { setFilter(f => ({ ...f, search: e.target.value })); setPage(1) }}
        />
        <select
          style={{ padding: '7px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13 }}
          value={filter.status}
          onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1) }}
        >
          <option value="">All Statuses</option>
          {['new','investigating','confirmed','fixed','verified','closed'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <select
          style={{ padding: '7px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13 }}
          value={filter.severity}
          onChange={e => { setFilter(f => ({ ...f, severity: e.target.value })); setPage(1) }}
        >
          <option value="">All Severities</option>
          {['critical','broken','wrong','minor'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <button onClick={load} style={{ padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>
          Refresh
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>{total} report{total !== 1 ? 's' : ''}</span>
      </div>

      {error && <div style={{ color: '#e01e5a', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary, #f8fafc)', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
              {['#','Severity','Status','Description','Module','Reporter','Reported','Action'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>No bug reports found.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, #f8fafc)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-secondary, #64748b)' }}>#{row.id}</td>
                <td style={{ padding: '9px 12px' }}><SeverityPill value={row.severity} /></td>
                <td style={{ padding: '9px 12px' }}><StatusPill value={row.status} /></td>
                <td style={{ padding: '9px 12px', maxWidth: 280 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>{row.description}</div>
                  {row.page_url && <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.page_url}</div>}
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary, #64748b)' }}>{row.module || '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <div>{row.user_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)' }}>{row.user_email || ''}</div>
                </td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary, #64748b)' }}>{row.reported_at ? new Date(row.reported_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <button
                    onClick={() => openDetail(row)}
                    style={{ padding: '4px 12px', background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', cursor: page > 1 ? 'pointer' : 'default', background: 'none', fontSize: 13 }}>←</button>
          <span style={{ padding: '5px 10px', fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', cursor: page < totalPages ? 'pointer' : 'default', background: 'none', fontSize: 13 }}>→</button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
             onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Bug Report #{selected.id}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <SeverityPill value={selected.severity} />
                  <StatusPill value={selected.status} />
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary, #64748b)' }}>✕</button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
              <strong>Description:</strong><br />{selected.description}
            </div>
            {selected.steps_to_reproduce && (
              <div style={{ fontSize: 13, marginBottom: 16, lineHeight: 1.7 }}>
                <strong>Steps:</strong><br />{selected.steps_to_reproduce}
              </div>
            )}
            {selected.page_url && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                <strong>Page:</strong> {selected.page_url}
              </div>
            )}
            {selected.console_errors && (
              <div style={{ fontSize: 12, background: '#fde8ef', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {selected.console_errors}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 20 }}>
              Reported by {selected.user_name || selected.user_email} · {selected.reported_at ? new Date(selected.reported_at).toLocaleString() : ''}
              {selected.module && ` · Module: ${selected.module}`}
            </div>

            <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Update Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13 }}
                  >
                    {['new','investigating','confirmed','fixed','verified','closed'].map(s =>
                      <option key={s} value={s}>{s}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Assign To</label>
                  <input
                    value={editForm.assigned_to}
                    onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))}
                    placeholder="e.g. Varun, Saad"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Dev Notes</label>
                <textarea
                  value={editForm.dev_notes}
                  onChange={e => setEditForm(f => ({ ...f, dev_notes: e.target.value }))}
                  rows={3}
                  placeholder="Notes for the developer..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setSelected(null)} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveDetail} disabled={saving} style={{ padding: '9px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Feature Requests Tab ──────────────────────────────────────────────────────

function FeatureRequestsTab({ token }) {
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [editForm, setEditForm] = useState({})
  const [filter, setFilter]     = useState({ status: '', search: '' })
  const [page, setPage]         = useState(1)
  const [voting, setVoting]     = useState({})
  const PAGE_SIZE = 20

  const { user } = useAuth()

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page, page_size: PAGE_SIZE, ...filter }).toString()
      const data = await apiFetch(`/api/qa/features?${params}`, token)
      setRows(data.rows || [])
      setTotal(data.total || 0)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [token, page, filter])

  useEffect(() => { load() }, [load])

  async function handleVote(row) {
    setVoting(v => ({ ...v, [row.id]: true }))
    try {
      if (row.user_voted) {
        await apiFetch(`/api/qa/features/${row.id}/vote`, token, { method: 'DELETE' })
      } else {
        await apiFetch(`/api/qa/features/${row.id}/vote`, token, { method: 'POST' })
      }
      load()
    } catch (e) { alert(e.message) }
    finally { setVoting(v => ({ ...v, [row.id]: false })) }
  }

  function openDetail(row) {
    setSelected(row)
    setEditForm({ status: row.status, sprint_target: row.sprint_target || '', dev_notes: row.dev_notes || '', decline_reason: row.decline_reason || '' })
  }

  async function saveDetail() {
    setSaving(true)
    try {
      await apiFetch(`/api/qa/features/${selected.id}`, token, {
        method: 'PATCH', body: JSON.stringify(editForm),
      })
      setSelected(null)
      load()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const isAdmin = isAdminUser(user)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ padding: '7px 12px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, minWidth: 200 }}
          placeholder="Search suggestions…"
          value={filter.search}
          onChange={e => { setFilter(f => ({ ...f, search: e.target.value })); setPage(1) }}
        />
        <select
          style={{ padding: '7px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13 }}
          value={filter.status}
          onChange={e => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1) }}
        >
          <option value="">All Statuses</option>
          {['new','under-review','planned','in-progress','shipped','declined'].map(s =>
            <option key={s} value={s}>{s}</option>
          )}
        </select>
        <button onClick={load} style={{ padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer' }}>Refresh</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary, #64748b)' }}>{total} suggestion{total !== 1 ? 's' : ''}</span>
      </div>

      {error && <div style={{ color: '#e01e5a', marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary, #f8fafc)', borderBottom: '2px solid var(--border, #e2e8f0)' }}>
              {['Votes','Module','Suggestion','Frequency','Priority','Status','Submitted','Action'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary, #64748b)' }}>No feature suggestions yet.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover, #f8fafc)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '9px 12px' }}>
                  <button
                    onClick={() => handleVote(row)}
                    disabled={voting[row.id]}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      background: row.user_voted ? '#3b82f6' : 'var(--surface, #fff)',
                      color: row.user_voted ? '#fff' : 'var(--text-secondary, #64748b)',
                      border: '1px solid var(--border, #e2e8f0)', borderRadius: 8,
                      padding: '4px 10px', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    }}
                    title={row.user_voted ? 'Remove vote' : 'Upvote this'}
                  >
                    ▲ {row.votes}
                  </button>
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary, #64748b)' }}>{row.module || '—'}</td>
                <td style={{ padding: '9px 12px', maxWidth: 300 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.suggestion}>{row.suggestion}</div>
                  {row.current_pain && <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.current_pain}</div>}
                </td>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary, #64748b)', textTransform: 'capitalize' }}>{row.use_frequency}</td>
                <td style={{ padding: '9px 12px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: row.priority === 'critical' ? '#e01e5a' : 'var(--text-secondary, #64748b)' }}>
                    {row.priority === 'critical' ? '🔴 Critical' : '💚 Nice-to-have'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px' }}><StatusPill value={row.status} /></td>
                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary, #64748b)' }}>{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  {isAdmin && (
                    <button onClick={() => openDetail(row)} style={{ padding: '4px 12px', background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                      Review
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', cursor: page > 1 ? 'pointer' : 'default', background: 'none', fontSize: 13 }}>←</button>
          <span style={{ padding: '5px 10px', fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', cursor: page < totalPages ? 'pointer' : 'default', background: 'none', fontSize: 13 }}>→</button>
        </div>
      )}

      {/* Detail Modal */}
      {selected && isAdmin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
             onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Feature Request #{selected.id} <StatusPill value={selected.status} /></div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-secondary, #64748b)' }}>✕</button>
            </div>

            <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.7 }}>
              {selected.current_pain && <><strong>Current pain:</strong><br />{selected.current_pain}<br /><br /></>}
              <strong>Suggestion:</strong><br />{selected.suggestion}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 20 }}>
              By {selected.user_name || selected.user_email} · {selected.use_frequency} · {selected.priority} · {selected.votes} vote{selected.votes !== 1 ? 's' : ''}
              {selected.module && ` · ${selected.module}`}
            </div>

            <div style={{ borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13 }}>
                    {['new','under-review','planned','in-progress','shipped','declined'].map(s =>
                      <option key={s} value={s}>{s}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Sprint Target</label>
                  <input value={editForm.sprint_target} onChange={e => setEditForm(f => ({ ...f, sprint_target: e.target.value }))}
                    placeholder="e.g. Sprint 22"
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              </div>
              {editForm.status === 'declined' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Decline Reason</label>
                  <textarea value={editForm.decline_reason} onChange={e => setEditForm(f => ({ ...f, decline_reason: e.target.value }))}
                    rows={2} placeholder="Reason for declining..."
                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #64748b)', marginBottom: 5, textTransform: 'uppercase' }}>Dev Notes</label>
                <textarea value={editForm.dev_notes} onChange={e => setEditForm(f => ({ ...f, dev_notes: e.target.value }))}
                  rows={3} placeholder="Internal notes..."
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 7, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setSelected(null)} style={{ padding: '9px 18px', background: 'none', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveDetail} disabled={saving} style={{ padding: '9px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function AdminUATPanel({ initialTab = 'bugs' }) {
  const token              = useToken()
  const [tab, setTab]      = useState(initialTab)
  const [stats, setStats]  = useState(null)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/api/qa/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setStats).catch(() => {})
  }, [token])

  return (
    <div style={{ padding: '20px 24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>UAT QA Dashboard</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
          Bug reports and feature suggestions from all users on this server.
        </div>
      </div>

      <StatsBar stats={stats} />

      {/* Tabs */}
      <div style={{ borderBottom: '2px solid var(--border, #e2e8f0)', marginBottom: 20 }}>
        <button style={tabBtn(tab === 'bugs')}    onClick={() => setTab('bugs')}>🐛 Bug Reports {stats ? `(${(stats.bugs?.new_count || 0) + (stats.bugs?.investigating_count || 0)} open)` : ''}</button>
        <button style={tabBtn(tab === 'features')} onClick={() => setTab('features')}>💡 Feature Requests {stats ? `(${stats.features?.new_count || 0} new)` : ''}</button>
      </div>

      {tab === 'bugs'     && <BugReportsTab token={token} />}
      {tab === 'features' && <FeatureRequestsTab token={token} />}
    </div>
  )
}
