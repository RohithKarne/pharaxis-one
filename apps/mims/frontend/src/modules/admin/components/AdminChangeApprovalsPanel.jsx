import { useState, useEffect } from 'react'
import { SectionHeader } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch'
import { useAuth } from '../../../shared/context/AuthContext'

export default function AdminChangeApprovalsPanel({ H, flash }) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [policies, setPolicies] = useState([
    { category: 'security_groups', requires_dual_approval: false },
    { category: 'compliance_locks', requires_dual_approval: false },
    { category: 'access_config', requires_dual_approval: false }
  ])
  const [loading, setLoading] = useState(true)
  const [rejectReason, setRejectReason] = useState({})

  useEffect(() => {
    fetchRequests()
    fetchPolicies()
  }, [])

  async function fetchRequests() {
    try {
      const res = await httpFetch('/api/admin/change-approvals?status=pending', { headers: H })
      const data = await res.json()
      setRequests(data.requests || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPolicies() {
    try {
      const res = await httpFetch('/api/admin/change-approvals/policy', { headers: H })
      const data = await res.json()
      if (data.policies && data.policies.length > 0) {
        const pMap = Object.fromEntries(data.policies.map(p => [p.category, p.requires_dual_approval === 1]))
        setPolicies(prev => prev.map(p => ({ ...p, requires_dual_approval: pMap[p.category] ?? p.requires_dual_approval })))
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function handleApprove(id) {
    try {
      const res = await httpFetch(`/api/admin/change-approvals/${id}/approve`, { method: 'PUT', headers: H })
      if (!res.ok) {
        const errorData = await res.json()
        if (flash) flash(errorData.error || 'Approval failed', 'error')
        else alert(errorData.error || 'Approval failed')
        return
      }
      if (flash) flash('Request approved successfully', 'success')
      fetchRequests()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleReject(id) {
    const reason = rejectReason[id] || ''
    if (!reason.trim()) {
      if (flash) flash('Rejection reason is required', 'error')
      else alert('Rejection reason is required')
      return
    }
    try {
      const res = await httpFetch(`/api/admin/change-approvals/${id}/reject`, {
        method: 'PUT',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejection_note: reason })
      })
      if (!res.ok) {
        const errorData = await res.json()
        if (flash) flash(errorData.error || 'Rejection failed', 'error')
        else alert(errorData.error || 'Rejection failed')
        return
      }
      if (flash) flash('Request rejected successfully', 'success')
      fetchRequests()
    } catch (e) {
      console.error(e)
    }
  }

  async function savePolicies() {
    try {
      const res = await httpFetch('/api/admin/change-approvals/policy', {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ policies })
      })
      if (res.ok) {
        if (flash) flash('Policies updated successfully', 'success')
      }
    } catch (e) {
      console.error(e)
    }
  }

  function togglePolicy(category) {
    setPolicies(prev => prev.map(p => p.category === category ? { ...p, requires_dual_approval: !p.requires_dual_approval } : p))
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <SectionHeader title="Delegation & Change Approvals Dashboard" desc="Manage dual-admin approvals for sensitive configuration changes." />

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid #ccc', paddingBottom: 10 }}>
        <button
          className="btn"
          style={{ background: activeTab === 'pending' ? '#1d4ed8' : '#f3f4f6', color: activeTab === 'pending' ? '#fff' : '#000', border: 'none', padding: '8px 16px', cursor: 'pointer', borderRadius: 4 }}
          onClick={() => setActiveTab('pending')}
        >
          Pending Approvals
        </button>
        <button
          className="btn"
          style={{ background: activeTab === 'policy' ? '#1d4ed8' : '#f3f4f6', color: activeTab === 'policy' ? '#fff' : '#000', border: 'none', padding: '8px 16px', cursor: 'pointer', borderRadius: 4 }}
          onClick={() => setActiveTab('policy')}
        >
          Configuration Policy
        </button>
      </div>

      {activeTab === 'pending' && (
        <div className="card" style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          {loading ? <p>Loading...</p> : (
            <table className="admin-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: 8 }}>Change Details</th>
                  <th style={{ padding: 8 }}>Requester</th>
                  <th style={{ padding: 8 }}>Reason</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr><td colSpan="4" style={{ padding: 8 }}>No pending requests found.</td></tr>
                ) : (
                  requests.map(req => {
                    const isRequester = Number(user?.id || user?.userId) === Number(req.requester_id)
                    return (
                      <tr key={req.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: 8 }}>
                          <strong>{req.entity}</strong>: {req.field_name}
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            Before: <code>{req.current_value || 'None'}</code> &rarr; After: <code>{req.proposed_value}</code>
                          </div>
                        </td>
                        <td style={{ padding: 8 }}>{req.requester_name} <div style={{ fontSize: 12, color: '#666' }}>{req.requester_email}</div></td>
                        <td style={{ padding: 8 }}>{req.reason || '-'}</td>
                        <td style={{ padding: 8 }}>
                          {isRequester ? (
                            <div style={{ color: '#b91c1c', fontSize: 12, background: '#fee2e2', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                              You cannot approve your own request.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <button onClick={() => handleApprove(req.id)} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>Approve</button>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <input type="text" placeholder="Rejection reason..." value={rejectReason[req.id] || ''} onChange={e => setRejectReason(prev => ({ ...prev, [req.id]: e.target.value }))} style={{ padding: '6px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }} />
                                <button onClick={() => handleReject(req.id)} style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>Reject</button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'policy' && (
        <div className="card" style={{ padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Dual-Admin Approval Policies</h3>
          <p style={{ color: '#666', fontSize: 14 }}>Enable dual-approval for sensitive configurations to enforce a maker-checker process.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {policies.map(p => (
              <label key={p.category} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={p.requires_dual_approval}
                  onChange={() => togglePolicy(p.category)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 500 }}>{p.category}</span>
              </label>
            ))}
          </div>
          <button onClick={savePolicies} style={{ marginTop: 24, background: '#1d4ed8', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}>Save Policies</button>
        </div>
      )}
    </div>
  )
}
