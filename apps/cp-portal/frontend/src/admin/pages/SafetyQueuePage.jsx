import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// PD-2 — safety review queue. Every task here is a portal submission where the
// submitter said someone became unwell.
//
// The control is that a task cannot be closed without an outcome, and that the
// two outcomes stay distinct: a clinical judgement made by a safety reviewer, and
// an administrative clear that has to say why. Same button for both and within a
// year everything closes as "reviewed" and the number means nothing.
//
// CPPM-18: tasks also come from the chat assistant, and a safety reviewer can
// confirm a real side effect, which creates an AE case and sends it to MIMS.
//
// CPPM-6: an open task shows who holds it. Anyone but a viewer can take a free
// task; the holder (or an admin, covering for someone away) can release it or hand
// it to a colleague. Holding a task is never needed to close it.
export default function SafetyQueuePage() {
  const { clientId } = useParams()
  const { hasRole }  = useAdminAuth()
  const canJudge     = hasRole('safety_reviewer', 'superadmin')
  const canHold      = !hasRole('viewer')
  const isLead       = hasRole('admin', 'superadmin')

  const [tab, setTab]         = useState('open')
  const [tasks, setTasks]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)   // task being closed
  const [outcome, setOutcome] = useState('')
  const [reason, setReason]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [formError, setFormError] = useState('')
  const [productName, setProductName] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [notice, setNotice] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [hand, setHand]         = useState(null)   // task being handed over
  const [staff, setStaff]       = useState([])
  const [handTo, setHandTo]     = useState('')
  const [handError, setHandError] = useState('')

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

  // CPPM-6: take, release or hand over a task. The sidebar count is told to
  // refresh, since "yours" has just changed.
  async function act(task, action, body) {
    setError(''); setNotice('')
    try {
      const res = await fetch(`/api/admin/ae-review/${clientId}/${task.id}/${action}`, {
        method: 'POST', headers: adminHeaders(), body: JSON.stringify(body || {}),
      })
      const d = await res.json().catch(() => ({}))
      // Reload either way: a refusal usually means someone else got there first,
      // and the list should show who.
      load()
      if (!res.ok) return d.error || 'That did not work. Refresh and try again.'
      setNotice(d.message || 'Done.')
      window.dispatchEvent(new Event('cp:badges-changed'))
      return null
    } catch { return 'Network error — please try again.' }
  }

  async function rowAction(task, action) {
    const problem = await act(task, action)
    if (problem) setError(problem)
  }

  async function startHand(task) {
    setHand(task); setHandTo(''); setHandError(''); setStaff([])
    try {
      const res = await fetch(`/api/admin/ae-review/${clientId}/staff`, { headers: adminHeaders() })
      if (!res.ok) { setHandError(`Could not load the list of people (error ${res.status}).`); return }
      const d = await res.json()
      setStaff(d.staff || [])
    } catch { setHandError('Network error — please try again.') }
  }

  async function submitHand() {
    setHandError('')
    if (!handTo) { setHandError('Choose who to hand this task to.'); return }
    setBusy(true)
    const problem = await act(hand, 'hand', { to_admin_id: Number(handTo) })
    setBusy(false)
    if (problem) { setHandError(problem); return }
    setHand(null)
  }

  function startClose(task) {
    setOpen(task); setOutcome(''); setReason(''); setFormError('')
    setProductName(''); setEventDescription(task.reported_detail || ''); setEventDate('')
  }

  async function submitClose() {
    setFormError('')
    if (!outcome) { setFormError('Choose an outcome before closing this task.'); return }
    if (outcome === 'cleared_administrative' && reason.trim().length < 10) {
      setFormError('A reason of at least 10 characters is required to clear this task.'); return
    }
    if (outcome === 'confirmed_ae' && (!productName.trim() || eventDescription.trim().length < 10)) {
      setFormError('Name the product and describe what happened (at least 10 characters).'); return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/ae-review/${clientId}/${open.id}/close`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({
          outcome, reason,
          ...(outcome === 'confirmed_ae' ? { product_name: productName, event_description: eventDescription, event_date: eventDate || null } : {}),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(d.error || 'Could not close this task.'); return }
      setNotice(d.message || 'Task closed.')
      window.dispatchEvent(new Event('cp:badges-changed'))
      setOpen(null); load()
    } catch { setFormError('Network error — please try again.') } finally { setBusy(false) }
  }

  // What the submitter typed, if anything. A "Yes" with no detail is still a
  // valid flag — the detail box is deliberately optional.
  function detailOf(t) {
    if (t.reported_detail) return t.reported_detail
    return null
  }

  const mineCount = tasks.filter(t => t.owned_by_me).length
  const shown = tab === 'open' && mineOnly ? tasks.filter(t => t.owned_by_me) : tasks

  return (
    <AdminLayout title="Safety Queue">
      <p className="cp-page-desc">
        Portal submissions and chat conversations where someone reported that a person became unwell.
        Each one needs a human decision — a task cannot be closed without recording an outcome.
      </p>

      {canHold && !canJudge && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1', fontSize: 13 }}>
          You can clear tasks administratively with a reason. Recording a clinical outcome
          (“reviewed — not an adverse event” or “confirmed side effect”) requires the safety reviewer role.
        </div>
      )}

      <div className="cp-tabs" style={{ marginBottom: 12 }}>
        <button className={`cp-tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>Open</button>
        <button className={`cp-tab${tab === 'closed' ? ' active' : ''}`} onClick={() => setTab('closed')}>Closed</button>
      </div>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && (
        <div role="status" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', fontSize: 13 }}>
          {notice} <button onClick={() => setNotice('')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#166534' }}>×</button>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : (
        <>
          <div className="cp-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>{tab === 'open' ? `Awaiting review${tasks.length ? ` · ${tasks.length}` : ''}${mineCount ? ` · ${mineCount} yours` : ''}` : 'Closed'}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {tab === 'open' && canHold && (
                <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => setMineOnly(m => !m)}>
                  {mineOnly ? 'Show all' : 'Show mine'}
                </button>
              )}
              <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={load}>↻ Refresh</button>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="cp-empty">
              <div style={{ fontSize: 40 }}>🩺</div>
              <p>{tab !== 'open' ? 'Nothing closed yet.'
                : mineOnly && tasks.length ? 'You are not holding any tasks.'
                : 'No submissions are awaiting safety review.'}</p>
            </div>
          ) : (
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Source</th><th>Type</th><th>From</th><th>Reported</th>
                  <th>What they told us</th>
                  {tab === 'closed' ? <th>Outcome</th> : <th>Held by</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map(t => (
                  <tr key={t.id}>
                    <td>
                      {t.source === 'chat'
                        ? <Link to={`/admin/clients/${clientId}/chat-records?conversation=${t.chat_conversation_id}`}>Chat · view conversation</Link>
                        : `Submission #${t.submission_id}`}
                    </td>
                    <td>{String(t.submission_type || '').replace(/_/g, ' ')}</td>
                    <td>{t.submitter_name || t.submitter_email || '—'}</td>
                    <td>{t.created_at ? new Date(t.created_at).toLocaleString() : '—'}</td>
                    <td style={{ maxWidth: 380, whiteSpace: 'pre-wrap' }}>
                      {detailOf(t) || <em style={{ color: '#6B7280' }}>No detail given — flag still stands</em>}
                    </td>
                    {tab === 'closed' ? (
                      <td>
                        {t.outcome === 'confirmed_ae' ? (
                          <span title="Clinical judgement">
                            <strong>Confirmed side effect</strong>
                            <div style={{ fontSize: 12 }}>
                              {t.ae_sync_status === 'synced' ? `Sent to MIMS · case ${t.ae_mims_case_id}`
                                : t.ae_sync_status === 'failed_sync' ? 'MIMS not reached yet — retrying'
                                : 'Held in portal (no MIMS connection)'}
                            </div>
                          </span>
                        ) : t.outcome === 'reviewed_not_ae'
                          ? <span title="Clinical judgement">Reviewed — not an AE</span>
                          : <span title={t.outcome_reason || ''}>Cleared administratively</span>}
                        <div style={{ fontSize: 12, color: '#6B7280' }}>
                          {t.closed_by_name || 'unknown'}{t.closed_at ? ` · ${new Date(t.closed_at).toLocaleDateString()}` : ''}
                        </div>
                      </td>
                    ) : (
                      <td>
                        {t.owner_id ? (
                          <>
                            {t.owned_by_me ? <strong>You</strong> : (t.owner_name || 'Unknown')}
                            <div style={{ fontSize: 12, color: '#6B7280' }}>
                              since {t.owner_since ? new Date(t.owner_since).toLocaleString() : '—'}
                            </div>
                          </>
                        ) : <span style={{ color: '#6B7280' }}>Nobody yet</span>}
                      </td>
                    )}
                    <td>
                      {tab === 'open' ? (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {canHold && !t.owner_id && (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => rowAction(t, 'take')}>Take</button>
                          )}
                          {canHold && t.owner_id && (t.owned_by_me || isLead) ? (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => rowAction(t, 'release')}>Release</button>
                          ) : null}
                          {canHold && (t.owned_by_me || isLead) && (
                            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => startHand(t)}>Hand to…</button>
                          )}
                          {canHold && <button className="cp-btn cp-btn-sm" onClick={() => startClose(t)}>Review</button>}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {hand && (
        <div className="cp-modal-overlay" onClick={() => !busy && setHand(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Hand over · {hand.source === 'chat' ? 'chat conversation' : `submission #${hand.submission_id}`}</span>
              <button className="cp-modal-close" disabled={busy} onClick={() => setHand(null)}>×</button>
            </div>
            <div className="cp-modal-body">
              <p style={{ marginTop: 0 }}>
                {hand.owner_id
                  ? `${hand.owned_by_me ? 'You hold' : `${hand.owner_name || 'Someone'} holds`} this task now.`
                  : 'Nobody holds this task yet.'}{' '}
                Choose who should work on it. The hand-over is recorded in the audit trail.
              </p>
              <select value={handTo} onChange={e => setHandTo(e.target.value)} style={{ width: '100%' }}>
                <option value="">Choose a person…</option>
                {staff.filter(p => p.id !== hand.owner_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {String(p.role).replace(/_/g, ' ')}</option>
                ))}
              </select>
              {handError && <div className="cp-error" style={{ marginTop: 8 }}>{handError}</div>}
            </div>
            <div className="cp-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="cp-btn cp-btn-outline" disabled={busy} onClick={() => setHand(null)}>Cancel</button>
              <button className="cp-btn" disabled={busy || !handTo} onClick={submitHand}>
                {busy ? 'Handing over…' : 'Hand over'}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="cp-modal-overlay" onClick={() => !busy && setOpen(null)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Close review · {open.source === 'chat' ? 'chat conversation' : `submission #${open.submission_id}`}</span>
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

            <label style={{ display: 'block', opacity: canJudge ? 1 : 0.5 }}>
              <input type="radio" name="outcome" value="confirmed_ae" disabled={!canJudge}
                     checked={outcome === 'confirmed_ae'}
                     onChange={e => setOutcome(e.target.value)} />
              {' '}Confirmed side effect — send to MIMS
              <div style={{ fontSize: 12, color: '#6B7280', marginLeft: 24 }}>
                A clinical judgement. Creates an adverse event case in MIMS. Safety reviewer role only.
              </div>
            </label>

            {outcome === 'confirmed_ae' && (
              <div style={{ display: 'grid', gap: 8, marginLeft: 24 }}>
                <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Product (required)" />
                <textarea rows={3} value={eventDescription} onChange={e => setEventDescription(e.target.value)}
                          placeholder="What happened (required)" style={{ width: '100%' }} />
                <label style={{ fontSize: 12, color: '#6B7280' }}>
                  When it started (if known){' '}
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
                </label>
              </div>
            )}

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
