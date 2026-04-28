'use strict'
/**
 * AuthContext.jsx — Global Authentication State (Sprint 7: Multi-Org)
 * Stores: user, token, modules, orgId, siteId, orgName, allOrgs
 * Provides: login(), logout(), switchOrg(), refreshOrgAccess(), getInitials(), formatRole(), hasModuleAccess()
 */

import { createContext, useContext, useState, useCallback } from 'react'
import { httpFetch } from '../api/httpFetch.js'

const AuthContext = createContext(null)

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
  const [sessionTimeout, setSessionTimeout] = useState(() => {
    const saved = localStorage.getItem(`${KEY}_session_timeout`)
    return saved ? parseInt(saved) : 30
  })

  function login(userData, authToken, allowedModules = [], orgData = {}) {
    const { orgId: oid = null, siteId: sid = null, orgName: oname = null, siteName: sname = null, allOrgs: all = [], sessionTimeout: timeout = 30 } = orgData
    setUser(userData)
    setToken(authToken)
    setModules(allowedModules)
    setOrgId(oid)
    setSiteId(sid)
    setOrgName(oname)
    setSiteName(sname)
    setAllOrgs(all)
    setSessionTimeout(timeout)
    localStorage.setItem(`${KEY}_user`,            JSON.stringify(userData))
    localStorage.setItem(`${KEY}_token`,           authToken)
    localStorage.setItem(`${KEY}_modules`,         JSON.stringify(allowedModules))
    localStorage.setItem(`${KEY}_org_id`,          oid   ?? '')
    localStorage.setItem(`${KEY}_site_id`,         sid   ?? '')
    localStorage.setItem(`${KEY}_org_name`,        oname ?? '')
    localStorage.setItem(`${KEY}_site_name`,       sname ?? '')
    localStorage.setItem(`${KEY}_all_orgs`,        JSON.stringify(all))
    localStorage.setItem(`${KEY}_session_timeout`, String(timeout))
    localStorage.removeItem(disableFallbackKey)
  }

  async function logout() {
    try {
      const savedToken = localStorage.getItem(`${KEY}_token`)
      if (savedToken) {
        await httpFetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${savedToken}` } })
      }
    } catch { /* silent */ }
    setUser(null); setToken(null); setModules([]); setOrgId(null); setSiteId(null); setOrgName(null); setSiteName(null); setAllOrgs([]); setSessionTimeout(30)
    ;[`${KEY}_user`,`${KEY}_token`,`${KEY}_modules`,`${KEY}_org_id`,`${KEY}_site_id`,`${KEY}_org_name`,`${KEY}_site_name`,`${KEY}_all_orgs`,`${KEY}_session_timeout`]
      .forEach(k => localStorage.removeItem(k))
    if (fallbackPrefixes.length > 0) localStorage.setItem(disableFallbackKey, '1')
  }

  // Switch active org — calls API, stores new token + org info, reloads app
  async function switchOrg(newOrgId) {
    const savedToken = localStorage.getItem(`${KEY}_token`)
    const res  = await httpFetch('/api/auth/switch-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedToken}` },
      body: JSON.stringify({ orgId: newOrgId })
    })
    if (!res.ok) return
    const data = await res.json()
    localStorage.setItem(`${KEY}_token`,           data.token)
    localStorage.setItem(`${KEY}_org_id`,          data.orgId   ?? '')
    localStorage.setItem(`${KEY}_site_id`,         data.siteId  ?? '')
    localStorage.setItem(`${KEY}_org_name`,        data.orgName ?? '')
    localStorage.setItem(`${KEY}_site_name`,       data.siteName ?? '')
    localStorage.setItem(`${KEY}_all_orgs`,        JSON.stringify(data.allOrgs || []))
    localStorage.setItem(`${KEY}_session_timeout`, String(data.sessionTimeout ?? 30))
    window.location.reload()
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refreshOrgAccess = useCallback(async () => {
    const savedToken = localStorage.getItem(`${KEY}_token`)
    if (!savedToken || user?.role === 'superadmin') return

    const res = await httpFetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
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
        Authorization: `Bearer ${savedToken}`,
      },
      body: JSON.stringify({ orgId: fallbackOrgId })
    })
    if (!switchRes.ok) return
    const switched = await switchRes.json()
    localStorage.setItem(`${KEY}_token`,           switched.token)
    localStorage.setItem(`${KEY}_org_id`,          switched.orgId   ?? '')
    localStorage.setItem(`${KEY}_site_id`,         switched.siteId  ?? '')
    localStorage.setItem(`${KEY}_org_name`,        switched.orgName ?? '')
    localStorage.setItem(`${KEY}_site_name`,       switched.siteName ?? '')
    localStorage.setItem(`${KEY}_all_orgs`,        JSON.stringify(switched.allOrgs || []))
    localStorage.setItem(`${KEY}_session_timeout`, String(switched.sessionTimeout ?? 30))
    window.location.reload()
  }, [KEY, user?.role]) // stable deps — KEY is constant, role changes rarely (login/logout)

  function getInitials() {
    if (!user?.name) return '?'
    return user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  }

  function formatRole(role) {
    const labels = {
      superadmin: 'Super Administrator', admin: 'Administrator',
      agent: 'MI Agent', reviewer: 'Reviewer', content_manager: 'Content Manager'
    }
    return labels[role] || role
  }

  function hasModuleAccess(module) {
    if (!user) return false
    if (user.role === 'superadmin') return true
    return modules.includes(module)
  }

  return (
    <AuthContext.Provider value={{
      user, token, modules, orgId, siteId, orgName, siteName, allOrgs, sessionTimeout,
      login, logout, switchOrg, refreshOrgAccess, getInitials, formatRole, hasModuleAccess
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
