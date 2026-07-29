import React, { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch'
import Icon from '../../../shared/components/Icon'

export default function FieldInlineCommentDrawer({
  open,
  onClose,
  caseId,
  section,
  field,
  label
}) {
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)

  useEffect(() => {
    if (open && caseId && section && field) {
      fetchComments()
    }
  }, [open, caseId, section, field])

  const fetchComments = async () => {
    setLoading(true)
    try {
      const res = await httpFetch(`/cases/${caseId}/comments?section=${section}&field=${field}`)
      setComments(res || [])
    } catch (err) {
      console.error('Failed to fetch comments', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePost = async () => {
    if (!newComment.trim()) return
    
    const mentions = []
    const mentionRegex = /@([\w.-]+)/g
    let match
    while ((match = mentionRegex.exec(newComment)) !== null) {
      mentions.push(match[1])
    }
    
    try {
      await httpFetch(`/cases/${caseId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          section,
          field,
          text: newComment,
          parent_id: replyingTo,
          mentions
        })
      })
      setNewComment('')
      setReplyingTo(null)
      fetchComments()
    } catch (err) {
      console.error('Failed to post comment', err)
    }
  }

  const handleResolve = async (commentId) => {
    try {
      await httpFetch(`/cases/${caseId}/comments/${commentId}/resolve`, {
        method: 'POST'
      })
      fetchComments()
    } catch (err) {
      console.error('Failed to resolve comment', err)
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await httpFetch(`/cases/${caseId}/comments/${commentId}`, {
        method: 'DELETE'
      })
      fetchComments()
    } catch (err) {
      console.error('Failed to delete comment', err)
    }
  }

  if (!open) return null

  const threads = comments.filter(c => !c.parent_id)
  const getReplies = (parentId) => comments.filter(c => c.parent_id === parentId)

  const renderText = (text) => {
    if (!text) return null
    const parts = text.split(/(@[\w.-]+)/g)
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return <span key={i} className="cf-comment-mention">{part}</span>
      }
      return part
    })
  }

  return (
    <div className="cf-comment-drawer-overlay">
      <div className="cf-comment-drawer">
        <div className="cf-comment-drawer-header">
          <h3>Comments on {label || field}</h3>
          <button onClick={onClose} className="cf-comment-drawer-close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="cf-comment-drawer-content">
          {loading ? (
            <div>Loading comments...</div>
          ) : threads.length === 0 ? (
            <div className="cf-comment-empty">No comments yet. Be the first to start a conversation!</div>
          ) : (
            threads.map(thread => (
              <div key={thread.id} className="cf-comment-thread">
                <div className="cf-comment-item">
                  <div className="cf-comment-avatar">{thread.author?.charAt(0).toUpperCase() || 'U'}</div>
                  <div className="cf-comment-body">
                    <div className="cf-comment-meta">
                      <strong>{thread.author || 'User'}</strong>
                      <span className="cf-comment-time">{new Date(thread.created_at).toLocaleString()}</span>
                      {thread.resolved && <span className="cf-comment-resolved-badge">Resolved</span>}
                    </div>
                    <div className="cf-comment-text">{renderText(thread.text)}</div>
                    <div className="cf-comment-actions">
                      <button onClick={() => setReplyingTo(thread.id)}>Reply</button>
                      {!thread.resolved && <button onClick={() => handleResolve(thread.id)}>Resolve</button>}
                      <button onClick={() => handleDelete(thread.id)}>Delete</button>
                    </div>
                  </div>
                </div>
                
                <div className="cf-comment-replies">
                  {getReplies(thread.id).map(reply => (
                    <div key={reply.id} className="cf-comment-item">
                      <div className="cf-comment-avatar">{reply.author?.charAt(0).toUpperCase() || 'U'}</div>
                      <div className="cf-comment-body">
                        <div className="cf-comment-meta">
                          <strong>{reply.author || 'User'}</strong>
                          <span className="cf-comment-time">{new Date(reply.created_at).toLocaleString()}</span>
                        </div>
                        <div className="cf-comment-text">{renderText(reply.text)}</div>
                        <div className="cf-comment-actions">
                          <button onClick={() => handleDelete(reply.id)}>Delete</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="cf-comment-drawer-footer">
          {replyingTo && (
            <div className="cf-comment-replying-to">
              Replying to comment... <button onClick={() => setReplyingTo(null)}>Cancel</button>
            </div>
          )}
          <div className="cf-comment-input-row">
            <textarea 
              value={newComment} 
              onChange={e => setNewComment(e.target.value)}
              placeholder="Type a comment... Use @ to mention someone"
              rows={3}
            />
            <button onClick={handlePost} disabled={!newComment.trim()}>Post</button>
          </div>
        </div>
      </div>
    </div>
  )
}
