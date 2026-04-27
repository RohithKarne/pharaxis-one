import { useMemo, useState } from 'react'
import { api } from './api'

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function buildScopeParams(user, selectedTenantId) {
  const params = new URLSearchParams()
  if (user?.isSuperadmin && selectedTenantId) {
    params.set('tenantId', String(selectedTenantId))
  }
  return params
}

function scopeBody(user, selectedTenantId, body = {}) {
  if (user?.isSuperadmin && selectedTenantId) {
    return { ...body, tenantId: Number(selectedTenantId) }
  }
  return body
}

function Sprint2Panel({
  token,
  user,
  selectedTenantId,
  publications,
  users,
  selectedPublicationDetails,
  onRefresh,
  onReloadPublication,
  setError,
  setNotice
}) {
  const [ganttItems, setGanttItems] = useState([])
  const [compareForm, setCompareForm] = useState({ leftVersionId: '', rightVersionId: '' })
  const [compareResult, setCompareResult] = useState(null)
  const [comments, setComments] = useState([])
  const [commentForm, setCommentForm] = useState({ documentVersionId: '', pageNumber: 1, commentText: '' })
  const [templateForm, setTemplateForm] = useState({
    templateName: '',
    publicationType: 'journal_article',
    defaultTargetVenue: '',
    milestonesCsv: 'First Draft Due:7,Internal Review Deadline:21',
    checklistCsv: 'gpp_1:Objectives documented:true,gpp_2:Authorship reviewed:true',
    reviewerUserIdsCsv: ''
  })
  const [templates, setTemplates] = useState([])
  const [applyTemplateForm, setApplyTemplateForm] = useState({ templateId: '', publicationId: '' })
  const [conferenceForm, setConferenceForm] = useState({
    conferenceName: '',
    therapeuticArea: '',
    abstractDeadline: '',
    startDate: '',
    endDate: ''
  })
  const [conferences, setConferences] = useState([])
  const [linkConferenceForm, setLinkConferenceForm] = useState({ publicationId: '', conferenceId: '' })
  const [mimsQuery, setMimsQuery] = useState('')
  const [mimsResults, setMimsResults] = useState([])
  const [mimsLinkForm, setMimsLinkForm] = useState({ publicationId: '', mimsDrugId: '', mimsDrugName: '' })
  const [safetyForm, setSafetyForm] = useState({ publicationId: '', safetyRelated: false, safetyCaseReference: '' })
  const [bulkForm, setBulkForm] = useState({ publicationIdsCsv: '', status: 'planning', reviewerUserId: '' })
  const [importForm, setImportForm] = useState({
    csvText: 'title,publicationType,drugName,therapeuticArea,targetVenue\nImported A,journal_article,DrugA,Oncology,JournalX'
  })
  const [importPreview, setImportPreview] = useState(null)
  const [reportJson, setReportJson] = useState(null)

  const selectedPublicationId = selectedPublicationDetails?.publication?.id
  const scopeParams = useMemo(() => buildScopeParams(user, selectedTenantId), [user, selectedTenantId])
  const scopeSuffix = scopeParams.toString() ? `?${scopeParams.toString()}` : ''

  async function loadGantt() {
    setError('')
    try {
      const data = await api(`/api/sprint2/gantt${scopeSuffix}`, { token })
      setGanttItems(data.items || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function compareVersions(event) {
    event.preventDefault()
    if (!selectedPublicationId) return
    setError('')
    try {
      const data = await api(
        `/api/sprint2/publications/${selectedPublicationId}/documents/compare?leftVersionId=${compareForm.leftVersionId}&rightVersionId=${compareForm.rightVersionId}`,
        { token }
      )
      setCompareResult(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadComments() {
    if (!selectedPublicationId) return
    setError('')
    try {
      const data = await api(`/api/sprint2/publications/${selectedPublicationId}/comments`, { token })
      setComments(data.comments || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function addComment(event) {
    event.preventDefault()
    if (!selectedPublicationId) return
    setError('')
    try {
      await api(`/api/sprint2/publications/${selectedPublicationId}/comments`, {
        method: 'POST',
        token,
        body: {
          documentVersionId: Number(commentForm.documentVersionId),
          pageNumber: Number(commentForm.pageNumber || 1),
          commentText: commentForm.commentText
        }
      })
      setCommentForm({ documentVersionId: '', pageNumber: 1, commentText: '' })
      setNotice('Comment added')
      await loadComments()
    } catch (err) {
      setError(err.message)
    }
  }

  async function setCommentStatus(commentId, status) {
    setError('')
    try {
      await api(`/api/sprint2/comments/${commentId}`, {
        method: 'PATCH',
        token,
        body: { status }
      })
      setNotice(`Comment ${status}`)
      await loadComments()
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadTemplates() {
    setError('')
    try {
      const data = await api(`/api/sprint2/templates${scopeSuffix}`, { token })
      setTemplates(data.templates || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function createTemplate(event) {
    event.preventDefault()
    setError('')
    try {
      const milestones = templateForm.milestonesCsv
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [name, days] = item.split(':')
          return { milestoneName: String(name || '').trim(), dueOffsetDays: Number(days || 0) }
        })
      const checklistItems = templateForm.checklistCsv
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [key, text, required] = item.split(':')
          return {
            itemKey: String(key || '').trim(),
            itemText: String(text || '').trim(),
            isRequired: String(required || '').trim().toLowerCase() === 'true'
          }
        })
      const reviewerUserIds = templateForm.reviewerUserIdsCsv
        .split(',')
        .map((item) => toNumber(item.trim()))
        .filter((item) => Number.isFinite(item))

      await api('/api/sprint2/templates', {
        method: 'POST',
        token,
        body: scopeBody(user, selectedTenantId, {
          templateName: templateForm.templateName,
          publicationType: templateForm.publicationType,
          defaultTargetVenue: templateForm.defaultTargetVenue,
          milestones,
          checklistItems,
          reviewerUserIds
        })
      })
      setNotice('Template created')
      await loadTemplates()
    } catch (err) {
      setError(err.message)
    }
  }

  async function applyTemplate(event) {
    event.preventDefault()
    setError('')
    try {
      await api(
        `/api/sprint2/publications/${applyTemplateForm.publicationId}/templates/${applyTemplateForm.templateId}/apply`,
        {
          method: 'POST',
          token
        }
      )
      setNotice('Template applied')
      await onRefresh?.()
      if (selectedPublicationId && Number(selectedPublicationId) === Number(applyTemplateForm.publicationId)) {
        await onReloadPublication?.()
      }
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadConferences() {
    setError('')
    try {
      const data = await api(`/api/sprint2/conferences${scopeSuffix}`, { token })
      setConferences(data.conferences || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function createConference(event) {
    event.preventDefault()
    setError('')
    try {
      await api('/api/sprint2/conferences', {
        method: 'POST',
        token,
        body: scopeBody(user, selectedTenantId, conferenceForm)
      })
      setNotice('Conference created')
      await loadConferences()
    } catch (err) {
      setError(err.message)
    }
  }

  async function linkConference(event) {
    event.preventDefault()
    setError('')
    try {
      await api(
        `/api/sprint2/publications/${linkConferenceForm.publicationId}/conferences/${linkConferenceForm.conferenceId}/link`,
        {
          method: 'POST',
          token
        }
      )
      setNotice('Conference linked to publication')
    } catch (err) {
      setError(err.message)
    }
  }

  async function searchMims(event) {
    event.preventDefault()
    setError('')
    try {
      const data = await api(`/api/sprint2/mims/search${scopeSuffix ? `${scopeSuffix}&` : '?'}q=${encodeURIComponent(mimsQuery)}`, {
        token
      })
      setMimsResults(data.results || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function linkMims(event) {
    event.preventDefault()
    setError('')
    try {
      await api(`/api/sprint2/publications/${mimsLinkForm.publicationId}/mims-link`, {
        method: 'POST',
        token,
        body: {
          mimsDrugId: mimsLinkForm.mimsDrugId,
          mimsDrugName: mimsLinkForm.mimsDrugName
        }
      })
      setNotice('MIMS link saved')
      await onReloadPublication?.()
    } catch (err) {
      setError(err.message)
    }
  }

  async function updateSafety(event) {
    event.preventDefault()
    setError('')
    try {
      await api(`/api/sprint2/publications/${safetyForm.publicationId}/safety`, {
        method: 'PATCH',
        token,
        body: {
          safetyRelated: safetyForm.safetyRelated,
          safetyCaseReference: safetyForm.safetyCaseReference
        }
      })
      setNotice('Safety integration updated')
    } catch (err) {
      setError(err.message)
    }
  }

  async function runSafetyQueue() {
    setError('')
    try {
      const data = await api('/api/sprint2/safety/queue/run', {
        method: 'POST',
        token
      })
      setNotice(`Safety queue run: sent ${data.result?.sent || 0}, retried ${data.result?.retried || 0}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function runAutomation() {
    setError('')
    try {
      const data = await api('/api/sprint2/automation/run', {
        method: 'POST',
        token
      })
      setNotice(`Automation run complete: alerts ${data.deadlineAlerts?.sentAlerts || 0}`)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadPortfolioReport() {
    setError('')
    try {
      const data = await api(`/api/sprint2/reports/portfolio${scopeSuffix}`, { token })
      setReportJson(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function loadWorkloadReport() {
    setError('')
    try {
      const data = await api(`/api/sprint2/reports/workload${scopeSuffix}`, { token })
      setReportJson(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function runBulkStatus(event) {
    event.preventDefault()
    setError('')
    try {
      const publicationIds = bulkForm.publicationIdsCsv
        .split(',')
        .map((item) => toNumber(item.trim()))
        .filter((id) => Number.isFinite(id))
      await api('/api/sprint2/bulk/status', {
        method: 'POST',
        token,
        body: {
          publicationIds,
          status: bulkForm.status
        }
      })
      setNotice('Bulk status update complete')
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    }
  }

  async function runBulkReviewerAssign(event) {
    event.preventDefault()
    setError('')
    try {
      const publicationIds = bulkForm.publicationIdsCsv
        .split(',')
        .map((item) => toNumber(item.trim()))
        .filter((id) => Number.isFinite(id))
      await api('/api/sprint2/bulk/reviewer-assign', {
        method: 'POST',
        token,
        body: {
          publicationIds,
          reviewerUserId: Number(bulkForm.reviewerUserId)
        }
      })
      setNotice('Bulk reviewer assignment complete')
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    }
  }

  async function previewImport(event) {
    event.preventDefault()
    setError('')
    try {
      const data = await api('/api/sprint2/import/csv', {
        method: 'POST',
        token,
        body: scopeBody(user, selectedTenantId, {
          csvText: importForm.csvText,
          dryRun: true
        })
      })
      setImportPreview(data)
    } catch (err) {
      setError(err.message)
    }
  }

  async function executeImport() {
    setError('')
    try {
      const data = await api('/api/sprint2/import/csv', {
        method: 'POST',
        token,
        body: scopeBody(user, selectedTenantId, {
          csvText: importForm.csvText,
          dryRun: false
        })
      })
      setNotice(`CSV import complete: ${data.importedCount}`)
      await onRefresh?.()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="panel">
      <h2>Sprint 2 Advanced Ops</h2>

      <div className="sub-section">
        <div className="row between">
          <h3>Automation + Gantt</h3>
          <div className="chips wrap">
            <button className="ghost compact" onClick={runAutomation}>Run Automation Now</button>
            <button className="ghost compact" onClick={loadGantt}>Load Gantt</button>
          </div>
        </div>
        <div className="mini-list">
          {ganttItems.slice(0, 10).map((item) => (
            <div key={`gantt-${item.publicationId}`} className="mini-row">
              <span>{item.title}</span>
              <span className="muted small">{item.plannedStartDate} → {item.targetDate}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sub-section">
        <h3>Document Compare + Comments</h3>
        <form className="form-grid grid-3" onSubmit={compareVersions}>
          <select
            value={compareForm.leftVersionId}
            onChange={(e) => setCompareForm((prev) => ({ ...prev, leftVersionId: e.target.value }))}
          >
            <option value="">Left version</option>
            {(selectedPublicationDetails?.documentVersions || []).map((item) => (
              <option key={`left-${item.id}`} value={item.id}>v{item.versionNo} - {item.fileName}</option>
            ))}
          </select>
          <select
            value={compareForm.rightVersionId}
            onChange={(e) => setCompareForm((prev) => ({ ...prev, rightVersionId: e.target.value }))}
          >
            <option value="">Right version</option>
            {(selectedPublicationDetails?.documentVersions || []).map((item) => (
              <option key={`right-${item.id}`} value={item.id}>v{item.versionNo} - {item.fileName}</option>
            ))}
          </select>
          <button type="submit">Compare</button>
        </form>
        {compareResult ? (
          <div className="mini-row">
            <span>{compareResult.left?.fileName} vs {compareResult.right?.fileName}</span>
            <span className="muted small">{compareResult.note}</span>
          </div>
        ) : null}

        <form className="form-grid grid-3" onSubmit={addComment}>
          <select
            value={commentForm.documentVersionId}
            onChange={(e) => setCommentForm((prev) => ({ ...prev, documentVersionId: e.target.value }))}
          >
            <option value="">Document version</option>
            {(selectedPublicationDetails?.documentVersions || []).map((item) => (
              <option key={`comment-v-${item.id}`} value={item.id}>v{item.versionNo} - {item.fileName}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            value={commentForm.pageNumber}
            onChange={(e) => setCommentForm((prev) => ({ ...prev, pageNumber: e.target.value }))}
            placeholder="Page"
          />
          <input
            value={commentForm.commentText}
            onChange={(e) => setCommentForm((prev) => ({ ...prev, commentText: e.target.value }))}
            placeholder="Comment text"
          />
          <button type="submit">Add Comment</button>
          <button type="button" className="ghost compact" onClick={loadComments}>Load Comments</button>
        </form>
        <div className="mini-list">
          {comments.slice(0, 10).map((item) => (
            <div key={`comment-${item.id}`} className="mini-row">
              <span>p{item.pageNumber}: {item.commentText}</span>
              <span className="chips wrap">
                <span className="chip light">{item.status}</span>
                {item.status !== 'resolved' ? (
                  <button className="ghost compact" onClick={() => setCommentStatus(item.id, 'resolved')}>Resolve</button>
                ) : (
                  <button className="ghost compact" onClick={() => setCommentStatus(item.id, 'open')}>Reopen</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="sub-section">
        <h3>Templates + Calendar</h3>
        <form className="form-grid grid-5" onSubmit={createTemplate}>
          <input
            placeholder="Template name"
            value={templateForm.templateName}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateName: e.target.value }))}
          />
          <select
            value={templateForm.publicationType}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, publicationType: e.target.value }))}
          >
            <option value="journal_article">Journal</option>
            <option value="congress_abstract">Congress Abstract</option>
            <option value="poster">Poster</option>
            <option value="oral_presentation">Oral Presentation</option>
          </select>
          <input
            placeholder="Default venue"
            value={templateForm.defaultTargetVenue}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, defaultTargetVenue: e.target.value }))}
          />
          <input
            placeholder="Milestones CSV (name:days)"
            value={templateForm.milestonesCsv}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, milestonesCsv: e.target.value }))}
          />
          <input
            placeholder="Checklist CSV (key:text:req)"
            value={templateForm.checklistCsv}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, checklistCsv: e.target.value }))}
          />
          <input
            placeholder="Reviewer IDs CSV"
            value={templateForm.reviewerUserIdsCsv}
            onChange={(e) => setTemplateForm((prev) => ({ ...prev, reviewerUserIdsCsv: e.target.value }))}
          />
          <button type="submit">Create Template</button>
          <button type="button" className="ghost compact" onClick={loadTemplates}>Load Templates</button>
        </form>
        <form className="form-grid grid-3" onSubmit={applyTemplate}>
          <select
            value={applyTemplateForm.templateId}
            onChange={(e) => setApplyTemplateForm((prev) => ({ ...prev, templateId: e.target.value }))}
          >
            <option value="">Template</option>
            {templates.map((item) => (
              <option key={`template-${item.id}`} value={item.id}>{item.templateName}</option>
            ))}
          </select>
          <select
            value={applyTemplateForm.publicationId}
            onChange={(e) => setApplyTemplateForm((prev) => ({ ...prev, publicationId: e.target.value }))}
          >
            <option value="">Publication</option>
            {publications.map((item) => (
              <option key={`pub-${item.id}`} value={item.id}>{item.title}</option>
            ))}
          </select>
          <button type="submit">Apply Template</button>
        </form>

        <form className="form-grid grid-5" onSubmit={createConference}>
          <input
            placeholder="Conference name"
            value={conferenceForm.conferenceName}
            onChange={(e) => setConferenceForm((prev) => ({ ...prev, conferenceName: e.target.value }))}
          />
          <input
            placeholder="Therapeutic area"
            value={conferenceForm.therapeuticArea}
            onChange={(e) => setConferenceForm((prev) => ({ ...prev, therapeuticArea: e.target.value }))}
          />
          <input
            type="date"
            value={conferenceForm.abstractDeadline}
            onChange={(e) => setConferenceForm((prev) => ({ ...prev, abstractDeadline: e.target.value }))}
          />
          <input
            type="date"
            value={conferenceForm.startDate}
            onChange={(e) => setConferenceForm((prev) => ({ ...prev, startDate: e.target.value }))}
          />
          <input
            type="date"
            value={conferenceForm.endDate}
            onChange={(e) => setConferenceForm((prev) => ({ ...prev, endDate: e.target.value }))}
          />
          <button type="submit">Create Conference</button>
          <button type="button" className="ghost compact" onClick={loadConferences}>Load Conferences</button>
        </form>
        <form className="form-grid grid-3" onSubmit={linkConference}>
          <select
            value={linkConferenceForm.publicationId}
            onChange={(e) => setLinkConferenceForm((prev) => ({ ...prev, publicationId: e.target.value }))}
          >
            <option value="">Publication</option>
            {publications.map((item) => (
              <option key={`pub-link-${item.id}`} value={item.id}>{item.title}</option>
            ))}
          </select>
          <select
            value={linkConferenceForm.conferenceId}
            onChange={(e) => setLinkConferenceForm((prev) => ({ ...prev, conferenceId: e.target.value }))}
          >
            <option value="">Conference</option>
            {conferences.map((item) => (
              <option key={`conf-link-${item.id}`} value={item.id}>{item.conferenceName}</option>
            ))}
          </select>
          <button type="submit">Link Conference</button>
        </form>
      </div>

      <div className="sub-section">
        <h3>MIMS + Safety</h3>
        <form className="form-grid inline" onSubmit={searchMims}>
          <input value={mimsQuery} onChange={(e) => setMimsQuery(e.target.value)} placeholder="Search MIMS drug" />
          <button type="submit">Search</button>
        </form>
        <div className="mini-list">
          {mimsResults.slice(0, 5).map((item) => (
            <div key={`mims-${item.id}`} className="mini-row">
              <span>{item.name}</span>
              <button
                className="ghost compact"
                onClick={() => setMimsLinkForm((prev) => ({ ...prev, mimsDrugId: String(item.id), mimsDrugName: item.name }))}
              >
                Pick
              </button>
            </div>
          ))}
        </div>
        <form className="form-grid grid-3" onSubmit={linkMims}>
          <select
            value={mimsLinkForm.publicationId}
            onChange={(e) => setMimsLinkForm((prev) => ({ ...prev, publicationId: e.target.value }))}
          >
            <option value="">Publication</option>
            {publications.map((item) => (
              <option key={`mims-pub-${item.id}`} value={item.id}>{item.title}</option>
            ))}
          </select>
          <input
            placeholder="MIMS drug id"
            value={mimsLinkForm.mimsDrugId}
            onChange={(e) => setMimsLinkForm((prev) => ({ ...prev, mimsDrugId: e.target.value }))}
          />
          <input
            placeholder="MIMS drug name"
            value={mimsLinkForm.mimsDrugName}
            onChange={(e) => setMimsLinkForm((prev) => ({ ...prev, mimsDrugName: e.target.value }))}
          />
          <button type="submit">Link MIMS</button>
        </form>

        <form className="form-grid grid-3" onSubmit={updateSafety}>
          <select
            value={safetyForm.publicationId}
            onChange={(e) => setSafetyForm((prev) => ({ ...prev, publicationId: e.target.value }))}
          >
            <option value="">Publication</option>
            {publications.map((item) => (
              <option key={`safe-pub-${item.id}`} value={item.id}>{item.title}</option>
            ))}
          </select>
          <select
            value={String(safetyForm.safetyRelated)}
            onChange={(e) => setSafetyForm((prev) => ({ ...prev, safetyRelated: e.target.value === 'true' }))}
          >
            <option value="false">Safety Not Related</option>
            <option value="true">Safety Related</option>
          </select>
          <input
            placeholder="Safety case reference"
            value={safetyForm.safetyCaseReference}
            onChange={(e) => setSafetyForm((prev) => ({ ...prev, safetyCaseReference: e.target.value }))}
          />
          <button type="submit">Update Safety</button>
          <button type="button" className="ghost compact" onClick={runSafetyQueue}>Run Safety Queue</button>
        </form>
      </div>

      <div className="sub-section">
        <h3>Reports + Bulk + Import</h3>
        <div className="chips wrap">
          <button className="ghost compact" onClick={loadPortfolioReport}>Load Portfolio Report</button>
          <button className="ghost compact" onClick={loadWorkloadReport}>Load Workload Report</button>
          <a className="link-btn" href={`/api/sprint2/reports/portfolio${scopeSuffix ? `${scopeSuffix}&` : '?'}format=csv`} target="_blank" rel="noreferrer">Portfolio CSV</a>
          <a className="link-btn" href={`/api/sprint2/reports/workload${scopeSuffix ? `${scopeSuffix}&` : '?'}format=csv`} target="_blank" rel="noreferrer">Workload CSV</a>
        </div>
        {reportJson ? (
          <pre className="json-block">{JSON.stringify(reportJson, null, 2)}</pre>
        ) : null}

        <form className="form-grid grid-4" onSubmit={runBulkStatus}>
          <input
            placeholder="Publication IDs CSV"
            value={bulkForm.publicationIdsCsv}
            onChange={(e) => setBulkForm((prev) => ({ ...prev, publicationIdsCsv: e.target.value }))}
          />
          <select
            value={bulkForm.status}
            onChange={(e) => setBulkForm((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="concept">Concept</option>
            <option value="planning">Planning</option>
            <option value="writing">Writing</option>
            <option value="internal_review">Internal Review</option>
            <option value="journal_submission">Journal Submission</option>
            <option value="accepted">Accepted</option>
            <option value="published">Published</option>
          </select>
          <button type="submit">Bulk Status Update</button>
        </form>
        <form className="form-grid grid-3" onSubmit={runBulkReviewerAssign}>
          <input
            placeholder="Reviewer user ID"
            value={bulkForm.reviewerUserId}
            onChange={(e) => setBulkForm((prev) => ({ ...prev, reviewerUserId: e.target.value }))}
          />
          <button type="submit">Bulk Reviewer Assign</button>
        </form>

        <form className="form-grid" onSubmit={previewImport}>
          <textarea
            className="input-textarea"
            value={importForm.csvText}
            onChange={(e) => setImportForm((prev) => ({ ...prev, csvText: e.target.value }))}
          />
          <div className="chips wrap">
            <button type="submit">Preview Import</button>
            <button type="button" className="ghost compact" onClick={executeImport}>Execute Import</button>
          </div>
        </form>
        {importPreview ? (
          <pre className="json-block">{JSON.stringify(importPreview, null, 2)}</pre>
        ) : null}
      </div>

      <div className="sub-section">
        <h3>Quick IDs</h3>
        <p className="muted small">Users: {users.map((item) => `${item.id}:${item.role}`).join(', ') || 'n/a'}</p>
        <p className="muted small">Publications: {publications.map((item) => `${item.id}:${item.title}`).join(' | ') || 'n/a'}</p>
      </div>
    </section>
  )
}

export default Sprint2Panel
