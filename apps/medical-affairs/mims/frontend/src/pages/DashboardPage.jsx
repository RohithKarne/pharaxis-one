/**
 * DashboardPage.jsx — Main Dashboard
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('mims_sidebar_collapsed') === 'true'
  )
  const [theme, setThemeState] = useState(() =>
    localStorage.getItem('mims_theme') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} onCollapse={toggleSidebar} theme={theme} setTheme={setThemeState} />

      <div className="main-content">
        <Topbar title="Dashboard" onToggleSidebar={toggleSidebar} />

        <main className="page-content">
          {/* Welcome Banner */}
          <div className="card mb-16" style={{ marginBottom: 20, background: 'linear-gradient(135deg, #1a5276, #2471a3)', color: 'white', border: 'none' }}>
            <div className="card-body" style={{ padding: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Welcome back, {firstName}!</div>
              <div style={{ opacity: 0.8, marginTop: 4, fontSize: 13 }}>Here's your MIMS overview for today.</div>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Inquiries</div>
              <div className="stat-value">0</div>
              <div className="stat-sub">All time</div>
            </div>
            <div className="stat-card accent">
              <div className="stat-label">Open Cases</div>
              <div className="stat-value">0</div>
              <div className="stat-sub">Needs attention</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-label">Pending Review</div>
              <div className="stat-value">0</div>
              <div className="stat-sub">Awaiting reviewer</div>
            </div>
            <div className="stat-card success">
              <div className="stat-label">Closed Today</div>
              <div className="stat-value">0</div>
              <div className="stat-sub">Completed</div>
            </div>
          </div>

          {/* Two columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-header">
                <h3>Recent Inquiries</h3>
                <button className="btn btn-outline" style={{ fontSize: 12, padding: '4px 12px' }}>View All</button>
              </div>
              <div className="card-body">
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 13 }}>No inquiries yet.</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>Quick Actions</h3></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-primary" onClick={() => navigate('/inbox')}>📥 Go to Inbox</button>
                <button className="btn btn-outline">📁 Case Queue</button>
                <button className="btn btn-outline">👥 Manage Users</button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
