import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

async function triggerBrowserDownload(fileName, blob) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function VersionHistoryPanel({ contentId, token, refreshTrigger = 0 }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)

  async function loadVersions() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/content/${contentId}/versions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load versions')
      setVersions(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!contentId || !token) return
    loadVersions()
  }, [contentId, token, refreshTrigger])

  async function downloadVersion(versionId, fallbackName) {
    setDownloadingId(versionId)
    setError('')
    try {
      const response = await fetch(`/api/content/${contentId}/versions/${versionId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to fetch download URL')

      if (payload.source === 's3') {
        window.open(payload.url, '_blank', 'noopener,noreferrer')
      } else {
        const localResponse = await fetch(payload.url, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!localResponse.ok) throw new Error('Failed to download local file')
        const blob = await localResponse.blob()
        await triggerBrowserDownload(payload.file_name || fallbackName || `version-${versionId}`, blob)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section className="panel">
      <h3>Version History</h3>
      <p className="panel-note">Immutable version timeline for this document.</p>

      {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
      {loading ? <p className="panel-note">Loading versions...</p> : null}

      {!loading ? (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Uploaded By</th>
                <th>Uploaded At</th>
                <th>Size (KB)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(version => (
                <tr key={version.id}>
                  <td>{version.version_number}</td>
                  <td>{version.uploaded_by_name || `User #${version.uploaded_by}`}</td>
                  <td>{formatDateTime(version.uploaded_at)}</td>
                  <td>{version.file_size_kb || '-'}</td>
                  <td>
                    <div className="detail-actions">
                      <Link className="btn-secondary link-button" to={`/vault/content/${contentId}/versions/${version.id}/viewer`}>
                        View
                      </Link>
                      <button
                        className="btn-secondary"
                        onClick={() => downloadVersion(version.id, version.file_name)}
                        disabled={downloadingId === version.id}
                      >
                        {downloadingId === version.id ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!versions.length ? (
                <tr>
                  <td colSpan={5} className="users-empty">No versions found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
