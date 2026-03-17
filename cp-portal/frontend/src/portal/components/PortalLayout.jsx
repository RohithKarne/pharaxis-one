import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import UserTypeGate from './UserTypeGate'
import ConsentBanner from './ConsentBanner'

export default function PortalLayout({ children }) {
  const { portalConfig, loading, user, logout, isFeatureEnabled, clientCode, showGate } = usePortal()
  const has_active_safety_alert = portalConfig?.has_active_safety_alert
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)
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
  const branding   = portalConfig?.branding || {}
  const client     = portalConfig?.client   || {}

  const navItems = [
    { label: 'Therapeutic Areas', path: 'therapeutic-areas', feature: 'therapeutic_areas' },
    { label: 'Events',            path: 'events',            feature: 'events' },
    { label: 'Resources',         path: 'resources',         feature: 'resources' },
    { label: 'Drug Information',  path: 'drug-info',         feature: 'drug_information' },
    { label: 'Find an MSL',       path: 'find-msl',          feature: 'find_msl' },
    { label: 'Safety',            path: 'safety',            feature: null },
    { label: 'News',              path: 'news',              feature: 'news_announcements' },
    { label: 'Documents',         path: 'documents',         feature: 'document_library' },
    { label: 'Contact Us',        path: 'contact',           feature: null },
  ].filter(n => !n.feature || isFeatureEnabled(n.feature))

  const base = `/portal/${clientCode}`

  function handleLogout() {
    logout()
    navigate(`${base}`)
  }

  const logoUrl  = branding.logo_url
  const logoText = branding.portal_name || client.name || 'Medical Portal'

  return (
    <div className="pp-root">
      {has_active_safety_alert && (
        <div className="pp-safety-banner" role="alert">
          <span>⚠ Important Safety Information — </span>
          <Link to={`${base}/safety`} className="pp-safety-banner-link">View Safety Alerts</Link>
        </div>
      )}
      <header className="pp-header">
        <div className="pp-header-inner">
          <Link to={base} className="pp-logo">
            {logoUrl ? <img src={logoUrl} alt={logoText} className="pp-logo-img" width="160" height="40" style={{ objectFit: 'contain' }} /> : null}
            <span className="pp-logo-text">{logoText}</span>
          </Link>

          <nav className={`pp-nav ${mobileOpen ? 'pp-nav-open' : ''}`}>
            {navItems.map(n => (
              <Link key={n.path} to={`${base}/${n.path}`}
                className={`pp-nav-link ${location.pathname.includes(n.path) ? 'pp-nav-link-active' : ''}`}
                onClick={() => setMobileOpen(false)}>
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="pp-header-actions">
            {isFeatureEnabled('medical_inquiry') && (
              <button className="pp-btn pp-btn-primary" onClick={() => navigate(`${base}/submit`)}>
                Submit Inquiry
              </button>
            )}
            {user ? (
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
                    <Link to={`${base}/my-submissions`} className="pp-dropdown-item" role="menuitem">My Submissions</Link>
                    <button className="pp-dropdown-item pp-dropdown-item-danger" role="menuitem" onClick={handleLogout}>Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <Link to={`${base}/login`} className="pp-btn pp-btn-outline">Sign In</Link>
            )}
            <button className="pp-mobile-menu-btn" aria-label="Toggle navigation menu" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
          </div>
        </div>
      </header>

      <main className="pp-main">
        {children}
      </main>

      <footer className="pp-footer">
        <div className="pp-footer-inner">
          <div className="pp-footer-brand">
            <span className="pp-footer-logo">{logoText}</span>
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
      {!loading && <ConsentBanner />}
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
      setMessages(m => [...m, { role: 'assistant', content: data.reply || 'Sorry, I could not process that.' }])
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
          <span>💬</span>
        </button>
      )}
    </>
  )
}
