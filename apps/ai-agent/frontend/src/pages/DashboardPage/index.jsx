import React, { useEffect, useMemo, useState } from 'react'

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

const APP_COLORS = {
  cp_portal: '#6B3FA0',
  mims: '#3b82f6',
  vault: '#10b981',
  qms: '#f59e0b',
  safety: '#ef4444'
}

const STATUS_COLORS = {
  success: TOKENS.success,
  failed: TOKENS.danger,
  timeout: TOKENS.warning
}

const EMPTY_DASHBOARD = {
  stats: {
    total_orgs_configured: 0,
    total_orgs_active: 0,
    total_queries_today: 0,
    total_queries_all_time: 0,
    total_tokens_today: 0,
    total_tokens_all_time: 0
  },
  by_app: [],
  by_provider: [],
  recent_activity: []
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(toNumber(value))
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleString()
}

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth || 1280)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth || 1280)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

export default function DashboardPage() {
  const [data, setData] = useState(EMPTY_DASHBOARD)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const width = useWindowWidth()

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE}/api/v1/agent/superadmin/dashboard`)
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load dashboard')
        }

        if (!cancelled) {
          setData({
            stats: {
              total_orgs_configured: toNumber(payload?.stats?.total_orgs_configured),
              total_orgs_active: toNumber(payload?.stats?.total_orgs_active),
              total_queries_today: toNumber(payload?.stats?.total_queries_today),
              total_queries_all_time: toNumber(payload?.stats?.total_queries_all_time),
              total_tokens_today: toNumber(payload?.stats?.total_tokens_today),
              total_tokens_all_time: toNumber(payload?.stats?.total_tokens_all_time)
            },
            by_app: Array.isArray(payload?.by_app) ? payload.by_app : [],
            by_provider: Array.isArray(payload?.by_provider) ? payload.by_provider : [],
            recent_activity: Array.isArray(payload?.recent_activity) ? payload.recent_activity : []
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load dashboard')
          setData(EMPTY_DASHBOARD)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => { cancelled = true }
  }, [])

  const statsCards = useMemo(() => ([
    { label: 'Orgs Configured', value: data.stats.total_orgs_configured, color: TOKENS.primary, icon: '🏢' },
    { label: 'Active Orgs', value: data.stats.total_orgs_active, color: TOKENS.success, icon: '✅' },
    { label: 'Queries Today', value: data.stats.total_queries_today, color: TOKENS.warning, icon: '📅' },
    { label: 'All-Time Queries', value: data.stats.total_queries_all_time, color: TOKENS.info, icon: '📈' },
    { label: 'Tokens Today', value: data.stats.total_tokens_today, color: '#ec4899', icon: '⚙️' },
    { label: 'All-Time Tokens', value: data.stats.total_tokens_all_time, color: '#8b5cf6', icon: '🧠' }
  ]), [data.stats])

  const maxProviderQueries = useMemo(() => {
    const maxValue = Math.max(0, ...data.by_provider.map(item => toNumber(item.total_queries)))
    return maxValue || 1
  }, [data.by_provider])

  const statsGridColumns = width < 760 ? '1fr' : (width < 1180 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))')
  const splitColumns = width < 1180 ? '1fr' : '3fr 2fr'

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {loading && <div style={{ color: TOKENS.slate }}>Loading dashboard...</div>}
      {error && <div style={{ color: TOKENS.danger, fontWeight: 500 }}>{error}</div>}

      <section style={{ display: 'grid', gap: '16px', gridTemplateColumns: statsGridColumns }}>
        {statsCards.map(card => (
          <article
            key={card.label}
            style={{
              background: TOKENS.card,
              border: `1px solid ${TOKENS.border}`,
              borderRadius: '12px',
              padding: '16px'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: `${card.color}26`,
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                marginBottom: '12px'
              }}
            >
              {card.icon}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: TOKENS.navy, lineHeight: 1.2 }}>
              {formatNumber(card.value)}
            </div>
            <div style={{ fontSize: '13px', color: TOKENS.slate, marginTop: '6px' }}>{card.label}</div>
          </article>
        ))}
      </section>

      <section style={{ display: 'grid', gap: '16px', gridTemplateColumns: splitColumns, alignItems: 'start' }}>
        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ margin: 0, marginBottom: '14px', color: TOKENS.navy, fontSize: '16px' }}>Usage by App</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '420px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: TOKENS.slate, fontSize: '12px' }}>
                  <th style={{ paddingBottom: '10px' }}>App</th>
                  <th style={{ paddingBottom: '10px' }}>Queries</th>
                  <th style={{ paddingBottom: '10px' }}>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.by_app.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '12px 0', color: TOKENS.slate }}>No usage data available.</td>
                  </tr>
                )}
                {data.by_app.map(row => {
                  const appColor = APP_COLORS[row.app_source] || TOKENS.slate
                  return (
                    <tr key={row.app_source} style={{ borderTop: `1px solid ${TOKENS.border}`, fontSize: '14px' }}>
                      <td style={{ padding: '10px 0' }}>
                        <span style={{ background: `${appColor}22`, color: appColor, padding: '4px 10px', borderRadius: '999px', fontWeight: 600 }}>
                          {row.app_source}
                        </span>
                      </td>
                      <td style={{ padding: '10px 0', color: TOKENS.navy }}>{formatNumber(row.total_queries)}</td>
                      <td style={{ padding: '10px 0', color: TOKENS.navy }}>{formatNumber(row.total_tokens)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '16px' }}>
          <h3 style={{ margin: 0, marginBottom: '14px', color: TOKENS.navy, fontSize: '16px' }}>Usage by Provider</h3>
          <div style={{ display: 'grid', gap: '14px' }}>
            {data.by_provider.length === 0 && (
              <div style={{ color: TOKENS.slate, fontSize: '14px' }}>No provider data available.</div>
            )}
            {data.by_provider.map(provider => {
              const widthPct = `${Math.round((toNumber(provider.total_queries) / maxProviderQueries) * 100)}%`
              return (
                <div key={provider.provider} style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: TOKENS.navy, fontWeight: 600 }}>{provider.provider}</span>
                    <span style={{ color: TOKENS.slate }}>{formatNumber(provider.total_queries)} queries</span>
                  </div>
                  <div style={{ height: '10px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
                    <div style={{ width: widthPct, height: '100%', background: TOKENS.primary }} />
                  </div>
                  <div style={{ fontSize: '12px', color: TOKENS.slate }}>Tokens: {formatNumber(provider.total_tokens)}</div>
                </div>
              )
            })}
          </div>
        </article>
      </section>

      <section style={{ background: TOKENS.card, border: `1px solid ${TOKENS.border}`, borderRadius: '12px', padding: '16px' }}>
        <h3 style={{ margin: 0, marginBottom: '14px', color: TOKENS.navy, fontSize: '16px' }}>Recent Activity</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '960px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: TOKENS.slate, fontSize: '12px' }}>
                <th style={{ paddingBottom: '10px' }}>Time</th>
                <th style={{ paddingBottom: '10px' }}>Org ID</th>
                <th style={{ paddingBottom: '10px' }}>App</th>
                <th style={{ paddingBottom: '10px' }}>Query Type</th>
                <th style={{ paddingBottom: '10px' }}>Provider</th>
                <th style={{ paddingBottom: '10px' }}>Tokens In</th>
                <th style={{ paddingBottom: '10px' }}>Tokens Out</th>
                <th style={{ paddingBottom: '10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_activity.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '12px 0', color: TOKENS.slate }}>No recent activity.</td>
                </tr>
              )}
              {data.recent_activity.map(row => {
                const statusColor = STATUS_COLORS[row.status] || TOKENS.slate
                return (
                  <tr key={row.id} style={{ borderTop: `1px solid ${TOKENS.border}`, fontSize: '13px' }}>
                    <td style={{ padding: '10px 0', color: TOKENS.slate }}>{formatRelativeTime(row.created_at)}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{row.org_id}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{row.app_source}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{row.query_type}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{row.provider}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{formatNumber(row.tokens_in)}</td>
                    <td style={{ padding: '10px 0', color: TOKENS.navy }}>{formatNumber(row.tokens_out)}</td>
                    <td style={{ padding: '10px 0' }}>
                      <span style={{ background: `${statusColor}22`, color: statusColor, padding: '4px 9px', borderRadius: '999px', fontWeight: 600 }}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
