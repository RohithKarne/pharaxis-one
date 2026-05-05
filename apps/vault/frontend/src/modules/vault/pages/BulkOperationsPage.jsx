import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  apiJson,
  authHeaders,
  getOrgToken,
  lifecycleBadgeClass
} from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function flattenFolders(nodes, level = 0, result = []) {
  nodes.forEach(node => {
    result.push({ id: node.id, name: node.name, level })
    if (Array.isArray(node.children) && node.children.length) {
      flattenFolders(node.children, level + 1, result)
    }
  })
  return result
}

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function BulkOperationsPage() {
  const token = getOrgToken()
  const [contentRows, setContentRows] = useState([])
  const [folders, setFolders] = useState([])
  const [jobs, setJobs] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [operation, setOperation] = useState('lifecycle')
  const [lifecycleState, setLifecycleState] = useState('in_review')
  const [folderId, setFolderId] = useState('')
  const [metadataField, setMetadataField] = useState('department')
  const [metadataValue, setMetadataValue] = useState('')
  const [filterText, setFilterText] = useState('')
  const [csvSelection, setCsvSelection] = useState('')
  const [preview, setPreview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const visibleContent = useMemo(() => {
    const query = filterText.trim().toLowerCase()
    if (!query) return contentRows
    return contentRows.filter(row => (
      String(row.title || '').toLowerCase().includes(query) ||
      String(row.doc_number || '').toLowerCase().includes(query)
    ))
  }, [contentRows, filterText])

  async function loadData() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [content, folderTree, jobRows] = await Promise.all([
        apiJson('/api/content', { headers: authHeaders(token) }),
        apiJson('/api/folders', { headers: authHeaders(token) }),
        apiJson('/api/bulk/jobs', { headers: authHeaders(token) })
      ])
      setContentRows(Array.isArray(content) ? content : [])
      setFolders(flattenFolders(Array.isArray(folderTree) ? folderTree : []))
      setJobs(Array.isArray(jobRows) ? jobRows : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function toggleSelected(id) {
    setSelectedIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ))
  }

  function toggleVisibleRows() {
    const visibleIds = visibleContent.map(row => Number(row.id))
    const allVisibleSelected = visibleIds.length && visibleIds.every(id => selectedIds.includes(id))
    if (allVisibleSelected) {
      setSelectedIds(prev => prev.filter(id => !visibleIds.includes(id)))
      return
    }
    setSelectedIds(prev => Array.from(new Set([...prev, ...visibleIds])))
  }

  function buildBulkPayload() {
    if (!selectedIds.length) {
      return { error: 'Select at least one document before running a bulk operation.' }
    }

    const payload = { content_ids: selectedIds, operation }
    let path = '/api/bulk/lifecycle'
    if (operation === 'lifecycle') {
      payload.to_state = lifecycleState
    } else if (operation === 'metadata') {
      if (!metadataValue.trim()) {
        return { error: 'Provide a metadata value before applying metadata in bulk.' }
      }
      path = '/api/bulk/metadata'
      payload.fields = { [metadataField]: metadataValue.trim() }
    } else if (operation === 'folder') {
      path = '/api/bulk/folder'
      payload.folder_id = folderId || null
    } else if (operation === 'archive') {
      path = '/api/bulk/archive'
    }
    return { path, payload }
  }

  async function previewBulkOperation() {
    const built = buildBulkPayload()
    if (built.error) {
      setError(built.error)
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    setConfirmed(false)
    try {
      const result = await apiJson('/api/bulk/preview', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(built.payload)
      })
      setPreview(result)
      setSuccess(`Preview ready: ${result.valid_count} valid, ${result.error_count} errors, ${result.warning_count} warnings.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitBulkOperation(event) {
    event.preventDefault()
    const built = buildBulkPayload()
    if (built.error) {
      setError(built.error)
      return
    }
    if (!confirmed) {
      setError('Preview and tick Confirm before applying this bulk operation.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiJson(built.path, {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...built.payload, confirm: true })
      })
      setSuccess(`Bulk job #${result.id} finished: ${result.success_count} succeeded, ${result.failure_count} failed.`)
      setSelectedIds([])
      setPreview(null)
      setConfirmed(false)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function applyCsvSelection() {
    const terms = csvSelection
      .split(/[\s,;]+/)
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
    if (!terms.length) return

    const matches = contentRows
      .filter(row => terms.includes(String(row.id).toLowerCase()) || terms.includes(String(row.doc_number).toLowerCase()))
      .map(row => Number(row.id))
    setSelectedIds(prev => Array.from(new Set([...prev, ...matches])))
    setSuccess(`CSV selection matched ${matches.length} documents.`)
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Quality Ops / Bulk Operations"
          title="Bulk Operations"
          note="Apply controlled lifecycle, metadata, folder, and archive changes across selected documents."
          statusLabel={`${selectedIds.length} selected`}
          dateLabel={`${contentRows.length} documents`}
        />

        {error ? (
          <section className="panel span-12">
            <div className="auth-error">{error}</div>
          </section>
        ) : null}
        {success ? (
          <section className="panel span-12">
            <div className="panel-note-card">{success}</div>
          </section>
        ) : null}

        <section className="panel span-4">
          <h3>Run Bulk Change</h3>
          <p className="panel-note">Preview first, then confirm. Every run is stored as a job with row-level issue details.</p>
          <form className="auth-form" onSubmit={submitBulkOperation}>
            <div className="form-field">
              <label htmlFor="bulk-operation">Operation</label>
              <select id="bulk-operation" value={operation} onChange={event => setOperation(event.target.value)}>
                <option value="lifecycle">Lifecycle Change</option>
                <option value="metadata">Metadata Edit</option>
                <option value="folder">Move to Folder</option>
                <option value="archive">Archive</option>
              </select>
            </div>

            {operation === 'lifecycle' ? (
              <div className="form-field">
                <label htmlFor="bulk-lifecycle">New Lifecycle State</label>
                <select id="bulk-lifecycle" value={lifecycleState} onChange={event => setLifecycleState(event.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            ) : null}

            {operation === 'metadata' ? (
              <>
                <div className="form-field">
                  <label htmlFor="bulk-metadata-field">Metadata Field</label>
                  <select id="bulk-metadata-field" value={metadataField} onChange={event => setMetadataField(event.target.value)}>
                    <option value="department">Department</option>
                    <option value="therapeutic_area">Therapeutic Area</option>
                    <option value="product_brand">Product / Brand</option>
                    <option value="keywords">Keywords</option>
                    <option value="confidentiality">Confidentiality</option>
                    <option value="audience">Audience</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="bulk-metadata-value">Value</label>
                  <input
                    id="bulk-metadata-value"
                    value={metadataValue}
                    onChange={event => setMetadataValue(event.target.value)}
                    placeholder="Enter metadata value"
                  />
                </div>
              </>
            ) : null}

            {operation === 'folder' ? (
              <div className="form-field">
                <label htmlFor="bulk-folder">Target Folder</label>
                <select id="bulk-folder" value={folderId} onChange={event => setFolderId(event.target.value)}>
                  <option value="">No Folder</option>
                  {folders.map(folder => (
                    <option key={folder.id} value={folder.id}>{' '.repeat(folder.level * 2)}{folder.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            {operation === 'archive' ? (
              <div className="panel-note-card">
                Selected documents will move to Archived. This keeps records and audit history intact.
              </div>
            ) : null}

            <button className="btn-secondary" type="button" onClick={previewBulkOperation} disabled={submitting || !selectedIds.length}>
              Preview Impact
            </button>
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={event => setConfirmed(event.target.checked)}
                disabled={!preview}
              />
              <span>I reviewed the preview and approve this bulk change</span>
            </label>
            <button className="btn-primary" type="submit" disabled={submitting || !selectedIds.length}>
              {submitting ? 'Running...' : `Apply to ${selectedIds.length} Documents`}
            </button>
          </form>

          {preview ? (
            <div className="panel-note-card">
              <strong>Preview Summary</strong>
              <p>{preview.valid_count} valid · {preview.error_count} errors · {preview.warning_count} warnings</p>
              <ul className="simple-list">
                {preview.issues.slice(0, 5).map((issue, index) => (
                  <li key={`${issue.content_id}-${index}`}>{issue.severity}: #{issue.content_id} · {issue.message}</li>
                ))}
                {!preview.issues.length ? <li>No blocking issues found.</li> : null}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="panel span-8">
          <div className="folder-header">
            <div>
              <h3>Select Documents</h3>
              <p className="panel-note">Filter by title or document number, then select the rows that need the same change.</p>
            </div>
            <Link className="btn-secondary link-button" to="/vault/search">Open Search</Link>
          </div>
          <div className="config-filter-head">
            <input
              className="workspace-module-search"
              type="search"
              value={filterText}
              onChange={event => setFilterText(event.target.value)}
              placeholder="Filter documents"
            />
            <button className="btn-secondary" type="button" onClick={toggleVisibleRows}>
              Toggle Visible
            </button>
          </div>
          <div className="form-field">
            <label htmlFor="bulk-csv-selection">Paste CSV IDs or Doc Numbers</label>
            <textarea
              id="bulk-csv-selection"
              value={csvSelection}
              onChange={event => setCsvSelection(event.target.value)}
              placeholder="DOC-001, DOC-002, 17"
              rows={3}
            />
            <button className="btn-secondary" type="button" onClick={applyCsvSelection}>
              Add CSV Matches
            </button>
          </div>

          {loading ? <p className="panel-note">Loading documents...</p> : null}
          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Doc Number</th>
                    <th>Title</th>
                    <th>Lifecycle</th>
                    <th>Folder</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContent.map(row => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(Number(row.id))}
                          onChange={() => toggleSelected(Number(row.id))}
                        />
                      </td>
                      <td>{row.doc_number}</td>
                      <td><Link to={`/vault/content/${row.id}`}>{row.title}</Link></td>
                      <td><span className={lifecycleBadgeClass(row.lifecycle_state)}>{row.lifecycle_state}</span></td>
                      <td>{row.folder_name || 'No folder'}</td>
                    </tr>
                  ))}
                  {!visibleContent.length ? (
                    <tr>
                      <td colSpan={5} className="users-empty">No documents found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel span-12">
          <h3>Recent Bulk Jobs</h3>
          <p className="panel-note">Operational history for controlled high-volume changes.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Succeeded</th>
                  <th>Failed</th>
                  <th>Requested By</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id}>
                    <td>#{job.id}</td>
                    <td>{job.job_type}</td>
                    <td><span className={job.status === 'completed' ? 'status-chip success' : 'status-chip warning'}>{job.status}</span></td>
                    <td>{job.requested_count}</td>
                    <td>{job.success_count}</td>
                    <td>{job.failure_count}</td>
                    <td>{job.requested_by_name || '-'}</td>
                    <td>{formatDate(job.created_at)}</td>
                  </tr>
                ))}
                {!jobs.length ? (
                  <tr>
                    <td colSpan={8} className="users-empty">No bulk jobs have been run yet.</td>
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
