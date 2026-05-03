import { useEffect, useState } from 'react'
import { orgApi as api } from '../../common/api/client'

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
  const [tree, setTree] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState({
    mode: '',
    folder: null,
    name: '',
    saving: false
  })

  async function loadFolders() {
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

  function closeDialog() {
    setDialog({ mode: '', folder: null, name: '', saving: false })
  }

  function openCreateRootDialog() {
    setDialog({ mode: 'create-root', folder: null, name: '', saving: false })
  }

  function openCreateChildDialog(parent) {
    setDialog({ mode: 'create-child', folder: parent, name: '', saving: false })
  }

  function openRenameDialog(folder) {
    setDialog({ mode: 'rename', folder, name: folder.name, saving: false })
  }

  function openDeactivateDialog(folder) {
    setDialog({ mode: 'deactivate', folder, name: folder.name, saving: false })
  }

  async function submitDialog(event) {
    event.preventDefault()
    const trimmedName = dialog.name.trim()

    if (dialog.mode !== 'deactivate' && !trimmedName) {
      setError('Folder name is required.')
      return
    }

    setDialog(prev => ({ ...prev, saving: true }))
    try {
      if (dialog.mode === 'create-root') {
        await api('/api/folders', {
          method: 'POST',
          body: { name: trimmedName }
        })
      } else if (dialog.mode === 'create-child') {
        await api('/api/folders', {
          method: 'POST',
          body: { name: trimmedName, parent_id: dialog.folder.id }
        })
      } else if (dialog.mode === 'rename') {
        await api(`/api/folders/${dialog.folder.id}`, {
          method: 'PATCH',
          body: { name: trimmedName }
        })
      } else if (dialog.mode === 'deactivate') {
        await api(`/api/folders/${dialog.folder.id}`, {
          method: 'DELETE'
        })
        if (Number(selectedFolderId) === Number(dialog.folder.id) && onSelectFolder) {
          onSelectFolder(null)
        }
      }
      await loadFolders()
      closeDialog()
    } catch (requestError) {
      setError(requestError.message)
      setDialog(prev => ({ ...prev, saving: false }))
    }
  }

  function confirmDeactivate() {
    submitDialog({ preventDefault() {} })
  }

  const dialogTitle =
    dialog.mode === 'create-root'
      ? 'Create Root Folder'
      : dialog.mode === 'create-child'
        ? `Create Sub-Folder${dialog.folder ? ` in ${dialog.folder.name}` : ''}`
        : dialog.mode === 'rename'
          ? 'Rename Folder'
          : 'Deactivate Folder'

  return (
    <>
      <section className="panel folder-panel">
        <div className="folder-header">
          <div>
            <h3>Folder Tree</h3>
            <p className="panel-note">Organization-scoped hierarchy for content grouping</p>
          </div>
          <button className="btn-secondary" type="button" onClick={openCreateRootDialog}>
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
              onCreateChild={openCreateChildDialog}
              onRenameFolder={openRenameDialog}
              onDeactivateFolder={openDeactivateDialog}
            />
          ))}
        </ul>
      </section>

      {dialog.mode ? (
        <div className="folder-dialog-backdrop" role="presentation" onClick={closeDialog}>
          <div className="folder-dialog-card" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <h3>{dialogTitle}</h3>
            {dialog.mode === 'deactivate' ? (
              <>
                <p className="panel-note">
                  Deactivate <strong>{dialog.folder?.name}</strong> if it should no longer accept new content. Existing records remain in audit history.
                </p>
                <div className="detail-actions">
                  <button className="btn-secondary" type="button" onClick={closeDialog}>Cancel</button>
                  <button className="btn-primary" type="button" onClick={confirmDeactivate} disabled={dialog.saving}>
                    {dialog.saving ? 'Deactivating...' : 'Confirm Deactivate'}
                  </button>
                </div>
              </>
            ) : (
              <form className="auth-form" onSubmit={submitDialog}>
                <div className="form-field">
                  <label htmlFor="folder-name-input">Folder Name</label>
                  <input
                    id="folder-name-input"
                    value={dialog.name}
                    onChange={event => setDialog(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Enter folder name"
                    autoFocus
                  />
                </div>
                <div className="detail-actions">
                  <button className="btn-secondary" type="button" onClick={closeDialog}>Cancel</button>
                  <button className="btn-primary" type="submit" disabled={dialog.saving}>
                    {dialog.saving
                      ? dialog.mode === 'rename'
                        ? 'Saving...'
                        : 'Creating...'
                      : dialog.mode === 'rename'
                        ? 'Save Folder'
                        : 'Create Folder'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
