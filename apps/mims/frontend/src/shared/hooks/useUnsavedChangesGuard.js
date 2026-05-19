/**
 * useUnsavedChangesGuard — B19 (Bucket-1 fix).
 *
 * Lightweight hook that warns the user before they leave a page (close tab,
 * reload, or navigate away via the router) while there are unsaved changes.
 *
 * Two guards are wired:
 *   1. `beforeunload` — handles the browser tab close / reload prompt.
 *   2. A React-Router-aware confirm hook is NOT included here because we use
 *      multiple router stacks (HashRouter inside module shells); instead the
 *      caller can pair this hook with a `confirm()` inside its own navigation
 *      handlers (e.g. tab-switch buttons) and call `isDirty.current` to gate.
 *
 * Usage:
 *   const { setDirty, clearDirty, isDirty } = useUnsavedChangesGuard()
 *   setDirty(infoForm !== savedInfoForm)
 *   // in a tab-switch handler:
 *   function switchTab(next) {
 *     if (isDirty.current && !window.confirm('You have unsaved changes. Switch anyway?')) return
 *     setActiveTab(next)
 *   }
 */

import { useEffect, useRef, useCallback } from 'react'

export default function useUnsavedChangesGuard() {
  const isDirty = useRef(false)

  const setDirty   = useCallback((flag) => { isDirty.current = !!flag }, [])
  const clearDirty = useCallback(() => { isDirty.current = false }, [])

  useEffect(() => {
    function onBeforeUnload(e) {
      if (!isDirty.current) return undefined
      // Modern browsers require returnValue to be set; the displayed text is
      // not customizable any more.
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { isDirty, setDirty, clearDirty }
}
