/**
 * LotMasterAdmin.jsx — Sprint 2 #19 admin UI for lot master.
 *
 * Per-tenant lot registry replacing the legacy free-text `lot_number` field.
 * Used by PC investigations and the recall workflow (#28).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { Header } from './SmartFields'

const STATUS_COLORS = {
  active: '#1a7a3f', suspended: '#c08300', recalled: '#b91c1c',
  expired: '#888', exhausted: '#555',
}

export default function LotMasterAdmin() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [lots, setLots] = useState([])
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [history, setHistory] = useState(null)
  const [flash, setFlash] = useState(null)

  function showFlash(msg, type='success') { setFlash({ msg, type }); setTimeout(() => setFlash(null), 2500) }

  const load = useCallback(async () => {
    const url = q ? `/api/lot-master?q=${encodeURIComponent(q)}` : '/api/lot-master'
    const d = await httpFetch(url, { headers: H }).then(r => r.json())
    setLots(d.lots || [])
  }, [H, q])
  useEffect(() => { void (async () => { await load() })() }, [load])

  async function save() {
    if (!edit?.product_id || !edit?.lot_number) { showFlash('product_id + lot_number required', 'error'); return }
    try {
      const path = edit.id ? `/api/lot-master/${edit.id}` : '/api/lot-master'
      const method = edit.id ? 'PUT' : 'POST'
      const r = await httpFetch(path, { method, headers: H, body: JSON.stringify(edit) })
      if (!r.ok) { showFlash('Save failed', 'error'); return }
      showFlash('Saved'); setEdit(null); load()
    } catch (err) { showFlash(err.message, 'error') }
  }

  async function openHistory(id) {
    const d = await httpFetch(`/api/lot-master/${id}/history`, { headers: H }).then(r => r.json())
    setHistory(d)
  }

  async function recall(id) {
    if (!confirm('Mark this lot as recalled? This will flip status to "recalled" and stamp the recall time.')) return
    await httpFetch(`/api/lot-master/${id}/recall`, { method: 'POST', headers: H, body: '{}' })
    showFlash('Recalled'); load()
  }

  return (
    <div style={shell}>
      <Header flash={flash} title="Lot Master"
        sub="Per-tenant lot registry. Used by PC investigations and recall actions." />
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search lot number..." style={{ ...ipt, maxWidth: 280 }} />
        <span style={{ flex: 1 }} />
        <button onClick={() => setEdit({ product_id: '', lot_number: '', status: 'active', notes: '' })} style={primaryBtn}>+ New lot</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr style={{ background: 'var(--surface-alt,#fafafa)', textAlign: 'left' }}>
            <th style={th}>Lot #</th><th style={th}>Product</th><th style={th}>Mfg Date</th><th style={th}>Expiry</th>
            <th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}></th>
          </tr></thead>
          <tbody>
            {lots.length === 0 && <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-muted)', textAlign: 'center' }}>No lots.</td></tr>}
            {lots.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}><strong><code>{l.lot_number}</code></strong></td>
                <td style={td}>{l.product_id}</td>
                <td style={td}>{l.manufacture_date?.slice(0, 10) || '–'}</td>
                <td style={td}>{l.expiry_date?.slice(0, 10) || '–'}</td>
                <td style={td}>
                  <span style={{ padding: '1px 7px', borderRadius: 10, color: '#fff', background: STATUS_COLORS[l.status] || '#777', fontWeight: 600, fontSize: 10 }}>{l.status}</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => openHistory(l.id)} style={miniBtn()}>History</button>
                  <button onClick={() => setEdit({ ...l })} style={miniBtn()}>Edit</button>
                  {l.status !== 'recalled' && <button onClick={() => recall(l.id)} style={miniBtn('#b91c1c')}>Recall</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit.id ? `Edit lot ${edit.lot_number}` : 'New lot'} onClose={() => setEdit(null)}>
          <Row>
            <Field label="Product ID"><input value={edit.product_id || ''} onChange={e => setEdit({ ...edit, product_id: Number(e.target.value) || '' })} style={ipt} type="number" disabled={!!edit.id} /></Field>
            <Field label="Lot Number"><input value={edit.lot_number} onChange={e => setEdit({ ...edit, lot_number: e.target.value })} style={ipt} disabled={!!edit.id} /></Field>
          </Row>
          <Row>
            <Field label="Manufacture Date"><input type="date" value={edit.manufacture_date?.slice(0, 10) || ''} onChange={e => setEdit({ ...edit, manufacture_date: e.target.value || null })} style={ipt} /></Field>
            <Field label="Expiry Date"><input type="date" value={edit.expiry_date?.slice(0, 10) || ''} onChange={e => setEdit({ ...edit, expiry_date: e.target.value || null })} style={ipt} /></Field>
          </Row>
          <Row>
            <Field label="Manufacturer Site"><input value={edit.manufacturer_site || ''} onChange={e => setEdit({ ...edit, manufacturer_site: e.target.value })} style={ipt} /></Field>
            <Field label="Status">
              <select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} style={ipt}>
                {['active','suspended','recalled','expired','exhausted'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </Row>
          <Field label="Notes"><textarea rows={2} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} style={{ ...ipt, fontFamily: 'inherit' }} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => setEdit(null)} style={ghostBtn}>Cancel</button>
            <button onClick={save} style={primaryBtn}>Save</button>
          </div>
        </Modal>
      )}

      {history && (
        <Modal title={`Lot history: ${history.lot?.lot_number}`} onClose={() => setHistory(null)}>
          <h4 style={{ margin: '0 0 8px' }}>Linked PC cases ({history.cases?.length || 0})</h4>
          {history.cases?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No cases.</div>}
          {history.cases?.map(c => (
            <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <strong>{c.case_number || `#${c.id}`}</strong> · {c.case_type} · {c.complaint_code || '–'} · {new Date(c.created_at).toLocaleDateString()}
            </div>
          ))}
          <h4 style={{ margin: '12px 0 8px' }}>Field actions ({history.field_actions?.length || 0})</h4>
          {history.field_actions?.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No actions.</div>}
          {history.field_actions?.map(a => (
            <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <strong>{a.action_number}</strong> · {a.action_type} · {a.classification} · {a.status}
            </div>
          ))}
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setHistory(null)} style={ghostBtn}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.25)' }}>
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
function miniBtn(color = '#1a4f9c') {
  return { padding: '3px 8px', marginRight: 4, fontSize: 11, fontWeight: 600, border: `1px solid ${color}`, color, background: '#fff', borderRadius: 4, cursor: 'pointer' }
}
const shell = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '6px 10px' }
const ipt = { width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '7px 14px', fontSize: 12, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
