/**
 * DropzoneUpload — Theme 6 drag-drop upload zone (Wave 3).
 *
 * Accepts drag-drop OR click-to-select. Uploads each file to
 * POST /api/attachments (multipart) with entity_type+entity_id (+ optional field).
 *
 * Props:
 *   entityType, entityId  — required
 *   field?                — optional, marks attachment as per-field
 *   accept?               — MIME filter, e.g. 'image/*,application/pdf'
 *   maxFiles?             — soft cap, defaults to 10 per drop
 *   onUploaded?           — (attachment) => void, fired once per successful upload
 *   label?                — header text
 */

import { useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function DropzoneUpload({
  entityType, entityId, field = null,
  accept, maxFiles = 10,
  onUploaded, label = 'Drop files here',
}) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme6_documents')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState([])
  const inputRef = useRef(null)

  async function uploadOne(file) {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('entity_type', entityType)
    fd.append('entity_id', String(entityId))
    if (field) fd.append('field_name', field)
    const r = await httpFetch('/api/attachments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // no Content-Type — let FormData set boundary
      body: fd,
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, maxFiles)
    if (!files.length) return
    setBusy(true); setProgress(files.map(f => ({ name: f.name, status: 'uploading' })))
    for (let i = 0; i < files.length; i++) {
      try {
        const att = await uploadOne(files[i])
        setProgress(p => { const c = [...p]; c[i] = { name: files[i].name, status: 'done', id: att.id }; return c })
        onUploaded?.(att)
      } catch (err) {
        setProgress(p => { const c = [...p]; c[i] = { name: files[i].name, status: 'error', err: err.message }; return c })
      }
    }
    setBusy(false)
    setTimeout(() => setProgress([]), 3500)
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  if (!enabled) return null

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent,#1a4f9c)' : 'var(--border)'}`,
          background: dragging ? 'var(--accent-soft,#eaf2ff)' : 'var(--surface-alt,#fafafa)',
          padding: '20px 16px', borderRadius: 8, textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.15s ease-out',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 6 }}>📎</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          or click to choose · up to {maxFiles} files
        </div>
        <input
          ref={inputRef} type="file" multiple accept={accept}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </div>
      {progress.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          {progress.map((p, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '4px 8px',
              color: p.status === 'error' ? '#b91c1c' : 'var(--text-secondary)',
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span>{p.status === 'done' ? '✓' : p.status === 'error' ? '✗' : '…'}</span>
            </div>
          ))}
        </div>
      )}
      {busy && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>Uploading…</div>}
    </div>
  )
}
