import React, { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminIntegrationHealthPanel({ H }) {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [testingKey, setTestingKey] = useState(null)

  const fetchHealth = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await httpFetch('/api/admin/integrations/health', { headers: H })
      if (!res.ok) throw new Error('Failed to fetch integration health')
      const data = await res.json()
      setIntegrations(data.integrations || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTestConnection = async (key) => {
    setTestingKey(key)
    try {
      const res = await httpFetch(`/api/admin/integrations/${key}/test`, {
        method: 'POST',
        headers: H
      })
      if (!res.ok) throw new Error('Test failed')
      const data = await res.json()
      
      setIntegrations(prev => prev.map(int => 
        int.key === key ? { ...int, latencyMs: data.latencyMs, status: data.status || 'healthy' } : int
      ))
    } catch (err) {
      setIntegrations(prev => prev.map(int => 
        int.key === key ? { ...int, status: 'error' } : int
      ))
    } finally {
      setTestingKey(null)
    }
  }

  const handleTestAll = async () => {
    for (const integration of integrations) {
      if (integration.status !== 'not_configured') {
        await handleTestConnection(integration.key)
      }
    }
  }

  const activeCount = integrations.filter(i => i.status !== 'not_configured').length
  const healthyCount = integrations.filter(i => i.status === 'healthy').length
  const totalEvents = integrations.reduce((acc, i) => acc + (i.syncCount24h || 0), 0)
  const totalErrors = integrations.reduce((acc, i) => acc + (i.errorCount24h || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Integration Health Monitor</h2>
        <button
          className="btn btn-primary"
          onClick={handleTestAll}
          disabled={loading || !!testingKey}
        >
          {loading || testingKey ? 'Testing...' : 'Test All Connections'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Active Integrations</div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>{activeCount} / {integrations.length}</div>
        </div>
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Healthy Connections</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#16a34a' }}>{healthyCount}</div>
        </div>
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total 24h Events</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>{totalEvents}</div>
        </div>
        <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total Errors</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#dc2626' }}>{totalErrors}</div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 6, fontSize: 13, background: '#fee2e2', color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
        {integrations.map(integration => {
          const isTesting = testingKey === integration.key
          
          let statusStyle = { background: '#f1f5f9', color: '#475569' }
          let statusText = 'Not Configured'
          if (integration.status === 'healthy') {
            statusStyle = { background: '#dcfce7', color: '#166534' }
            statusText = 'Healthy'
          } else if (integration.status === 'warning') {
            statusStyle = { background: '#fef08a', color: '#854d0e' }
            statusText = 'Warning'
          } else if (integration.status === 'error') {
            statusStyle = { background: '#fee2e2', color: '#b91c1c' }
            statusText = 'Error'
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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Syncs (24h):</span>
                  <span>{integration.syncCount24h}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Errors (24h):</span>
                  <span style={{ color: integration.errorCount24h > 0 ? '#dc2626' : 'inherit', fontWeight: integration.errorCount24h > 0 ? 600 : 'normal' }}>
                    {integration.errorCount24h}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Latency:</span>
                  <span>{integration.latencyMs ? `${integration.latencyMs}ms` : '-'}</span>
                </div>
              </div>

              <button
                className="btn btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleTestConnection(integration.key)}
                disabled={isTesting || integration.status === 'not_configured'}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
