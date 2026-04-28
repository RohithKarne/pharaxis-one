/**
 * BrowseContentPage.jsx — Browse Content (H2)
 * Read-only browse experience for CM documents + folders.
 * Users can filter by folder, status, doc type, search text.
 * Opens detail sidebar on row click.
 * CSS namespace: bc- (browse content)
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../browse.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const STATUS_STYLE = {
  Draft:          { bg: '#f1f5f9', color: '#475569' },
  'Under Review': { bg: '#fef9c3', color: '#854d0e' },
  Approved:       { bg: '#dcfce7', color: '#15803d' },
  Published:      { bg: '#dbeafe', color: '#1d4ed8' },
  Archived:       { bg: '#f0fdf4', color: '#166534' },
  Expired:        { bg: '#fee2e2', color: '#dc2626' },
}

const DOC_TYPES = ['All Types', 'MI Letter', 'SPC', 'IB', 'PubMed Summary', 'FAQ', 'Other']
const STATUSES  = ['All Statuses', 'Draft', 'Under Review', 'Approved', 'Published', 'Archived']

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {status || 'Unknown'}
    </span>
  )
}

function DetailSidebar({ doc, token, onClose }) {
  const [activeTab, setActiveTab] = useState('details')
  const [fileBlobUrl, setFileBlobUrl] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  // Reset to details tab when doc changes
  useEffect(() => { setActiveTab('details') }, [doc?.id])

  const hasHtml    = !!(doc?.content_html || doc?.assembled_html)
  const hasFile    = !!(doc?.file_path && doc?.file_mime)
  const isPdf      = hasFile && (doc?.file_mime || '').includes('pdf')
  const isImage    = hasFile && (doc?.file_mime || '').startsWith('image/')
  const canPreview = hasHtml || isPdf || isImage
  const fileUrl    = doc ? `${API}/cm/documents/${doc.id}/file` : ''

  useEffect(() => {
    let active = true
    let blobUrl = ''

    setFileError('')
    setFileBlobUrl('')
    if (!doc || !hasFile || !token) return () => {}

    setFileLoading(true)
    ;(async () => {
      try {
        const res = await httpFetch(fileUrl, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to fetch file')
        const blob = await res.blob()
        blobUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(blobUrl)
          return
        }
        setFileBlobUrl(blobUrl)
      } catch (_) {
        if (active) setFileError('Unable to load secure file preview.')
      } finally {
        if (active) setFileLoading(false)
      }
    })()

    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [doc?.id, fileUrl, hasFile, token])

  if (!doc) return null

  return (
    <div className="bc-sidebar-overlay" onClick={onClose}>
      <div
        className={`bc-sidebar ${activeTab === 'preview' ? 'bc-sidebar--wide' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="bc-sidebar-header">
          <div className="bc-sidebar-title">{doc.name}</div>
          <button className="bc-sidebar-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="bc-sidebar-tabs">
          <button
            className={`bc-sidebar-tab ${activeTab === 'details' ? 'bc-sidebar-tab--active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`bc-sidebar-tab ${activeTab === 'preview' ? 'bc-sidebar-tab--active' : ''} ${!canPreview ? 'bc-sidebar-tab--disabled' : ''}`}
            onClick={() => canPreview && setActiveTab('preview')}
            title={!canPreview ? 'No previewable content for this document' : 'Preview document content'}
          >
            Preview {!canPreview && <span style={{ fontSize: 10, opacity: 0.55 }}>(N/A)</span>}
          </button>
        </div>

        {/* ── Details Tab ─────────────────────────────────────────────── */}
        {activeTab === 'details' && (
          <div className="bc-sidebar-body">
            <div className="bc-detail-row">
              <span className="bc-detail-label">Doc ID</span>
              <span className="bc-detail-val bc-monospace">{doc.doc_id || doc.id}</span>
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Status</span>
              <StatusBadge status={doc.status} />
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Type</span>
              <span className="bc-detail-val">{doc.response_doc_type || doc.doc_type || '—'}</span>
            </div>
            {doc.document_category && (
              <div className="bc-detail-row">
                <span className="bc-detail-label">Category</span>
                <span className="bc-detail-val">{doc.document_category}</span>
              </div>
            )}
            <div className="bc-detail-row">
              <span className="bc-detail-label">Version</span>
              <span className="bc-detail-val">{doc.version_major != null ? `v${doc.version_major}.${doc.version_minor ?? 0}` : '—'}</span>
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Folder</span>
              <span className="bc-detail-val">{doc.folder_name || doc.folder_id || '—'}</span>
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Author</span>
              <span className="bc-detail-val">{doc.author_name || doc.created_by || '—'}</span>
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Created</span>
              <span className="bc-detail-val">
                {doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
              </span>
            </div>
            <div className="bc-detail-row">
              <span className="bc-detail-label">Expires</span>
              <span className="bc-detail-val">
                {doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
              </span>
            </div>
            {doc.search_tags && (
              <div className="bc-detail-row bc-detail-row--wrap">
                <span className="bc-detail-label">Keywords</span>
                <div className="bc-keyword-chips">
                  {String(doc.search_tags).split(',').map(k => k.trim()).filter(Boolean).map(k => (
                    <span key={k} className="bc-keyword-chip">{k}</span>
                  ))}
                </div>
              </div>
            )}
            {doc.summary && (
              <div className="bc-detail-summary">
                <span className="bc-detail-label">Summary</span>
                <p className="bc-detail-summary-text">{doc.summary}</p>
              </div>
            )}
            {hasFile && (
              <div className="bc-detail-row" style={{ marginTop: 12 }}>
                {fileBlobUrl ? (
                  <a
                    href={fileBlobUrl}
                    download={doc.file_name || 'document'}
                    className="bc-download-link"
                  >
                    ⬇ Download {doc.file_name || 'file'}
                  </a>
                ) : (
                  <span className="bc-download-link" style={{ opacity: 0.7 }}>
                    {fileLoading ? 'Loading secure file…' : (fileError || 'File unavailable')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Preview Tab ─────────────────────────────────────────────── */}
        {activeTab === 'preview' && canPreview && (
          <div className="bc-preview-pane">
            {/* HTML content (rich text or assembled modules) */}
            {hasHtml && (
              <iframe
                className="bc-preview-iframe"
                title="Document preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8">
                  <style>
                    body { font-family: -apple-system, sans-serif; font-size: 14px;
                           line-height: 1.6; color: #1e293b; padding: 20px 24px;
                           margin: 0; word-wrap: break-word; }
                    img { max-width: 100%; }
                    table { border-collapse: collapse; width: 100%; }
                    td, th { border: 1px solid #e2e8f0; padding: 6px 10px; }
                    th { background: #f8fafc; }
                  </style>
                </head><body>
                  ${doc.assembled_html || doc.content_html}
                </body></html>`}
                sandbox="allow-same-origin"
              />
            )}

            {/* PDF file */}
            {!hasHtml && isPdf && (
              <iframe
                className="bc-preview-iframe"
                title="PDF preview"
                src={fileBlobUrl}
              />
            )}

            {/* Image file */}
            {!hasHtml && isImage && (
              <div className="bc-preview-image-wrap">
                <img
                  src={fileBlobUrl}
                  alt={doc.file_name || doc.name}
                  className="bc-preview-image"
                />
              </div>
            )}

            {/* Open in new tab link */}
            {hasFile && (
              <div className="bc-preview-footer">
                {fileBlobUrl ? (
                  <a
                    href={fileBlobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="bc-download-link"
                  >
                    ↗ Open in new tab
                  </a>
                ) : (
                  <span className="bc-download-link" style={{ opacity: 0.7 }}>
                    {fileLoading ? 'Loading secure file…' : (fileError || 'File unavailable')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Module detail sidebar (read-only) ───────────────────────────────────────
function ModuleSidebar({ mod, onClose }) {
  if (!mod) return null
  return (
    <div className="bc-sidebar-overlay" onClick={onClose}>
      <div className="bc-sidebar" onClick={e => e.stopPropagation()}>
        <div className="bc-sidebar-header">
          <div className="bc-sidebar-title">{mod.name}</div>
          <button className="bc-sidebar-close" onClick={onClose}>✕</button>
        </div>
        <div className="bc-sidebar-tabs">
          {/* single-tab placeholder so styling is consistent */}
          <button className="bc-sidebar-tab bc-sidebar-tab--active">Details</button>
        </div>
        <div className="bc-sidebar-body">
          <div className="bc-detail-row">
            <span className="bc-detail-label">Module ID</span>
            <span className="bc-detail-val bc-monospace">{mod.module_id || mod.id}</span>
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Status</span>
            <StatusBadge status={mod.status} />
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Type</span>
            <span className="bc-detail-val">{mod.module_type || '—'}</span>
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Version</span>
            <span className="bc-detail-val">{mod.version_major != null ? `v${mod.version_major}.${mod.version_minor ?? 0}` : '—'}</span>
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Folder</span>
            <span className="bc-detail-val">{mod.folder_name || '—'}</span>
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Author</span>
            <span className="bc-detail-val">{mod.created_by_name || mod.created_by || '—'}</span>
          </div>
          <div className="bc-detail-row">
            <span className="bc-detail-label">Expires</span>
            <span className="bc-detail-val">
              {mod.expiry_date ? new Date(mod.expiry_date).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—'}
            </span>
          </div>
          {mod.search_tags && (
            <div className="bc-detail-row bc-detail-row--wrap">
              <span className="bc-detail-label">Keywords</span>
              <div className="bc-keyword-chips">
                {String(mod.search_tags).split(',').map(k => k.trim()).filter(Boolean).map(k => (
                  <span key={k} className="bc-keyword-chip">{k}</span>
                ))}
              </div>
            </div>
          )}
          {mod.content_html && (
            <div className="bc-detail-summary">
              <span className="bc-detail-label" style={{ marginBottom: 8 }}>Content preview</span>
              <iframe
                className="bc-preview-iframe"
                style={{ height: 320, border: '1px solid #e2e8f0', borderRadius: 6 }}
                title="Module content preview"
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8">
                  <style>body{font-family:-apple-system,sans-serif;font-size:13px;line-height:1.6;
                  color:#1e293b;padding:14px 18px;margin:0;word-wrap:break-word;}
                  img{max-width:100%;}table{border-collapse:collapse;width:100%;}
                  td,th{border:1px solid #e2e8f0;padding:4px 8px;}th{background:#f8fafc;}</style>
                </head><body>${mod.content_html}</body></html>`}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BrowseContentPage() {
  const { token } = useAuth()
  const headers   = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // ── Content type tab ────────────────────────────────────────────
  const [contentTab, setContentTab] = useState('documents') // 'documents' | 'modules'

  // ── Shared ──────────────────────────────────────────────────────
  const [folders,     setFolders]     = useState([])
  const [selected,    setSelected]    = useState(null)
  const [selectedMod, setSelectedMod] = useState(null)

  // ── Documents state ──────────────────────────────────────────────
  const [documents,   setDocuments]   = useState([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [search,      setSearch]      = useState('')
  const [folderId,    setFolderId]    = useState('')
  const [docType,     setDocType]     = useState('All Types')
  const [status,      setStatus]      = useState('All Statuses')
  const [page,        setPage]        = useState(1)
  const limit = 50

  // ── Modules state ────────────────────────────────────────────────
  const [modules,       setModules]       = useState([])
  const [modTotal,      setModTotal]      = useState(0)
  const [modLoading,    setModLoading]    = useState(false)
  const [modError,      setModError]      = useState(null)
  const [modSearch,     setModSearch]     = useState('')
  const [modStatus,     setModStatus]     = useState('All Statuses')
  const [modFolderId,   setModFolderId]   = useState('')

  // ── Load folders once ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res  = await httpFetch(`${API}/cm/folders`, { headers })
        const data = await res.json()
        if (res.ok) setFolders(data.folders || [])
      } catch (_) {}
    }
    load()
  }, [token])

  // ── Fetch documents ──────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (folderId)                  params.set('folder_id', folderId)
      if (status !== 'All Statuses') params.set('status', status)
      if (docType !== 'All Types')   params.set('doc_type', docType)
      if (search.trim())             params.set('search', search.trim())
      const res  = await httpFetch(`${API}/cm/documents?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load documents.'); return }
      setDocuments(data.documents || [])
      setTotal(data.total || 0)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }, [page, folderId, status, docType, search, token])

  useEffect(() => { if (contentTab === 'documents') fetchDocs() }, [fetchDocs, contentTab])

  // ── Fetch modules ────────────────────────────────────────────────
  const fetchModules = useCallback(async () => {
    setModLoading(true); setModError(null)
    try {
      const params = new URLSearchParams()
      if (modStatus !== 'All Statuses') params.set('status', modStatus)
      if (modFolderId)                  params.set('folder_id', modFolderId)
      if (modSearch.trim())             params.set('search', modSearch.trim())
      const res  = await httpFetch(`${API}/cm/modules?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setModError(data.error || 'Failed to load modules.'); return }
      setModules(data.modules || [])
      setModTotal((data.modules || []).length)
    } catch { setModError('Network error.') }
    finally { setModLoading(false) }
  }, [modStatus, modFolderId, modSearch, token])

  useEffect(() => { if (contentTab === 'modules') fetchModules() }, [fetchModules, contentTab])

  // ── Computed ─────────────────────────────────────────────────────
  const totalPages   = Math.max(1, Math.ceil(total / limit))
  const hasDocFilter = search || folderId || docType !== 'All Types' || status !== 'All Statuses'
  const hasModFilter = modSearch || modFolderId || modStatus !== 'All Statuses'

  function clearDocFilters() {
    setSearch(''); setFolderId(''); setDocType('All Types'); setStatus('All Statuses'); setPage(1)
  }
  function clearModFilters() {
    setModSearch(''); setModFolderId(''); setModStatus('All Statuses')
  }
  function switchTab(tab) {
    setContentTab(tab)
    setSelected(null)
    setSelectedMod(null)
  }

  return (
    <MIMSLayout activeNav="browse_content">
      <div className="bc-page">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="bc-header">
          <div className="bc-header-left">
            <h1 className="bc-title">Browse Content</h1>
            <span className="bc-subtitle">Explore published documents, modules, and content library</span>
          </div>
          <div className="bc-header-stats">
            <span className="bc-total-badge">
              {contentTab === 'documents'
                ? `${total} document${total !== 1 ? 's' : ''}`
                : `${modTotal} module${modTotal !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* ── Content type tab switcher ────────────────────────────────── */}
        <div className="bc-content-tabs">
          <button
            className={`bc-content-tab ${contentTab === 'documents' ? 'bc-content-tab--active' : ''}`}
            onClick={() => switchTab('documents')}
          >
            📄 Documents
          </button>
          <button
            className={`bc-content-tab ${contentTab === 'modules' ? 'bc-content-tab--active' : ''}`}
            onClick={() => switchTab('modules')}
          >
            🧩 Modules
          </button>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        {contentTab === 'documents' && (
          <div className="bc-filters">
            <input
              className="bc-search"
              placeholder="Search documents…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <select
              className="bc-filter-select"
              value={folderId}
              onChange={e => { setFolderId(e.target.value); setPage(1) }}
            >
              <option value="">All Folders</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              className="bc-filter-select"
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1) }}
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select
              className="bc-filter-select"
              value={docType}
              onChange={e => { setDocType(e.target.value); setPage(1) }}
            >
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            {hasDocFilter && (
              <button className="bc-clear-btn" onClick={clearDocFilters}>✕ Clear</button>
            )}
          </div>
        )}

        {contentTab === 'modules' && (
          <div className="bc-filters">
            <input
              className="bc-search"
              placeholder="Search modules by name, ID, or keyword…"
              value={modSearch}
              onChange={e => setModSearch(e.target.value)}
            />
            <select
              className="bc-filter-select"
              value={modFolderId}
              onChange={e => setModFolderId(e.target.value)}
            >
              <option value="">All Folders</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              className="bc-filter-select"
              value={modStatus}
              onChange={e => setModStatus(e.target.value)}
            >
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            {hasModFilter && (
              <button className="bc-clear-btn" onClick={clearModFilters}>✕ Clear</button>
            )}
          </div>
        )}

        {/* ── Main layout ─────────────────────────────────────────────── */}
        <div className="bc-layout">
          {/* Folder sidebar */}
          <aside className="bc-folder-panel">
            <div className="bc-folder-heading">📁 Folders</div>

            {contentTab === 'documents' && <>
              <button
                className={`bc-folder-item ${!folderId ? 'bc-folder-item--active' : ''}`}
                onClick={() => { setFolderId(''); setPage(1) }}
              >
                All Documents
                <span className="bc-folder-count">{total}</span>
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  className={`bc-folder-item ${folderId === String(f.id) ? 'bc-folder-item--active' : ''}`}
                  onClick={() => { setFolderId(String(f.id)); setPage(1) }}
                >
                  <span className="bc-folder-name">{f.name}</span>
                  {f.product_name && <span className="bc-folder-product">{f.product_name}</span>}
                </button>
              ))}
            </>}

            {contentTab === 'modules' && <>
              <button
                className={`bc-folder-item ${!modFolderId ? 'bc-folder-item--active' : ''}`}
                onClick={() => setModFolderId('')}
              >
                All Modules
                <span className="bc-folder-count">{modTotal}</span>
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  className={`bc-folder-item ${modFolderId === String(f.id) ? 'bc-folder-item--active' : ''}`}
                  onClick={() => setModFolderId(String(f.id))}
                >
                  <span className="bc-folder-name">{f.name}</span>
                  {f.product_name && <span className="bc-folder-product">{f.product_name}</span>}
                </button>
              ))}
            </>}
          </aside>

          {/* ── Documents panel ──────────────────────────────────────── */}
          {contentTab === 'documents' && (
            <div className="bc-docs-panel">
              {error   && <div className="bc-error">{error}</div>}
              {loading && <div className="bc-loading">Loading documents…</div>}

              {!loading && !error && documents.length === 0 && (
                <div className="bc-empty">
                  <div className="bc-empty-icon">📄</div>
                  <div className="bc-empty-text">No documents found{hasDocFilter ? ' matching your filters' : ''}.</div>
                  {hasDocFilter && <button className="bc-clear-btn" onClick={clearDocFilters}>Clear filters</button>}
                </div>
              )}

              {!loading && !error && documents.length > 0 && (
                <div className="bc-doc-grid">
                  {documents.map(doc => (
                    <div
                      key={doc.id}
                      className="bc-doc-card"
                      onClick={() => setSelected(doc)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelected(doc)}
                    >
                      <div className="bc-doc-card-top">
                        <span className="bc-doc-type-icon">
                          {doc.response_doc_type === 'MI Letter' ? '📋'
                            : doc.response_doc_type === 'SPC' ? '📑'
                            : doc.response_doc_type === 'FAQ' ? '❓'
                            : '📄'}
                        </span>
                        <StatusBadge status={doc.status} />
                      </div>
                      <div className="bc-doc-name">{doc.name}</div>
                      <div className="bc-doc-meta">
                        <span>{doc.doc_id || `#${doc.id}`}</span>
                        {doc.version_major != null && (
                          <span>v{doc.version_major}.{doc.version_minor ?? 0}</span>
                        )}
                      </div>
                      {doc.folder_name && (
                        <div className="bc-doc-folder">📁 {doc.folder_name}</div>
                      )}
                      {doc.search_tags && (
                        <div className="bc-doc-keywords">
                          {String(doc.search_tags).split(',').slice(0, 3).map(k => k.trim()).filter(Boolean).map(k => (
                            <span key={k} className="bc-keyword-chip">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {!loading && totalPages > 1 && (
                <div className="bc-pagination">
                  <button
                    className="bc-page-btn"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <span className="bc-page-info">Page {page} of {totalPages}</span>
                  <button
                    className="bc-page-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Modules panel ────────────────────────────────────────── */}
          {contentTab === 'modules' && (
            <div className="bc-docs-panel">
              {modError   && <div className="bc-error">{modError}</div>}
              {modLoading && <div className="bc-loading">Loading modules…</div>}

              {!modLoading && !modError && modules.length === 0 && (
                <div className="bc-empty">
                  <div className="bc-empty-icon">🧩</div>
                  <div className="bc-empty-text">No modules found{hasModFilter ? ' matching your filters' : ''}.</div>
                  {hasModFilter && <button className="bc-clear-btn" onClick={clearModFilters}>Clear filters</button>}
                </div>
              )}

              {!modLoading && !modError && modules.length > 0 && (
                <div className="bc-doc-grid">
                  {modules.map(mod => (
                    <div
                      key={mod.id}
                      className="bc-doc-card bc-module-card"
                      onClick={() => setSelectedMod(mod)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && setSelectedMod(mod)}
                    >
                      <div className="bc-doc-card-top">
                        <span className="bc-doc-type-icon">🧩</span>
                        <StatusBadge status={mod.status} />
                      </div>
                      <div className="bc-doc-name">{mod.name}</div>
                      <div className="bc-doc-meta">
                        <span>{mod.module_id || `#${mod.id}`}</span>
                        {mod.version_major != null && (
                          <span>v{mod.version_major}.{mod.version_minor ?? 0}</span>
                        )}
                      </div>
                      {mod.module_type && (
                        <div className="bc-doc-folder" style={{ color: '#7c3aed' }}>
                          ⬡ {mod.module_type}
                        </div>
                      )}
                      {mod.folder_name && (
                        <div className="bc-doc-folder">📁 {mod.folder_name}</div>
                      )}
                      {mod.search_tags && (
                        <div className="bc-doc-keywords">
                          {String(mod.search_tags).split(',').slice(0, 3).map(k => k.trim()).filter(Boolean).map(k => (
                            <span key={k} className="bc-keyword-chip">{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail sidebars */}
      <DetailSidebar doc={selected} token={token} onClose={() => setSelected(null)} />
      <ModuleSidebar mod={selectedMod} onClose={() => setSelectedMod(null)} />
    </MIMSLayout>
  )
}
