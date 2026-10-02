import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const CaseTimelineView = lazy(() => import('./CaseTimelineView'))

// The strip is READ-ONLY by design. Anything a user edits belongs in a wizard
// step; anything a user only glances at belongs here. Nothing lives in both —
// that duplication is what made the old case form show Status, Owner and
// Priority twice on the same screen.

const PRIORITY_LABEL = { normal: 'Normal', high: 'High', urgent: 'Urgent' }

function formatDate(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// Case age in whole days, shown next to the received date so an ageing case is
// visible without opening a report.
function ageInDays(value) {
  if (!value) return null
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  const days = Math.floor((Date.now() - dt.getTime()) / 86400000)
  return days >= 0 ? days : null
}

function formatActivity(event) {
  if (!event) return null
  const who = event.actor || event.actor_name || 'System'
  const when = event.ts ? new Date(event.ts) : null
  const time = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
  return `${who} · ${event.title || 'updated the case'}${time ? ` · ${time}` : ''}`
}

// The strip shows what is saved (`caseData`). An in-progress edit from step 3
// (`infoForm`) is shown next to it as "→ new value (unsaved)", so a change is
// visible before saving without the strip claiming it is saved. It used to
// show the edit as the case's value — a refused close, or a restored draft,
// read as "Status: Closed" on a case that was New (M-109).
export default function CaseHeaderStrip({ caseData, infoForm = {}, statuses = [], users = [], caseId, headers }) {
  const [latest, setLatest] = useState(null)
  const [auditOpen, setAuditOpen] = useState(false)
  // Bridge row 6: cases linked to this one (e.g. a side effect raised from an enquiry).
  // MIMS stored links but no screen showed them.
  const [links, setLinks] = useState([])
  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    httpFetch(`/api/cases/${caseId}/links`, { headers })
      .then(r => (r.ok ? r.json() : { links: [] }))
      .then(d => { if (!cancelled) setLinks(d.links || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [caseId, headers?.Authorization])

  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    async function loadLatest() {
      try {
        const res = await httpFetch(`/api/cases/${caseId}/timeline?limit=1`, {
          headers: headers?.Authorization ? { Authorization: headers.Authorization } : {},
        })
        const data = await res.json()
        if (!cancelled) setLatest((data.events || [])[0] || null)
      } catch { /* the strip degrades to "—" rather than breaking the form */ }
    }
    loadLatest()
    return () => { cancelled = true }
  }, [caseId, headers?.Authorization])

  const statusLabel = (value) => statuses.find(s => String(s.id) === String(value))?.name
  const ownerLabel = (value) => users.find(u => String(u.id) === String(value))?.name || 'Unassigned'
  const priorityLabel = (value) => PRIORITY_LABEL[value] || value || 'Normal'

  const statusName = statusLabel(caseData?.status_id) || caseData?.status || 'New'
  const ownerName = ownerLabel(caseData?.case_owner_id)
  const priority = priorityLabel(caseData?.priority)
  const received = caseData?.date_received

  // Unsaved edits, shown beside the saved value.
  const pending = (edited, saved, label) => (
    edited !== undefined && edited !== null && String(edited ?? '') !== String(saved ?? '')
      ? <span className="cf-strip-pending"> → {label(edited) || '—'} (unsaved)</span>
      : null
  )
  const statusPending = pending(infoForm.status_id, caseData?.status_id, statusLabel)
  const ownerPending = pending(infoForm.case_owner_id, caseData?.case_owner_id, ownerLabel)
  const priorityPending = infoForm.priority ? pending(infoForm.priority, caseData?.priority, priorityLabel) : null
  const age = ageInDays(received)
  const activity = formatActivity(latest)

  return (
    <>
      <div className="cf-header-strip">
        <span className="cf-strip-item"><span className="cf-strip-key">Status</span>{statusName}{statusPending}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item"><span className="cf-strip-key">Owner</span>{ownerName}{ownerPending}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item"><span className="cf-strip-key">Priority</span>{priority}{priorityPending}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item">
          <span className="cf-strip-key">Received</span>
          {formatDate(received)}{age !== null ? ` (${age}d)` : ''}
        </span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item cf-strip-activity">
          <span className="cf-strip-key">Last activity</span>{activity || '—'}
        </span>
        {links.length > 0 && (
          <>
            <span className="cf-strip-sep" aria-hidden="true">·</span>
            <span className="cf-strip-item">
              <span className="cf-strip-key">Linked</span>
              {links.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ', '}
                  <Link to={`/cases/${l.linked_case_id}`} title={l.notes || l.link_type}>{l.linked_case_number || `#${l.linked_case_id}`}</Link>
                  {` (${l.link_type.replace('_', ' ')})`}
                </span>
              ))}
            </span>
          </>
        )}
        <button type="button" className="cf-strip-audit-link" onClick={() => setAuditOpen(true)}>
          Audit trail ↗
        </button>
      </div>

      {auditOpen && (
        <div className="cf-audit-drawer-backdrop" onClick={() => setAuditOpen(false)}>
          <aside
            className="cf-audit-drawer"
            role="dialog"
            aria-label="Case audit trail"
            onClick={e => e.stopPropagation()}
          >
            <div className="cf-audit-drawer-head">
              <strong>Audit trail</strong>
              <button type="button" className="cf-audit-drawer-close" onClick={() => setAuditOpen(false)}>
                Close
              </button>
            </div>
            <Suspense fallback={<div className="cf-empty-msg">Loading audit trail…</div>}>
              <CaseTimelineView caseId={caseId} headers={headers} />
            </Suspense>
          </aside>
        </div>
      )}
    </>
  )
}
