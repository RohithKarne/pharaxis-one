import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import Icon from '../../shared/components/Icon'
import { usePortal } from '../context/PortalContext'
import UserTypeGate from './UserTypeGate'
import ConsentBanner from './ConsentBanner'
import FeedbackWidget from './FeedbackWidget'
import LocalClock from './LocalClock'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const NOTIF_ICONS = { news: 'news', document: 'file', safety: 'shield' }

function NavDropdown({ label, items, base, location, onNavigate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = items.some(i => location.pathname.includes(i.path))

  useEffect(() => {
    if (!open) return
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="pp-nav-dropdown" ref={ref} style={{ position: 'relative' }}>
      <button
        className={`pp-nav-link pp-nav-dropdown-btn ${isActive ? 'pp-nav-link-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {label} <span style={{ fontSize: 10, marginLeft: 3 }}>▾</span>
      </button>
      {open && (
        <div className="pp-nav-dropdown-menu" role="menu">
          {items.map(i => (
            <Link key={i.path} to={`${base}/${i.path}`} className="pp-nav-dropdown-item" role="menuitem"
              onClick={() => { setOpen(false); onNavigate && onNavigate() }}>
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PortalLayout({ children }) {
  const { portalConfig, loading, user, logout, isFeatureEnabled, clientCode, showGate, language, setLanguage, t } = usePortal()
  const has_active_safety_alert = portalConfig?.has_active_safety_alert
  const safetySig = portalConfig?.safety_alert_sig || ''
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Persist the safety-banner dismissal across refreshes/sessions, keyed to the alert
  // signature — so it stays hidden after the × is clicked, but a NEW or updated
  // critical/high alert (new signature) re-surfaces it.
  useEffect(() => {
    if (!safetySig) { setBannerDismissed(false); return }
    try { setBannerDismissed(localStorage.getItem(`cp_safety_dismissed_${clientCode}`) === safetySig) }
    catch { setBannerDismissed(false) }
  }, [safetySig, clientCode])

  function dismissSafetyBanner() {
    setBannerDismissed(true)
    try { if (safetySig) localStorage.setItem(`cp_safety_dismissed_${clientCode}`, safetySig) } catch { /* storage disabled */ }
  }
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [bellOpen, setBellOpen] = useState(false)
  const [logoBroken, setLogoBroken] = useState(false)
  const [, setTimeTick] = useState(0)
  const userMenuRef = useRef(null)
  const bellRef     = useRef(null)
  const navigate   = useNavigate()
  const location   = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!userMenuOpen) return
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  useEffect(() => {
    if (!bellOpen) return
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [bellOpen])

  // Refresh timeAgo display every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setTimeTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!user || !clientCode) return
    async function loadNotifications() {
      try {
        const res = await fetch(`/api/portal/notifications?clientCode=${clientCode}`)
        const d = await res.json()
        const list = d.notifications || []
        setNotifications(list.slice(0, 10))
        setUnreadCount(list.filter(n => !n.is_read).length)
      } catch { /* silently fail */ }
    }
    loadNotifications()
  }, [user, clientCode])

  async function markAllRead() {
    try {
      const res = await fetch('/api/portal/notifications/read-all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode }),
      })
      if (!res.ok) return
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* silently fail */ }
  }
  const branding   = portalConfig?.branding || {}
  const client     = portalConfig?.client   || {}

  // F6-01: Consolidated nav — Science (TAs + Drug Info), Resources (Docs + Resources),
  // Events, Safety, News, Find MSL, Contact. Submit Inquiry stays as header CTA.
  const scienceItems = [
    isFeatureEnabled('therapeutic_areas') && { label: t('nav.therapeutic_areas'), path: 'therapeutic-areas' },
    isFeatureEnabled('drug_info')         && { label: t('nav.drug_info'),          path: 'drug-info' },
  ].filter(Boolean)

  const resourceItems = [
    isFeatureEnabled('resources')        && { label: t('nav.resources'),  path: 'resources' },
    isFeatureEnabled('document_library') && { label: t('nav.documents'),  path: 'documents' },
  ].filter(Boolean)

  const flatNavItems = [
    isFeatureEnabled('events')             && { label: t('nav.events'),    path: 'events' },
    { label: t('nav.safety'),   path: 'safety' },
    isFeatureEnabled('news_announcements') && { label: t('nav.news'),      path: 'news' },
    isFeatureEnabled('find_msl')           && { label: t('nav.find_msl'),  path: 'find-msl' },
    { label: t('nav.faq'),      path: 'faq' },
    { label: t('nav.contact'),  path: 'contact' },
  ].filter(Boolean)

  const base = `/portal/${clientCode}`

  function handleLogout() {
    logout()
    navigate(`${base}`)
  }

  const logoUrl  = branding.logo_url
  const logoText = branding.portal_name || client.name || 'Medical Portal'

  return (
    <div className="pp-root">
      <a href="#pp-main" className="pp-skip-link">Skip to content</a>
      {has_active_safety_alert && !bannerDismissed && (
        <div className="pp-safety-banner" role="alert">
          <span className="pp-safety-banner-icon"><Icon name="shield" size={16} /></span>
          <span className="pp-safety-banner-copy">Important Safety Information</span>
          <Link to={`${base}/safety`} className="pp-safety-banner-link">Review safety alerts and prescribing information</Link>
          <button
            onClick={dismissSafetyBanner}
            aria-label="Dismiss safety banner"
            className="pp-safety-banner-dismiss"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
      )}
      <header className="pp-header">
        <div className="pp-header-inner">
          <Link to={base} className="pp-logo">
            {logoUrl && !logoBroken && (
              <img src={logoUrl} alt={logoText} className="pp-logo-img" onError={() => setLogoBroken(true)} style={{ objectFit: 'contain' }} />
            )}
            <span className="pp-logo-text">{logoText}</span>
          </Link>

          <nav className={`pp-nav ${mobileOpen ? 'pp-nav-open' : ''}`}>
            {scienceItems.length > 0 && (
              <NavDropdown label={t('nav.science')} items={scienceItems} base={base} location={location} onNavigate={() => setMobileOpen(false)} />
            )}
            {resourceItems.length > 0 && (
              <NavDropdown label={t('nav.resources')} items={resourceItems} base={base} location={location} onNavigate={() => setMobileOpen(false)} />
            )}
            {flatNavItems.map(n => (
              <Link key={n.path} to={`${base}/${n.path}`}
                className={`pp-nav-link ${location.pathname.includes(n.path) ? 'pp-nav-link-active' : ''}`}
                aria-current={location.pathname.includes(n.path) ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="pp-header-actions">
            {/* Language switcher removed — portal is English-only for now (2026-07-03). */}
            {/* Header search removed (2026-07-09) — it pushed the header off-alignment.
                Search lives on the home hero + the dedicated /search page. */}
            <LocalClock />
            {isFeatureEnabled('medical_inquiry') && (
              <button className="pp-btn pp-btn-primary" onClick={() => navigate(`${base}/submit`)}>
                <Icon name="send" size={16} />
                {t('btn.submit_inquiry')}
              </button>
            )}

            {/* S4-3: Notification Bell */}
            {user && (
              <div style={{ position: 'relative' }} ref={bellRef}>
                <button
                  className="pp-bell-btn"
                  aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
                  onClick={() => setBellOpen(o => !o)}
                >
                  🔔
                  {unreadCount > 0 && (
                    <span className="pp-bell-badge">{unreadCount}</span>
                  )}
                </button>
                {bellOpen && (
                  <div className="pp-notif-dropdown">
                    <div className="pp-notif-header">
                      <span>{t('notif.title')}</span>
                      {unreadCount > 0 && (
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2563EB', fontWeight: 600 }}
                          onClick={markAllRead}
                        >
                          {t('notif.mark_all_read')}
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div className="pp-notif-empty">{t('notif.none')}</div>
                    ) : (
                      <div role="list">
                        {notifications.map((n, i) => {
                          const href = n.type === 'news' ? `${base}/news/${n.item_id}`
                                     : n.type === 'document' ? `${base}/documents`
                                     : n.type === 'safety' ? `${base}/safety`
                                     : null
                          return (
                            <div
                              key={n.id || i}
                              role="listitem"
                              className={`pp-notif-item${!n.is_read ? ' unread' : ''}${href ? ' pp-notif-item-clickable' : ''}`}
                              onClick={() => { if (href) { setBellOpen(false); navigate(href) } }}
                              style={{ cursor: href ? 'pointer' : 'default' }}
                            >
                              <span style={{ color: '#2563EB', lineHeight: 1 }}>
                                <Icon name={NOTIF_ICONS[n.type] || 'message'} size={18} />
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="pp-notif-title">{n.title || n.message || 'Notification'}</div>
                                <div className="pp-notif-time">{timeAgo(n.created_at)}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isFeatureEnabled('user_auth') !== false && (user ? (
              <div className="pp-user-menu" ref={userMenuRef}>
                <button
                  className="pp-user-btn"
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setUserMenuOpen(false);
                    if (e.key === 'Enter' || e.key === ' ') setUserMenuOpen(o => !o);
                  }}
                  onClick={() => setUserMenuOpen(o => !o)}
                >
                  <span className="pp-user-avatar">{user.first_name?.[0]}{user.last_name?.[0]}</span>
                  <span>{user.first_name}</span>
                </button>
                {userMenuOpen && (
                  <div className="pp-user-dropdown" role="menu">
                    <Link to={`${base}/profile`} className="pp-dropdown-item" role="menuitem">{t('btn.my_account')}</Link>
                    <Link to={`${base}/my-submissions`} className="pp-dropdown-item" role="menuitem">{t('btn.my_submissions')}</Link>
                    <Link to={`${base}/saved`} className="pp-dropdown-item" role="menuitem">{t('btn.saved_items')}</Link>
                    <Link to={`${base}/preferences`} className="pp-dropdown-item" role="menuitem">{t('btn.preferences')}</Link>
                    <button className="pp-dropdown-item pp-dropdown-item-danger" role="menuitem" onClick={handleLogout}>{t('btn.sign_out')}</button>
                  </div>
                )}
              </div>
            ) : (
              <Link to={`${base}/login`} className="pp-btn pp-btn-outline">{t('btn.sign_in')}</Link>
            ))}
            <button className="pp-mobile-menu-btn" aria-label="Toggle navigation menu" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
          </div>
        </div>
      </header>

      <main className="pp-main" id="pp-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="pp-footer">
        <div className="pp-footer-inner">
          <div className="pp-footer-brand">
            {logoUrl
              ? <img src={logoUrl} alt={logoText} className="pp-footer-logo-img" style={{ maxHeight: 36, maxWidth: 140, objectFit: 'contain', display: 'block', marginBottom: 6 }} />
              : <span className="pp-footer-logo">{logoText}</span>
            }
            {branding.tagline && <p className="pp-footer-tagline">{branding.tagline}</p>}
          </div>
          <div className="pp-footer-links">
            {isFeatureEnabled('medical_inquiry') && <Link to={`${base}/submit`}>Submit Inquiry</Link>}
            {isFeatureEnabled('find_msl')          && <Link to={`${base}/find-msl`}>Find an MSL</Link>}
            {isFeatureEnabled('events')           && <Link to={`${base}/events`}>Events</Link>}
            <Link to={`${base}/contact`}>Contact Us</Link>
          </div>
          <div className="pp-footer-legal">
            {branding.footer_text_content && <p>{branding.footer_text_content}</p>}
            <p>{branding.copyright_text || `© ${new Date().getFullYear()} ${client.name}. All rights reserved.`}</p>
          </div>
        </div>
      </footer>

      {isFeatureEnabled('chatbox') && <ChatboxWidget clientCode={clientCode} />}
      {!loading && showGate && <UserTypeGate />}
      {!loading && !showGate && user && !user.specialty && <SpecialtyPrompt clientCode={clientCode} />}
      {!loading && <ConsentBanner />}
      {!loading && <FeedbackWidget />}
    </div>
  )
}

const SPECIALTIES = ['Cardiology', 'Oncology', 'Neurology', 'Endocrinology', 'Immunology', 'Rheumatology', 'Dermatology', 'Gastroenterology', 'Respiratory', 'Nephrology', 'Hematology', 'Infectious Disease', 'General Practice', 'Pharmacist', 'Nurse', 'Other']

function SpecialtyPrompt({ clientCode }) {
  const { portalHeaders } = usePortal()
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  if (dismissed) return null
  async function pick(specialty) {
    setSaving(true)
    try {
      const res = await fetch('/api/portal/auth/profile', {
        method: 'PATCH',
        headers: { ...portalHeaders(), 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ specialty }),
      })
      if (!res.ok) return // keep the prompt open so the user can retry
      setDismissed(true)
    } catch { /* non-blocking — keep prompt open for retry */ } finally {
      setSaving(false)
    }
  }
  return (
    <div className="pp-pdf-overlay" onClick={() => setDismissed(true)} role="dialog" aria-modal="true" aria-label="Choose your specialty">
      <div className="pp-specialty-modal" onClick={e => e.stopPropagation()}>
        <h2>Personalize your experience</h2>
        <p>What's your area of practice? We'll tailor content and recommendations to your specialty.</p>
        <div className="pp-specialty-grid">
          {SPECIALTIES.map(s => (
            <button key={s} type="button" className="pp-specialty-chip" disabled={saving} onClick={() => pick(s)}>{s}</button>
          ))}
        </div>
        <button type="button" className="pp-specialty-skip" onClick={() => setDismissed(true)}>Skip for now</button>
      </div>
    </div>
  )
}

function ChatboxWidget({ clientCode }) {
  const [open, setOpen]     = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sendCooldown, setSendCooldown] = useState(false)
  const { portalConfig }    = usePortal()
  const welcomeMsg = portalConfig?.chatbox?.welcome_message || 'Hello! How can I help you today?'

  function openChat() {
    setOpen(true)
    if (messages.length === 0) setMessages([{ role: 'assistant', content: welcomeMsg }])
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (sendCooldown || !input.trim() || loading) return
    setSendCooldown(true)
    setTimeout(() => setSendCooldown(false), 2000)
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      // Build messages array in {role, content} format expected by backend
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content || m.text || '' }))
      const payload = { messages: [...history, { role: 'user', content: userMsg }] }
      const res  = await fetch(`/api/portal/chatbox/${clientCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.reply || 'Sorry, I could not process that.', sources: Array.isArray(data.sources) ? data.sources : [] }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {open ? (
        <div className="pp-chat-window">
          <div className="pp-chat-header">
            <span>AI Medical Assistant</span>
            <button onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>
          <div className="pp-chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`pp-chat-msg pp-chat-msg-${m.role}`}>
                <div className="pp-chat-bubble">{m.content}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="pp-chat-sources">
                    <span className="pp-chat-sources-lbl">Based on approved content</span>
                    {m.sources.map(s => (
                      <span key={s.n} className="pp-chat-source" title={s.title}>{s.source}: {s.title}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="pp-chat-msg pp-chat-msg-assistant" role="status" aria-live="polite" aria-busy="true"><div className="pp-chat-bubble pp-chat-typing">…</div></div>}
          </div>
          <form className="pp-chat-input-row" onSubmit={sendMessage}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a medical question…" disabled={loading} maxLength={500} />
            <span className="pp-chat-counter">{input.length}/500</span>
            <button type="submit" disabled={sendCooldown || loading || !input.trim()}>Send</button>
          </form>
        </div>
      ) : (
        <button className="pp-chat-fab" onClick={openChat} title="AI Medical Assistant" aria-label="Open AI Medical Assistant">
          <Icon name="message" size={24} />
        </button>
      )}
    </>
  )
}
