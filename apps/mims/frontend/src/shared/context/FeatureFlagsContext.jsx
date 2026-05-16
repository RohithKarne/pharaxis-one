/**
 * FeatureFlagsContext — Wave 0 boot pull of /api/feature-flags/resolved.
 *
 * Wraps the app once at boot. Components read flags via useFeatureFlag('cf.themeX...').
 * Refreshes every 5 minutes (covers admin toggles without forcing a reload).
 *
 * Usage in src/main.jsx (or App.jsx):
 *   <AuthProvider>
 *     <FeatureFlagsProvider>
 *       <App />
 *     </FeatureFlagsProvider>
 *   </AuthProvider>
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { httpFetch } from '../api/httpFetch.js'

const Ctx = createContext({ flags: {}, ready: false, refresh: () => {} })

export function FeatureFlagsProvider({ children }) {
  const { token } = useAuth()
  const [flags, setFlags] = useState({})
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!token) { setFlags({}); setReady(true); return }
    try {
      const r = await httpFetch('/api/feature-flags/resolved', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setFlags(d.flags || {})
    } catch { setFlags({}) } finally { setReady(true) }
  }, [token])

  useEffect(() => {
    refresh()
    if (!token) return
    const t = setInterval(refresh, 5 * 60_000)
    return () => clearInterval(t)
  }, [refresh, token])

  return <Ctx.Provider value={{ flags, ready, refresh }}>{children}</Ctx.Provider>
}

export function useFeatureFlags() { return useContext(Ctx) }

export function useFeatureFlag(key) {
  const { flags } = useContext(Ctx)
  return !!flags?.[key]
}

export default FeatureFlagsProvider
