/**
 * MIMSNavbar.jsx — Left sidebar navigation
 * Collapsed (icons only, 56px) / Expanded (icons + labels, 220px)
 * User toggle persisted in localStorage via MIMSLayout.
 */

import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdminUser } from '../utils/adminScope.js'
import Icon from './Icon'

const CASE_MGMT_ROUTES = {
  'My Cases': '/cases?tab=my',
  'Unassigned Cases': '/cases?tab=unassigned',
  'Deleted Cases': '/cases?tab=deleted',
  'Response Log': '/response-log',
}
const CASE_MGMT_ITEMS  = ['My Cases', 'Unassigned Cases', 'Deleted Cases', 'Response Log']

function NavItem({ to, icon, label, active, disabled, onClick, collapsed }) {
  const cls = `mims-sidenav-item${active ? ' active' : ''}${disabled ? ' disabled' : ''}`
  const content = (
    <>
      <span className="mims-sidenav-icon">{icon}</span>
      {!collapsed && <span className="mims-sidenav-label">{label}</span>}
    </>
  )
  if (disabled) return <div className={cls} title={collapsed ? label : undefined}>{content}</div>
  if (onClick) return <div className={cls} onClick={onClick} title={collapsed ? label : undefined}>{content}</div>
  return (
    <Link to={to} className={cls} title={collapsed ? label : undefined}>
      {content}
    </Link>
  )
}

function NavSection({ title, collapsed }) {
  if (collapsed) return <div className="mims-sidenav-section-spacer" aria-hidden="true" />
  return <div className="mims-sidenav-section">{title}</div>
}

export default function MIMSNavbar({ collapsed, onToggle }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { hasModuleAccess, hasCaseOption, user } = useAuth()

  const [caseMgmtOpen,  setCaseMgmtOpen]  = useState(false)
  const userRole = user?.role

  // Close accordions when sidebar collapses
  useEffect(() => {
    if (!collapsed) return
    const frame = requestAnimationFrame(() => {
      setCaseMgmtOpen(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [collapsed])

  function isActive(path)  { return location.pathname === path }
  function isCasesActive() {
    return location.pathname === '/cases' || location.pathname.startsWith('/cases/') || location.pathname === '/response-log'
  }

  function canAccess(k)         { return hasModuleAccess(k) }
  function canAccessAny(...ks)  { return ks.some(k => hasModuleAccess(k)) }
  function canUseCase(section, option) { return hasCaseOption ? hasCaseOption(section, option) : true }
  const isAdmin = isAdminUser(userRole)
  const canCreateCase = canAccessAny('mims_core', 'case_mgmt') && canUseCase('case_entry_options', 'add_new_case')

  return (
    <nav className={`mims-sidenav${collapsed ? ' collapsed' : ''}`}>

      {/* Toggle button */}
      <button className="mims-sidenav-toggle" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        <span className="mims-sidenav-icon"><Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} /></span>
        {!collapsed && <span className="mims-sidenav-label" style={{ fontSize: 11, opacity: 0.7 }}>Collapse</span>}
      </button>

      <div className="mims-sidenav-divider" />

      {/* Home */}
      <NavSection collapsed={collapsed} title="Work" />
      <NavItem collapsed={collapsed} to="/dashboard" icon={<Icon name="overview" />} label="Overview" active={isActive('/dashboard')} />

      {/* Inbox */}
      <NavItem collapsed={collapsed} to="/inbox" icon={<Icon name="inbox" />} label="Inbox"
        active={isActive('/inbox')}
        disabled={!canAccess('mims_core')} />

      {/* Chat */}
      <NavItem collapsed={collapsed} to="/chat" icon={<Icon name="chat" />} label="Chat"
        active={isActive('/chat')}
        disabled={!canAccess('mims_core')} />

      {/* Case Management — accordion */}
      <div className={`mims-sidenav-item${isCasesActive() ? ' active' : ''}${!canAccessAny('mims_core', 'case_mgmt') ? ' disabled' : ''}`}
        title={collapsed ? 'Case Management' : undefined}
        onClick={() => {
          if (!canAccessAny('mims_core', 'case_mgmt')) return
          if (collapsed) {
            navigate('/cases?tab=my')
            return
          }
          setCaseMgmtOpen(o => !o)
        }}>
        <span className="mims-sidenav-icon"><Icon name="folder" /></span>
        {!collapsed && <span className="mims-sidenav-label">Case Management</span>}
        {!collapsed && canAccessAny('mims_core', 'case_mgmt') && (
          <span className="mims-sidenav-arrow"><Icon name={caseMgmtOpen ? 'chevron-up' : 'chevron-down'} size={14} /></span>
        )}
      </div>
      {caseMgmtOpen && !collapsed && (
        <div className="mims-sidenav-sub">
          {CASE_MGMT_ITEMS.map(item => (
            <Link key={item} to={CASE_MGMT_ROUTES[item]}
              className={`mims-sidenav-sub-item${location.pathname + location.search === CASE_MGMT_ROUTES[item] ? ' active' : ''}`}
              onClick={() => setCaseMgmtOpen(false)}>
              {item}
            </Link>
          ))}
        </div>
      )}

      {/* Case Query */}
      <NavItem collapsed={collapsed} to="/case-query" icon={<Icon name="search" />} label="Case Query"
        active={isActive('/case-query')}
        disabled={!canAccess('mims_core')} />

      {/* Utilities — accordion */}
      <NavItem collapsed={collapsed} to="/transmissions" icon={<Icon name="transmissions" />} label="Transmissions"
        active={isActive('/transmissions')}
        disabled={!canAccess('transmissions')} />

      <NavSection collapsed={collapsed} title="Knowledge" />

      {/* Browse Content */}
      <NavItem collapsed={collapsed} to="/browse-content" icon={<Icon name="browse" />} label="Browse Content"
        active={isActive('/browse-content')}
        disabled={!canAccessAny('browse_content', 'content_mgmt')} />

      {/* Content Management */}
      {(isAdmin && canAccess('content_mgmt')) && (
        <NavItem collapsed={collapsed} to="/content" icon={<Icon name="content" />} label="Content Management"
          active={isActive('/content')}
        />
      )}

      {/* Reports */}
      {(isAdmin && canAccess('reports')) && (
        <NavItem collapsed={collapsed} to="/reports" icon={<Icon name="reports" />} label="Reports"
          active={isActive('/reports')}
        />
      )}

      {/* MIMS Admin */}
      {(isAdmin && canAccess('admin_console')) && (
        <NavItem collapsed={collapsed} to="/mims-admin" icon={<Icon name="admin" />} label="MIMS Admin"
          active={isActive('/mims-admin')}
        />
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* + New Case */}
      <div className="mims-sidenav-new-case">
        <button className="mims-new-case-btn" style={{ width: collapsed ? 36 : '100%', padding: collapsed ? '6px 0' : '6px 16px', fontSize: collapsed ? 16 : 13 }}
          onClick={() => canCreateCase && navigate('/cases')}
          disabled={!canCreateCase}
          aria-label="Create new case"
          title={!canCreateCase ? 'Your security group does not allow Add New Case.' : undefined}>
          {collapsed ? <Icon name="plus" size={16} /> : <><Icon name="plus" size={15} style={{ marginRight: 6, verticalAlign: '-2px' }} />New Case</>}
        </button>
      </div>

    </nav>
  )
}
