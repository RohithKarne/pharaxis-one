import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, lifecycleBadgeClass } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function SignOffCertificatePage() {
  const { id } = useParams()
  const token = getOrgToken()
  const [content, setContent] = useState(null)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadCertificate() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [contentDetail, signoffRows] = await Promise.all([
        apiJson(`/api/content/${id}`, { headers: authHeaders(token) }),
        apiJson(`/api/signoff/content/${id}`, { headers: authHeaders(token) })
      ])
      setContent(contentDetail)
      setRecords(Array.isArray(signoffRows) ? signoffRows : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCertificate()
  }, [id])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Compliance / Sign-off"
          title="Sign-off Certificate"
          note="Immutable sign-off record - read only. Cannot be edited or deleted."
          statusLabel="Read Only"
          secondaryNode={
            content ? (
              <span className={lifecycleBadgeClass(content.lifecycle_state)}>
                {content.lifecycle_state}
              </span>
            ) : null
          }
        />

        {loading ? (
          <section className="panel span-12">
            <p className="panel-note">Loading certificate...</p>
          </section>
        ) : null}

        {error ? (
          <section className="panel span-12">
            <div className="auth-error">{error}</div>
          </section>
        ) : null}

        {!loading && content ? (
          <section className="panel span-12">
            <ul className="simple-list detail-list">
              <li><span>Document Number</span><strong>{content.doc_number}</strong></li>
              <li><span>Title</span><strong>{content.title}</strong></li>
              <li><span>Lifecycle State</span><strong>{content.lifecycle_state}</strong></li>
            </ul>
          </section>
        ) : null}

        {!loading ? (
          <section className="panel span-12">
            <div className="folder-header">
              <div>
                <h3>Sign-off Records</h3>
                <p className="panel-note">{records.length} record{records.length !== 1 ? 's' : ''} — ordered by signature date</p>
              </div>
              <div className="detail-actions">
                <button className="btn-secondary" type="button" onClick={() => window.print()}>
                  Print Certificate
                </button>
                <Link className="btn-secondary link-button" to={`/vault/content/${id}`}>
                  Back to Document
                </Link>
              </div>
            </div>

            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Signer</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Comment</th>
                    <th>Version</th>
                    <th>Timestamp</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td>
                        <strong>{row.signer_name}</strong>
                        <div className="panel-note">{row.signer_email}</div>
                      </td>
                      <td>{row.signer_role}</td>
                      <td>
                        <span className={
                          row.signature_meaning === 'approved' ? 'status-chip success'
                          : row.signature_meaning === 'rejected' ? 'status-chip danger'
                          : 'status-chip info'
                        }>
                          {row.signature_meaning}
                        </span>
                      </td>
                      <td>{row.signature_comment || '-'}</td>
                      <td>{row.version_number || '-'}</td>
                      <td>{formatDateTime(row.signed_at)}</td>
                      <td>{row.ip_address || '-'}</td>
                    </tr>
                  ))}
                  {!records.length ? (
                    <tr>
                      <td colSpan={8} className="users-empty">
                        No sign-off records found for this document. Sign-offs are recorded when workflow tasks are completed.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
