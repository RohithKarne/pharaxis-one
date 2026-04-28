import { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

function formatDate(v) {
  if (!v) return '-'
  const dt = new Date(v)
  return Number.isNaN(dt.getTime()) ? v : dt.toLocaleString()
}

export default function CaseCommentsTab({ id, headers, setSavedMsg, onCountChange }) {
  const [comments,       setComments]       = useState([])
  const [commentsLoading,setCommentsLoading]= useState(false)
  const [commentsError,  setCommentsError]  = useState('')
  const [commentInput,   setCommentInput]   = useState('')
  const [commentSaving,  setCommentSaving]  = useState(false)

  useEffect(() => { loadComments() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadComments() {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const res  = await httpFetch(`${API}/cases/${id}/comments`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load comments.')
      const list = Array.isArray(data) ? data : []
      setComments(list)
      onCountChange?.(list.length)
    } catch (err) {
      setComments([])
      setCommentsError(err.message || 'Failed to load comments.')
    } finally {
      setCommentsLoading(false)
    }
  }

  async function addComment() {
    const comment = commentInput.trim()
    if (!comment || commentSaving) return
    setCommentSaving(true)
    setCommentsError('')
    try {
      const res  = await httpFetch(`${API}/cases/${id}/comments`, {
        method: 'POST', headers, body: JSON.stringify({ comment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add comment.')
      const updated = [data, ...comments]
      setComments(updated)
      onCountChange?.(updated.length)
      setCommentInput('')
      setSavedMsg('Comment added')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) {
      setCommentsError(err.message || 'Failed to add comment.')
    } finally {
      setCommentSaving(false)
    }
  }

  return (
    <div className="cf-tab-pane">
      <div className="cf-comments-composer">
        <textarea
          rows={3}
          value={commentInput}
          onChange={e => setCommentInput(e.target.value)}
          placeholder="Add case note/comment…"
        />
        <div className="cf-comments-actions">
          <button className="cf-save-btn" onClick={addComment} disabled={!commentInput.trim() || commentSaving}>
            {commentSaving ? 'Adding…' : 'Add Comment'}
          </button>
        </div>
      </div>
      {commentsLoading && <div className="cf-empty-msg">Loading comments…</div>}
      {!commentsLoading && commentsError && <div className="cf-corr-error">{commentsError}</div>}
      {!commentsLoading && !commentsError && comments.length === 0 && (
        <div className="cf-empty-msg">No comments yet.</div>
      )}
      {!commentsLoading && !commentsError && comments.length > 0 && (
        <div className="cf-comments-list">
          {comments.map(item => (
            <div key={item.id} className="cf-comment-item">
              <div className="cf-comment-top">
                <span className="cf-comment-author">{item.user_name || item.user_email || 'User'}</span>
                <span className="cf-comment-time">{formatDate(item.created_at)}</span>
              </div>
              <div className="cf-comment-text">{item.comment}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
