/**
 * TransmissionSetup.jsx — MIMS Admin > System > Setup > Medical Information >
 * Transmission Setup (MI response and hand-off review, Rohith 2026-10-14).
 *
 * Where AE cases go (the safety system) and where PC cases go (the quality
 * system): the address, the key MIMS sends with (write-only, kept encrypted),
 * on or off, and the working days a case has to get there. A Test button sends
 * a test message. The menu item used to open an empty page, so no case could
 * ever be transmitted.
 */

import { useEffect, useState } from 'react'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const box = { maxWidth: 820, background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', padding: 16, marginBottom: 14 }
const label = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #374151)', margin: '10px 0 4px' }
const hint = { fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: '4px 0 0' }
const input = { width: '100%', padding: '7px 9px', border: '1px solid var(--border, #d1d5db)', borderRadius: 2, font: 'inherit' }

function TargetCard({ target, onSaved }) {
  const [form, setForm] = useState({ endpoint_url: target.endpoint_url, enabled: target.enabled, handoff_days: target.handoff_days, api_key: '' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true); setNote(null)
    try {
      const res = await httpFetch(`/api/admin/transmission-setup/${target.type}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed.')
      setForm(p => ({ ...p, api_key: '' })); onSaved(data); setNote({ ok: true, text: 'Saved.' })
    } catch (err) { setNote({ ok: false, text: err.message }) } finally { setBusy(false) }
  }
  async function test() {
    setBusy(true); setNote(null)
    try {
      const res = await httpFetch(`/api/admin/transmission-setup/${target.type}/test`, { method: 'POST' })
      const data = await res.json()
      setNote({ ok: !!data.ok, text: data.message || data.error || 'No answer.' })
    } catch (err) { setNote({ ok: false, text: err.message }) } finally { setBusy(false) }
  }

  return (
    <section style={box} data-testid={`target-${target.type}`}>
      <h3 style={{ margin: 0, fontSize: 15 }}>{target.label} <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b7280)' }}>— receives {target.case_type} cases</span></h3>
      <label style={label} htmlFor={`${target.type}-url`}>Address (https)</label>
      <input id={`${target.type}-url`} style={input} value={form.endpoint_url} onChange={e => set('endpoint_url', e.target.value)} placeholder="https://safety.example.com/intake" />
      <label style={label} htmlFor={`${target.type}-key`}>Key</label>
      <input id={`${target.type}-key`} type="password" style={input} value={form.api_key} onChange={e => set('api_key', e.target.value)} placeholder={target.has_key ? 'A key is saved — type a new one to replace it' : 'No key saved'} autoComplete="new-password" />
      <p style={hint}>Sent as the x-api-key header. Kept encrypted and never shown again.</p>
      <label style={label} htmlFor={`${target.type}-days`}>Working days to hand a case off</label>
      <input id={`${target.type}-days`} type="number" min="0" max="30" style={{ ...input, width: 90 }} value={form.handoff_days} onChange={e => set('handoff_days', e.target.value)} />
      <p style={hint}>Counted from the awareness date (AE) or Date Received (PC). The Transmission screen shows the due date and marks a late hand-off.</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 10 }}>
        <input type="checkbox" checked={!!form.enabled} onChange={e => set('enabled', e.target.checked)} /> On — {target.case_type} cases can be transmitted here
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" className="cf-save-btn" onClick={save} disabled={busy}>Save</button>
        <button type="button" className="cf-open-btn" onClick={test} disabled={busy || !target.endpoint_url}>Send a test</button>
        {target.last_sync_at && <span style={hint}>Last sent {String(target.last_sync_at).slice(0, 16).replace('T', ' ')}</span>}
      </div>
      {note && <div className={`alert alert-${note.ok ? 'success' : 'error'}`} style={{ display: 'block', marginTop: 10 }}>{note.text}</div>}
    </section>
  )
}

export default function TransmissionSetup() {
  const [targets, setTargets] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    httpFetch('/api/admin/transmission-setup')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load Transmission Setup.'); setTargets(d.targets || []) })
      .catch(err => setError(err.message || 'Could not load Transmission Setup.'))
  }, [])
  if (!targets) return <div style={{ padding: 24 }}>{error || 'Loading…'}</div>
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }} data-testid="transmission-setup">
      <h1 style={{ margin: '0 0 6px', fontSize: 18 }}>Transmission Setup</h1>
      <p style={{ ...hint, margin: '0 0 14px' }}>Where this organisation's adverse event and product complaint cases are handed off. MIMS sends the case as recorded; coding, assessment and reporting to authorities happen in the receiving system.</p>
      {targets.map(t => <TargetCard key={t.type} target={t} onSaved={saved => setTargets(ts => ts.map(x => x.type === saved.type ? saved : x))} />)}
    </div>
  )
}
