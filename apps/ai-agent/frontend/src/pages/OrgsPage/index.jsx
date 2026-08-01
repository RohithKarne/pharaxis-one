import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_AI_AGENT_URL || ''
const TOKENS = {
  primary: '#6B3FA0',
  navy: '#0f172a',
  slate: '#64748b',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6'
}

const PROVIDER_STYLES = {
  openai: { label: 'OpenAI', color: '#10b981' },
  claude: { label: 'Claude', color: '#6B3FA0' },
  gemini: { label: 'Gemini', color: '#3b82f6' }
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(toNumber(value))
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function providerDisplay(provider) {
  const key = String(provider || '').toLowerCase()
  return PROVIDER_STYLES[key] || { label: provider || 'Unknown', color: TOKENS.slate }
}

export default function OrgsPage() {
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [togglingOrgIds, setTogglingOrgIds] = useState({})

  useEffect(() => {
    let cancelled = false

    async function loadOrgs() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE}/api/v1/agent/superadmin/orgs`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load organisations')
        }

        if (!cancelled) {
          setOrgs(Array.isArray(payload?.orgs) ? payload.orgs : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load organisations')
          setOrgs([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOrgs()
    return () => { cancelled = true }
  }, [])

  const filteredOrgs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return orgs.filter(org => {
      const matchesSearch = query.length === 0 || String(org.org_id).toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' && Boolean(org.is_active))
        || (statusFilter === 'inactive' && !org.is_active)
      return matchesSearch && matchesStatus
    })
  }, [orgs, searchTerm, statusFilter])

  const stats = useMemo(() => {
    const totalOrgs = orgs.length
    const activeOrgs = orgs.filter(org => org.is_active).length
    const totalQueries = orgs.reduce((sum, org) => sum + toNumber(org.total_queries), 0)
    const totalTokens = orgs.reduce((sum, org) => sum + toNumber(org.total_tokens), 0)
    return { totalOrgs, activeOrgs, totalQueries, totalTokens }
  }, [orgs])

  async function handleToggle(orgId, isActive) {
    setTogglingOrgIds(prev => ({ ...prev, [orgId]: true }))
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/v1/agent/superadmin/orgs/${orgId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive })
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update status')
      }

      setOrgs(prev => prev.map(org => (
        org.org_id === orgId
          ? { ...org, is_active: Boolean(payload.is_active) }
          : org
      )))
    } catch (err) {
      setError(err.message || 'Failed to update status')
    } finally {
      setTogglingOrgIds(prev => ({ ...prev, [orgId]: false }))
    }
  }

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
          <div style={{ color: TOKENS.slate, fontSize: '12px' }}>Total Orgs</div>
          <div style={{ color: TOKENS.navy, fontWeight: 700, fontSize: '22px', marginTop: '4px' }}>{formatNumber(stats.totalOrgs)}</div>
        </article>
        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
          <div style={{ color: TOKENS.slate, fontSize: '12px' }}>Active Orgs</div>
          <div style={{ color: TOKENS.success, fontWeight: 700, fontSize: '22px', marginTop: '4px' }}>{formatNumber(stats.activeOrgs)}</div>
        </article>
        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
          <div style={{ color: TOKENS.slate, fontSize: '12px' }}>Total Queries</div>
          <div style={{ color: TOKENS.info, fontWeight: 700, fontSize: '22px', marginTop: '4px' }}>{formatNumber(stats.totalQueries)}</div>
        </article>
        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
          <div style={{ color: TOKENS.slate, fontSize: '12px' }}>Total Tokens</div>
          <div style={{ color: TOKENS.primary, fontWeight: 700, fontSize: '22px', marginTop: '4px' }}>{formatNumber(stats.totalTokens)}</div>
        </article>
      </section>

      <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Search by Org ID"
            style={{
              flex: '1 1 220px',
              minWidth: '220px',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
          <select
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
            style={{
              width: '170px',
              padding: '10px 12px',
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              background: '#fff'
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </section>

      {loading && <div style={{ color: TOKENS.slate }}>Loading organisations...</div>}
      {error && <div style={{ color: TOKENS.danger, fontWeight: 500 }}>{error}</div>}

      <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '14px' }}>
        {filteredOrgs.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', color: TOKENS.slate, padding: '26px 0' }}>
            No organisations match your filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: TOKENS.slate, fontSize: '12px' }}>
                  <th style={{ paddingBottom: '10px' }}>Org ID</th>
                  <th style={{ paddingBottom: '10px' }}>Provider</th>
                  <th style={{ paddingBottom: '10px' }}>Status</th>
                  <th style={{ paddingBottom: '10px' }}>Total Queries</th>
                  <th style={{ paddingBottom: '10px' }}>Total Tokens</th>
                  <th style={{ paddingBottom: '10px' }}>Last Query</th>
                  <th style={{ paddingBottom: '10px' }} />
                </tr>
              </thead>
              <tbody>
                {filteredOrgs.map(org => {
                  const provider = providerDisplay(org.provider)
                  const isToggling = Boolean(togglingOrgIds[org.org_id])
                  return (
                    <tr key={org.org_id} style={{ borderTop: `1px solid ${TOKENS.border}`, fontSize: '13px' }}>
                      <td style={{ padding: '11px 0', color: TOKENS.navy, fontWeight: 600 }}>{org.org_id}</td>
                      <td style={{ padding: '11px 0' }}>
                        <span style={{ background: `${provider.color}22`, color: provider.color, padding: '4px 9px', borderRadius: '999px', fontWeight: 600 }}>
                          {provider.label}
                        </span>
                      </td>
                      <td style={{ padding: '11px 0' }}>
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggle(org.org_id, Boolean(org.is_active))}
                          style={{
                            width: '48px',
                            height: '26px',
                            borderRadius: '999px',
                            border: 'none',
                            cursor: isToggling ? 'not-allowed' : 'pointer',
                            background: org.is_active ? TOKENS.success : '#cbd5e1',
                            position: 'relative',
                            transition: 'background 0.2s ease'
                          }}
                          title={org.is_active ? 'Active' : 'Inactive'}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '3px',
                              left: org.is_active ? '25px' : '3px',
                              width: '20px',
                              height: '20px',
                              background: '#fff',
                              borderRadius: '999px',
                              transition: 'left 0.2s ease'
                            }}
                          />
                        </button>
                      </td>
                      <td style={{ padding: '11px 0', color: TOKENS.navy }}>{formatNumber(org.total_queries)}</td>
                      <td style={{ padding: '11px 0', color: TOKENS.navy }}>{formatNumber(org.total_tokens)}</td>
                      <td style={{ padding: '11px 0', color: TOKENS.slate }}>{formatDate(org.last_query_at)}</td>
                      <td style={{ padding: '11px 0', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/usage?org_id=${org.org_id}`)}
                          style={{
                            border: `1px solid ${TOKENS.border}`,
                            background: '#fff',
                            color: TOKENS.navy,
                            borderRadius: '8px',
                            padding: '7px 10px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          View Usage
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
