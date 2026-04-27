import { useEffect, useState } from 'react'

export default function AdminChangeApprovalsPanel({ H }) {
  const [changeApprovals, setChangeApprovals] = useState([])
  const [myChangeRequests, setMyChangeRequests] = useState([])
  const [changeApprovalsLoading, setChangeApprovalsLoading] = useState(false)
  const [changeApprovalsTab, setChangeApprovalsTab] = useState('pending')
  const [changeApprovalsStatusFilter, setChangeApprovalsStatusFilter] = useState('pending')
  const [changeRejectId, setChangeRejectId] = useState(null)
  const [changeRejectNote, setChangeRejectNote] = useState('')
  const [changeActionMsg, setChangeActionMsg] = useState('')

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => { loadChangeApprovalsData() }, [changeApprovalsStatusFilter])
  /* eslint-enable react-hooks/exhaustive-deps */

  async function loadChangeApprovalsData() {
    setChangeApprovalsLoading(true)
    try {
      const [approvalsData, myRequestsData] = await Promise.all([
        fetch(`/api/admin/change-approvals?status=${changeApprovalsStatusFilter}`, { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
        fetch('/api/admin/change-approvals/my-requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
      ])
      setChangeApprovals(approvalsData.requests || [])
      setMyChangeRequests(myRequestsData.requests || [])
    } finally {
      setChangeApprovalsLoading(false)
    }
  }

  function getChangeApprovalStatusColor(status) {
    if (status === 'approved') return 'var(--success)'
    if (status === 'rejected') return 'var(--danger)'
    return '#b8860b'
  }

  async function approveChangeRequest(id) {
    setChangeActionMsg('')
    const response = await fetch(`/api/admin/change-approvals/${id}/approve`, { method: 'PUT', headers: H })
    const data = await response.json()
    setChangeActionMsg(response.ok ? '✓ Request approved.' : data.error || 'Failed.')
    if (response.ok) setChangeApprovals(prev => prev.filter(item => item.id !== id))
  }

  async function rejectChangeRequest(id) {
    setChangeActionMsg('')
    const response = await fetch(`/api/admin/change-approvals/${id}/reject`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ rejection_note: changeRejectNote }),
    })
    const data = await response.json()
    setChangeActionMsg(response.ok ? '✓ Request rejected.' : data.error || 'Failed.')
    if (response.ok) {
      setChangeApprovals(prev => prev.filter(item => item.id !== id))
      setChangeRejectId(null)
      setChangeRejectNote('')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h2 style={{ marginBottom: 4 }}>Change Approvals</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Review and action pending change approval requests for your organisation. Admins can approve or reject proposed changes submitted by users.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${changeApprovalsTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsTab('pending')}>Pending Approvals</button>
        <button className={`btn ${changeApprovalsTab === 'my-requests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsTab('my-requests')}>My Requests</button>
      </div>

      {changeActionMsg && (
        <p style={{ marginBottom: 16, fontSize: 13, color: changeActionMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{changeActionMsg}</p>
      )}

      {changeApprovalsTab === 'pending' && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Filter by status:</label>
            {['pending', 'approved', 'rejected'].map(status => (
              <button key={status} className={`btn btn-sm ${changeApprovalsStatusFilter === status ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsStatusFilter(status)}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
          {changeApprovalsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
          ) : changeApprovals.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No {changeApprovalsStatusFilter} requests.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th><th>Requester</th><th>Entity</th><th>Field</th><th>Current Value</th><th>Proposed Value</th><th>Reason</th><th>Submitted</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {changeApprovals.map(request => (
                  <tr key={request.id}>
                    <td>{request.id}</td>
                    <td>{request.requester_name || request.requester_email || request.requester_id}</td>
                    <td>{request.entity}{request.entity_id ? ` #${request.entity_id}` : ''}</td>
                    <td>{request.field_name}</td>
                    <td style={{ maxWidth: 140, wordBreak: 'break-word', fontSize: 12 }}>{request.current_value || '—'}</td>
                    <td style={{ maxWidth: 160, wordBreak: 'break-word', fontSize: 12 }}>{request.proposed_value}</td>
                    <td style={{ maxWidth: 180, fontSize: 12 }}>{request.reason || '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {request.status === 'pending' ? (
                        <>
                          <button className="btn btn-sm btn-primary" style={{ marginRight: 6 }} onClick={() => approveChangeRequest(request.id)}>Approve</button>
                          {changeRejectId === request.id ? (
                            <span style={{ display: 'inline-flex', gap: 4 }}>
                              <input className="form-input" style={{ width: 160, padding: '2px 6px', fontSize: 12 }} placeholder="Rejection note..." value={changeRejectNote} onChange={e => setChangeRejectNote(e.target.value)} />
                              <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => rejectChangeRequest(request.id)}>Confirm</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => { setChangeRejectId(null); setChangeRejectNote('') }}>Cancel</button>
                            </span>
                          ) : (
                            <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => { setChangeRejectId(request.id); setChangeRejectNote('') }}>Reject</button>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: getChangeApprovalStatusColor(request.status) }}>{request.status.toUpperCase()}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {changeApprovalsTab === 'my-requests' && (
        <>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Requests I Submitted</h4>
          {changeApprovalsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
          ) : myChangeRequests.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No requests submitted yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Entity</th><th>Field</th><th>Proposed Value</th><th>Reason</th><th>Status</th><th>Note</th><th>Submitted</th></tr>
              </thead>
              <tbody>
                {myChangeRequests.map(request => (
                  <tr key={request.id}>
                    <td>{request.entity}{request.entity_id ? ` #${request.entity_id}` : ''}</td>
                    <td>{request.field_name}</td>
                    <td style={{ maxWidth: 180, wordBreak: 'break-word', fontSize: 12 }}>{request.proposed_value}</td>
                    <td style={{ maxWidth: 200, fontSize: 12 }}>{request.reason || '—'}</td>
                    <td><span style={{ fontWeight: 600, color: getChangeApprovalStatusColor(request.status) }}>{request.status.toUpperCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{request.rejection_note || '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}
