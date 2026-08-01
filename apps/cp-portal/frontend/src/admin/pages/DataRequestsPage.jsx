import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// CP-63 — GDPR data-subject request queue. Exports are logged (self-service);
// erasure requests are reviewed and fulfilled here (retention-aware anonymization).
const STATUS_TONE = { pending: '#d97706', fulfilled: '#16a34a', rejected: '#64748b' }

export default function DataRequestsPage() {
  const { clientId } = useParams()
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(null)
  const [result, setResult]     = useState({})

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/data-requests/${clientId}`, { headers: adminHeaders() })
      if (!res.ok) { setError(`Could not load data requests (error ${res.status}).`); return }
      const d = await res.json()
      setRequests(d.requests || [])
    } catch { setError('Network error — please try again.') } finally { setLoading(false) }
  }

  async function act(id, action, reason) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/data-requests/${clientId}/${id}/${action}`, {
        method: 'POST', headers: adminHeaders(),
        body: reason ? JSON.stringify({ reason }) : undefined,
      })
      const d = await res.json().catch(() => ({}))
      setResult(r => ({ ...r, [id]: res.ok ? (d.summary ? summarize(d.summary) : d.status) : (d.error || 'Failed') }))
      load()
    } catch { setResult(r => ({ ...r, [id]: 'Network error' })) } finally { setBusy(null) }
  }

  function summarize(s) {
    return `Retained: ${(s.retained || []).join(', ') || 'none'} · Deleted: ${(s.deleted || []).join(', ') || 'none'} · Anonymized: ${(s.anonymized || []).join(', ')}`
  }

  const pending = requests.filter(r => r.status === 'pending').length

  return (
    <AdminLayout title="Data Requests">
      <p className="cp-page-desc">GDPR data-subject requests. Exports are self-service (logged here); account-deletion requests are reviewed and fulfilled with legal retention holds applied.</p>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading ? <div className="cp-loading">Loading…</div> : (
        <>
          <div className="cp-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Requests {pending > 0 ? `· ${pending} pending` : ''}</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={load}>↻ Refresh</button>
          </div>

          {requests.length === 0 ? (
            <div className="cp-empty"><div style={{ fontSize: 40 }}>🛡️</div><p>No data requests yet.</p></div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr><th>Type</th><th>Requester</th><th>Status</th><th>Requested</th><th>Notes</th><th /></tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id}>
                    <td style={{ textTransform: 'capitalize' }}>{r.request_type}</td>
                    <td>{r.requester_name || '—'}<br /><span style={{ fontSize: 12, color: '#64748b' }}>{r.requester_email}</span></td>
                    <td><span style={{ color: STATUS_TONE[r.status] || '#334155', fontWeight: 600, textTransform: 'capitalize' }}>{r.status}</span></td>
                    <td>{r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}</td>
                    <td style={{ maxWidth: 280, fontSize: 12, color: '#475569' }}>{r.notes || '—'}</td>
                    <td>
                      {r.request_type === 'erasure' && r.status === 'pending' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="cp-btn cp-btn-sm cp-btn-primary" disabled={busy === r.id}
                            onClick={() => { if (window.confirm('Fulfil this erasure? Non-retained data will be deleted and the identity anonymized. This cannot be undone.')) act(r.id, 'fulfill') }}>
                            {busy === r.id ? 'Working…' : 'Fulfil'}
                          </button>
                          <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={busy === r.id}
                            onClick={() => { const reason = window.prompt('Reason for rejecting (e.g. identity not verified):'); if (reason != null) act(r.id, 'reject', reason) }}>
                            Reject
                          </button>
                        </div>
                      ) : <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>}
                      {result[r.id] && <div style={{ fontSize: 11, marginTop: 4, color: '#475569', maxWidth: 320 }}>{result[r.id]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </AdminLayout>
  )
}
