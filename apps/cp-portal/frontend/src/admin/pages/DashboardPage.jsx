import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

export default function DashboardPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/admin/clients', { headers: adminHeaders() })
      .then(r => r.json()).then(d => setClients(d.clients || []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const active = clients.filter(c => c.is_active)
  const inactive = clients.filter(c => !c.is_active)
  const totalSubs = clients.reduce((s, c) => s + (c.submission_count || 0), 0)
  const clientsWithSubs = clients
    .filter(c => (c.submission_count || 0) > 0)
    .sort((a, b) => b.submission_count - a.submission_count)
  const readyClients = clients.filter(c => c.readiness_label === 'Ready')
  const setupClients = clients.filter(c => c.is_active && c.readiness_label && c.readiness_label !== 'Ready')
  const avgReadiness = clients.length
    ? Math.round(clients.reduce((s, c) => s + (c.readiness_score || 0), 0) / clients.length)
    : 0

  const freshnessAlerts = clients.filter(c => c.is_active).flatMap(c => {
    const alerts = []
    if (c.news_stale) alerts.push({ clientId: c.id, clientName: c.name, type: 'news', msg: 'No news published in 30+ days' })
    if (c.expired_doc_count) alerts.push({ clientId: c.id, clientName: c.name, type: 'doc', msg: `${c.expired_doc_count} expired document${c.expired_doc_count > 1 ? 's' : ''}` })
    if (c.expiring_soon_doc_count) alerts.push({ clientId: c.id, clientName: c.name, type: 'expiring', msg: `${c.expiring_soon_doc_count} document${c.expiring_soon_doc_count > 1 ? 's' : ''} expiring within 7 days` })
    return alerts
  })

  const updatedDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date())

  const metricCards = [
    { label: 'Active Clients', value: active.length, helper: `${inactive.length} inactive`, tone: 'blue' },
    { label: 'Open Submissions', value: totalSubs, helper: `${clientsWithSubs.length} client queues`, tone: 'green' },
    { label: 'Content Alerts', value: freshnessAlerts.length, helper: freshnessAlerts.length ? 'Action needed' : 'Clear', tone: freshnessAlerts.length ? 'amber' : 'green' },
    { label: 'Launch Readiness', value: `${avgReadiness}%`, helper: `${readyClients.length} ready to launch`, tone: avgReadiness >= 75 ? 'green' : 'amber' },
  ]

  const priorityItems = freshnessAlerts.slice(0, 5)

  // CPPM-130: what each client has waiting, and the Inbox tab that holds it.
  const WAITING = [
    { key: 'safety',        label: 'Safety tasks',    tab: 'safety-queue' },
    { key: 'review',        label: 'To review',       tab: 'review-queue' },
    { key: 'access',        label: 'Access requests', tab: 'access-requests' },
    { key: 'data_requests', label: 'Data requests',   tab: 'data-requests' },
  ]
  // CPPM-138: a client also waits on us while any live high or critical letter is below 100% confirmed.
  const lowConfirmation = c => c.safety_confirmation && c.safety_confirmation.rate < 100
  const waitingClients = clients.filter(c => c.is_active && (WAITING.some(w => c.waiting?.[w.key] > 0) || lowConfirmation(c)))
  const waitingTotal = waitingClients.reduce((n, c) => n + WAITING.reduce((m, w) => m + (c.waiting?.[w.key] || 0), 0), 0)

  function readinessLabel(client) {
    if (client.readiness_label === 'Ready') return 'Ready to launch'
    if (client.readiness_label === 'Almost Ready') return 'Almost ready'
    if (client.readiness_label === 'Needs Setup') return 'Setup needed'
    return client.readiness_label || 'Not scored'
  }

  return (
    <AdminLayout title="Dashboard">
      <div className="oc-toolbar">
        <span className="oc-refresh-label">Updated {updatedDate}</span>
        <button className="cp-btn cp-btn-primary" onClick={() => navigate('/admin/clients')}>
          Manage Clients
        </button>
      </div>

      <section className="oc-panel">
        <div className="oc-panel-header"><h2>Summary</h2></div>
        <table className="cp-table oc-summary-table">
          <tbody>
            {metricCards.map(card => (
              <tr key={card.label}>
                <td>{card.label}</td>
                <td className={`oc-summary-value tone-${card.tone}`}>{card.value}</td>
                <td className="oc-summary-helper">{card.helper}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="oc-panel" aria-label="Waiting on you">
        <div className="oc-panel-header"><h2>Waiting on you ({waitingTotal})</h2></div>
        {loading ? <div className="cp-loading">Loading...</div> : waitingClients.length === 0 ? (
          <div className="oc-empty-state">Nothing is waiting.</div>
        ) : (
          <table className="cp-table">
            <thead><tr><th>Client</th>{WAITING.map(w => <th key={w.key}>{w.label}</th>)}<th>Safety confirmations</th></tr></thead>
            <tbody>
              {waitingClients.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  {WAITING.map(w => (
                    <td key={w.key}>
                      {c.waiting[w.key] > 0
                        ? <button className="cp-link-btn" onClick={() => navigate(`/admin/clients/${c.id}/${w.tab}`)}
                            aria-label={`${c.name}: ${c.waiting[w.key]} ${w.label.toLowerCase()}`}>{c.waiting[w.key]}</button>
                        : <span style={{ color: '#4B5563' }}>0</span>}
                    </td>
                  ))}
                  <td>
                    {!c.safety_confirmation ? <span style={{ color: '#4B5563' }}>—</span>
                      : c.safety_confirmation.rate >= 100 ? <span style={{ color: '#166534' }}>All confirmed</span>
                      : <button className="cp-link-btn" onClick={() => navigate(`/admin/clients/${c.id}/safety-confirmations`)}
                          title="Lowest confirmation rate among live high and critical letters">
                          {c.safety_confirmation.rate}% · {c.safety_confirmation.letter_title}
                        </button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="oc-dashboard-grid">
        <section className="oc-panel">
          <div className="oc-panel-header">
            <h2>Priority Alerts ({freshnessAlerts.length})</h2>
          </div>
          {priorityItems.length === 0 ? (
            <div className="oc-empty-state">No active content health alerts.</div>
          ) : (
            <div className="oc-work-list">
              {priorityItems.map((a, i) => (
                <button key={`${a.clientId}-${a.type}-${i}`} className="oc-work-row" onClick={() => navigate(`/admin/clients/${a.clientId}`)}>
                  <span className="oc-work-body">
                    <strong>{a.clientName}</strong>
                    <span>{a.msg}</span>
                  </span>
                  <span className="oc-work-action">Review</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="oc-panel">
          <div className="oc-panel-header">
            <h2>Open Submissions ({totalSubs})</h2>
          </div>
          {clientsWithSubs.length === 0 ? (
            <div className="oc-empty-state">No open submissions.</div>
          ) : (
            <div className="oc-work-list">
              {clientsWithSubs.slice(0, 5).map(c => (
                <button key={c.id} className="oc-work-row" onClick={() => navigate(`/admin/clients/${c.id}/submissions`)}>
                  <span className="oc-work-body">
                    <strong>{c.name}</strong>
                    <span>{c.code}</span>
                  </span>
                  <span className="oc-work-action">{c.submission_count}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="oc-panel">
          <div className="oc-panel-header">
            <h2>Launch Readiness ({readyClients.length} of {clients.length} ready)</h2>
          </div>
          {setupClients.length === 0 ? (
            <div className="oc-empty-state">All active clients are ready.</div>
          ) : (
            <div className="oc-readiness-list">
              {setupClients.slice(0, 5).map(c => (
                <button key={c.id} className="oc-readiness-row" onClick={() => navigate(`/admin/clients/${c.id}`)}>
                  <span>{c.name}</span>
                  <strong>{c.readiness_score || 0}%</strong>
                  <span className="oc-progress-track"><span style={{ width: `${c.readiness_score || 0}%` }} /></span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="oc-panel oc-client-table-panel">
        <div className="oc-panel-header">
          <h2>Clients</h2>
          <button className="cp-btn cp-btn-outline" onClick={() => navigate('/admin/clients')}>
            Open Client Manager
          </button>
        </div>
        {loading ? (
          <div className="cp-loading">Loading...</div>
        ) : clients.length === 0 ? (
          <div className="cp-empty">
            <p>No clients yet. <button className="cp-link-btn" onClick={() => navigate('/admin/clients')}>Add the first client</button></p>
          </div>
        ) : (
          <table className="cp-table cp-table-ops">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Readiness</th>
                <th>Submissions</th>
                <th>Content Health</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const alertCount = (c.news_stale ? 1 : 0) + (c.expired_doc_count || 0) + (c.expiring_soon_doc_count || 0)
                return (
                  <tr key={c.id} className={!c.is_active ? 'row-inactive' : ''} onClick={() => navigate(`/admin/clients/${c.id}`)}>
                    <td>
                      <div className="oc-client-cell">
                        <span>
                          <strong>{c.name}</strong>
                          <small>{c.code}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`cp-badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {c.readiness_score !== undefined ? (
                        <div className="oc-table-progress">
                          <span>{readinessLabel(c)}</span>
                          <strong>{c.readiness_score}%</strong>
                          <div className="oc-progress-track"><span style={{ width: `${c.readiness_score}%` }} /></div>
                        </div>
                      ) : 'Not scored'}
                    </td>
                    <td>{c.submission_count || 0}</td>
                    <td>
                      <span className={`oc-health-pill${alertCount ? ' warning' : ''}`}>
                        {alertCount ? `${alertCount} alert${alertCount === 1 ? '' : 's'}` : 'Clear'}
                      </span>
                    </td>
                    <td>{c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-'}</td>
                    <td><button className="cp-btn cp-btn-sm cp-btn-outline">Open</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </AdminLayout>
  )
}
