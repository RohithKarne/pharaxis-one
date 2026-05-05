import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import VaultRecordHeader from '../components/VaultRecordHeader'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

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

      apiJson('/api/reach', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content_id: Number(id), view_type: 'view' })
      }).catch(() => {})

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
        <VaultRecordHeader
          eyebrow="Library / Controlled Preview"
          title={content?.title || 'Document Viewer'}
          subtitle={`${content?.doc_number || '-'} · ${versionId ? `Version #${versionId}` : 'Current Version'}`}
          lifecycleState={content?.lifecycle_state}
          metadata={[
            { label: 'Preview Mode', value: viewPayload?.mode || 'Loading' },
            { label: 'Watermark', value: watermarkText || 'None' },
            { label: 'Version', value: versionId || 'Current' },
            { label: 'Policy', value: 'Controlled Access' }
          ]}
          actions={[
            { label: 'Back to Detail', icon: 'back', to: `/vault/content/${id}` },
            { label: 'Search Library', icon: 'view', to: '/vault/search' }
          ]}
        />

        <section className="panel span-12 vault-viewer-panel">
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
