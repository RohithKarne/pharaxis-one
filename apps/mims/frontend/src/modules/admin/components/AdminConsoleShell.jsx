import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function AdminNavButton({ item, isActive, onNavigate, compact = false }) {
  return (
    <button
      type="button"
      className={`ac-nav-item${compact ? ' compact' : ''}${isActive ? ' active' : ''}${!item.active ? ' disabled' : ''}`}
      onClick={() => item.active && onNavigate(item.key)}
      disabled={!item.active}
    >
      <span className="ac-nav-item-label">{item.label}</span>
      {!item.active && <span className="ac-nav-item-tag">Soon</span>}
    </button>
  )
}

export function AdminConsoleBrandHero({ title, subtitle, showOverviewAction = false, onOverview }) {
  const { token, orgId, orgName } = useAuth()
  const [orgLogoUrl, setOrgLogoUrl] = useState(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    httpFetch('/api/auth/org-logo', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setOrgLogoUrl(data?.logo_url || null)
      })
      .catch(() => {
        if (!cancelled) setOrgLogoUrl(null)
      })
    return () => { cancelled = true }
  }, [orgId, token])

  const brandName = orgName || 'MIMS'

  return (
    <div className="ac-hero">
      <div className="ac-hero-main">
        <div className="ac-hero-copy">
          <h1 className="ac-hero-title">{title}</h1>
          <p className="ac-hero-subtitle">{subtitle}</p>
          {showOverviewAction && (
            <button type="button" className="ac-hero-action" onClick={onOverview}>
              Back To Overview
            </button>
          )}
        </div>
        <div className="ac-hero-brand">
          {orgLogoUrl ? (
            <img src={orgLogoUrl} alt={brandName} className="ac-hero-brand-logo" />
          ) : (
            <div className="ac-hero-brand-fallback" aria-hidden="true">
              <span />
            </div>
          )}
        </div>
      </div>
      <div className="ac-hero-rule" />
    </div>
  )
}

export function AdminConsoleNavigationBoard({ groups, currentSection, onNavigate, mode = 'overview' }) {
  const [primaryGroup, ...otherGroups] = groups
  const compact = mode === 'compact'
  const visibleGroups = compact ? groups : otherGroups
  const boardTitle = useMemo(() => (compact ? 'Configuration Launcher' : primaryGroup?.title || 'MIMS Admin'), [compact, primaryGroup])

  return (
    <div className={`ac-nav-board ${compact ? 'compact' : 'overview'}`}>
      {!compact && primaryGroup && (
        <div className="ac-nav-board-primary">
          <div className="ac-nav-board-heading">{boardTitle}</div>
          <div className="ac-nav-stack">
            {primaryGroup.items.map((item) => (
              <AdminNavButton
                key={item.key}
                item={item}
                isActive={currentSection === item.key}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      )}

      <div className="ac-nav-board-groups">
        {compact && <div className="ac-nav-board-heading compact">{boardTitle}</div>}
        <div className={`ac-nav-groups-grid ${compact ? 'compact' : ''}`}>
          {visibleGroups.map((group) => (
            <section key={group.key} className="ac-nav-group-card">
              <div className="ac-nav-group-title">{group.title}</div>
              <div className="ac-nav-group-items">
                {group.items.map((item) => (
                  <AdminNavButton
                    key={item.key}
                    item={item}
                    isActive={currentSection === item.key}
                    onNavigate={onNavigate}
                    compact={compact}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
