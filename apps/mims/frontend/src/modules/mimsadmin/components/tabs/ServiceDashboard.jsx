import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import adminRouteMap from '../../../../shared/config/adminRouteMap.json'

const STATUS_COLORS = {
  success: { bg: '#e6f4ee', color: '#007a5a', label: 'Success' },
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

const TYPE_LABELS = {
  cron:       { bg: '#eff6ff', color: '#1d4ed8', label: 'Cron'       },
  standalone: { bg: '#f5f3ff', color: '#6d28d9', label: 'Standalone' },
  poll:       { bg: '#fff7ed', color: '#c2410c', label: 'Poll'       },
}

const CONFIG_ROUTES = adminRouteMap.serviceConfigRoutes || {}

const COLS = [
  'Task Name', 'Source', 'Type', 'Schedule',
  'Enabled', 'Last Run Date', 'Last Successful Run',
  'Last Run Status', 'Next Run Date', 'Action',
]

export default function ServiceDashboard() {
  const { token } = useAuth()
  const navigate  = useNavigate()

  const [services,  setServices]  = useState([])
  const [runtimeHealth, setRuntimeHealth] = useState(null)
  const [observability, setObservability] = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [lastFetch, setLastFetch] = useState(null)

  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [servicesResult, healthResult, summaryResult] = await Promise.allSettled([
        httpFetch('/api/admin/service-dashboard', { headers: H }),
        httpFetch('/api/admin/observability/runtime-health', { headers: H }),
        httpFetch('/api/admin/observability/summary', { headers: H }),
      ])

      if (servicesResult.status === 'fulfilled') {
        const servicesData = await servicesResult.value.json()
        setServices(servicesData.services || [])
      }
      if (healthResult.status === 'fulfilled') {
        const healthData = await healthResult.value.json()
        setRuntimeHealth(healthResult.value.ok ? healthData : null)
      }
      if (summaryResult.status === 'fulfilled') {
        const summaryData = await summaryResult.value.json()
        setObservability(summaryResult.value.ok ? summaryData : null)
      }
      setLastFetch(new Date().toLocaleTimeString())
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: loading ? 'default' : 'pointer', color: 'var(--text-primary)', opacity: loading ? 0.6 : 1 }}
        >
          ⟳ Refresh
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {services.length} service{services.length !== 1 ? 's' : ''} registered
        </span>
        {lastFetch && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
            Last fetched: {lastFetch}
          </span>
        )}
      </div>

      {runtimeHealth && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          {[
            { label: 'Runtime Status', value: String(runtimeHealth.status || 'unknown').toUpperCase() },
            { label: 'Active Orgs', value: runtimeHealth.summary?.active_orgs ?? 0 },
            { label: 'Admins With Access', value: runtimeHealth.summary?.admins_with_org_access ?? 0 },
            { label: '401s (24h)', value: runtimeHealth.summary?.auth_401_24h ?? 0 },
            { label: '5xx (24h)', value: runtimeHealth.summary?.server_5xx_24h ?? 0 },
            { label: 'Worker Alerts (24h)', value: runtimeHealth.summary?.worker_alerts_24h ?? 0 },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {(runtimeHealth?.checks?.length || observability?.error_endpoints?.length) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>Runtime Checks</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(runtimeHealth?.checks || []).slice(0, 8).map(check => (
                <div key={check.name} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: check.status === 'failed' ? '#fff1f2' : check.status === 'warning' ? '#fffbeb' : '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{check.name.replaceAll('_', ' ')}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: check.status === 'failed' ? '#be123c' : check.status === 'warning' ? '#a16207' : '#0f766e' }}>
                      {check.status}
                    </div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{check.detail}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Top Error Endpoints</div>
              <button
                type="button"
                onClick={() => navigate('/exceptions')}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                Open Exceptions
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {(observability?.error_endpoints || []).slice(0, 8).map((item, idx) => (
                <div key={`${item.path}-${item.method}-${item.status_code}-${idx}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.method} {item.path}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{item.total} hit(s)</div>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>Status {item.status_code}</div>
                </div>
              ))}
              {(!observability?.error_endpoints || observability.error_endpoints.length === 0) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No error-heavy endpoints in the last 24 hours.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : services.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>🖥️</div>
            <div style={{ fontSize: 14 }}>No services registered yet.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {COLS.map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((svc, i) => {
                const sc        = STATUS_COLORS[svc.last_run_status] || null
                const tc        = TYPE_LABELS[svc.type] || TYPE_LABELS.cron
                const configTo  = CONFIG_ROUTES[svc.name] || null
                const hasConfig = !!configTo

                return (
                  <tr key={svc.name} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>

                    {/* Task Name + description */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{svc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 260, whiteSpace: 'normal', lineHeight: 1.3 }}>{svc.description}</div>
                    </td>

                    {/* Source */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{svc.source}</td>

                    {/* Type badge */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: tc.bg, color: tc.color, padding: '2px 8px', borderRadius: 10, fontWeight: 600, fontSize: 11 }}>
                        {tc.label}
                      </span>
                    </td>

                    {/* Schedule */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {svc.cron_expression || svc.poll_interval || '—'}
                    </td>

                    {/* Enabled */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: svc.enabled ? '#e6f4ee' : '#fde8ef', color: svc.enabled ? '#007a5a' : '#e01e5a', padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {svc.enabled ? '✓ Enabled' : '✕ Disabled'}
                      </span>
                    </td>

                    {/* Last Run Date */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {svc.last_run_date || '—'}
                    </td>

                    {/* Last Successful Run */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {svc.last_successful_run_date || '—'}
                    </td>

                    {/* Last Run Status */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {sc ? (
                        <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                          {sc.label}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Next Run Date */}
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: 12 }}>
                      {svc.next_run_date || '—'}
                    </td>

                    {/* Action — Configure button */}
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      {hasConfig ? (
                        <button
                          onClick={() => navigate(configTo)}
                          title={`Configure ${svc.name}`}
                          style={{
                            padding: '4px 12px',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            background: 'var(--primary)',
                            color: '#fff',
                          }}
                        >
                          ⚙ Configure
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
