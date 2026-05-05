import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, lifecycleBadgeClass } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function TrainingAssignmentsPage() {
  const token = getOrgToken()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [completingId, setCompletingId] = useState('')

  async function loadAssignments() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await apiJson('/api/training/my', { headers: authHeaders(token) })
      setAssignments(Array.isArray(rows) ? rows : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssignments()
  }, [])

  async function completeAssignment(assignmentId) {
    setCompletingId(String(assignmentId))
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson(`/api/training/assignments/${assignmentId}/complete`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          acknowledgement_text: 'I have read and understood this controlled document.'
        })
      })
      setSuccess(`Read-and-understood assignment completed. Evidence hash: ${payload.completion_hash}`)
      await loadAssignments()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCompletingId('')
    }
  }

  async function showCertificate(assignmentId) {
    setError('')
    setSuccess('')
    try {
      const certificate = await apiJson(`/api/training/assignments/${assignmentId}/certificate`, {
        headers: authHeaders(token)
      })
      setSuccess(`Certificate ${certificate.certificate_id}: ${certificate.document.doc_number}, completed ${formatDate(certificate.completed_at)}, hash ${certificate.completion_hash}`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Workforce / Training"
          title="Read & Understood"
          note="Complete assigned SOP, policy, and controlled-document acknowledgements from one clear inbox."
          statusLabel={`${assignments.filter(item => item.status === 'pending').length} pending`}
        />

        {error ? <section className="panel span-12"><div className="auth-error">{error}</div></section> : null}
        {success ? <section className="panel span-12"><div className="panel-note-card">{success}</div></section> : null}

        <section className="panel span-12">
          <h3>My Assignments</h3>
          <p className="panel-note">Open the document first, then confirm only when you have read and understood it.</p>
          {loading ? <p className="panel-note">Loading assignments...</p> : null}
          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Title</th>
                    <th>Lifecycle</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Completed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(item => (
                    <tr key={item.id}>
                      <td>{item.doc_number}</td>
                      <td>{item.title}</td>
                      <td><span className={lifecycleBadgeClass(item.lifecycle_state)}>{item.lifecycle_state}</span></td>
                      <td><span className={item.status === 'completed' ? 'status-chip success' : 'status-chip pending'}>{item.status}</span></td>
                      <td>{formatDate(item.due_at)}</td>
                      <td>{formatDate(item.completed_at)}</td>
                      <td>
                        <div className="detail-actions">
                          <Link className="btn-secondary link-button" to={`/vault/content/${item.content_id}/viewer`}>
                            Read
                          </Link>
                          {item.status === 'pending' ? (
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={completingId === String(item.id)}
                              onClick={() => completeAssignment(item.id)}
                            >
                              Confirm
                            </button>
                          ) : null}
                          {item.status === 'completed' ? (
                            <button className="btn-secondary" type="button" onClick={() => showCertificate(item.id)}>
                              Certificate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!assignments.length ? (
                    <tr>
                      <td colSpan={7} className="users-empty">No read-and-understood assignments found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
