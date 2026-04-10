import { useEffect, useState } from 'react'

function FolderNode({
  node,
  level,
  selectedFolderId,
  onSelectFolder,
  onCreateChild,
  onRenameFolder,
  onDeactivateFolder
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children && node.children.length > 0

  return (
    <li className="folder-node">
      <div
        className={Number(selectedFolderId) === Number(node.id) ? 'folder-row selected' : 'folder-row'}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
      >
        <button
          className="folder-expand"
          type="button"
          onClick={() => setExpanded(!expanded)}
          disabled={!hasChildren}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '•'}
        </button>

        <button className="folder-label" type="button" onClick={() => onSelectFolder(node)}>
          {node.name}
        </button>

        <div className="folder-actions">
          <button type="button" onClick={() => onCreateChild(node)}>+ Sub</button>
          <button type="button" onClick={() => onRenameFolder(node)}>Rename</button>
          <button type="button" onClick={() => onDeactivateFolder(node)}>Deactivate</button>
        </div>
      </div>

      {hasChildren && expanded ? (
        <ul className="folder-children">
          {node.children.map(child => (
            <FolderNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onCreateChild={onCreateChild}
              onRenameFolder={onRenameFolder}
              onDeactivateFolder={onDeactivateFolder}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function FolderTree({ selectedFolderId, onSelectFolder }) {
  const token = localStorage.getItem('vault_token')
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Request failed')
    return payload
  }

  async function loadFolders() {
    if (!token) {
      setLoading(false)
      setError('Session not found. Please log in first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload = await api('/api/folders', { method: 'GET' })
      setTree(payload)
      if (!selectedFolderId && payload.length && onSelectFolder) onSelectFolder(payload[0])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFolders()
  }, [])

  async function createRootFolder() {
    const name = window.prompt('New root folder name')
    if (!name) return
    try {
      await api('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name })
      })
      await loadFolders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createChildFolder(parent) {
    const name = window.prompt(`New sub-folder under "${parent.name}"`)
    if (!name) return
    try {
      await api('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name, parent_id: parent.id })
      })
      await loadFolders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function renameFolder(folder) {
    const name = window.prompt('Rename folder', folder.name)
    if (!name) return
    try {
      await api(`/api/folders/${folder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name })
      })
      await loadFolders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deactivateFolder(folder) {
    if (!window.confirm(`Deactivate "${folder.name}"?`)) return
    try {
      await api(`/api/folders/${folder.id}`, {
        method: 'DELETE'
      })
      if (Number(selectedFolderId) === Number(folder.id) && onSelectFolder) {
        onSelectFolder(null)
      }
      await loadFolders()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="panel folder-panel">
      <div className="folder-header">
        <div>
          <h3>Folder Tree</h3>
          <p className="panel-note">Organization-scoped hierarchy for content grouping</p>
        </div>
        <button className="btn-secondary" type="button" onClick={createRootFolder}>
          + Root Folder
        </button>
      </div>

      {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
      {loading ? <p className="panel-note">Loading folders...</p> : null}

      <ul className="folder-tree">
        {tree.map(node => (
          <FolderNode
            key={node.id}
            node={node}
            level={0}
            selectedFolderId={selectedFolderId}
            onSelectFolder={folder => onSelectFolder && onSelectFolder(folder)}
            onCreateChild={createChildFolder}
            onRenameFolder={renameFolder}
            onDeactivateFolder={deactivateFolder}
          />
        ))}
      </ul>
    </section>
  )
}
