import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import Icon from '../../shared/components/Icon'
import { formatLongDate } from '../../shared/utils/datetime'

export default function PortalHomePage() {
  const { portalConfig, isFeatureEnabled, clientCode, user, portalHeaders } = usePortal()
  const navigate  = useNavigate()
  const branding  = portalConfig?.branding || {}
  const client    = portalConfig?.client   || {}
  const base      = `/portal/${clientCode}`
  const [homeSearch, setHomeSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggest, setShowSuggest] = useState(false)

  usePageTitle('Home')

  // CP-12: debounced typeahead suggestions for the hero search.
  useEffect(() => {
    const q = homeSearch.trim()
    if (q.length < 2) { setSuggestions([]); return }
    const t = setTimeout(() => {
      fetch(`/api/portal/search/suggest?clientCode=${clientCode}&q=${encodeURIComponent(q)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setSuggestions(d?.suggestions || []))
        .catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [homeSearch, clientCode])

  // S4-9: fetch "For You" content — news + documents matched to user's type
  const [forYouNews, setForYouNews]   = useState([])
  const [forYouDocs, setForYouDocs]   = useState([])
  const [followedTopics, setFollowedTopics] = useState([])
  useEffect(() => {
    if (!clientCode || !user) return
    fetch(`/api/portal/personal/follows?clientCode=${clientCode}`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.follows) setFollowedTopics(d.follows.filter(f => f.item_type === 'therapeutic_area')) })
      .catch(() => {})
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
  const [latestNews, setLatestNews] = useState([])
  const [latestDocs, setLatestDocs] = useState([])
  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/content/${clientCode}/events`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items?.length) {
          const now = new Date()
          const seen = new Set()
          const upcoming = data.items
            .filter(e => new Date(e.event_date || e.start_date) >= now)
            .sort((a, b) => new Date(a.event_date || a.start_date) - new Date(b.event_date || b.start_date))
            // de-dupe events that share the same title + date (prevents the same
            // conference showing twice on the home page)
            .filter(e => {
              const key = `${e.title}|${e.event_date || e.start_date}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            .slice(0, 3)
          setUpcomingEvents(upcoming)
        }
      })
      .catch(() => {})
  }, [clientCode, portalHeaders])

  useEffect(() => {
    if (!clientCode) return
    fetch(`/api/portal/news?clientCode=${clientCode}&limit=4`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.posts) setLatestNews(d.posts.slice(0, 4)) })
      .catch(() => {})
    fetch(`/api/portal/documents?clientCode=${clientCode}`, { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.documents) setLatestDocs(d.documents.slice(0, 3)) })
      .catch(() => {})
  }, [clientCode])

  const topTasks = [
    {
      key:   'medical_inquiry',
      icon:  'send',
      title: 'Submit a Medical Inquiry',
      desc:  'Ask a product question, report an event, or request medical information.',
      path:  'submit',
      action: 'Start request',
      tone: 'primary',
    },
    {
      key:   'document_library',
      icon:  'file',
      title: 'Find Approved Documents',
      desc:  'Browse prescribing information, safety materials, and approved resources.',
      path:  'documents',
      action: 'Browse documents',
      tone: 'teal',
    },
    {
      key:   'find_msl',
      icon:  'users',
      title: 'Contact an MSL',
      desc:  'Connect with a Medical Science Liaison for your area.',
      path:  'find-msl',
      action: 'Find an MSL',
      tone: 'primary',
    },
  ].filter(c => isFeatureEnabled(c.key))

  const secondaryTasks = [
    {
      key:   'therapeutic_areas',
      icon:  'beaker',
      title: 'Therapeutic Areas',
      desc:  'Explore our focus areas across diseases and treatment categories.',
      path:  'therapeutic-areas',
    },
    {
      key:   'drug_info',
      icon:  'pill',
      title: 'Drug Information',
      desc:  'Review approved prescribing information and clinical summaries.',
      path:  'drug-info',
    },
    {
      key:   'resources',
      icon:  'book',
      title: 'Resources',
      desc:  'Access publications, clinical data, and approved materials.',
      path:  'resources',
    },
  ].filter(c => isFeatureEnabled(c.key))

  const quickSearches = ['PX-104', 'Dosing', 'Clinical trials', 'Prescribing information', 'Safety']
  const quickDocs = latestDocs.length > 0
    ? latestDocs.slice(0, 2)
    : [
        { id: 'prescribing-info', title: 'Prescribing Information' },
        { id: 'medical-literature', title: 'Request Medical Literature' },
      ]

  const trustItems = [
    {
      icon: 'shield',
      title: 'Safety information, front and centre',
      desc: 'Current safety alerts and prescribing details are always one click away, so you can check risk information first.',
    },
    {
      icon: 'check',
      title: 'Reviewed and approved',
      desc: 'Every document and answer is vetted by our medical affairs team before it reaches you.',
    },
    {
      icon: 'users',
      title: 'Relevant to your practice',
      desc: 'Content and recommendations are tailored to your specialty, so you find what matters faster.',
    },
  ]

  const heroTitle    = portalConfig?.welcome_title || `Welcome to ${branding.portal_name || client.name || 'the Medical Portal'}`
  const heroSubtitle = portalConfig?.welcome_message || branding.tagline || 'Your trusted source for medical information, resources, and support.'

  const formatEventDate = (str) => (str ? formatLongDate(str) : '')

  function runSearch(term) {
    const query = term.trim()
    if (query.length >= 2) navigate(`${base}/search?q=${encodeURIComponent(query)}`)
  }

  function submitHomeSearch(e) {
    e.preventDefault()
    runSearch(homeSearch)
  }

  return (
    <div className="pp-home">
      <section className="pp-hero">
        <div className="pp-hero-inner">
          <div className="pp-hero-copy">
            <span className="pp-hero-kicker">Medical affairs support</span>
            <h1 className="pp-hero-title">{heroTitle}</h1>
            <p className="pp-hero-subtitle">{heroSubtitle}</p>
            <div className="pp-hero-search-wrap">
              <form className="pp-hero-search" onSubmit={submitHomeSearch}>
                <Icon name="search" size={20} />
                <input
                  value={homeSearch}
                  onChange={e => setHomeSearch(e.target.value)}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  placeholder="Search medical information, documents, events..."
                  aria-label="Search the portal"
                  role="combobox"
                  aria-expanded={showSuggest && suggestions.length > 0}
                  aria-autocomplete="list"
                />
                <button type="submit" className="pp-hero-search-btn">Search</button>
              </form>
              {showSuggest && suggestions.length > 0 && (
                <ul className="pp-suggest-dropdown" role="listbox">
                  {suggestions.map((s, i) => (
                    <li key={i} role="option" aria-selected="false">
                      <button type="button" className="pp-suggest-item" onMouseDown={() => navigate(`${base}/${s.path}`)}>
                        <span className="pp-suggest-type">{s.type}</span>
                        <span className="pp-suggest-title">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pp-search-suggestions" aria-label="Popular searches">
              <span>Popular searches:</span>
              {quickSearches.map(term => (
                <button key={term} type="button" onClick={() => runSearch(term)}>{term}</button>
              ))}
            </div>
          </div>
          <aside className="pp-hero-panel" aria-label="Portal shortcuts">
            <div className="pp-safety-card">
              <div className="pp-safety-card-icon"><Icon name="shield" size={20} /></div>
              <div>
                <div className="pp-safety-card-title">Safety Update</div>
                <p>Review the latest safety information before using approved content.</p>
                <Link to={`${base}/safety`}>View Safety Alerts</Link>
              </div>
            </div>
            <div className="pp-quick-links">
              <div className="pp-quick-links-title">Quick Links</div>
              {quickDocs.map(doc => (
                <Link key={doc.id} to={`${base}/documents`} className="pp-quick-link-row">
                  <Icon name="file" size={18} />
                  <span>{doc.title}</span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
              <Link to={`${base}/submit`} className="pp-quick-link-row">
                <Icon name="shield" size={18} />
                <span>Report a Product Complaint</span>
                <span aria-hidden="true">›</span>
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <section className="pp-trust-section">
        <div className="pp-container">
          <div className="pp-trust-grid">
            {trustItems.map(item => (
              <div key={item.title} className="pp-trust-item">
                <span className="pp-trust-icon"><Icon name={item.icon} size={20} /></span>
                <span>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pp-top-tasks-section">
        <div className="pp-container">
          <div className="pp-section-heading">
            <h2>What can we help you with today?</h2>
            <p>Start with the most common medical information tasks.</p>
          </div>
          <div className="pp-top-task-grid">
            {topTasks.map(card => (
              <Link key={card.key} to={`${base}/${card.path}`} className={`pp-top-task-card ${card.tone === 'teal' ? 'teal' : ''}`}>
                <div className="pp-top-task-icon"><Icon name={card.icon} size={30} /></div>
                <div className="pp-top-task-body">
                  <h3>{card.title}</h3>
                  <p>{card.desc}</p>
                  <span>{card.action} <span aria-hidden="true">→</span></span>
                </div>
              </Link>
            ))}
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
              <div style={{ display: 'flex', gap: 16 }}>
                <Link to={`${base}/my-activity`} style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none' }}>My activity</Link>
                <Link to={`${base}/preferences`} style={{ fontSize: 13, color: '#6B7280', textDecoration: 'none' }}>Notification preferences</Link>
              </div>
            </div>

            {followedTopics.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Topics you follow</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {followedTopics.map(f => (
                    <Link key={f.id} to={`${base}/therapeutic-areas`} className="pp-chip" style={{ textDecoration: 'none', color: 'var(--pp-primary)' }}>
                      {f.detail?.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

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

      {secondaryTasks.length > 0 && (
        <section className="pp-features-section">
          <div className="pp-container">
            <div className="pp-section-heading compact">
              <h2>Explore more resources</h2>
              <p>Move quickly into product, science, and support areas.</p>
            </div>
            <div className="pp-feature-grid">
              {secondaryTasks.map(card => (
                <Link key={card.key} to={`${base}/${card.path}`} className="pp-feature-card">
                  <div className="pp-feature-icon"><Icon name={card.icon} size={24} /></div>
                  <h3 className="pp-feature-title">{card.title}</h3>
                  <p className="pp-feature-desc">{card.desc}</p>
                  <span className="pp-feature-link">Open <span aria-hidden="true">→</span></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="pp-updates-section">
        <div className="pp-container">
          <div className="pp-updates-grid">
            {isFeatureEnabled('events') && (
              <section className="pp-update-panel">
                <div className="pp-update-panel-head">
                  <h2>Upcoming Events</h2>
                  <Link to={`${base}/events`}>View all</Link>
                </div>
                <div className="pp-update-list">
                  {upcomingEvents.length > 0 ? upcomingEvents.map(ev => (
                    <Link key={ev.id} to={`${base}/events`} className="pp-update-row pp-event-row">
                      <span className="pp-date-chip">{formatEventDate(ev.event_date || ev.start_date)}</span>
                      <span>
                        <b>{ev.title}</b>
                        {ev.event_type && <small>{ev.event_type}</small>}
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  )) : (
                    <div className="pp-update-empty">No upcoming events are published yet.</div>
                  )}
                </div>
              </section>
            )}
            {isFeatureEnabled('news_announcements') && (
              <section className="pp-update-panel">
                <div className="pp-update-panel-head">
                  <h2>Latest News</h2>
                  <Link to={`${base}/news`}>View all</Link>
                </div>
                <div className="pp-update-list">
                  {latestNews.length > 0 ? latestNews.map(post => (
                    <Link key={post.id} to={`${base}/news/${post.id}`} className="pp-update-row">
                      <span className="pp-dot" />
                      <span>
                        <b>{post.title}</b>
                        {post.category && <small>{post.category}</small>}
                      </span>
                      <span aria-hidden="true">›</span>
                    </Link>
                  )) : (
                    <div className="pp-update-empty">No news has been published yet.</div>
                  )}
                </div>
              </section>
            )}
            <section className="pp-update-panel pp-safety-info-panel">
              <div className="pp-update-panel-head">
                <h2>Safety Information</h2>
                <Link to={`${base}/safety`}>View all</Link>
              </div>
              <div className="pp-safety-info-box">
                <Icon name="shield" size={22} />
                <p>Important safety information is available for healthcare professionals. Always refer to current prescribing information.</p>
                <Link to={`${base}/safety`} className="pp-btn pp-btn-outline pp-btn-full">View Safety Information</Link>
              </div>
            </section>
          </div>
        </div>
      </section>

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
