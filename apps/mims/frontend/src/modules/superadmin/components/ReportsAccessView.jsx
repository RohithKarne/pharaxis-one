import { useState, useEffect } from 'react'
import React from 'react'
import { guardedFetch } from '../utils/guardedFetch'

const REPORT_KEYS = [
  { key: 'case-volume', label: 'Case Volume' },
  { key: 'case-status', label: 'Case Status Distribution' },
  { key: 'case-type', label: 'Case Type Breakdown' },
  { key: 'case-age', label: 'Case Age & SLA' },
  { key: 'case-assignee', label: 'Cases by Assignee' },
  { key: 'case-by-org', label: 'Cases by Org & Site' },
  { key: 'case-intake-channel', label: 'Intake Channel' },
  { key: 'case-priority', label: 'Case Priority' },
  { key: 'case-ae-summary', label: 'Adverse Event Summary' },
  { key: 'case-duplicates', label: 'Duplicate Detection' },
  { key: 'case-source', label: 'Case Source' },
  { key: 'case-audit-trail', label: 'Case Audit Trail' },
  { key: 'regulatory-readiness', label: 'Regulatory Readiness' },
  { key: 'case-monthly-trend', label: 'Monthly Trend' },
  { key: 'case-closure-rate', label: 'Closure Rate' },
  { key: 'user-activity', label: 'User Login Activity' },
  { key: 'security-events', label: 'Security Events' },
  { key: 'module-usage', label: 'Module Usage' },
  { key: 'org-activity', label: 'Org Activity' },
  { key: 'user-roles', label: 'User Role Distribution' },
  { key: 'content-usage', label: 'Content Usage' },
  { key: 'integration-sync', label: 'Integration Sync Status' },
  { key: 'audit-summary', label: 'Audit Summary' },
  { key: 'system-health', label: 'System Health' },
  { key: 'field-usage', label: 'Field Usage' },
]

export default function ReportsAccessView({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [orgReports, setOrgReports] = useState([])
  const [orgUsers, setOrgUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [viewTab, setViewTab] = useState('org-reports')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    guardedFetch('/api/superadmin/reports/orgs', { headers: H })
      .then(r => r.json()).then(d => setOrgs(d.orgs || []))
    guardedFetch('/api/superadmin/reports/requests', { headers: H })
      .then(r => r.json()).then(d => setRequests(d.requests || []))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function selectOrg(org) {
    setSelectedOrg(org)
    setViewTab('org-reports')
    const [rRes, uRes] = await Promise.all([
      guardedFetch('/api/superadmin/reports/org/' + org.id, { headers: H }).then(r => r.json()),
      guardedFetch('/api/superadmin/reports/org/' + org.id + '/users', { headers: H }).then(r => r.json()),
    ])
    setOrgReports(rRes.reports || [])
    setOrgUsers(uRes.users || [])
  }

  async function toggleOrgReport(reportKey, current) {
    setSaving(true)
    await guardedFetch('/api/superadmin/reports/org/' + selectedOrg.id, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_key: reportKey, is_enabled: current ? 0 : 1 }),
    })
    setOrgReports(prev => prev.map(r => r.key === reportKey ? { ...r, is_enabled: current ? 0 : 1 } : r))
    setSaving(false)
    flash('Report access updated')
  }

  async function toggleUserReport(userId, reportKey, current) {
    setSaving(true)
    await guardedFetch('/api/superadmin/reports/org/' + selectedOrg.id + '/user/' + userId, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_key: reportKey, is_enabled: current ? 0 : 1 }),
    })
    setSaving(false)
    flash('User report access updated')
  }

  async function reviewRequest(id, status) {
    await guardedFetch('/api/superadmin/reports/requests/' + id, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    flash('Request ' + status)
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 4 }}>Reports Access</h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Enable reports per organisation and grant access to individual users.
      </p>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Organisations</div>
          {orgs.map(org => (
            <div key={org.id}
              onClick={() => selectOrg(org)}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selectedOrg && selectedOrg.id === org.id ? '#e8890c22' : '#f5f5f5',
                border: '1px solid ' + (selectedOrg && selectedOrg.id === org.id ? '#e8890c' : '#ddd'),
                fontSize: 13,
              }}>
              <div style={{ fontWeight: 500 }}>{org.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{org.reports_enabled} reports enabled</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {!selectedOrg ? (
            <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
              Select an organisation to manage report access
            </div>
          ) : (
            <React.Fragment>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['org-reports', 'user-access', 'requests'].map(t => (
                  <button key={t} onClick={() => setViewTab(t)}
                    style={{
                      padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd',
                      background: viewTab === t ? '#e8890c' : '#fff',
                      color: viewTab === t ? '#fff' : '#333',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    }}>
                    {t === 'org-reports' ? 'Org Reports' : t === 'user-access' ? 'User Access' : ('Requests' + (pendingCount > 0 ? ' (' + pendingCount + ')' : ''))}
                  </button>
                ))}
              </div>

              {viewTab === 'org-reports' && (
                <table className='admin-table'>
                  <thead><tr><th>Report</th><th>Enabled</th></tr></thead>
                  <tbody>
                    {orgReports.map(r => (
                      <tr key={r.key}>
                        <td>{r.label || r.key}</td>
                        <td>
                          <input type='checkbox' checked={!!r.is_enabled} disabled={saving}
                            onChange={() => toggleOrgReport(r.key, r.is_enabled)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {viewTab === 'user-access' && (
                <div>
                  {orgUsers.map(u => (
                    <div key={u.id} style={{ marginBottom: 16, border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{u.name} <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>({u.role})</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {REPORT_KEYS.map(rk => (
                          <label key={rk.key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type='checkbox' disabled={saving}
                              onChange={() => toggleUserReport(u.id, rk.key, false)} />
                            {rk.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {viewTab === 'requests' && (
                <table className='admin-table'>
                  <thead><tr><th>User</th><th>Report</th><th>Requested By</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {requests.filter(r => r.org_id === selectedOrg.id).map(r => (
                      <tr key={r.id}>
                        <td>{r.user_name}</td>
                        <td>{r.report_key}</td>
                        <td>{r.requested_by_name}</td>
                        <td><span style={{ color: r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : '#e8890c' }}>{r.status}</span></td>
                        <td>
                          {r.status === 'pending' && (
                            <React.Fragment>
                              <button onClick={() => reviewRequest(r.id, 'approved')} style={{ marginRight: 6, color: 'green', background: 'none', border: '1px solid green', borderRadius: 4, cursor: 'pointer', padding: '2px 8px' }}>Approve</button>
                              <button onClick={() => reviewRequest(r.id, 'rejected')} style={{ color: 'red', background: 'none', border: '1px solid red', borderRadius: 4, cursor: 'pointer', padding: '2px 8px' }}>Reject</button>
                            </React.Fragment>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  )
}
