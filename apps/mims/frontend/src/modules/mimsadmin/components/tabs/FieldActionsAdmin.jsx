/**
 * FieldActionsAdmin.jsx — Sprint 2 #28 admin UI for recalls / field actions.
 *
 * Per-tenant list of field action records (recall, withdrawal, safety notice,
 * field correction, stock recovery) with lifecycle controls.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

const STATUS_COLORS = {
  drafted: '#888', submitted: '#1a4f9c', acknowledged: '#8a3df3',
  in_progress: '#c08300', effectiveness_check: '#0e6c8f',
  closed: '#1a7a3f', terminated: '#b91c1c',
}
const CLASS_COLORS = {
  class_i: '#b91c1c', class_ii: '#c08300', class_iii: '#1a7a3f', not_classified: '#888',
}

export default function FieldActionsAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [records, setRecords] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [edit, setEdit] = useState(null)
  const [flash, setFlash] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const url = filterStatus ? `/api/field-actions?status=${filterStatus}` : '/api/field-actions'
    const d = await httpFetch(url, { headers: H }).then(r => r.json())
    setRecords(d.records || [])
  }, [H, filterStatus])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function loadDetails(id) {
    const d = await httpFetch(`/api/field-actions/${id}`, { headers: H }).then(r => r.json())
    setSelected(d.record)
  }

  async function save() {
    if (!edit?.action_type || !edit?.reason_summary) { showFlash('action_type + reason_summary required', 'error'); return }
    try {
      const path = edit.id ? `/api/field-actions/${edit.id}` : '/api/field-actions'
      const method = edit.id ? 'PUT' : 'POST'
      const r = await httpFetch(path, { method, headers: H, body: JSON.stringify(edit) })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }

  async function transition(id, toStatus) {
    const note = prompt(`Note for transition to "${toStatus}" (optional):`)
    const r = await httpFetch(`/api/field-actions/${id}/transition`, {
      method: 'POST', headers: H, body: JSON.stringify({ to_status: toStatus, note }),
    })
    if (!r.ok) { showFlash('Transition failed', 'error'); return }  // WP7
    showFlash(`Transitioned to ${toStatus}`); loadDetails(id); load()
  }

  return (
    <div style={shell}>
      <Header flash={flash} title="Field Actions / Recalls"
        sub="Regulator-notified market actions: recalls, withdrawals, safety notices, field corrections." />
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...ipt, maxWidth: 200 }}>
          <option value="">All statuses</option>
          {['drafted','submitted','acknowledged','in_progress','effectiveness_check','closed','terminated'].map(s =>
            <option key={s}>{s}</option>
          )}
        </select>
        <span style={{ flex: 1 }} />
        <button onClick={() => setEdit({
          action_type: 'recall', classification: 'not_classified', depth: 'consumer', reason_summary: '',
        })} style={primaryBtn}>+ New action</button>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 340, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {records.length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)' }}>No records.</div>}
          {records.map(r => (
            <div key={r.id} onClick={() => loadDetails(r.id)} style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              background: selected?.id === r.id ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{r.action_number}</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>
                <span style={chip(CLASS_COLORS[r.classification])}>{r.classification}</span>
                {' '}<span style={chip(STATUS_COLORS[r.status])}>{r.status}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {r.action_type} · {r.depth}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.3 }}>
                {(r.reason_summary || '').slice(0, 80)}{r.reason_summary?.length > 80 ? '…' : ''}
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
          {!selected && <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>Pick a record on the left.</div>}
          {selected && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0 }}>{selected.action_number}</h2>
                <button onClick={() => setEdit({ ...selected })} style={ghostBtn}>Edit</button>
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                <span style={chip(CLASS_COLORS[selected.classification])}>{selected.classification}</span>
                <span style={chip(STATUS_COLORS[selected.status])}>{selected.status}</span>
                <span style={{ ...chip('#555'), background: 'transparent', color: '#555', border: '1px solid #ccc' }}>{selected.action_type}</span>
              </div>
              <p style={{ fontSize: 13, marginTop: 12 }}>{selected.reason_summary}</p>
              {selected.narrative && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.narrative}</p>}
              <div style={{ marginTop: 14 }}>
                <strong style={{ fontSize: 12 }}>Lifecycle:</strong>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['submitted','acknowledged','in_progress','effectiveness_check','closed','terminated'].map(s => (
                    <button key={s} onClick={() => transition(selected.id, s)}
                      disabled={selected.status === s}
                      style={{
                        ...ghostBtn, fontSize: 11, padding: '4px 10px',
                        opacity: selected.status === s ? 0.4 : 1, cursor: selected.status === s ? 'not-allowed' : 'pointer',
                      }}>→ {s}</button>
                  ))}
                </div>
              </div>
              <h4 style={{ marginTop: 18 }}>Event log</h4>
              {selected.events?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No events.</div>}
              {selected.events?.map(e => (
                <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <strong>{e.event_type}</strong>
                  {e.from_status && ` · ${e.from_status} → ${e.to_status}`}
                  {' · '}<span style={{ color: 'var(--text-muted)' }}>{new Date(e.created_at).toLocaleString()}</span>
                  {e.created_by_name && <span style={{ color: 'var(--text-muted)' }}> · by {e.created_by_name}</span>}
                  {e.note && <div style={{ marginTop: 3, fontStyle: 'italic' }}>{e.note}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {edit && (
        <Modal title={edit.id ? `Edit ${edit.action_number || 'action'}` : 'New field action'} onClose={() => setEdit(null)}>
          <Row>
            <Field label="Action type">
              <select value={edit.action_type} onChange={e => setEdit({ ...edit, action_type: e.target.value })} style={ipt}>
                {['recall','withdrawal','safety_notice','field_correction','stock_recovery'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Classification">
              <select value={edit.classification} onChange={e => setEdit({ ...edit, classification: e.target.value })} style={ipt}>
                {['not_classified','class_i','class_ii','class_iii'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Depth">
              <select value={edit.depth} onChange={e => setEdit({ ...edit, depth: e.target.value })} style={ipt}>
                {['consumer','retail','wholesale','manufacturer'].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Product ID"><input type="number" value={edit.product_id || ''} onChange={e => setEdit({ ...edit, product_id: Number(e.target.value) || null })} style={ipt} /></Field>
          </Row>
          <Field label="Reason summary">
            <input value={edit.reason_summary || ''} onChange={e => setEdit({ ...edit, reason_summary: e.target.value })} style={ipt} placeholder="Brief regulator-facing summary" />
          </Field>
          <Field label="Narrative">
            <textarea rows={3} value={edit.narrative || ''} onChange={e => setEdit({ ...edit, narrative: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} />
          </Field>
          <Field label="Hazard description">
            <textarea rows={2} value={edit.hazard_description || ''} onChange={e => setEdit({ ...edit, hazard_description: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} />
          </Field>
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
      <div onClick={e => e.stopPropagation()} style={{ width: 580, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
        <h3 style={{ margin: 0, marginBottom: 12 }}>{title}</h3>{children}
      </div>
    </div>
  )
}
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div> }
function Field({ label, children }) {
  return <div style={{ marginBottom: 10 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</label>
    {children}
  </div>
}
function chip(color) {
  return { padding: '1px 7px', borderRadius: 10, color: '#fff', background: color, fontWeight: 600, fontSize: 10 }
}
const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const ipt = { padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: '100%' }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
