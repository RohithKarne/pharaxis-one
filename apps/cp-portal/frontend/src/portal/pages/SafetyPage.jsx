import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import Icon from '../../shared/components/Icon'
import AskAboutThis from '../components/AskAboutThis'
import { formatLongDate, formatDateTime } from '../../shared/utils/datetime'

// CPPM-119: every severity the admin console can set, plus 'warning' from older alerts.
const SEVERITIES = ['critical', 'high', 'medium', 'warning', 'informational']

export default function SafetyPage() {
  const { clientCode, portalHeaders, language, user } = usePortal()
  const [ackBusy, setAckBusy]         = useState(null)
  const [ackError, setAckError]       = useState('')
  const [alerts, setAlerts]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [sevFilter, setSevFilter]     = useState('all')

  usePageTitle('Safety Alerts')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const langParam = language && language !== 'en' ? `&lang=${language}` : ''
        const res = await fetch(`/api/portal/safety?clientCode=${clientCode}${langParam}`, {
          headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        })
        const d = await res.json()
        setAlerts(d.alerts || [])
        // increment view count for each alert visible on this page load
        ;(d.alerts || []).forEach(a => {
          fetch(`/api/portal/safety/${clientCode}/alerts/${a.id}/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {})
        })
      } catch {
        setError('Unable to load safety alerts.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, language, user?.id])

  // CPPM-114: "I have read this" on an active high or critical letter.
  async function acknowledge(alert) {
    setAckBusy(alert.id); setAckError('')
    try {
      const res = await fetch(`/api/portal/safety/${clientCode}/alerts/${alert.id}/acknowledge`, { method: 'POST', headers: portalHeaders(), credentials: 'same-origin' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setAckError(d.error || 'Your confirmation could not be saved. Please try again.'); return }
      setAlerts(list => list.map(a => a.id === alert.id ? { ...a, acknowledged_at: d.acknowledged_at } : a))
      window.dispatchEvent(new Event('cp:safety-ack')) // the banner counts again
    } catch { setAckError('Network error — please try again.') } finally { setAckBusy(null) }
  }

  // CPPM-115: a notification links here with #alert-<id>; bring that letter into view.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash.startsWith('#alert-') || !alerts.length) return
    const el = document.getElementById(hash.slice(1))
    if (el) { el.scrollIntoView({ block: 'start' }); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }) }
  }, [hash, alerts])

  const active   = alerts.filter(a => a.status === 'active')
  const resolved = alerts.filter(a => a.status === 'resolved')
  const shown    = sevFilter === 'all' ? active : active.filter(a => (a.severity || '').toLowerCase() === sevFilter)
  const availableSeverities = SEVERITIES.filter(s => active.some(a => (a.severity || '').toLowerCase() === s))

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
      <div id={`alert-${alert.id}`} className={`pp-alert-card severity-${alert.severity}${isResolved ? ' resolved' : ''}`}>
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
          <div className="pp-alert-meta">Effective: {formatLongDate(alert.effective_date)}</div>
        )}
        {alert.body_html && (
          <div
            className="pp-alert-body"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(alert.body_html) }}
          />
        )}
        {alert.needs_ack && (
          <div className="pp-alert-ack" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 'var(--pp-radius, 2px)', border: '1px solid var(--pp-border, #E5E7EB)', background: alert.acknowledged_at ? '#F0FDF4' : '#FFFBEB' }}>
            {alert.acknowledged_at ? (
              <span role="status">You confirmed you read this on {formatDateTime(alert.acknowledged_at)}.</span>
            ) : (
              <>
                <span style={{ marginRight: 12 }}>Please confirm you have read this safety letter.</span>
                <button type="button" className="pp-btn pp-btn-primary pp-btn-sm" disabled={ackBusy === alert.id} onClick={() => acknowledge(alert)}>
                  {ackBusy === alert.id ? 'Saving…' : 'I have read this'}
                </button>
              </>
            )}
          </div>
        )}
        <div className="pp-alert-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <AskAboutThis product={alert.product_name} about={alert.title} />
        {alert.attachment_name && (
          <>
            <a
              href={`/api/portal/safety/${alert.id}/attachment?clientCode=${clientCode}`}
              className="pp-btn pp-btn-outline pp-btn-sm"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="file" size={15} /> Download PDF
            </a>
          </>
        )}
        </div>
      </div>
    )
  }

  if (loading) return <div className="pp-safety-page"><div className="pp-loading">Loading…</div></div>
  if (error)   return <div className="pp-safety-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-safety-page">
      <h1 className="pp-safety-section-title">Safety Alerts</h1>
      {ackError && <div className="pp-error-msg" role="alert">{ackError}</div>}

      {availableSeverities.length > 1 && (
        <div className="pp-sev-filter" role="group" aria-label="Filter by severity">
          <button className={`pp-sev-chip${sevFilter === 'all' ? ' on' : ''}`} onClick={() => setSevFilter('all')}>All ({active.length})</button>
          {availableSeverities.map(s => (
            <button key={s} className={`pp-sev-chip sev-${s}${sevFilter === s ? ' on' : ''}`} onClick={() => setSevFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)} ({active.filter(a => (a.severity || '').toLowerCase() === s).length})
            </button>
          ))}
        </div>
      )}

      {active.length === 0 ? (
        <div className="pp-safety-empty">No active safety alerts at this time.</div>
      ) : shown.length === 0 ? (
        <div className="pp-safety-empty">No {sevFilter} alerts.</div>
      ) : (
        shown.map(a => <AlertCard key={a.id} alert={a} isResolved={false} />)
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
