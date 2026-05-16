/**
 * FieldValidation — small UI helpers used alongside useFieldValidation.
 *
 * Theme 3 polish. The hook gives you `error` / `warning` strings; this file
 * gives you the chips, hint badges, and a tiny wrapper component.
 */

import { useEffect, useState } from 'react'

export function FormatHint({ hint }) {
  if (!hint) return null
  return (
    <span style={{
      fontSize: 11, color: 'var(--text-muted)', marginLeft: 6,
      padding: '1px 6px', borderRadius: 10,
      background: 'var(--surface-alt,#f1f3f7)',
    }}>{hint}</span>
  )
}

export function FieldError({ error, warning }) {
  if (!error && !warning) return null
  return (
    <div style={{
      marginTop: 3, fontSize: 11,
      color: error ? '#b91c1c' : '#8a6a00',
    }}>
      {error || warning}
    </div>
  )
}

/**
 * <ValidatedField> — drop-in wrapper that wires <input>-likes to the hook.
 * Pass the validation hook's `validate` + `errors` map; on blur it also
 * triggers an optional duplicate probe.
 */
export function ValidatedField({
  field, label, value, onChange, onBlur,
  type = 'text',
  placeholder,
  validate, checkDuplicate, errors, setErrors,
  payload, entityId, entityType = 'case',
  hint, required,
  children, // custom input
}) {
  const [dupMsg, setDupMsg] = useState(null)
  const err = errors?.[field] || dupMsg

  useEffect(() => { setDupMsg(null) }, [value])

  function handleChange(e) {
    const v = e.target ? e.target.value : e
    onChange?.(v)
    const m = validate?.(field, v, payload)
    setErrors?.(es => ({ ...es, [field]: m }))
  }

  async function handleBlur(e) {
    onBlur?.(e)
    if (!checkDuplicate) return
    const msg = await checkDuplicate(field, e?.target ? e.target.value : value, { entityId, entityType })
    if (msg) setDupMsg(msg)
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{
          display: 'block', fontSize: 12, fontWeight: 600,
          color: 'var(--text-secondary)', marginBottom: 4,
        }}>
          {label} {required && <span style={{ color: '#c44' }}>*</span>}
          <FormatHint hint={hint} />
        </label>
      )}
      {children || (
        <input
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={handleChange}
          onBlur={handleBlur}
          style={{
            width: '100%', padding: '7px 10px', fontSize: 13,
            border: `1px solid ${err ? '#c44' : 'var(--border)'}`,
            borderRadius: 6, background: 'var(--surface)',
          }}
        />
      )}
      <FieldError error={err} />
    </div>
  )
}

export default ValidatedField
