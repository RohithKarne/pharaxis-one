import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import toast from '../../../shared/utils/toast'
import '../cases.css'

// AE/PC handoff to the external safety or quality system. This is deliberately
// its own screen, reached after the case is saved — the wizard captures, this
// screen acts (locked with Rohith 2026-07-28).

const ELEMENT_LABEL = {
  reporter: 'Identifiable reporter',
  patient: 'Identifiable patient',
  product: 'Suspect product',
  event: 'Adverse event',
  complaint: 'Complaint description',
}

const STATUS_TONE = {
  SENT: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534' },
  FAILED: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
  NO_TARGET: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
}

function formatWhen(value) {
  if (!value) return '—'
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? String(value) : dt.toLocaleString()
}

export default function CaseTransmissionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasCapability } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [target, setTarget] = useState('')
  const [sending, setSending] = useState(false)
  const [showPayload, setShowPayload] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await httpFetch(`/api/cases/${id}/handoff`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load the handoff view.')
      setData(json)
      setTarget(prev => prev || json.targets?.[0]?.type || '')
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function transmit() {
    if (sending) return
    setSending(true)
    try {
      const res = await httpFetch(`/api/cases/${id}/handoff/transmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_system: target }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Handoff failed.')
      toast.success(`Case handed off to ${json.target_system}.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
      load()   // the attempt is recorded either way — reload so history reflects it
    }
  }

  if (loading) return <div className="cf-form-loading">Loading transmission…</div>

  if (error) {
    return (
      <MIMSLayout showStatStrip={false} surfaceVariant="workspace" compact>
        <div className="cf-form-error">
          {error} <button onClick={() => navigate(`/cases/${id}`)}>Back to case</button>
        </div>
      </MIMSLayout>
    )
  }

  const readiness = data.readiness || { score: 0, required: 4, elements: [] }
  const blocked = !data.eligible || readiness.blocking_for_submission
  const noTargets = !data.targets?.length

  return (
    <MIMSLayout showStatStrip={false} surfaceVariant="workspace" compact>
      <div className="cf-form-page">
        <div className="cf-form-header">
          <button className="cf-back-btn" onClick={() => navigate(`/cases/${id}`)}>Back to case</button>
          <div className="cf-form-header-info">
            <span className="cf-form-case-num">{data.payload?.source?.case_number || `Case ${id}`}</span>
            <span className="cf-form-type-badge" style={{ background: data.case_type === 'AE' ? '#dc2626' : '#d97706' }}>
              {data.case_type}
            </span>
            <span className="cf-form-org">Transmission</span>
          </div>
        </div>

        <div className="cf-handoff-body">
          {!data.eligible && (
            <div className="cf-handoff-note cf-handoff-note--warn">
              Only AE and PC cases are handed off to an external system. This case is {data.case_type}.
            </div>
          )}

          {/* Validity gate. A safety system that ACCEPTS a malformed case is
              worse than one that rejects it — the bad record becomes the system
              of record. */}
          <section className="cf-handoff-card">
            <div className="cf-handoff-card-head">
              <h3>Case validity</h3>
              <span className={`cf-handoff-score ${readiness.blocking_for_submission ? 'is-blocked' : 'is-ok'}`}>
                {readiness.score}/{readiness.required}
              </span>
            </div>
            <ul className="cf-handoff-checks">
              {(readiness.elements || []).map(el => (
                <li key={el.key} className={el.satisfied ? 'is-ok' : 'is-missing'}>
                  <span className="cf-handoff-check-icon">{el.satisfied ? '✓' : '✕'}</span>
                  <span className="cf-handoff-check-label">{(data.case_type === 'PC' && el.label) || ELEMENT_LABEL[el.key] || el.label || el.key}</span>
                  <span className="cf-handoff-check-reason">{el.reason}</span>
                </li>
              ))}
            </ul>
            {/* PC notes: the lot (a warning), a suspected counterfeit and the Field
                Alert Report date — the same lines as Route to Quality's card. */}
            {(readiness.notes || []).length > 0 && (
              <ul className="cf-handoff-checks" style={{ marginTop: 8 }}>
                {readiness.notes.map(n => (
                  <li key={n.key} className={n.ok ? 'is-ok' : 'is-warn'}>
                    <span className="cf-handoff-check-icon">{n.ok ? '✓' : '!'}</span>
                    <span className="cf-handoff-check-label">{n.label}</span>
                    <span className="cf-handoff-check-reason">{n.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {readiness.blocking_for_submission && (
              <div className="cf-handoff-note cf-handoff-note--warn">
                Transmission is blocked until every element above is satisfied. Complete them on the case, then return here.
              </div>
            )}
          </section>

          {/* When the case is due at its target (Transmission Setup, 14 Oct 2026). */}
          {data.deadline && (
            <section className="cf-handoff-card" data-testid="handoff-deadline">
              <div className="cf-handoff-card-head">
                <h3>Hand-off due</h3>
                <span className={`cf-handoff-score ${data.deadline.late ? 'is-blocked' : 'is-ok'}`}>
                  {data.deadline.sent_on ? (data.deadline.late ? 'Sent late' : 'Sent on time') : (data.deadline.late ? 'Overdue' : 'On time')}
                </span>
              </div>
              <div className="cf-handoff-summary">
                <span><strong>{data.case_type === 'AE' ? 'Aware' : 'Received'}</strong> {data.deadline.from}</span>
                <span><strong>Due</strong> {data.deadline.due} ({data.deadline.days} working day{data.deadline.days === 1 ? '' : 's'})</span>
                <span><strong>Sent</strong> {data.deadline.sent_on || '—'}</span>
              </div>
            </section>
          )}

          <section className="cf-handoff-card">
            <div className="cf-handoff-card-head">
              <h3>Destination</h3>
              <span className="cf-handoff-muted">{data.payload_version}</span>
            </div>
            {noTargets ? (
              <div className="cf-handoff-note cf-handoff-note--warn">
                No {data.case_type === 'PC' ? 'quality' : 'safety'} system is set up for this organisation. An admin sets it on
                MIMS Admin › System › Setup › Medical Information › Transmission Setup.
              </div>
            ) : (
              <div className="cf-handoff-target-row">
                <label htmlFor="handoff-target">Target system</label>
                <select id="handoff-target" value={target} onChange={e => setTarget(e.target.value)}>
                  {data.targets.map(t => (
                    <option key={t.id} value={t.type}>{({ safety_system: 'Safety system', quality_system: 'Quality system' })[t.type] || t.type} — {t.endpoint || 'no address'}</option>
                  ))}
                </select>
              </div>
            )}
            {/* Stated on screen so nobody in a demo assumes MIMS submits to a
                regulator. It does not — no MedDRA licence, no E2B, by design. */}
            <div className="cf-handoff-note">
              MIMS sends a canonical intake payload with the text as recorded, not coded. Coding, causality assessment and
              regulatory submission are performed by the receiving system.
            </div>
          </section>

          <section className="cf-handoff-card">
            <div className="cf-handoff-card-head">
              <h3>Payload</h3>
              <button type="button" className="cf-handoff-link" onClick={() => setShowPayload(v => !v)}>
                {showPayload ? 'Hide' : 'Show'} payload
              </button>
            </div>
            <div className="cf-handoff-summary">
              <span><strong>Awareness date</strong> {data.payload?.case?.awareness_date ? String(data.payload.case.awareness_date).slice(0, 10) : '—'}</span>
              <span><strong>Drugs</strong> {data.payload?.drugs?.length ?? 0}</span>
              <span><strong>Events</strong> {data.payload?.events?.length ?? 0}</span>
              <span><strong>Reporter</strong> {data.payload?.reporter?.name || '—'}</span>
            </div>
            {showPayload && (
              <pre className="cf-handoff-payload">{JSON.stringify(data.payload, null, 2)}</pre>
            )}
          </section>

          {hasCapability('transmission.create') && <div className="cf-handoff-actions">
            <button
              type="button"
              className="cf-save-btn"
              onClick={transmit}
              disabled={blocked || noTargets || sending}
              title={blocked ? 'Case is not valid for handoff' : noTargets ? 'No integration configured' : ''}
            >
              {sending ? 'Transmitting…' : 'Transmit to safety system'}
            </button>
          </div>}

          <section className="cf-handoff-card">
            <div className="cf-handoff-card-head"><h3>Transmission history</h3></div>
            {!data.history?.length ? (
              <div className="cf-empty-msg">No transmissions recorded for this case.</div>
            ) : (
              <table className="cf-handoff-table">
                <thead>
                  <tr><th>When</th><th>Target</th><th>Status</th><th>Code</th><th>By</th></tr>
                </thead>
                <tbody>
                  {data.history.map(h => {
                    const tone = STATUS_TONE[h.status] || {}
                    return (
                      <tr key={h.id}>
                        <td>{formatWhen(h.timestamp)}</td>
                        <td>{({ safety_system: 'Safety system', quality_system: 'Quality system' })[h.target_system] || h.target_system}</td>
                        <td>
                          <span
                            className="cf-handoff-status"
                            style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td>{h.response_code}</td>
                        <td>{h.user_name || 'System'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </MIMSLayout>
  )
}
