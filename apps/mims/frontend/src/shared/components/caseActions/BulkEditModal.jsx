/**
 * BulkEditModal — Theme 8 (Wave 4) bulk-apply field patch to many cases.
 *
 * Workflow:
 *   1. Caller passes an array of selected case ids.
 *   2. User adds field/value pairs to the patch.
 *   3. POST /api/cases/bulk-update with { case_ids, patch }.
 *
 * Props:
 *   open, onClose
 *   caseIds          — required
 *   suggestedFields? — array of field names to surface as quick-pick
 *   onDone?          — ({ updated, skipped }) => void
 */

import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function BulkEditModal({ open, onClose, caseIds = [], suggestedFields = [], onDone }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme8_smart_actions')
  const [patch, setPatch] = useState({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  if (!open || !enabled) return null

  function setField(k, v) { setPatch(p => ({ ...p, [k]: v })) }
  function removeField(k) {
    setPatch(p => { const c = { ...p }; delete c[k]; return c })
  }
  function addBlank() {
    let i = 1; while (patch[`field_${i}`] !== undefined) i++
    setField(`field_${i}`, '')
  }

  async function apply() {
    if (!Object.keys(patch).length) { alert('Add at least one field/value pair'); return }
    if (!confirm(`Apply patch to ${caseIds.length} case(s)?`)) return
    setBusy(true)
    try {
      const r = await httpFetch('/api/cases/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ case_ids: caseIds, patch }),
      })
      const d = await r.json()
      setResult(d)
      onDone?.(d)
    } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, maxWidth: '92vw', background: 'var(--surface,#fff)',
        borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Bulk edit · {caseIds.length} case{caseIds.length === 1 ? '' : 's'}</strong>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          {result ? (
            <div style={{ padding: 16, background: '#e6f9ee', border: '1px solid #a7f3c1', borderRadius: 6, fontSize: 13 }}>
              ✓ Updated <strong>{result.updated}</strong> · Skipped <strong>{result.skipped}</strong>
            </div>
          ) : (
            <>
              {suggestedFields.length > 0 && (
                <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                  Suggested fields:
                  {suggestedFields.map(f => (
                    <button key={f} onClick={() => setField(f, patch[f] || '')} style={chip}>
                      + {f}
                    </button>
                  ))}
                </div>
              )}
              {Object.keys(patch).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Add field/value pairs to apply to every selected case.
                </div>
              )}
              {Object.entries(patch).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input value={k} onChange={e => {
                    const newKey = e.target.value
                    setPatch(p => {
                      const c = {}; for (const [pk, pv] of Object.entries(p))
                        c[pk === k ? newKey : pk] = pv; return c
                    })
                  }} placeholder="field" style={{ ...ipt, flex: 1 }} />
                  <input value={v} onChange={e => setField(k, e.target.value)} placeholder="value" style={{ ...ipt, flex: 2 }} />
                  <button onClick={() => removeField(k)} style={removeBtn}>✕</button>
                </div>
              ))}
              <button onClick={addBlank} style={addBtn}>+ Add field</button>
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose} style={ghost}>Cancel</button>
                <button onClick={apply} disabled={busy} style={primary}>
                  {busy ? 'Applying…' : `Apply to ${caseIds.length} case${caseIds.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const ipt = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const chip = { marginLeft: 6, padding: '2px 8px', fontSize: 11, border: '1px dashed var(--border)',
  borderRadius: 10, background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }
const removeBtn = { padding: '0 9px', fontSize: 12, border: '1px solid #b91c1c',
  color: '#b91c1c', background: '#fff', borderRadius: 4, cursor: 'pointer' }
const addBtn = { padding: '6px 10px', fontSize: 12, fontWeight: 600,
  border: '1px dashed var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer' }
const primary = { padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghost = { padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)',
  borderRadius: 4, cursor: 'pointer' }
