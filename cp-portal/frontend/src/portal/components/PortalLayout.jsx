import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function PortalLayout({ children }) {
  const { portalConfig, user, logout, isFeatureEnabled, clientCode } = usePortal()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate   = useNavigate()
  const location   = useLocation()
  const branding   = portalConfig?.branding || {}
  const client     = portalConfig?.client   || {}

  const navItems = [
    { label: 'Therapeutic Areas', path: 'therapeutic-areas', feature: 'therapeutic_areas' },
    { label: 'Events',            path: 'events',            feature: 'events' },
    { label: 'Resources',         path: 'resources',         feature: 'resources' },
    { label: 'Drug Information',  path: 'drug-info',         feature: 'drug_information' },
    { label: 'Find an MSL',       path: 'find-msl',          feature: 'find_msl' },
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
      <header className="pp-header">
        <div className="pp-header-inner">
          <Link to={base} className="pp-logo">
            {logoUrl ? <img src={logoUrl} alt={logoText} className="pp-logo-img" /> : null}
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
              <div className="pp-user-menu">
                <button className="pp-user-btn">
                  <span className="pp-user-avatar">{user.first_name?.[0]}{user.last_name?.[0]}</span>
                  <span>{user.first_name}</span>
                </button>
                <div className="pp-user-dropdown">
                  <Link to={`${base}/my-submissions`} className="pp-dropdown-item">My Submissions</Link>
                  <button className="pp-dropdown-item pp-dropdown-item-danger" onClick={handleLogout}>Sign Out</button>
                </div>
              </div>
            ) : (
              <Link to={`${base}/login`} className="pp-btn pp-btn-outline">Sign In</Link>
            )}
            <button className="pp-mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
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
    </div>
  )
}

function ChatboxWidget({ clientCode }) {
  const [open, setOpen]     = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const { portalConfig }    = usePortal()
  const welcomeMsg = portalConfig?.chatbox?.welcome_message || 'Hello! How can I help you today?'

  function openChat() {
    setOpen(true)
    if (messages.length === 0) setMessages([{ role: 'assistant', text: welcomeMsg }])
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res  = await fetch(`/api/portal/chatbox/${clientCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, history: messages.slice(-8) })
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', text: data.reply || 'Sorry, I could not process that.' }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {open ? (
        <div className="pp-chat-window">
          <div className="pp-chat-header">
            <span>AI Medical Assistant</span>
            <button onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="pp-chat-body">
            {messages.map((m, i) => (
              <div key={i} className={`pp-chat-msg pp-chat-msg-${m.role}`}>
                <div className="pp-chat-bubble">{m.text}</div>
              </div>
            ))}
            {loading && <div className="pp-chat-msg pp-chat-msg-assistant"><div className="pp-chat-bubble pp-chat-typing">…</div></div>}
          </div>
          <form className="pp-chat-input-row" onSubmit={sendMessage}>
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask a medical question…" disabled={loading} />
            <button type="submit" disabled={loading || !input.trim()}>Send</button>
          </form>
        </div>
      ) : (
        <button className="pp-chat-fab" onClick={openChat} title="AI Medical Assistant">
          <span>💬</span>
        </button>
      )}
    </>
  )
}
