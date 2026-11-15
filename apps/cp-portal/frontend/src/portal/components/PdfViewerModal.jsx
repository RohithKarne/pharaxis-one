import { useState, useEffect } from 'react'
import { useFocusTrap } from '../../shared/hooks/useFocusTrap'

/**
 * PdfViewerModal — views a PDF inline using the browser's native renderer.
 * Fetches the file as an authenticated blob (portal auth via cookie + optional
 * bearer token), then shows it in an iframe. Falls back to a Download link.
 */
export default function PdfViewerModal({ url, downloadUrl, title, onClose }) {
  const [blobUrl, setBlobUrl] = useState('')
  const [error, setError] = useState('')
  const [isNonPdf, setIsNonPdf] = useState(false)

  useEffect(() => {
    let objectUrl = ''
    let cancelled = false
    fetch(url, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Unable to open this document.'); return r.blob() })
      .then(b => {
        if (!cancelled) {
          if (/\.(docx?|xlsx?|pptx?)$/i.test(title || '') || (b.type && !b.type.includes('pdf') && !b.type.includes('octet-stream'))) {
            setIsNonPdf(true)
          } else {
            objectUrl = URL.createObjectURL(b)
            setBlobUrl(objectUrl)
          }
        }
      })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, title])

  const trapRef = useFocusTrap(true, onClose)

  return (
    <div className="pp-pdf-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="pp-pdf-modal" ref={trapRef} onClick={e => e.stopPropagation()}>
        <div className="pp-pdf-head">
          <b>{title}</b>
          {downloadUrl && <a href={downloadUrl}>Download</a>}
          <button type="button" onClick={onClose}>Close</button>
        </div>
        {error ? (
          <div style={{ padding: 24, color: '#C0392B', fontSize: 14 }}>{error}</div>
        ) : isNonPdf ? (
          <div style={{ padding: 36, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
            <h3 style={{ marginBottom: 8, fontSize: 16 }}>{title}</h3>
            <p style={{ color: 'var(--pp-text-muted)', marginBottom: 20, fontSize: 13 }}>
              Word documents cannot be previewed directly in the browser. Please download the file to view its contents.
            </p>
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="pp-btn pp-btn-primary"
                style={{ display: 'inline-block', padding: '10px 24px', textDecoration: 'none', borderRadius: 6, fontWeight: 600 }}
              >
                Download Document
              </a>
            )}
          </div>
        ) : blobUrl ? (
          <iframe className="pp-pdf-frame" src={blobUrl} title={title} />
        ) : (
          <div style={{ padding: 24, color: 'var(--pp-text-muted)' }}>Loading…</div>
        )}
      </div>
    </div>
  )
}
