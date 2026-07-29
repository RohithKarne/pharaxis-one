import { lazy, Suspense, useEffect, useState } from 'react'
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

// `infoForm` carries the user's in-progress edits from step 3. The strip reads
// it in preference to `caseData`, which only refreshes on save — otherwise
// changing Priority on the last step leaves the strip showing the old value
// until the case is saved, which reads as a bug.
export default function CaseHeaderStrip({ caseData, infoForm = {}, statuses = [], users = [], caseId, headers }) {
  const [latest, setLatest] = useState(null)
  const [auditOpen, setAuditOpen] = useState(false)

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

  const statusId = infoForm.status_id ?? caseData?.status_id
  const ownerId = infoForm.case_owner_id ?? caseData?.case_owner_id
  const priorityValue = infoForm.priority || caseData?.priority

  const statusName = statuses.find(s => String(s.id) === String(statusId))?.name
    || caseData?.status
    || 'New'
  const ownerName = users.find(u => String(u.id) === String(ownerId))?.name || 'Unassigned'
  const priority = PRIORITY_LABEL[priorityValue] || priorityValue || 'Normal'
  const received = infoForm.date_received || caseData?.date_received
  const age = ageInDays(received)
  const activity = formatActivity(latest)

  return (
    <>
      <div className="cf-header-strip">
        <span className="cf-strip-item"><span className="cf-strip-key">Status</span>{statusName}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item"><span className="cf-strip-key">Owner</span>{ownerName}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item"><span className="cf-strip-key">Priority</span>{priority}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item">
          <span className="cf-strip-key">Received</span>
          {formatDate(received)}{age !== null ? ` (${age}d)` : ''}
        </span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item cf-strip-activity">
          <span className="cf-strip-key">Last activity</span>{activity || '—'}
        </span>
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
