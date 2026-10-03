import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
import Icon from '../../shared/components/Icon'
import { formatDate as formatDayOnly, formatDateTime } from '../../shared/utils/datetime'

// What the person is told. The internal sync states (submitted / pending_sync /
// synced / failed_sync) describe our copy of the request, not the request, so they
// all read as "In progress" — a visitor can do nothing with "failed_sync", and
// showing it invites a support call about our plumbing.
const STATUS_LABELS = {
  submitted:    { label: 'In progress', cls: 'pp-status-pending'    },
  pending_sync: { label: 'In progress', cls: 'pp-status-pending'    },
  synced:       { label: 'In progress', cls: 'pp-status-pending'    },
  failed_sync:  { label: 'In progress', cls: 'pp-status-pending'    },
  pending:      { label: 'Pending',     cls: 'pp-status-pending'    },
  in_review:    { label: 'In Review',   cls: 'pp-status-in-review'  },
  completed:    { label: 'Completed',   cls: 'pp-status-completed'  },
  closed:       { label: 'Closed',      cls: 'pp-status-closed'     },
}

const TYPE_LABELS = {
  medical_inquiry:   'Medical Inquiry',
  adverse_event:     'Adverse Event',
  product_complaint: 'Product Complaint',
  other_inquiry:     'Other',
}

export default function MySubmissionsPage() {
  const { clientCode, user, portalHeaders } = usePortal()
  const navigate     = useNavigate()
  const [subs, setSubs]   = useState([])
  const [screening, setScreening] = useState([])
  const [loading, setLoading] = useState(true)

  // CPPM-4: this endpoint returns the same list plus each request's history.
  // CPPM-63: and the conversation after the answer, and the screening question for a reply.
  function load() {
    return fetch(`/api/portal/submit/${clientCode}/submissions`, { headers: portalHeaders() })
      .then(r => r.json()).then(d => { setSubs(d.submissions || []); setScreening(d.reply_screening || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => {
    if (!user) { navigate(`/portal/${clientCode}/login`); return }
    load()
  }, [user, clientCode])

  // Submitted timestamps are shown with date + time in the viewer's local zone.
  const formatDate = (str) => formatDateTime(str)

  function exportSummary() {
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const header = ['Reference', 'Type', 'Status', 'Submitted', 'External Ref']
    const rows = subs.map(s => [
      `CP-${String(s.id).padStart(6, '0')}`,
      TYPE_LABELS[s.submission_type] || s.submission_type,
      STATUS_LABELS[s.status]?.label || s.status,
      formatDate(s.submitted_at),
      s.external_ref || '',
    ].map(esc).join(','))
    const csv = [header.map(esc).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `my-submissions-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>My Submissions</h1>
          <p>Track the status of your submitted requests.</p>
        </div>
        {subs.length > 0 && (
          <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={exportSummary} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="file" size={15} /> Download summary
          </button>
        )}
      </div>

      {loading ? <SkeletonCards count={4} /> : subs.length === 0 ? (
        <div className="pp-empty-state">
          <span><Icon name="inbox" size={40} /></span>
          <p>You haven't submitted any requests yet.</p>
          <Link to={`/portal/${clientCode}/submit`} className="pp-btn pp-btn-primary">Submit a Request</Link>
        </div>
      ) : (
        <div className="pp-submissions-list">
          {subs.map(s => {
            const status = STATUS_LABELS[s.status] || { label: 'In progress', cls: 'pp-status-pending' }

            return (
              <div key={s.id} className="pp-submission-card" style={{ padding: '20px', borderRadius: '10px', background: 'var(--pp-card-bg, #ffffff)', border: '1px solid var(--pp-border-color, #e2e8f0)', marginBottom: '16px' }}>
                <div className="pp-submission-header">
                  <div>
                    <div className="pp-submission-ref" style={{ fontWeight: 700, fontSize: '1.1rem' }}>CP-{String(s.id).padStart(6, '0')}</div>
                    <div className="pp-submission-type" style={{ color: '#64748b' }}>{TYPE_LABELS[s.submission_type] || s.submission_type}</div>
                  </div>
                  <span className={`pp-status-badge ${status.cls}`}>{status.label}</span>
                </div>
                <div className="pp-submission-meta" style={{ marginTop: '8px', color: '#64748b', fontSize: '0.85rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Submitted {formatDate(s.submitted_at)}</span>
                  {s.external_ref && <span> · MIMS Ref: {s.external_ref}</span>}
                </div>

                {/* CPPM-4: what has actually happened to this request, and when.
                    Each step is a recorded status change — nothing is inferred. */}
                {s.timeline?.length > 0 && (
                  <ol className="pp-timeline">
                    {s.timeline.map((step, idx) => (
                      <li key={idx} className="pp-timeline-step">
                        <span className="pp-timeline-label">{step.label}</span>
                        <span className="pp-timeline-date">{formatDayOnly(step.at)}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {/* CPPM-14: the approved medical answer, once it has been sent. */}
                {s.answer && (
                  <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#166534', marginBottom: 6 }}>
                      Our answer{s.answered_at ? ` · ${formatDate(s.answered_at)}` : ''}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#14532d', fontSize: '0.9rem', lineHeight: 1.55 }}>{s.answer}</div>
                    <div style={{ fontSize: '0.8rem', color: '#166534', marginTop: 8 }}>
                      A copy was emailed to you. If you need anything further, reply below.
                    </div>
                  </div>
                )}

                {/* Bridge row 9: what the person added after sending, and a way to add more. */}
                {s.followups?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: 6 }}>Information you added</div>
                    {s.followups.map((f, i) => (
                      <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 6 }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>{formatDate(f.at)}</div>
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: '#334155' }}>{f.body}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* One box per request. A request in MIMS is answered there, so what the person
                    adds goes to the MIMS case (bridge row 9). Otherwise, once answered, they reply
                    to the answer (CPPM-63); before that, they add information. */}
                {s.external_ref ? (
                  s.can_follow_up ? <AddInformation submission={s} screening={screening} clientCode={clientCode} onAdded={load} /> : null
                ) : s.answer ? (
                  <Conversation submission={s} screening={screening} clientCode={clientCode} portalHeaders={portalHeaders}
                    formatDate={formatDate} onSent={load} />
                ) : s.can_follow_up ? (
                  <AddInformation submission={s} screening={screening} clientCode={clientCode} onAdded={load} />
                ) : null}

                {/* Expandable Activity Details */}
                <details style={{ marginTop: '12px', fontSize: '0.85rem', color: '#475569' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--pp-primary, #0284c7)' }}>
                    View Request Details & Activity History
                  </summary>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: 4 }}>What you wrote:</div>
                    {/* CPPM-86: the person's own words, from the server. */}
                    <p style={{ margin: 0, fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>
                      {s.request_text || 'No written details were included with this request.'}
                    </p>
                    <div style={{ marginTop: 8, fontSize: '11px', color: '#94a3b8' }}>
                      Last update: {formatDate(s.timeline?.length ? s.timeline[s.timeline.length - 1].at : s.submitted_at)}
                    </div>
                  </div>
                </details>

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Bridge row 9: add something to a request already sent — a new detail, a correction,
// a file — instead of sending a second, unconnected request. Asks the same question as
// the form and a reply (PD-2): did anyone become unwell; a Yes goes to the safety team.
function AddInformation({ submission: s, screening, clientCode, onAdded }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [unwell, setUnwell] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const ask = screening.find(f => f.field_key === 'ae_screen_answer')
  const askMore = screening.find(f => f.field_key === 'ae_screen_detail')
  const needsScreen = s.reply_needs_screening && ask

  async function send(e) {
    e.preventDefault()
    setError(''); setDone('')
    if (needsScreen && !unwell) { setError('Please answer whether anyone became unwell after using the product.'); return }
    setBusy(true)
    const fd = new FormData()
    fd.append('text', text)
    if (needsScreen) { fd.append('ae_screen_answer', unwell); fd.append('ae_screen_detail', unwell === 'Yes' ? detail : '') }
    files.forEach(f => fd.append('attachments', f))
    try {
      const res = await fetch(`/api/portal/submit/${clientCode}/submissions/${s.id}/followups`, {
        method: 'POST', credentials: 'include', body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not add your information. Please try again.'); return }
      const blocked = data.blocked_files?.length ? ` These files were removed because they contained a virus: ${data.blocked_files.join(', ')}.` : ''
      setDone(data.message + blocked)
      setText(''); setFiles([]); setUnwell(''); setDetail(''); setOpen(false)
      onAdded()
    } catch {
      setError('Could not add your information. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div style={{ marginTop: 12 }}>
        {done && <div role="status" style={{ fontSize: '0.85rem', color: '#166534', marginBottom: 8 }}>{done}</div>}
        <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={() => { setOpen(true); setDone('') }}>Add information</button>
      </div>
    )
  }
  return (
    <form onSubmit={send} style={{ marginTop: 12, padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }} htmlFor={`fu-${s.id}`}>
        What would you like to add?
      </label>
      <textarea id={`fu-${s.id}`} value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={5000} disabled={busy}
        style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit' }}
        placeholder="For example: a new symptom, a date you remembered, a batch number." />
      {needsScreen && (
        <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ask.label} *</legend>
          {ask.help_text && <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 6px' }}>{ask.help_text}</div>}
          {String(ask.options || '').split('\n').map(o => (
            <label key={o} style={{ marginRight: 16, fontSize: '0.85rem' }}>
              <input type="radio" name={`fu-unwell-${s.id}`} value={o} checked={unwell === o} disabled={busy} onChange={() => setUnwell(o)} /> {o}
            </label>
          ))}
          {unwell === 'Yes' && askMore && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }} htmlFor={`fu-unwell-detail-${s.id}`}>{askMore.label}</label>
              <textarea id={`fu-unwell-detail-${s.id}`} rows={3} value={detail} maxLength={5000} disabled={busy} onChange={e => setDetail(e.target.value)}
                placeholder={askMore.placeholder || ''}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', font: 'inherit' }} />
            </div>
          )}
        </fieldset>
      )}
      <div style={{ margin: '8px 0', fontSize: '0.8rem', color: '#64748b' }}>
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx" disabled={busy} onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 5))} />
        {' '}Up to 5 files (PDF, JPG, PNG or DOCX, 10 MB each).
      </div>
      {error && <div role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="pp-btn pp-btn-primary pp-btn-sm" disabled={busy || text.trim().length < 2}>{busy ? 'Sending…' : 'Send'}</button>
        <button type="button" className="pp-btn pp-btn-outline pp-btn-sm" disabled={busy} onClick={() => { setOpen(false); setError('') }}>Cancel</button>
      </div>
    </form>
  )
}

// CPPM-63: what was said after the answer, oldest first, and a box to reply. On a
// request that is screened (every type but a side effect report) the reply asks the
// same question as the original form — "did anyone become unwell" — and it must be
// answered; a Yes goes to the safety team.
function Conversation({ submission: s, screening, clientCode, portalHeaders, formatDate, onSent }) {
  const [open, setOpen]       = useState(false)
  const [body, setBody]       = useState('')
  const [unwell, setUnwell]   = useState('')
  const [detail, setDetail]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState('')
  const ask    = screening.find(f => f.field_key === 'ae_screen_answer')
  const askMore = screening.find(f => f.field_key === 'ae_screen_detail')
  const needsScreen = s.reply_needs_screening && ask

  async function send(e) {
    e.preventDefault(); setError(''); setDone('')
    if (body.trim().length < 2) { setError('Write your reply before sending it.'); return }
    if (needsScreen && !unwell) { setError('Please answer whether anyone became unwell after using the product.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/portal/submit/${clientCode}/submissions/${s.id}/reply`, {
        method: 'POST', headers: portalHeaders(),
        body: JSON.stringify({ body, ...(needsScreen ? { ae_screen_answer: unwell, ae_screen_detail: unwell === 'Yes' ? detail : '' } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Your reply could not be sent. Please try again.'); return }
      setBody(''); setUnwell(''); setDetail(''); setOpen(false); setDone(d.message || 'Your reply has been sent.')
      await onSent()
    } catch { setError('Network error — please try again.') } finally { setBusy(false) }
  }

  const box = { marginTop: 10, padding: '12px 14px', borderRadius: 8, fontSize: '0.9rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }
  return (
    <div style={{ marginTop: 10 }}>
      {(s.conversation || []).map((m, i) => m.from === 'you' ? (
        <div key={i} style={{ ...box, background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#334155' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>Your reply · {formatDate(m.at)}</div>
          {m.body}
        </div>
      ) : (
        <div key={i} style={{ ...box, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#14532d' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#166534', marginBottom: 4 }}>Our follow-up · {formatDate(m.at)}</div>
          {m.body}
        </div>
      ))}

      {done && <div role="status" style={{ marginTop: 10, color: '#166534', fontWeight: 600, fontSize: '0.88rem' }}>{done}</div>}

      {!open ? (
        <button type="button" className="pp-btn pp-btn-outline pp-btn-sm" style={{ marginTop: 10 }} onClick={() => { setOpen(true); setDone('') }}>
          Reply to this answer
        </button>
      ) : (
        <form onSubmit={send} style={{ marginTop: 10, padding: 14, border: '1px solid #E2E8F0', borderRadius: 8, background: '#fff' }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }} htmlFor={`reply-${s.id}`}>Your reply</label>
          <textarea id={`reply-${s.id}`} rows={4} value={body} maxLength={5000} disabled={busy} onChange={e => setBody(e.target.value)}
            placeholder="Ask a follow-up question or tell us more."
            style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #CBD5E1', fontFamily: 'inherit', fontSize: '0.9rem' }} />
          {needsScreen && (
            <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
              <legend style={{ fontWeight: 600, fontSize: '0.9rem' }}>{ask.label} *</legend>
              {ask.help_text && <div style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 6px' }}>{ask.help_text}</div>}
              {String(ask.options || '').split('\n').map(o => (
                <label key={o} style={{ marginRight: 16, fontSize: '0.9rem' }}>
                  <input type="radio" name={`unwell-${s.id}`} value={o} checked={unwell === o} disabled={busy} onChange={() => setUnwell(o)} /> {o}
                </label>
              ))}
              {unwell === 'Yes' && askMore && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }} htmlFor={`unwell-detail-${s.id}`}>{askMore.label}</label>
                  <textarea id={`unwell-detail-${s.id}`} rows={3} value={detail} maxLength={5000} disabled={busy} onChange={e => setDetail(e.target.value)}
                    placeholder={askMore.placeholder || ''}
                    style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #CBD5E1', fontFamily: 'inherit', fontSize: '0.9rem' }} />
                </div>
              )}
            </fieldset>
          )}
          {error && <div role="alert" style={{ marginTop: 10, color: '#B91C1C', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="pp-btn pp-btn-primary pp-btn-sm" disabled={busy}>{busy ? 'Sending…' : 'Send reply'}</button>
            <button type="button" className="pp-btn pp-btn-outline pp-btn-sm" disabled={busy} onClick={() => { setOpen(false); setError('') }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
