/**
 * AttachmentGallery — Theme 6 (Wave 3) attachment tile grid.
 *
 * Loads attachments for an entity (case, or any entity_type+id), groups them
 * by field_name, and renders thumbnails (or generic icons). Click → open in
 * PdfPreview / PreviewModal.
 *
 * Props:
 *   entityType, entityId
 *   field?    — restrict to a single per-field group
 *   onOpen?   — (attachment) => void
 *   compact?  — small tile mode
 */

import { useCallback, useEffect, useState } from 'react'
import AttachmentTagPicker from './AttachmentTagPicker'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function AttachmentGallery({
  entityType, entityId, field = null,
  onOpen, compact = false, reloadKey, readOnly = false,
}) {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tagPicker, setTagPicker] = useState(null) // Sprint 2 #14

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        entity_type: entityType, entity_id: String(entityId),
      })
      if (field) params.set('field', field)
      const r = await httpFetch(`/api/attachments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setItems(d.attachments || [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [entityType, entityId, field, token])

  useEffect(() => { load() }, [load, reloadKey])

  // No screen passed onOpen, so a file on a case could be seen but never opened.
  // Default: download it with the user's session — the server serves case files as
  // downloads, and a download is not stopped by a pop-up blocker.
  async function openFile(a) {
    if (onOpen) return onOpen(a)
    const r = await httpFetch(`/api/attachments/${a.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) { alert('This file could not be opened.'); return }
    const url = URL.createObjectURL(await r.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = a.original_name || 'attachment'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function del(id) {
    if (!confirm('Delete attachment?')) return
    await httpFetch(`/api/attachments/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
  if (!items.length) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No attachments.</div>

  const size = compact ? 84 : 132
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: `repeat(auto-fill, minmax(${size + 14}px, 1fr))`,
    }}>
      {items.map(a => (
        <div key={a.id} style={{
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--surface,#fff)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div
            onClick={() => openFile(a)}
            style={{
              position: 'relative', height: size, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#f4f5f8',
            }}
          >
            <Thumb attachment={a} token={token} />
            {a.ocr_status === 'done' && (
              <span style={{
                position: 'absolute', top: 4, left: 4, fontSize: 9, fontWeight: 700,
                padding: '1px 5px', borderRadius: 8, background: '#1a7a3f', color: '#fff',
              }}>OCR</span>
            )}
          </div>
          <div style={{ padding: '6px 8px', fontSize: 11 }}>
            <div title={a.original_name} style={{
              fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>{a.original_name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginTop: 2 }}>
              <span>{fmtSize(a.size_bytes)}</span>
              {!readOnly && <span style={{ display: 'flex', gap: 4 }}>
                {/* Sprint 2 #14 — open tag/source picker */}
                <button onClick={(e) => { e.stopPropagation(); setTagPicker(a.id) }} title="Tag / source" style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--accent,#1a4f9c)', fontSize: 11,
                }}>Tag</button>
                <button onClick={() => del(a.id)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#b91c1c', fontSize: 11,
                }}>✕</button>
              </span>}
            </div>
          </div>
        </div>
      ))}
      {tagPicker && (
        <AttachmentTagPicker
          attachmentId={tagPicker}
          onClose={() => setTagPicker(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  )
}

function Thumb({ attachment }) {
  const mt = (attachment.mime_type || '').toLowerCase()
  const isImg = mt.startsWith('image/')
  const isPdf = mt === 'application/pdf'
  const url = `/api/attachments/${attachment.id}/thumb`
  if (isImg || isPdf) {
    return (
      <img
        src={url}
        alt={attachment.original_name}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    )
  }
  return <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{icon(mt)}</div>
}

function icon(mt) {
  if (mt.includes('word') || mt.includes('document')) return 'DOC'
  if (mt.includes('sheet') || mt.includes('excel'))    return 'XLS'
  if (mt.includes('zip') || mt.includes('compressed')) return 'ZIP'
  if (mt.startsWith('audio/'))                          return 'AUDIO'
  if (mt.startsWith('video/'))                          return 'VIDEO'
  return 'FILE'
}
function fmtSize(b) {
  if (!b) return '–'
  const u = ['B','KB','MB','GB']; let i = 0; let n = b
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${u[i]}`
}
