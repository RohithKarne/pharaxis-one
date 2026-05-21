/**
 * AttachmentTagPicker — Sprint 2 #14.
 *
 * Inline picker that lets an operator assign a document_type, add free-form
 * tags, and mark which fields this attachment is the source for. Renders as a
 * compact popover triggered from AttachmentGallery tile.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function AttachmentTagPicker({ attachmentId, onClose, onChanged }) {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [att, setAtt] = useState(null)
  const [types, setTypes] = useState([])
  const [tags, setTags] = useState([])
  const [newTag, setNewTag] = useState('')
  const [sourceForRows, setSourceForRows] = useState([])

  const load = useCallback(async () => {
    const [a, t, tg] = await Promise.all([
      httpFetch(`/api/attachments/${attachmentId}`, { headers: H }).then(r => r.json()),
      httpFetch('/api/document-types/grouped', { headers: H }).then(r => r.json()),
      httpFetch(`/api/attachments/${attachmentId}/tags`, { headers: H }).then(r => r.json()),
    ])
    setAtt(a)
    setTypes(t.groups || [])
    setTags(tg.tags || [])
    setSourceForRows(safeJson(a.source_for_json) || [])
  }, [attachmentId, H])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (attachmentId) load() }, [attachmentId, load])

  async function setDocumentType(id) {
    await httpFetch(`/api/attachments/${attachmentId}/document-type`, {
      method: 'PUT', headers: H, body: JSON.stringify({ document_type_id: id || null }),
    })
    load(); onChanged?.()
  }

  async function addTag() {
    if (!newTag.trim()) return
    await httpFetch(`/api/attachments/${attachmentId}/tags`, {
      method: 'POST', headers: H, body: JSON.stringify({ tag: newTag.trim() }),
    })
    setNewTag(''); load()
  }
  async function removeTag(tag) {
    await httpFetch(`/api/attachments/${attachmentId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE', headers: H,
    })
    load()
  }

  function addSourceForRow() {
    setSourceForRows(rs => [...rs, { section_name: '', field_name: '', entity_type: 'case', entity_id: '' }])
  }
  function updateRow(i, key, value) {
    setSourceForRows(rs => rs.map((r, idx) => idx === i ? { ...r, [key]: value } : r))
  }
  function removeRow(i) { setSourceForRows(rs => rs.filter((_, idx) => idx !== i)) }
  async function saveSourceFor() {
    const cleaned = sourceForRows.filter(r => r.field_name && r.entity_id)
    await httpFetch(`/api/attachments/${attachmentId}/source-for`, {
      method: 'PUT', headers: H, body: JSON.stringify({ source_for: cleaned }),
    })
    onChanged?.()
  }

  if (!att) return null

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
        background: 'var(--surface,#fff)', borderRadius: 10, padding: 18,
        boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
      }}>
        <h3 style={{ margin: 0, marginBottom: 4 }}>{att.original_name}</h3>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
          {att.mime_type} · {fmtSize(att.size_bytes)}
        </div>

        <Section title="Document type">
          <select value={att.document_type_id || ''} onChange={e => setDocumentType(e.target.value ? Number(e.target.value) : null)} style={ipt}>
            <option value="">— Untagged —</option>
            {types.map(g => (
              <optgroup key={g.code} label={g.label}>
                {g.types.map(t => <option key={t.id} value={t.id}>{t.label}{t.requires_pii_redaction ? ' 🔒' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </Section>

        <Section title="Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tags yet.</span>}
            {tags.map(t => (
              <span key={t.tag} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: 'var(--accent-soft,#eaf2ff)', color: 'var(--accent,#1a4f9c)',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {t.tag}
                <button onClick={() => removeTag(t.tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={newTag} onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="Add tag..." style={{ ...ipt, flex: 1 }} />
            <button onClick={addTag} style={primaryBtn}>Add</button>
          </div>
        </Section>

        <Section title="Source for which fields?">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            Mark which case fields this attachment is the source of. Inspectors use this trail.
          </div>
          {sourceForRows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input value={r.section_name || ''} onChange={e => updateRow(i, 'section_name', e.target.value)} placeholder="section" style={{ ...ipt, flex: 1, fontSize: 11 }} />
              <input value={r.field_name || ''}   onChange={e => updateRow(i, 'field_name', e.target.value)}   placeholder="field"   style={{ ...ipt, flex: 1, fontSize: 11 }} />
              <input value={r.entity_id || ''}    onChange={e => updateRow(i, 'entity_id', e.target.value)}    placeholder="case_id" style={{ ...ipt, width: 80, fontSize: 11 }} />
              <button onClick={() => removeRow(i)} style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#b91c1c' }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={addSourceForRow} style={ghostBtn}>+ Add</button>
            <button onClick={saveSourceFor} style={primaryBtn}>Save source links</button>
          </div>
        </Section>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ margin: 0, marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</h4>
      {children}
    </div>
  )
}
function safeJson(v) { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v) } catch { return null } }
function fmtSize(b) { if (!b) return '–'; const u = ['B','KB','MB','GB']; let i=0,n=b; while (n>=1024 && i<u.length-1) { n/=1024; i++ } return `${n.toFixed(n<10?1:0)} ${u[i]}` }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '6px 12px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
