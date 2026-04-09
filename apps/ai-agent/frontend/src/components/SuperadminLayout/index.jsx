import React, { useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const TOKENS = {
  primary: '#6B3FA0',
  navy: '#0f172a',
  slate: '#64748b',
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0'
}

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: '⚡' },
  { path: '/orgs', label: 'Organisations', icon: '🏢' },
  { path: '/usage', label: 'Usage Logs', icon: '📊' }
]

const TITLE_MAP = {
  '/dashboard': 'Dashboard',
  '/orgs': 'Organisations',
  '/usage': 'Usage Logs'
}

function resolveTitle(pathname) {
  const exact = TITLE_MAP[pathname]
  if (exact) return exact
  const match = NAV_ITEMS.find(item => pathname.startsWith(item.path))
  return match?.label || 'Superadmin'
}

export default function SuperadminLayout() {
  const location = useLocation()
  const [hoveredPath, setHoveredPath] = useState(null)

  const pageTitle = useMemo(() => resolveTitle(location.pathname), [location.pathname])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' }}>
      <aside style={{ width: '240px', background: TOKENS.navy, color: '#fff', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '24px 16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '999px',
                background: TOKENS.primary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700
              }}
            >
              P
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>AI Agent</div>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', marginTop: '2px' }}>Superadmin</div>
            </div>
          </div>
        </div>

        <nav style={{ padding: '14px 10px', display: 'grid', gap: '6px' }}>
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
            const isHovered = hoveredPath === item.path

            return (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => setHoveredPath(item.path)}
                onMouseLeave={() => setHoveredPath(null)}
                style={{
                  textDecoration: 'none',
                  color: '#fff',
                  borderLeft: `4px solid ${isActive ? '#a78bfa' : 'transparent'}`,
                  background: isActive ? TOKENS.primary : (isHovered ? 'rgba(255,255,255,0.07)' : 'transparent'),
                  borderRadius: '8px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'background 0.2s ease'
                }}
              >
                <span style={{ width: '20px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', padding: '14px 16px 20px', color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
          v1.0 Sprint 1
        </div>
      </aside>

      <main style={{ flex: 1, background: TOKENS.bg, minWidth: 0 }}>
        <header
          style={{
            height: '56px',
            background: TOKENS.card,
            borderBottom: `1px solid ${TOKENS.border}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h1 style={{ margin: 0, fontSize: '19px', color: TOKENS.navy, fontWeight: 700 }}>{pageTitle}</h1>
          <span
            style={{
              background: '#efe8f8',
              color: TOKENS.primary,
              fontWeight: 600,
              fontSize: '12px',
              padding: '6px 10px',
              borderRadius: '999px'
            }}
          >
            Pharaxis Platform
          </span>
        </header>

        <div style={{ padding: '24px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
