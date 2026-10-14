/**
 * MiResponseSettings.jsx — MIMS Admin > System > Setup > Medical Information >
 * MI Response Settings (MI response review, Rohith 2026-10-14).
 *
 * What an organisation decides about its answers, in one place: the off-label
 * statement and the closing statement printed on the letter, whether an
 * off-label answer must enclose the prescribing information, the working days
 * a routine and an urgent question have (they fill Response Required By on a
 * new MI), and when an answer needs a second signer.
 */

import { useEffect, useState } from 'react'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const box = { maxWidth: 820, background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', padding: 16, marginBottom: 14 }
const label = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary, #374151)', marginBottom: 4 }
const hint = { fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: '4px 0 0' }
const input = { width: '100%', padding: '7px 9px', border: '1px solid var(--border, #d1d5db)', borderRadius: 2, font: 'inherit' }

export default function MiResponseSettings() {
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    httpFetch('/api/admin/mi-response-settings')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load the settings.'); setS(d) })
      .catch(err => setFlash({ type: 'error', text: err.message || 'Could not load the settings.' }))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await httpFetch('/api/admin/mi-response-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offlabel_statement: s.offlabel_statement, closing_statement: s.closing_statement,
          require_pi_offlabel: s.require_pi_offlabel, routine_days: s.routine_days, urgent_days: s.urgent_days,
          two_signers: { off_label: s.two_signers?.off_label?.on, always: s.two_signers?.always?.on },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed.')
      setS(data); setFlash({ type: 'ok', text: 'MI response settings saved.' })
    } catch (err) { setFlash({ type: 'error', text: err.message }) }
    finally { setSaving(false); setTimeout(() => setFlash(null), 3500) }
  }

  if (!s) return <div style={{ padding: 24 }}>{flash ? flash.text : 'Loading…'}</div>
  const set = (k, v) => setS(p => ({ ...p, [k]: v }))
  const setSigner = (k, on) => setS(p => ({ ...p, two_signers: { ...p.two_signers, [k]: { ...p.two_signers[k], on } } }))
  const offPlatform = !!s.two_signers?.off_label?.platform

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }} data-testid="mi-response-settings">
      <h1 style={{ margin: '0 0 6px', fontSize: 18 }}>MI Response Settings</h1>
      <p style={{ ...hint, margin: '0 0 14px' }}>How this organisation's answers to medical information questions are written, timed and signed.</p>
      {flash && <div className={`alert alert-${flash.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>{flash.text}</div>}

      <section style={box}>
        <label style={label} htmlFor="mrs-offlabel">Off-label statement</label>
        <textarea id="mrs-offlabel" rows={5} style={input} value={s.offlabel_statement || ''} onChange={e => set('offlabel_statement', e.target.value)} />
        <p style={hint}>Added to every answer about a use the product is not approved for. {'{{product_name}}'} is replaced with the product.</p>
        <label style={{ ...label, marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" checked={!!s.require_pi_offlabel} onChange={e => set('require_pi_offlabel', e.target.checked)} />
          An off-label answer must enclose the prescribing information
        </label>
        <p style={hint}>The letter is refused at Send until a document of type "Prescribing Information" is enclosed.</p>
      </section>

      <section style={box}>
        <label style={label} htmlFor="mrs-closing">Closing statement</label>
        <textarea id="mrs-closing" rows={3} style={input} value={s.closing_statement || ''} onChange={e => set('closing_statement', e.target.value)} placeholder="For example: how to report a side effect, or who to contact with further questions." />
        <p style={hint}>Added to the end of every answer. Leave empty for none.</p>
      </section>

      <section style={box}>
        <span style={label}>Time to answer (working days from Date Received)</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ fontSize: 13 }}>Routine <input aria-label="Routine working days" type="number" min="0" max="60" style={{ ...input, width: 80, marginLeft: 6 }} value={s.routine_days ?? ''} onChange={e => set('routine_days', e.target.value)} /></label>
          <label style={{ fontSize: 13 }}>Urgent <input aria-label="Urgent working days" type="number" min="0" max="60" style={{ ...input, width: 80, marginLeft: 6 }} value={s.urgent_days ?? ''} onChange={e => set('urgent_days', e.target.value)} /></label>
        </div>
        <p style={hint}>Fills Response Required By on a new MI question; urgent cases use the urgent days. Empty means no date is set.</p>
      </section>

      <section style={box}>
        <span style={label}>Second signer</span>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={!!s.two_signers?.off_label?.on} disabled={offPlatform} onChange={e => setSigner('off_label', e.target.checked)} />
          Off-label answers need a medical reviewer and an approver{offPlatform ? ' (set for every organisation by the platform)' : ''}
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
          <input type="checkbox" checked={!!s.two_signers?.always?.on} disabled={!!s.two_signers?.always?.platform} onChange={e => setSigner('always', e.target.checked)} />
          Every answer needs a medical reviewer and an approver
        </label>
      </section>

      <button type="button" className="cf-save-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
