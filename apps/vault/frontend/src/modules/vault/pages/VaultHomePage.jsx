import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import FolderTree from '../components/FolderTree'

export default function VaultHomePage() {
  const token = localStorage.getItem('vault_token')
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [contentRows, setContentRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadContent() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const qs = selectedFolder?.id ? `?folder_id=${selectedFolder.id}` : ''
      const response = await fetch(`/api/content${qs}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load content')
      setContentRows(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadContent()
  }, [selectedFolder?.id, token])

  const stats = useMemo(() => {
    const total = contentRows.length
    const inReview = contentRows.filter(row => row.lifecycle_state === 'in_review').length
    const checkedOut = contentRows.filter(row => row.locked_by).length
    const published = contentRows.filter(row => row.lifecycle_state === 'published').length
    return { total, inReview, checkedOut, published }
  }, [contentRows])

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Vault Workspace</h1>
          <p className="brand-subtitle">Operational command view for regulated content teams</p>
        </div>
        <span className="topbar-pill">Sprint 1 UI Baseline</span>
      </header>

      <main className="dashboard-grid">
        <section className="stat-card">
          <div className="stat-label">Total Documents</div>
          <h2 className="stat-value">{stats.total}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">In Review</div>
          <h2 className="stat-value">{stats.inReview}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Checked Out</div>
          <h2 className="stat-value">{stats.checkedOut}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Published</div>
          <h2 className="stat-value">{stats.published}</h2>
        </section>

        <section className="panel span-8">
          <h3>Vault Content List</h3>
          <p className="panel-note">Current documents in your organization (filtered by selected folder if any).</p>

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading content...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Doc Number</th>
                    <th>Title</th>
                    <th>State</th>
                    <th>Version</th>
                    <th>Checked Out</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contentRows.map(row => (
                    <tr key={row.id}>
                      <td>{row.doc_number}</td>
                      <td>{row.title}</td>
                      <td>{row.lifecycle_state}</td>
                      <td>{row.version_number || '-'}</td>
                      <td>{row.locked_by_name || '-'}</td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${row.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!contentRows.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No content found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel span-4">
          <h3>Fast Navigation</h3>
          <p className="panel-note">Primary routes for Sprint 1 modules.</p>
          <ul className="simple-list">
            <li>
              <span>Upload Content</span>
              <Link to="/vault/upload">Open</Link>
            </li>
            <li>
              <span>Search</span>
              <Link to="/vault/search">Open</Link>
            </li>
            <li>
              <span>Expiry Dashboard</span>
              <Link to="/vault/expiry">Open</Link>
            </li>
            <li>
              <span>Content Slots</span>
              <Link to="/vault/slots">Open</Link>
            </li>
            <li>
              <span>Dossiers</span>
              <Link to="/vault/dossiers">Open</Link>
            </li>
            <li>
              <span>Admin Console</span>
              <Link to="/admin">Open</Link>
            </li>
          </ul>
        </section>

        <section className="span-8">
          <FolderTree
            selectedFolderId={selectedFolder?.id || null}
            onSelectFolder={folder => setSelectedFolder(folder)}
          />
        </section>

        <section className="panel span-4">
          <h3>Selected Folder</h3>
          <p className="panel-note">
            {selectedFolder
              ? `Current filter: ${selectedFolder.name}`
              : 'Pick a folder from the tree to apply content filters.'}
          </p>
          {selectedFolder ? (
            <ul className="simple-list">
              <li>
                <span>Folder ID</span>
                <strong>{selectedFolder.id}</strong>
              </li>
              <li>
                <span>Path</span>
                <strong>{selectedFolder.path}</strong>
              </li>
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  )
}
