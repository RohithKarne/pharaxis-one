import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import Icon from '../../shared/components/Icon'

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
    { label: 'Active Clients', value: active.length, helper: `${inactive.length} inactive`, icon: 'building', tone: 'blue' },
    { label: 'Open Submissions', value: totalSubs, helper: `${clientsWithSubs.length} client queues`, icon: 'inbox', tone: 'green' },
    { label: 'Content Alerts', value: freshnessAlerts.length, helper: 'needs review', icon: 'shield', tone: freshnessAlerts.length ? 'amber' : 'green' },
    { label: 'Average Readiness', value: `${avgReadiness}%`, helper: `${readyClients.length} ready`, icon: 'chart', tone: avgReadiness >= 75 ? 'green' : 'amber' },
  ]

  const priorityItems = freshnessAlerts.slice(0, 5)

  return (
    <AdminLayout title="Dashboard">
      <div className="oc-hero">
        <div>
          <div className="oc-eyebrow">CP Portal Admin</div>
          <h2>Operations Command Center</h2>
          <p>Monitor client launch readiness, content health, and submission queues from one workspace.</p>
        </div>
        <div className="oc-hero-actions">
          <span className="oc-refresh-label">Updated {updatedDate}</span>
          <button className="cp-btn cp-btn-primary" onClick={() => navigate('/admin/clients')}>
            Manage Clients
          </button>
        </div>
      </div>

      <div className="oc-metric-grid">
        {metricCards.map(card => (
          <div key={card.label} className={`oc-metric-card tone-${card.tone}`}>
            <div className="oc-metric-icon"><Icon name={card.icon} size={20} /></div>
            <div>
              <div className="oc-metric-value">{card.value}</div>
              <div className="oc-metric-label">{card.label}</div>
              <div className="oc-metric-helper">{card.helper}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="oc-dashboard-grid">
        <section className="oc-panel">
          <div className="oc-panel-header">
            <div>
              <h2>Priority Alerts</h2>
              <p>Content and document items that need admin attention.</p>
            </div>
            <span className={`oc-count-pill${freshnessAlerts.length ? ' warning' : ''}`}>{freshnessAlerts.length}</span>
          </div>
          {priorityItems.length === 0 ? (
            <div className="oc-empty-state">
              <Icon name="check" size={18} />
              <span>No active content health alerts.</span>
            </div>
          ) : (
            <div className="oc-work-list">
              {priorityItems.map((a, i) => (
                <button key={`${a.clientId}-${a.type}-${i}`} className="oc-work-row" onClick={() => navigate(`/admin/clients/${a.clientId}`)}>
                  <span className={`oc-work-icon ${a.type}`}><Icon name={a.type === 'news' ? 'news' : 'folder'} size={16} /></span>
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
            <div>
              <h2>Open Submissions</h2>
              <p>Client queues sorted by highest volume.</p>
            </div>
            <span className="oc-count-pill">{totalSubs}</span>
          </div>
          {clientsWithSubs.length === 0 ? (
            <div className="oc-empty-state">
              <Icon name="inbox" size={18} />
              <span>No open submissions.</span>
            </div>
          ) : (
            <div className="oc-work-list">
              {clientsWithSubs.slice(0, 5).map(c => (
                <button key={c.id} className="oc-work-row" onClick={() => navigate(`/admin/clients/${c.id}/submissions`)}>
                  <span className="oc-work-icon"><Icon name="inbox" size={16} /></span>
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
            <div>
              <h2>Setup Readiness</h2>
              <p>Clients closest to launch or needing setup work.</p>
            </div>
            <span className="oc-count-pill">{readyClients.length}/{clients.length}</span>
          </div>
          {setupClients.length === 0 ? (
            <div className="oc-empty-state">
              <Icon name="check" size={18} />
              <span>All active clients are ready.</span>
            </div>
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
          <div>
            <h2>Client Portfolio</h2>
            <p>Operational table view for status, readiness, and queue health.</p>
          </div>
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
                        <span className="oc-client-avatar">{c.name?.charAt(0)?.toUpperCase() || 'C'}</span>
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
                          <span>{c.readiness_label || 'Not started'}</span>
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
