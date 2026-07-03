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

  const active   = clients.filter(c => c.is_active)
  const inactive = clients.filter(c => !c.is_active)
  const totalSubs = clients.reduce((s, c) => s + (c.submission_count || 0), 0)
  const clientsWithSubs = clients.filter(c => (c.submission_count || 0) > 0).sort((a, b) => b.submission_count - a.submission_count)

  // F2-02: Collect freshness alerts across all active clients
  const freshnessAlerts = clients.filter(c => c.is_active).flatMap(c => {
    const alerts = []
    if (c.news_stale)        alerts.push({ clientId: c.id, clientName: c.name, type: 'news', msg: 'No news published in 30+ days' })
    if (c.expired_doc_count) alerts.push({ clientId: c.id, clientName: c.name, type: 'doc',  msg: `${c.expired_doc_count} expired document${c.expired_doc_count > 1 ? 's' : ''}` })
    if (c.expiring_soon_doc_count) alerts.push({ clientId: c.id, clientName: c.name, type: 'expiring', msg: `${c.expiring_soon_doc_count} document${c.expiring_soon_doc_count > 1 ? 's' : ''} expiring within 7 days` })
    return alerts
  })

  return (
    <AdminLayout title="Dashboard">
      <div className="cp-stats-row">
        <div className="cp-stat-card" role="img" aria-label={`Active Clients: ${active.length}`}>
          <div className="cp-stat-value">{active.length}</div>
          <div className="cp-stat-label">Active Clients</div>
        </div>
        <div className="cp-stat-card" role="img" aria-label={`Inactive Clients: ${inactive.length}`}>
          <div className="cp-stat-value">{inactive.length}</div>
          <div className="cp-stat-label">Inactive Clients</div>
        </div>
        <div className="cp-stat-card" role="img" aria-label={`Total Submissions: ${totalSubs}`}>
          <div className="cp-stat-value">{totalSubs}</div>
          <div className="cp-stat-label">Total Submissions</div>
        </div>
      </div>

      {freshnessAlerts.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-header">
            <h2>⚠ Content Health Alerts</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {freshnessAlerts.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, cursor: 'pointer' }}
                onClick={() => navigate(`/admin/clients/${a.clientId}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{a.type === 'news' ? '📰' : a.type === 'doc' ? '📁' : a.type === 'expiring' ? '⏳' : '⚠️'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#92400E' }}>{a.clientName}</span>
                  <span style={{ fontSize: 13, color: '#78350F' }}>— {a.msg}</span>
                </div>
                <span style={{ fontSize: 12, color: '#B45309' }}>Review →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {clientsWithSubs.length > 0 && (
        <div className="cp-section">
          <div className="cp-section-header">
            <h2>Open Submissions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientsWithSubs.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => navigate(`/admin/clients/${c.id}/submissions`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>📨</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>{c.code}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#2563EB' }}>{c.submission_count}</span>
                  <span style={{ fontSize: 12, color: '#64748B' }}>submission{c.submission_count !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cp-section">
        <div className="cp-section-header">
          <h2>Clients</h2>
          <button className="cp-btn cp-btn-primary" onClick={() => navigate('/admin/clients')}>
            Manage Clients →
          </button>
        </div>
        {loading ? (
          <div className="cp-loading">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="cp-empty">
            <div style={{ fontSize: 40 }}>🏢</div>
            <p>No clients yet. <button className="cp-link-btn" onClick={() => navigate('/admin/clients')}>Add the first client →</button></p>
          </div>
        ) : (
          <div className="cp-clients-grid">
            {clients.map(c => (
              <div key={c.id} className={`cp-client-card ${!c.is_active ? 'inactive' : ''}`}
                onClick={() => navigate(`/admin/clients/${c.id}`)}>
                <div className="cp-client-card-header">
                  <span className="cp-client-name">{c.name}</span>
                  <span className={`cp-badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="cp-client-code">Code: {c.code}</div>
                <div className="cp-client-subs">{c.submission_count || 0} submissions</div>
                {c.readiness_score !== undefined && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                      background: c.readiness_label === 'Ready' ? '#DCFCE7' : c.readiness_label === 'Almost Ready' ? '#FEF3C7' : '#FEE2E2',
                      color:      c.readiness_label === 'Ready' ? '#15803D' : c.readiness_label === 'Almost Ready' ? '#B45309' : '#DC2626',
                    }}>{c.readiness_label}</span>
                    <span style={{ fontSize: 11, color: '#64748B' }}>{c.readiness_score}% ready</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
