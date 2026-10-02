import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// FIX-2: the Sync Health dashboard — live view over the O2 sync-health API.
// Answers "is the MIMS integration healthy, and what failed?" at a glance.
const STATUS_TILES = [
  { key: 'synced',       label: 'Synced to MIMS', tone: '#16a34a' },
  { key: 'failed_sync',  label: 'Failed Sync',    tone: '#dc2626' },
  { key: 'pending_sync', label: 'Pending Sync',   tone: '#d97706' },
  { key: 'submitted',    label: 'CP-only / New',  tone: '#2563eb' },
  { key: 'closed',       label: 'Closed',         tone: '#64748b' },
]

export default function SyncHealthPage() {
  const { clientId } = useParams()
  const { admin } = useAdminAuth()
  const [counts, setCounts]     = useState({})
  const [failures, setFailures] = useState([])
  const [files, setFiles]       = useState([])
  const [fileResult, setFileResult] = useState({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [retrying, setRetrying] = useState(null)
  const [retryResult, setRetryResult] = useState({})

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/sync-health`, { headers: adminHeaders() })
      if (!res.ok) { setError(`Could not load sync health (error ${res.status}).`); return }
      const d = await res.json()
      setCounts(d.counts || {})
      setFailures(d.failures || [])
      setFiles(d.files || [])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function retry(submissionId) {
    setRetrying(submissionId)
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/${submissionId}/retry`, { method: 'POST', headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      setRetryResult(r => ({ ...r, [submissionId]: d }))
      load()
    } catch {
      setRetryResult(r => ({ ...r, [submissionId]: { error: 'Network error' } }))
    } finally {
      setRetrying(null)
    }
  }

  // Bridge row 3: send one file to its MIMS case again.
  async function retryFile(attachmentId) {
    setRetrying(`file-${attachmentId}`)
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/attachments/${attachmentId}/retry`, { method: 'POST', headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      setFileResult(r => ({ ...r, [attachmentId]: res.ok ? d : { error: d.error || `Error ${res.status}` } }))
      load()
    } catch {
      setFileResult(r => ({ ...r, [attachmentId]: { error: 'Network error' } }))
    } finally {
      setRetrying(null)
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0)

  return (
    <AdminLayout title="Sync Health">
      <p className="cp-page-desc">Live health of the MIMS integration — submission sync status and failed syncs with one-click retry.</p>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading ? <div className="cp-loading">Loading…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            {STATUS_TILES.map(t => (
              <div key={t.key} className="cp-card" style={{ padding: 16, borderLeft: `4px solid ${t.tone}` }}>
                <div style={{ fontSize: 26, fontWeight: 700 }}>{counts[t.key] || 0}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>{t.label}</div>
              </div>
            ))}
            <div className="cp-card" style={{ padding: 16, borderLeft: '4px solid #0f172a' }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{total}</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Total Submissions</div>
            </div>
          </div>

          <div className="cp-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Failed Syncs {failures.length > 0 ? `(${failures.length})` : ''}</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={load}>↻ Refresh</button>
          </div>

          {failures.length === 0 ? (
            <div className="cp-empty"><div style={{ fontSize: 40 }}>✅</div><p>No failed syncs. Integration is healthy.</p></div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr><th>Reference</th><th>Type</th><th>Attempts</th><th>Last Error</th><th>Last Attempt</th><th /></tr>
              </thead>
              <tbody>
                {failures.map(f => (
                  <tr key={f.id}>
                    <td><Link to={`/admin/clients/${clientId}/submissions`}>{f.reference}</Link></td>
                    <td>{f.submission_type}</td>
                    <td>{f.sync_attempts}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.sync_error || '—'}</td>
                    <td>{f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => alert(`Sync Error Payload Details:\n\nReference: ${f.reference}\nType: ${f.submission_type}\nAttempts: ${f.sync_attempts}\nError: ${f.sync_error || 'None'}`)}>
                          🔍 Inspect
                        </button>
                        <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={() => retry(f.id)} disabled={retrying === f.id}>
                          {retrying === f.id ? 'Retrying…' : '↻ Retry'}
                        </button>
                      </div>
                      {retryResult[f.id] && (
                        <div style={{ fontSize: 12, marginTop: 4, color: retryResult[f.id].status === 'synced' ? '#16a34a' : '#dc2626' }}>
                          {retryResult[f.id].status === 'synced' ? `✓ Synced → case ${retryResult[f.id].external_ref}` : `✗ ${retryResult[f.id].error || retryResult[f.id].status || 'failed'}`}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="cp-section-header" style={{ marginTop: 24 }}>
            <h2>Files not delivered {files.length > 0 ? `(${files.length})` : ''}</h2>
          </div>
          {files.length === 0 ? (
            <div className="cp-empty"><p>Every file sent with a report has reached its MIMS case.</p></div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr><th>Reference</th><th>File</th><th>MIMS case</th><th>Attempts</th><th>Last Error</th><th>Last Attempt</th><th /></tr>
              </thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.id}>
                    <td><Link to={`/admin/clients/${clientId}/submissions`}>{f.reference}</Link></td>
                    <td>{f.file_name}</td>
                    <td>{f.external_ref || '—'}</td>
                    <td>{f.forward_attempts}</td>
                    <td style={{ maxWidth: 260 }}>{f.forward_error || '—'}</td>
                    <td>{f.last_forward_at ? new Date(f.last_forward_at).toLocaleString() : '—'}</td>
                    <td>
                      {admin?.role !== 'viewer' && (
                        <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={() => retryFile(f.id)} disabled={retrying === `file-${f.id}`}>
                          {retrying === `file-${f.id}` ? 'Sending…' : '↻ Send again'}
                        </button>
                      )}
                      {fileResult[f.id] && (
                        <div style={{ fontSize: 12, marginTop: 4, color: fileResult[f.id].status === 'forwarded' ? '#16a34a' : '#dc2626' }}>
                          {fileResult[f.id].status === 'forwarded' ? '✓ On the MIMS case' : `✗ ${fileResult[f.id].error || 'failed'}`}
                        </div>
                      )}
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
