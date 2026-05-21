/**
 * CaseAuditTrailPage.jsx — Case Audit Trail (two-panel versioned UI)
 * Left: case list · Right: version history with field-level before/after diff
 * CSS namespace: cat-
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './CaseAuditTrailPage.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const ACTION_COLORS = {
  CREATE:  { bg: '#dcfce7', color: '#15803d' },
  UPDATE:  { bg: '#dbeafe', color: '#1d4ed8' },
  DELETE:  { bg: '#fee2e2', color: '#dc2626' },
  STATUS:  { bg: '#fef9c3', color: '#854d0e' },
  DEFAULT: { bg: '#f1f5f9', color: '#475569' },
}

function actionStyle(t) {
  if (!t) return ACTION_COLORS.DEFAULT
  const k = Object.keys(ACTION_COLORS).find(k => t.toUpperCase().includes(k))
  return ACTION_COLORS[k] || ACTION_COLORS.DEFAULT
}

function ActionBadge({ actionType }) {
  const s = actionStyle(actionType)
  return (
    <span className="cat-diff-action" style={{ background: s.bg, color: s.color }}>
      {actionType || '—'}
    </span>
  )
}

function groupIntoVersions(entries) {
  const versions = []
  for (const e of entries) {
    const t = new Date(e.timestamp || e.created_at).getTime()
    const last = versions[versions.length - 1]
    if (last && last.user_id === e.user_id && (last.minTime - t) <= 30000) {
      last.entries.push(e)
      last.minTime = Math.min(last.minTime, t)
    } else {
      versions.push({ user_id: e.user_id, user_name: e.user_name, maxTime: t, minTime: t, entries: [e] })
    }
  }
  return versions
}

function VersionCard({ version, index, total }) {
  const [open, setOpen] = useState(false)
  const vNum = total - index
  const ts = new Date(version.maxTime)
  const timeStr = ts.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="cat-version">
      <div className="cat-version-hdr" onClick={() => setOpen(o => !o)}>
        <span className="cat-version-num">v{vNum}</span>
        <span className="cat-version-user">{version.user_name || `User #${version.user_id}`}</span>
        <span className="cat-version-time">{timeStr}</span>
        <span className="cat-version-count">{version.entries.length} change{version.entries.length !== 1 ? 's' : ''}</span>
        <span className={`cat-version-chevron${open ? ' open' : ''}`}>▶</span>
      </div>
      {open && (
        <div className="cat-version-body">
          <table className="cat-diff-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {version.entries.map(e => (
                <tr key={e.id}>
                  <td><ActionBadge actionType={e.action_type} /></td>
                  <td className="cat-diff-field">{e.field_name || '—'}</td>
                  <td>
                    {e.old_value != null
                      ? <span className="cat-diff-old" title={e.old_value}>{e.old_value || '(empty)'}</span>
                      : <span className="cat-diff-empty">—</span>}
                  </td>
                  <td>
                    {e.new_value != null
                      ? <span className="cat-diff-new" title={e.new_value}>{e.new_value || '(empty)'}</span>
                      : <span className="cat-diff-empty">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RightPanel({ caseItem, token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [versions, setVersions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!caseItem) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setVersions([])
      try {
        const data = await httpFetch(`${API}/admin/case-audit-trail?case_id=${caseItem.case_id}&limit=500&page=1`, { headers }).then(r => r.json())
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setVersions(groupIntoVersions(data.entries || []))
      } catch {
        if (!cancelled) setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [caseItem, headers])

  if (!caseItem) {
    return (
      <div className="cat-right">
        <div className="cat-right-empty">
          <div className="cat-right-empty-icon">📋</div>
          <div>Select a case to view its audit history</div>
        </div>
      </div>
    )
  }

  return (
    <div className="cat-right">
      <div className="cat-right-hdr">
        <div>
          <div className="cat-right-case">{caseItem.case_number || `Case #${caseItem.case_id}`}</div>
          <div className="cat-right-sub">
            {caseItem.case_type && <span>{caseItem.case_type} · </span>}
            {caseItem.total_changes} total change{caseItem.total_changes !== 1 ? 's' : ''} ·
            Last by {caseItem.last_changed_by || '—'}
          </div>
        </div>
      </div>
      <div className="cat-right-body">
        {loading && <div className="cat-right-loading">Loading history…</div>}
        {error && <div className="cat-error">{error}</div>}
        {!loading && !error && versions.length === 0 && (
          <div className="cat-right-loading">No audit entries found for this case.</div>
        )}
        {!loading && versions.map((v, i) => (
          <VersionCard key={i} version={v} index={i} total={versions.length} />
        ))}
      </div>
    </div>
  )
}

export default function CaseAuditTrailPage({ embedded = false } = {}) {
  const { token } = useAuth()
  const headers   = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const [cases,       setCases]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [leftLoading, setLeftLoading] = useState(false)
  const [leftError,   setLeftError]   = useState(null)
  const [selected,    setSelected]    = useState(null)
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const limit = 30

  const fetchCases = useCallback(async () => {
    setLeftLoading(true); setLeftError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (search.trim()) params.set('search', search.trim())
      const res  = await httpFetch(`${API}/admin/case-audit-trail/cases-summary?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLeftError(data.error || 'Failed to load cases.'); return }
      setCases(data.cases || [])
      setTotal(data.total || 0)
    } catch { setLeftError('Network error.') }
    finally { setLeftLoading(false) }
  }, [headers, page, search])

  useEffect(() => { fetchCases() }, [fetchCases])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  function handleSearch(val) { setSearch(val); setPage(1); setSelected(null) }

  const content = (
    <>
      <div className="cat-page">
        <div className="cat-top">
          <div>
            <h1 className="cat-title">Case Audit Trail</h1>
            <span className="cat-subtitle">Field-level change history per case — click a case to view versioned audit log</span>
          </div>
          <button className="cat-refresh-btn" onClick={fetchCases} disabled={leftLoading}>⟳ Refresh</button>
        </div>

        <div className="cat-panels">
          {/* Left — case list */}
          <div className="cat-left">
            <div className="cat-left-hdr">
              <span className="cat-left-title">Cases ({total})</span>
              <input
                className="cat-search"
                placeholder="Search case number…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>
            <div className="cat-left-list">
              {leftLoading && <div className="cat-left-loading">Loading…</div>}
              {leftError   && <div className="cat-left-empty" style={{ color: '#dc2626' }}>{leftError}</div>}
              {!leftLoading && cases.length === 0 && !leftError && (
                <div className="cat-left-empty">No cases with audit records{search ? ' matching your search' : ''}.</div>
              )}
              {cases.map(c => (
                <div
                  key={c.case_id}
                  className={`cat-case-item${selected?.case_id === c.case_id ? ' active' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <div className="cat-case-item-num">{c.case_number || `#${c.case_id}`}</div>
                  <div className="cat-case-item-meta">
                    {c.case_type && <span>{c.case_type} · </span>}
                    Last by {c.last_changed_by || '—'}
                  </div>
                  <div className="cat-case-item-stats">
                    <span className="cat-case-item-stat">{c.total_changes} changes</span>
                    <span className="cat-case-item-stat">
                      {c.last_changed_at ? new Date(c.last_changed_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="cat-left-pagination">
                <button className="cat-left-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                <span className="cat-left-pg-info">{page} / {totalPages}</span>
                <button className="cat-left-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>

          {/* Right — version history */}
          <RightPanel caseItem={selected} token={token} />
        </div>
      </div>
    </>
  )

  if (embedded) return content
  return <MIMSLayout activeNav="case_audit_trail">{content}</MIMSLayout>
}
