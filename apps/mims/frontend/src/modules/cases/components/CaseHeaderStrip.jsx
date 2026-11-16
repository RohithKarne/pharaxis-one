import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import toast from '../../../shared/utils/toast'

const CaseTimelineView = lazy(() => import('./CaseTimelineView'))

// The strip is READ-ONLY by design. Anything a user edits belongs in a wizard
// step; anything a user only glances at belongs here. Nothing lives in both —
// that duplication is what made the old case form show Status, Owner and
// Priority twice on the same screen.
// Status and Owner are shortcuts, not second editors: a click opens step 3 at
// that field, and "Assign to me" fills the owner field there, unsaved, like a
// change made in the field itself (MIMS screen review, row 10).

const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' }

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
export default function CaseHeaderStrip({ caseData, infoForm = {}, statuses = [], users = [], caseId, headers, currentUserId, onEditField, onAssignToMe }) {
  const [latest, setLatest] = useState(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [haClock, setHaClock] = useState(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitType, setSplitType] = useState('AE')
  const [splitReason, setSplitReason] = useState('')
  const [splitDesc, setSplitDesc] = useState('')
  const [copyContacts, setCopyContacts] = useState(true)
  const [copyPatient, setCopyPatient] = useState(true)
  const [assignQueue, setAssignQueue] = useState(true)
  const [splitSaving, setSplitSaving] = useState(false)
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
    // Also load HA regulatory clocks (CF-01)
    httpFetch(`/api/cases/${caseId}/ha-clocks`, { headers })
      .then(r => (r.ok ? r.json() : { clocks: [] }))
      .then(d => {
        if (!cancelled && Array.isArray(d.clocks) && d.clocks.length > 0) {
          const activeClock = d.clocks.find(c => c.is_expedited || c.status === 'red' || c.status === 'amber') || d.clocks[0]
          setHaClock(activeClock)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
    // Keyed on the token, not the headers object: the page builds a new object
    // each render, and depending on it would refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // updated_at changes on every save, so the line shows the save just made
    // rather than the activity from when the case was opened.
  }, [caseId, headers?.Authorization, caseData?.updated_at])

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
  const ownerNow = infoForm.case_owner_id ?? caseData?.case_owner_id
  const canAssignToMe = onAssignToMe && currentUserId
    && users.some(u => String(u.id) === String(currentUserId))
    && String(ownerNow ?? '') !== String(currentUserId)
  const shortcut = (field, title, text) => (onEditField
    ? <button type="button" className="cf-strip-value-btn" title={title} onClick={() => onEditField(field)}>{text}</button>
    : text)

  async function handleSplitCase(e) {
    e.preventDefault()
    setSplitSaving(true)
    try {
      const res = await httpFetch(`/api/cases/${caseId}/split`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_case_type: splitType,
          reason: splitReason || `Clinical case split into ${splitType}`,
          description: splitDesc || undefined,
          copy_contacts: copyContacts,
          copy_patient: copyPatient,
          assign_to_queue: assignQueue
        })
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to split case')
        return
      }
      toast.success(data.message || `Case successfully split into ${data.child_case_number}!`)
      setSplitOpen(false)
      httpFetch(`/api/cases/${caseId}/links`, { headers })
        .then(r => r.json())
        .then(d => setLinks(d.links || []))
        .catch(() => {})
    } catch {
      toast.error('Network error while splitting case')
    } finally {
      setSplitSaving(false)
    }
  }

  return (
    <>
      <div className="cf-header-strip">
        <span className="cf-strip-item"><span className="cf-strip-key">Status</span>{shortcut('status_id', 'Change status', statusName)}{statusPending}</span>
        <span className="cf-strip-sep" aria-hidden="true">·</span>
        <span className="cf-strip-item">
          <span className="cf-strip-key">Owner</span>{shortcut('case_owner_id', 'Change owner', ownerName)}{ownerPending}
          {canAssignToMe && (
            <button type="button" className="cf-strip-assign-btn" onClick={onAssignToMe}>Assign to me</button>
          )}
        </span>
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
        {haClock && (
          <>
            <span className="cf-strip-sep" aria-hidden="true">·</span>
            <span className="cf-strip-item" title={`Due: ${formatDate(haClock.due_at)} (${haClock.submission_window_days || 15}d window)`}>
              <span className="cf-strip-key">Regulatory Clock</span>
              <span style={{
                fontWeight: 600,
                color: haClock.status === 'red' ? '#e11d48' : haClock.status === 'amber' ? '#d97706' : '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                {haClock.is_expedited ? '⚡ Expedited' : 'Standard'}
                {haClock.days_remaining != null ? ` (${haClock.days_remaining}d remaining)` : ''}
              </span>
            </span>
          </>
        )}
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
        <button
          type="button"
          className="cf-strip-split-btn"
          style={{
            background: 'var(--surface, #fff)',
            border: '1px solid var(--primary, #0284c7)',
            color: 'var(--primary, #0284c7)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            marginLeft: 6
          }}
          onClick={() => setSplitOpen(true)}
        >
          Split Case
        </button>
        <button type="button" className="cf-strip-audit-link" onClick={() => setAuditOpen(true)}>
          Audit trail
        </button>
      </div>

      {splitOpen && (
        <div className="cf-audit-drawer-backdrop" onClick={() => setSplitOpen(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="cf-split-modal"
            role="dialog"
            aria-label="Split Case"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface, #ffffff)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 520,
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid var(--border, #e2e8f0)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Split & Link Case</h3>
              <button type="button" onClick={() => setSplitOpen(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              Spawns a linked child case so Medical Affairs and Pharmacovigilance / Quality can work in parallel without altering this case.
            </p>
            <form onSubmit={handleSplitCase}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Target Case Type *</label>
                <select
                  value={splitType}
                  onChange={e => setSplitType(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)' }}
                >
                  <option value="AE">Adverse Event (AE) — Safety Track</option>
                  <option value="PC">Product Quality Complaint (PC) — Defect Track</option>
                  <option value="MI">Medical Information (MI) — Medical Affairs Track</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Reason for Split</label>
                <input
                  type="text"
                  placeholder="e.g. Physician enquired about dosing but mentioned severe reaction"
                  value={splitReason}
                  onChange={e => setSplitReason(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Child Case Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional custom description for the new child case"
                  value={splitDesc}
                  onChange={e => setSplitDesc(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={copyContacts} onChange={e => setCopyContacts(e.target.checked)} />
                  Copy Primary Reporter & Contact Details
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={copyPatient} onChange={e => setCopyPatient(e.target.checked)} />
                  Copy Patient Demographics
                </label>
                {splitType === 'AE' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#0369a1' }}>
                    <input type="checkbox" checked={assignQueue} onChange={e => setAssignQueue(e.target.checked)} />
                    Route directly to Pharmacovigilance Triage Queue (Unassigned)
                  </label>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setSplitOpen(false)}
                  style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={splitSaving}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 4,
                    border: 'none',
                    background: 'var(--primary, #0284c7)',
                    color: '#fff',
                    fontWeight: 500,
                    cursor: splitSaving ? 'not-allowed' : 'pointer'
                  }}
                >
                  {splitSaving ? 'Splitting Case…' : 'Split & Create Linked Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
