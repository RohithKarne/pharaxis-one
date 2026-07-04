import { useState, useEffect } from 'react'

/**
 * PdfViewerModal — views a PDF inline using the browser's native renderer.
 * Fetches the file as an authenticated blob (portal auth via cookie + optional
 * bearer token), then shows it in an iframe. Falls back to a Download link.
 */
export default function PdfViewerModal({ url, downloadUrl, title, onClose }) {
  const [blobUrl, setBlobUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    fetch(url, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Unable to open this document.'); return r.blob() })
      .then(b => { if (!cancelled) { objectUrl = URL.createObjectURL(b); setBlobUrl(objectUrl) } })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  return (
    <div className="pp-pdf-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="pp-pdf-modal" onClick={e => e.stopPropagation()}>
        <div className="pp-pdf-head">
          <b>{title}</b>
          {downloadUrl && <a href={downloadUrl}>Download</a>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {error
          ? <div style={{ padding: 24, color: '#C0392B', fontSize: 14 }}>{error}</div>
          : blobUrl
            ? <iframe className="pp-pdf-frame" src={blobUrl} title={title} />
            : <div style={{ padding: 24, color: 'var(--pp-text-muted)' }}>Loading…</div>}
      </div>
    </div>
  )
}
