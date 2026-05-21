/**
 * CaseActionsAdmin.jsx — MIMS Admin > System > Setup > Case Actions
 *
 * Theme 8 admin UI (Wave 4). Two tabs:
 *   1. Case Templates — prefilled starter shells per case_type
 *   2. Macros (read-only list) — macros must currently be configured via SQL;
 *      this surface lists them and lets you remove or rename. A full step
 *      editor will follow when Q5 (workflow builder) lands.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

const CASE_TYPES = ['ae', 'pc', 'mi']

export default function CaseActionsAdmin() {
  const [tab, setTab] = useState('templates')
  return (
    <div style={shell}>
      <Header title="Case Actions" sub="Templates · Macros · Smart actions configuration" />
      <div style={tabbar}>
        <Tab active={tab==='templates'} onClick={() => setTab('templates')} label="Case Templates" />
        <Tab active={tab==='macros'}    onClick={() => setTab('macros')}    label="Macros" />
      </div>
      <div style={body}>
        {tab === 'templates' && <TemplatesPane />}
        {tab === 'macros'    && <MacrosPane />}
      </div>
    </div>
  )
}

function TemplatesPane() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [items, setItems] = useState([])
  const [edit, setEdit]   = useState(null)
  const [flash, setFlash] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const url = `/api/case-templates${typeFilter ? `?case_type=${typeFilter}` : ''}`
    const d = await httpFetch(url, { headers: H }).then(r => r.json())
    setItems(d.templates || [])
  }, [H, typeFilter])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function open(t) {
    const d = await httpFetch(`/api/case-templates/${t.id}`, { headers: H }).then(r => r.json())
    setEdit({ ...d.template, payload_json: JSON.stringify(d.template?.payload_json || {}, null, 2) })
  }

  async function save() {
    if (!edit?.case_type || !edit?.name) { showFlash('Case type and name required', 'error'); return }
    let payload = edit.payload_json
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload) } catch { showFlash('payload_json invalid', 'error'); return }
    }
    try {
      const r = await httpFetch('/api/admin/case-templates', {
        method: 'POST', headers: H,
        body: JSON.stringify({ ...edit, payload }),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }

  async function del(id) {
    if (!confirm('Delete template?')) return
    await httpFetch(`/api/admin/case-templates/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deleted'); load()
  }

  function newTpl() {
    setEdit({
      org_id: null, case_type: 'ae', name: '', description: '',
      payload_json: JSON.stringify({ reporter: { country: 'US' } }, null, 2),
    })
  }

  return (
    <div style={{ padding: 20 }}>
      {flash && <Flash flash={flash} />}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...ipt, width: 140 }}>
          <option value="">All types</option>
          {CASE_TYPES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button onClick={newTpl} style={primaryBtn}>+ New template</button>
      </div>

      {items.length === 0 && <div style={muted}>No case templates configured.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {items.map(t => (
          <div key={t.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ fontSize: 13 }}>{t.name}</strong>
              <span style={chip(t.case_type === 'ae' ? '#dc2626' : t.case_type === 'pc' ? '#d97706' : '#2563eb')}>
                {t.case_type.toUpperCase()}
              </span>
            </div>
            {t.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{t.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {t.org_id == null ? 'Global' : 'Org-only'}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <button onClick={() => open(t)} style={miniBtn()}>Edit</button>
              <button onClick={() => del(t.id)} style={miniBtn('#b91c1c')}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <div onClick={() => setEdit(null)} style={modalBg}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalCard, width: 640 }}>
            <h3 style={{ margin: 0, marginBottom: 12 }}>{edit.id ? 'Edit' : 'New'} case template</h3>
            <Row>
              <Field label="Case type">
                <select value={edit.case_type} onChange={e => setEdit({ ...edit, case_type: e.target.value })} style={ipt}>
                  {CASE_TYPES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                </select>
              </Field>
              <Field label="Name"><input value={edit.name}
                onChange={e => setEdit({ ...edit, name: e.target.value })} style={ipt} /></Field>
            </Row>
            <Field label="Description"><input value={edit.description || ''}
              onChange={e => setEdit({ ...edit, description: e.target.value })} style={ipt} /></Field>
            <Field label='Payload (JSON — section→{field:value} map)'>
              <textarea value={edit.payload_json}
                onChange={e => setEdit({ ...edit, payload_json: e.target.value })}
                rows={11} style={{ ...ipt, fontFamily: 'monospace' }} />
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

function MacrosPane() {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  useEffect(() => {
    httpFetch('/api/case-macros', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setItems(d.macros || [])).catch(() => setItems([]))
  }, [token])

  return (
    <div style={{ padding: 20 }}>
      <div style={{
        marginBottom: 16, padding: '12px 14px', borderRadius: 8,
        background: '#eaf2ff', border: '1px solid #c4d6ee', fontSize: 12, color: '#143a73',
      }}>
        Macros run an ordered list of steps (<code>set_field</code>, <code>assign</code>,
        <code>add_watcher</code>, <code>comment</code>, <code>tag</code>, <code>transition</code>)
        against a case. Currently macros are seeded via SQL into <code>case_macros</code> +
        <code>case_macro_steps</code> tables. A visual step editor ships in a later release.
      </div>
      {items.length === 0 && <div style={muted}>No macros configured.</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
          <th style={th}>Name</th><th style={th}>Description</th><th style={th}>Steps</th><th style={th}>Scope</th>
        </tr></thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={td}><strong>{m.name}</strong></td>
              <td style={td}>{m.description || '–'}</td>
              <td style={td}>{m.step_count}</td>
              <td style={td}>{m.org_id == null ? 'Global' : 'Org'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  return { padding: '4px 10px', fontSize: 11, fontWeight: 600,
    border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}

const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const tabbar = { display: 'flex', borderBottom: '1px solid var(--border)' }
const body = { flex: 1, overflowY: 'auto' }
const card = { padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface,#fff)' }
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
const modalCard = { background: 'var(--surface,#fff)', borderRadius: 10, padding: 18,
  boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }
