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

  return (
    <AdminLayout title="Dashboard">
      <div className="cp-stats-row">
        <div className="cp-stat-card">
          <div className="cp-stat-value">{active.length}</div>
          <div className="cp-stat-label">Active Clients</div>
        </div>
        <div className="cp-stat-card">
          <div className="cp-stat-value">{inactive.length}</div>
          <div className="cp-stat-label">Inactive Clients</div>
        </div>
        <div className="cp-stat-card">
          <div className="cp-stat-value">{totalSubs}</div>
          <div className="cp-stat-label">Total Submissions</div>
        </div>
      </div>

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
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
