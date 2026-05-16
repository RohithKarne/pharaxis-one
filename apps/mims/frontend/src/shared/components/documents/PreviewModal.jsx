/**
 * PreviewModal — Theme 6 (Wave 3) attachment preview modal.
 *
 * Handles image, PDF, and text previews. Falls back to a download link for
 * other types. Uses native <iframe> for PDFs — no PDF.js dep.
 *
 * Props:
 *   attachment  — { id, original_name, mime_type, ... } or null
 *   onClose     — () => void
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function PreviewModal({ attachment, onClose }) {
  const { token } = useAuth()
  const [ocrOpen, setOcrOpen] = useState(false)
  const [ocrText, setOcrText] = useState(null)

  useEffect(() => {
    if (!attachment) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attachment, onClose])

  useEffect(() => {
    setOcrText(null); setOcrOpen(false)
    if (!attachment) return
  }, [attachment])

  async function loadOcr() {
    setOcrOpen(true)
    if (ocrText != null) return
    try {
      const r = await fetch(`/api/attachments/${attachment.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setOcrText(d.ocr_text || '(no OCR text yet)')
    } catch { setOcrText('(failed to load)') }
  }

  if (!attachment) return null
  const mt  = (attachment.mime_type || '').toLowerCase()
  const url = `/api/attachments/${attachment.id}/content`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,18,24,0.72)',
        zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface,#fff)', borderRadius: 8, overflow: 'hidden',
          width: 880, maxWidth: '94vw', height: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 18px 64px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid var(--border)',
        }}>
          <strong style={{ flex: 1, fontSize: 14 }}>{attachment.original_name}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{mt}</span>
          {(attachment.ocr_status === 'done' || attachment.ocr_status === 'pending') && (
            <button onClick={loadOcr} style={btn()}>OCR text</button>
          )}
          <a href={url} download={attachment.original_name} style={{ ...btn(), textDecoration: 'none' }}>↓ Download</a>
          <button onClick={onClose} style={btn('#b91c1c')}>Close</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1, background: '#1a1f2b', display: 'flex',
            alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            {mt.startsWith('image/') && (
              <img src={url} alt={attachment.original_name} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            )}
            {mt === 'application/pdf' && (
              <iframe title={attachment.original_name} src={url} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            )}
            {!mt.startsWith('image/') && mt !== 'application/pdf' && (
              <div style={{ color: '#fff', textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 56 }}>📎</div>
                <div style={{ marginTop: 10 }}>Preview not available for this file type.</div>
              </div>
            )}
          </div>
          {ocrOpen && (
            <div style={{
              width: 320, padding: 14, background: 'var(--surface-alt,#fafafa)',
              borderLeft: '1px solid var(--border)', overflowY: 'auto', fontSize: 12,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>OCR extracted text</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{ocrText ?? 'Loading…'}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function btn(color = '#1a4f9c') {
  return {
    padding: '4px 10px', fontSize: 12, fontWeight: 600,
    border: `1px solid ${color}`, borderRadius: 4, cursor: 'pointer',
    background: '#fff', color,
  }
}
