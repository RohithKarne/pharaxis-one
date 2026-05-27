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

function createUnrestrictedSecurityAccess() {
  return { resolved: true, unrestricted: true, system_options: null, case_options: null }
}

function createUnresolvedSecurityAccess() {
  return { resolved: false, unrestricted: false, system_options: {}, case_options: {} }
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
      token:   localStorage.getItem(`${prefix}_token`) || null,
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
  const [sessionTimeout, setSessionTimeout] = useState(() => {
    const saved = localStorage.getItem(`${KEY}_session_timeout`)
    return saved ? parseInt(saved) : 30
  })

  const applyAuthState = useCallback((payload = {}) => {
    const nextUser = payload.user || null
    const nextToken = payload.token || null
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

    if (nextToken) localStorage.setItem(`${KEY}_token`, nextToken)
    else localStorage.removeItem(`${KEY}_token`)

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
    applyAuthState({
      user: userData,
      token: authToken,
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
    if (fallbackPrefixes.length > 0) localStorage.setItem(disableFallbackKey, '1')
  }

  // Switch active org — calls API, stores new token + org info, reloads app
  async function switchOrg(newOrgId) {
    const res  = await httpFetch('/api/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      token: data.token || null,
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

  useEffect(() => {
    if (!token || isPublicAuthPath()) return
    let cancelled = false

    async function hydrateFromServer() {
      try {
        const res = await httpFetch('/api/auth/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        applyAuthState(data)
      } catch {
        // Keep the locally-restored state when the network is unavailable.
      }
    }

    hydrateFromServer()
    return () => { cancelled = true }
  }, [applyAuthState, token])

  const refreshOrgAccess = useCallback(async () => {
    if (hasGlobalAdminScope({ ...user, modules })) return

    const res = await httpFetch('/api/auth/me')
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
      },
      body: JSON.stringify({ orgId: fallbackOrgId })
    })
    if (!switchRes.ok) return
    const switched = await switchRes.json()
    setToken(switched.token || null)
    localStorage.setItem(`${KEY}_token`,           switched.token || '')
    localStorage.setItem(`${KEY}_org_id`,          switched.orgId   ?? '')
    localStorage.setItem(`${KEY}_site_id`,         switched.siteId  ?? '')
    localStorage.setItem(`${KEY}_org_name`,        switched.orgName ?? '')
    localStorage.setItem(`${KEY}_site_name`,       switched.siteName ?? '')
    localStorage.setItem(`${KEY}_all_orgs`,        JSON.stringify(switched.allOrgs || []))
    localStorage.setItem(`${KEY}_session_timeout`, String(switched.sessionTimeout ?? 30))
    window.location.reload()
  }, [KEY, modules, user])

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
      const res = await httpFetch('/api/admin/security-groups/effective', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('security access unavailable')
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
    if (securityAccess?.unrestricted) return true
    const privs = securityAccess?.privileges
    if (privs == null) return true // null = unrestricted; not yet resolved → don't hide
    return privs.includes(key)
  }

  return (
    <AuthContext.Provider value={{
      user, token, modules, orgId, siteId, orgName, siteName, allOrgs, sessionTimeout, securityAccess,
      login, logout, switchOrg, refreshOrgAccess, refreshSecurityAccess, getInitials, formatRole, hasModuleAccess, hasSystemOption, hasCaseOption, hasCapability
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() { return useContext(AuthContext) }
