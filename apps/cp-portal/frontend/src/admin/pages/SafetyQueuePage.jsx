import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// PD-2 — safety review queue. Every task here is a portal submission where the
// submitter said someone became unwell.
//
// The control is that a task cannot be closed without an outcome, and that the
// two outcomes stay distinct: a clinical judgement made by a safety reviewer, and
// an administrative clear that has to say why. Same button for both and within a
// year everything closes as "reviewed" and the number means nothing.
export default function SafetyQueuePage() {
  const { clientId } = useParams()
  const { hasRole }  = useAdminAuth()
  const canJudge     = hasRole('safety_reviewer', 'superadmin')

  const [tab, setTab]         = useState('open')
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)   // task being closed
  const [outcome, setOutcome] = useState('')
  const [reason, setReason]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { load() }, [clientId, tab])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/ae-review/${clientId}?status=${tab}`, { headers: adminHeaders() })
      if (!res.ok) { setError(`Could not load the safety queue (error ${res.status}).`); return }
      const d = await res.json()
      setTasks(d.items || [])
    } catch { setError('Network error — please try again.') } finally { setLoading(false) }
  }

  function startClose(task) {
    setOpen(task); setOutcome(''); setReason(''); setFormError('')
  }

  async function submitClose() {
    setFormError('')
    if (!outcome) { setFormError('Choose an outcome before closing this task.'); return }
    if (outcome === 'cleared_administrative' && reason.trim().length < 10) {
      setFormError('A reason of at least 10 characters is required to clear this task.'); return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/ae-review/${clientId}/${open.id}/close`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ outcome, reason }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(d.error || 'Could not close this task.'); return }
      setOpen(null); load()
    } catch { setFormError('Network error — please try again.') } finally { setBusy(false) }
  }

  // What the submitter typed, if anything. A "Yes" with no detail is still a
  // valid flag — the detail box is deliberately optional.
  function detailOf(t) {
    if (t.reported_detail) return t.reported_detail
    return null
  }

  return (
    <AdminLayout title="Safety Queue">
      <p className="cp-page-desc">
        Portal submissions where the submitter reported that someone became unwell. Each one needs a
        human decision — a task cannot be closed without recording an outcome.
      </p>

      {!canJudge && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', fontSize: 13 }}>
          You can clear tasks administratively with a reason. Recording a clinical outcome
          (“reviewed — not an adverse event”) requires the safety reviewer role.
        </div>
      )}

      <div className="cp-tabs" style={{ marginBottom: 12 }}>
        <button className={`cp-tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>Open</button>
        <button className={`cp-tab${tab === 'closed' ? ' active' : ''}`} onClick={() => setTab('closed')}>Closed</button>
      </div>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <div className="cp-loading">Loading…</div> : (
        <>
          <div className="cp-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{tab === 'open' ? `Awaiting review${tasks.length ? ` · ${tasks.length}` : ''}` : 'Closed'}</h2>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={load}>↻ Refresh</button>
          </div>

          {tasks.length === 0 ? (
            <div className="cp-empty">
              <div style={{ fontSize: 40 }}>🩺</div>
              <p>{tab === 'open' ? 'No submissions are awaiting safety review.' : 'Nothing closed yet.'}</p>
            </div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Submission</th><th>Type</th><th>From</th><th>Reported</th>
                  <th>What they told us</th>
                  {tab === 'closed' ? <th>Outcome</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td>#{t.submission_id}</td>
                    <td>{String(t.submission_type || '').replace(/_/g, ' ')}</td>
                    <td>{t.submitter_name || t.submitter_email || '—'}</td>
                    <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                    <td style={{ maxWidth: 380, whiteSpace: 'pre-wrap' }}>
                      {detailOf(t) || <em style={{ color: '#6B7280' }}>No detail given — flag still stands</em>}
                    </td>
                    {tab === 'closed' ? (
                      <td>
                        {t.outcome === 'reviewed_not_ae'
                          ? <span title="Clinical judgement">Reviewed — not an AE</span>
                          : <span title={t.outcome_reason || ''}>Cleared administratively</span>}
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                          {t.closed_by_name || 'unknown'}{t.closed_at ? ` · ${new Date(t.closed_at).toLocaleDateString()}` : ''}
                        </div>
                      </td>
                    ) : null}
                    <td>
                      {tab === 'open'
                        ? <button className="cp-btn cp-btn-sm" onClick={() => startClose(t)}>Review</button>
                        : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {open && (
        <div className="cp-modal-overlay" onClick={() => !busy && setOpen(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Close review · submission #{open.submission_id}</span>
              <button className="cp-modal-close" disabled={busy} onClick={() => setOpen(null)}>×</button>
            </div>
            <div className="cp-modal-body">

            <div style={{ padding: 12, background: '#F9FAFB', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              {detailOf(open) || <em style={{ color: '#6B7280' }}>The submitter answered “Yes” but gave no detail.</em>}
            </div>

            <label style={{ display: 'block', opacity: canJudge ? 1 : 0.5 }}>
              <input type="radio" name="outcome" value="reviewed_not_ae" disabled={!canJudge}
                     checked={outcome === 'reviewed_not_ae'}
                     onChange={e => setOutcome(e.target.value)} />
              {' '}Reviewed — not an adverse event
              <div style={{ fontSize: 12, color: '#6B7280', marginLeft: 24 }}>
                A clinical judgement. Safety reviewer role only.
              </div>
            </label>

            <label style={{ display: 'block' }}>
              <input type="radio" name="outcome" value="cleared_administrative"
                     checked={outcome === 'cleared_administrative'}
                     onChange={e => setOutcome(e.target.value)} />
              {' '}Clear administratively
              <div style={{ fontSize: 12, color: '#6B7280', marginLeft: 24 }}>
                Not a clinical decision — duplicate, test submission, or no longer required. A reason is required.
              </div>
            </label>

            {outcome === 'cleared_administrative' && (
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
                        placeholder="Why is this being cleared without a clinical review?"
                        style={{ width: '100%' }} />
            )}

            {formError && <div className="cp-error">{formError}</div>}
            </div>

            <div className="cp-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="cp-btn cp-btn-outline" disabled={busy} onClick={() => setOpen(null)}>Cancel</button>
              <button className="cp-btn" disabled={busy} onClick={submitClose}>
                {busy ? 'Closing…' : 'Close task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
