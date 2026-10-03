import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * useRememberedFilters — a list screen's filters, kept in this browser per user, so
 * leaving the screen and coming back finds them still set.
 *
 *   const [filters, setFilters] = useRememberedFilters('case-query', { search: '', status: '' })
 *
 * Stored values are merged over the defaults, so a filter added later starts at its
 * default. Storage can be missing or blocked (private window); the screen then simply
 * starts with the defaults.
 */
export default function useRememberedFilters(screen, defaults) {
  const { user } = useAuth()
  const key = `mims.filters.${user?.id || 'anon'}.${screen}`
  const [filters, setFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null')
      return saved && typeof saved === 'object' ? { ...defaults, ...saved } : defaults
    } catch {
      return defaults
    }
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(filters)) } catch { /* storage unavailable */ }
  }, [key, filters])

  return [filters, setFilters]
}

/** True when this user has filters remembered for the screen. */
export function hasRememberedFilters(userId, screen) {
  try { return localStorage.getItem(`mims.filters.${userId || 'anon'}.${screen}`) != null } catch { return false }
}
