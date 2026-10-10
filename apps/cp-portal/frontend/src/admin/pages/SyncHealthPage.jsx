import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
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
  const { canChange } = useAdminAuth()
  const [counts, setCounts]     = useState({})
  const [failures, setFailures] = useState([])
  const [files, setFiles]       = useState([])
  const [followups, setFollowups] = useState([])
  const [reconciliation, setReconciliation] = useState({})
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
      setFollowups(d.followups || [])
      setReconciliation(d.reconciliation || {})
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Bridge plan P6: every comparison with MIMS this month and what it found.
  async function downloadReconciliation() {
    const month = new Date().toISOString().slice(0, 7)
    const res = await fetch(`/api/admin/submissions/${clientId}/reconciliation.csv?month=${month}`, { headers: adminHeaders() })
    if (!res.ok) { setError(`Could not download the comparison report (error ${res.status}).`); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = `mims-reconciliation-${clientId}-${month}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  function describeRun(run) {
    if (!run) return 'Not run yet.'
    const when = new Date(run.started_at).toLocaleString()
    if (run.error) return `${when}: could not finish. ${run.error}`
    if (!run.finished_at) return `${when}: running.`
    const found = Number(run.missing) + Number(run.different)
    return found === 0
      ? `${when}: ${run.checked} checked, 0 differences.`
      : `${when}: ${run.checked} checked; ${run.missing} missing in MIMS (${run.resent} sent again), ${run.different} different.`
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

  // Bridge row 9: send information a person added to its MIMS case again.
  async function retryFollowUp(followupId) {
    setRetrying(`fu-${followupId}`)
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/followups/${followupId}/retry`, { method: 'POST', headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      setFileResult(r => ({ ...r, [`fu-${followupId}`]: res.ok ? d : { error: d.error || `Error ${res.status}` } }))
      load()
    } catch {
      setFileResult(r => ({ ...r, [`fu-${followupId}`]: { error: 'Network error' } }))
    } finally {
      setRetrying(null)
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0)

  return (
    <AdminLayout title="Sync Health">
      <p className="cp-page-desc">Portal submissions sent to MIMS. Failed ones can be retried from here.</p>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading ? <div className="cp-loading">Loading…</div> : (
        <>
          <div className="summary-line" style={{ marginBottom: 16 }}>
            {STATUS_TILES.map(t => (
              <span key={t.key}>{t.label}: <b>{counts[t.key] || 0}</b></span>
            ))}
            <span>Total submissions: <b>{total}</b></span>
          </div>

          <div className="cp-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Comparison with MIMS</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={downloadReconciliation}>Download this month (CSV)</button>
          </div>
          <div className="cp-card" style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.7 }}>
            <div>Side-effect reports, every hour: {describeRun(reconciliation.ae)}</div>
            <div>All reports, every night: {describeRun(reconciliation.all)}</div>
          </div>

          <div className="cp-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* The list holds the newest 100; say so when there are more. */}
            <h2>Failed Syncs {failures.length > 0 ? (Number(counts.failed_sync) > failures.length ? `(newest ${failures.length} of ${counts.failed_sync})` : `(${failures.length})`) : ''}</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={load}>Refresh</button>
          </div>

          {failures.length === 0 ? (
            <div className="cp-empty"><p>No failed syncs. Integration is healthy.</p></div>
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
                          Inspect
                        </button>
                        <CanChange area="submissions">
                        <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={() => retry(f.id)} disabled={retrying === f.id}>
                          {retrying === f.id ? 'Retrying…' : 'Retry'}
                        </button>
                        </CanChange>
                      </div>
                      {retryResult[f.id] && (
                        <div style={{ fontSize: 12, marginTop: 4, color: retryResult[f.id].status === 'synced' ? '#166534' : '#b91c1c' }}>
                          {retryResult[f.id].status === 'synced' ? `Synced to case ${retryResult[f.id].external_ref}` : `Failed: ${retryResult[f.id].error || retryResult[f.id].status || 'failed'}`}
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
                      {canChange('submissions') && (
                        <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={() => retryFile(f.id)} disabled={retrying === `file-${f.id}`}>
                          {retrying === `file-${f.id}` ? 'Sending…' : 'Send again'}
                        </button>
                      )}
                      {fileResult[f.id] && (
                        <div style={{ fontSize: 12, marginTop: 4, color: fileResult[f.id].status === 'forwarded' ? '#166534' : '#b91c1c' }}>
                          {fileResult[f.id].status === 'forwarded' ? 'On the MIMS case' : `Failed: ${fileResult[f.id].error || 'not sent'}`}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="cp-section-header" style={{ marginTop: 24 }}>
            <h2>Added information not delivered {followups.length > 0 ? `(${followups.length})` : ''}</h2>
          </div>
          {followups.length === 0 ? (
            <div className="cp-empty"><p>Everything people added to their requests has reached MIMS.</p></div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr><th>Reference</th><th>MIMS case</th><th>Attempts</th><th>Last Error</th><th>Last Attempt</th><th /></tr>
              </thead>
              <tbody>
                {followups.map(f => {
                  const result = fileResult[`fu-${f.id}`]
                  return (
                    <tr key={f.id}>
                      <td><Link to={`/admin/clients/${clientId}/submissions`}>{f.reference}</Link></td>
                      <td>{f.external_ref || '—'}</td>
                      <td>{f.forward_attempts}</td>
                      <td style={{ maxWidth: 260 }}>{f.forward_error || '—'}</td>
                      <td>{f.last_forward_at ? new Date(f.last_forward_at).toLocaleString() : '—'}</td>
                      <td>
                        {canChange('submissions') && (
                          <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={() => retryFollowUp(f.id)} disabled={retrying === `fu-${f.id}`}>
                            {retrying === `fu-${f.id}` ? 'Sending…' : 'Send again'}
                          </button>
                        )}
                        {result && (
                          <div style={{ fontSize: 12, marginTop: 4, color: result.status === 'forwarded' ? '#166534' : '#b91c1c' }}>
                            {result.status === 'forwarded' ? 'On the MIMS case' : `Failed: ${result.error || 'not sent'}`}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </AdminLayout>
  )
}
