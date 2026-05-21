/**
 * ValidationRules.jsx — MIMS Admin > System > Setup > Validation Rules
 *
 * Theme 3 admin UI (Wave 1). Two tabs:
 *   1. Phase-required rules — make a field required only in certain workflow phases
 *   2. Duplicate detection log — view recent duplicate-hit events
 *
 * Per-field inline validation (regex / min / max / format hint / duplicate
 * toggle) lives inside Customize Forms ⚙ Rules — this page is just the
 * cross-cutting bits.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

export default function ValidationRules() {
  const [tab, setTab] = useState('phase')
  return (
    <div style={shell}>
      <Header title="Validation Rules" sub="Phase-aware required · Duplicate detection log" />
      <div style={tabbar}>
        <Tab active={tab==='phase'} onClick={() => setTab('phase')} label="Phase-required rules" />
        <Tab active={tab==='dup'}   onClick={() => setTab('dup')}   label="Duplicate detection log" />
      </div>
      <div style={body}>
        {tab === 'phase' && <PhaseRequiredPane />}
        {tab === 'dup'   && <DuplicateLogPane />}
      </div>
    </div>
  )
}

function PhaseRequiredPane() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [rules, setRules] = useState([])
  const [edit, setEdit]   = useState(null)
  const [flash, setFlash] = useState(null)

  const load = useCallback(async () => {
    const d = await httpFetch('/api/admin/phase-required', { headers: H }).then(r => r.json())
    setRules(d.rules || [])
  }, [H])
  useEffect(() => { void (async () => { await load() })() }, [load])
  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  async function save() {
    if (!edit?.section_name || !edit?.field_name || !edit?.phase) {
      showFlash('Section, field, phase required', 'error'); return
    }
    try {
      const r = await httpFetch('/api/admin/phase-required', {
        method: 'POST', headers: H, body: JSON.stringify(edit),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Rule saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }
  async function del(id) {
    if (!confirm('Delete rule?')) return
    await httpFetch(`/api/admin/phase-required/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deleted'); load()
  }
  function newRule() {
    setEdit({ org_id: null, section_name: '', field_name: '', phase: '', is_required: 1, message: '' })
  }

  return (
    <div style={{ padding: 20 }}>
      {flash && <Flash flash={flash} />}
      <button onClick={newRule} style={primaryBtn}>+ New rule</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 14 }}>
        <thead>
          <tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
            <th style={th}>Section</th><th style={th}>Field</th><th style={th}>Phase</th>
            <th style={th}>Required</th><th style={th}>Message</th><th style={{ ...th, textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 && (
            <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>
              No phase-required rules configured.
            </td></tr>
          )}
          {rules.map(r => (
            <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={td}>{r.section_name}</td>
              <td style={td}>{r.field_name}</td>
              <td style={td}><span style={chip('#1a4f9c')}>{r.phase}</span></td>
              <td style={td}>{r.is_required ? '✓' : '–'}</td>
              <td style={td}>{r.message || '–'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                <button onClick={() => setEdit({ ...r })} style={miniBtn()}>Edit</button>
                <button onClick={() => del(r.id)} style={miniBtn('#b91c1c')}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {edit && (
        <div onClick={() => setEdit(null)} style={modalBg}>
          <div onClick={e => e.stopPropagation()} style={modalCard}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>{edit.id ? 'Edit' : 'New'} phase-required rule</h3>
            <Field label="Section name"><input value={edit.section_name} onChange={e => setEdit({ ...edit, section_name: e.target.value })} style={ipt} /></Field>
            <Field label="Field name"><input value={edit.field_name} onChange={e => setEdit({ ...edit, field_name: e.target.value })} style={ipt} /></Field>
            <Field label="Phase (workflow status name)">
              <input value={edit.phase} onChange={e => setEdit({ ...edit, phase: e.target.value })} style={ipt}
                placeholder="e.g. submitted, approved" />
            </Field>
            <Field label="Message">
              <input value={edit.message || ''} onChange={e => setEdit({ ...edit, message: e.target.value })} style={ipt}
                placeholder="Shown if the field is empty during this phase" />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '6px 0 14px' }}>
              <input type="checkbox" checked={!!edit.is_required} onChange={e => setEdit({ ...edit, is_required: e.target.checked ? 1 : 0 })} />
              Required in this phase
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
              <button onClick={save} style={primaryBtn}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DuplicateLogPane() {
  // The duplicate_detection_log table is read-only; no dedicated route was built,
  // so use a generic admin query path. Here we render a placeholder + tips since the
  // table fills as duplicate-checking writes happen.
  return (
    <div style={{ padding: 20 }}>
      <div style={{
        padding: '14px 16px', background: 'var(--surface-alt,#fafafa)',
        border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
      }}>
        <strong>Duplicate detection log</strong>
        <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
          The <code>duplicate_detection_log</code> table fills automatically when a
          field with <em>Duplicate check</em> enabled (configured in Customize Forms
          ⚙ Rules) detects a potential match.
        </p>
        <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
          <li><strong>Soft</strong> hits (default org-scope) warn the user but allow save.</li>
          <li><strong>Hard</strong> hits (global-scope) block the save until resolved.</li>
        </ul>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
          Tip: query the log directly with <code>SELECT * FROM duplicate_detection_log ORDER BY detected_at DESC LIMIT 100</code> until a dedicated viewer ships.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700,
        color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
      {children}
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

function chip(color) { return { padding: '1px 7px', borderRadius: 10, color: '#fff', background: color, fontWeight: 600, fontSize: 11 } }
function miniBtn(color = '#1a4f9c') {
  return { padding: '3px 8px', marginLeft: 4, fontSize: 11, fontWeight: 600,
    border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}

const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const tabbar = { display: 'flex', borderBottom: '1px solid var(--border)' }
const body = { flex: 1, overflowY: 'auto' }
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '6px 10px' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff',
  color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
const modalBg = { position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
  display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalCard = { width: 480, maxWidth: '92vw', background: 'var(--surface,#fff)',
  borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }
