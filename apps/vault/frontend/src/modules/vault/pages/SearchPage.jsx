import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  apiJson,
  authHeaders,
  getOrgToken,
  getOrgUser,
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
  return d.toLocaleDateString()
}

export default function SearchPage() {
  const token = getOrgToken()
  const currentUser = getOrgUser()
  const isAdmin = String(currentUser?.role || '') === 'admin'
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = useMemo(() => String(searchParams.get('q') || ''), [searchParams])
  const [types, setTypes] = useState([])
  const [subtypes, setSubtypes] = useState([])
  const [classifications, setClassifications] = useState([])
  const [folders, setFolders] = useState([])
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 25
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [savedSearches, setSavedSearches] = useState([])
  const [saveName, setSaveName] = useState('')
  const [saveShared, setSaveShared] = useState(false)
  const [savedLoading, setSavedLoading] = useState(false)
  const [filters, setFilters] = useState({
    q: urlQuery,
    type_id: '',
    subtype_id: '',
    classification_id: '',
    state: '',
    folder_id: '',
    regulated: '',
    audience: '',
    confidentiality: '',
    date_from: '',
    date_to: '',
    effective_from: '',
    effective_to: '',
    expiry_from: '',
    expiry_to: ''
  })

  async function loadFilterData() {
    const [typeRows, folderTree] = await Promise.all([
      apiJson('/api/taxonomy/types', { headers: authHeaders(token) }),
      apiJson('/api/folders', { headers: authHeaders(token) })
    ])
    setTypes(typeRows)
    setFolders(flattenFolders(folderTree))
  }

  async function loadSavedSearches() {
    if (!token) return
    setSavedLoading(true)
    try {
      const rows = await apiJson('/api/search/saved', {
        headers: authHeaders(token)
      })
      setSavedSearches(Array.isArray(rows) ? rows : [])
    } finally {
      setSavedLoading(false)
    }
  }

  async function loadSubtypes(typeId) {
    if (!typeId) {
      setSubtypes([])
      setClassifications([])
      return
    }
    const subtypeRows = await apiJson(`/api/taxonomy/types/${typeId}/subtypes`, {
      headers: authHeaders(token)
    })
    setSubtypes(subtypeRows)
    if (!subtypeRows.find(row => String(row.id) === String(filters.subtype_id))) {
      setFilters(prev => ({ ...prev, subtype_id: '', classification_id: '' }))
    }
  }

  async function loadClassifications(subtypeId) {
    if (!subtypeId) {
      setClassifications([])
      return
    }
    const classificationRows = await apiJson(`/api/taxonomy/subtypes/${subtypeId}/classifications`, {
      headers: authHeaders(token)
    })
    setClassifications(classificationRows)
    if (!classificationRows.find(row => String(row.id) === String(filters.classification_id))) {
      setFilters(prev => ({ ...prev, classification_id: '' }))
    }
  }

  async function runSearch(nextPage = page, activeFilters = filters) {
    if (!token) {
      setError('Session not found. Please log in first.')
      return
    }

    const query = new URLSearchParams({
      page: String(nextPage),
      limit: String(limit)
    })
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) query.set(key, value)
    })

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson(`/api/search?${query.toString()}`, {
        headers: authHeaders(token)
      })
      setResults(payload.results || [])
      setTotal(Number(payload.total || 0))
      setPage(nextPage)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Session not found. Please log in first.')
      return
    }
    loadFilterData()
      .then(() => Promise.all([runSearch(1), loadSavedSearches()]))
      .catch(requestError => setError(requestError.message))
  }, [])

  useEffect(() => {
    if (!token) return
    if (urlQuery === filters.q) return
    const nextFilters = { ...filters, q: urlQuery }
    setFilters(nextFilters)
    runSearch(1, nextFilters)
  }, [urlQuery, token])

  useEffect(() => {
    loadSubtypes(filters.type_id).catch(requestError => setError(requestError.message))
  }, [filters.type_id])

  useEffect(() => {
    loadClassifications(filters.subtype_id).catch(requestError => setError(requestError.message))
  }, [filters.subtype_id])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  function onSubmit(event) {
    event.preventDefault()
    const nextParams = new URLSearchParams(searchParams)
    if (filters.q.trim()) {
      nextParams.set('q', filters.q.trim())
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
    runSearch(1)
  }

  function openResult(row) {
    navigate(`/vault/content/${row.id}/viewer`)
  }

  async function saveCurrentSearch() {
    const name = saveName.trim()
    if (!name) {
      setError('Provide a name before saving this search.')
      return
    }

    setError('')
    try {
      await apiJson('/api/search/saved', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name,
          filters,
          is_shared: isAdmin ? saveShared : false
        })
      })
      setSaveName('')
      setSaveShared(false)
      await loadSavedSearches()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function applySavedSearch(entry) {
    const nextFilters = { ...filters, ...(entry?.filters || {}) }
    setFilters(nextFilters)
    const nextParams = new URLSearchParams(searchParams)
    if (nextFilters.q?.trim()) {
      nextParams.set('q', nextFilters.q.trim())
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
    runSearch(1, nextFilters)
  }

  async function deleteSavedSearch(id) {
    setError('')
    try {
      await apiJson(`/api/search/saved/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token)
      })
      await loadSavedSearches()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Quality Ops / Search"
          title="Search Workspace"
          note="Full-text and metadata search across organization documents."
          statusLabel="Search Active"
          dateLabel={`${total} matches`}
        />

        <section className="panel span-12">
          <div className="config-filter-head">
            <div>
              <h3>Quick Search</h3>
              <p className="panel-note">Type title, doc number, or keyword and run instant lookup.</p>
            </div>
            <form
              onSubmit={onSubmit}
              className="inline-search-form"
            >
              <input
                className="workspace-module-search"
                value={filters.q}
                onChange={event => setFilters({ ...filters, q: event.target.value })}
                placeholder="Search text"
              />
              <button className="btn-secondary" type="submit">Search</button>
            </form>
          </div>
          <div className="quick-filter-chips" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px' }}
              onClick={() => {
                const next = { ...filters, state: '' }
                setFilters(next)
                runSearch(1, next)
              }}
            >
              All Documents
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}
              onClick={() => {
                const next = { ...filters, state: 'approved' }
                setFilters(next)
                runSearch(1, next)
              }}
            >
              ✔ GxP Approved
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
              onClick={() => {
                const next = { ...filters, state: 'in_review' }
                setFilters(next)
                runSearch(1, next)
              }}
            >
              ⏳ In Review
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', background: '#ffe4e6', color: '#9f1239', border: '1px solid #fecdd3' }}
              onClick={() => {
                const next = { ...filters, state: 'draft' }
                setFilters(next)
                runSearch(1, next)
              }}
            >
              📝 Drafts
            </button>
          </div>
        </section>

        <section className="panel span-4">
          <div className="folder-header">
            <h3>Filters</h3>
            <button className="btn-secondary" onClick={() => setShowFilters(prev => !prev)}>
              {showFilters ? 'Hide' : 'Show'}
            </button>
          </div>

          {showFilters ? (
            <form className="auth-form search-filter-form" onSubmit={onSubmit}>
              <div className="form-field">
                <label htmlFor="q">Search text</label>
                <input
                  id="q"
                  value={filters.q}
                  onChange={event => setFilters({ ...filters, q: event.target.value })}
                  placeholder="Title, doc number, keywords"
                />
              </div>
              <div className="form-field">
                <label htmlFor="type_id">Type</label>
                <select
                  id="type_id"
                  value={filters.type_id}
                  onChange={event => setFilters({ ...filters, type_id: event.target.value })}
                >
                  <option value="">Any</option>
                  {types.map(type => (
                    <option value={type.id} key={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="subtype_id">Subtype</label>
                <select
                  id="subtype_id"
                  value={filters.subtype_id}
                  onChange={event => setFilters({ ...filters, subtype_id: event.target.value })}
                >
                  <option value="">Any</option>
                  {subtypes.map(sub => (
                    <option value={sub.id} key={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="classification_id">Classification</label>
                <select
                  id="classification_id"
                  value={filters.classification_id}
                  onChange={event => setFilters({ ...filters, classification_id: event.target.value })}
                >
                  <option value="">Any</option>
                  {classifications.map(item => (
                    <option value={item.id} key={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="state">Lifecycle</label>
                <select
                  id="state"
                  value={filters.state}
                  onChange={event => setFilters({ ...filters, state: event.target.value })}
                >
                  <option value="">Any</option>
                  <option value="draft">Draft</option>
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="folder_id">Folder</label>
                <select
                  id="folder_id"
                  value={filters.folder_id}
                  onChange={event => setFilters({ ...filters, folder_id: event.target.value })}
                >
                  <option value="">Any</option>
                  {folders.map(folder => (
                    <option value={folder.id} key={folder.id}>{' '.repeat(folder.level * 2)}{folder.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="regulated">Regulated</label>
                <select
                  id="regulated"
                  value={filters.regulated}
                  onChange={event => setFilters({ ...filters, regulated: event.target.value })}
                >
                  <option value="">Any</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="audience">Audience</label>
                <select
                  id="audience"
                  value={filters.audience}
                  onChange={event => setFilters({ ...filters, audience: event.target.value })}
                >
                  <option value="">Any</option>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                  <option value="hcp">HCP</option>
                  <option value="patient">Patient</option>
                  <option value="regulator">Regulator</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="confidentiality">Confidentiality</label>
                <select
                  id="confidentiality"
                  value={filters.confidentiality}
                  onChange={event => setFilters({ ...filters, confidentiality: event.target.value })}
                >
                  <option value="">Any</option>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="date_from">Created From</label>
                <input
                  id="date_from"
                  type="date"
                  value={filters.date_from}
                  onChange={event => setFilters({ ...filters, date_from: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label htmlFor="date_to">Created To</label>
                <input
                  id="date_to"
                  type="date"
                  value={filters.date_to}
                  onChange={event => setFilters({ ...filters, date_to: event.target.value })}
                />
              </div>
              <div className="detail-actions">
                <button className="btn-primary" type="submit">Search</button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    const resetFilters = {
                      q: '',
                      type_id: '',
                      subtype_id: '',
                      classification_id: '',
                      state: '',
                      folder_id: '',
                      regulated: '',
                      audience: '',
                      confidentiality: '',
                      date_from: '',
                      date_to: '',
                      effective_from: '',
                      effective_to: '',
                      expiry_from: '',
                      expiry_to: ''
                    }
                    setFilters(resetFilters)
                    setSearchParams(new URLSearchParams(), { replace: true })
                    runSearch(1, resetFilters)
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="panel span-4">
          <h3>Saved Searches</h3>
          <p className="panel-note">Store reusable searches for yourself, or publish them for the whole org if you are an admin.</p>
          <div className="form-field">
            <label htmlFor="search-save-name">Save Current Search As</label>
            <input
              id="search-save-name"
              value={saveName}
              onChange={event => setSaveName(event.target.value)}
              placeholder="e.g. Overdue reviewer docs"
            />
          </div>
          {isAdmin ? (
            <label className="inline-toggle">
              <input
                type="checkbox"
                checked={saveShared}
                onChange={event => setSaveShared(event.target.checked)}
              />
              <span>Make this a shared team search</span>
            </label>
          ) : null}
          <div className="detail-actions">
            <button className="btn-secondary" type="button" onClick={saveCurrentSearch}>Save</button>
          </div>

          <ul className="simple-list">
            {savedSearches.map(entry => (
              <li key={entry.id}>
                <div className="config-link-copy">
                  <strong>{entry.name}</strong>
                  <span>
                    {entry.is_shared ? 'Shared' : 'Private'} · {new Date(entry.updated_at || entry.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="detail-actions">
                  <button className="btn-secondary" type="button" onClick={() => applySavedSearch(entry)}>
                    Apply
                  </button>
                  {entry.owned_by_current_user ? (
                    <button className="btn-secondary" type="button" onClick={() => deleteSavedSearch(entry.id)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!savedSearches.length && !savedLoading ? <li>No saved searches yet.</li> : null}
          </ul>
        </section>

        <section className="panel span-8">
          <div className="folder-header">
            <div>
              <h3>Results</h3>
              <p className="panel-note">{total} matching documents</p>
            </div>
            <Link className="btn-secondary link-button" to="/vault">
              Back to Vault
            </Link>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Searching...</p> : null}
          {!loading ? (
            <>
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Doc Number</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>State</th>
                      <th>Created</th>
                      <th>Version</th>
                      <th>Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map(row => (
                      <tr key={row.id}>
                        <td>{row.doc_number}</td>
                        <td>{row.title}</td>
                        <td>{row.type_name || '-'}</td>
                        <td>
                          <span className={lifecycleBadgeClass(row.lifecycle_state)}>
                            {row.lifecycle_state}
                          </span>
                        </td>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.version_number || '-'}</td>
                        <td>
                          <button className="btn-secondary" onClick={() => openResult(row)}>View</button>
                        </td>
                      </tr>
                    ))}
                    {!results.length ? (
                      <tr>
                        <td colSpan={7} className="users-empty">No documents found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="pagination-row">
                <button className="btn-secondary" onClick={() => runSearch(Math.max(1, page - 1))} disabled={page <= 1}>
                  Previous
                </button>
                <span>Page {page} of {Math.max(1, Math.ceil(total / limit))}</span>
                <button
                  className="btn-secondary"
                  onClick={() => runSearch(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
