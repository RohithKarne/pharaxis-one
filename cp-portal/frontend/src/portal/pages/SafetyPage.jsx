import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { usePortal } from '../context/PortalContext'

export default function SafetyPage() {
  const { clientCode, portalHeaders } = usePortal()
  const [alerts, setAlerts]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('cp_portal_token')
        const res = await fetch(`/api/portal/safety?clientCode=${clientCode}`, {
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        const d = await res.json()
        setAlerts(d.alerts || [])
      } catch {
        setError('Unable to load safety alerts.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode])

  const active   = alerts.filter(a => a.status === 'active')
  const resolved = alerts.filter(a => a.status === 'resolved')

  function SeverityBadge({ severity }) {
    const normalized = (severity || 'unknown').toLowerCase().replace(/\s+/g, '-')
    return (
      <span className={`pp-severity-badge pp-severity-${normalized}`}>
        {severity}
      </span>
    )
  }

  function AlertCard({ alert, isResolved }) {
    return (
      <div className={`pp-alert-card severity-${alert.severity}${isResolved ? ' resolved' : ''}`}>
        <div className="pp-alert-header">
          <SeverityBadge severity={alert.severity} />
          {isResolved && <span className="pp-severity-badge resolved">Resolved</span>}
          <span style={{ fontSize: 12, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            {alert.alert_type?.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="pp-alert-title">{alert.title}</div>
        {(alert.product_name || alert.ref_number) && (
          <div className="pp-alert-meta">
            {alert.product_name && <span>Product: {alert.product_name}</span>}
            {alert.product_name && alert.ref_number && <span> · </span>}
            {alert.ref_number && <span>Ref: {alert.ref_number}</span>}
          </div>
        )}
        {alert.effective_date && (
          <div className="pp-alert-meta">Effective: {alert.effective_date.slice(0, 10)}</div>
        )}
        {alert.body_html && (
          <div
            className="pp-alert-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(alert.body_html) }}
          />
        )}
        {alert.attachment_name && (
          <div className="pp-alert-actions">
            <a
              href={`/api/portal/safety/${alert.id}/attachment?clientCode=${clientCode}`}
              className="pp-btn pp-btn-outline pp-btn-sm"
              target="_blank"
              rel="noopener noreferrer"
            >
              📄 Download PDF
            </a>
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="pp-safety-page"><div className="pp-loading">Loading…</div></div>
  if (error)   return <div className="pp-safety-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-safety-page">
      <h1 className="pp-safety-section-title">Safety Alerts</h1>

      {active.length === 0 ? (
        <div className="pp-safety-empty">No active safety alerts at this time.</div>
      ) : (
        active.map(a => <AlertCard key={a.id} alert={a} isResolved={false} />)
      )}

      {resolved.length > 0 && (
        <>
          <div className="pp-safety-resolved-title">Resolved Alerts</div>
          {resolved.map(a => <AlertCard key={a.id} alert={a} isResolved={true} />)}
        </>
      )}
    </div>
  )
}
