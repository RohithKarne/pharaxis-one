/**
 * CMAuditTrailPage.jsx — CM Audit Trail (two-panel versioned UI)
 * Left: entity list · Right: version history with before/after diff
 * CSS namespace: cmat-
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './CMAuditTrailPage.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const ENTITY_LABELS = {
  cm_document:     'Document',
  cm_faq:          'FAQ',
  cm_folder:       'Folder',
  cm_module:       'Module',
  cm_template:     'Template',
  cm_review:       'Review',
  cm_merge_report: 'Merge Report',
}

const ENTITY_COLORS = {
  cm_document:     { bg: '#eff6ff', color: '#1d4ed8' },
  cm_faq:          { bg: '#f0fdf4', color: '#15803d' },
  cm_folder:       { bg: '#fef9c3', color: '#854d0e' },
  cm_module:       { bg: '#fdf4ff', color: '#7e22ce' },
  cm_template:     { bg: '#fff7ed', color: '#c2410c' },
  cm_review:       { bg: '#f0f9ff', color: '#0369a1' },
  cm_merge_report: { bg: '#fdf2f8', color: '#9d174d' },
}

const ADMIN_ENTITY_LABELS = {
  access_config: 'Access Config',
  picklist: 'Picklist',
  workflow: 'Workflow',
  system_param: 'System Param',
  case_form_rule: 'Case Form Rule',
  security_group: 'Security Group',
  user_role: 'User Role'
}

const ADMIN_ENTITY_COLORS = {
  access_config: { bg: '#e0e7ff', color: '#3730a3' },
  picklist: { bg: '#dcfce7', color: '#166534' },
  workflow: { bg: '#fef3c7', color: '#92400e' },
  system_param: { bg: '#fee2e2', color: '#991b1b' },
  case_form_rule: { bg: '#fce7f3', color: '#9d174d' },
  security_group: { bg: '#fae8ff', color: '#86198f' },
  user_role: { bg: '#ffedd5', color: '#9a3412' }
}

const ACTION_COLORS = {
  CREATE:   { bg: '#dcfce7', color: '#15803d' },
  UPDATE:   { bg: '#dbeafe', color: '#1d4ed8' },
  DELETE:   { bg: '#fee2e2', color: '#dc2626' },
  APPROVE:  { bg: '#d1fae5', color: '#065f46' },
  PUBLISH:  { bg: '#cffafe', color: '#0e7490' },
  ARCHIVE:  { bg: '#f1f5f9', color: '#475569' },
  CHECKOUT: { bg: '#fef3c7', color: '#92400e' },
  CHECKIN:  { bg: '#e0f2fe', color: '#0369a1' },
  REVIEW:   { bg: '#ede9fe', color: '#5b21b6' },
  DEFAULT:  { bg: '#f1f5f9', color: '#475569' },
}

function getActionStyle(action) {
  if (!action) return ACTION_COLORS.DEFAULT
  const k = Object.keys(ACTION_COLORS).find(k => action.toUpperCase().startsWith(k))
  return ACTION_COLORS[k] || ACTION_COLORS.DEFAULT
}

function EntityBadge({ entity, isAdmin }) {
  const s = isAdmin ? (ADMIN_ENTITY_COLORS[entity] || { bg: '#f1f5f9', color: '#475569' }) : (ENTITY_COLORS[entity] || { bg: '#f1f5f9', color: '#475569' })
  const label = isAdmin ? (ADMIN_ENTITY_LABELS[entity] || entity) : (ENTITY_LABELS[entity] || entity)
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:700, background:s.bg, color:s.color }}>
      {label}
    </span>
  )
}

function ActionBadge({ action }) {
  const s = getActionStyle(action)
  return (
    <span className="cmat-diff-action" style={{ background: s.bg, color: s.color }}>
      {action || '—'}
    </span>
  )
}

function parseDetails(details) {
  if (!details) return {}
  try { return typeof details === 'string' ? JSON.parse(details) : details }
  catch { return {} }
}

function groupIntoVersions(entries) {
  const versions = []
  for (const e of entries) {
    const t = new Date(e.created_at).getTime()
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
    <div className="cmat-version">
      <div className="cmat-version-hdr" onClick={() => setOpen(o => !o)}>
        <span className="cmat-version-num">v{vNum}</span>
        <span className="cmat-version-user">{version.user_name || `User #${version.user_id}`}</span>
        <span className="cmat-version-time">{timeStr}</span>
        <span className="cmat-version-count">{version.entries.length} change{version.entries.length !== 1 ? 's' : ''}</span>
        <span className={`cmat-version-chevron${open ? ' open' : ''}`}>▶</span>
      </div>
      {open && (
        <div className="cmat-version-body">
          <table className="cmat-diff-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>Before</th>
                <th>After</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {version.entries.map(e => {
                const d = parseDetails(e.details)
                const detailStr = Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' · ')
                return (
                  <tr key={e.id}>
                    <td><ActionBadge action={e.action} /></td>
                    <td><EntityBadge entity={e.entity} isAdmin={!!ADMIN_ENTITY_LABELS[e.entity]} /> #{e.entity_id}</td>
                    <td>
                      {e.old_value || e.before_value
                        ? <span className="cmat-diff-old" title={e.old_value || e.before_value}>{e.old_value || e.before_value}</span>
                        : <span className="cmat-diff-empty">—</span>}
                    </td>
                    <td>
                      {e.new_value || e.after_value
                        ? <span className="cmat-diff-new" title={e.new_value || e.after_value}>{e.new_value || e.after_value}</span>
                        : <span className="cmat-diff-empty">—</span>}
                    </td>
                    <td className="cmat-diff-details" title={detailStr}>{detailStr || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RightPanel({ entityItem, token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [versions, setVersions] = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    if (!entityItem) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setVersions([])
      try {
        const p = new URLSearchParams({ entity: entityItem.entity, entity_id: entityItem.entity_id, limit: 500, page: 1 })
        const data = await httpFetch(`${API}/admin/cm-audit-trail?${p}`, { headers }).then(r => r.json())
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
  }, [entityItem, headers])

  if (!entityItem) {
    return (
      <div className="cmat-right">
        <div className="cmat-right-empty">
          <div className="cmat-right-empty-icon">📁</div>
          <div>Select a CM entity to view its change history</div>
        </div>
      </div>
    )
  }

  return (
    <div className="cmat-right">
      <div className="cmat-right-hdr">
        <div className="cmat-right-title">
          <EntityBadge entity={entityItem.entity} isAdmin={false} />
          <span>#{entityItem.entity_id}</span>
        </div>
        <div className="cmat-right-sub">
          {entityItem.total_changes} change{entityItem.total_changes !== 1 ? 's' : ''} ·
          Last: {entityItem.last_action || '—'} by {entityItem.last_changed_by || '—'}
        </div>
      </div>
      <div className="cmat-right-body">
        {loading && <div className="cmat-right-loading">Loading history…</div>}
        {error && <div className="cmat-error">{error}</div>}
        {!loading && !error && versions.length === 0 && (
          <div className="cmat-right-loading">No audit entries found for this entity.</div>
        )}
        {!loading && versions.map((v, i) => (
          <VersionCard key={i} version={v} index={i} total={versions.length} />
        ))}
      </div>
    </div>
  )
}

function AdminActivityPanel({ token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  const fetchAdminActivity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = new URLSearchParams({ page, limit })
      const data = await httpFetch(`${API}/admin/cm-audit-trail/admin-activity?${p}`, { headers }).then(r => r.json())
      if (data.error) { setError(data.error); return }
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [headers, page])

  useEffect(() => {
    fetchAdminActivity()
    
    const handleRefresh = () => fetchAdminActivity()
    window.addEventListener('refresh-admin-audit', handleRefresh)
    return () => window.removeEventListener('refresh-admin-audit', handleRefresh)
  }, [fetchAdminActivity])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const versions = useMemo(() => groupIntoVersions(entries), [entries])

  return (
    <div className="cmat-admin-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="cmat-right-hdr" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div className="cmat-right-title">
          <span>Admin Configuration Activity</span>
        </div>
        <div className="cmat-right-sub">
          {total} total changes
        </div>
      </div>
      <div className="cmat-right-body" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {loading && <div className="cmat-right-loading">Loading history…</div>}
        {error && <div className="cmat-error">{error}</div>}
        {!loading && !error && versions.length === 0 && (
          <div className="cmat-right-loading">No admin audit entries found.</div>
        )}
        {!loading && versions.map((v, i) => (
          <VersionCard key={i} version={v} index={i + (page - 1) * limit} total={total} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="cmat-left-pagination" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <button className="cmat-left-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
          <span className="cmat-left-pg-info">{page} / {totalPages}</span>
          <button className="cmat-left-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
        </div>
      )}
    </div>
  )
}

export default function CMAuditTrailPage({ embedded = false } = {}) {
  const { token } = useAuth()
  const headers   = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const [activeTab, setActiveTab] = useState('cm') // 'cm' or 'admin'
  const [entities,    setEntities]    = useState([])
  const [total,       setTotal]       = useState(0)
  const [leftLoading, setLeftLoading] = useState(false)
  const [leftError,   setLeftError]   = useState(null)
  const [selected,    setSelected]    = useState(null)
  const [entityFilter, setEntityFilter] = useState('')
  const [page,        setPage]        = useState(1)
  const limit = 30

  const fetchEntities = useCallback(async () => {
    if (activeTab !== 'cm') return
    setLeftLoading(true); setLeftError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (entityFilter) params.set('entity', entityFilter)
      const res  = await httpFetch(`${API}/admin/cm-audit-trail/entities-summary?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLeftError(data.error || 'Failed to load entities.'); return }
      setEntities(data.entities || [])
      setTotal(data.total || 0)
    } catch { setLeftError('Network error.') }
    finally { setLeftLoading(false) }
  }, [entityFilter, headers, page, activeTab])

  useEffect(() => { fetchEntities() }, [fetchEntities])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  function handleFilter(val) { setEntityFilter(val); setPage(1); setSelected(null) }

  const content = (
    <>
      <div className="cmat-page">
        <div className="cmat-top" style={{ paddingBottom: 0 }}>
          <div>
            <h1 className="cmat-title">Audit Trail</h1>
            <span className="cmat-subtitle">Change history for CM and Admin configurations</span>
          </div>
          <button className="cmat-refresh-btn" onClick={() => activeTab === 'cm' ? fetchEntities() : window.dispatchEvent(new Event('refresh-admin-audit'))} disabled={leftLoading}>⟳ Refresh</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px', gap: '24px' }}>
          <button 
            style={{ padding: '12px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'cm' ? '2px solid #1d4ed8' : '2px solid transparent', color: activeTab === 'cm' ? '#1d4ed8' : '#64748b', fontWeight: activeTab === 'cm' ? 600 : 400, cursor: 'pointer', fontSize: '14px' }}
            onClick={() => setActiveTab('cm')}
          >
            CM Entities
          </button>
          <button 
            style={{ padding: '12px 4px', background: 'none', border: 'none', borderBottom: activeTab === 'admin' ? '2px solid #1d4ed8' : '2px solid transparent', color: activeTab === 'admin' ? '#1d4ed8' : '#64748b', fontWeight: activeTab === 'admin' ? 600 : 400, cursor: 'pointer', fontSize: '14px' }}
            onClick={() => setActiveTab('admin')}
          >
            Admin Activity
          </button>
        </div>

        {activeTab === 'cm' ? (
          <div className="cmat-panels">
            {/* Left — entity list */}
            <div className="cmat-left">
              <div className="cmat-left-hdr">
                <span className="cmat-left-title">Entities ({total})</span>
                <div className="cmat-left-filters">
                  <select className="cmat-filter-select" value={entityFilter} onChange={e => handleFilter(e.target.value)}>
                    <option value="">All Entity Types</option>
                    {Object.entries(ENTITY_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="cmat-left-list">
                {leftLoading && <div className="cmat-left-loading">Loading…</div>}
                {leftError   && <div className="cmat-left-empty" style={{ color: '#dc2626' }}>{leftError}</div>}
                {!leftLoading && entities.length === 0 && !leftError && (
                  <div className="cmat-left-empty">No CM entities with audit records{entityFilter ? ' of this type' : ''}.</div>
                )}
                {entities.map(e => (
                  <div
                    key={`${e.entity}-${e.entity_id}`}
                    className={`cmat-entity-item${selected?.entity === e.entity && selected?.entity_id === e.entity_id ? ' active' : ''}`}
                    onClick={() => setSelected(e)}
                  >
                    <div className="cmat-entity-item-top">
                      <EntityBadge entity={e.entity} isAdmin={false} />
                      <span className="cmat-entity-item-id">#{e.entity_id}</span>
                    </div>
                    <div className="cmat-entity-item-meta">
                      Last: {e.last_action || '—'} by {e.last_changed_by || '—'}
                    </div>
                    <div className="cmat-entity-item-stats">
                      <span className="cmat-entity-item-stat">{e.total_changes} changes</span>
                      <span className="cmat-entity-item-stat">
                        {e.last_changed_at ? new Date(e.last_changed_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="cmat-left-pagination">
                  <button className="cmat-left-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                  <span className="cmat-left-pg-info">{page} / {totalPages}</span>
                  <button className="cmat-left-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
                </div>
              )}
            </div>

            {/* Right — version history */}
            <RightPanel entityItem={selected} token={token} />
          </div>
        ) : (
          <div className="cmat-panels" style={{ flexDirection: 'column', overflow: 'hidden' }}>
            <AdminActivityPanel token={token} />
          </div>
        )}
      </div>
    </>
  )

  if (embedded) return content
  return <MIMSLayout activeNav="cm_audit_trail">{content}</MIMSLayout>
}
