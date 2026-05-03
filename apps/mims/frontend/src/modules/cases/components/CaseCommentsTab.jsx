import { useEffect, useState } from 'react'
import RealtimeChatPanel from '../../../shared/components/RealtimeChatPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

export default function CaseCommentsTab({ id, headers, token, currentUserId, onCountChange }) {
  const [conversationId, setConversationId] = useState('')
  const [conversationError, setConversationError] = useState('')

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

  if (conversationError) {
    return <div className="cf-corr-error">{conversationError}</div>
  }

  if (!conversationId) {
    return <div className="cf-empty-msg">Opening collaboration thread…</div>
  }

  return (
    <RealtimeChatPanel
      conversationId={conversationId}
      headers={headers}
      token={token}
      currentUserId={currentUserId}
      title="Case Collaboration"
      subtitle="Live thread with presence, mentions, and participant management for this case."
      onCountChange={onCountChange}
    />
  )
}
