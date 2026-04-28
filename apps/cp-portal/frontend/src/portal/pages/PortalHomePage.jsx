import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function PortalHomePage() {
  const { portalConfig, isFeatureEnabled, clientCode, user, portalHeaders } = usePortal()
  const navigate  = useNavigate()
  const branding  = portalConfig?.branding || {}
  const client    = portalConfig?.client   || {}
  const base      = `/portal/${clientCode}`

  // LOW-05: set document title
  useEffect(() => { document.title = 'Home | CP Portal'; return () => { document.title = 'CP Portal'; }; }, [])

  // S4-9: fetch "For You" content — news + documents matched to user's type
  const [forYouNews, setForYouNews]   = useState([])
  const [forYouDocs, setForYouDocs]   = useState([])
  useEffect(() => {
    if (!clientCode || !user) return
    fetch(`/api/portal/news?clientCode=${clientCode}&limit=3`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.posts) setForYouNews(d.posts.slice(0, 3)) })
      .catch(() => {})
    fetch(`/api/portal/documents?clientCode=${clientCode}`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.documents) setForYouDocs(d.documents.slice(0, 3)) })
      .catch(() => {})
  }, [clientCode, user])

  // LOW-16: fetch upcoming events from API
  const [upcomingEvents, setUpcomingEvents] = useState([])
  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/content/${clientCode}/events`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items?.length) {
          const now = new Date()
          const upcoming = data.items
            .filter(e => new Date(e.event_date || e.start_date) >= now)
            .sort((a, b) => new Date(a.event_date || a.start_date) - new Date(b.event_date || b.start_date))
            .slice(0, 3)
          setUpcomingEvents(upcoming)
        }
      })
      .catch(() => {})
  }, [clientCode])

  const featureCards = [
    {
      key:   'therapeutic_areas',
      icon:  '🧬',
      title: 'Therapeutic Areas',
      desc:  'Explore our focus areas across diseases and treatment categories.',
      path:  'therapeutic-areas',
    },
    {
      key:   'medical_inquiry',
      icon:  '📋',
      title: 'Submit an Inquiry',
      desc:  'Submit a medical information request, adverse event report, or product complaint.',
      path:  'submit',
      highlight: true,
    },
    {
      key:   'events',
      icon:  '📅',
      title: 'Events & Webinars',
      desc:  'Find upcoming medical education events, symposia, and webinars.',
      path:  'events',
    },
    {
      key:   'find_msl',
      icon:  '👨‍⚕️',
      title: 'Find an MSL',
      desc:  'Connect with our Medical Science Liaison team in your region.',
      path:  'find-msl',
    },
    {
      key:   'resources',
      icon:  '📚',
      title: 'Resources',
      desc:  'Access publications, clinical data, and approved materials.',
      path:  'resources',
    },
    {
      key:   'drug_info',
      icon:  '💊',
      title: 'Drug Information',
      desc:  'Review approved prescribing information and clinical summaries.',
      path:  'drug-info',
    },
  ].filter(c => isFeatureEnabled(c.key))

  const heroTitle    = portalConfig?.welcome_title || `Welcome to ${branding.portal_name || client.name || 'the Medical Portal'}`
  const heroSubtitle = portalConfig?.welcome_message || branding.tagline || 'Your trusted source for medical information, resources, and support.'

  function formatEventDate(str) {
    if (!str) return ''
    return new Date(str).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div className="pp-home">
      <section className="pp-hero">
        <div className="pp-hero-inner">
          <h1 className="pp-hero-title">{heroTitle}</h1>
          <p className="pp-hero-subtitle">{heroSubtitle}</p>
          <div className="pp-hero-actions">
            <button className="pp-btn pp-btn-primary pp-btn-lg" onClick={() => navigate(`${base}/submit`)}>
              Submit an Inquiry
            </button>
            <button className="pp-btn pp-btn-outline pp-btn-lg" onClick={() => navigate(`${base}/therapeutic-areas`)}>
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* S4-9: Personalised greeting + For You section (signed-in users only) */}
      {user && (
        <section style={{ background: '#F8F9FF', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
          <div className="pp-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: forYouNews.length || forYouDocs.length ? 20 : 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A1A2E' }}>
                  Welcome back, {user.first_name}!
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6B7280' }}>
                  Here's what's relevant for you today.
                </p>
              </div>
              <Link to={`${base}/preferences`} style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none' }}>
                ⚙ Notification preferences
              </Link>
            </div>

            {(forYouNews.length > 0 || forYouDocs.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {forYouNews.map(post => (
                  <Link key={`n-${post.id}`} to={`${base}/news/${post.id}`}
                    style={{ display: 'block', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>News</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', lineHeight: 1.4 }}>{post.title}</div>
                    {post.category && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{post.category}</div>}
                  </Link>
                ))}
                {forYouDocs.map(doc => (
                  <Link key={`d-${doc.id}`} to={`${base}/documents`}
                    style={{ display: 'block', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 14px', textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Document</div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', lineHeight: 1.4 }}>{doc.title}</div>
                    {doc.doc_type && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4, textTransform: 'uppercase' }}>{doc.doc_type}</div>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="pp-features-section">
        <div className="pp-container">
          <h2 className="pp-section-title">How Can We Help?</h2>
          <div className="pp-feature-grid">
            {featureCards.map(card => (
              <Link key={card.key} to={`${base}/${card.path}`}
                className={`pp-feature-card ${card.highlight ? 'pp-feature-card-highlight' : ''}`}>
                <div className="pp-feature-icon">{card.icon}</div>
                <h3 className="pp-feature-title">{card.title}</h3>
                <p className="pp-feature-desc">{card.desc}</p>
                <span className="pp-feature-link">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* LOW-16: upcoming events pulled from API */}
      {isFeatureEnabled('events') && upcomingEvents.length > 0 && (
        <section className="pp-upcoming-events-section">
          <div className="pp-container">
            <h2 className="pp-section-title">Upcoming Events</h2>
            <div className="pp-upcoming-events-list">
              {upcomingEvents.map(ev => (
                <div key={ev.id} className="pp-upcoming-event-item">
                  <div className="pp-upcoming-event-date">{formatEventDate(ev.event_date || ev.start_date)}</div>
                  <div className="pp-upcoming-event-title">{ev.title}</div>
                  {ev.event_type && <div className="pp-upcoming-event-type">{ev.event_type}</div>}
                </div>
              ))}
            </div>
            <Link to={`${base}/events`} className="pp-btn pp-btn-outline" style={{ marginTop: 16, display: 'inline-block' }}>
              View All Events →
            </Link>
          </div>
        </section>
      )}

      {isFeatureEnabled('medical_inquiry') && (
        <section className="pp-cta-section">
          <div className="pp-container">
            <div className="pp-cta-card">
              <div className="pp-cta-text">
                <h2>Need Medical Information?</h2>
                <p>Our medical affairs team is ready to assist healthcare professionals and patients with accurate, evidence-based information.</p>
              </div>
              <button className="pp-btn pp-btn-primary pp-btn-lg" onClick={() => navigate(`${base}/submit`)}>
                Submit a Request
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
