/**
 * CapaAdmin.jsx — Sprint 2 #20 admin UI for CAPA workflow.
 *
 * ISO 13485 + 21 CFR 820.100 compliant Corrective + Preventive Action tracker.
 * Per-tenant CAPA list with full lifecycle controls.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

const STATUS_COLORS = {
  open: '#888', root_cause_identified: '#1a4f9c', action_proposed: '#8a3df3',
  action_approved: '#c08300', action_implemented: '#0e6c8f',
  effectiveness_check: '#7a3a8a', closed: '#1a7a3f', terminated: '#b91c1c',
}
const SEVERITY_COLORS = { low: '#888', medium: '#c08300', high: '#b91c1c', critical: '#7a1313' }

export default function CapaAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [records, setRecords] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)
  const [edit, setEdit] = useState(null)
  const [actionEdit, setActionEdit] = useState(null)
  const [flash, setFlash] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const url = filterStatus ? `/api/capa?status=${filterStatus}` : '/api/capa'
    const d = await httpFetch(url, { headers: H }).then(r => r.json())
    setRecords(d.records || [])
  }, [H, filterStatus])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function loadDetails(id) {
    const d = await httpFetch(`/api/capa/${id}`, { headers: H }).then(r => r.json())
    setSelected(d.record)
  }

  async function save() {
    if (!edit?.title || !edit?.source_type) { showFlash('title + source_type required', 'error'); return }
    try {
      const path = edit.id ? `/api/capa/${edit.id}` : '/api/capa'
      const method = edit.id ? 'PUT' : 'POST'
      const r = await httpFetch(path, { method, headers: H, body: JSON.stringify(edit) })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }

  async function transition(id, toStatus) {
    const note = prompt(`Note for "${toStatus}":`)
    await httpFetch(`/api/capa/${id}/transition`, {
      method: 'POST', headers: H, body: JSON.stringify({ to_status: toStatus, note }),
    })
    showFlash(`→ ${toStatus}`); loadDetails(id); load()
  }

  async function addAction() {
    if (!actionEdit?.description || !actionEdit?.action_type) { showFlash('description + type required', 'error'); return }
    await httpFetch(`/api/capa/${selected.id}/actions`, {
      method: 'POST', headers: H, body: JSON.stringify(actionEdit),
    })
    showFlash('Action added'); setActionEdit(null); loadDetails(selected.id)
  }

  async function completeAction(actionId) {
    const verification_notes = prompt('Verification notes (optional):')
    await httpFetch(`/api/capa-actions/${actionId}/complete`, {
      method: 'PUT', headers: H, body: JSON.stringify({ verification_notes }),
    })
    showFlash('Action completed'); loadDetails(selected.id)
  }

  async function logEffectiveness() {
    const outcome = prompt('Outcome (effective | partially_effective | not_effective):')
    if (!['effective','partially_effective','not_effective'].includes(outcome)) return
    const notes = prompt('Notes:')
    await httpFetch(`/api/capa/${selected.id}/effectiveness`, {
      method: 'POST', headers: H, body: JSON.stringify({ outcome, notes }),
    })
    showFlash('Effectiveness logged'); loadDetails(selected.id)
  }

  return (
    <div style={shell}>
      <Header flash={flash} title="CAPA Workflow"
        sub="ISO 13485 + 21 CFR 820.100 corrective + preventive actions." />
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...ipt, maxWidth: 240 }}>
          <option value="">All statuses</option>
          {['open','root_cause_identified','action_proposed','action_approved','action_implemented','effectiveness_check','closed','terminated'].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button onClick={() => setEdit({ source_type: 'product_complaint', severity: 'medium', title: '' })} style={primaryBtn}>+ New CAPA</button>
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 340, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
          {records.length === 0 && <div style={{ padding: 16, color: 'var(--text-muted)' }}>No CAPAs.</div>}
          {records.map(r => (
            <div key={r.id} onClick={() => loadDetails(r.id)} style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
              background: selected?.id === r.id ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{r.capa_number}</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>
                <span style={chip(STATUS_COLORS[r.status])}>{r.status}</span>{' '}
                <span style={chip(SEVERITY_COLORS[r.severity])}>{r.severity}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 5, lineHeight: 1.3 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{r.source_type}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: 18, overflowY: 'auto' }}>
          {!selected && <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>Pick a CAPA on the left.</div>}
          {selected && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selected.capa_number}</h2>
                  <p style={{ fontSize: 14, margin: '6px 0 0' }}>{selected.title}</p>
                </div>
                <button onClick={() => setEdit({ ...selected })} style={ghostBtn}>Edit</button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <span style={chip(STATUS_COLORS[selected.status])}>{selected.status}</span>
                <span style={chip(SEVERITY_COLORS[selected.severity])}>{selected.severity}</span>
                <span style={{ ...chip('#555'), background: 'transparent', color: '#555', border: '1px solid #ccc' }}>{selected.source_type}</span>
              </div>

              {selected.problem_statement && <Section title="Problem statement">{selected.problem_statement}</Section>}
              {selected.root_cause && <Section title={`Root cause${selected.root_cause_method ? ` (${selected.root_cause_method})` : ''}`}>{selected.root_cause}</Section>}
              {selected.corrective_action && <Section title="Corrective action">{selected.corrective_action}</Section>}
              {selected.preventive_action && <Section title="Preventive action">{selected.preventive_action}</Section>}
              {selected.effectiveness_outcome && (
                <Section title="Effectiveness">
                  <strong>{selected.effectiveness_outcome}</strong>
                  {selected.effectiveness_notes && <p>{selected.effectiveness_notes}</p>}
                </Section>
              )}

              <div style={{ marginTop: 16 }}>
                <strong style={{ fontSize: 12 }}>Lifecycle:</strong>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['root_cause_identified','action_proposed','action_approved','action_implemented','effectiveness_check','closed','terminated'].map(s => (
                    <button key={s} onClick={() => transition(selected.id, s)}
                      disabled={selected.status === s}
                      style={{
                        ...ghostBtn, fontSize: 11, padding: '4px 10px',
                        opacity: selected.status === s ? 0.4 : 1,
                      }}>→ {s}</button>
                  ))}
                </div>
                <button onClick={logEffectiveness} style={{ ...ghostBtn, fontSize: 11, padding: '4px 10px', marginTop: 8 }}>Log effectiveness</button>
              </div>

              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Action items ({selected.actions?.length || 0})</h4>
                <button onClick={() => setActionEdit({ action_type: 'corrective', description: '' })} style={ghostBtn}>+ Add action</button>
              </div>
              {selected.actions?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>No actions yet.</div>}
              {selected.actions?.map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{a.action_type}</strong>
                    {a.completed_at ? <span style={chip('#1a7a3f')}>✓ done</span> : (
                      <button onClick={() => completeAction(a.id)} style={miniBtn('#1a7a3f')}>Complete</button>
                    )}
                  </div>
                  <div style={{ marginTop: 3 }}>{a.description}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {a.assigned_to_name && `→ ${a.assigned_to_name}`}
                    {a.target_date && ` · due ${a.target_date.slice(0, 10)}`}
                    {a.completed_at && ` · completed ${new Date(a.completed_at).toLocaleDateString()}`}
                  </div>
                  {a.verification_notes && <div style={{ fontSize: 11, fontStyle: 'italic', marginTop: 3 }}>Verified: {a.verification_notes}</div>}
                </div>
              ))}

              <h4 style={{ marginTop: 16 }}>Event log</h4>
              {selected.events?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No events.</div>}
              {selected.events?.map(e => (
                <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <strong>{e.event_type}</strong>
                  {e.from_status && ` · ${e.from_status} → ${e.to_status}`}
                  <span style={{ color: 'var(--text-muted)' }}> · {new Date(e.created_at).toLocaleString()}</span>
                  {e.note && <div style={{ marginTop: 3, fontStyle: 'italic' }}>{e.note}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {edit && (
        <Modal title={edit.id ? `Edit ${edit.capa_number || 'CAPA'}` : 'New CAPA'} onClose={() => setEdit(null)}>
          <Field label="Title"><input value={edit.title || ''} onChange={e => setEdit({ ...edit, title: e.target.value })} style={ipt} /></Field>
          <Row>
            <Field label="Source">
              <select value={edit.source_type} onChange={e => setEdit({ ...edit, source_type: e.target.value })} style={ipt}>
                {['product_complaint','adverse_event','audit','internal_review','customer_feedback'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Severity">
              <select value={edit.severity} onChange={e => setEdit({ ...edit, severity: e.target.value })} style={ipt}>
                {['low','medium','high','critical'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Source case id"><input type="number" value={edit.source_case_id || ''} onChange={e => setEdit({ ...edit, source_case_id: Number(e.target.value) || null })} style={ipt} /></Field>
            <Field label="Assigned to (user id)"><input type="number" value={edit.assigned_to || ''} onChange={e => setEdit({ ...edit, assigned_to: Number(e.target.value) || null })} style={ipt} /></Field>
          </Row>
          <Field label="Problem statement"><textarea rows={2} value={edit.problem_statement || ''} onChange={e => setEdit({ ...edit, problem_statement: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <Field label="Root cause"><textarea rows={2} value={edit.root_cause || ''} onChange={e => setEdit({ ...edit, root_cause: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <Field label="Root cause method">
            <select value={edit.root_cause_method || ''} onChange={e => setEdit({ ...edit, root_cause_method: e.target.value || null })} style={ipt}>
              <option value="">— none —</option>
              {['5_whys','fishbone','fmea','fault_tree','other'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Corrective action"><textarea rows={2} value={edit.corrective_action || ''} onChange={e => setEdit({ ...edit, corrective_action: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <Field label="Preventive action"><textarea rows={2} value={edit.preventive_action || ''} onChange={e => setEdit({ ...edit, preventive_action: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <Row>
            <Field label="Target completion"><input type="date" value={edit.target_completion_date?.slice(0, 10) || ''} onChange={e => setEdit({ ...edit, target_completion_date: e.target.value || null })} style={ipt} /></Field>
            <Field label="Effectiveness check due"><input type="date" value={edit.effectiveness_check_due?.slice(0, 10) || ''} onChange={e => setEdit({ ...edit, effectiveness_check_due: e.target.value || null })} style={ipt} /></Field>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
            <button onClick={save} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}

      {actionEdit && (
        <Modal title="Add CAPA action" onClose={() => setActionEdit(null)}>
          <Field label="Action type">
            <select value={actionEdit.action_type} onChange={e => setActionEdit({ ...actionEdit, action_type: e.target.value })} style={ipt}>
              {['corrective','preventive','interim'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Description"><textarea rows={3} value={actionEdit.description} onChange={e => setActionEdit({ ...actionEdit, description: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <Row>
            <Field label="Assigned to (user id)"><input type="number" value={actionEdit.assigned_to || ''} onChange={e => setActionEdit({ ...actionEdit, assigned_to: Number(e.target.value) || null })} style={ipt} /></Field>
            <Field label="Target date"><input type="date" value={actionEdit.target_date || ''} onChange={e => setActionEdit({ ...actionEdit, target_date: e.target.value || null })} style={ipt} /></Field>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setActionEdit(null)} style={ghostBtn}>Cancel</button>
            <button onClick={addAction} style={primaryBtn}>Add</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</h4>
      <div style={{ marginTop: 4, fontSize: 13 }}>{children}</div>
    </div>
  )
}
function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface,#fff)', borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
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
function miniBtn(color = '#1a4f9c') {
  return { padding: '3px 8px', fontSize: 11, fontWeight: 600, border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}
const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const ipt = { padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, width: '100%' }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
