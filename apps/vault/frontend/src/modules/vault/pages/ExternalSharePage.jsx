import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { lifecycleBadgeClass } from '../../common/utils/session'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function ExternalSharePage() {
  const { token } = useParams()
  const [share, setShare] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [passcode, setPasscode] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    async function loadShare() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/external-shares/public/${token}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Share link unavailable')
        setShare(payload)
      } catch (requestError) {
        setError(requestError.message)
      } finally {
        setLoading(false)
      }
    }
    loadShare()
  }, [token])

  async function openDocument() {
    setDownloading(true)
    setError('')
    try {
      const response = await fetch(`/api/external-shares/public/${token}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      })
      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const payload = contentType.includes('application/json') ? await response.json() : null
        throw new Error(payload?.error || 'Unable to open shared document')
      }
      if (contentType.includes('application/pdf')) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      if (!contentType.includes('application/json')) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = share?.file_name || 'vault-document'
        link.click()
        window.URL.revokeObjectURL(url)
        return
      }
      const payload = await response.json()
      if (payload.url) window.open(payload.url, '_blank', 'noopener,noreferrer')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="vault-login-page external-share-page">
      <div className="vault-login-card external-share-card">
        <div className="vault-login-card-header">
          <h1>Pharaxis Vault</h1>
          <p>Controlled External Share</p>
        </div>
        <div className="vault-login-card-body">
          {loading ? <p className="panel-note">Opening controlled share...</p> : null}
          {error ? <div className="auth-error">{error}</div> : null}
          {share ? (
            <>
              <p className="panel-note">This document was shared through an expiring tracked link.</p>
              <ul className="simple-list detail-list">
                <li><span>Document</span><strong>{share.doc_number}</strong></li>
                <li><span>Title</span><strong>{share.title}</strong></li>
                <li><span>Version</span><strong>{share.version_number || '-'}</strong></li>
                <li><span>File</span><strong>{share.file_name || '-'}</strong></li>
                <li><span>Purpose</span><strong>{share.purpose || '-'}</strong></li>
                <li><span>Expires</span><strong>{formatDate(share.expires_at)}</strong></li>
              </ul>
              <span className={lifecycleBadgeClass(share.lifecycle_state)}>{share.lifecycle_state}</span>
              {share.passcode_required ? (
                <div className="form-field">
                  <label htmlFor="share-passcode">Passcode</label>
                  <input
                    id="share-passcode"
                    value={passcode}
                    onChange={event => setPasscode(event.target.value)}
                    placeholder="Enter passcode"
                  />
                </div>
              ) : null}
              <button className="btn-primary" type="button" onClick={openDocument} disabled={downloading || (share.passcode_required && !passcode.trim())}>
                {downloading ? 'Opening...' : 'Open Shared Document'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
