import { useEffect, useMemo, useState } from 'react'
import { httpFetch } from '../api/httpFetch.js'
import useChatRealtime from '../hooks/useChatRealtime'
import './realtime-chat.css'

const API = import.meta.env.VITE_API_URL || '/api'

function formatDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString()
}

function initialsFor(user) {
  const text = String(user?.name || user?.email || 'U').trim()
  return text.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

function mentionLabelForUser(user) {
  return String(user?.name || user?.email?.split('@')[0] || `User ${user?.user_id || user?.id || ''}`).trim()
}

function dedupeById(rows) {
  const seen = new Set()
  const next = []
  for (const row of rows || []) {
    if (seen.has(String(row.id))) continue
    seen.add(String(row.id))
    next.push(row)
  }
  return next
}

function extractMentionQuery(value) {
  const text = String(value || '')
  const match = text.match(/(^|[\s\n])@([^\s@]*)$/)
  if (!match) return null
  return match[2] || ''
}

export default function RealtimeChatPanel({
  conversationId,
  headers,
  currentUserId,
  token,
  title,
  subtitle,
  availableUsers = null,
  onCountChange,
}) {
  const [messages, setMessages] = useState([])
  const [participants, setParticipants] = useState([])
  const [orgUsers, setOrgUsers] = useState([])
  const [onlineUserIds, setOnlineUserIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [composerValue, setComposerValue] = useState('')
  const [sending, setSending] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [participantActionBusy, setParticipantActionBusy] = useState(false)
  const [selectedMentionLabels, setSelectedMentionLabels] = useState([])

  const mentionQuery = useMemo(() => extractMentionQuery(composerValue), [composerValue])
  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return []
    const normalized = mentionQuery.toLowerCase()
    return participants
      .filter((item) => Number(item.user_id) !== Number(currentUserId))
      .filter((item) => mentionLabelForUser(item).toLowerCase().includes(normalized))
      .slice(0, 5)
  }, [currentUserId, mentionQuery, participants])

  const participantIds = useMemo(
    () => participants.map((item) => Number(item.user_id)).filter(Boolean),
    [participants]
  )

  const { connectionState } = useChatRealtime({
    token,
    subscription: conversationId ? { conversationId, participantUserIds: participantIds } : null,
    onEvent(payload) {
      if (payload.type === 'message.created' && Number(payload.conversationId) === Number(conversationId) && payload.message) {
        setMessages((prev) => dedupeById([...prev, payload.message]))
        if (Number(payload.message.user_id) !== Number(currentUserId)) {
          httpFetch(`${API}/chat/conversations/${conversationId}/read`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ last_message_id: payload.message.id }),
          }).catch(() => {})
        }
      }
      if (payload.type === 'participants.updated' && Number(payload.conversationId) === Number(conversationId)) {
        setParticipants(Array.isArray(payload.participants) ? payload.participants : [])
        setOnlineUserIds(Array.isArray(payload.onlineUserIds) ? payload.onlineUserIds : [])
      }
      if (payload.type === 'presence.updated' && Number(payload.conversationId) === Number(conversationId)) {
        setOnlineUserIds(Array.isArray(payload.onlineUserIds) ? payload.onlineUserIds : [])
      }
    },
  })

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setParticipants([])
      setOnlineUserIds([])
      setError('')
      return
    }
    loadThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    if (Array.isArray(availableUsers) && availableUsers.length > 0) {
      setOrgUsers(availableUsers)
      return
    }
    if (!conversationId) return
    loadOrgUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableUsers, conversationId])

  useEffect(() => {
    onCountChange?.(messages.length)
  }, [messages.length, onCountChange])

  async function loadOrgUsers() {
    try {
      const res = await httpFetch(`${API}/users`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load users.')
      setOrgUsers(Array.isArray(data) ? data : [])
    } catch (_) {
      setOrgUsers([])
    }
  }

  async function loadParticipants() {
    const res = await httpFetch(`${API}/chat/conversations/${conversationId}/participants`, { headers })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load participants.')
    setParticipants(Array.isArray(data.participants) ? data.participants : [])
    setOnlineUserIds(Array.isArray(data.onlineUserIds) ? data.onlineUserIds : [])
  }

  async function loadMessages() {
    const res = await httpFetch(`${API}/chat/conversations/${conversationId}/messages`, { headers })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load messages.')
    setMessages(Array.isArray(data.messages) ? data.messages : [])
    const lastMessageId = [...(Array.isArray(data.messages) ? data.messages : [])]
      .reverse()
      .find((item) => item.source === 'chat_message')?.id || null
    await httpFetch(`${API}/chat/conversations/${conversationId}/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ last_message_id: lastMessageId }),
    }).catch(() => {})
  }

  async function loadThread() {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadMessages(), loadParticipants()])
    } catch (err) {
      setMessages([])
      setParticipants([])
      setOnlineUserIds([])
      setError(err.message || 'Failed to load chat.')
    } finally {
      setLoading(false)
    }
  }

  function insertMention(user) {
    const label = mentionLabelForUser(user)
    const match = composerValue.match(/(^|[\s\n])@([^\s@]*)$/)
    if (!match) return
    const nextValue = `${composerValue.slice(0, composerValue.length - match[2].length)}${label} `
    setComposerValue(nextValue)
    setSelectedMentionLabels((prev) => (
      prev.some((item) => item.userId === Number(user.user_id || user.id))
        ? prev
        : [...prev, { userId: Number(user.user_id || user.id), label }]
    ))
  }

  async function handleSend() {
    const body = composerValue.trim()
    if (!body || !conversationId || sending) return
    setSending(true)
    setError('')
    const mentionUserIds = selectedMentionLabels
      .filter((item) => body.includes(`@${item.label}`))
      .map((item) => item.userId)
    try {
      const res = await httpFetch(`${API}/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ body, mention_user_ids: mentionUserIds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send message.')
      setMessages((prev) => dedupeById([...prev, { ...data, source: 'chat_message' }]))
      setComposerValue('')
      setSelectedMentionLabels([])
      await httpFetch(`${API}/chat/conversations/${conversationId}/read`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ last_message_id: data.id }),
      }).catch(() => {})
    } catch (err) {
      setError(err.message || 'Failed to send message.')
    } finally {
      setSending(false)
    }
  }

  async function addParticipant(userId) {
    if (!conversationId || participantActionBusy) return
    setParticipantActionBusy(true)
    setError('')
    try {
      const res = await httpFetch(`${API}/chat/conversations/${conversationId}/participants`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_ids: [userId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add participant.')
      setParticipants(Array.isArray(data.participants) ? data.participants : [])
      setOnlineUserIds(Array.isArray(data.onlineUserIds) ? data.onlineUserIds : [])
    } catch (err) {
      setError(err.message || 'Failed to add participant.')
    } finally {
      setParticipantActionBusy(false)
    }
  }

  async function removeParticipant(userId) {
    if (!conversationId || participantActionBusy) return
    setParticipantActionBusy(true)
    setError('')
    try {
      const res = await httpFetch(`${API}/chat/conversations/${conversationId}/participants/${userId}`, {
        method: 'DELETE',
        headers,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove participant.')
      setParticipants(Array.isArray(data.participants) ? data.participants : [])
      setOnlineUserIds(Array.isArray(data.onlineUserIds) ? data.onlineUserIds : [])
    } catch (err) {
      setError(err.message || 'Failed to remove participant.')
    } finally {
      setParticipantActionBusy(false)
    }
  }

  const nonParticipants = orgUsers.filter((user) => !participantIds.includes(Number(user.id)))
  const onlineCount = participants.filter((item) => onlineUserIds.includes(Number(item.user_id))).length

  return (
    <div className="mims-rtc-shell">
      <div className="mims-rtc-main">
        <div className="mims-rtc-card">
          <div className="mims-rtc-header">
            <div>
              <div className="mims-rtc-title">{title || 'Collaboration Thread'}</div>
              <div className="mims-rtc-subtitle">{subtitle || 'Realtime case collaboration with mentions and participant visibility.'}</div>
            </div>
            <div className={`mims-rtc-status ${connectionState === 'open' ? 'live' : ''}`}>
              <span className="mims-rtc-status-dot" />
              {connectionState === 'open' ? 'Live Realtime' : 'Reconnecting'}
            </div>
          </div>

          <div className="mims-rtc-participant-row">
            {participants.map((item) => {
              const online = onlineUserIds.includes(Number(item.user_id))
              return (
                <div key={item.user_id} className="mims-rtc-chip">
                  <span className="mims-rtc-chip-avatar">{initialsFor(item)}</span>
                  <span className="mims-rtc-chip-meta">
                    <span className="mims-rtc-chip-name">{item.name || item.email}</span>
                    <span className={`mims-rtc-chip-state ${online ? 'mims-rtc-online' : 'mims-rtc-offline'}`}>
                      {online ? 'Online now' : 'Offline'}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mims-rtc-feed">
            {loading && <div className="mims-rtc-empty">Loading collaboration thread…</div>}
            {!loading && error && <div className="mims-rtc-error">{error}</div>}
            {!loading && !error && messages.length === 0 && (
              <div className="mims-rtc-empty">Start the conversation. Everyone added here will see updates instantly.</div>
            )}
            {!loading && !error && messages.map((item) => (
              <article key={item.id} className={`mims-rtc-msg${Number(item.user_id) === Number(currentUserId) ? ' own' : ''}`}>
                <div className="mims-rtc-msg-top">
                  <span className="mims-rtc-msg-author">{item.user_name || item.user_email || 'User'}</span>
                  <span className="mims-rtc-msg-time">{formatDateTime(item.created_at)}</span>
                </div>
                {item.source === 'legacy_case_comment' && <div className="mims-rtc-legacy">Legacy Note</div>}
                <div className="mims-rtc-msg-body">{item.body}</div>
              </article>
            ))}
          </div>

          <div className="mims-rtc-compose">
            <textarea
              rows={4}
              value={composerValue}
              onChange={(e) => setComposerValue(e.target.value)}
              placeholder="Write a realtime message. Use @ to mention collaborators."
            />
            {mentionQuery != null && mentionCandidates.length > 0 && (
              <div className="mims-rtc-suggest">
                {mentionCandidates.map((item) => (
                  <button key={item.user_id} className="mims-rtc-suggest-item" onClick={() => insertMention(item)}>
                    <span>{item.name || item.email}</span>
                    <span className={onlineUserIds.includes(Number(item.user_id)) ? 'mims-rtc-online' : 'mims-rtc-offline'}>
                      {onlineUserIds.includes(Number(item.user_id)) ? 'Online' : 'Offline'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedMentionLabels.length > 0 && (
              <div className="mims-rtc-mention-box">
                {selectedMentionLabels.map((item) => (
                  <span key={item.userId} className="mims-rtc-mention-chip">@{item.label}</span>
                ))}
              </div>
            )}
            <div className="mims-rtc-compose-meta">
              <div className="mims-rtc-subtitle">{onlineCount} of {participants.length} participants online</div>
              <div className="mims-rtc-actions">
                <button className="mims-rtc-btn secondary" onClick={() => setManageOpen((open) => !open)}>
                  {manageOpen ? 'Hide People' : 'Manage People'}
                </button>
                <button className="mims-rtc-btn primary" onClick={handleSend} disabled={!composerValue.trim() || sending}>
                  {sending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="mims-rtc-side">
        <div className="mims-rtc-card mims-rtc-side-card">
          <div className="mims-rtc-side-head">
            <div className="mims-rtc-side-title">Online Right Now</div>
            <span className="mims-rtc-subtitle">{onlineCount}/{participants.length}</span>
          </div>
          <div className="mims-rtc-user-list">
            {participants.map((item) => {
              const online = onlineUserIds.includes(Number(item.user_id))
              return (
                <div key={item.user_id} className="mims-rtc-user-row">
                  <div className="mims-rtc-user-label">
                    <span className="mims-rtc-user-name">{item.name || item.email}</span>
                    <span className={`mims-rtc-user-sub ${online ? 'mims-rtc-online' : 'mims-rtc-offline'}`}>
                      {online ? 'Online and active' : 'Not online'}
                    </span>
                  </div>
                  {manageOpen && Number(item.user_id) !== Number(currentUserId) && (
                    <button className="secondary" onClick={() => removeParticipant(item.user_id)} disabled={participantActionBusy}>
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {manageOpen && (
          <div className="mims-rtc-card mims-rtc-side-card">
            <div className="mims-rtc-side-head">
              <div className="mims-rtc-side-title">Add Collaborators</div>
            </div>
            <div className="mims-rtc-user-list">
              {nonParticipants.length === 0 && <div className="mims-rtc-empty">Everyone in this org is already in the conversation.</div>}
              {nonParticipants.map((user) => (
                <div key={user.id} className="mims-rtc-user-row">
                  <div className="mims-rtc-user-label">
                    <span className="mims-rtc-user-name">{user.name || user.email}</span>
                    <span className="mims-rtc-user-sub">{user.role || 'user'}</span>
                  </div>
                  <button className="primary" onClick={() => addParticipant(user.id)} disabled={participantActionBusy}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
