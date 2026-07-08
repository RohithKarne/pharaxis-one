import { useState, useEffect } from 'react'

/**
 * useMediaQuery — subscribe to a CSS media query and re-render on change.
 * Viewport-driven (never user-agent sniffing), so it correctly follows resize,
 * orientation changes, and any device without special-casing.
 *
 *   const isPhone = useMediaQuery('(max-width: 639px)')
 */
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(query).matches
    : false)
  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

// Shared breakpoint scale — keep in sync with the CSS breakpoints in index.css.
//   phone   : < 640px
//   tablet  : 640–1023px (includes iPad portrait)
//   desktop : >= 1024px
export const BREAKPOINTS = { phone: 640, tablet: 1024 }

/** Convenience helpers for the common cases. */
export const useIsPhone   = () => useMediaQuery('(max-width: 639px)')
export const useIsTablet  = () => useMediaQuery('(min-width: 640px) and (max-width: 1023px)')
export const useIsTouch   = () => useMediaQuery('(pointer: coarse)')
export const useIsMobileOrTablet = () => useMediaQuery('(max-width: 1023px)')
