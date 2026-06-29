/**
 * FeatureFlags.jsx — MIMS Admin > System > Setup > Feature Flags
 *
 * Wave 0 admin surface for per-tenant feature flag rollout.
 *
 * Layout:
 *   ┌───────────────────────────┬──────────────────────────────────────────┐
 *   │ Flag catalog (grouped     │  Selected flag detail                    │
 *   │  by wave / theme)         │   • description + strict-mode badge      │
 *   │  • 9 themes pre-seeded    │   • per-tenant toggle table              │
 *   │  • shows  N tenants on    │   • bulk enable / disable                │
 *   └───────────────────────────┴──────────────────────────────────────────┘
 *
 * Backed by /api/admin/feature-flags routes (see backend/routes/admin/featureFlags.js).
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const API = '/api/admin/feature-flags'

export default function FeatureFlags() {
  const { token } = useAuth()
  const H = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [flags,        setFlags]        = useState([])
  const [loadingFlags, setLoadingFlags] = useState(true)
  const [selected,     setSelected]     = useState(null)
  const [tenants,      setTenants]      = useState([])
  const [loadingTen,   setLoadingTen]   = useState(false)
  const [tenantSearch, setTenantSearch] = useState('')
  const [flash,        setFlash]        = useState(null)

  const showFlash = useCallback((msg, type = 'success') => {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3000)
  }, [])

  // ── Load full flag catalog
  const loadFlags = useCallback(async () => {
    setLoadingFlags(true)
    try {
      const d = await httpFetch(API, { headers: H }).then(r => r.json())
      setFlags(d.flags || [])
    } catch { setFlags([]) }
    finally  { setLoadingFlags(false) }
  }, [H])

  useEffect(() => { loadFlags() }, [loadFlags])

  // ── Load tenant rollout when a flag is selected
  const loadTenants = useCallback(async (flagId) => {
    if (!flagId) return
    setLoadingTen(true)
    try {
      const d = await httpFetch(`${API}/${flagId}/tenants`, { headers: H }).then(r => r.json())
      setTenants(d.tenants || [])
    } catch { setTenants([]) }
    finally  { setLoadingTen(false) }
  }, [H])

  useEffect(() => {
    if (selected) loadTenants(selected.id)
    else          setTenants([])
  }, [selected, loadTenants])

  // ── Toggle a single tenant
  async function toggleTenant(orgId, enabled) {
    // WP7: capture prior state so we can roll back the optimistic toggle if the save fails —
    // previously a failed save showed an error but left the toggle showing the new value
    // while the backend kept the old one (the rollout control visually lied).
    const prevTenants = tenants
    setTenants(t => t.map(x => x.org_id === orgId ? { ...x, enabled: enabled ? 1 : 0 } : x))
    try {
      const r = await httpFetch(`${API}/${selected.id}/tenant/${orgId}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ enabled }),
      })
      if (!r.ok) { setTenants(prevTenants); showFlash('Failed to save.', 'error'); return }
      showFlash(`Flag ${enabled ? 'enabled' : 'disabled'} for tenant.`)
      // refresh enabled count on catalog
      setFlags(fl => fl.map(f => f.id === selected.id
        ? { ...f, enabled_tenant_count: (f.enabled_tenant_count ?? 0) + (enabled ? 1 : -1) }
        : f))
    } catch { setTenants(prevTenants); showFlash('Network error.', 'error') }
  }

  // ── Bulk enable / disable
  async function bulk(enabled) {
    const orgIds = filteredTenants.map(t => t.org_id)
    if (!orgIds.length) { showFlash('No tenants to update.', 'error'); return }
    const verb = enabled ? 'enable' : 'disable'
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${selected.flag_key} for ${orgIds.length} tenant(s)?`)) return
    try {
      const r = await httpFetch(`${API}/${selected.id}/bulk`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ org_ids: orgIds, enabled }),
      })
      if (!r.ok) { showFlash('Bulk update failed.', 'error'); return }
      const d = await r.json()
      showFlash(`Bulk ${verb}d for ${d.count} tenant(s).`)
      loadTenants(selected.id)
      loadFlags()
    } catch { showFlash('Network error.', 'error') }
  }

  // ── Group flags by wave for display
  const grouped = useMemo(() => {
    const map = new Map()
    for (const f of flags) {
      const w = f.wave || '—'
      if (!map.has(w)) map.set(w, [])
      map.get(w).push(f)
    }
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  }, [flags])

  const filteredTenants = useMemo(() => {
    if (!tenantSearch) return tenants
    const q = tenantSearch.toLowerCase()
    return tenants.filter(t => (t.org_name || '').toLowerCase().includes(q))
  }, [tenants, tenantSearch])

  const enabledNow = filteredTenants.filter(t => t.enabled).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Feature Flags</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Wave 0 foundation. Every theme in the case-form roadmap ships behind a flag — enable per tenant for gradual rollout.
            </div>
          </div>
          {flash && (
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: flash.type === 'error' ? 'var(--error,#c00)' : '#1a7a3f',
            }}>{flash.msg}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: flag catalog */}
        <div style={{
          width: 360, borderRight: '1px solid var(--border)',
          overflowY: 'auto', background: 'var(--surface-alt, #fafafa)',
        }}>
          {loadingFlags && <div style={{ padding: 16, color: 'var(--text-muted)' }}>Loading…</div>}
          {!loadingFlags && grouped.map(([wave, items]) => (
            <div key={wave}>
              <div style={{
                padding: '10px 16px', fontSize: 11, fontWeight: 700,
                letterSpacing: 0.4, textTransform: 'uppercase',
                color: 'var(--text-muted)', background: 'var(--surface, #fff)',
                borderBottom: '1px solid var(--border)',
              }}>Wave {wave}</div>
              {items.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelected(f)}
                  style={{
                    padding: '11px 16px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: selected?.id === f.id ? 'var(--accent-soft, #eaf2ff)' : 'transparent',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                    {f.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'monospace' }}>
                    {f.flag_key}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 11 }}>
                    <span style={{
                      padding: '2px 7px', borderRadius: 10,
                      background: f.default_state === 'on' ? '#d6f5dd' : '#f0f0f0',
                      color:      f.default_state === 'on' ? '#1a7a3f' : '#555',
                    }}>default {f.default_state}</span>
                    {f.is_strict_mode ? (
                      <span style={{ padding: '2px 7px', borderRadius: 10, background: '#fff4d6', color: '#8a6a00' }}>
                        strict
                      </span>
                    ) : null}
                    <span style={{ padding: '2px 7px', borderRadius: 10, background: '#eaf2ff', color: '#1a4f9c' }}>
                      {f.enabled_tenant_count || 0} tenant{(f.enabled_tenant_count || 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {!selected && (
            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 48, textAlign: 'center' }}>
              Select a flag on the left to manage tenant rollout.
            </div>
          )}

          {selected && (
            <>
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{selected.label}</h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 3 }}>
                  {selected.flag_key}
                </div>
                {selected.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.5 }}>
                    {selected.description}
                  </div>
                )}
                {selected.is_strict_mode ? (
                  <div style={{
                    marginTop: 10, padding: '8px 12px', fontSize: 12,
                    background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6,
                    color: '#8a6a00',
                  }}>
                    <strong>Strict mode:</strong> theme keeps both legacy and new code paths until QA-approved.
                    Disabling the flag falls back to legacy behavior cleanly.
                  </div>
                ) : null}
              </div>

              {/* Bulk + search */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <input
                  type="text"
                  placeholder="Search tenant…"
                  value={tenantSearch}
                  onChange={e => setTenantSearch(e.target.value)}
                  style={{
                    flex: 1, padding: '7px 11px', borderRadius: 6,
                    border: '1px solid var(--border)', fontSize: 13,
                  }}
                />
                <button
                  onClick={() => bulk(true)}
                  style={btnStyle('#1a7a3f')}
                  disabled={!filteredTenants.length}
                >Enable all shown</button>
                <button
                  onClick={() => bulk(false)}
                  style={btnStyle('#c44')}
                  disabled={!filteredTenants.length}
                >Disable all shown</button>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {enabledNow} of {filteredTenants.length} tenant(s) enabled
              </div>

              {/* Tenant table */}
              {loadingTen && <div style={{ color: 'var(--text-muted)' }}>Loading tenants…</div>}
              {!loadingTen && filteredTenants.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No tenants match.</div>
              )}
              {!loadingTen && filteredTenants.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-alt, #fafafa)', textAlign: 'left' }}>
                      <th style={th}>Tenant</th>
                      <th style={th}>Status</th>
                      <th style={th}>Enabled at</th>
                      <th style={th}>By</th>
                      <th style={{ ...th, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map(t => (
                      <tr key={t.org_id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={td}>{t.org_name}</td>
                        <td style={td}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: t.enabled ? '#d6f5dd' : '#f0f0f0',
                            color:      t.enabled ? '#1a7a3f' : '#777',
                          }}>{t.enabled ? 'ENABLED' : 'OFF'}</span>
                        </td>
                        <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>
                          {t.enabled_at ? new Date(t.enabled_at).toLocaleString() : '—'}
                        </td>
                        <td style={{ ...td, color: 'var(--text-muted)', fontSize: 12 }}>
                          {t.enabled_by_name || '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={!!t.enabled}
                              onChange={e => toggleTenant(t.org_id, e.target.checked)}
                            />
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const th = { padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }
const td = { padding: '9px 10px' }

function btnStyle(color) {
  return {
    padding: '7px 12px', borderRadius: 6, border: `1px solid ${color}`,
    background: '#fff', color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
  }
}
