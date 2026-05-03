import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import StatusBadge from './StatusBadge'
import DocumentCreationScreen from './DocumentCreationScreen'
import { CheckInModal, InitiateReviewModal, ApproveModal, PublishModal, ReviewStatusModal } from './ContentModals'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function ReviewRowWithMode({ r, authHeaders, onOpen }) {
  const [mode, setMode] = useState(r.review_mode || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    httpFetch(`/api/cm/reviews/${r.review_id || r.id}/config`, { headers: authHeaders })
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d?.config?.review_mode) setMode(d.config.review_mode) })
      .catch(() => {})
  }, [r.id]) // eslint-disable-line

  async function toggleMode(newMode) {
    if (saving) return
    setSaving(true)
    try {
      const res = await httpFetch(`/api/cm/reviews/${r.review_id || r.id}/config`, {
        method: 'PATCH', headers: authHeaders,
        body: JSON.stringify({ review_mode: newMode }),
      })
      if (res.ok) setMode(newMode)
    } catch { /* silent */ }
    setSaving(false)
  }

  return (
    <tr>
      <td style={{ fontWeight: 500 }}>{r.document_name}</td>
      <td>{r.title}</td>
      <td style={{ fontSize: 12 }}>{r.planned_end_date ? new Date(r.planned_end_date).toLocaleDateString() : '—'}</td>
      <td><StatusBadge status={r.my_status || 'Ongoing'} /></td>
      <td>
        <div style={{ display: 'flex', gap: 4 }}>
          {['sequential', 'parallel'].map(m => (
            <button key={m} className={`cm-btn cm-btn-sm ${mode === m ? 'cm-btn-primary' : 'cm-btn-secondary'}`}
              style={{ textTransform: 'capitalize', opacity: saving ? 0.6 : 1 }}
              onClick={() => toggleMode(m)} disabled={saving}>
              {m === 'sequential' ? '⬇ Seq' : '⇉ Par'}
            </button>
          ))}
        </div>
      </td>
      <td>
        <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={onOpen}>Open Review</button>
      </td>
    </tr>
  )
}

function getAuthoringSourceLabel(doc) {
  if (doc.response_doc_type === 'Module') return 'Module'
  if (doc.authoring_source === 'microsoft365') return 'Microsoft 365'
  if (doc.authoring_source === 'internal') return 'Internal'
  return 'Uploaded'
}

export default function DocumentsSection({ token, user }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [subTab, setSubTab] = useState('all')
  const [checkedInDocs, setCheckedInDocs] = useState([])
  const [checkedOutDocs, setCheckedOutDocs] = useState([])
  const [docs, setDocs] = useState([])
  const [reviews, setReviews] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ folder_id: '', doc_type: '', status: '', search: '' })
  const [ftQuery, setFtQuery] = useState('')
  const [ftResults, setFtResults] = useState(null)
  const [ftSearching, setFtSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  const [selectedDocIds, setSelectedDocIds] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)

  async function handleBulkAction(action) {
    if (selectedDocIds.length === 0) return
    if (!confirm(`${action === 'publish' ? 'Publish' : 'Archive'} ${selectedDocIds.length} document(s)?`)) return
    setBulkLoading(true)
    try {
      const res = await httpFetch('/api/cm/documents/bulk', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ action, ids: selectedDocIds }),
      })
      const d = await res.json()
      if (res.ok) {
        setSelectedDocIds([])
        loadDocs()
        if (d.failed?.length > 0) toast.error(`${d.success} succeeded. ${d.failed.length} failed:\n${d.failed.map(f => `ID ${f.id}: ${f.reason}`).join('\n')}`)
      } else toast.error(d.error || 'Bulk action failed.')
    } catch { toast.error('Network error.') }
    setBulkLoading(false)
  }

  const [showDrawer, setShowDrawer] = useState(false)
  const [editDoc, setEditDoc] = useState(null)
  const [checkInDoc, setCheckInDoc] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [reviewDoc, setReviewDoc] = useState(null)
  const [approveDoc, setApproveDoc] = useState(null)
  const [publishDoc, setPublishDoc] = useState(null)
  const [reviewStatusItem, setReviewStatusItem] = useState(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
      const res = await httpFetch(`/api/cm/documents?${params}`, { headers: authHeaders })
      if (res.ok) {
        const d = await res.json()
        setDocs(Array.isArray(d) ? d : d.documents || [])
        setTotal(d.total || 0)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [token, filters, page]) // eslint-disable-line

  const loadReviews = useCallback(async () => {
    try {
      const res = await httpFetch('/api/cm/reviews', { headers: authHeaders })
      if (res.ok) setReviews((await res.json()).reviews || [])
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadFolders = useCallback(async () => {
    try {
      const res = await httpFetch('/api/cm/folders', { headers: authHeaders })
      if (res.ok) setFolders((await res.json()).folders || [])
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadCheckedIn = useCallback(async () => {
    try {
      const res = await httpFetch('/api/cm/documents?status=Pending', { headers: authHeaders })
      if (res.ok) { const d = await res.json(); setCheckedInDocs(d.documents || []) }
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  const loadCheckedOut = useCallback(async () => {
    try {
      const res = await httpFetch('/api/cm/documents?status=CheckedOut', { headers: authHeaders })
      if (res.ok) { const d = await res.json(); setCheckedOutDocs(d.documents || []) }
    } catch { /* silent */ }
  }, [token]) // eslint-disable-line

  useEffect(() => { loadFolders() }, [loadFolders])
  useEffect(() => { if (subTab === 'all') loadDocs() }, [loadDocs, subTab])
  useEffect(() => { if (subTab === 'reviews') loadReviews() }, [loadReviews, subTab])
  useEffect(() => { if (subTab === 'checkedin') loadCheckedIn() }, [loadCheckedIn, subTab])
  useEffect(() => { if (subTab === 'checkedout') loadCheckedOut() }, [loadCheckedOut, subTab])

  async function handleCheckOut(doc) {
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadDocs()
      else { const d = await res.json(); toast.error(d.error || 'Check out failed.') }
    } catch { toast.error('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await httpFetch(`/api/cm/documents/${checkInDoc.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInDoc(null); loadDocs() }
      else { const d = await res.json(); toast.error(d.error || 'Check in failed.') }
    } catch { toast.error('Network error.') }
    setCheckInLoading(false)
  }

  async function handleArchive(doc) {
    if (!confirm(`Archive "${doc.name}"? This action cannot be undone.`)) return
    try {
      const res = await httpFetch(`/api/cm/documents/${doc.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) loadDocs()
      else { const d = await res.json(); toast.error(d.error || 'Archive failed.') }
    } catch { toast.error('Network error.') }
  }

  function getDocActions(doc) {
    const btns = []
    const s = doc.status
    if (doc.authoring_source === 'microsoft365' && (doc.external_document_url || doc.external_share_url)) {
      btns.push(
        <a
          key="m365"
          className="cm-btn cm-btn-secondary cm-btn-sm"
          href={doc.external_document_url || doc.external_share_url}
          target="_blank"
          rel="noreferrer"
        >
          Open M365
        </a>
      )
    }
    if (s === 'Draft') {
      btns.push(<button key="edit" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(doc)}>Check In</button>)
    } else if (s === 'CheckedOut') {
      if (doc.checked_out_by_name) {
        btns.push(<span key="who" style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>by {doc.checked_out_by_name}</span>)
      }
      btns.push(<button key="edit" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>Edit</button>)
      btns.push(<button key="ci" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(doc)}>Check In</button>)
    } else if (s === 'Pending') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="ir" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setReviewDoc(doc)}>Initiate Review</button>)
      btns.push(<button key="approve" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(doc)}>Approve</button>)
    } else if (s === 'Under Review') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="approve" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(doc)}>Approve</button>)
    } else if (s === 'Approved') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="pub" className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setPublishDoc(doc)}>Publish</button>)
    } else if (s === 'Published') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
      btns.push(<button key="co" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(doc)}>Check Out</button>)
      btns.push(<button key="arch" className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(doc)}>Archive</button>)
    } else if (s === 'Archived') {
      btns.push(<button key="view" className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(doc); setShowDrawer(true) }}>View</button>)
    }
    return <div className="cm-action-btns">{btns}</div>
  }

  const totalPages = Math.ceil(total / LIMIT)

  if (showDrawer) {
    return (
      <>
        <DocumentCreationScreen
          doc={editDoc}
          token={token}
          onClose={() => { setShowDrawer(false); setEditDoc(null) }}
          onSaved={loadDocs}
        />
        {checkInDoc && <CheckInModal item={checkInDoc} onClose={() => setCheckInDoc(null)} onConfirm={handleCheckIn} loading={checkInLoading} />}
      </>
    )
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Documents</h2>
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditDoc(null); setShowDrawer(true) }}>+ New Document</button>
      </div>

      <div className="cm-sub-tabs">
        <div className={`cm-sub-tab ${subTab === 'all' ? 'active' : ''}`} onClick={() => setSubTab('all')}>All Documents</div>
        <div className={`cm-sub-tab ${subTab === 'checkedin' ? 'active' : ''}`} onClick={() => setSubTab('checkedin')}>
          Checked In {checkedInDocs.length > 0 && <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{checkedInDocs.length}</span>}
        </div>
        <div className={`cm-sub-tab ${subTab === 'checkedout' ? 'active' : ''}`} onClick={() => setSubTab('checkedout')}>
          Checked Out {checkedOutDocs.length > 0 && <span style={{ background: 'var(--warning, #f59e0b)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{checkedOutDocs.length}</span>}
        </div>
        <div className={`cm-sub-tab ${subTab === 'reviews' ? 'active' : ''}`} onClick={() => setSubTab('reviews')}>
          My Review Tasks {reviews.length > 0 && <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{reviews.length}</span>}
        </div>
      </div>

      {subTab === 'all' && (
        <>
          <div className="cm-filters">
            <select className="cm-form-select" style={{ width: 160 }} value={filters.folder_id} onChange={e => { setFilters(p => ({ ...p, folder_id: e.target.value })); setPage(1) }}>
              <option value="">All Folders</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select className="cm-form-select" style={{ width: 180 }} value={filters.doc_type} onChange={e => { setFilters(p => ({ ...p, doc_type: e.target.value })); setPage(1) }}>
              <option value="">All Types</option>
              <option>SRD</option><option>Enclosure</option><option>Information Document</option><option>Internal Document</option>
            </select>
            <select className="cm-form-select" style={{ width: 160 }} value={filters.status} onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setPage(1) }}>
              <option value="">All Statuses</option>
              <option>Draft</option><option>Pending</option><option>Under Review</option><option>Approved</option><option>Published</option><option>Archived</option>
            </select>
            <input className="cm-form-input" style={{ width: 220 }} placeholder="Search documents…" value={filters.search} onChange={e => { setFilters(p => ({ ...p, search: e.target.value })); setPage(1) }} />
            <button className="cm-btn cm-btn-secondary" onClick={loadDocs}>Filter</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input className="cm-form-input" style={{ width: 300 }} placeholder="🔍 Full-text content search…" value={ftQuery}
              onChange={e => { setFtQuery(e.target.value); if (!e.target.value) setFtResults(null) }}
              onKeyDown={async e => {
                if (e.key === 'Enter' && ftQuery.trim().length >= 2) {
                  setFtSearching(true)
                  try {
                    const res = await httpFetch(`/api/cm/documents/search?q=${encodeURIComponent(ftQuery)}`, { headers: authHeaders })
                    if (res.ok) { const d = await res.json(); setFtResults(d.documents || []) }
                  } catch { /* silent */ } finally { setFtSearching(false) }
                }
              }} />
            <button className="cm-btn cm-btn-secondary" disabled={ftSearching || ftQuery.trim().length < 2} onClick={async () => {
              setFtSearching(true)
              try {
                const res = await httpFetch(`/api/cm/documents/search?q=${encodeURIComponent(ftQuery)}`, { headers: authHeaders })
                if (res.ok) { const d = await res.json(); setFtResults(d.documents || []) }
              } catch { /* silent */ } finally { setFtSearching(false) }
            }}>{ftSearching ? 'Searching…' : 'Search Content'}</button>
            {ftResults !== null && <button className="cm-btn cm-btn-secondary" onClick={() => { setFtResults(null); setFtQuery('') }}>✕ Clear</button>}
          </div>
          {ftResults !== null && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {ftResults.length} content match{ftResults.length !== 1 ? 'es' : ''} for "{ftQuery}"
              </div>
              {ftResults.length === 0 ? (
                <div className="cm-empty"><p>No documents matched that query in their content.</p></div>
              ) : (
                <table className="cm-table">
                  <thead><tr><th>Doc ID</th><th>Name</th><th>Status</th><th>Version</th><th>Actions</th></tr></thead>
                  <tbody>
                    {ftResults.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{d.name}</td>
                        <td><StatusBadge status={d.status} /></td>
                        <td>{d.version_major || 1}.{d.version_minor || 0}</td>
                        <td><button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>Open</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selectedDocIds.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--primary-light, #eff6ff)', borderRadius: 6, marginBottom: 10, border: '1px solid var(--primary-border, #bfdbfe)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedDocIds.length} selected</span>
              <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => handleBulkAction('publish')} disabled={bulkLoading}>Bulk Publish</button>
              <button className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleBulkAction('archive')} disabled={bulkLoading}>Bulk Archive</button>
              <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setSelectedDocIds([])} disabled={bulkLoading}>✕ Clear</button>
            </div>
          )}
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading documents…</p>
          ) : docs.length === 0 ? (
            <div className="cm-empty"><div className="cm-empty-icon">📄</div><p>No documents found. Create your first one!</p></div>
          ) : (
            <>
              <table className="cm-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox"
                        checked={docs.length > 0 && docs.every(d => selectedDocIds.includes(d.id))}
                        onChange={e => setSelectedDocIds(e.target.checked ? docs.map(d => d.id) : [])}
                      />
                    </th>
                    <th>Doc ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Folder</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Checked Out By</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => (
                    <tr key={d.id}>
                      <td>
                        <input type="checkbox"
                          checked={selectedDocIds.includes(d.id)}
                          onChange={e => setSelectedDocIds(prev => e.target.checked ? [...new Set([...prev, d.id])] : prev.filter(id => id !== d.id))}
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                      <td style={{ fontWeight: 500, maxWidth: 200 }}>{d.name}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>{d.doc_type}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{getAuthoringSourceLabel(d)}</span>
                        </div>
                      </td>
                      <td>{d.folder_name || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{d.version || '1.0'}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{d.checked_out_by_name || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
                      <td>{getDocActions(d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
                  <span style={{ padding: '4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
                  <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {subTab === 'checkedin' && (
        checkedInDocs.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📥</div><p>No documents currently checked in (Pending review).</p></div>
        ) : (
          <table className="cm-table">
            <thead><tr><th>Doc ID</th><th>Name</th><th>Type</th><th>Folder</th><th>Version</th><th>Last Updated</th><th>Actions</th></tr></thead>
            <tbody>
              {checkedInDocs.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{d.name}</td>
                  <td>{d.doc_type}</td>
                  <td>{d.folder_name || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{d.version_major}.{d.version_minor}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="cm-action-btns">
                      <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>View</button>
                      <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setApproveDoc(d)}>Approve</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {subTab === 'checkedout' && (
        checkedOutDocs.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">📤</div><p>No documents currently checked out.</p></div>
        ) : (
          <table className="cm-table">
            <thead><tr><th>Doc ID</th><th>Name</th><th>Type</th><th>Folder</th><th>Version</th><th>Checked Out By</th><th>Checked Out At</th><th>Auto-releases At</th><th>Actions</th></tr></thead>
            <tbody>
              {checkedOutDocs.map(d => {
                const expiresAt = d.checkout_expires_at ? new Date(d.checkout_expires_at) : null
                const isExpiringSoon = expiresAt && (expiresAt - Date.now()) < 2 * 60 * 60 * 1000
                return (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{d.doc_id || '—'}</td>
                    <td style={{ fontWeight: 500 }}>{d.name}</td>
                    <td>{d.doc_type}</td>
                    <td>{d.folder_name || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{d.version_major}.{d.version_minor}</td>
                    <td style={{ fontSize: 13 }}>{d.checked_out_by_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.checked_out_at ? new Date(d.checked_out_at).toLocaleDateString() : '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {expiresAt ? (
                        <span style={{ color: isExpiringSoon ? 'var(--danger)' : 'var(--text-muted)', fontWeight: isExpiringSoon ? 600 : 400 }}>
                          {isExpiringSoon ? '⚠ ' : ''}auto-releases {expiresAt.toLocaleString()}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <div className="cm-action-btns">
                        <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditDoc(d); setShowDrawer(true) }}>Edit</button>
                        <button className="cm-btn cm-btn-primary cm-btn-sm" onClick={() => setCheckInDoc(d)}>Check In</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      )}

      {subTab === 'reviews' && (
        reviews.length === 0 ? (
          <div className="cm-empty"><div className="cm-empty-icon">✅</div><p>No review tasks assigned to you.</p></div>
        ) : (
          <table className="cm-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Review Title</th>
                <th>Planned End Date</th>
                <th>My Status</th>
                <th>Review Mode</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <ReviewRowWithMode key={r.id} r={r} authHeaders={authHeaders} onOpen={() => setReviewStatusItem(r)} />
              ))}
            </tbody>
          </table>
        )
      )}

      {showDrawer && (
        <DocumentCreationScreen
          doc={editDoc}
          token={token}
          onClose={() => { setShowDrawer(false); setEditDoc(null) }}
          onSaved={loadDocs}
        />
      )}

      {checkInDoc && (
        <CheckInModal item={checkInDoc} onClose={() => setCheckInDoc(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
      {reviewDoc && (
        <InitiateReviewModal doc={reviewDoc} token={token} onClose={() => setReviewDoc(null)} onDone={loadDocs} />
      )}
      {approveDoc && (
        <ApproveModal doc={approveDoc} user={user} token={token} onClose={() => setApproveDoc(null)} onDone={loadDocs} />
      )}
      {publishDoc && (
        <PublishModal doc={publishDoc} user={user} token={token} onClose={() => setPublishDoc(null)} onDone={loadDocs} />
      )}
      {reviewStatusItem && (
        <ReviewStatusModal review={reviewStatusItem} token={token} onClose={() => setReviewStatusItem(null)} onDone={loadReviews} />
      )}
    </div>
  )
}
