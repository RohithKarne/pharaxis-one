import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, getOrgUser } from '../../common/utils/session'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function MyTasksPage() {
  const token = getOrgToken()
  const currentUser = getOrgUser()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedTaskId, setSelectedTaskId] = useState(null)

  const [signatureMeaning, setSignatureMeaning] = useState('approved')
  const [signatureComment, setSignatureComment] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [reassignToUserId, setReassignToUserId] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [reassignSubmitting, setReassignSubmitting] = useState(false)
  const [delegateSubmitting, setDelegateSubmitting] = useState(false)

  const [taskComments, setTaskComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const [orgUsers, setOrgUsers] = useState([])
  const [success, setSuccess] = useState('')
  const [manifest, setManifest] = useState(null)

  const selectedTask = useMemo(
    () => tasks.find(task => Number(task.id) === Number(selectedTaskId)) || null,
    [tasks, selectedTaskId]
  )

  async function loadTasks(nextStatus = statusFilter) {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : ''
      const rows = await apiJson(`/api/workflows/tasks/my${query}`, {
        headers: authHeaders(token)
      })
      setTasks(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadTaskComments(taskId) {
    if (!taskId) {
      setTaskComments([])
      return
    }

    setCommentsLoading(true)
    try {
      const rows = await apiJson(`/api/workflows/tasks/${taskId}/comments`, {
        headers: authHeaders(token)
      })
      setTaskComments(rows)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCommentsLoading(false)
    }
  }

  useEffect(() => {
    loadTasks(statusFilter)
  }, [statusFilter])

  useEffect(() => {
    if (!selectedTask) return

    loadTaskComments(selectedTask.id)

    apiJson('/api/users', { headers: authHeaders(token) })
      .then(rows => {
        setOrgUsers(rows)
        if (!reassignToUserId && rows.length) {
          const firstDifferentUser = rows.find(row => Number(row.id) !== Number(selectedTask.assignee_user_id))
          setReassignToUserId(String((firstDifferentUser || rows[0]).id))
        }
      })
      .catch(() => {
        // User list is optional for reassignment UX; ignore fetch failure.
      })
  }, [selectedTask?.id])

  async function signTask(event) {
    event.preventDefault()
    if (!selectedTask) {
      setError('Choose a pending task to sign.')
      return
    }
    if (!password) {
      setError('Password is required.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/workflows/tasks/${selectedTask.id}/sign`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          password,
          signature_meaning: signatureMeaning,
          signature_comment: signatureComment
        })
      })

      setSuccess(`Task signed. Signature ID: ${payload.signature_id}`)
      setPassword('')
      setSignatureComment('')
      setSelectedTaskId(null)
      await loadTasks(statusFilter)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function reassignTask(event) {
    event.preventDefault()
    if (!selectedTask) {
      setError('Choose a pending task to reassign.')
      return
    }
    if (!reassignToUserId) {
      setError('Choose a user to reassign.')
      return
    }

    setReassignSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/workflows/tasks/${selectedTask.id}/reassign`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          assignee_user_id: Number(reassignToUserId),
          reason: reassignReason || null
        })
      })

      setSuccess(`Task reassigned to user #${payload.assignee_user_id}`)
      setReassignReason('')
      await loadTasks(statusFilter)
      await loadTaskComments(selectedTask.id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setReassignSubmitting(false)
    }
  }

  async function delegateTask() {
    if (!selectedTask) {
      setError('Choose a pending task to delegate.')
      return
    }
    if (!reassignToUserId) {
      setError('Choose a user to delegate.')
      return
    }

    setDelegateSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/workflows/tasks/${selectedTask.id}/delegate`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          delegate_to_user_id: Number(reassignToUserId),
          reason: reassignReason || null
        })
      })

      setSuccess(`Task delegated to user #${payload.assignee_user_id}`)
      setReassignReason('')
      await loadTasks(statusFilter)
      await loadTaskComments(selectedTask.id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDelegateSubmitting(false)
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!selectedTask) {
      setError('Choose a task before adding comment.')
      return
    }
    if (!commentText.trim()) {
      setError('Comment text is required.')
      return
    }

    setCommentSubmitting(true)
    setError('')
    try {
      await apiJson(`/api/workflows/tasks/${selectedTask.id}/comments`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ comment_text: commentText.trim() })
      })
      setCommentText('')
      await loadTaskComments(selectedTask.id)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function viewManifest(signatureId) {
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/workflows/signatures/${signatureId}`, {
        headers: authHeaders(token)
      })
      setManifest(payload)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Workforce / Tasks</p>
            <h2 className="workspace-hero-title">My Workflow Tasks</h2>
            <p className="panel-note">Review, reassign, comment, and sign tasks with full traceability.</p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Task Center</span>
            <span className="workspace-hero-date">{tasks.length} tasks</span>
          </div>
        </section>

        <section className="panel span-12">
          <ul className="simple-list">
            <li>
              <span>Current user</span>
              <strong>{currentUser?.name || '-'} ({currentUser?.role || '-'})</strong>
            </li>
          </ul>
        </section>
      </main>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <div className="users-toolbar">
            <div className="users-filter">
              <label htmlFor="task-status-filter">Task Status</label>
              <select
                id="task-status-filter"
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <Link className="btn-secondary link-button" to="/vault">Back to Vault</Link>
          </div>

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="users-loading panel-note">Loading tasks...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Activation</th>
                    <th>Due At</th>
                    <th>Escalation</th>
                    <th>Reassignment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => (
                    <tr key={task.id}>
                      <td>
                        <strong>#{task.id}</strong>
                        <div className="panel-note">Step {task.step_order} · {task.task_type}</div>
                      </td>
                      <td>
                        <div>
                          <strong>{task.doc_number}</strong>
                          <div className="panel-note">{task.title}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-chip ${task.status === 'completed' ? 'success' : task.status === 'pending' ? 'pending' : 'info'}`}>
                          {task.status}
                        </span>
                      </td>
                      <td>{task.activation_status || '-'}</td>
                      <td>{formatDateTime(task.due_at)}</td>
                      <td>
                        {task.escalated_at ? (
                          <div>
                            <div>{formatDateTime(task.escalated_at)}</div>
                            <div className="panel-note">Owner: {task.escalation_owner_name || '-'}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        {task.reassigned_at || task.delegated_at ? (
                          <div>
                            {task.reassigned_at ? (
                              <div>
                                <div>{formatDateTime(task.reassigned_at)}</div>
                                <div className="panel-note">Reassigned from: {task.reassigned_from_name || '-'}</div>
                              </div>
                            ) : null}
                            {task.delegated_at ? (
                              <div>
                                <div>{formatDateTime(task.delegated_at)}</div>
                                <div className="panel-note">Delegated from: {task.delegated_from_name || '-'}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        <div className="detail-actions">
                          <button
                            className="btn-secondary"
                            onClick={() => {
                              setSelectedTaskId(task.id)
                              setManifest(null)
                            }}
                          >
                            Open Task
                          </button>
                          {task.signature_id ? (
                            <button className="btn-secondary" onClick={() => viewManifest(task.signature_id)}>
                              Manifest
                            </button>
                          ) : null}
                          <Link className="btn-secondary link-button" to={`/vault/content/${task.content_id}`}>
                            Document
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!tasks.length ? (
                    <tr>
                      <td colSpan={8} className="users-empty">No tasks found for selected status.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
      <main className="dashboard-grid">
        {selectedTask ? (
          <section className="panel span-8">
            <h3>Task #{selectedTask.id} Operations</h3>
            <p className="panel-note">Task type: {selectedTask.task_type} · Status: {selectedTask.status}</p>

            {selectedTask.status === 'pending' && selectedTask.activation_status === 'ready' ? (
              <form className="auth-form" onSubmit={signTask}>
                <h3>Sign Task</h3>
                <div className="form-field">
                  <label htmlFor="signature-meaning">Signature Meaning</label>
                  <select
                    id="signature-meaning"
                    value={signatureMeaning}
                    onChange={event => setSignatureMeaning(event.target.value)}
                  >
                    <option value="approved">Approved</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="rejected">Rejected</option>
                    <option value="acknowledged">Acknowledged</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="signature-comment">Comment</label>
                  <textarea
                    id="signature-comment"
                    rows={3}
                    value={signatureComment}
                    onChange={event => setSignatureComment(event.target.value)}
                    placeholder="Add signature rationale or review context"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="signature-password">Re-enter Password</label>
                  <input
                    id="signature-password"
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    required
                  />
                </div>

                <div className="detail-actions">
                  <button className="btn-primary" type="submit" disabled={submitting}>
                    {submitting ? 'Signing...' : 'Confirm Signature'}
                  </button>
                </div>
              </form>
            ) : null}

            {selectedTask.status === 'pending' ? (
              <form className="auth-form" onSubmit={reassignTask}>
                <h3>Reassign Task</h3>
                <div className="upload-grid">
                  <div className="form-field">
                    <label htmlFor="reassign-user">Assign To</label>
                    <select
                      id="reassign-user"
                      value={reassignToUserId}
                      onChange={event => setReassignToUserId(event.target.value)}
                    >
                      {!orgUsers.length ? <option value="">No users</option> : null}
                      {orgUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="reassign-reason">Reason (logged as comment)</label>
                    <input
                      id="reassign-reason"
                      value={reassignReason}
                      onChange={event => setReassignReason(event.target.value)}
                      placeholder="Handover reason"
                    />
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn-secondary" type="submit" disabled={reassignSubmitting || !reassignToUserId}>
                    {reassignSubmitting ? 'Reassigning...' : 'Reassign Task'}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={delegateSubmitting || !reassignToUserId}
                    onClick={delegateTask}
                  >
                    {delegateSubmitting ? 'Delegating...' : 'Delegate Task'}
                  </button>
                </div>
              </form>
            ) : null}

            <section>
              <h3>Task Comments</h3>
              <p className="panel-note">Thread visible to task owners and admins.</p>
              {commentsLoading ? <p className="panel-note">Loading comments...</p> : null}
              <ul className="simple-list">
                {taskComments.map(comment => (
                  <li key={comment.id}>
                    <div>
                      <strong>{comment.user_name || `User #${comment.user_id}`}</strong>
                      <div className="panel-note">{comment.user_role || '-'} · {formatDateTime(comment.created_at)}</div>
                      <div>{comment.comment_text}</div>
                    </div>
                  </li>
                ))}
                {!taskComments.length ? <li>No comments yet.</li> : null}
              </ul>

              <form className="auth-form" onSubmit={addComment}>
                <div className="form-field">
                  <label htmlFor="task-comment-text">Add Comment</label>
                  <textarea
                    id="task-comment-text"
                    rows={3}
                    value={commentText}
                    onChange={event => setCommentText(event.target.value)}
                    placeholder="Write task context, blockers, or decision notes"
                  />
                </div>
                <div className="detail-actions">
                  <button className="btn-secondary" type="submit" disabled={commentSubmitting}>
                    {commentSubmitting ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </section>

            <div className="detail-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setSelectedTaskId(null)
                  setPassword('')
                  setSignatureComment('')
                  setTaskComments([])
                }}
              >
                Close Task Panel
              </button>
              <span className="panel-note">Current user: {currentUser?.name || '-'} ({currentUser?.role || '-'})</span>
            </div>
          </section>
        ) : null}

        {manifest ? (
          <section className="panel span-4">
            <h3>Signature Manifest</h3>
            <ul className="simple-list detail-list">
              <li><span>ID</span><strong>{manifest.id}</strong></li>
              <li><span>Signer</span><strong>{manifest.signer_name || manifest.signer_email || '-'}</strong></li>
              <li><span>Meaning</span><strong>{manifest.signature_meaning}</strong></li>
              <li><span>Signed At</span><strong>{formatDateTime(manifest.signed_at)}</strong></li>
              <li><span>Doc Number</span><strong>{manifest.doc_number}</strong></li>
              <li><span>Hash</span><strong>{manifest.hash_snapshot}</strong></li>
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  )
}
