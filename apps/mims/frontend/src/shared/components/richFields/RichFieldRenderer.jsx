/**
 * RichFieldRenderer — Theme 1 dispatcher (Wave 3).
 *
 * Picks the right rich-field component from field_setup.field_type and
 * persists value via /api/rich-fields/:entity_type/:entity_id/:section/:field.
 *
 * Gated by cf.theme1_rich_fields. If disabled, renders a minimal fallback.
 *
 * Props:
 *   entityType, entityId, section, field — required (where to persist)
 *   fieldType          — 'address' | 'phone' | 'currency' | 'rich_text' | 'signature' | 'image_annotation'
 *   value, onChange    — optional; if omitted, component owns its own state and persists itself
 *   label, readOnly    — passed through
 *   imageProps         — for image_annotation: { baseImageUrl, attachmentId }
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

import AddressField    from './AddressField'
import PhoneField      from './PhoneField'
import CurrencyField   from './CurrencyField'
import RichTextField   from './RichTextField'
import SignaturePad    from './SignaturePad'
import ImageAnnotator  from './ImageAnnotator'

export default function RichFieldRenderer({
  entityType, entityId, section, field, fieldType,
  value: extValue, onChange: extOnChange,
  label, readOnly, imageProps = {},
}) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme1_rich_fields')

  const [value, setValue] = useState(extValue ?? null)
  const externallyControlled = extValue !== undefined
  const debounceRef = useRef(null)

  // Load existing value from server when uncontrolled
  useEffect(() => {
    if (externallyControlled || !enabled || !entityId) return
    const H = { Authorization: `Bearer ${token}` }
    httpFetch(`/api/rich-fields/${entityType}/${entityId}/${section}/${field}`, { headers: H })
      .then(r => r.json())
      .then(d => setValue(d.value?.value ?? null))
      .catch(() => setValue(null))
  }, [entityType, entityId, section, field, token, enabled, externallyControlled])

  const handleChange = useCallback((next) => {
    if (externallyControlled) { extOnChange?.(next); return }
    setValue(next)
    if (!enabled || !entityId) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      try {
        await httpFetch(`/api/rich-fields/${entityType}/${entityId}/${section}/${field}`, {
          method: 'PUT', headers: H,
          body: JSON.stringify({ value_type: fieldType, value: next }),
        })
      } catch { /* ignore autosave errors */ }
    }, 600)
  }, [externallyControlled, extOnChange, enabled, entityType, entityId, section, field, fieldType, token])

  if (!enabled) {
    return (
      <input
        value={typeof value === 'string' ? value : ''}
        onChange={e => handleChange(e.target.value)}
        placeholder={label || field}
        readOnly={readOnly}
        style={{ width: '100%', padding: '7px 10px', fontSize: 13,
          border: '1px solid var(--border)', borderRadius: 6 }}
      />
    )
  }

  const common = { value: value || {}, onChange: handleChange, label, readOnly }
  switch (fieldType) {
    case 'address':           return <AddressField {...common} />
    case 'phone':             return <PhoneField {...common} />
    case 'currency':          return <CurrencyField {...common} />
    case 'rich_text':         return <RichTextField {...common} />
    case 'signature':         return <SignaturePad {...common} />
    case 'image_annotation':  return <ImageAnnotator {...common} {...imageProps} />
    default:
      return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unknown rich type: {fieldType}</div>
  }
}
