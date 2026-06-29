/**
 * ComplaintCodesAdmin.jsx — Sprint 2 #19 admin UI for FDA-aligned complaint codes.
 *
 * Three code families seeded globally:
 *   - Manufacturer Defect
 *   - Component / Sub-assembly Defect
 *   - Application / Use Code
 * Tenant admins extend with their own codes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

export default function ComplaintCodesAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [families, setFamilies] = useState([])
  const [activeFamily, setActiveFamily] = useState(null)
  const [codes, setCodes] = useState([])
  const [edit, setEdit] = useState(null)
  const [flash, setFlash] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([
      httpFetch('/api/complaint-codes/families', { headers: H }).then(r => r.json()),
      httpFetch('/api/admin/complaint-codes', { headers: H }).then(r => r.json()),
    ])
    setFamilies(f.families || [])
    setCodes(c.codes || [])
    if (!activeFamily && (f.families || []).length) setActiveFamily(f.families[0])
  }, [H, activeFamily])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function save() {
    if (!edit?.code || !edit?.label || !edit?.family_id) { showFlash('family + code + label required', 'error'); return }
    try {
      const r = await httpFetch('/api/admin/complaint-codes', {
        method: 'POST', headers: H, body: JSON.stringify(edit),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function del(id) {
    if (!confirm('Deactivate complaint code?')) return
    const r = await httpFetch(`/api/admin/complaint-codes/${id}`, { method: 'DELETE', headers: H })
    if (!r.ok) { showFlash('Deactivate failed', 'error'); return }  // WP7
    showFlash('Deactivated'); load()
  }

  const filtered = activeFamily ? codes.filter(c => c.family_id === activeFamily.id) : codes

  return (
    <div style={shell}>
      <Header flash={flash} title="Complaint Codes"
        sub="FDA Code 21 PFC-aligned controlled vocabulary for PC classification." />
      <div style={tabbar}>
        {families.map(f => (
          <button key={f.id} onClick={() => setActiveFamily(f)} style={{
            padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: activeFamily?.id === f.id ? 'var(--surface,#fff)' : 'var(--surface-alt,#fafafa)',
            border: 'none', borderBottom: `2px solid ${activeFamily?.id === f.id ? 'var(--accent,#1a4f9c)' : 'transparent'}`,
            color: activeFamily?.id === f.id ? 'var(--accent,#1a4f9c)' : 'var(--text-secondary)',
          }}>{f.label}</button>
        ))}
      </div>
      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setEdit({ org_id: null, family_id: activeFamily?.id, code: '', label: '', description: '', sort_order: 0, is_active: 1 })} style={primaryBtn}>+ New code</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
            <th style={th}>Code</th><th style={th}>Label</th><th style={th}>Description</th>
            <th style={th}>Scope</th><th style={{ ...th, textAlign: 'right' }}></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={5} style={{ padding: 18, color: 'var(--text-muted)', textAlign: 'center' }}>No codes.</td></tr>}
            {filtered.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--border)', opacity: c.is_active ? 1 : 0.5 }}>
                <td style={td}><code>{c.code}</code></td>
                <td style={td}><strong>{c.label}</strong></td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{c.description || '–'}</td>
                <td style={td}>{c.org_id == null ? 'Global' : 'Org'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {c.org_id != null && (<>
                    <button onClick={() => setEdit({ ...c })} style={miniBtn()}>Edit</button>
                    <button onClick={() => del(c.id)} style={miniBtn('#b91c1c')}>×</button>
                  </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit.id ? 'Edit complaint code' : 'New complaint code'} onClose={() => setEdit(null)}>
          <Field label="Family">
            <select value={edit.family_id || ''} onChange={e => setEdit({ ...edit, family_id: Number(e.target.value) })} style={ipt}>
              {families.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </Field>
          <Row>
            <Field label="Code"><input value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} style={ipt} placeholder="e.g. MD-150" disabled={!!edit.id} /></Field>
            <Field label="Sort Order"><input type="number" value={edit.sort_order || 0} onChange={e => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })} style={ipt} /></Field>
          </Row>
          <Field label="Label"><input value={edit.label} onChange={e => setEdit({ ...edit, label: e.target.value })} style={ipt} /></Field>
          <Field label="Description"><textarea rows={2} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
            <input type="checkbox" checked={!!edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked ? 1 : 0 })} /> Active
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
            <button onClick={save} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>{title}</h3>{children}
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
function miniBtn(color = '#1a4f9c') {
  return { padding: '3px 8px', marginRight: 4, fontSize: 11, fontWeight: 600, border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}
const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const tabbar = { display: 'flex', borderBottom: '1px solid var(--border)' }
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '6px 10px' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
