/**
 * PhoneField — Theme 1 Rich Field (Wave 3).
 * Value shape: { country_code, number, extension, e164 }
 * Strips non-digits, recomputes E.164 on every edit.
 */

export default function PhoneField({ value = {}, onChange, label, readOnly }) {
  function set(patch) {
    const next = { ...value, ...patch }
    const cc = String(next.country_code || '').replace(/[^\d+]/g, '')
    const n  = String(next.number       || '').replace(/[^\d]/g, '')
    next.e164 = n ? `${cc ? (cc.startsWith('+') ? cc : '+' + cc) : '+'}${n}` : null
    onChange?.(next)
  }
  return (
    <div>
      {label && <div style={lbl}>{label}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <input placeholder="+1" disabled={readOnly}
          value={value.country_code || ''} onChange={e => set({ country_code: e.target.value })}
          style={{ ...ipt, width: 60 }} />
        <input placeholder="555 0100" disabled={readOnly}
          value={value.number || ''} onChange={e => set({ number: e.target.value })}
          style={{ ...ipt, flex: 1 }} />
        <input placeholder="ext." disabled={readOnly}
          value={value.extension || ''} onChange={e => set({ extension: e.target.value })}
          style={{ ...ipt, width: 70 }} />
      </div>
      {value.e164 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          E.164: {value.e164}{value.extension ? ` ext. ${value.extension}` : ''}
        </div>
      )}
    </div>
  )
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
const ipt = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
