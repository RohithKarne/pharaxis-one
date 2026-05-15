/**
 * ReportsAccess.jsx — MIMS Admin > System > Reports Access
 *
 * Three sub-tabs:
 *   1. Org Reports     — grant/revoke each report per tenant
 *   2. Org Users       — drill into a tenant + grant/revoke per user
 *   3. Access Requests — review pending requests from users
 *
 * CSS namespace: ma-ra-
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import './ReportsAccess.css'

const API = '/api/admin/reports-access'

// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsAccess() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [tab,      setTab]      = useState('org-reports')
  const [orgs,     setOrgs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [flash,    setFlash]    = useState(null)

  useEffect(() => { loadOrgs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrgs() {
    setLoading(true)
    try {
      const d = await httpFetch(`${API}/orgs`, { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
    finally   { setLoading(false) }
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3000)
  }

  const filteredOrgs = useMemo(() => {
    if (!search) return orgs
    const q = search.toLowerCase()
    return orgs.filter(o => o.name.toLowerCase().includes(q))
  }, [orgs, search])

  return (
    <div className="ma-ra-page">
      {/* Header */}
      <div className="ma-ra-header">
        <div>
          <h1 className="ma-ra-title">Reports Access</h1>
          <div className="ma-ra-sub">Grant report access per tenant or per user. Review access requests.</div>
        </div>
        {flash && (
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: flash.type === 'error' ? 'var(--error,#c00)' : '#1a7a3f',
          }}>{flash.msg}</span>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="ma-ra-tabs">
        <div className={`ma-ra-tab${tab === 'org-reports' ? ' active' : ''}`} onClick={() => setTab('org-reports')}>Org Reports</div>
        <div className={`ma-ra-tab${tab === 'org-users'   ? ' active' : ''}`} onClick={() => setTab('org-users')}>Org Users</div>
        <div className={`ma-ra-tab${tab === 'requests'    ? ' active' : ''}`} onClick={() => setTab('requests')}>Access Requests</div>
      </div>

      {/* Body */}
      <div className="ma-ra-body">
        {(tab === 'org-reports' || tab === 'org-users') && (
          <>
            {/* Left: org list */}
            <div className="ma-ra-orgs">
              <input
                className="ma-ra-org-search"
                placeholder="Search tenant…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {loading && <div className="ma-ra-loading">Loading…</div>}
              {!loading && filteredOrgs.length === 0 && <div className="ma-ra-empty">No tenants.</div>}
              {!loading && filteredOrgs.map(o => (
                <OrgItem
                  key={o.id} org={o}
                  active={false}
                  onClick={() => {}}
                />
              ))}
            </div>
            {tab === 'org-reports' && <OrgReportsPane orgs={filteredOrgs} H={H} onFlash={showFlash} loading={loading} />}
            {tab === 'org-users'   && <OrgUsersPane   orgs={filteredOrgs} H={H} onFlash={showFlash} loading={loading} />}
          </>
        )}
        {tab === 'requests' && <RequestsPane H={H} onFlash={showFlash} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────────
function OrgItem({ org, active, onClick }) {
  return (
    <div className={`ma-ra-org-item${active ? ' active' : ''}`} onClick={onClick}>
      <span className="ma-ra-org-name">{org.name}</span>
      <span className="ma-ra-org-meta">{org.reports_enabled || 0} report{(org.reports_enabled || 0) !== 1 ? 's' : ''} enabled</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 — Org Reports
// ─────────────────────────────────────────────────────────────────────────────
function OrgReportsPane({ orgs, H, onFlash, loading }) {
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [reports,     setReports]     = useState([])
  const [busy,        setBusy]        = useState(false)

  useEffect(() => {
    if (!selectedOrg) { setReports([]); return }
    setBusy(true)
    httpFetch(`${API}/org/${selectedOrg.id}`, { headers: H })
      .then(r => r.json()).then(d => setReports(d.reports || []))
      .catch(() => setReports([]))
      .finally(() => setBusy(false))
  }, [selectedOrg, H])

  async function toggleReport(report_key, enabled) {
    setReports(r => r.map(x => x.key === report_key ? { ...x, is_enabled: enabled ? 1 : 0 } : x))
    try {
      const r = await httpFetch(`${API}/org/${selectedOrg.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ report_key, is_enabled: enabled }),
      })
      if (!r.ok) { onFlash('Failed to save.', 'error'); return }
      onFlash(`Updated ${report_key}`)
    } catch { onFlash('Network error.', 'error') }
  }

  return (
    <div className="ma-ra-content">
      {!selectedOrg && (
        <>
          <div className="ma-ra-section-title">Select a tenant</div>
          <div className="ma-ra-grid">
            {orgs.map(o => (
              <div key={o.id} className="ma-ra-report-card" onClick={() => setSelectedOrg(o)} style={{ cursor: 'pointer' }}>
                <div>
                  <div className="ma-ra-report-label">{o.name}</div>
                  <div className="ma-ra-org-meta">{o.reports_enabled || 0} enabled</div>
                </div>
                <span style={{ color: 'var(--accent)' }}>→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedOrg && (
        <>
          <span className="ma-ra-back-link" onClick={() => setSelectedOrg(null)}>← Back to tenants</span>
          <div className="ma-ra-section-title">{selectedOrg.name} — Reports ({reports.filter(r => r.is_enabled).length} of {reports.length} enabled)</div>
          {busy && <div className="ma-ra-loading">Loading…</div>}
          {!busy && (
            <div className="ma-ra-grid">
              {reports.map(r => (
                <div key={r.key} className="ma-ra-report-card">
                  <span className="ma-ra-report-label">{r.label}</span>
                  <label className="ma-ra-toggle">
                    <input
                      type="checkbox"
                      checked={!!r.is_enabled}
                      onChange={e => toggleReport(r.key, e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loading && !selectedOrg && <div className="ma-ra-loading">Loading tenants…</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 — Org Users
// ─────────────────────────────────────────────────────────────────────────────
function OrgUsersPane({ orgs, H, onFlash, loading }) {
  const [selectedOrg,  setSelectedOrg]  = useState(null)
  const [users,        setUsers]        = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [userReports,  setUserReports]  = useState([])
  const [busy,         setBusy]         = useState(false)

  // Load users when org selected
  const loadUsers = useCallback(async () => {
    if (!selectedOrg) { setUsers([]); return }
    setBusy(true)
    try {
      const d = await httpFetch(`${API}/org/${selectedOrg.id}/users`, { headers: H }).then(r => r.json())
      setUsers(d.users || [])
    } catch { setUsers([]) } finally { setBusy(false) }
  }, [selectedOrg, H])

  // Load user reports when user selected
  const loadUserReports = useCallback(async () => {
    if (!selectedUser || !selectedOrg) { setUserReports([]); return }
    setBusy(true)
    try {
      const d = await httpFetch(`${API}/org/${selectedOrg.id}/user/${selectedUser.id}`, { headers: H }).then(r => r.json())
      setUserReports(d.reports || [])
    } catch { setUserReports([]) } finally { setBusy(false) }
  }, [selectedUser, selectedOrg, H])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { loadUserReports() }, [loadUserReports])

  async function toggleUserReport(report_key, enabled) {
    setUserReports(r => r.map(x => x.key === report_key ? { ...x, is_enabled: enabled ? 1 : 0 } : x))
    try {
      const r = await httpFetch(`${API}/org/${selectedOrg.id}/user/${selectedUser.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ report_key, is_enabled: enabled }),
      })
      if (!r.ok) { onFlash('Failed to save.', 'error'); return }
      onFlash(`Updated ${report_key} for ${selectedUser.name}`)
    } catch { onFlash('Network error.', 'error') }
  }

  return (
    <div className="ma-ra-content">
      {!selectedOrg && (
        <>
          <div className="ma-ra-section-title">Select a tenant</div>
          <div className="ma-ra-grid">
            {orgs.map(o => (
              <div key={o.id} className="ma-ra-report-card" onClick={() => setSelectedOrg(o)} style={{ cursor: 'pointer' }}>
                <span className="ma-ra-report-label">{o.name}</span>
                <span style={{ color: 'var(--accent)' }}>→</span>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedOrg && !selectedUser && (
        <>
          <span className="ma-ra-back-link" onClick={() => { setSelectedOrg(null); setUsers([]) }}>← Back to tenants</span>
          <div className="ma-ra-section-title">{selectedOrg.name} — Users</div>
          {busy && <div className="ma-ra-loading">Loading users…</div>}
          {!busy && users.length === 0 && <div className="ma-ra-empty">No users in this tenant.</div>}
          {!busy && users.map(u => (
            <div key={u.id} className="ma-ra-user-row" onClick={() => setSelectedUser(u)}>
              <div className="ma-ra-user-info">
                <div className="ma-ra-user-name">{u.name}</div>
                <div className="ma-ra-user-meta">{u.email} · {u.role}</div>
              </div>
              <span className="ma-ra-user-pill">{u.reports_granted || 0} reports</span>
              <span style={{ color: 'var(--accent)' }}>→</span>
            </div>
          ))}
        </>
      )}

      {selectedOrg && selectedUser && (
        <>
          <span className="ma-ra-back-link" onClick={() => { setSelectedUser(null); setUserReports([]) }}>← Back to users</span>
          <div className="ma-ra-section-title">{selectedUser.name} ({selectedUser.email}) — Reports</div>
          {busy && <div className="ma-ra-loading">Loading…</div>}
          {!busy && (
            <div className="ma-ra-grid">
              {userReports.map(r => (
                <div key={r.key} className="ma-ra-report-card">
                  <span className="ma-ra-report-label">{r.label}</span>
                  <label className="ma-ra-toggle">
                    <input
                      type="checkbox"
                      checked={!!r.is_enabled}
                      onChange={e => toggleUserReport(r.key, e.target.checked)}
                    />
                    <span className="slider" />
                  </label>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {loading && !selectedOrg && <div className="ma-ra-loading">Loading tenants…</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 3 — Access Requests
// ─────────────────────────────────────────────────────────────────────────────
function RequestsPane({ H, onFlash }) {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await httpFetch(`${API}/requests`, { headers: H }).then(r => r.json())
      setRequests(d.requests || [])
    } catch { setRequests([]) } finally { setLoading(false) }
  }, [H])

  useEffect(() => { load() }, [load])

  async function review(id, status) {
    try {
      const r = await httpFetch(`${API}/requests/${id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ status }),
      })
      if (!r.ok) { onFlash('Failed to update request.', 'error'); return }
      onFlash(`Request ${status}.`)
      load()
    } catch { onFlash('Network error.', 'error') }
  }

  return (
    <div className="ma-ra-content" style={{ flex: 1 }}>
      <div className="ma-ra-section-title">Pending and Recent Requests</div>
      {loading && <div className="ma-ra-loading">Loading…</div>}
      {!loading && requests.length === 0 && <div className="ma-ra-empty">No requests.</div>}
      {!loading && requests.length > 0 && (
        <table className="ma-ra-table">
          <thead>
            <tr>
              <th>Requested By</th>
              <th>For User</th>
              <th>Tenant</th>
              <th>Report</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id}>
                <td>{r.requested_by_name}</td>
                <td>{r.user_name}</td>
                <td>{r.org_name}</td>
                <td><code style={{ fontSize: 11 }}>{r.report_key}</code></td>
                <td>
                  <span className={`ma-ra-status-pill ma-ra-status-${r.status}`}>{r.status}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.status === 'pending' && (
                    <>
                      <button className="ma-ra-req-btn approve" onClick={() => review(r.id, 'approved')} style={{ marginRight: 6 }}>Approve</button>
                      <button className="ma-ra-req-btn reject"  onClick={() => review(r.id, 'rejected')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
