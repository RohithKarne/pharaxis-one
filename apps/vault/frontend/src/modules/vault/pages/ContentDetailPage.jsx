import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import VersionHistoryPanel from '../components/VersionHistoryPanel'
import MetadataPanel from '../components/MetadataPanel'
import {
  apiJson,
  authHeaders,
  getOrgToken,
  getOrgUser,
  lifecycleBadgeClass
} from '../../common/utils/session'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function rolesFromCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export default function ContentDetailPage() {
  const { id } = useParams()
  const token = getOrgToken()
  const user = getOrgUser()
  const [content, setContent] = useState(null)
  const [lockInfo, setLockInfo] = useState(null)
  const [allowedTransitions, setAllowedTransitions] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [versionFile, setVersionFile] = useState(null)
  const [submittingVersion, setSubmittingVersion] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  async function loadTransitions(contentDetail) {
    if (!contentDetail?.content_type_id) {
      setAllowedTransitions([])
      return
    }
    const rows = await apiJson(`/api/lifecycle/transitions/${contentDetail.content_type_id}`, {
      headers: authHeaders(token)
    })
    const next = rows.filter(row => {
      if (row.from_state !== contentDetail.lifecycle_state) return false
      const roles = rolesFromCsv(row.allowed_roles)
      return roles.includes(String(user.role || ''))
    })
    setAllowedTransitions(next)
  }

  async function loadDetail() {
    if (!token) {
      setError('Session not found. Please log in.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [detailPayload, lockPayload] = await Promise.all([
        apiJson(`/api/content/${id}`, { headers: authHeaders(token) }),
        apiJson(`/api/content/${id}/checkout`, { headers: authHeaders(token) })
      ])

      setContent(detailPayload)
      setLockInfo(lockPayload)
      await loadTransitions(detailPayload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id, token])

  async function postAction(path, method = 'POST', body = null) {
    setError('')
    try {
      await apiJson(path, {
        method,
        headers: body
          ? authHeaders(token, { 'Content-Type': 'application/json' })
          : authHeaders(token),
        body: body ? JSON.stringify(body) : undefined
      })
      await loadDetail()
      setRefreshTrigger(prev => prev + 1)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function runTransition(toState) {
    if (!window.confirm(`Move lifecycle state to "${toState}"?`)) return
    await postAction(`/api/content/${id}/transition`, 'POST', { toState })
  }

  async function uploadNewVersion(event) {
    event.preventDefault()
    if (!versionFile) {
      setError('Select a file to upload as next version.')
      return
    }
    setSubmittingVersion(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', versionFile)
      const response = await fetch(`/api/upload/${id}/version`, {
        method: 'POST',
        headers: authHeaders(token),
        body
      })
      const contentType = response.headers.get('content-type') || ''
      const payload = contentType.includes('application/json') ? await response.json() : null
      if (!response.ok) throw new Error(payload?.error || 'New version upload failed')
      setVersionFile(null)
      await loadDetail()
      setRefreshTrigger(prev => prev + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmittingVersion(false)
    }
  }

  if (loading) {
    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="brand-block">
            <h1 className="brand-title">Content Detail</h1>
            <p className="brand-subtitle">Loading document context...</p>
          </div>
        </header>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="app-shell">
        <header className="app-topbar">
          <div className="brand-block">
            <h1 className="brand-title">Content Detail</h1>
            <p className="brand-subtitle">Document not found.</p>
          </div>
        </header>
      </div>
    )
  }

  const lock = lockInfo?.lock
  const canCheckin =
    lock && (Number(lock.locked_by) === Number(user.id) || String(user.role) === 'admin')
  const isAdmin = String(user.role) === 'admin'
  const canVersionUpload =
    lock && Number(lock.locked_by) === Number(user.id) && ['admin', 'author'].includes(String(user.role))

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">{content.title}</h1>
          <p className="brand-subtitle">
            {content.doc_number} · Current Version {content.current_version?.version_number || '-'}
          </p>
        </div>
        <span className={lifecycleBadgeClass(content.lifecycle_state)}>{content.lifecycle_state}</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-8">
          <h3>Document Summary</h3>
          <ul className="simple-list detail-list">
            <li>
              <span>Document Number</span>
              <strong>{content.doc_number}</strong>
            </li>
            <li>
              <span>Type</span>
              <strong>{content.content_type_name || '-'}</strong>
            </li>
            <li>
              <span>Checked Out By</span>
              <strong>{lock ? lock.locked_by_name || `User #${lock.locked_by}` : 'Not checked out'}</strong>
            </li>
            <li>
              <span>Lock Since</span>
              <strong>{lock ? formatDateTime(lock.locked_at) : '-'}</strong>
            </li>
            <li>
              <span>Created At</span>
              <strong>{formatDateTime(content.created_at)}</strong>
            </li>
          </ul>

          <div className="detail-actions">
            <button className="btn-secondary" onClick={() => postAction(`/api/content/${id}/checkout`)}>
              Check Out
            </button>
            <button
              className="btn-secondary"
              onClick={() => postAction(`/api/content/${id}/checkin`)}
              disabled={!canCheckin}
            >
              Check In
            </button>
            <button
              className="btn-secondary"
              onClick={() => postAction(`/api/content/${id}/checkout/force`, 'DELETE')}
              disabled={!isAdmin}
            >
              Force Release
            </button>
            <Link className="btn-secondary link-button" to={`/vault/content/${id}/viewer`}>
              View Document
            </Link>
            <Link className="btn-secondary link-button" to="/vault">
              Back to Vault
            </Link>
          </div>

          <div className="detail-actions lifecycle-actions">
            {allowedTransitions.map(transition => (
              <button
                key={transition.id}
                className="btn-secondary"
                onClick={() => runTransition(transition.to_state)}
              >
                Move to {transition.to_state}
              </button>
            ))}
            {!allowedTransitions.length ? (
              <span className="panel-note">No lifecycle transitions available for your role.</span>
            ) : null}
          </div>

          <form className="auth-form upload-version-form" onSubmit={uploadNewVersion}>
            <div className="form-field">
              <label htmlFor="version-file">Upload New Major Version</label>
              <input
                id="version-file"
                type="file"
                onChange={event => setVersionFile(event.target.files?.[0] || null)}
                disabled={!canVersionUpload}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={submittingVersion || !canVersionUpload}>
              {submittingVersion ? 'Uploading...' : 'Upload New Version'}
            </button>
            {!canVersionUpload ? (
              <p className="panel-note">Check out the document as admin/author before uploading a new version.</p>
            ) : null}
          </form>

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
        </section>

        <section className="span-4">
          <VersionHistoryPanel contentId={id} token={token} refreshTrigger={refreshTrigger} />
        </section>

        <section className="span-12">
          <MetadataPanel contentId={id} userRole={user.role} />
        </section>
      </main>
    </div>
  )
}
