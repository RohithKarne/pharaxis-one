import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

function flattenFolders(nodes, level = 0, result = []) {
  nodes.forEach(node => {
    result.push({ id: node.id, name: node.name, level, path: node.path })
    if (node.children && node.children.length) {
      flattenFolders(node.children, level + 1, result)
    }
  })
  return result
}

export default function UploadPage() {
  const token = localStorage.getItem('vault_token')
  const navigate = useNavigate()
  const [types, setTypes] = useState([])
  const [subtypes, setSubtypes] = useState([])
  const [classifications, setClassifications] = useState([])
  const [folders, setFolders] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    title: '',
    content_type_id: '',
    content_subtype_id: '',
    classification_id: '',
    folder_id: ''
  })

  async function api(path) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Request failed')
    return payload
  }

  async function loadInitialData() {
    setError('')
    try {
      const [typeRows, folderTree] = await Promise.all([
        api('/api/taxonomy/types'),
        api('/api/folders')
      ])
      setTypes(typeRows)
      setFolders(flattenFolders(folderTree))
      if (typeRows.length) {
        setForm(prev => ({ ...prev, content_type_id: String(typeRows[0].id) }))
      }
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Session not found. Please log in.')
      return
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    if (!form.content_type_id || !token) {
      setSubtypes([])
      setClassifications([])
      return
    }

    fetch(`/api/taxonomy/types/${form.content_type_id}/subtypes`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load subtypes')
        setSubtypes(payload)
        if (payload.length) {
          setForm(prev => ({ ...prev, content_subtype_id: String(payload[0].id) }))
        } else {
          setForm(prev => ({ ...prev, content_subtype_id: '', classification_id: '' }))
          setClassifications([])
        }
      })
      .catch(requestError => setError(requestError.message))
  }, [form.content_type_id])

  useEffect(() => {
    if (!form.content_subtype_id || !token) {
      setClassifications([])
      return
    }
    fetch(`/api/taxonomy/subtypes/${form.content_subtype_id}/classifications`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load classifications')
        setClassifications(payload)
        if (payload.length) {
          setForm(prev => ({ ...prev, classification_id: String(payload[0].id) }))
        } else {
          setForm(prev => ({ ...prev, classification_id: '' }))
        }
      })
      .catch(requestError => setError(requestError.message))
  }, [form.content_subtype_id])

  const folderOptions = useMemo(
    () =>
      folders.map(folder => ({
        ...folder,
        label: `${'  '.repeat(folder.level)}${folder.name}`
      })),
    [folders]
  )

  async function handleUpload(event) {
    event.preventDefault()
    if (!token) return
    if (!selectedFile) {
      setError('Please choose a file to upload.')
      return
    }

    setUploading(true)
    setError('')
    setSuccess('')
    try {
      const body = new FormData()
      body.append('title', form.title)
      body.append('content_type_id', form.content_type_id)
      if (form.content_subtype_id) body.append('content_subtype_id', form.content_subtype_id)
      if (form.classification_id) body.append('classification_id', form.classification_id)
      if (form.folder_id) body.append('folder_id', form.folder_id)
      body.append('file', selectedFile)

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Upload failed')

      setSuccess(`Uploaded successfully. Document number: ${payload.doc_number}`)
      setTimeout(() => navigate(`/vault/content/${payload.content_id}`), 900)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Quality Ops / Upload</p>
            <h2 className="workspace-hero-title">Upload Center</h2>
            <p className="panel-note">Create controlled documents with taxonomy and folder mapping.</p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Content Creation</span>
            <span className="workspace-hero-date">Versioned Upload</span>
          </div>
        </section>
      </main>

      <main className="dashboard-grid">
        <section className="panel span-8">
          <h3>New Document Upload</h3>
          <p className="panel-note">Allowed formats: PDF, Word, Excel, PNG, JPG. Max file size: 50MB.</p>

          <form className="auth-form upload-form" onSubmit={handleUpload}>
            <div className="form-field">
              <label htmlFor="title">Document Title</label>
              <input
                id="title"
                value={form.title}
                onChange={event => setForm({ ...form, title: event.target.value })}
                required
              />
            </div>

            <div className="upload-grid">
              <div className="form-field">
                <label htmlFor="content-type">Content Type</label>
                <select
                  id="content-type"
                  value={form.content_type_id}
                  onChange={event => setForm({ ...form, content_type_id: event.target.value })}
                  required
                >
                  <option value="">Select type</option>
                  {types.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.name} ({type.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="content-subtype">Subtype</label>
                <select
                  id="content-subtype"
                  value={form.content_subtype_id}
                  onChange={event => setForm({ ...form, content_subtype_id: event.target.value })}
                >
                  <option value="">Select subtype</option>
                  {subtypes.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="classification">Classification</label>
                <select
                  id="classification"
                  value={form.classification_id}
                  onChange={event => setForm({ ...form, classification_id: event.target.value })}
                >
                  <option value="">Select classification</option>
                  {classifications.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="folder">Folder</label>
                <select
                  id="folder"
                  value={form.folder_id}
                  onChange={event => setForm({ ...form, folder_id: event.target.value })}
                >
                  <option value="">No folder</option>
                  {folderOptions.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="upload-dropzone">
              <input
                type="file"
                onChange={event => setSelectedFile(event.target.files?.[0] || null)}
                required
              />
              <p>{selectedFile ? `Selected: ${selectedFile.name}` : 'Choose a file to upload'}</p>
            </div>

            {error ? <div className="auth-error">{error}</div> : null}
            {success ? <div className="upload-success">{success}</div> : null}

            <button className="btn-primary" type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </form>
        </section>

        <section className="panel span-4">
          <h3>Quick Tips</h3>
          <p className="panel-note">Keep naming and taxonomy clean for search and lifecycle controls.</p>
          <ul className="simple-list">
            <li>
              <span>Need to create type?</span>
              <Link to="/admin/taxonomy">Taxonomy</Link>
            </li>
            <li>
              <span>Need new folder?</span>
              <Link to="/vault">Folder Tree</Link>
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}
