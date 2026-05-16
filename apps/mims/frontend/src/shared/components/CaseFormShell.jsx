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
 *     <CaseInfoTab ... />
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

export default function CaseFormShell({
  caseId, caseStatus, caseType,
  sections = [],
  requiredFields = [],
  payload = {},
  dueAt, dueLabel = 'Action required', urgencyMessage,
  transitions = [],
  onTransition,
  onCloned,
  children,
}) {
  const { user } = useAuth()
  const t4 = useFeatureFlag('cf.theme4_visual_polish')
  const t5 = useFeatureFlag('cf.theme5_realtime_collab')
  const t8 = useFeatureFlag('cf.theme8_smart_actions')
  const t9 = useFeatureFlag('cf.theme9_compliance')

  const presence = useCasePresence(caseId)

  const [commentsOpen, setCommentsOpen] = useState(false)
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
        </div>
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
            💬 {commentsOpen ? 'Hide' : 'Comments'}
          </button>
        )}
      </div>

      {t4 && requiredFields.length > 0 && (
        <CompletenessBar fields={requiredFields} payload={payload} />
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {t4 && sections.length > 0 && <StickySectionNav sections={sections} />}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {children}
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
    </div>
  )
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }
function caseTypeColor(t) {
  const c = String(t || '').toLowerCase()
  if (c === 'ae') return '#dc2626'; if (c === 'pc') return '#d97706'; if (c === 'mi') return '#2563eb'
  return '#7a3a8a'
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
  background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '6px 12px', fontSize: 12, fontWeight: 600,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
