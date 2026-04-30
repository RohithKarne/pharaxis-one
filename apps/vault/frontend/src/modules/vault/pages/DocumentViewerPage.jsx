import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken, lifecycleBadgeClass } from '../../common/utils/session'

const WATERMARK_HINT = {
  draft: 'DRAFT - Not for Distribution',
  in_review: 'UNDER REVIEW - Not for Distribution',
  approved: 'APPROVED',
  published: '',
  archived: 'ARCHIVED - Superseded'
}

export default function DocumentViewerPage() {
  const { id, versionId } = useParams()
  const token = getOrgToken()
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewPayload, setViewPayload] = useState(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfFileName, setPdfFileName] = useState('')

  const viewPath = useMemo(
    () => (versionId ? `/api/content/${id}/versions/${versionId}/view` : `/api/content/${id}/view`),
    [id, versionId]
  )

  useEffect(() => {
    return () => {
      if (pdfUrl) window.URL.revokeObjectURL(pdfUrl)
    }
  }, [pdfUrl])

  async function loadDocumentView() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [detail] = await Promise.all([
        apiJson(`/api/content/${id}`, { headers: authHeaders(token) })
      ])
      setContent(detail)

      const response = await fetch(viewPath, { headers: authHeaders(token) })
      if (!response.ok) {
        let message = 'Failed to load document viewer'
        try {
          const payload = await response.json()
          message = payload.error || message
        } catch {
          // ignore parse failure and keep fallback message
        }
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/pdf')) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        setPdfUrl(url)
        setPdfFileName(response.headers.get('content-disposition') || '')
        setViewPayload({ mode: 'pdf' })
      } else {
        const payload = await response.json()
        setViewPayload({ mode: 'non-pdf', ...payload })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocumentView()
  }, [id, versionId])

  function downloadNonPdf() {
    if (!viewPayload?.url) return
    window.open(viewPayload.url, '_blank', 'noopener,noreferrer')
  }

  const watermarkText = WATERMARK_HINT[String(content?.lifecycle_state || '').toLowerCase()] || ''

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Overview / Document Viewer</p>
            <h2 className="workspace-hero-title">{content?.title || 'Document Viewer'}</h2>
            <p className="panel-note">{content?.doc_number || '-'} · {versionId ? `Version #${versionId}` : 'Current Version'}</p>
          </div>
          <div className="workspace-hero-right">
            <span className={lifecycleBadgeClass(content?.lifecycle_state)}>{content?.lifecycle_state || '-'}</span>
          </div>
        </section>

        <section className="panel span-12">
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to={`/vault/content/${id}`}>
              Back to Detail
            </Link>
            <Link className="btn-secondary link-button" to="/vault/search">
              Back to Search
            </Link>
          </div>
        </section>
      </main>

      <main className="dashboard-grid">
        <section className="panel span-12">
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Opening document viewer...</p> : null}

          {!loading && viewPayload?.mode === 'pdf' ? (
            <div className="pdf-viewer-wrap">
              {watermarkText ? <div className="watermark-hint">Watermark policy: {watermarkText}</div> : null}
              {pdfUrl ? (
                <iframe
                  title={`Document ${content?.doc_number || id}`}
                  src={pdfUrl}
                  className="pdf-frame"
                />
              ) : (
                <p className="panel-note">Unable to render PDF.</p>
              )}
            </div>
          ) : null}

          {!loading && viewPayload?.mode === 'non-pdf' ? (
            <div className="panel-note">
              <p>Inline preview is available only for PDF files in this sprint.</p>
              <p>
                File: <strong>{viewPayload.file_name || content?.current_version?.file_name || 'Document file'}</strong>
              </p>
              <button className="btn-primary" onClick={downloadNonPdf}>
                Download File
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
