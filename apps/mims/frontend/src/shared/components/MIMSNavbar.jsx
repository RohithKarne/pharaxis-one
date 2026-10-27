/**
 * MIMSNavbar.jsx — Left sidebar navigation
 * Collapsed (icons only, 56px) / Expanded (icons + labels, 220px)
 * User toggle persisted in localStorage via MIMSLayout.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdminUser } from '../utils/adminScope.js'
import { prefetchRoutePath } from '../utils/routePrefetch.js'
import Icon from './Icon'

// Under Cases. Correspondence (the old Case Query) was reachable only from quick
// search; Deleted Cases moved into the case list, for administrators.
const CASE_ITEMS = [
  { label: 'My Cases', to: '/cases?tab=my' },
  { label: 'Unassigned Cases', to: '/cases?tab=unassigned' },
  { label: 'Correspondence', to: '/cases?view=correspondence' },
  { label: 'Response Log', to: '/response-log' },
  { label: 'Inquiry Ledger', to: '/inquiry-ledger' }, // MIPM-223
]

function NavItem({ to, icon, label, active, disabled, onClick, collapsed }) {
  const cls = `mims-sidenav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`
  const handlePrefetch = () => {
    if (!disabled && to) prefetchRoutePath(to)
  }
  const content = (
    <>
      <span className="mims-sidenav-icon">{icon}</span>
      {!collapsed && <span className="mims-sidenav-label">{label}</span>}
    </>
  )
  if (disabled) return <div className={cls} title={collapsed ? label : undefined}>{content}</div>
  if (onClick) return <div className={cls} onClick={onClick} onMouseEnter={handlePrefetch} onFocus={handlePrefetch} title={collapsed ? label : undefined}>{content}</div>
  return (
    <Link to={to} className={cls} onMouseEnter={handlePrefetch} onFocus={handlePrefetch} title={collapsed ? label : undefined}>
      {content}
    </Link>
  )
}

function NavSection({ title, collapsed }) {
  if (collapsed) return <div className="mims-sidenav-section-spacer" aria-hidden="true" />
  return <div className="mims-sidenav-section">{title}</div>
}

/**
 * The menu (Rohith, 14 Oct 2026, Saad's recommendation):
 *   - New Case sits at the top, the one action people take most;
 *   - Work · Knowledge · Reporting · Administration — Reports and MIMS Admin
 *     sat under Knowledge;
 *   - an item the user cannot open is not shown (it was greyed: a content
 *     author saw four dead items), and a heading with nothing under it goes too;
 *   - "Cases" opens the case list; its arrow shows My Cases, Unassigned,
 *     Correspondence and the Response Log.
 * Each item follows the access rule of the page it opens (its route's module).
 */
export default function MIMSNavbar({ collapsed, onToggle }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess, hasCapability, user } = useAuth()

  const [casesOpen, setCasesOpen] = useState(false)

  // Close the Cases list when the sidebar collapses
  useEffect(() => {
    if (!collapsed) return
    const frame = requestAnimationFrame(() => setCasesOpen(false))
    return () => cancelAnimationFrame(frame)
  }, [collapsed])

  const isActive = (path) => location.pathname === path
  const isCasesActive = location.pathname === '/cases' || location.pathname.startsWith('/cases/') || location.pathname === '/response-log' || location.pathname === '/inquiry-ledger'
  const can = (k) => hasModuleAccess(k)

  const canUseCases = can('mims_core')
  // New Case shows to people who may create cases (the case list's own button
  // checks the same).
  const canCreateCases = canUseCases && (hasCapability ? hasCapability('case.create') : true)
  const work = { overview: canUseCases, inbox: can('inbox'), cases: canUseCases, transmissions: can('transmissions') }
  const knowledge = { browse: can('browse_content'), content: can('content_mgmt') }
  const reporting = can('reports')
  const administration = isAdminUser(user?.role) && can('admin_console')

  return (
    <nav className={`mims-sidenav${collapsed ? ' collapsed' : ''}`}>

      <button className="mims-sidenav-toggle" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <span className="mims-sidenav-icon"><Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} /></span>
        {!collapsed && <span className="mims-sidenav-label" style={{ fontSize: 11 }}>Collapse</span>}
      </button>

      {canCreateCases && (
        <div className="mims-sidenav-new-case">
          <button className="mims-new-case-btn" style={{ width: collapsed ? 36 : '100%', padding: collapsed ? '6px 0' : '6px 16px', fontSize: collapsed ? 16 : 13 }}
            onMouseEnter={() => prefetchRoutePath('/cases')}
            onFocus={() => prefetchRoutePath('/cases')}
            onClick={() => navigate('/cases?new=1')}
            aria-label="Create new case">
            {collapsed ? <Icon name="plus" size={16} /> : <><Icon name="plus" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />New Case</>}
          </button>
        </div>
      )}

      <div className="mims-sidenav-divider" />

      {Object.values(work).some(Boolean) && <NavSection collapsed={collapsed} title="Work" />}
      {work.overview && (
        <NavItem collapsed={collapsed} to="/dashboard" icon={<Icon name="overview" />} label="Overview" active={isActive('/dashboard')} />
      )}
      {work.inbox && (
        <NavItem collapsed={collapsed} to="/inbox" icon={<Icon name="inbox" />} label="Inbox" active={isActive('/inbox')} />
      )}
      {work.cases && (
        <>
          <div className={`mims-sidenav-item${isCasesActive ? ' active' : ''}`} title={collapsed ? 'Cases' : undefined}>
            <Link to="/cases?tab=my" className="mims-sidenav-link" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, color: 'inherit', textDecoration: 'none', minWidth: 0 }}
              onMouseEnter={() => prefetchRoutePath('/cases')} onFocus={() => prefetchRoutePath('/cases')}>
              <span className="mims-sidenav-icon"><Icon name="folder" /></span>
              {!collapsed && <span className="mims-sidenav-label">Cases</span>}
            </Link>
            {!collapsed && (
              <button type="button" className="mims-sidenav-arrow" onClick={() => setCasesOpen((o) => !o)}
                aria-expanded={casesOpen} aria-label={casesOpen ? 'Hide case lists' : 'Show case lists'}
                style={{ background: 'none', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 2px' }}>
                <Icon name={casesOpen ? 'chevron-up' : 'chevron-down'} size={14} />
              </button>
            )}
          </div>
          {casesOpen && !collapsed && (
            <div className="mims-sidenav-sub">
              {CASE_ITEMS.map((item) => (
                <Link key={item.label} to={item.to}
                  className={`mims-sidenav-sub-item${location.pathname + location.search === item.to ? ' active' : ''}`}
                  onMouseEnter={() => prefetchRoutePath(item.to)}
                  onFocus={() => prefetchRoutePath(item.to)}>
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {work.transmissions && (
        <NavItem collapsed={collapsed} to="/transmissions" icon={<Icon name="transmissions" />} label="Transmissions" active={isActive('/transmissions')} />
      )}

      {Object.values(knowledge).some(Boolean) && <NavSection collapsed={collapsed} title="Knowledge" />}
      {knowledge.browse && (
        <NavItem collapsed={collapsed} to="/browse-content" icon={<Icon name="browse" />} label="Browse Content" active={isActive('/browse-content')} />
      )}
      {knowledge.content && (
        <NavItem collapsed={collapsed} to="/content" icon={<Icon name="content" />} label="Content Management" active={isActive('/content')} />
      )}

      {reporting && <NavSection collapsed={collapsed} title="Reporting" />}
      {reporting && (
        <NavItem collapsed={collapsed} to="/reports" icon={<Icon name="reports" />} label="Reports" active={isActive('/reports')} />
      )}

      {administration && <NavSection collapsed={collapsed} title="Administration" />}
      {administration && (
        <NavItem collapsed={collapsed} to="/mims-admin" icon={<Icon name="admin" />} label="MIMS Admin" active={isActive('/mims-admin')} />
      )}

    </nav>
  )
}
