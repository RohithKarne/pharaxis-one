import { useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const REPORT_KEYS = [
  'cases_by_type', 'cases_by_status', 'cases_by_month', 'cases_by_site',
  'cases_by_priority', 'cases_by_assignee', 'cases_by_intake', 'cases_overdue',
  'case_detail_full', 'case_detail_timeline', 'case_detail_audit',
  'compliance_sla', 'compliance_30day', 'compliance_expedited', 'compliance_closures',
  'platform_users', 'platform_logins', 'platform_orgs', 'platform_cases_trend',
  'platform_top_reporters', 'platform_audit_summary', 'platform_2fa',
  'platform_sessions', 'platform_api_usage', 'platform_errors',
]

export default function AdminReportAccessPanel({ H }) {
  const [reportAccessList, setReportAccessList] = useState([])
  const [reportAccessRequests, setReportAccessRequests] = useState([])
  const [reportAccessLoading, setReportAccessLoading] = useState(false)
  const [reportReqForm, setReportReqForm] = useState({ user_id: '', report_key: '' })
  const [reportReqMsg, setReportReqMsg] = useState('')
  const [reportReqSaving, setReportReqSaving] = useState(false)

  useEffect(() => { loadReportAccessData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadReportAccessData() {
    setReportAccessLoading(true)
    try {
      const [accessData, requestData] = await Promise.all([
        httpFetch('/api/admin/reports/access', { headers: H }).then(r => r.json()).catch(() => ({ access: [] })),
        httpFetch('/api/admin/reports/access/requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
      ])
      setReportAccessList(accessData.access || [])
      setReportAccessRequests(requestData.requests || [])
    } finally {
      setReportAccessLoading(false)
    }
  }

  async function submitReportRequest() {
    setReportReqSaving(true)
    setReportReqMsg('')
    try {
      const response = await httpFetch('/api/admin/reports/access/request', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          user_id: parseInt(reportReqForm.user_id, 10),
          report_key: reportReqForm.report_key,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setReportReqMsg('✓ Request submitted - pending SuperAdmin approval.')
        setReportReqForm({ user_id: '', report_key: '' })
        const updated = await httpFetch('/api/admin/reports/access/requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] }))
        setReportAccessRequests(updated.requests || [])
      } else {
        setReportReqMsg(data.error || 'Request failed.')
      }
    } catch {
      setReportReqMsg('Request failed.')
    } finally {
      setReportReqSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>Report Access Requests</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Request report access for users in your organisation. Requests are reviewed and approved by the SuperAdmin team.</p>

      <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
        <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>New Access Request</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>User ID</label>
            <input className="form-input" type="number" placeholder="Enter user ID" value={reportReqForm.user_id} onChange={e => setReportReqForm(prev => ({ ...prev, user_id: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Report</label>
            <select className="form-input" value={reportReqForm.report_key} onChange={e => setReportReqForm(prev => ({ ...prev, report_key: e.target.value }))}>
              <option value="">Select report...</option>
              {REPORT_KEYS.map(key => (
                <option key={key} value={key}>{key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>
        {reportReqMsg && <p style={{ marginBottom: 12, fontSize: 13, color: reportReqMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{reportReqMsg}</p>}
        <button className="btn btn-primary" disabled={!reportReqForm.user_id || !reportReqForm.report_key || reportReqSaving} onClick={submitReportRequest}>
          {reportReqSaving ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Request History</h4>
        {reportAccessLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
        ) : reportAccessRequests.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No requests submitted yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['User', 'Report', 'Requested By', 'Status', 'Date'].map(header => <th key={header} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{header}</th>)}
            </tr></thead>
            <tbody>{reportAccessRequests.map((request, index) => (
              <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{request.user_name || request.user_id}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{request.report_key}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{request.requested_by_name || '—'}</td>
                <td style={{ padding: '6px 8px' }}><span style={{ color: request.status === 'approved' ? 'var(--success)' : request.status === 'rejected' ? 'var(--warning)' : 'var(--text-muted)' }}>{request.status}</span></td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div>
        <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Current Access</h4>
        {reportAccessList.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No report access granted to users in your organisation yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['User', 'Email', 'Report', 'Granted'].map(header => <th key={header} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{header}</th>)}
            </tr></thead>
            <tbody>{reportAccessList.map((row, index) => (
              <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px' }}>{row.user_name}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 12 }}>{row.email}</td>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{row.report_key}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.granted_at ? new Date(row.granted_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
