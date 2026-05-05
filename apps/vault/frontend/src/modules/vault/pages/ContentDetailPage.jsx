import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import VersionHistoryPanel from '../components/VersionHistoryPanel'
import MetadataPanel from '../components/MetadataPanel'
import VaultRecordHeader from '../components/VaultRecordHeader'
import VaultSectionNav from '../components/VaultSectionNav'
import {
  apiJson,
  authHeaders,
  getOrgToken,
  getOrgUser
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

function relationshipLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function distributionStatusClass(status) {
  if (status === 'sent') return 'status-chip success'
  if (status === 'failed') return 'status-chip danger'
  if (status === 'withdrawn') return 'status-chip warning'
  return 'status-chip info'
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
  const [workflowTimeline, setWorkflowTimeline] = useState([])
  const [relationshipData, setRelationshipData] = useState({ outbound: [], inbound: [] })
  const [distributionData, setDistributionData] = useState({ channels: [], events: [] })
  const [externalShares, setExternalShares] = useState([])
  const [trainingAssignments, setTrainingAssignments] = useState([])
  const [contentOptions, setContentOptions] = useState([])
  const [compareLeftId, setCompareLeftId] = useState('')
  const [compareRightId, setCompareRightId] = useState('')
  const [startingWorkflow, setStartingWorkflow] = useState(false)
  const [startingTemplateWorkflow, setStartingTemplateWorkflow] = useState(false)
  const [addingRelationship, setAddingRelationship] = useState(false)
  const [distributionBusyId, setDistributionBusyId] = useState('')
  const [creatingShare, setCreatingShare] = useState(false)
  const [assigningTraining, setAssigningTraining] = useState(false)
  const [compareResult, setCompareResult] = useState(null)
  const [comparingVersions, setComparingVersions] = useState(false)
  const [lastCreatedShare, setLastCreatedShare] = useState(null)
  const [workflowForm, setWorkflowForm] = useState({
    assignee_user_id: '',
    task_type: 'approval',
    due_at: ''
  })
  const [relationshipForm, setRelationshipForm] = useState({
    target_content_id: '',
    relationship_type: 'related_to',
    notes: ''
  })
  const [shareForm, setShareForm] = useState({
    recipient_name: '',
    recipient_email: '',
    purpose: '',
    expires_in_days: '7',
    require_passcode: true
  })
  const [trainingForm, setTrainingForm] = useState({
    assignee_user_id: '',
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

      const [
        metadataResult,
        versionsResult,
        auditResult,
        timelineResult,
        relationshipResult,
        distributionResult,
        contentListResult,
        shareResult,
        trainingResult
      ] = await Promise.allSettled([
        apiJson(`/api/content/${id}/metadata`, { headers: authHeaders(token) }),
        apiJson(`/api/content/${id}/versions`, { headers: authHeaders(token) }),
        apiJson(`/api/audit?entity_type=vault_content&entity_id=${id}&limit=20`, { headers: authHeaders(token) }),
        apiJson(`/api/workflows/content/${id}/timeline`, { headers: authHeaders(token) }),
        apiJson(`/api/relationships/content/${id}`, { headers: authHeaders(token) }),
        apiJson(`/api/distribution/content/${id}`, { headers: authHeaders(token) }),
        apiJson('/api/content', { headers: authHeaders(token) }),
        apiJson(`/api/external-shares/content/${id}`, { headers: authHeaders(token) }),
        apiJson(`/api/training/content/${id}`, { headers: authHeaders(token) })
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
      if (timelineResult.status === 'fulfilled') {
        setWorkflowTimeline(Array.isArray(timelineResult.value) ? timelineResult.value : [])
      } else {
        setWorkflowTimeline([])
      }
      if (relationshipResult.status === 'fulfilled') {
        setRelationshipData({
          outbound: relationshipResult.value?.outbound || [],
          inbound: relationshipResult.value?.inbound || []
        })
      } else {
        setRelationshipData({ outbound: [], inbound: [] })
      }
      if (distributionResult.status === 'fulfilled') {
        setDistributionData({
          channels: distributionResult.value?.channels || [],
          events: distributionResult.value?.events || []
        })
      } else {
        setDistributionData({ channels: [], events: [] })
      }
      if (contentListResult.status === 'fulfilled') {
        const options = (contentListResult.value || []).filter(row => String(row.id) !== String(id))
        setContentOptions(options)
        if (!relationshipForm.target_content_id && options.length) {
          setRelationshipForm(prev => ({ ...prev, target_content_id: String(options[0].id) }))
        }
      }
      if (shareResult.status === 'fulfilled') {
        setExternalShares(Array.isArray(shareResult.value) ? shareResult.value : [])
      } else {
        setExternalShares([])
      }
      if (trainingResult.status === 'fulfilled') {
        setTrainingAssignments(Array.isArray(trainingResult.value) ? trainingResult.value : [])
      } else {
        setTrainingAssignments([])
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
        if (!trainingForm.assignee_user_id && users.length) {
          setTrainingForm(prev => ({ ...prev, assignee_user_id: String(users[0].id) }))
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

  async function createRelationship(event) {
    event.preventDefault()
    if (!relationshipForm.target_content_id) {
      setError('Choose a target document before creating a relationship.')
      return
    }

    setAddingRelationship(true)
    setError('')
    try {
      await apiJson('/api/relationships', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          source_content_id: Number(id),
          target_content_id: Number(relationshipForm.target_content_id),
          relationship_type: relationshipForm.relationship_type,
          notes: relationshipForm.notes.trim() || null
        })
      })
      setRelationshipForm(prev => ({ ...prev, notes: '' }))
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAddingRelationship(false)
    }
  }

  async function deleteRelationship(relationshipId) {
    if (!window.confirm('Remove this document relationship?')) return
    setError('')
    try {
      await apiJson(`/api/relationships/${relationshipId}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function pushDistribution(channelId) {
    setDistributionBusyId(`push-${channelId}`)
    setError('')
    try {
      await apiJson(`/api/distribution/content/${id}/push`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content_channel_id: channelId })
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDistributionBusyId('')
    }
  }

  async function retryDistribution(eventId) {
    setDistributionBusyId(`retry-${eventId}`)
    setError('')
    try {
      await apiJson(`/api/distribution/events/${eventId}/retry`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDistributionBusyId('')
    }
  }

  async function withdrawDistribution(eventId) {
    if (!window.confirm('Withdraw this document from the selected channel?')) return
    setDistributionBusyId(`withdraw-${eventId}`)
    setError('')
    try {
      await apiJson(`/api/distribution/events/${eventId}/withdraw`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDistributionBusyId('')
    }
  }

  async function createExternalShare(event) {
    event.preventDefault()
    if (!shareForm.recipient_email.trim()) {
      setError('Recipient email is required for controlled sharing.')
      return
    }
    setCreatingShare(true)
    setError('')
    try {
      const payload = await apiJson(`/api/external-shares/content/${id}`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...shareForm,
          expires_in_days: Number(shareForm.expires_in_days || 7)
        })
      })
      await navigator.clipboard?.writeText(payload.share_url)
      setLastCreatedShare(payload)
      setShareForm({ recipient_name: '', recipient_email: '', purpose: '', expires_in_days: '7', require_passcode: true })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setCreatingShare(false)
    }
  }

  async function revokeExternalShare(shareId) {
    if (!window.confirm('Revoke this controlled share link?')) return
    setError('')
    try {
      await apiJson(`/api/external-shares/${shareId}/revoke`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function assignTraining(event) {
    event.preventDefault()
    if (!trainingForm.assignee_user_id) {
      setError('Choose a user before assigning read-and-understood.')
      return
    }
    setAssigningTraining(true)
    setError('')
    try {
      await apiJson(`/api/training/content/${id}/assign`, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          assignee_user_ids: [Number(trainingForm.assignee_user_id)],
          due_at: trainingForm.due_at || null
        })
      })
      setTrainingForm(prev => ({ ...prev, due_at: '' }))
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setAssigningTraining(false)
    }
  }

  async function remindTraining(assignmentId) {
    setError('')
    try {
      await apiJson(`/api/training/assignments/${assignmentId}/remind`, {
        method: 'POST',
        headers: authHeaders(token)
      })
      await loadDetail()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function openTrainingCertificate(assignmentId) {
    setError('')
    try {
      const certificate = await apiJson(`/api/training/assignments/${assignmentId}/certificate`, {
        headers: authHeaders(token)
      })
      window.alert(`Certificate ${certificate.certificate_id}\n${certificate.document.doc_number} - ${certificate.document.title}\nCompleted: ${formatDateTime(certificate.completed_at)}\nHash: ${certificate.completion_hash}`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function runDeepCompare() {
    if (!compareLeftId || !compareRightId) {
      setError('Choose two versions before running comparison.')
      return
    }
    setComparingVersions(true)
    setError('')
    try {
      const payload = await apiJson(`/api/compare/content/${id}?left_version_id=${compareLeftId}&right_version_id=${compareRightId}`, {
        headers: authHeaders(token)
      })
      setCompareResult(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setComparingVersions(false)
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
  const canManageRelationships = ['admin', 'author'].includes(String(user.role))
  const canPushDistribution = ['admin', 'author'].includes(String(user.role))
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
  const sectionGroups = [
    {
      title: 'Document Control',
      items: [
        { label: 'Summary', href: '#summary' },
        { label: 'Metadata', href: '#metadata' },
        { label: 'Versions', href: '#versions', count: versions.length },
        { label: 'Governance Checks', href: '#governance', count: missingGovernanceCount }
      ]
    },
    {
      title: 'Workflows & Evidence',
      items: [
        { label: 'Workflow Launch', href: '#workflow' },
        { label: 'Timeline', href: '#timeline', count: workflowTimeline.length },
        { label: 'Training', href: '#training', count: trainingAssignments.length },
        { label: 'Audit Trail', href: '#audit', count: auditEntries.length }
      ]
    },
    {
      title: 'Related Processes',
      items: [
        { label: 'Relationships', href: '#relationships', count: relationshipData.outbound.length + relationshipData.inbound.length },
        { label: 'Distribution', href: '#distribution', count: distributionData.events.length },
        { label: 'External Shares', href: '#shares', count: externalShares.length },
        { label: 'Compare Versions', href: '#compare' }
      ]
    }
  ]

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultRecordHeader
          eyebrow="Library / Document Record"
          title={content.title}
          subtitle={`${content.doc_number} · Current Version ${content.current_version?.version_number || '-'}`}
          lifecycleState={content.lifecycle_state}
          metadata={[
            { label: 'Type', value: content.content_type_name || '-' },
            { label: 'Checked Out By', value: lock ? lock.locked_by_name || `User #${lock.locked_by}` : 'Not checked out' },
            { label: 'Created', value: formatDateTime(content.created_at) },
            { label: 'Missing Governance', value: missingGovernanceCount }
          ]}
          actions={[
            { label: 'View Document', icon: 'view', to: `/vault/content/${id}/viewer` },
            { label: 'Sign-off Certificate', icon: 'certificate', to: `/vault/content/${id}/signoff` },
            { label: 'Back to Vault', icon: 'back', to: '/vault' }
          ]}
        />

        <section className="span-3">
          <VaultSectionNav sections={sectionGroups} />
        </section>

        <section className="panel span-6" id="summary">
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
            <Link className="btn-secondary link-button" to={`/vault/content/${id}/signoff`}>
              Sign-off Certificate
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
            <div id="workflow">
              <form className="auth-form upload-version-form" onSubmit={startWorkflow}>
                <h3>Launch Ad Hoc Workflow</h3>
                <p className="panel-note">Use this when you want to send the current document directly into review, approval, or signature.</p>
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
                    {startingWorkflow ? 'Starting...' : 'Launch Workflow'}
                  </button>
                  <Link className="btn-secondary link-button" to="/vault/tasks">
                    Open Task Inbox
                  </Link>
                </div>
              </form>

              <form className="auth-form upload-version-form" onSubmit={startFromTemplate}>
                <h3>Launch Template Workflow</h3>
                <p className="panel-note">Use a predefined workflow when the document should follow your standard approval chain.</p>
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
                    {startingTemplateWorkflow ? 'Starting...' : 'Launch Template Workflow'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="panel-note-card">
              Only admins and authors can launch workflows from this document. Reviewers and approvers should use the task inbox.
            </div>
          )}

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
        </section>

        <section className="span-3" id="versions">
          <VersionHistoryPanel contentId={id} token={token} refreshTrigger={refreshTrigger} />
        </section>

        <section className="span-12" id="metadata">
          <MetadataPanel contentId={id} userRole={user.role} />
        </section>

        <section className="panel span-6" id="relationships">
          <h3>Document Relationships</h3>
          <p className="panel-note">Link superseded, related, parent, child, and supporting documents so reviewers can trace context quickly.</p>

          {canManageRelationships ? (
            <form className="auth-form upload-version-form" onSubmit={createRelationship}>
              <div className="upload-grid">
                <div className="form-field">
                  <label htmlFor="relationship-target">Target Document</label>
                  <select
                    id="relationship-target"
                    value={relationshipForm.target_content_id}
                    onChange={event => setRelationshipForm({ ...relationshipForm, target_content_id: event.target.value })}
                    required
                  >
                    {!contentOptions.length ? <option value="">No other documents found</option> : null}
                    {contentOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.doc_number} · {option.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="relationship-type">Relationship</label>
                  <select
                    id="relationship-type"
                    value={relationshipForm.relationship_type}
                    onChange={event => setRelationshipForm({ ...relationshipForm, relationship_type: event.target.value })}
                  >
                    <option value="supersedes">Supersedes</option>
                    <option value="superseded_by">Superseded By</option>
                    <option value="related_to">Related To</option>
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="supporting">Supporting</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="relationship-notes">Notes</label>
                <input
                  id="relationship-notes"
                  value={relationshipForm.notes}
                  onChange={event => setRelationshipForm({ ...relationshipForm, notes: event.target.value })}
                  placeholder="Optional relationship note"
                />
              </div>
              <button className="btn-secondary" type="submit" disabled={addingRelationship || !contentOptions.length}>
                {addingRelationship ? 'Linking...' : 'Add Relationship'}
              </button>
            </form>
          ) : null}

          <ul className="simple-list">
            {relationshipData.outbound.map(row => (
              <li key={`out-${row.id}`}>
                <div className="config-link-copy">
                  <strong>{relationshipLabel(row.relationship_type)}: {row.target_doc_number}</strong>
                  <span>{row.target_title} · {row.notes || 'No note'}</span>
                </div>
                <div className="detail-actions">
                  <Link className="btn-secondary link-button" to={`/vault/content/${row.target_content_id}`}>
                    Open
                  </Link>
                  {canManageRelationships ? (
                    <button className="btn-secondary" type="button" onClick={() => deleteRelationship(row.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {relationshipData.inbound.map(row => (
              <li key={`in-${row.id}`}>
                <div className="config-link-copy">
                  <strong>Referenced by {row.source_doc_number}</strong>
                  <span>{relationshipLabel(row.relationship_type)} · {row.source_title}</span>
                </div>
                <Link className="btn-secondary link-button" to={`/vault/content/${row.source_content_id}`}>
                  Open
                </Link>
              </li>
            ))}
            {!relationshipData.outbound.length && !relationshipData.inbound.length ? (
              <li>No document relationships recorded yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6" id="distribution">
          <h3>Channel Distribution</h3>
          <p className="panel-note">Operational view of where this document has been published, retried, or withdrawn.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Channel Status</th>
                  <th>Last Result</th>
                  <th>Last Push</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {distributionData.channels.map(channel => (
                  <tr key={channel.id}>
                    <td>{channel.app_name}</td>
                    <td>{channel.channel_status}</td>
                    <td>
                      {channel.last_status ? (
                        <span className={distributionStatusClass(channel.last_status)}>{channel.last_status}</span>
                      ) : '-'}
                    </td>
                    <td>{formatDateTime(channel.last_pushed_at)}</td>
                    <td>
                      <div className="detail-actions">
                        {canPushDistribution ? (
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={distributionBusyId === `push-${channel.id}` || channel.channel_status !== 'active'}
                            onClick={() => pushDistribution(channel.id)}
                          >
                            Push
                          </button>
                        ) : null}
                        {channel.last_event_id && canPushDistribution ? (
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={distributionBusyId === `retry-${channel.last_event_id}`}
                            onClick={() => retryDistribution(channel.last_event_id)}
                          >
                            Retry
                          </button>
                        ) : null}
                        {channel.last_event_id && isAdmin ? (
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={distributionBusyId === `withdraw-${channel.last_event_id}`}
                            onClick={() => withdrawDistribution(channel.last_event_id)}
                          >
                            Withdraw
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!distributionData.channels.length ? (
                  <tr>
                    <td colSpan={5} className="users-empty">No content channels configured. Admins can add channels from Platform.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6" id="shares">
          <h3>External Controlled Sharing</h3>
          <p className="panel-note">Create tracked, expiring links for HCPs, regulators, or partner reviewers. Opens are logged for audit follow-up.</p>
          {canManageRelationships ? (
            <form className="auth-form upload-version-form" onSubmit={createExternalShare}>
              <div className="upload-grid">
                <div className="form-field">
                  <label htmlFor="share-recipient-name">Recipient Name</label>
                  <input
                    id="share-recipient-name"
                    value={shareForm.recipient_name}
                    onChange={event => setShareForm({ ...shareForm, recipient_name: event.target.value })}
                    placeholder="External recipient"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="share-recipient-email">Recipient Email</label>
                  <input
                    id="share-recipient-email"
                    type="email"
                    value={shareForm.recipient_email}
                    onChange={event => setShareForm({ ...shareForm, recipient_email: event.target.value })}
                    placeholder="recipient@example.com"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="share-expiry">Expires In Days</label>
                  <input
                    id="share-expiry"
                    type="number"
                    min="1"
                    max="90"
                    value={shareForm.expires_in_days}
                    onChange={event => setShareForm({ ...shareForm, expires_in_days: event.target.value })}
                  />
                </div>
              </div>
              <label className="inline-toggle">
                <input
                  type="checkbox"
                  checked={shareForm.require_passcode}
                  onChange={event => setShareForm({ ...shareForm, require_passcode: event.target.checked })}
                />
                <span>Require passcode before download</span>
              </label>
              <div className="form-field">
                <label htmlFor="share-purpose">Purpose</label>
                <input
                  id="share-purpose"
                  value={shareForm.purpose}
                  onChange={event => setShareForm({ ...shareForm, purpose: event.target.value })}
                  placeholder="Regulatory clarification, HCP review, partner approval"
                />
              </div>
              <button className="btn-secondary" type="submit" disabled={creatingShare}>
                {creatingShare ? 'Creating...' : 'Create Controlled Link'}
              </button>
            </form>
          ) : null}

          {lastCreatedShare ? (
            <div className="panel-note-card">
              <strong>Controlled link created</strong>
              <p>Delivery: {lastCreatedShare.email_delivery_status}{lastCreatedShare.email_delivery_error ? ` · ${lastCreatedShare.email_delivery_error}` : ''}</p>
              <p>Link copied to clipboard: {lastCreatedShare.share_url}</p>
              {lastCreatedShare.passcode ? <p>Passcode: {lastCreatedShare.passcode}</p> : null}
            </div>
          ) : null}

          <ul className="simple-list">
            {externalShares.map(share => (
              <li key={share.id}>
                <div className="config-link-copy">
                  <strong>{share.recipient_email}</strong>
                  <span>{share.status} · expires {formatDateTime(share.expires_at)} · opened {share.opened_count || 0} · downloaded {share.download_count || 0} · email {share.email_delivery_status}</span>
                </div>
                {share.status === 'active' && canManageRelationships ? (
                  <button className="btn-secondary" type="button" onClick={() => revokeExternalShare(share.id)}>
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
            {!externalShares.length ? <li>No controlled share links created yet.</li> : null}
          </ul>
        </section>

        <section className="panel span-6" id="training">
          <h3>Read & Understood Assignments</h3>
          <p className="panel-note">Assign controlled documents to users and track read-confirm completion for SOP and policy training evidence.</p>
          {canManageRelationships ? (
            <form className="auth-form upload-version-form" onSubmit={assignTraining}>
              <div className="upload-grid">
                <div className="form-field">
                  <label htmlFor="training-assignee">Assignee</label>
                  <select
                    id="training-assignee"
                    value={trainingForm.assignee_user_id}
                    onChange={event => setTrainingForm({ ...trainingForm, assignee_user_id: event.target.value })}
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
                  <label htmlFor="training-due-at">Due At</label>
                  <input
                    id="training-due-at"
                    type="datetime-local"
                    value={trainingForm.due_at}
                    onChange={event => setTrainingForm({ ...trainingForm, due_at: event.target.value })}
                  />
                </div>
              </div>
              <button className="btn-secondary" type="submit" disabled={assigningTraining || !workflowUsers.length}>
                {assigningTraining ? 'Assigning...' : 'Assign Read & Understood'}
              </button>
            </form>
          ) : null}

          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Completed</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {trainingAssignments.map(item => (
                  <tr key={item.id}>
                    <td>{item.assignee_name}</td>
                    <td><span className={item.status === 'completed' ? 'status-chip success' : 'status-chip pending'}>{item.status}</span></td>
                    <td>{formatDateTime(item.due_at)}</td>
                    <td>{formatDateTime(item.completed_at)}</td>
                    <td>
                      <div className="detail-actions">
                        {item.status === 'pending' && canManageRelationships ? (
                          <button className="btn-secondary" type="button" onClick={() => remindTraining(item.id)}>
                            Remind
                          </button>
                        ) : null}
                        {item.status === 'completed' ? (
                          <button className="btn-secondary" type="button" onClick={() => openTrainingCertificate(item.id)}>
                            Certificate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {!trainingAssignments.length ? (
                  <tr>
                    <td colSpan={5} className="users-empty">No read-and-understood assignments yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-12" id="governance">
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

        <section className="panel span-6" id="compare">
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
          <div className="detail-actions">
            <button className="btn-secondary" type="button" onClick={runDeepCompare} disabled={comparingVersions || !versions.length}>
              {comparingVersions ? 'Comparing...' : 'Run Document Compare'}
            </button>
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
          {compareResult ? (
            <div className="panel-note-card">
              <strong>{compareResult.mode === 'text' ? 'Text comparison' : 'Metadata comparison'} complete.</strong>
              <p>{compareResult.text_diff?.length || 0} changed lines found. PDF and binary files show metadata comparison until full file text extraction is enabled.</p>
              {compareResult.text_diff?.length ? (
                <div className="users-table-wrap">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Left</th>
                        <th>Right</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.text_diff.slice(0, 10).map(item => (
                        <tr key={item.line}>
                          <td>{item.line}</td>
                          <td>{item.left || '-'}</td>
                          <td>{item.right || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="panel span-6" id="timeline">
          <h3>Workflow Timeline</h3>
          <p className="panel-note">One place to follow task launches, comments, signatures, and reminder events for this document.</p>
          <div className="timeline-list">
            {workflowTimeline.map(entry => (
              <article className="timeline-entry" key={`${entry.type}-${entry.id}`}>
                <div className="timeline-meta">
                  <strong>{entry.title}</strong>
                  <span>{formatDateTime(entry.happened_at)}</span>
                </div>
                <p>{entry.summary}</p>
                <div className="detail-actions">
                  <span className={entry.status === 'read' || entry.status === 'completed' ? 'status-chip success' : 'status-chip info'}>
                    {entry.type}
                  </span>
                  {entry.status ? (
                    <span className={entry.status === 'unread' || entry.status === 'pending' ? 'status-chip pending' : 'status-chip success'}>
                      {entry.status}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
            {!workflowTimeline.length ? (
              <p className="panel-note">No workflow activity recorded for this document yet.</p>
            ) : null}
          </div>
        </section>

        <section className="panel span-6" id="audit">
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
