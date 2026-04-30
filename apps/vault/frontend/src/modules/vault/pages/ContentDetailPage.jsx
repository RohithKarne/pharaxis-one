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
  const [workflowUsers, setWorkflowUsers] = useState([])
  const [workflowTemplates, setWorkflowTemplates] = useState([])
  const [metadata, setMetadata] = useState(null)
  const [versions, setVersions] = useState([])
  const [auditEntries, setAuditEntries] = useState([])
  const [compareLeftId, setCompareLeftId] = useState('')
  const [compareRightId, setCompareRightId] = useState('')
  const [startingWorkflow, setStartingWorkflow] = useState(false)
  const [startingTemplateWorkflow, setStartingTemplateWorkflow] = useState(false)
  const [workflowForm, setWorkflowForm] = useState({
    assignee_user_id: '',
    task_type: 'approval',
    due_at: ''
  })
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

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

      const [metadataResult, versionsResult, auditResult] = await Promise.allSettled([
        apiJson(`/api/content/${id}/metadata`, { headers: authHeaders(token) }),
        apiJson(`/api/content/${id}/versions`, { headers: authHeaders(token) }),
        apiJson(`/api/audit?entity_type=vault_content&entity_id=${id}&limit=20`, { headers: authHeaders(token) })
      ])

      if (metadataResult.status === 'fulfilled') {
        setMetadata(metadataResult.value || null)
      }
      if (versionsResult.status === 'fulfilled') {
        const versionRows = versionsResult.value || []
        setVersions(versionRows)
        if (versionRows.length >= 2) {
          setCompareLeftId(String(versionRows[0].id))
          setCompareRightId(String(versionRows[1].id))
        } else if (versionRows.length === 1) {
          setCompareLeftId(String(versionRows[0].id))
          setCompareRightId(String(versionRows[0].id))
        }
      }
      if (auditResult.status === 'fulfilled') {
        setAuditEntries(auditResult.value?.results || [])
      } else {
        setAuditEntries([])
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id, token])

  useEffect(() => {
    if (!token || !['admin', 'author'].includes(String(user.role || ''))) return
    Promise.all([
      apiJson('/api/users', { headers: authHeaders(token) }),
      apiJson('/api/workflows/templates', { headers: authHeaders(token) })
    ])
      .then(([users, templates]) => {
        setWorkflowUsers(users)
        setWorkflowTemplates(templates)
        if (!workflowForm.assignee_user_id && users.length) {
          setWorkflowForm(prev => ({ ...prev, assignee_user_id: String(users[0].id) }))
        }
        if (!selectedTemplateId && templates.length) {
          setSelectedTemplateId(String(templates[0].id))
        }
      })
      .catch(() => {
        // Fail silently: workflow forms will still allow manual refresh later.
      })
  }, [token, user.role])

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

  async function startWorkflow(event) {
    event.preventDefault()
    if (!workflowForm.assignee_user_id) {
      setError('Choose an assignee before starting workflow.')
      return
    }

    setStartingWorkflow(true)
    setError('')
    try {
      await apiJson('/api/workflows/start', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content_id: Number(id),
          assignee_user_id: Number(workflowForm.assignee_user_id),
          task_type: workflowForm.task_type,
          due_at: workflowForm.due_at || null
        })
      })
      await loadDetail()
      setRefreshTrigger(prev => prev + 1)
      setWorkflowForm(prev => ({ ...prev, due_at: '' }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setStartingWorkflow(false)
    }
  }

  async function startFromTemplate(event) {
    event.preventDefault()
    if (!selectedTemplateId) {
      setError('Choose a workflow template first.')
      return
    }

    setStartingTemplateWorkflow(true)
    setError('')
    try {
      await apiJson(`/api/workflows/templates/${selectedTemplateId}/start`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          content_id: Number(id)
        })
      })
      await loadDetail()
      setRefreshTrigger(prev => prev + 1)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setStartingTemplateWorkflow(false)
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
  const canStartWorkflow = ['admin', 'author'].includes(String(user.role))
  const compareLeft = versions.find(version => String(version.id) === String(compareLeftId)) || null
  const compareRight = versions.find(version => String(version.id) === String(compareRightId)) || null
  const governanceChecks = [
    {
      key: 'description',
      label: 'Description',
      ok: Boolean(metadata?.description)
    },
    {
      key: 'audience',
      label: 'Audience',
      ok: Boolean(metadata?.audience)
    },
    {
      key: 'confidentiality',
      label: 'Confidentiality',
      ok: Boolean(metadata?.confidentiality)
    },
    {
      key: 'effective_date',
      label: 'Effective Date',
      ok: Boolean(metadata?.effective_date)
    },
    {
      key: 'expiry_date',
      label: 'Expiry Date',
      ok: Boolean(metadata?.expiry_date)
    },
    {
      key: 'keywords',
      label: 'Keywords',
      ok: Boolean(metadata?.keywords)
    }
  ]
  const missingGovernanceCount = governanceChecks.filter(item => !item.ok).length

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Overview / Content Detail</p>
            <h2 className="workspace-hero-title">{content.title}</h2>
            <p className="panel-note">
              {content.doc_number} · Current Version {content.current_version?.version_number || '-'}
            </p>
          </div>
          <div className="workspace-hero-right">
            <span className={lifecycleBadgeClass(content.lifecycle_state)}>{content.lifecycle_state}</span>
          </div>
        </section>
      </main>

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

          {canStartWorkflow ? (
            <>
              <form className="auth-form upload-version-form" onSubmit={startWorkflow}>
                <h3>Start Workflow Task</h3>
                <div className="upload-grid">
                  <div className="form-field">
                    <label htmlFor="workflow-assignee">Assignee</label>
                    <select
                      id="workflow-assignee"
                      value={workflowForm.assignee_user_id}
                      onChange={event => setWorkflowForm({ ...workflowForm, assignee_user_id: event.target.value })}
                      required
                    >
                      {!workflowUsers.length ? <option value="">No users found</option> : null}
                      {workflowUsers.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} ({entry.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="workflow-type">Task Type</label>
                    <select
                      id="workflow-type"
                      value={workflowForm.task_type}
                      onChange={event => setWorkflowForm({ ...workflowForm, task_type: event.target.value })}
                    >
                      <option value="approval">Approval</option>
                      <option value="review">Review</option>
                      <option value="signature">Signature</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="workflow-due-at">Due At</label>
                    <input
                      id="workflow-due-at"
                      type="datetime-local"
                      value={workflowForm.due_at}
                      onChange={event => setWorkflowForm({ ...workflowForm, due_at: event.target.value })}
                    />
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn-primary" type="submit" disabled={startingWorkflow || !workflowUsers.length}>
                    {startingWorkflow ? 'Starting...' : 'Start Workflow'}
                  </button>
                  <Link className="btn-secondary link-button" to="/vault/tasks">
                    Open My Tasks
                  </Link>
                </div>
              </form>

              <form className="auth-form upload-version-form" onSubmit={startFromTemplate}>
                <h3>Start from Template</h3>
                <div className="form-field">
                  <label htmlFor="workflow-template">Template</label>
                  <select
                    id="workflow-template"
                    value={selectedTemplateId}
                    onChange={event => setSelectedTemplateId(event.target.value)}
                    required
                  >
                    {!workflowTemplates.length ? <option value="">No templates configured</option> : null}
                    {workflowTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.steps?.length || 0} steps)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="detail-actions">
                  <button
                    className="btn-primary"
                    type="submit"
                    disabled={startingTemplateWorkflow || !workflowTemplates.length}
                  >
                    {startingTemplateWorkflow ? 'Starting...' : 'Start Template Workflow'}
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
        </section>

        <section className="span-4">
          <VersionHistoryPanel contentId={id} token={token} refreshTrigger={refreshTrigger} />
        </section>

        <section className="span-12">
          <MetadataPanel contentId={id} userRole={user.role} />
        </section>

        <section className="panel span-12">
          <h3>Governance Checks</h3>
          <p className="panel-note">Mandatory metadata and review readiness checks before final lifecycle transitions.</p>
          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Versions</span><strong>{versions.length}</strong></article>
            <article className="stat-card-mini"><span>Audit Events</span><strong>{auditEntries.length}</strong></article>
            <article className="stat-card-mini"><span>Missing Checks</span><strong>{missingGovernanceCount}</strong></article>
          </div>
          <ul className="simple-list">
            {governanceChecks.map(check => (
              <li key={check.key}>
                <span>{check.label}</span>
                <strong>{check.ok ? 'Complete' : 'Missing'}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h3>Version Compare</h3>
          <p className="panel-note">Side-by-side version snapshot for review and release control.</p>
          <div className="upload-grid">
            <div className="form-field">
              <label htmlFor="compare-left">Left Version</label>
              <select id="compare-left" value={compareLeftId} onChange={event => setCompareLeftId(event.target.value)}>
                {versions.map(version => (
                  <option key={version.id} value={version.id}>
                    {version.version_number} · {formatDateTime(version.uploaded_at)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="compare-right">Right Version</label>
              <select id="compare-right" value={compareRightId} onChange={event => setCompareRightId(event.target.value)}>
                {versions.map(version => (
                  <option key={version.id} value={version.id}>
                    {version.version_number} · {formatDateTime(version.uploaded_at)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Left</th>
                  <th>Right</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Version Number</td>
                  <td>{compareLeft?.version_number || '-'}</td>
                  <td>{compareRight?.version_number || '-'}</td>
                </tr>
                <tr>
                  <td>File Name</td>
                  <td>{compareLeft?.file_name || '-'}</td>
                  <td>{compareRight?.file_name || '-'}</td>
                </tr>
                <tr>
                  <td>File Size (KB)</td>
                  <td>{compareLeft?.file_size_kb || '-'}</td>
                  <td>{compareRight?.file_size_kb || '-'}</td>
                </tr>
                <tr>
                  <td>Uploaded At</td>
                  <td>{formatDateTime(compareLeft?.uploaded_at)}</td>
                  <td>{formatDateTime(compareRight?.uploaded_at)}</td>
                </tr>
                <tr>
                  <td>Uploaded By</td>
                  <td>{compareLeft?.uploaded_by_name || '-'}</td>
                  <td>{compareRight?.uploaded_by_name || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6">
          <h3>Compliance Timeline</h3>
          <p className="panel-note">Immutable audit sequence for this content entity.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map(item => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>{item.action}</td>
                    <td>{item.user_name || item.user_email || `#${item.user_id || '-'}`}</td>
                    <td>{item.notes || '-'}</td>
                  </tr>
                ))}
                {!auditEntries.length ? (
                  <tr>
                    <td colSpan={4} className="users-empty">No audit entries available for this content.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
