/**
 * CaseFormShell — Polish Wave consumer-wiring (Waves 1-5).
 *
 * Wraps an existing case form (the children) with the full chrome:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ UrgencyBanner (Theme 4) — SLA countdown                      │
 *   │ Header: title · PresenceIndicator (T5) · Watchers · Clone · Macros · E-sign │
 *   │ CompletenessBar (Theme 4)                                    │
 *   │ ┌────────┬─────────────────────────┬────────────────────────┐│
 *   │ │ Sticky │ {children}              │ Comments drawer (T5)   ││
 *   │ │  Nav   │  (your existing form)   │  toggle 💬              ││
 *   │ └────────┴─────────────────────────┴────────────────────────┘│
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Use:
 *   <CaseFormShell
 *     caseId={id} caseStatus={status} caseType={type}
 *     sections={[{id:'reporter', label:'Reporter', count: 12, complete: 8}, ...]}
 *     requiredFields={[...]}
 *     payload={state}
 *     dueAt={case.due_at} dueLabel="Submit to FDA"
 *     transitions={['submit','approve','close']}
 *     onTransition={(t) => ...}
 *   >
 *     <CaseFormWizard ... />
 *   </CaseFormShell>
 *
 * All chrome is feature-flag-gated; if a flag is off, that piece is invisible.
 */

import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../context/FeatureFlagsContext'
import useCasePresence from '../hooks/useCasePresence'
import CompletenessBar from './CompletenessBar'
import StickySectionNav from './StickySectionNav'
import UrgencyBanner from './UrgencyBanner'
import PresenceIndicator from './collab/PresenceIndicator'
import WatchersButton from './collab/WatchersButton'
import CommentThread from './collab/CommentThread'
import CloneCaseButton from './caseActions/CloneCaseButton'
import RunMacroButton from './caseActions/RunMacroButton'
import ESignModal from './compliance/ESignModal'
import { CaseFieldProvider } from './WiredField'
import HaClockBar from './HaClockBar'
import SlaChip from './SlaChip'                       // Sprint 2 #11
import CaseTimelineDrawer from './CaseTimelineDrawer' // Sprint 2 #13
import CaseValidityPanel from './CaseValidityPanel'
import Icon from './Icon'

export default function CaseFormShell({
  caseId, caseStatus, caseType,
  sections = [],
  showSectionRail = false,   // B20 — only show StickySectionNav for long-form pages
  showHeader = true,
  requiredFields = [],
  payload = {},
  dueAt, dueLabel = 'Action required', urgencyMessage,
  transitions = [],
  onTransition,
  onCloned,
  onValidityNavigate,
  children,
}) {
  const { user } = useAuth()
  const t4 = useFeatureFlag('cf.theme4_visual_polish')
  const t5 = useFeatureFlag('cf.theme5_realtime_collab')
  const t8 = useFeatureFlag('cf.theme8_smart_actions')
  const t9 = useFeatureFlag('cf.theme9_compliance')
  const pvHaClocks = useFeatureFlag('cf.pv_ha_clocks')
  const pvValidity = useFeatureFlag('cf.pv_case_validity')

  const presence = useCasePresence(caseId)

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false) // Sprint 2 #13
  const [esign, setESign] = useState(null) // { transition, fromStatus, toStatus }

  function tryTransition(t) {
    if (t9) {
      setESign({ transition: t, fromStatus: caseStatus, toStatus: null })
    } else {
      onTransition?.(t)
    }
  }
  function onSigned() {
    const t = esign?.transition; setESign(null)
    if (t) onTransition?.(t)
  }

  return (
    <div style={shell}>
      {t4 && dueAt && (
        <div style={{ padding: '8px 14px 0' }}>
          <UrgencyBanner dueAt={dueAt} dueLabel={dueLabel} message={urgencyMessage} dismissible />
        </div>
      )}

      {showHeader && (
        <div style={header}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Case #{caseId}</strong>
            {caseType && (
              <span style={{ ...chip(caseTypeColor(caseType)), fontSize: 11 }}>{String(caseType).toUpperCase()}</span>
            )}
            {caseStatus && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'var(--surface-alt,#fafafa)', color: 'var(--text-secondary)' }}>{caseStatus}</span>
            )}
            {pvValidity && <CaseValidityPanel caseId={caseId} onNavigate={onValidityNavigate} />}
            {/* Sprint 2 #11 — workflow SLA chip (current state + remaining time) */}
            <SlaChip caseId={caseId} />
          </div>
          {/* Sprint 2 #13 — chronology drawer toggle */}
          <button onClick={() => setTimelineOpen(o => !o)} style={ghostBtn} title="View case chronology">
            <Icon name="clock" size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Timeline
          </button>
          {t5 && presence.enabled && <PresenceIndicator users={presence.users} />}
          {t5 && <WatchersButton caseId={caseId} />}
          {t8 && <CloneCaseButton caseId={caseId} variant="ghost" onCloned={onCloned} />}
          {t8 && <RunMacroButton caseId={caseId} />}
          {transitions.map(t => (
            <button key={t} onClick={() => tryTransition(t)} style={primaryBtn}>
              {t9 ? '✍ ' : ''}{cap(t)}
            </button>
          ))}
          {t5 && (
            <button onClick={() => setCommentsOpen(o => !o)} style={ghostBtn}>
              <Icon name="message" size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />{commentsOpen ? 'Hide' : 'Comments'}
            </button>
          )}
        </div>
      )}

      {pvHaClocks && (
        <div style={{ padding: '8px 14px 0' }}>
          <HaClockBar caseId={caseId} />
        </div>
      )}

      {t4 && requiredFields.length > 0 && (
        <CompletenessBar fields={requiredFields} payload={payload} />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/*
          B20 — Only render the in-page StickySectionNav when the sections
          passed in represent IN-PAGE anchors that are all mounted at once
          (i.e. a long-form view). When sections represent top-level tabs
          (only one mounted at a time), the existing horizontal tab bar above
          already handles navigation; rendering the side rail there causes
          scroll-spy to fail because the other anchors don't exist in the DOM.
          Callers signal "long form" by passing `showSectionRail`.
        */}
        {t4 && showSectionRail && sections.length > 0 && <StickySectionNav sections={sections} />}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <CaseFieldProvider
            caseId={caseId} caseStatus={caseStatus}
            presence={presence} currentUserId={user?.userId}
          >
            {children}
          </CaseFieldProvider>
        </div>
        {t5 && commentsOpen && (
          <aside style={drawer}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 13 }}>Comments</strong>
              <button onClick={() => setCommentsOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: 16, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <CommentThread caseId={caseId} compact />
            </div>
          </aside>
        )}
      </div>

      <ESignModal
        open={!!esign} onClose={() => setESign(null)}
        caseId={caseId} transition={esign?.transition}
        fromStatus={esign?.fromStatus} toStatus={esign?.toStatus}
        onSigned={onSigned}
      />
      {/* Sprint 2 #13 — case timeline / chronology */}
      <CaseTimelineDrawer caseId={caseId} open={timelineOpen} onClose={() => setTimelineOpen(false)} />
    </div>
  )
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }
function caseTypeColor(t) {
  const c = String(t || '').toLowerCase()
  if (c === 'ae') return '#dc2626'; if (c === 'pc') return '#d97706'; if (c === 'mi') return '#2563eb'
  return 'var(--primary)'
}
function chip(color) { return { padding: '2px 8px', borderRadius: 10, color: '#fff', background: color, fontWeight: 700 } }

const shell = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }
const header = {
  padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8,
  borderBottom: '1px solid var(--border)', background: 'var(--surface,#fff)',
}
const drawer = {
  width: 360, borderLeft: '1px solid var(--border)', background: 'var(--surface-alt,#fafafa)',
  display: 'flex', flexDirection: 'column',
}
const primaryBtn = { padding: '6px 12px', fontSize: 12, fontWeight: 600,
  background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '6px 12px', fontSize: 12, fontWeight: 600,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
