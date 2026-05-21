/**
 * WiredField — drop-in replacements for plain <input>, <textarea>, <select>
 * that carry ALL Wave 1–9 theme wiring:
 *
 *   - Theme 3 (validation)        — useFieldValidation: error/warn under the input
 *   - Theme 5 (presence)          — FieldPresenceBadge + focus/blur push to WS
 *   - Theme 9 (locks + reason)    — LockedFieldBadge + ReasonForChangeModal interception
 *   - Wave 0 #2 (history popover) — FieldHistoryPopover next to the label
 *
 * Use:
 *   const ctx = useCaseFieldContext()   // (provided by CaseFormShell)
 *
 *   <WiredField label="Status" field="status" section="case_meta"
 *     value={infoForm.status_id}
 *     onChange={v => setInfoForm(p => ({ ...p, status_id: v }))}
 *     asSelect options={statuses.map(s => ({ value: s.id, label: s.name }))} />
 *
 *   <WiredTextarea label="Description" field="description" section="case_meta"
 *     value={infoForm.description}
 *     onChange={v => setInfoForm(p => ({ ...p, description: v }))} />
 *
 * If `useCaseFieldContext()` returns null (e.g. tab rendered standalone), all
 * theme wiring becomes a no-op and the input behaves exactly like a plain
 * HTML element — so this is safe to drop in everywhere.
 */

import { createContext, useContext, useState } from 'react'
import FieldHistoryPopover from './FieldHistoryPopover'
import LockedFieldBadge from './compliance/LockedFieldBadge'
import ReasonForChangeModal from './compliance/ReasonForChangeModal'
import FieldPresenceBadge from './collab/FieldPresenceBadge'
import { useFeatureFlag } from '../context/FeatureFlagsContext'

// ── Context — populated by CaseFormShell so wrapped tabs inherit case info ─

const CaseFieldCtx = createContext(null)

export function CaseFieldProvider({
  caseId, caseStatus, presence = null, currentUserId = null, children,
}) {
  return (
    <CaseFieldCtx.Provider value={{ caseId, caseStatus, presence, currentUserId }}>
      {children}
    </CaseFieldCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCaseFieldContext() { return useContext(CaseFieldCtx) }

// ── Shared label + chrome row ────────────────────────────────────────────────

function FieldLabel({ label, required, section, field }) {
  const ctx = useCaseFieldContext()
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span>{label}{required ? ' *' : ''}</span>
      {ctx?.caseId && field && (
        <FieldHistoryPopover entityType="case" entityId={ctx.caseId} field={field} label={label} />
      )}
      {section && field && (
        <LockedFieldBadge section={section} field={field} caseStatus={ctx?.caseStatus} />
      )}
      {section && field && (
        <FieldPresenceBadge field={field} presence={ctx?.presence} currentUserId={ctx?.currentUserId} />
      )}
    </label>
  )
}

function FieldFooter({ error, warning }) {
  if (!error && !warning) return null
  return (
    <div style={{
      marginTop: 3, fontSize: 11,
      color: error ? '#b91c1c' : '#8a6a00',
    }}>{error || warning}</div>
  )
}

// ── Reason-for-change interceptor (Theme 9) ─────────────────────────────────

function useReasonGuard(field, oldValue, applyNew) {
  const t9 = useFeatureFlag('cf.theme9_compliance')
  const [pending, setPending] = useState(null)
  function gated(newValue) {
    if (t9 && oldValue != null && oldValue !== '' && oldValue !== newValue) {
      setPending({ field, oldValue, newValue }); return
    }
    applyNew(newValue)
  }
  function modal() {
    return (
      <ReasonForChangeModal
        open={!!pending} onClose={() => setPending(null)}
        onConfirm={() => { applyNew(pending.newValue); setPending(null) }}
        field={pending?.field}
        oldValue={pending?.oldValue}
        newValue={pending?.newValue}
      />
    )
  }
  return { gated, modal }
}

// ── WiredField — input + optional asSelect ───────────────────────────────────

export function WiredField({
  label, field, section, value, onChange, required, disabled,
  type = 'text', placeholder,
  asSelect = false, options = [], asTextarea = false, rows = 3,
  error, warning, fullWidth, className,
}) {
  const ctx = useCaseFieldContext()
  const guard = useReasonGuard(field, value, (v) => onChange?.(v))

  const onFocus = () => ctx?.presence?.actions?.focus?.(field)
  const onBlur  = () => ctx?.presence?.actions?.blur?.(field)

  const wrap = (children) => (
    <div className={`cf-form-field${fullWidth ? ' cf-form-field--full' : ''}${error ? ' cf-form-field--error' : ''}${className ? ' ' + className : ''}`}>
      <FieldLabel label={label} required={required} section={section} field={field} />
      {children}
      <FieldFooter error={error} warning={warning} />
      {guard.modal()}
    </div>
  )

  if (asSelect) {
    return wrap(
      <select value={value ?? ''} disabled={disabled} required={required}
        onChange={e => guard.gated(e.target.value)} onFocus={onFocus} onBlur={onBlur}>
        {options.map(o => (
          <option key={o.value ?? o.label} value={o.value ?? ''}>{o.label ?? o.value}</option>
        ))}
      </select>
    )
  }

  if (asTextarea) {
    return wrap(
      <textarea rows={rows} value={value ?? ''} placeholder={placeholder}
        disabled={disabled} required={required}
        onChange={e => guard.gated(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
    )
  }

  // B14 — HTML <input type="date"> silently rejects ISO datetimes like
  // '2026-05-16T00:00:00.000Z'. Slice to 'YYYY-MM-DD' so server-stored ISO
  // strings render in the picker. Other types pass through unchanged.
  const renderedValue = (type === 'date' && typeof value === 'string' && value.length >= 10)
    ? value.slice(0, 10)
    : (value ?? '')

  return wrap(
    <input type={type} value={renderedValue} placeholder={placeholder}
      disabled={disabled} required={required}
      onChange={e => guard.gated(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
  )
}

// Convenience aliases

export function WiredTextarea(props) { return <WiredField {...props} asTextarea fullWidth /> }
export function WiredSelect(props)   { return <WiredField {...props} asSelect /> }

export default WiredField
