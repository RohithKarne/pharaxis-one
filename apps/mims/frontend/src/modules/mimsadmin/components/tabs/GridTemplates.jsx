/**
 * GridTemplates.jsx — MIMS Admin > System > Setup > Grid Section Templates
 *
 * Theme 7 admin UI (Wave 2). Manage reusable row templates for multi-row
 * grid sections (e.g. "5 standard MedDRA codes", "Default concomitant meds").
 * Backed by /api/admin/grid-templates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

export default function GridTemplates() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [items, setItems] = useState([])
  const [edit, setEdit]   = useState(null)
  const [flash, setFlash] = useState(null)
  const [filterSection, setFilterSection] = useState('')

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    try {
      const url = `/api/admin/grid-templates${filterSection ? `?section=${encodeURIComponent(filterSection)}` : ''}`
      const d = await httpFetch(url, { headers: H }).then(r => r.json())
      setItems(d.templates || [])
    } catch { setItems([]) }
  }, [H, filterSection])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function save() {
    if (!edit?.section_name || !edit?.name) { showFlash('Section and name required', 'error'); return }
    let rowsJson = edit.rows_json
    if (typeof rowsJson === 'string') {
      try { rowsJson = JSON.parse(rowsJson) }
      catch { showFlash('rows_json is not valid JSON', 'error'); return }
    }
    try {
      const r = await httpFetch('/api/admin/grid-templates', {
        method: 'POST', headers: H,
        body: JSON.stringify({ ...edit, rows_json: rowsJson }),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function del(id) {
    if (!confirm('Delete template?')) return
    await httpFetch(`/api/admin/grid-templates/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deleted'); load()
  }
  function newTpl() {
    setEdit({
      org_id: null, section_name: '', name: '', description: '',
      rows_json: JSON.stringify([{ field_a: '', field_b: '' }], null, 2),
    })
  }

  return (
    <div style={shell}>
      <Header flash={flash} title="Grid Section Templates"
        sub="Reusable rows for multi-row grid sections (concomitant meds, MedDRA codes, etc.)" />
      <div style={{ padding: '12px 24px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={filterSection} onChange={e => setFilterSection(e.target.value)}
          placeholder="Filter by section name…" style={{ ...ipt, maxWidth: 260 }} />
        <span style={{ flex: 1 }} />
        <button onClick={newTpl} style={primaryBtn}>+ New template</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
        {items.length === 0 && <div style={{ padding: 20, color: 'var(--text-muted)' }}>No templates.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {items.map(t => (
            <div key={t.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13 }}>{t.name}</strong>
                <span style={chip(t.org_id == null ? '#1a7a3f' : '#1a4f9c')}>
                  {t.org_id == null ? 'global' : 'org'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                section: <strong>{t.section_name}</strong>
              </div>
              {t.description && (
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }}>{t.description}</div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {(safeArr(t.rows_json)?.length || 0)} row{(safeArr(t.rows_json)?.length || 0) === 1 ? '' : 's'}
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <button onClick={() => setEdit({ ...t, rows_json: JSON.stringify(safeArr(t.rows_json) || [], null, 2) })} style={miniBtn()}>Edit</button>
                <button onClick={() => del(t.id)} style={miniBtn('#b91c1c')}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {edit && (
        <div onClick={() => setEdit(null)} style={modalBg}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalCard, width: 640 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>{edit.id ? 'Edit' : 'New'} grid template</h3>
            <Row>
              <Field label="Section name"><input value={edit.section_name}
                onChange={e => setEdit({ ...edit, section_name: e.target.value })} style={ipt} /></Field>
              <Field label="Name"><input value={edit.name}
                onChange={e => setEdit({ ...edit, name: e.target.value })} style={ipt} /></Field>
            </Row>
            <Field label="Description">
              <input value={edit.description || ''}
                onChange={e => setEdit({ ...edit, description: e.target.value })} style={ipt} />
            </Field>
            <Field label="Rows (JSON array of row objects)">
              <textarea value={edit.rows_json}
                onChange={e => setEdit({ ...edit, rows_json: e.target.value })}
                rows={10} style={{ ...ipt, fontFamily: 'monospace' }} />
            </Field>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
              <button onClick={save} style={primaryBtn}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function safeArr(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return v && typeof v === 'object' ? Object.values(v) : null
}

function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div> }
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
        marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  )
}

function chip(color) { return { padding: '1px 7px', borderRadius: 10, color: '#fff', background: color, fontWeight: 600, fontSize: 10 } }
function miniBtn(color = '#1a4f9c') {
  return { padding: '4px 10px', fontSize: 11, fontWeight: 600,
    border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}

const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const card  = { padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface,#fff)' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff',
  color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
const modalBg = { position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
  display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalCard = { background: 'var(--surface,#fff)', borderRadius: 10, padding: 18,
  boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }
