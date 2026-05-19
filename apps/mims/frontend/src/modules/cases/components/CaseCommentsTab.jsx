import { useEffect, useState } from 'react'
import RealtimeChatPanel from '../../../shared/components/RealtimeChatPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import CommentThread from '../../../shared/components/collab/CommentThread'
import { useFeatureFlag } from '../../../shared/context/FeatureFlagsContext'

// B16 (KNOWN, DEFERRED) — when this tab is active AND a case is open in the
// shell, two WebSocket connections per user are live:
//   - /api/cases/ws  (case-presence, opened by CaseFormShell)
//   - /api/chat/ws   (RealtimeChatPanel)
// They speak different protocols and serve different data. At our current
// concurrency (~50 users) the 2x socket budget is acceptable. When the user
// count grows past ~500 concurrent, plan a 1-2 day refactor to mux both
// protocols over a single /api/realtime/ws connection. Track in Bucket-3
// enhancement queue.

const API = import.meta.env.VITE_API_URL || '/api'

export default function CaseCommentsTab({ id, headers, token, currentUserId, onCountChange }) {
  const [conversationId, setConversationId] = useState('')
  const [conversationError, setConversationError] = useState('')
  const t5 = useFeatureFlag('cf.theme5_realtime_collab')

  useEffect(() => {
    initializeConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function initializeConversation() {
    setConversationId('')
    setConversationError('')
    try {
      const res = await httpFetch(`${API}/chat/cases/${id}/conversation`, {
        method: 'POST',
        headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to open case chat.')
      setConversationId(String(data.conversation?.id || ''))
    } catch (err) {
      setConversationError(err.message || 'Failed to open case chat.')
    }
  }

  return (
    <div id="tab-comments" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 14px' }}>
      {/* Theme 5 audit-style threaded comments with @-mentions + resolve */}
      {t5 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface,#fff)' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: 13 }}>Threaded Comments</strong>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Audit-style with @-mentions, resolve, and per-field scoping. Watchers get notified.
            </div>
          </div>
          <CommentThread caseId={id} />
        </div>
      )}

      {/* Live chat with presence + participant management (legacy AC-T14) */}
      {conversationError && <div className="cf-corr-error">{conversationError}</div>}
      {!conversationError && !conversationId && (
        <div className="cf-empty-msg">Opening collaboration thread…</div>
      )}
      {!conversationError && conversationId && (
        <RealtimeChatPanel
          conversationId={conversationId}
          headers={headers}
          token={token}
          currentUserId={currentUserId}
          title="Live Chat"
          subtitle="Real-time chat with presence + participant management for this case."
          onCountChange={onCountChange}
        />
      )}
    </div>
  )
}
