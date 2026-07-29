import { useMemo } from 'react'

/**
 * Resolves a platform ("core") field's presentation from the backend.
 *
 * Core fields — Status, Case Owner, Priority, Date Received, Awareness Date,
 * Description, Internal Notes — are drawn by the wizard's own JSX, but their
 * label, required flag and visibility come from `field_setup` (migration 102,
 * exposed as `formConfig.core`). That is what makes them backend-controlled
 * without the form rendering them twice: the wizard owns the control, the
 * backend owns whether and how it appears.
 *
 * Falls back to the caller's hardcoded label when the org has no row for a key,
 * so a missing definition degrades to today's behaviour rather than a blank form.
 */
export default function useCoreFields(formConfig) {
  const core = formConfig?.core || null

  return useMemo(() => {
    return function coreField(key, fallbackLabel = '') {
      const def = core?.[key]
      if (!def) {
        return { label: fallbackLabel, required: false, hidden: false, helpText: null, defined: false }
      }
      return {
        label: def.label || fallbackLabel,
        required: !!def.is_required,
        hidden: !!def.is_hidden,
        helpText: def.help_text || null,
        defined: true,
      }
    }
  }, [core])
}
