import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { translate } from '../utils/translations'

const PortalContext = createContext(null)

export function PortalProvider({ children }) {
  const { clientCode: rawClientCode } = useParams()
  const clientCode = /^[a-zA-Z0-9_-]+$/.test(rawClientCode || '') ? rawClientCode : null
  const navigate = useNavigate()
  const [portalConfig, setPortalConfig] = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const portalConfigRef                 = useRef(null)
  const [user, setUser]                 = useState(null)
  const [showGate, setShowGate]         = useState(false)
  // English-only for now (2026-07-03) — language switching disabled; always 'en'.
  const [language, setLanguageState]    = useState('en')

  // Show gate when: gate is enabled, user is logged in, user hasn't confirmed type yet
  useEffect(() => {
    if (!portalConfig?.gate) { setShowGate(false); return }
    if (user && user.user_type_confirmed === 0) {
      setShowGate(true)
    } else {
      setShowGate(false)
    }
  }, [portalConfig, user])

  const fetchConfig = useCallback(() => {
    if (!clientCode) return
    // Only show the loading spinner on initial load; background refetches are silent
    if (portalConfigRef.current === null) setLoading(true)
    fetch(`/api/portal/config/${clientCode}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        portalConfigRef.current = d
        setPortalConfig(d)
        applyBranding(d.branding)
        setLoading(false)
      })
      .catch(() => { setError('Unable to load portal configuration.'); setLoading(false) })
  }, [clientCode])

  useEffect(() => {
    if (!clientCode) return

    fetchConfig()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') fetchConfig()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [clientCode])

  function applyBranding(b) {
    if (!b) return
    const r = document.documentElement.style
    if (b.primary_color)     r.setProperty('--pp-primary',      b.primary_color)
    if (b.secondary_color)   r.setProperty('--pp-secondary',    b.secondary_color)
    if (b.accent_color)      r.setProperty('--pp-accent',       b.accent_color)
    if (b.background_color)  r.setProperty('--pp-bg',           b.background_color)
    if (b.surface_color)     r.setProperty('--pp-surface',      b.surface_color)
    if (b.text_primary)      r.setProperty('--pp-text',         b.text_primary)
    if (b.text_secondary)    r.setProperty('--pp-text-muted',   b.text_secondary)
    if (b.border_color)      r.setProperty('--pp-border',       b.border_color)
    if (b.header_bg)         r.setProperty('--pp-header-bg',    b.header_bg)
    if (b.header_text)       r.setProperty('--pp-header-text',  b.header_text)
    if (b.footer_bg)         r.setProperty('--pp-footer-bg',    b.footer_bg)
    if (b.footer_text)       r.setProperty('--pp-footer-text',  b.footer_text)
    if (b.button_bg)         r.setProperty('--pp-btn',          b.button_bg)
    if (b.button_text)       r.setProperty('--pp-btn-text',     b.button_text)
    if (b.link_color)        r.setProperty('--pp-link',         b.link_color)
    if (b.font_family)       r.setProperty('--pp-font',         b.font_family)
    if (b.base_font_size)    r.setProperty('--pp-font-size',    b.base_font_size)
    if (b.border_radius)     r.setProperty('--pp-radius',       b.border_radius)
    if (b.favicon_url) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      link.href = b.favicon_url
    }

    // Base tab title from branding; page-level usePageTitle refines it with a label.
    document.title = b.portal_name || b.custom_domain || 'CP Portal'
  }

  const portalHeaders = useCallback(() => {
    return { 'Content-Type': 'application/json' }
  }, [])

  function isFeatureEnabled(key) {
    if (loading) return null // still loading — callers should treat null as loading
    if (!portalConfig?.features) return false
    const featureOn = !!portalConfig.features[key]
    if (!featureOn) return false
    // If gate is active and user has confirmed their type, check access matrix
    if (portalConfig.gate && user?.user_type_confirmed && user.user_type) {
      const accessMap = portalConfig.gate.accessMap
      if (accessMap?.[key]?.[user.user_type] === false) return false
    }
    return true
  }

  function login(userData, _token) {
    localStorage.removeItem('cp_portal_token')
    localStorage.setItem('cp_portal_user', JSON.stringify(userData))
    setUser(userData)
    // Hide gate immediately after confirm-type saves (user_type_confirmed becomes 1)
    if (userData.user_type_confirmed) setShowGate(false)
  }

  function logout() {
    localStorage.removeItem('cp_portal_token')
    localStorage.removeItem('cp_portal_user')
    setUser(null)
  }

  function setLanguage(lang) {
    localStorage.setItem(`cp_lang_${rawClientCode}`, lang)
    setLanguageState(lang)
  }

  function t(key) {
    return translate(language, key)
  }

  // AUTH-05: central fetch helper — attaches auth header and auto-logs out on 401
  async function portalFetch(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (res.status === 401) {
      logout()
      navigate(`/portal/${clientCode}/login`, { replace: true })
      return res
    }
    return res
  }

  // Restore signed-in user from DB on mount/refresh — localStorage alone is not the source of truth.
  // NOTE: uses a RAW fetch, not portalFetch, on purpose. The portal is browsable anonymously,
  // so this probe returns 401 for every visitor who isn't signed in — and portalFetch redirects
  // to the portal login on any 401, which would bounce anonymous visitors off public pages.
  // The restore must be silent: 200 → set user; 401 → clear state and stay put. Pages that truly
  // require auth are already protected by PortalAuthGuard / their own redirects.
  useEffect(() => {
    if (!clientCode) return
    localStorage.removeItem('cp_portal_token')
    fetch(`/api/portal/auth/me`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } })
      .then(async res => {
        if (res.status === 200) {
          const d = await res.json()
          setUser(d.user)
        } else if (res.status === 401) {
          logout()
        }
      })
      .catch(() => {
        // network error — leave user as null, do not logout
      })
  }, [clientCode])

  return (
    <PortalContext.Provider value={{ portalConfig, loading, error, user, login, logout, portalHeaders, portalFetch, isFeatureEnabled, clientCode, showGate, refetchConfig: fetchConfig, language, setLanguage, t }}>
      {children}
    </PortalContext.Provider>
  )
}

export function usePortal() { return useContext(PortalContext) }
