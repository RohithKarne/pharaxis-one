import React, { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminIntegrationHealthPanel({ H }) {
  const [integrations, setIntegrations] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await httpFetch('/api/admin/integrations/health', { headers: H })
      if (!res.ok) throw new Error('Failed to fetch integration health')
      const data = await res.json()
      setIntegrations(data.integrations || [])
      setConnections(data.connections || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = integrations.filter(i => i.status !== 'not_configured').length

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Integration Status</h2>
        <button className="btn btn-outline" onClick={fetchHealth} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Active Integrations</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{activeCount} / {integrations.length}</div>
        </div>
      </div>
      <p style={{ margin: '-20px 0 24px', fontSize: 12, color: 'var(--text-muted)' }}>
        Shows whether each integration is set up and switched on. Sync counts, errors, latency and live
        connection tests are not measured yet, so none are shown.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: '#fee2e2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
        {integrations.map(integration => {
          
          let statusStyle = { background: '#f1f5f9', color: '#475569' }
          let statusText = 'Not Configured'
          if (integration.status === 'enabled') {
            statusStyle = { background: '#dcfce7', color: '#166534' }
            statusText = 'Enabled'
          } else if (integration.status === 'disabled') {
            statusStyle = { background: '#fef08a', color: '#854d0e' }
            statusText = 'Disabled'
          }

          return (
            <div key={integration.key} style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>{integration.name}</h3>
                <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, ...statusStyle }}>
                  {statusText}
                </span>
              </div>
              
              <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Endpoint:</span>
                  <span style={{ fontFamily: 'monospace', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={integration.endpointUrl}>
                    {integration.endpointUrl || 'N/A'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Last Sync:</span>
                  <span>{integration.lastSyncAt ? new Date(integration.lastSyncAt).toLocaleString() : 'Never'}</span>
                </div>
              </div>

            </div>
          )
        })}
      </div>

      {/* Bridge row 6: systems that send cases in, judged by what their calls did. */}
      <h3 style={{ margin: '28px 0 12px', fontSize: 16 }}>Connected systems sending cases</h3>
      {connections.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No system is connected to send cases into this organisation.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          {connections.map(c => {
            const failing = Number(c.failures_24h) > 0
            const quiet = !c.last_call_at
            const style = c.status !== 'active' ? { background: '#f1f5f9', color: '#475569' }
              : failing ? { background: '#fee2e2', color: '#991b1b' }
              : quiet ? { background: '#fef08a', color: '#854d0e' }
              : { background: '#dcfce7', color: '#166534' }
            const label = c.status !== 'active' ? 'Switched off' : failing ? 'Failing calls' : quiet ? 'No calls yet' : 'Working'
            return (
              <div key={c.id} style={{ background: '#fff', borderRadius: 8, border: '1px solid var(--border)', padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{c.name}</h3>
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600, ...style }}>{label}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Last call:</span><span>{c.last_call_at ? new Date(c.last_call_at).toLocaleString() : 'Never'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Calls (24 h):</span><span>{c.calls_24h}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Failed (24 h):</span><span>{c.failures_24h}</span></div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
