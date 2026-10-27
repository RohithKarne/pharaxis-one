import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'
import { label } from '../../shared/utils/labels'

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
  const [heartbeat, setHeartbeat] = useState({ jobs: [], connections: [] })
  const [delivery, setDelivery] = useState(null)
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
      setHeartbeat(d.heartbeat || { jobs: [], connections: [] })
      setDelivery(d.delivery || null)
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

          {/* CPPM-157: each background job of the bridge, and when it last ran. */}
          <div className="cp-section-header"><h2>Bridge heartbeat</h2></div>
          <div className="cp-card" style={{ marginBottom: 20, fontSize: 14 }}>
            <table className="cp-table" style={{ margin: 0 }}>
              <thead><tr><th>Job</th><th>Runs every</th><th>Last finished</th><th>Status</th></tr></thead>
              <tbody>
                {heartbeat.jobs.map(j => (
                  <tr key={j.key}>
                    <td>{j.label}</td>
                    <td>{since(j.every_seconds)}</td>
                    <td>{j.finished_seconds_ago == null ? 'Not since this server started' : `${since(j.finished_seconds_ago)} ago`}</td>
                    <td><BeatChip status={j.status} title={j.last_error || ''} /></td>
                  </tr>
                ))}
                {heartbeat.connections.map(c => (
                  <tr key={`c-${c.integration_id}`}>
                    <td>Updates from MIMS for this portal</td>
                    <td>{since(heartbeat.jobs.find(j => j.key === 'cp-portal-mims-close-sync')?.every_seconds || 300)}</td>
                    <td>{c.read_seconds_ago == null ? 'Never read yet' : `${since(c.read_seconds_ago)} ago`}</td>
                    <td><BeatChip status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
              A job is late once three of its runs are missed. A late job raises an alert, which closes itself when the job runs again.
            </div>
          </div>

          {/* CPPM-158: how long reports took to reach MIMS this month, against the target. */}
          {delivery && (
            <>
              <div className="cp-section-header"><h2>Delivery time this month</h2></div>
              <div className="cp-card" style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.7 }}>
                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>
                  Target: in MIMS within {delivery.target_minutes} minutes, or {delivery.serious_target_minutes} for a side effect reported as serious. A report not in MIMS at twice its target raises an alert.
                </div>
                <DeliveryLine label="All reports" f={delivery.all} />
                <DeliveryLine label="Serious side effects" f={delivery.serious} />
                {delivery.missed.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    Missed the target: {delivery.missed.map(m => `${m.reference} (${m.delivery_seconds == null ? 'not in MIMS yet' : since(m.delivery_seconds)})`).join(', ')}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="cp-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Comparison with MIMS</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={downloadReconciliation}>Download this month (CSV)</button>
          </div>
          <div className="cp-card" style={{ marginBottom: 20, fontSize: 14, lineHeight: 1.7 }}>
            <div>Side-effect reports, every hour: {describeRun(reconciliation.ae)}</div>
            <div>All reports, every night: {describeRun(reconciliation.all)}</div>
            {/* CPPM-162: never let "0 differences" stand for reports nobody compared. */}
            {reconciliation.not_covered > 0 && (
              <div style={{ color: '#b45309' }}>
                {reconciliation.not_covered} report{reconciliation.not_covered === 1 ? ' is' : 's are'} in MIMS but not covered by the comparison: sent before reports carried a key, and MIMS has not taken one yet. The next comparison tries again.
              </div>
            )}
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
                    <td>{label('submissionType', f.submission_type)}</td>
                    <td>{f.sync_attempts}</td>
                    <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.sync_error || '—'}</td>
                    <td>{f.updated_at ? new Date(f.updated_at).toLocaleString() : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => alert(`Sync Error Payload Details:\n\nReference: ${f.reference}\nType: ${label('submissionType', f.submission_type)}\nAttempts: ${f.sync_attempts}\nError: ${f.sync_error || 'None'}`)}>
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

function DeliveryLine({ label, f }) {
  if (!f.received) return <div>{label}: none received this month.</div>
  return (
    <div>
      {label}: {f.received} received, {f.delivered} in MIMS, <b>{f.within_target} within target</b>
      {f.delivered ? ` · median ${since(f.median_seconds)} · slowest ${since(f.slowest_seconds)}` : ''}
    </div>
  )
}

const BEAT = {
  on_time: { text: 'On time', bg: '#dcfce7', fg: '#166534' },
  error:   { text: 'Ran, with an error', bg: '#fef9c3', fg: '#854d0e' },
  not_yet: { text: 'Not run yet', bg: '#f1f5f9', fg: '#475569' },
  late:    { text: 'Late', bg: '#fee2e2', fg: '#991b1b' },
}

function BeatChip({ status, title }) {
  const b = BEAT[status] || BEAT.not_yet
  return <span title={title} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: b.bg, color: b.fg }}>{b.text}</span>
}

// "45 seconds", "5 minutes", "3 hours", "2 days"
function since(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'}`
  const h = Math.round(s / 3600)
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`
  const d = Math.round(s / 86400)
  return `${d} day${d === 1 ? '' : 's'}`
}
