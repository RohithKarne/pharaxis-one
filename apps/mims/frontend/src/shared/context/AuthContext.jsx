'use strict'
/**
 * AuthContext.jsx — Global Authentication State (Sprint 7: Multi-Org)
 * Stores: user, modules, orgId, siteId, orgName, allOrgs
 * Provides: login(), logout(), switchOrg(), refreshOrgAccess(), getInitials(), formatRole(), hasModuleAccess()
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { httpFetch } from '../api/httpFetch.js'
import { formatAdminRoleLabel, hasGlobalAdminScope } from '../utils/adminScope.js'

const AuthContext = createContext(null)

// While the backend restarts, the dev proxy answers 502/503/504 or the request
// fails outright for a few seconds. That means "server restarting", not "signed
// out" or "no access": wait and retry instead of sending the user to the sign-in
// or no-access page (M-51).
const SERVER_RESTARTING = new Set([502, 503, 504])
const RECONNECT_DELAY_MS = 2000
const RECONNECT_ATTEMPTS = 30 // about a minute

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchUnlessRestarting(url, init) {
  try {
    const res = await httpFetch(url, init)
    return SERVER_RESTARTING.has(res.status) ? null : res
  } catch {
    return null
  }
}
// The server no longer sends the session token to the page (T15 / M-9): it lives
// only in the httpOnly mims_token cookie, which scripts cannot read. `token` in
// this context is now a marker meaning "a session is active" — components keep
// checking it and sending it, and the server ignores a bearer value that is not a
// real token and uses the cookie.
const COOKIE_SESSION = 'cookie-session'

function createUnrestrictedSecurityAccess() {
  return { resolved: true, unrestricted: true, system_options: null, case_options: null }
}

function createUnresolvedSecurityAccess() {
  return { resolved: false, unrestricted: false, system_options: {}, case_options: {} }
}

// Case-form drafts (adverse event, product complaint, medical information,
// contacts) can hold patient details. The case tabs keep them in sessionStorage
// so closing the tab discards them, and every sign-in and sign-out wipes them so
// the next person at this browser never sees them. localStorage is swept too,
// for drafts left there by builds before 2026-09-27.
const CASE_DRAFT_PREFIX = 'mims_case_'

function clearCaseDrafts() {
  for (const store of [globalThis.sessionStorage, globalThis.localStorage]) {
    try {
      Object.keys(store).filter(k => k.startsWith(CASE_DRAFT_PREFIX)).forEach(k => store.removeItem(k))
    } catch { /* storage unavailable */ }
  }
}

function isPublicAuthPath() {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname || ''
  return (
    path.endsWith('/login') ||
    path.endsWith('/mims-admin/login') ||
    path.endsWith('/content/login') ||
    path.endsWith('/reports/login') ||
    path.includes('/auth/sso-complete')
  )
}

export function AuthProvider({ children, storageKeyPrefix = 'mims', fallbackPrefixes = [] }) {
  const KEY = storageKeyPrefix
  const disableFallbackKey = `${KEY}_disable_fallback`

  function loadFromPrefix(prefix) {
    const savedUser = localStorage.getItem(`${prefix}_user`)
    if (!savedUser) return null
    return {
      user:    JSON.parse(savedUser),
      // SECURITY (F14): the raw session JWT is NEVER persisted in localStorage
      // (XSS-exfiltratable). Authentication on reload is restored via the
      // httpOnly `mims_token` cookie, which is sent automatically on same-origin
      // /api requests. Token lives in React state/memory only.
      token:   null,
      modules: JSON.parse(localStorage.getItem(`${prefix}_modules`) || '[]'),
      orgId:   localStorage.getItem(`${prefix}_org_id`) ? Number(localStorage.getItem(`${prefix}_org_id`)) : null,
      siteId:  localStorage.getItem(`${prefix}_site_id`) ? Number(localStorage.getItem(`${prefix}_site_id`)) : null,
      orgName:  localStorage.getItem(`${prefix}_org_name`)  || null,
      siteName: localStorage.getItem(`${prefix}_site_name`) || null,
      allOrgs:  JSON.parse(localStorage.getItem(`${prefix}_all_orgs`) || '[]'),
    }
  }

  function initState(field) {
    const primary = loadFromPrefix(KEY)
    if (primary) return primary[field]
    const disableFallback = localStorage.getItem(disableFallbackKey) === '1'
    if (!disableFallback) {
      for (const p of fallbackPrefixes) {
        const fallback = loadFromPrefix(p)
        if (fallback) return fallback[field]
      }
    }
    return field === 'modules' || field === 'allOrgs' ? [] : null
  }

  const [user,    setUser]    = useState(() => initState('user'))
  const [token,   setToken]   = useState(() => initState('token'))
  const [modules, setModules] = useState(() => initState('modules'))
  const [orgId,   setOrgId]   = useState(() => initState('orgId'))
  const [siteId,  setSiteId]  = useState(() => initState('siteId'))
  const [orgName,  setOrgName]  = useState(() => initState('orgName'))
  const [siteName, setSiteName] = useState(() => initState('siteName'))
  const [allOrgs,       setAllOrgs]       = useState(() => initState('allOrgs'))
  const [securityAccess, setSecurityAccess] = useState(() => createUnresolvedSecurityAccess())
  // True while a cookie-backed session MAY exist but the in-memory token hasn't
  // been rehydrated yet (persisted user, no token, non-public path). ProtectedRoute
  // waits on this instead of bouncing a valid session to /login on every hard
  // refresh (the JWT is cookie-only by design — F14 — so token is ALWAYS null on
  // first render and the old redirect-on-null-token check always lost the race).
  const [restoring, setRestoring] = useState(() => !isPublicAuthPath() && !!initState('user'))
  const [serverUnreachable, setServerUnreachable] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState(() => {
    const saved = localStorage.getItem(`${KEY}_session_timeout`)
    return saved ? parseInt(saved) : 30
  })

  const applyAuthState = useCallback((payload = {}) => {
    const nextUser = payload.user || null
    const nextToken = payload.token || (payload.user ? COOKIE_SESSION : null)
    const nextModules = Array.isArray(payload.modules) ? payload.modules : []
    const nextOrgId = payload.orgId != null && payload.orgId !== '' ? Number(payload.orgId) : null
    const nextSiteId = payload.siteId != null && payload.siteId !== '' ? Number(payload.siteId) : null
    const nextOrgName = payload.orgName || null
    const nextSiteName = payload.siteName || null
    const nextAllOrgs = Array.isArray(payload.allOrgs) ? payload.allOrgs : []
    const nextSessionTimeout = Number(payload.sessionTimeout || 30) || 30

    setUser(nextUser)
    setToken(nextToken)
    setModules(nextModules)
    setOrgId(nextOrgId)
    setSiteId(nextSiteId)
    setOrgName(nextOrgName)
    setSiteName(nextSiteName)
    setAllOrgs(nextAllOrgs)
    setSessionTimeout(nextSessionTimeout)

    if (nextUser) localStorage.setItem(`${KEY}_user`, JSON.stringify(nextUser))
    else localStorage.removeItem(`${KEY}_user`)

    // SECURITY (F14): do NOT persist the raw session JWT in localStorage. It is
    // held in React state only. Session survives reload via the httpOnly cookie.
    // Proactively strip any legacy token left by an older build.
    localStorage.removeItem(`${KEY}_token`)

    localStorage.setItem(`${KEY}_modules`, JSON.stringify(nextModules))
    localStorage.setItem(`${KEY}_org_id`, nextOrgId ?? '')
    localStorage.setItem(`${KEY}_site_id`, nextSiteId ?? '')
    localStorage.setItem(`${KEY}_org_name`, nextOrgName ?? '')
    localStorage.setItem(`${KEY}_site_name`, nextSiteName ?? '')
    localStorage.setItem(`${KEY}_all_orgs`, JSON.stringify(nextAllOrgs))
    localStorage.setItem(`${KEY}_session_timeout`, String(nextSessionTimeout))
  }, [KEY])

  function login(userData, authToken, allowedModules = [], orgData = {}) {
    const { orgId: oid = null, siteId: sid = null, orgName: oname = null, siteName: sname = null, allOrgs: all = [], sessionTimeout: timeout = 30 } = orgData
    clearCaseDrafts()
    applyAuthState({
      user: userData,
      token: authToken || (userData ? COOKIE_SESSION : null),
      modules: allowedModules,
      orgId: oid,
      siteId: sid,
      orgName: oname,
      siteName: sname,
      allOrgs: all,
      sessionTimeout: timeout,
    })
    setSecurityAccess(createUnresolvedSecurityAccess())
    localStorage.removeItem(disableFallbackKey)
  }

  async function logout() {
    try {
      await httpFetch('/api/auth/logout', { method: 'POST' })
    } catch { /* silent */ }
    setUser(null); setToken(null); setModules([]); setOrgId(null); setSiteId(null); setOrgName(null); setSiteName(null); setAllOrgs([]); setSecurityAccess(createUnrestrictedSecurityAccess()); setSessionTimeout(30)
    ;[`${KEY}_user`,`${KEY}_token`,`${KEY}_modules`,`${KEY}_org_id`,`${KEY}_site_id`,`${KEY}_org_name`,`${KEY}_site_name`,`${KEY}_all_orgs`,`${KEY}_session_timeout`]
      .forEach(k => localStorage.removeItem(k))
    // Forget the signed-in email on sign-out: the sign-in page pre-fills it, so the
    // next person on a shared machine typed their password against the previous
    // account (T11 / M-33 — three failed attempts against someone else's account).
    localStorage.removeItem('mims_last_email')
    clearCaseDrafts()
    if (fallbackPrefixes.length > 0) localStorage.setItem(disableFallbackKey, '1')
  }

  // Switch active org — calls API, stores new token + org info, reloads app
  async function switchOrg(newOrgId) {
    const res  = await httpFetch('/api/auth/switch-org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ orgId: newOrgId })
    })
    if (!res.ok) return
    const data = await res.json()
    const meRes = await httpFetch('/api/auth/me', {
      headers: data.token ? { Authorization: `Bearer ${data.token}` } : undefined,
    })
    if (meRes.ok) {
      const meData = await meRes.json()
      applyAuthState(meData)
      setSecurityAccess(createUnresolvedSecurityAccess())
      return
    }
    applyAuthState({
      user,
      token: data.token || COOKIE_SESSION,
      modules,
      orgId: data.orgId,
      siteId: data.siteId,
      orgName: data.orgName,
      siteName: data.siteName,
      allOrgs: data.allOrgs || [],
      sessionTimeout: data.sessionTimeout ?? 30,
    })
    setSecurityAccess(createUnresolvedSecurityAccess())
  }

  // Session restore / validation. Runs on load whenever we have EITHER an
  // in-memory token OR a locally-persisted user (which, after a reload, is the
  // only signal we have that a session may exist — the JWT is no longer in
  // localStorage). Authentication is carried by the httpOnly `mims_token`
  // cookie (sent automatically on same-origin requests), so no Authorization
  // header is required. On success applyAuthState() rehydrates state including
  // a fresh in-memory token for the rest of the session.
  useEffect(() => {
    if (isPublicAuthPath()) { setRestoring(false); return }
    if (!token && !user) { setRestoring(false); return }
    let cancelled = false

    async function hydrateFromServer() {
      try {
        for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS; attempt++) {
          const res = await fetchUnlessRestarting('/api/auth/me', {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (cancelled) return
          if (res) {
            setServerUnreachable(false)
            if (!res.ok) return
            const data = await res.json()
            if (cancelled) return
            applyAuthState(data)
            return
          }
          // Keep the locally-restored state and wait for the server to come back.
          setServerUnreachable(true)
          await wait(RECONNECT_DELAY_MS)
          if (cancelled) return
        }
      } catch {
        // Keep the locally-restored state when the response cannot be read.
      } finally {
        if (!cancelled) setRestoring(false)
      }
    }

    hydrateFromServer()
    return () => { cancelled = true }
    // Depend on stable identities (token string, user id) — NOT the user object.
    // applyAuthState builds a fresh user object from every /me response, so
    // depending on `user` itself re-triggered this effect after each hydrate in
    // an infinite /api/auth/me + security-groups loop that burned the rate
    // limits and locked real users out ("Too many authentication requests").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyAuthState, token, user?.id])

  const refreshOrgAccess = useCallback(async () => {
    if (!token) return
    if (hasGlobalAdminScope({ ...user, modules })) return

    const authHeaders = { Authorization: `Bearer ${token}` }
    const res = await httpFetch('/api/auth/me', { headers: authHeaders })
    if (!res.ok) return
    const data = await res.json()
    const nextOrgs = Array.isArray(data.allOrgs) ? data.allOrgs : []
    setAllOrgs(nextOrgs)
    localStorage.setItem(`${KEY}_all_orgs`, JSON.stringify(nextOrgs))

    if (data.currentOrgActive) return
    if (!nextOrgs.length) return

    const fallbackOrgId = nextOrgs[0].orgId
    if (!fallbackOrgId) return

    const switchRes = await httpFetch('/api/auth/switch-org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ orgId: fallbackOrgId })
    })
    if (!switchRes.ok) return
    const switched = await switchRes.json()
    // Token kept in memory only (F14); the httpOnly cookie carries auth on reload.
    setToken(switched.token || COOKIE_SESSION)
    localStorage.setItem(`${KEY}_org_id`,          switched.orgId   ?? '')
    localStorage.setItem(`${KEY}_site_id`,         switched.siteId  ?? '')
    localStorage.setItem(`${KEY}_org_name`,        switched.orgName ?? '')
    localStorage.setItem(`${KEY}_site_name`,       switched.siteName ?? '')
    localStorage.setItem(`${KEY}_all_orgs`,        JSON.stringify(switched.allOrgs || []))
    localStorage.setItem(`${KEY}_session_timeout`, String(switched.sessionTimeout ?? 30))
    window.location.reload()
  }, [KEY, modules, token, user])

  const refreshSecurityAccess = useCallback(async () => {
    if (isPublicAuthPath()) {
      setSecurityAccess(createUnrestrictedSecurityAccess())
      return
    }
    if (!token || !user) {
      setSecurityAccess(createUnrestrictedSecurityAccess())
      return
    }
    if (hasGlobalAdminScope({ ...user, modules })) {
      setSecurityAccess(createUnrestrictedSecurityAccess())
      return
    }
    try {
      let res = null
      for (let attempt = 1; attempt <= RECONNECT_ATTEMPTS && !res; attempt++) {
        res = await fetchUnlessRestarting('/api/admin/security-groups/effective', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res) await wait(RECONNECT_DELAY_MS)
      }
      if (!res || !res.ok) throw new Error('security access unavailable')
      const data = await res.json()
      setSecurityAccess({ resolved: true, ...(data || createUnresolvedSecurityAccess()) })
    } catch {
      setSecurityAccess(createUnresolvedSecurityAccess())
    }
  }, [modules, token, user])

  useEffect(() => {
    refreshSecurityAccess()
  }, [refreshSecurityAccess])

  useEffect(() => {
    window.addEventListener('mims-security-groups-updated', refreshSecurityAccess)
    return () => window.removeEventListener('mims-security-groups-updated', refreshSecurityAccess)
  }, [refreshSecurityAccess])

  function getInitials() {
    if (!user?.name) return '?'
    return user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  }

  function formatRole(role) {
    return formatAdminRoleLabel(role)
  }

  function hasModuleAccess(module) {
    if (!user) return false
    if (hasGlobalAdminScope({ ...user, modules })) return true
    return modules.includes(module)
  }

  function hasSecurityOption(scope, section, option) {
    if (!user) return false
    if (hasGlobalAdminScope({ ...user, modules })) return true
    if (securityAccess?.resolved === false) return false
    if (securityAccess?.unrestricted) return true
    const matrix = securityAccess?.[scope]
    if (!matrix) return true
    return Boolean(matrix?.[section]?.[option])
  }

  function hasSystemOption(section, option) {
    return hasSecurityOption('system_options', section, option)
  }

  function hasCaseOption(section, option) {
    return hasSecurityOption('case_options', section, option)
  }

  // New capability model: hasCapability('case.close') etc. Superadmin / unrestricted
  // / null privileges all pass; otherwise check the effective capability keys.
  function hasCapability(key) {
    if (!user) return false
    if (hasGlobalAdminScope({ ...user, modules })) return true
    // The resolved list already merges group grants with role defaults, as the
    // server check does. "unrestricted" only means no option matrix applies (the
    // user is in no security group); it used to make every capability true for
    // such users, whatever their role (M-93).
    const privs = securityAccess?.privileges
    if (privs == null) return true // null = unrestricted; not yet resolved → don't hide
    return privs.includes(key)
  }

  return (
    <AuthContext.Provider value={{
      user, token, modules, orgId, siteId, orgName, siteName, allOrgs, sessionTimeout, securityAccess, restoring, serverUnreachable,
      login, logout, switchOrg, refreshOrgAccess, refreshSecurityAccess, getInitials, formatRole, hasModuleAccess, hasSystemOption, hasCaseOption, hasCapability
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext) }
