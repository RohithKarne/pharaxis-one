import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import RealtimeChatPanel from '../../../shared/components/RealtimeChatPanel'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import useChatRealtime from '../../../shared/hooks/useChatRealtime'
import './chat.css'

const API = import.meta.env.VITE_API_URL || '/api'

function formatDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString()
}

function shortPreview(value) {
  const text = String(value || '').trim()
  if (!text) return 'No messages yet.'
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}

export default function ChatPage() {
  const { token, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentUserId = user?.id ?? user?.userId ?? null
  const conversationParam = searchParams.get('conversation') || ''
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState('')
  const [users, setUsers] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createParticipants, setCreateParticipants] = useState([])
  const [creatingConversation, setCreatingConversation] = useState(false)

  const selectedConversation = conversations.find((item) => String(item.id) === String(selectedConversationId)) || null
  useChatRealtime({
    token,
    subscription: null,
    onEvent(payload) {
      if (payload.type === 'conversation.updated') {
        loadConversations(conversationParam || selectedConversationId || null)
      }
    },
  })

  async function loadUsers() {
    try {
      const res = await httpFetch(`${API}/users`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load users.')
      const list = Array.isArray(data) ? data : []
      setUsers(list.filter((item) => Number(item.id) !== Number(currentUserId)))
    } catch (_) {
      setUsers([])
    }
  }

  async function loadConversations(preferredId = null) {
    setLoadingList(true)
    setListError('')
    try {
      const res = await httpFetch(`${API}/chat/conversations`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load conversations.')
      const list = Array.isArray(data.conversations) ? data.conversations : []
      setConversations(list)

      const nextId = preferredId || conversationParam || selectedConversationId
      if (nextId && list.some((item) => String(item.id) === String(nextId))) {
        setSelectedConversationId(String(nextId))
      } else if (!selectedConversationId && list[0]?.id) {
        setSelectedConversationId(String(list[0].id))
      } else if (selectedConversationId && !list.some((item) => String(item.id) === String(selectedConversationId))) {
        setSelectedConversationId(list[0]?.id ? String(list[0].id) : '')
      }
    } catch (err) {
      setConversations([])
      setListError(err.message || 'Failed to load conversations.')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    if (!token) return
    loadUsers()
    loadConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, currentUserId])

  useEffect(() => {
    if (!selectedConversationId) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('conversation', selectedConversationId)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, setSearchParams])

  function toggleParticipant(userId) {
    setCreateParticipants((prev) => (
      prev.includes(userId)
        ? prev.filter((item) => item !== userId)
        : [...prev, userId]
    ))
  }

  async function handleCreateConversation() {
    if (createParticipants.length === 0 || creatingConversation) return
    setCreatingConversation(true)
    try {
      const res = await httpFetch(`${API}/chat/conversations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: createTitle,
          participant_ids: createParticipants,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create conversation.')
      const created = data.conversation
      setCreateOpen(false)
      setCreateTitle('')
      setCreateParticipants([])
      await loadConversations(created?.id ? String(created.id) : null)
      if (created?.id) setSelectedConversationId(String(created.id))
    } catch (err) {
      setListError(err.message || 'Failed to create conversation.')
    } finally {
      setCreatingConversation(false)
    }
  }

  return (
    <MIMSLayout bodyClassName="mims-chat-page-body" showStatStrip={false}>
      <div className="mims-chat-page">
        <aside className="mims-chat-sidebar">
          <div className="mims-chat-sidebar-header">
            <div>
              <div className="mims-chat-eyebrow">Internal collaboration</div>
              <h2>Chat</h2>
            </div>
            <button className="mims-chat-create-btn" onClick={() => setCreateOpen((open) => !open)}>
              {createOpen ? 'Close' : 'New Chat'}
            </button>
          </div>

          {createOpen && (
            <div className="mims-chat-create-card">
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Conversation title (optional)"
              />
              <div className="mims-chat-create-users">
                {users.length === 0 && <div className="mims-chat-empty small">No users available.</div>}
                {users.map((item) => (
                  <label key={item.id} className="mims-chat-user-pick">
                    <input
                      type="checkbox"
                      checked={createParticipants.includes(item.id)}
                      onChange={() => toggleParticipant(item.id)}
                    />
                    <span>{item.name || item.email}</span>
                  </label>
                ))}
              </div>
              <button
                className="mims-chat-primary-btn"
                onClick={handleCreateConversation}
                disabled={createParticipants.length === 0 || creatingConversation}
              >
                {creatingConversation ? 'Creating…' : 'Create Conversation'}
              </button>
            </div>
          )}

          {loadingList && <div className="mims-chat-empty">Loading conversations…</div>}
          {!loadingList && listError && <div className="mims-chat-error">{listError}</div>}
          {!loadingList && !listError && conversations.length === 0 && (
            <div className="mims-chat-empty">No chats yet. Start one with your team.</div>
          )}

          {!loadingList && !listError && conversations.length > 0 && (
            <div className="mims-chat-list">
              {conversations.map((item) => (
                <button
                  key={item.id}
                  className={`mims-chat-list-item${String(item.id) === String(selectedConversationId) ? ' active' : ''}`}
                  onClick={() => setSelectedConversationId(String(item.id))}
                >
                  <div className="mims-chat-list-top">
                    <span className="mims-chat-list-title">{item.case_number ? `Case ${item.case_number}` : item.title || 'Untitled Chat'}</span>
                    {Number(item.unread_count || 0) > 0 && <span className="mims-chat-unread-pill">{item.unread_count}</span>}
                  </div>
                  <div className="mims-chat-list-meta">
                    {item.participant_names || 'Participants unavailable'}
                  </div>
                  <div className="mims-chat-list-preview">{shortPreview(item.latest_message_body)}</div>
                  <div className="mims-chat-list-time">{formatDateTime(item.latest_message_at || item.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="mims-chat-thread">
          {!selectedConversation && (
            <div className="mims-chat-thread-empty">
              <h3>Select a chat</h3>
              <p>Open a case-linked thread or start a new internal conversation.</p>
            </div>
          )}

          {selectedConversation && (
            <RealtimeChatPanel
              conversationId={selectedConversationId}
              headers={headers}
              token={token}
              currentUserId={currentUserId}
              availableUsers={users}
              title={selectedConversation.case_number ? `Case ${selectedConversation.case_number}` : selectedConversation.title || 'Untitled Chat'}
              subtitle={selectedConversation.entity_type === 'case' ? 'Case-linked collaboration thread with live presence and mentions.' : 'Internal realtime collaboration space.'}
            />
          )}
        </section>
      </div>
    </MIMSLayout>
  )
}
