/**
 * DocumentTypesAdmin.jsx — Sprint 2 #15 admin UI.
 *
 * Manages document-type categories + types under System > Setup > Document Types.
 * Categories are 8 seeded globally + optional org-scoped extras.
 * Types are seeded per category + tenant adds their own.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

export default function DocumentTypesAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [categories, setCategories] = useState([])
  const [types, setTypes] = useState([])
  const [selectedCat, setSelectedCat] = useState(null)
  const [flash, setFlash] = useState(null)
  const [editCat, setEditCat] = useState(null)
  const [editType, setEditType] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const loadCats = useCallback(async () => {
    const d = await httpFetch('/api/admin/document-type-categories', { headers: H }).then(r => r.json())
    setCategories(d.categories || [])
  }, [H])
  const loadTypes = useCallback(async (catId) => {
    const url = catId ? `/api/admin/document-types?category_id=${catId}` : '/api/admin/document-types'
    const d = await httpFetch(url, { headers: H }).then(r => r.json())
    setTypes(d.types || [])
  }, [H])

  useEffect(() => { loadCats() }, [loadCats])
  useEffect(() => { if (selectedCat) loadTypes(selectedCat.id); else setTypes([]) }, [selectedCat, loadTypes])

  async function saveCat() {
    if (!editCat?.code || !editCat?.label) { showFlash('code + label required', 'error'); return }
    try {
      const r = await httpFetch('/api/admin/document-type-categories', {
        method: 'POST', headers: H, body: JSON.stringify(editCat),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEditCat(null); loadCats()
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function saveType() {
    if (!editType?.code || !editType?.label || !editType?.category_id) { showFlash('code + label + category required', 'error'); return }
    try {
      const r = await httpFetch('/api/admin/document-types', {
        method: 'POST', headers: H, body: JSON.stringify(editType),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEditType(null); if (selectedCat) loadTypes(selectedCat.id)
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function delCat(id) {
    if (!confirm('Deactivate category? (Soft delete — existing references stay readable)')) return
    await httpFetch(`/api/admin/document-type-categories/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deactivated'); loadCats()
  }
  async function delType(id) {
    if (!confirm('Deactivate type?')) return
    await httpFetch(`/api/admin/document-types/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deactivated'); if (selectedCat) loadTypes(selectedCat.id)
  }

  return (
    <div style={shell}>
      <Header flash={flash} title="Document Types"
        sub="Source-document taxonomy used by attachments, MI documents, and PC investigation reports." />
      <div style={body}>
        {/* Left: Categories */}
        <div style={leftCol}>
          <div style={{ padding: 12 }}>
            <button onClick={() => setEditCat({ org_id: null, code: '', label: '', description: '', sort_order: 0, is_active: 1 })} style={primaryBtn}>+ New category</button>
          </div>
          {categories.map(c => (
            <div key={c.id} onClick={() => setSelectedCat(c)} style={{
              padding: '8px 12px', borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              background: selectedCat?.id === c.id ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
              opacity: c.is_active ? 1 : 0.5,
            }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{c.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                <code>{c.code}</code>
                {c.org_id == null && <span style={chip('#1a7a3f')}>global</span>}
                {!c.is_active && <span style={chip('#b91c1c')}>inactive</span>}
              </div>
              {(c.org_id != null) && (
                <div style={{ marginTop: 4 }}>
                  <button onClick={(e) => { e.stopPropagation(); setEditCat({ ...c }) }} style={miniBtn()}>Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); delCat(c.id) }} style={miniBtn('#b91c1c')}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: Types */}
        <div style={rightCol}>
          {!selectedCat && <div style={emptyState}>Pick a category on the left.</div>}
          {selectedCat && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17 }}>{selectedCat.label}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}><code>{selectedCat.code}</code></div>
                </div>
                <button onClick={() => setEditType({ org_id: null, category_id: selectedCat.id, code: '', label: '', description: '', retention_days: null, requires_pii_redaction: 0, sort_order: 0, is_active: 1 })} style={primaryBtn}>+ New type</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
                  <th style={th}>Code</th><th style={th}>Label</th><th style={th}>PII Redaction</th>
                  <th style={th}>Retention</th><th style={th}>Scope</th><th style={{ ...th, textAlign: 'right' }}></th>
                </tr></thead>
                <tbody>
                  {types.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>No types yet.</td></tr>
                  )}
                  {types.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)', opacity: t.is_active ? 1 : 0.5 }}>
                      <td style={td}><code>{t.code}</code></td>
                      <td style={td}><strong>{t.label}</strong></td>
                      <td style={td}>{t.requires_pii_redaction ? '🔒 required' : '–'}</td>
                      <td style={td}>{t.retention_days ? `${t.retention_days}d` : '–'}</td>
                      <td style={td}>{t.org_id == null ? 'Global' : 'Org'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {t.org_id != null && (
                          <>
                            <button onClick={() => setEditType({ ...t })} style={miniBtn()}>Edit</button>
                            <button onClick={() => delType(t.id)} style={miniBtn('#b91c1c')}>×</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* Category modal */}
      {editCat && (
        <Modal title={editCat.id ? 'Edit category' : 'New category'} onClose={() => setEditCat(null)}>
          <Row>
            <Field label="Code"><input value={editCat.code} onChange={e => setEditCat({ ...editCat, code: e.target.value })} style={ipt} disabled={!!editCat.id} /></Field>
            <Field label="Label"><input value={editCat.label} onChange={e => setEditCat({ ...editCat, label: e.target.value })} style={ipt} /></Field>
          </Row>
          <Field label="Description"><input value={editCat.description || ''} onChange={e => setEditCat({ ...editCat, description: e.target.value })} style={ipt} /></Field>
          <Row>
            <Field label="Sort Order"><input type="number" value={editCat.sort_order || 0} onChange={e => setEditCat({ ...editCat, sort_order: Number(e.target.value) || 0 })} style={ipt} /></Field>
            <Field label="Active">
              <label><input type="checkbox" checked={!!editCat.is_active} onChange={e => setEditCat({ ...editCat, is_active: e.target.checked ? 1 : 0 })} /> Active</label>
            </Field>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => setEditCat(null)} style={ghostBtn}>Cancel</button>
            <button onClick={saveCat} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}

      {/* Type modal */}
      {editType && (
        <Modal title={editType.id ? 'Edit type' : 'New type'} onClose={() => setEditType(null)}>
          <Row>
            <Field label="Code"><input value={editType.code} onChange={e => setEditType({ ...editType, code: e.target.value })} style={ipt} disabled={!!editType.id} /></Field>
            <Field label="Label"><input value={editType.label} onChange={e => setEditType({ ...editType, label: e.target.value })} style={ipt} /></Field>
          </Row>
          <Field label="Description"><input value={editType.description || ''} onChange={e => setEditType({ ...editType, description: e.target.value })} style={ipt} /></Field>
          <Row>
            <Field label="Retention (days)"><input type="number" value={editType.retention_days || ''} onChange={e => setEditType({ ...editType, retention_days: e.target.value ? Number(e.target.value) : null })} style={ipt} /></Field>
            <Field label="Sort Order"><input type="number" value={editType.sort_order || 0} onChange={e => setEditType({ ...editType, sort_order: Number(e.target.value) || 0 })} style={ipt} /></Field>
          </Row>
          <Row>
            <Field label="Requires PII redaction">
              <label><input type="checkbox" checked={!!editType.requires_pii_redaction} onChange={e => setEditType({ ...editType, requires_pii_redaction: e.target.checked ? 1 : 0 })} /> Yes</label>
            </Field>
            <Field label="Active">
              <label><input type="checkbox" checked={!!editType.is_active} onChange={e => setEditType({ ...editType, is_active: e.target.checked ? 1 : 0 })} /> Active</label>
            </Field>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => setEditType(null)} style={ghostBtn}>Cancel</button>
            <button onClick={saveType} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Shared bits ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 540, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div> }
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
      {children}
    </div>
  )
}
function chip(color) { return { padding: '1px 7px', borderRadius: 10, color: '#fff', background: color, fontWeight: 600, fontSize: 10, marginLeft: 4 } }
function miniBtn(color = '#1a4f9c') {
  return { padding: '3px 8px', marginRight: 4, fontSize: 11, fontWeight: 600, border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}
const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const body = { display: 'flex', flex: 1, overflow: 'hidden' }
const leftCol = { width: 280, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface-alt,#fafafa)' }
const rightCol = { flex: 1, padding: '18px 24px', overflowY: 'auto' }
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '6px 10px' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
const emptyState = { padding: 40, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }
