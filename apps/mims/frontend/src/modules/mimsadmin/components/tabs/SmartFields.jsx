/**
 * SmartFields.jsx — MIMS Admin > System > Setup > Smart Field Rules
 *
 * Theme 2 admin UI (Wave 2). Configure smart defaults, auto-calc formulas,
 * and typeahead sources per (section, field).
 *
 * Layout:
 *   ┌────────────────────┬─────────────────────────────────┐
 *   │ Rule list          │ Editor (right side)             │
 *   │ + Add rule         │  - rule_type: default/calc/peek │
 *   │                    │  - formula (Function body)      │
 *   └────────────────────┴─────────────────────────────────┘
 *
 * Backed by /api/admin/smart-fields routes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const SOURCES = ['', 'products', 'contacts', 'users', 'picklists']
const TRIGGERS = ['change', 'create', 'blur']

export default function SmartFields() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [rules, setRules]   = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit]     = useState(null)
  const [flash, setFlash]   = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await httpFetch('/api/admin/smart-fields', { headers: H }).then(r => r.json())
      setRules(d.rules || [])
    } catch { setRules([]) } finally { setLoading(false) }
  }, [H])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!edit?.section_name || !edit?.field_name || !edit?.rule_type) {
      showFlash('Section, field, rule type required', 'error'); return
    }
    try {
      const r = await httpFetch('/api/admin/smart-fields', {
        method: 'POST', headers: H, body: JSON.stringify(edit),
      })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash(`Rule ${edit.id ? 'updated' : 'created'}`)
      setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }

  async function del(id) {
    if (!confirm('Delete rule?')) return
    await httpFetch(`/api/admin/smart-fields/${id}`, { method: 'DELETE', headers: H })
    showFlash('Deleted'); load()
  }

  function newRule() {
    setEdit({
      org_id: null, section_name: '', field_name: '', rule_type: 'smart_default',
      formula: '', lookup_source: '', lookup_filter: '',
      depends_on: '', trigger_on: 'change', enabled: 1, priority: 0,
    })
  }

  return (
    <div style={pageShell}>
      <Header flash={flash} title="Smart Field Rules" sub="Smart defaults · Auto-calc · Typeahead sources" />
      <div style={body}>
        {/* Left list */}
        <div style={leftCol}>
          <button onClick={newRule} style={primaryBtn}>+ New rule</button>
          <div style={{ marginTop: 12 }}>
            {loading && <div style={muted}>Loading…</div>}
            {!loading && rules.length === 0 && <div style={muted}>No rules configured.</div>}
            {!loading && rules.map(r => (
              <div key={r.id} onClick={() => setEdit({ ...r })} style={{
                padding: '8px 12px', borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: edit?.id === r.id ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {r.section_name} / {r.field_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 3 }}>
                  <span style={chip(typeColor(r.rule_type))}>{r.rule_type}</span>
                  <span style={chip('#7a3a8a')}>{r.trigger_on}</span>
                  {!r.enabled && <span style={chip('#b91c1c')}>disabled</span>}
                  {r.org_id == null && <span style={chip('#1a7a3f')}>global</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div style={rightCol}>
          {!edit && <div style={emptyState}>Pick a rule on the left, or click <strong>+ New rule</strong>.</div>}
          {edit && (
            <>
              <div style={editGrid}>
                <Field label="Org scope">
                  <select value={edit.org_id ?? ''} onChange={e => setEdit({ ...edit, org_id: e.target.value ? Number(e.target.value) : null })} style={ipt}>
                    <option value="">— Global —</option>
                    <option value="1">Current tenant only</option>
                  </select>
                </Field>
                <Field label="Section name">
                  <input value={edit.section_name} onChange={e => setEdit({ ...edit, section_name: e.target.value })} style={ipt} placeholder="e.g. reporter" />
                </Field>
                <Field label="Field name">
                  <input value={edit.field_name} onChange={e => setEdit({ ...edit, field_name: e.target.value })} style={ipt} placeholder="e.g. reporter_name" />
                </Field>
                <Field label="Rule type">
                  <select value={edit.rule_type} onChange={e => setEdit({ ...edit, rule_type: e.target.value })} style={ipt}>
                    <option value="smart_default">Smart default (on create)</option>
                    <option value="auto_calc">Auto-calc (derive from other fields)</option>
                    <option value="typeahead">Typeahead source</option>
                  </select>
                </Field>
                <Field label="Trigger">
                  <select value={edit.trigger_on} onChange={e => setEdit({ ...edit, trigger_on: e.target.value })} style={ipt}>
                    {TRIGGERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <input type="number" value={edit.priority || 0} onChange={e => setEdit({ ...edit, priority: Number(e.target.value) || 0 })} style={ipt} />
                </Field>
              </div>

              {(edit.rule_type === 'smart_default' || edit.rule_type === 'auto_calc') && (
                <>
                  <Field label="Formula (JavaScript expression — context: all field values)">
                    <textarea
                      value={edit.formula || ''} onChange={e => setEdit({ ...edit, formula: e.target.value })}
                      rows={4}
                      style={{ ...ipt, fontFamily: 'monospace', resize: 'vertical' }}
                      placeholder={edit.rule_type === 'auto_calc'
                        ? "e.g. dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000) : null"
                        : "e.g. 'C' + new Date().getFullYear() + '-' + (id || '----')"}
                    />
                  </Field>
                  {edit.rule_type === 'auto_calc' && (
                    <Field label="Depends on (comma-separated field names)">
                      <input value={edit.depends_on || ''} onChange={e => setEdit({ ...edit, depends_on: e.target.value })}
                        style={ipt} placeholder="e.g. dob, weight_kg" />
                    </Field>
                  )}
                </>
              )}

              {edit.rule_type === 'typeahead' && (
                <>
                  <Field label="Lookup source">
                    <select value={edit.lookup_source || ''} onChange={e => setEdit({ ...edit, lookup_source: e.target.value })} style={ipt}>
                      {SOURCES.map(s => <option key={s} value={s}>{s || '— select —'}</option>)}
                    </select>
                  </Field>
                  <Field label='Lookup filter (JSON — e.g. {"type":"ae_severity"})'>
                    <textarea value={edit.lookup_filter || ''} onChange={e => setEdit({ ...edit, lookup_filter: e.target.value })}
                      rows={2} style={{ ...ipt, fontFamily: 'monospace' }} placeholder='{ "type": "ae_severity" }' />
                  </Field>
                </>
              )}

              <Field label="Status">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={!!edit.enabled} onChange={e => setEdit({ ...edit, enabled: e.target.checked ? 1 : 0 })} />
                  Enabled
                </label>
              </Field>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  {edit.id && <button onClick={() => del(edit.id)} style={dangerBtn}>Delete</button>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
                  <button onClick={save} style={primaryBtn}>Save rule</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared primitives ─────────────────────────────────────────────────────

export function Header({ flash, title, sub }) {
  return (
    <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid var(--border)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{title}</h1>
        {sub && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      {flash && (
        <span style={{ fontSize: 12, fontWeight: 600,
          color: flash.type === 'error' ? '#b91c1c' : '#1a7a3f' }}>{flash.msg}</span>
      )}
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

function typeColor(t) {
  return t === 'smart_default' ? '#1a4f9c' : t === 'auto_calc' ? '#8a3df3' : '#c08300'
}
function chip(color) { return { padding: '1px 7px', borderRadius: 10, color: '#fff', background: color, fontWeight: 600 } }

const pageShell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const body = { display: 'flex', flex: 1, overflow: 'hidden' }
const leftCol = { width: 320, borderRight: '1px solid var(--border)', padding: 12, overflowY: 'auto',
  background: 'var(--surface-alt,#fafafa)' }
const rightCol = { flex: 1, padding: '18px 24px', overflowY: 'auto' }
const editGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }
const muted = { padding: 10, color: 'var(--text-muted)', fontSize: 12 }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface,#fff)' }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff',
  color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
const dangerBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff',
  color: '#b91c1c', border: '1px solid #b91c1c', borderRadius: 4, cursor: 'pointer' }
const emptyState = { padding: 40, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }
