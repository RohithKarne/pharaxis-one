/**
 * ComplianceAdmin.jsx — MIMS Admin > System > Setup > Compliance Hardening
 *
 * Theme 9 admin UI (Wave 5). Two tabs:
 *   1. Field Locks — per (section, field, status) lock configuration
 *   2. Audit       — embeds ComplianceAuditPanel (e-signs / masked reveals / field changes)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'
import ComplianceAuditPanel from '../../../../shared/components/compliance/ComplianceAuditPanel'

const MODES = [
  { v: 'read_only',  label: 'Read-only (everyone)' },
  { v: 'admin_only', label: 'Admin-only (admins can still edit)' },
  { v: 'frozen',     label: 'Frozen (no edits at all)' },
]

export default function ComplianceAdmin() {
  const [tab, setTab] = useState('locks')
  return (
    <div style={shell}>
      <Header title="Compliance Hardening"
        sub="Field locks · E-signatures · Masked reveals · Audit trail (21 CFR Part 11)" />
      <div style={tabbar}>
        <Tab active={tab==='locks'} onClick={() => setTab('locks')} label="Field Locks" />
        <Tab active={tab==='audit'} onClick={() => setTab('audit')} label="Audit Reader" />
      </div>
      <div style={body}>
        {tab === 'locks' && <FieldLocksPane />}
        {tab === 'audit' && <div style={{ padding: 20 }}><ComplianceAuditPanel /></div>}
      </div>
    </div>
  )
}

function FieldLocksPane() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [items, setItems] = useState([])
  const [edit, setEdit]   = useState(null)
  const [flash, setFlash] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const d = await httpFetch('/api/admin/field-locks', { headers: H }).then(r => r.json())
    setItems(d.locks || [])
  }, [H])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function save() {
    if (!edit?.section_name || !edit?.field_name || !edit?.status) {
      showFlash('Section, field, status required', 'error'); return
    }
    try {
      const r = await httpFetch('/api/admin/field-locks', {
        method: 'POST', headers: H,
        body: JSON.stringify({
          id: edit.id, org_id: edit.org_id, section_name: edit.section_name,
          field_name: edit.field_name, status: edit.status,
          lock_mode: edit.lock_mode || 'read_only', reason: edit.reason || null,
        }),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Lock saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function del(id) {
    if (!confirm('Remove lock?')) return
    const r = await httpFetch(`/api/admin/field-locks/${id}`, { method: 'DELETE', headers: H })
    if (!r.ok) { showFlash('Remove failed', 'error'); return }  // WP7
    showFlash('Removed'); load()
  }
  function newLock() {
    setEdit({ org_id: null, section_name: '', field_name: '', status: '', lock_mode: 'read_only', reason: '' })
  }

  return (
    <div style={{ padding: 20 }}>
      {flash && <Flash flash={flash} />}
      <div style={{ display: 'flex', marginBottom: 14 }}>
        <span style={{ flex: 1, fontSize: 13, color: 'var(--text-muted)' }}>
          {items.length} lock{items.length === 1 ? '' : 's'} configured
        </span>
        <button onClick={newLock} style={primaryBtn}>+ New lock</button>
      </div>

      {items.length === 0 && <div style={muted}>No field locks yet.</div>}
      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
            <th style={th}>Section</th><th style={th}>Field</th><th style={th}>Status</th>
            <th style={th}>Mode</th><th style={th}>Reason</th><th style={th}>Scope</th>
            <th style={{ ...th, textAlign: 'right' }}></th>
          </tr></thead>
          <tbody>
            {items.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>{l.section_name}</td>
                <td style={td}><strong>{l.field_name}</strong></td>
                <td style={td}><span style={chip('#1a4f9c')}>{l.status}</span></td>
                <td style={td}>
                  <span style={chip(l.lock_mode === 'frozen' ? '#b91c1c' : l.lock_mode === 'admin_only' ? '#c08300' : '#7a3a8a')}>
                    {l.lock_mode}
                  </span>
                </td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{l.reason || '–'}</td>
                <td style={td}>{l.org_id == null ? 'Global' : `Org #${l.org_id}`}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => setEdit({ ...l })} style={miniBtn()}>Edit</button>
                  <button onClick={() => del(l.id)} style={miniBtn('#b91c1c')}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {edit && (
        <div onClick={() => setEdit(null)} style={modalBg}>
          <div onClick={e => e.stopPropagation()} style={modalCard}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>{edit.id ? 'Edit' : 'New'} field lock</h3>
            <Row>
              <Field label="Section name"><input value={edit.section_name}
                onChange={e => setEdit({ ...edit, section_name: e.target.value })} style={ipt} placeholder="e.g. reporter" /></Field>
              <Field label="Field name"><input value={edit.field_name}
                onChange={e => setEdit({ ...edit, field_name: e.target.value })} style={ipt} placeholder="e.g. reporter_name" /></Field>
            </Row>
            <Row>
              <Field label="Workflow status"><input value={edit.status}
                onChange={e => setEdit({ ...edit, status: e.target.value })} style={ipt}
                placeholder="e.g. submitted, approved" /></Field>
              <Field label="Lock mode">
                <select value={edit.lock_mode} onChange={e => setEdit({ ...edit, lock_mode: e.target.value })} style={ipt}>
                  {MODES.map(m => <option key={m.v} value={m.v}>{m.label}</option>)}
                </select>
              </Field>
            </Row>
            <Field label="Reason (shown in the lock badge tooltip)">
              <input value={edit.reason || ''}
                onChange={e => setEdit({ ...edit, reason: e.target.value })} style={ipt}
                placeholder="e.g. Locked after submission per SOP-12" />
            </Field>
            <Field label="Scope">
              <select value={edit.org_id ?? ''} onChange={e => setEdit({ ...edit, org_id: e.target.value ? Number(e.target.value) : null })} style={ipt}>
                <option value="">Global (all tenants)</option>
                <option value="1">Current tenant only</option>
              </select>
            </Field>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
              <button onClick={save} style={primaryBtn}>Save lock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Tab({ active, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
      background: active ? 'var(--surface,#fff)' : 'var(--surface-alt,#fafafa)',
      border: 'none',
      borderBottom: `2px solid ${active ? 'var(--accent,#1a4f9c)' : 'transparent'}`,
      color: active ? 'var(--accent,#1a4f9c)' : 'var(--text-secondary)',
    }}>{label}</button>
  )
}
function Flash({ flash }) {
  return (
    <div style={{
      padding: '8px 12px', marginBottom: 12, borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: flash.type === 'error' ? '#fdecea' : '#e6f9ee',
      color: flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
      border: `1px solid ${flash.type === 'error' ? '#f5c6c6' : '#a7f3c1'}`,
    }}>{flash.msg}</div>
  )
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
  return { padding: '4px 10px', fontSize: 11, fontWeight: 600, marginLeft: 4,
    border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}

const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const tabbar = { display: 'flex', borderBottom: '1px solid var(--border)' }
const body = { flex: 1, overflowY: 'auto' }
const muted = { padding: 16, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '6px 10px' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff',
  color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
const modalBg = { position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
  display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalCard = { width: 520, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10,
  padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }
