/**
 * GridSection — Theme 7 (Wave 2) multi-row grid section component.
 *
 * Renders a table of rows with:
 *   - Drag-drop reorder (HTML5 drag API; no extra deps)
 *   - Paste-from-spreadsheet (Cmd/Ctrl+V into the grid)
 *   - Row archive (soft-delete; toggle "show archived")
 *   - Row templates dropdown (stored via /api/admin/grid-templates)
 *   - Inline edit per cell
 *
 * Props:
 *   caseId      — required
 *   section     — required, e.g. 'concomitant_meds'
 *   columns     — [{ key, label, type?, width? }]
 *   initialRows — optional preload (else fetched from /api)
 *   readOnly?   — disables edits/drag/paste
 *   onSaved?    — (rows) => void
 *
 * Gracefully degrades when cf.theme7_multirow_grids is off (renders a notice).
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../context/FeatureFlagsContext'
import { httpFetch } from '../api/httpFetch.js'

export default function GridSection({
  caseId, section, columns = [],
  initialRows, readOnly = false, onSaved,
}) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme7_multirow_grids')
  const H = useMemo(() => ({
    'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
  }), [token])

  const [rows, setRows]               = useState(initialRows || [])
  const [loading, setLoading]         = useState(!initialRows)
  const [showArchived, setShowArch]   = useState(false)
  const [templates, setTemplates]     = useState([])
  const [showTemplates, setShowTpls]  = useState(false)
  const [busy, setBusy]               = useState(false)
  const [flash, setFlash]             = useState(null)
  const dragKey = useRef(null)

  // Load rows
  useEffect(() => {
    if (initialRows || !caseId || !section || !enabled) return
    setLoading(true)
    const url = `/api/cases/${caseId}/grid/${section}${showArchived ? '?archived=1' : ''}`
    httpFetch(url, { headers: H })
      .then(r => r.json())
      .then(d => setRows((d.rows || []).map(r => ({ ...r.row_json, _id: r.id, _archived: !!r.archived }))))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [caseId, section, enabled, showArchived, initialRows, H])

  // Load templates list
  useEffect(() => {
    if (!enabled) return
    httpFetch(`/api/admin/grid-templates?section=${encodeURIComponent(section)}`, { headers: H })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => setTemplates([]))
  }, [section, enabled, H])

  // ── Mutations ────────────────────────────────────────────────────────────
  function patchCell(idx, key, value) {
    setRows(rs => { const c = [...rs]; c[idx] = { ...c[idx], [key]: value }; return c })
  }
  function addRow() {
    setRows(rs => [...rs, columns.reduce((o, c) => ({ ...o, [c.key]: '' }), {})])
  }
  function removeRow(idx) {
    setRows(rs => rs.filter((_, i) => i !== idx))
  }
  function archiveRow(idx) {
    setRows(rs => { const c = [...rs]; c[idx] = { ...c[idx], _archived: true }; return c })
  }
  function unarchiveRow(idx) {
    setRows(rs => { const c = [...rs]; c[idx] = { ...c[idx], _archived: false }; return c })
  }

  // ── Drag-drop reorder ────────────────────────────────────────────────────
  function onDragStart(i)   { dragKey.current = i }
  function onDragOver(e)    { e.preventDefault() }
  function onDrop(i) {
    const src = dragKey.current
    if (src == null || src === i) return
    setRows(rs => {
      const c = [...rs]
      const [moved] = c.splice(src, 1)
      c.splice(i, 0, moved)
      return c
    })
    dragKey.current = null
  }

  // ── Paste from spreadsheet ───────────────────────────────────────────────
  async function onPaste(e) {
    if (readOnly || !enabled) return
    const text = (e.clipboardData || window.clipboardData)?.getData('text')
    if (!text || !text.includes('\t')) return
    e.preventDefault()
    setBusy(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/grid/${section}/paste`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ text, headers: columns.map(c => c.key) }),
      })
      const d = await r.json()
      setRows(rs => [...rs, ...(d.rows || [])])
      showFlash(`Pasted ${d.rows?.length || 0} rows`)
    } finally { setBusy(false) }
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (readOnly) return
    setBusy(true)
    try {
      const payload = rows
        .filter(r => !r._archived)
        .map(r => {
          const row_json = { ...r }; delete row_json._id; delete row_json._archived
          return r._id ? { id: r._id, row_json } : { row_json }
        })
      const r = await httpFetch(`/api/cases/${caseId}/grid/${section}`, {
        method: 'PUT', headers: H, body: JSON.stringify({ rows: payload }),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved')
      onSaved?.(rows)
    } finally { setBusy(false) }
  }, [rows, caseId, section, H, readOnly, onSaved])

  // ── Templates ────────────────────────────────────────────────────────────
  async function applyTemplate(t) {
    setShowTpls(false); setBusy(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/grid/${section}/apply-template`, {
        method: 'POST', headers: H, body: JSON.stringify({ template_id: t.id }),
      })
      const d = await r.json()
      setRows(rs => [...rs, ...(d.rows || [])])
      showFlash(`Applied template: ${t.name}`)
    } finally { setBusy(false) }
  }

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 2500)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        Multi-row grid sections aren't enabled for this tenant. Ask an admin to turn on
        <strong> cf.theme7_multirow_grids</strong> in System &gt; Setup &gt; Feature Flags.
      </div>
    )
  }

  return (
    <div onPaste={onPaste} style={{ padding: '10px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
          {section.replace(/_/g, ' ')}
        </strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {rows.filter(r => !r._archived).length} row{rows.filter(r => !r._archived).length === 1 ? '' : 's'}
          {rows.some(r => r._archived) && ` · ${rows.filter(r => r._archived).length} archived`}
        </span>
        <span style={{ flex: 1 }} />
        {flash && (
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
          }}>{flash.msg}</span>
        )}
        {!readOnly && (
          <>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArch(e.target.checked)} />{' '}
              Show archived
            </label>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowTpls(s => !s)} style={btn()}>Templates ▾</button>
              {showTemplates && templates.length > 0 && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', zIndex: 20, marginTop: 4,
                  background: 'var(--surface,#fff)', border: '1px solid var(--border)',
                  borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  minWidth: 220,
                }}>
                  {templates.map(t => (
                    <div key={t.id}
                      onClick={() => applyTemplate(t)}
                      style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                        borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      {t.description && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={addRow} style={btn()}>+ Add row</button>
            <button onClick={save} disabled={busy} style={btn('#1a7a3f', true)}>Save</button>
          </>
        )}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
              <th style={{ ...th, width: 24 }}></th>
              {columns.map(c => (
                <th key={c.key} style={{ ...th, width: c.width || 'auto' }}>{c.label}</th>
              ))}
              {!readOnly && <th style={{ ...th, width: 80, textAlign: 'right' }}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r._id ?? `new-${i}`}
                draggable={!readOnly}
                onDragStart={() => onDragStart(i)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(i)}
                style={{
                  borderTop: '1px solid var(--border)',
                  background: r._archived ? '#fafafa' : 'transparent',
                  opacity:    r._archived ? 0.55 : 1,
                }}
              >
                <td style={{ ...td, cursor: readOnly ? 'default' : 'grab', textAlign: 'center', color: 'var(--text-muted)' }}>
                  ⋮⋮
                </td>
                {columns.map(c => (
                  <td key={c.key} style={td}>
                    {readOnly ? (
                      <span>{r[c.key] ?? ''}</span>
                    ) : (
                      <input
                        type={c.type || 'text'}
                        value={r[c.key] ?? ''}
                        onChange={e => patchCell(i, c.key, e.target.value)}
                        style={{
                          width: '100%', padding: '4px 6px', fontSize: 12,
                          border: '1px solid transparent', borderRadius: 4,
                          background: 'transparent',
                        }}
                        onFocus={e => e.target.style.border = '1px solid var(--border)'}
                        onBlur={e => e.target.style.border = '1px solid transparent'}
                      />
                    )}
                  </td>
                ))}
                {!readOnly && (
                  <td style={{ ...td, textAlign: 'right' }}>
                    {r._archived ? (
                      <button onClick={() => unarchiveRow(i)} style={miniBtn()}>↩</button>
                    ) : (
                      <button onClick={() => archiveRow(i)}   style={miniBtn()} title="Archive">⌫</button>
                    )}
                    <button onClick={() => removeRow(i)} style={miniBtn('#b91c1c')} title="Delete">✕</button>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} style={{ ...td, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  No rows yet. {!readOnly && 'Click "+ Add row" or paste from spreadsheet (⌘V).'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

const th = { padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '4px 8px' }

function btn(color = '#1a4f9c', filled = false) {
  return {
    padding: '5px 10px', fontSize: 12, fontWeight: 600,
    border: `1px solid ${color}`, borderRadius: 4, cursor: 'pointer',
    background: filled ? color : 'transparent', color: filled ? '#fff' : color,
  }
}
function miniBtn(color = '#777') {
  return {
    padding: '3px 7px', fontSize: 11, marginLeft: 4, cursor: 'pointer',
    background: 'transparent', border: `1px solid ${color}`, color, borderRadius: 4,
  }
}
