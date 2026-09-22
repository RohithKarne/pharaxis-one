import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// CPPM-17: read-only record of chat box conversations. Opening one is audited.
const OUTCOME_LABEL = { answered: 'Answered', refused: 'Declined', provider_error: 'AI unavailable', empty: 'No answer', error: 'Failed' }
const card = { padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }
const fmt = d => (d ? new Date(d).toLocaleString() : '—')
const who = c => [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Deleted user'

export default function ChatRecordsPage() {
  const { clientId } = useParams()
  const [searchParams] = useSearchParams()
  const [list, setList]       = useState({ conversations: [], total: 0, page: 1, page_size: 25 })
  const [page, setPage]       = useState(1)
  const [userType, setUserType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [open, setOpen]       = useState(null)   // { conversation, messages }

  useEffect(() => {
    setLoading(true); setError('')
    const qs = new URLSearchParams({ page, ...(userType ? { user_type: userType } : {}) })
    fetch(`/api/admin/chat-records/${clientId}?${qs}`, { headers: adminHeaders() })
      .then(r => r.json().then(d => (r.ok ? d : Promise.reject(d))))
      .then(d => setList(d))
      .catch(d => setError(d?.error || 'Could not load conversations.'))
      .finally(() => setLoading(false))
  }, [clientId, page, userType])

  // CPPM-18: the Safety Queue links straight to a conversation.
  useEffect(() => {
    const id = searchParams.get('conversation')
    if (id) openConversation(id)
  }, [clientId, searchParams])

  async function openConversation(id) {
    setError('')
    const r = await fetch(`/api/admin/chat-records/${clientId}/${id}`, { headers: adminHeaders() })
    const d = await r.json().catch(() => ({}))
    if (r.ok) setOpen(d); else setError(d.error || 'Could not open conversation.')
  }

  const pages = Math.max(1, Math.ceil(list.total / list.page_size))

  return (
    <AdminLayout>
      <div className="cp-admin-page" style={{ padding: 24 }}>
        <div className="cp-page-header" style={{ marginBottom: 20 }}>
          <h1>Chat Conversations</h1>
          <p>Every question asked in the chat assistant and the answer given. Opening a conversation is recorded in the audit trail.</p>
        </div>
        {error && <div style={{ color: '#DC2626', fontWeight: 600, marginBottom: 12 }}>{error}</div>}

        {open ? (
          <div style={card}>
            <button onClick={() => setOpen(null)} style={{ border: 'none', background: 'none', color: '#6B3FA0', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 12 }}>← Back to all conversations</button>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{who(open.conversation)} <span style={{ fontWeight: 400, color: '#64748B' }}>· {open.conversation.user_type || 'unknown type'}</span></h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
              {open.conversation.email} · started {fmt(open.conversation.started_at)} · {open.conversation.provider || '—'}{open.conversation.model ? ` / ${open.conversation.model}` : ''}
            </p>
            {open.messages.map(m => {
              const sources = m.sources_json ? JSON.parse(m.sources_json) : []
              const isUser = m.role === 'user'
              if (m.role === 'system') {
                return (
                  <div key={m.id} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: '#FEF2F2', borderLeft: '3px solid #DC2626' }}>
                    <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 4 }}><strong>Safety report</strong> · {fmt(m.created_at)}</div>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  </div>
                )
              }
              return (
                <div key={m.id} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: isUser ? '#F1F5F9' : '#F5F0FA', borderLeft: `3px solid ${isUser ? '#94A3B8' : '#6B3FA0'}` }}>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>
                    <strong>{isUser ? 'Question' : 'Answer'}</strong> · {fmt(m.created_at)}
                    {!isUser && m.outcome && <> · {OUTCOME_LABEL[m.outcome] || m.outcome}</>}
                    {!isUser && m.latency_ms != null && <> · {(m.latency_ms / 1000).toFixed(1)}s</>}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  {sources.length > 0 && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6 }}>
                      Sources: {sources.map(s => `[${s.n}] ${s.title}`).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Conversations ({list.total})</h3>
              <select value={userType} onChange={e => { setUserType(e.target.value); setPage(1) }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }}>
                <option value="">All account types</option>
                <option value="hcp">HCP</option>
                <option value="physician">Physician</option>
                <option value="patient">Patient</option>
                <option value="non_hcp">Non-HCP</option>
                <option value="other">Other</option>
              </select>
            </div>
            {loading ? <div>Loading...</div> : list.conversations.length === 0 ? <div>No conversations yet.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Person</th>
                    <th style={{ padding: 8 }}>Type</th>
                    <th style={{ padding: 8 }}>First question</th>
                    <th style={{ padding: 8 }}>Messages</th>
                    <th style={{ padding: 8 }}>Last activity</th>
                    <th style={{ padding: 8 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.conversations.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: 8, fontWeight: 600 }}>{who(c)}</td>
                      <td style={{ padding: 8 }}>{c.user_type || '—'}</td>
                      <td style={{ padding: 8, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.first_question || '—'}</td>
                      <td style={{ padding: 8 }}>{c.message_count}</td>
                      <td style={{ padding: 8 }}>{fmt(c.last_message_at)}</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => openConversation(c.id)} style={{ color: '#6B3FA0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12, fontSize: 13 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span>Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
